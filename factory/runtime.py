"""Only the parent has GitHub access; agents/tests see a source snapshot."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import uuid

from factory.core import (Halt, IMPLEMENT_SCHEMA, PLAN_SCHEMA, REVIEW_SCHEMA,
                          Runner, parse_json, validate)


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
                  "--user", "%s:%s" % (uid, gid), "--cap-drop", "ALL", "--security-opt",
                  "no-new-privileges", "--pids-limit", "256", "--memory", "4g",
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
            result += ["--mount", "type=volume,src=homupe-factory-%s,dst=/home/node" % role]
        else:
            result += ["--tmpfs", "/home/node:rw,uid=%s,gid=%s,mode=700,size=1g" % (uid, gid)]
        if evidence:
            result += ["--mount", "type=bind,src=%s,dst=/evidence,readonly" % Path(evidence).resolve()]
        return result + [self.image, *argv]

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
        claude = parse_json(self.call(workspace, ["claude", "auth", "status"],
                                     role="claude", readonly=True))
        if not claude.get("loggedIn") or claude.get("authMethod") != "claude.ai":
            raise Halt("container Claude Code must be signed in with a Claude subscription")
        codex = self.call(workspace, ["codex", "login", "status"], role="codex", readonly=True, combine=True)
        if "ChatGPT" not in codex:
            raise Halt("container Codex must be signed in with ChatGPT, not an API key")

    def pin_image(self, info):
        expected_user = "%s:%s" % (os.getuid(), os.getgid())
        if os.getuid() == 0 or info[0]["Config"]["User"] != expected_user:
            raise Halt("build the non-root image with the host FACTORY_UID/FACTORY_GID")
        for setting in info[0]["Config"].get("Env", []):
            if setting.partition("=")[0] in {"OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY",
                                              "GH_TOKEN", "GITHUB_TOKEN"}:
                raise Halt("container image contains a credential environment variable")
        self.image = info[0]["Id"]  # Pin every subsequent invocation to this image.

    def claude(self, workspace, phase, prompt, log):
        schema = PLAN_SCHEMA if phase == "plan" else IMPLEMENT_SCHEMA
        tools = "Read,Glob,Grep" if phase == "plan" else "Read,Glob,Grep,Edit,Write"
        settings = {"disableAllHooks": True,
                    "permissions": {"deny": ["Bash", "WebFetch", "WebSearch", "Agent"]}}
        # Agents edit files only. All package installs/tests/commits run under
        # dispatcher control. No shell, browser, MCP, hooks or API key fallback.
        argv = ["claude", "-p", "--output-format", "json", "--json-schema", json.dumps(schema),
                "--tools", tools, "--allowedTools", tools, "--permission-mode", "dontAsk",
                "--setting-sources", "", "--settings", json.dumps(settings),
                "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
                "--no-chrome", "--disable-slash-commands", "--no-session-persistence"]
        envelope = parse_json(self.call(workspace, argv, role="claude", stdin=prompt,
                                      readonly=phase == "plan", log=log))
        if envelope.get("is_error") or envelope.get("subtype") != "success":
            raise Halt("Claude did not finish successfully; no automatic retry")
        return validate(envelope.get("structured_output"), schema)

    def verify(self, workspace, commands, log_dir):
        for index, argv in enumerate(commands):
            self.call(workspace, argv, timeout=1200,
                      log=Path(log_dir) / ("verify-%s.log" % index))

    def review(self, workspace, evidence, prompt, log):
        # A fresh session and a read-only source snapshot, not the implementer's
        # conversation or writable source directory. Docker provides the sandbox:
        # read-only root/source/evidence, no host credentials, no host sockets.
        # Do not require nested Linux user namespaces inside the outer container.
        # This command must never be run directly on the host.
        argv = ["codex", "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral",
                "--sandbox", "danger-full-access", "--skip-git-repo-check", "--color", "never",
                "--output-schema", "/evidence/review-schema.json",
                "--output-last-message", "/tmp/review.json", "-"]
        # Codex emits progress separately; emit just its final JSON on stdout.
        # This is a fixed script; no Issue or model text is interpolated into it.
        script = '"$@" >&2 && cat /tmp/review.json'
        raw = self.call(workspace, ["sh", "-c", script, "factory-review", *argv],
                        role="codex", evidence=evidence, readonly=True,
                        stdin=prompt, log=log)
        return validate(parse_json(raw), REVIEW_SCHEMA)
