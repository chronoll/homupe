"""State, process supervision and file contracts shared by the dispatcher."""
from __future__ import annotations

import contextlib
import fcntl
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import tempfile
import time
import re


class Halt(RuntimeError):
    """A job needs human attention; never retry it implicitly."""


class Busy(Halt):
    """Another dispatcher owns the shared repository lock."""


MAX_JSON = 1024 * 1024
MAX_OUTPUT = 32 * 1024 * 1024
SHA = re.compile(r"^[0-9a-f]{40}$")
IGNORED = {"node_modules", ".next", ".next-fixtures", "test-results",
           "playwright-report", "coverage", "__pycache__"}
PROTECTED = [".git", ".git/**", ".github/**", ".factory/**", "factory/**",
             "bin/factory", "AGENTS.md", "CLAUDE.md", ".claude/**", ".codex/**",
             ".mcp.json", ".gitattributes", "**/.gitattributes", ".gitmodules",
             ".env*", "**/.env*", "package.json", "package-lock.json"]


def parse_json(raw):
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    if len(raw.encode("utf-8")) > MAX_JSON:
        raise Halt("JSON exceeds 1 MiB")

    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise Halt("duplicate JSON key: " + key)
            result[key] = value
        return result

    def constant(value):
        raise Halt("invalid JSON constant: " + value)

    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
    except (ValueError, UnicodeError) as error:
        raise Halt("invalid JSON: " + str(error)) from error


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # A busy poll may update watch.json while the lock owner finishes a tick.
    # Separate temporary files keep those atomic writes from sharing one .tmp.
    fd, name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    temp = Path(name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)
    fd = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()

    @contextlib.contextmanager
    def lock(self):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (self.root / "lock").open("a") as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise Busy("another dispatcher owns the repository lock") from error
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def job(self, number):
        return self.root / "jobs" / str(number)

    def claim(self, number, issue):
        job = self.job(number)
        # Directory creation is also a durable, at-most-once claim. A partial job
        # directory after a crash is NOT interpreted as a fresh job.
        job.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            job.mkdir(mode=0o700)
        except FileExistsError as error:
            raise Halt("job already exists; inspect it and use an explicit retry") from error
        atomic_json(job / "issue.json", issue)
        self.save(number, "claimed")
        return job

    def save(self, number, phase, **details):
        path = self.job(number) / "state.json"
        previous = parse_json(path.read_bytes()) if path.exists() else {}
        atomic_json(self.job(number) / "state.json", {
            **previous,
            "version": 1, "issue": number, "phase": phase,
            "previous_phase": previous.get("phase"),
            "updated_at": time.time(), **details,
        })

    def stopped(self):
        return (self.root / "STOP").exists()

    def check_stop(self):
        if self.stopped():
            raise Halt("local STOP requested")

    def stop(self):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        (self.root / "STOP").touch(mode=0o600)


class Runner:
    """No shell interpolation. Kill the process group on stop or timeout."""
    def __init__(self, store=None):
        self.store = store
        self.deadline = None
        self.control_check = None
        self._next_control_check = 0

    def run(self, argv, cwd=None, env=None, stdin=None, timeout=60, log=None, combine=False):
        if self.store:
            self.store.check_stop()
        if self.deadline is not None:
            timeout = min(timeout, self.deadline - time.monotonic())
            if timeout <= 0:
                raise Halt("job exceeded its one-hour deadline")
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors, tempfile.TemporaryFile() as input_file:
            if stdin is not None:
                input_file.write(stdin.encode("utf-8"))
                input_file.seek(0)
            process = subprocess.Popen(
                [str(item) for item in argv], cwd=cwd, env=env,
                stdin=input_file if stdin is not None else subprocess.DEVNULL,
                stdout=output, stderr=errors, start_new_session=True,
            )
            try:
                deadline = time.monotonic() + timeout
                while process.poll() is None:
                    if self.store:
                        self.store.check_stop()
                    if time.monotonic() >= deadline:
                        raise Halt("command timed out: " + str(argv[0]))
                    if self.control_check and time.monotonic() >= self._next_control_check:
                        self._next_control_check = time.monotonic() + 30
                        self.control_check(deadline)
                        if self.store:
                            self.store.check_stop()
                    if os.fstat(output.fileno()).st_size + os.fstat(errors.fileno()).st_size > MAX_OUTPUT:
                        raise Halt("command output exceeds 32 MiB")
                    time.sleep(0.05)
                output.seek(0)
                data = output.read(MAX_OUTPUT + 1)
                errors.seek(0)
                diagnostics = errors.read(MAX_OUTPUT + 1)
                if len(data) + len(diagnostics) > MAX_OUTPUT:
                    raise Halt("command output exceeds 32 MiB")
                if log:
                    Path(log).write_bytes(data + b"\n--- stderr ---\n" + diagnostics)
                if process.returncode:
                    raise Halt("command failed (%s): %s; see job logs" %
                               (process.returncode, argv[0]))
                return (data + diagnostics if combine else data).decode("utf-8")
            finally:
                # A CLI can exit while children are still running. Kill the whole
                # group even on success before observing any candidate files.
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    pass
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
                if log:
                    output.seek(0)
                    errors.seek(0)
                    Path(log).write_bytes(output.read(MAX_OUTPUT) +
                                          b"\n--- stderr ---\n" + errors.read(MAX_OUTPUT))


def clean_env():
    # Used for local git operations. GitHub calls deliberately use the parent env.
    result = {key: os.environ[key] for key in ("PATH", "HOME", "TMPDIR", "LANG")
              if key in os.environ}
    result.update({"GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
                   "GIT_TERMINAL_PROMPT": "0", "GIT_SSH_COMMAND": "false",
                   "GIT_CONFIG_COUNT": "0"})
    return result


def git(runner, repo, *args):
    return runner.run(["git", "-c", "core.hooksPath=/dev/null",
                       "-c", "commit.gpgsign=false", *args], cwd=repo,
                      env=clean_env()).strip()


def matches(path, patterns):
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def files(root):
    """Return regular source files only; never follow agent-created symlinks."""
    root = Path(root)
    result = {}
    for current, dirs, names in os.walk(root, followlinks=False):
        for name in list(dirs):
            path = Path(current) / name
            if path.is_symlink():
                raise Halt("symlink rejected: " + str(path.relative_to(root)))
            if name in IGNORED:
                dirs.remove(name)
        for name in names:
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise Halt("non-regular or hard-linked file rejected: " + relative)
            if name == "next-env.d.ts" or name.endswith(".tsbuildinfo") or name == ".DS_Store":
                continue
            if path.stat().st_size > 20 * 1024 * 1024:
                raise Halt("source file exceeds 20 MiB: " + relative)
            result[relative] = (hashlib.sha256(path.read_bytes()).hexdigest(),
                                bool(info.st_mode & 0o111))
    return result


def digest(root):
    return hashlib.sha256(json.dumps(files(root), sort_keys=True).encode()).hexdigest()


def changed(before, after):
    return sorted(path for path in before.keys() | after.keys()
                  if before.get(path) != after.get(path))


def check_paths(paths):
    protected = [pattern.casefold() for pattern in PROTECTED]
    protected += [pattern[:-3] for pattern in protected if pattern.endswith("/**")]
    for path in paths:
        # A Linux container can create case variants that alias protected files
        # when copied into the parent's case-insensitive macOS checkout.
        folded = path.casefold()
        parts = Path(folded).parts
        if ".git" in parts or matches(folded, protected):
            raise Halt("protected path changed: " + path)
        if any(part.startswith(".env") and part != ".env.local.example" for part in parts):
            raise Halt("environment file rejected: " + path)


def object_schema(properties):
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


TEXT = {"type": "string"}
PLAN_SCHEMA = object_schema({"phase": {"type": "string", "enum": ["plan"]},
    "decision": {"type": "string", "enum": ["go", "needs-human"]},
    "summary": TEXT, "plan": TEXT})
IMPLEMENT_SCHEMA = object_schema({"phase": {"type": "string", "enum": ["implement"]},
    "status": {"type": "string", "enum": ["done", "needs-human"]},
    "summary": TEXT, "pr_title": TEXT, "pr_body": TEXT})
REVIEW_SCHEMA = object_schema({"phase": {"type": "string", "enum": ["review"]},
    "verdict": {"type": "string", "enum": ["approve", "changes", "needs-human"]},
    "head_sha": TEXT, "summary": TEXT,
    "findings": {"type": "array", "items": object_schema({
        "severity": {"type": "string", "enum": ["must", "should", "nit"]},
        "file": TEXT, "line": {"type": "integer"}, "message": TEXT})}})


def validate(value, schema):
    kind = schema["type"]
    types = {"object": dict, "array": list, "string": str, "integer": int}
    if type(value) is not types[kind]:
        raise Halt("invalid result type: expected " + kind)
    if "enum" in schema and value not in schema["enum"]:
        raise Halt("invalid result enum")
    if kind == "object":
        if set(value) != set(schema["properties"]):
            raise Halt("result keys do not match the contract")
        for key, child in schema["properties"].items():
            validate(value[key], child)
    if kind == "array":
        for child in value:
            validate(child, schema["items"])
    return value
