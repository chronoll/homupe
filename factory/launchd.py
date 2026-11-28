"""Install and control the opt-in, per-user macOS Issue watcher."""
from __future__ import annotations

import argparse
import contextlib
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import shutil
import signal
import stat
import subprocess
import sys
import time

from factory.core import Busy, Halt, Runner, Store, atomic_json, parse_json
from factory.dispatcher import Factory, main as dispatch

LABEL = "com.chronoll.homupe.factory"
INTERVAL = 300
LOG_LIMIT = 1024 * 1024


def write_private(path, content, mode=0o600):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise Halt("refusing a symlink: " + str(path))
    temporary = path.with_name(path.name + ".tmp")
    if temporary.exists() or temporary.is_symlink():
        raise Halt("inspect an unfinished service file: " + str(temporary))
    fd = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "wb") as stream:
        stream.write(content if isinstance(content, bytes) else content.encode())
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def wrapper(repo, runtime):
    return ("#!/bin/bash\nset -eu\numask 077\n" +
            "cd " + shlex.quote(str(repo)) + "\n" +
            ". " + shlex.quote(str(runtime / "env.sh")) + "\n" +
            "exec /usr/bin/python3 -B -m factory.launchd --repo " + shlex.quote(str(repo)) +
            " --runtime " + shlex.quote(str(runtime)) + " tick\n")


def property_list(repo, runtime):
    return {"Label": LABEL, "ProgramArguments": ["/bin/bash", str(runtime / "watch.command")],
            "WorkingDirectory": str(repo), "RunAtLoad": True, "StartInterval": INTERVAL,
            "KeepAlive": False, "ThrottleInterval": 60, "ExitTimeOut": 60,
            "ProcessType": "Background", "Umask": 0o077,
            "EnvironmentVariables": {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                                     "PYTHONDONTWRITEBYTECODE": "1"},
            "StandardOutPath": str(runtime / "launchd.stdout.log"),
            "StandardErrorPath": str(runtime / "launchd.stderr.log")}


def rotate(path):
    path = Path(path)
    if path.is_symlink():
        raise Halt("refusing a symlink log")
    if path.exists() and not stat.S_ISREG(path.stat().st_mode):
        raise Halt("service log is not a regular file")
    if path.exists() and path.stat().st_size >= LOG_LIMIT:
        backup = path.with_name(path.name + ".1")
        if backup.is_symlink():
            raise Halt("refusing a symlink log backup")
        # Keep the inode: launchd may already have this file open.
        with path.open("rb") as source:
            source.seek(max(0, path.stat().st_size - LOG_LIMIT))
            write_private(backup, source.read(LOG_LIMIT))
        with path.open("wb"):
            pass
    path.touch(mode=0o600, exist_ok=True)
    path.chmod(0o600)


class Service:
    def __init__(self, repo, runtime=None):
        self.repo = Path(repo).resolve()
        self.store = Store(self.repo / ".factory-state")
        self.settings = self.store.root / "service.json"
        saved = parse_json(self.settings.read_bytes()) if self.settings.exists() else {}
        self.runtime = Path(runtime or saved.get("runtime", "")).resolve() if runtime or saved.get("runtime") else None
        self.plist = Path.home() / "Library/LaunchAgents" / (LABEL + ".plist")
        self.domain = "gui/" + str(os.getuid())
        self.target = self.domain + "/" + LABEL

    def ctl(self, *args, check=True):
        result = subprocess.run(["/bin/launchctl", *args], capture_output=True, text=True, timeout=20)
        if check and result.returncode:
            raise Halt("launchctl " + args[0] + " failed: " + result.stderr.strip()[:1000])
        return result

    def require_runtime(self):
        if not self.runtime or not (self.runtime / "env.sh").is_file():
            raise Halt("install requires the prepared runtime directory with env.sh")

    def check_owner(self):
        if self.plist.is_symlink():
            raise Halt("refusing a symlink LaunchAgent")
        if self.plist.exists():
            existing = plistlib.loads(self.plist.read_bytes())
            if existing.get("Label") != LABEL or existing.get("WorkingDirectory") != str(self.repo):
                raise Halt("another checkout owns the installed service")

    def install(self):
        self.require_runtime()
        Factory(self.repo)  # Validate the fixed staging-only configuration.
        self.check_owner()
        self.stop()
        write_private(self.runtime / "watch.command", wrapper(self.repo, self.runtime), 0o700)
        content = plistlib.dumps(property_list(self.repo, self.runtime))
        write_private(self.runtime / (LABEL + ".plist"), content)
        write_private(self.plist, content)
        atomic_json(self.settings, {"label": LABEL, "runtime": str(self.runtime),
                                   "repo": str(self.repo), "interval_seconds": INTERVAL})
        for name in ("watch.log", "launchd.stdout.log", "launchd.stderr.log"):
            rotate(self.runtime / name)
        # Install paused. The first real launch can be inspected with STOP set.
        self.ctl("enable", self.target)
        self.ctl("bootstrap", self.domain, str(self.plist))
        return self.status()

    def start(self):
        self.require_runtime()
        self.check_owner()
        if not self.plist.is_file():
            raise Halt("install the watcher first")
        with self.store.lock():
            (self.store.root / "STOP").unlink(missing_ok=True)
        try:
            self.ctl("enable", self.target)
            if self.ctl("print", self.target, check=False).returncode:
                self.ctl("bootstrap", self.domain, str(self.plist))
            else:
                # Never use -k: a start request must not kill an active job.
                self.ctl("kickstart", self.target)
        except BaseException:
            self.store.stop()
            raise
        return self.status()

    def stop(self):
        self.check_owner()
        self.store.stop()
        self.ctl("disable", self.target)
        if not self.ctl("print", self.target, check=False).returncode:
            self.ctl("bootout", self.target)
        # Give supervised commands time to terminate and remove their container.
        deadline = time.monotonic() + 50
        while True:
            try:
                with self.store.lock():
                    # A forced termination can leave Docker running independently.
                    runtime = Factory(self.repo).runtime
                    if not shutil.which("docker"):
                        raise Halt("STOP is set and watcher disabled; Docker cleanup could not be verified")
                    ids = runtime.orphan_containers()
                    if ids:
                        runtime.remove_orphans(ids)
                break
            except Busy:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(.2)
        return {"stopped": True, "disabled": True, "label": LABEL}

    def status(self):
        result = self.ctl("print", self.target, check=False)
        details = result.stdout if not result.returncode else ""
        state = re.search(r"^\s*state = (.+)$", details, re.M)
        last_exit = re.search(r"^\s*last exit code = (.+)$", details, re.M)
        watch = self.store.root / "watch.json"
        return {"label": LABEL, "installed": self.plist.is_file(),
                "registered": result.returncode == 0, "stopped": self.store.stopped(),
                "launchd_state": state.group(1) if state else None,
                "last_exit_code": last_exit.group(1) if last_exit else None,
                "interval_seconds": INTERVAL,
                "last_poll": parse_json(watch.read_bytes()) if watch.exists() else None,
                "log": str(self.runtime / "watch.log") if self.runtime else None}

    def tick(self):
        self.require_runtime()
        for name in ("watch.log", "launchd.stdout.log", "launchd.stderr.log"):
            rotate(self.runtime / name)
        with (self.runtime / "watch.log").open("a", buffering=1) as log:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                print(json.dumps({"tick_at": time.time()}), flush=True)
                try:
                    # Do not wake the VM or contact GitHub while paused.
                    if not self.store.stopped():
                        runner = Runner(self.store)
                        try:
                            runner.run(["docker", "info"], timeout=15)
                        except Halt:
                            self.store.check_stop()
                            colima_home = Path(os.environ.get("COLIMA_HOME", str(self.runtime / "colima")))
                            profile = colima_home / "default/colima.yaml"
                            if not profile.is_file():
                                raise Halt("existing factory VM profile is missing; inspect it before starting")
                            runner.run(["colima", "start", "--vm-type", "vz", "--arch", "aarch64",
                                "--cpus", "2", "--memory", "6", "--disk", "40",
                                "--mount", str(self.repo) + ":w", "--ssh-config=false",
                                "--ssh-agent=false", "--activate=false", "--binfmt=false"],
                                timeout=180, log=self.runtime / "watch-vm.log")
                    return dispatch(["--repo", str(self.repo), "poll", "--execute"])
                except (Halt, OSError) as error:
                    self.store.stop()
                    atomic_json(self.store.root / "watch.json", {
                        "version": 1, "status": "needs-human", "last_checked": time.time(),
                        "reason": "watcher runtime startup failed", "processed": 0})
                    print(json.dumps({"error": str(error)}), flush=True)
                    return 1


def main(argv=None):
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("command", choices=("install", "start", "stop", "status", "tick"))
    args = parser.parse_args(argv)
    if sys.platform != "darwin" or os.getuid() == 0:
        parser.error("this per-user service requires macOS and a non-root user")

    def interrupted(_signal, _frame):
        raise Halt("watcher interrupted")

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        service = Service(args.repo, args.runtime)
        if args.command == "tick":
            return service.tick()
        print(json.dumps(getattr(service, args.command)(), ensure_ascii=False, indent=2))
        return 0
    except (Halt, OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
