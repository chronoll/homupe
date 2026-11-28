"""Only the parent has GitHub access; agents/tests see a source snapshot."""
from __future__ import annotations

import os
from pathlib import Path
import re
import uuid

from factory.core import (CommandFailure, Halt, IMPLEMENT_SCHEMA, PLAN_SCHEMA, REVIEW_SCHEMA,
                          VerificationFailure,
                          Runner, atomic_json, parse_json, validate)


# CLI capabilities checked against the image's pinned Codex 0.148.0. Workers
# read/search only through the fixed MCP server copied into the read-only image;
# bounded MCP writes are the implementation's edit tools. No model-generated process is
# needed to read source, run tests, or inspect evidence.
DISABLED_FEATURES = (
    "shell_tool", "unified_exec", "apps", "hooks", "plugins", "remote_plugin",
    "browser_use", "browser_use_external", "browser_use_full_cdp_access",
    "computer_use", "in_app_browser", "multi_agent", "multi_agent_v2", "goals",
    "tool_suggest", "skill_search", "skill_mcp_dependency_install", "memories",
    "image_generation", "workspace_dependencies", "code_mode", "code_mode_host",
    "code_mode_only", "unbounded_connection_retries", "view_image", "request_permissions_tool",
)
CODEX_MODEL = "gpt-5.6-sol"
MANAGED_REPOSITORY_LABEL = "io.chronoll.homupe.factory.repository=chronoll/homupe"
MANAGED_UID_LABEL = "io.chronoll.homupe.factory.uid="
CONTAINER_ID = re.compile(r"^[0-9a-f]{64}$")
LEGACY_CONTAINER_NAME = re.compile(r"^homupe-factory-[0-9a-f]{32}$")


def codex_settings(writable=False):
    """CLI config shared by all three fresh phases and offline smoke checks."""
    argv = []
    for feature in DISABLED_FEATURES:
        argv += ["--disable", feature]
    server_args = '["-I","/opt/factory-read-tools.py"' + (',"--allow-write"]' if writable else ']')
    tools = '["list_files","read_file","search","read_image"' + (',"write_file","delete_file"]' if writable else ']')
    mcp = ('mcp_servers={factory_source={command="/usr/bin/python3",args=' + server_args +
           ',required=true,enabled_tools=' + tools + '}}')
    argv += ["-c", mcp, "-c", 'web_search="disabled"',
             "-c", 'forced_login_method="chatgpt"', "-c", 'approval_policy="never"',
             "-c", 'skills.bundled.enabled=false', "-c", 'skills.include_instructions=false',
             "-c", 'agents.enabled=false', "-c", 'project_doc_max_bytes=0',
             "-c", 'model_provider="openai"', "-c", 'model="' + CODEX_MODEL + '"',
             "-c", 'model_catalog_json="/opt/factory-model-catalog.json"']
    return argv


class DockerRuntime:
    def __init__(self, config, runner):
        self.config = config
        self.runner = runner
        self.image = config["image"]
        if not re.fullmatch(r"[A-Za-z0-9./_:@-]+", self.image):
            raise Halt("invalid container image")

    def command(self, workspace, argv, role=None, evidence=None, readonly=False,
                network=True, name=None):
        workspace = Path(workspace).resolve()
        if "," in str(workspace) or (evidence and "," in str(evidence)):
            raise Halt("Docker bind paths cannot contain commas")
        uid, gid = os.getuid(), os.getgid()
        result = ["docker", "run", "--interactive", "--init", "--name", name or "factory-" + uuid.uuid4().hex,
                  "--label", MANAGED_REPOSITORY_LABEL,
                  "--label", MANAGED_UID_LABEL + str(uid),
                  "--user", "%s:%s" % (uid, gid), "--cap-drop", "ALL", "--security-opt",
                  # Next/Turbopack and Chromium use additional native threads.
                  "no-new-privileges", "--pids-limit", "256" if role else "512", "--memory", "4g",
                  "--cpus", "2", "--read-only", "--network", "bridge" if network else "none",
                  "--tmpfs", "/tmp:rw,nosuid,size=1g", "--workdir", "/workspace",
                  "--mount", "type=bind,src=%s,dst=/workspace%s" %
                  (workspace, ",readonly" if readonly else ""),
                  "--env", "CI=1", "--env", "NEXT_TELEMETRY_DISABLED=1",
                  "--env", "FACTORY_FIXTURES=1", "--env", "FACTORY_PORT=3100",
                  "--env", "GH_TOKEN=factory-disabled", "--env", "GITHUB_TOKEN=factory-disabled",
                  "--env", "GIT_TERMINAL_PROMPT=0", "--env", "GIT_SSH_COMMAND=false"]
        if role:
            # Dedicated named volumes, never the host HOME, config directories,
            # SSH agent, Docker socket, application env files or git directory.
            if role not in {"codex", "codex-review"}:
                raise Halt("unknown Codex authentication role")
            result += ["--mount", "type=volume,src=homupe-factory-%s,dst=/home/node" % role]
        else:
            result += ["--tmpfs", "/home/node:rw,uid=%s,gid=%s,mode=700,size=1g" % (uid, gid)]
        if evidence:
            result += ["--mount", "type=bind,src=%s,dst=/evidence,readonly" % Path(evidence).resolve()]
        return result + [self.image, *argv]

    def orphan_containers(self):
        """Called under the dispatcher lock; STOP must not block inspection.

        All dispatcher invocations must share one state directory. With that
        lock held, an owned container cannot belong to a healthy active job.
        The legacy exact-name check covers containers created before labels.
        """
        supervisor = Runner()
        managed = supervisor.run(["docker", "ps", "--all", "--quiet", "--no-trunc",
            "--filter", "label=" + MANAGED_REPOSITORY_LABEL,
            "--filter", "label=" + MANAGED_UID_LABEL + str(os.getuid())], timeout=30)
        identifiers = set()
        for line in managed.splitlines():
            if not CONTAINER_ID.fullmatch(line):
                raise Halt("Docker returned an invalid managed container ID")
            identifiers.add(line)
        legacy = supervisor.run(["docker", "ps", "--all", "--no-trunc",
            "--format", "{{.ID}} {{.Names}}"], timeout=30)
        for line in legacy.splitlines():
            parts = line.split()
            if len(parts) != 2 or not CONTAINER_ID.fullmatch(parts[0]):
                raise Halt("Docker returned an invalid container listing")
            if LEGACY_CONTAINER_NAME.fullmatch(parts[1]):
                identifiers.add(parts[0])
        return sorted(identifiers)

    def remove_orphans(self, identifiers):
        """Cleanup has no store so an existing STOP cannot prevent removal."""
        if any(not isinstance(item, str) or not CONTAINER_ID.fullmatch(item) for item in identifiers):
            raise Halt("refusing an unverified orphan container ID")
        supervisor = Runner()
        for offset in range(0, len(identifiers), 25):
            supervisor.run(["docker", "rm", "-f", *identifiers[offset:offset + 25]], timeout=30)

    def call(self, workspace, argv, role=None, evidence=None, readonly=False,
             network=True, stdin=None, timeout=900, log=None, combine=False):
        name = "homupe-factory-" + uuid.uuid4().hex
        try:
            return self.runner.run(self.command(workspace, argv, role, evidence,
                                   readonly, network, name), stdin=stdin,
                                   timeout=timeout, log=log, combine=combine)
        finally:
            # Killing `docker run` does not reliably stop its container. Cleanup
            # uses a fresh supervisor so STOP cannot prevent container removal.
            try:
                Runner().run(["docker", "rm", "-f", name], timeout=30)
            except (Halt, OSError):
                if self.runner.store:
                    self.runner.store.root.mkdir(parents=True, exist_ok=True)
                    (self.runner.store.root / "STOP").touch()
                raise Halt("container cleanup failed; stop the factory and inspect Docker")

    def preflight(self, workspace):
        info = parse_json(self.runner.run(["docker", "image", "inspect", self.image]))
        self.pin_image(info)
        for role in ("codex", "codex-review"):
            status = self.call(workspace, ["codex", "-C", "/tmp", "login", "status"],
                               role=role, readonly=True, combine=True)
            if "Logged in using ChatGPT" not in status or "API key" in status:
                raise Halt("container %s must be signed in with ChatGPT, not an API key" % role)

    def pin_image(self, info):
        expected_user = "%s:%s" % (os.getuid(), os.getgid())
        if os.getuid() == 0 or info[0]["Config"]["User"] != expected_user:
            raise Halt("build the non-root image with the host FACTORY_UID/FACTORY_GID")
        for setting in info[0]["Config"].get("Env", []):
            if setting.partition("=")[0] in {"OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY",
                                              "GH_TOKEN", "GITHUB_TOKEN"}:
                raise Halt("container image contains a credential environment variable")
        self.image = info[0]["Id"]  # Pin every subsequent invocation to this image.

    def codex(self, workspace, evidence, prompt, log, schema, role, readonly):
        # Docker provides the sandbox: read-only root/evidence, no host HOME,
        # sockets or GitHub credentials. Do not require nested Linux namespaces.
        # This command must never be run directly on the host.
        argv = ["codex", "exec", "--strict-config", "--cd", "/tmp", "--ignore-user-config", "--ignore-rules", "--ephemeral",
                "--sandbox", "danger-full-access", "--skip-git-repo-check", "--color", "never"]
        # A clean /tmp working root and ignored user configuration prevent source
        # .codex settings from adding servers or overriding the factory catalog.
        # Only the image-owned bounded source/evidence server is launched.
        argv += [*codex_settings(writable=not readonly), "--output-schema", "/evidence/schema.json",
                 "--output-last-message", "/tmp/result.json", "-"]
        # Codex progress goes to the log, and only its final JSON goes to stdout.
        # This fixed script interpolates no Issue or model-provided text.
        script = '"$@" >&2 && cat /tmp/result.json'
        raw = self.call(workspace, ["sh", "-c", script, "factory-codex", *argv],
                        role=role, evidence=evidence, readonly=readonly,
                        stdin=prompt, log=log)
        return validate(parse_json(raw), schema)

    def worker(self, workspace, phase, prompt, log):
        if phase not in {"plan", "implement"}:
            raise Halt("unknown worker phase")
        schema = PLAN_SCHEMA if phase == "plan" else IMPLEMENT_SCHEMA
        # The schema is dispatcher-owned, outside the writable source snapshot,
        # in a separate mount for each fresh worker invocation.
        evidence = Path(log).parent / (phase + "-evidence")
        evidence.mkdir()
        atomic_json(evidence / "schema.json", schema)
        return self.codex(workspace, evidence, prompt, log, schema, "codex", phase == "plan")

    def verify(self, workspace, commands, log_dir):
        from factory.github_control import safe_text

        labels = {("npm", "ci"): "npm ci",
                  ("npm", "run", "check"): "npm run check",
                  ("npm", "run", "build:fixtures"): "npm run build:fixtures",
                  ("npm", "run", "test:e2e"): "npm run test:e2e"}
        diagnostic = re.compile(
            r"\b(?:error|errors|fail|failed|failure|type|typeerror|lint|eslint)\b|\bTS[0-9]{3,6}\b",
            re.IGNORECASE)
        for index, argv in enumerate(commands):
            log = Path(log_dir) / ("verify-%s.log" % index)
            try:
                self.call(workspace, argv, timeout=1200, log=log)
            except Halt as error:
                store = getattr(self.runner, "store", None)
                if (store and store.stopped()) or str(error) == "local STOP requested":
                    raise
                selected = []
                tail = ""
                try:
                    # Inspect a bounded tail and select diagnostics rather than
                    # publishing stdout or a whole fixture/test transcript.
                    with log.open("rb") as stream:
                        stream.seek(max(0, log.stat().st_size - 512 * 1024))
                        tail = stream.read(512 * 1024).decode("utf-8", errors="replace")
                    for line in tail.splitlines():
                        if diagnostic.search(line):
                            line = line.strip()[:1000]
                            if line not in selected:
                                selected.append(line)
                            if len(selected) == 8:
                                break
                except OSError:
                    pass
                summary = safe_text(" | ".join(selected) if selected else str(error), 600)
                if len(summary) > 600:  # Markdown escaping can expand safe_text.
                    summary = summary[:599].rstrip("\\") + "…"
                command = labels.get(tuple(argv), "verification step " + str(index + 1))
                infrastructure = re.search(r"cannot connect to.*docker|docker daemon|permission denied|"
                    r"ENOTFOUND|ETIMEDOUT|ECONNREFUSED|no space left|unauthorized|authentication required",
                    tail, re.IGNORECASE)
                if (isinstance(error, CommandFailure) and error.returncode not in {125, 126, 127}
                        and tuple(argv) in labels and tuple(argv) != ("npm", "ci")
                        and not infrastructure):
                    raise VerificationFailure(command, summary or "検証コマンドが失敗しました。") from error
                raise Halt("検証失敗: " + command + " | " + (summary or "診断を取得できませんでした。")) from error

    def review(self, workspace, evidence, prompt, log):
        # A fresh session and a read-only source snapshot, not the implementer's
        # conversation or writable source directory. Docker provides the sandbox:
        # read-only root/source/evidence, no host credentials, no host sockets.
        # Do not require nested Linux user namespaces inside the outer container.
        # This command must never be run directly on the host.
        return self.codex(workspace, evidence, prompt, log, REVIEW_SCHEMA, "codex-review", True)
