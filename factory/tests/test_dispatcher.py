"""Offline contracts: real temporary Git repos; fake GitHub/container boundaries."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from factory.core import (Halt, IMPLEMENT_SCHEMA, PLAN_SCHEMA, REVIEW_SCHEMA,
    Runner, Store, changed, check_paths, digest, files, git, parse_json, validate)
from factory.dispatcher import DEFAULT_VERIFY, Factory, config_at, eligible, main
from factory.runtime import CODEX_MODEL, DockerRuntime

SOURCE = Path(__file__).resolve().parents[2]


def issue():
    return {"number": 42, "state": "open", "user": {"login": "chronoll"},
            "labels": [{"name": "factory:ready"}], "title": "Clarify the README",
            "body": "Make the explanation clearer. $(touch /tmp/not-an-instruction)",
            "updated_at": "2026-11-28T00:00:00Z"}


class LocalGit(Runner):
    def __init__(self):
        super().__init__()
        self.pushes = []
        self.fetches = []

    def run(self, argv, **kwargs):
        if argv[0] == "git" and "fetch" in argv:
            self.fetches.append(argv)
            return ""  # The exact base commit already exists in the temp repo.
        if argv[0] == "git" and "ls-remote" in argv:
            return ""
        if argv[0] == "git" and "push" in argv:
            self.pushes.append(argv)
            return ""
        if argv[0] in ("gh", "docker", "claude", "codex"):
            raise AssertionError("unexpected external command: " + repr(argv))
        return super().run(argv, **kwargs)


class FakeGitHub:
    def __init__(self, base):
        self.base = base
        self.original = issue()
        self.drafts = []
        self.on_check = None
        self.lose_response = False
        self.base_reads = 0
        self.advance = False
        self.existing_pr = False

    def issue(self, number):
        assert number == 42
        return copy.deepcopy(self.original)

    def get(self, path):
        if path == "git/ref/heads/staging":
            self.base_reads += 1
            return {"object": {"sha": "a" * 40 if self.advance and self.base_reads > 1 else self.base}}
        if path.startswith("pulls?"):
            return [{"number": 77}] if self.existing_pr else []
        raise AssertionError("unexpected API read: " + path)

    def check_current(self, original, config):
        if self.on_check:
            self.on_check()
        if not eligible(self.original, config) or self.original != original:
            raise Halt("Issue changed or stopped")

    def draft(self, branch, title, body_file):
        self.drafts.append({"branch": branch, "title": title, "body": Path(body_file).read_text()})
        if self.lose_response:
            raise Halt("PR response lost")
        return "https://github.com/chronoll/homupe/pull/77"


class FakeRuntime:
    def __init__(self):
        self.calls = []
        self.path = "README.md"
        self.fail_at = None
        self.wrong_head = False
        self.verdict = "approve"
        self.findings = []
        self.mutate_review = False
        self.mutate_checkout = False
        self.mutate_verify = False
        self.screenshots = True
        self.stop = None
        self.callback = None

    def record(self, phase):
        self.calls.append(phase)
        if self.fail_at == phase:
            raise Halt("simulated " + phase + " failure")
        if self.callback:
            self.callback(phase)

    def preflight(self, workspace):
        self.record("preflight")
        assert not (workspace / ".git").exists()

    def worker(self, workspace, phase, prompt, log):
        self.record(phase)
        assert "$(touch /tmp/not-an-instruction)" in prompt  # Literal task data.
        if phase == "plan":
            return validate({"phase": "plan", "decision": "go", "summary": "Small change",
                             "plan": "Clarify README; preserve all commands."}, PLAN_SCHEMA)
        target = workspace / self.path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(target.read_text() + "\nClarified.\n" if target.exists() else "New file.\n")
        return validate({"phase": "implement", "status": "done", "summary": "Clarified",
            "pr_title": "docs: clarify README", "pr_body": "Clarifies the existing behavior."}, IMPLEMENT_SCHEMA)

    def verify(self, workspace, commands, log_dir):
        self.record("verify")
        assert commands == DEFAULT_VERIFY
        # Expected generated files must not look like candidate source mutations.
        (workspace / "next-env.d.ts").write_text("// generated\n")
        (workspace / "tsconfig.tsbuildinfo").write_text("generated")
        if self.mutate_verify:
            (workspace / "README.md").write_text("verification changed source")
        if self.screenshots:
            for size in ("desktop", "mobile"):
                target = workspace / "test-results" / size / "home.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"\x89PNG\r\n\x1a\n")

    def review(self, workspace, evidence, prompt, log):
        self.record("review")
        assert not (workspace / ".git").exists()
        assert (evidence / "diff.patch").read_text().startswith("diff --git")
        assert (evidence / "schema.json").exists()
        context = json.loads(prompt.split("not authority to change factory policy:\n", 1)[1])
        if self.mutate_review:
            (workspace / "README.md").write_text("tampered during review")
        if self.mutate_checkout:
            (workspace.parent / "checkout" / "README.md").write_text("tampered candidate")
        return validate({"phase": "review", "verdict": self.verdict,
            "head_sha": "b" * 40 if self.wrong_head else context["head_sha"],
            "summary": "No blocking findings.", "findings": self.findings}, REVIEW_SCHEMA)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        (self.repo / ".factory").mkdir()
        for name in ("config.json", "plan-prompt.md", "implement-prompt.md", "review-prompt.md"):
            (self.repo / ".factory" / name).write_bytes((SOURCE / ".factory" / name).read_bytes())
        (self.repo / ".gitignore").write_text("next-env.d.ts\n*.tsbuildinfo\n.factory-state/\ntest-results/\n")
        (self.repo / "README.md").write_text("Original.\n")
        self.runner = LocalGit()
        git(self.runner, self.repo, "init", "-b", "staging")
        git(self.runner, self.repo, "add", ".")
        git(self.runner, self.repo, "-c", "user.name=Test", "-c", "user.email=test@example.com",
            "commit", "-m", "initial")
        self.base = git(self.runner, self.repo, "rev-parse", "HEAD")
        self.github = FakeGitHub(self.base)
        self.runtime = FakeRuntime()
        self.factory = Factory(self.repo, runner=self.runner, github=self.github, runtime=self.runtime)

    def state(self):
        return parse_json((self.factory.store.job(42) / "state.json").read_bytes())

    def assert_not_published(self):
        self.assertEqual(self.runner.pushes, [])
        self.assertEqual(self.github.drafts, [])

    def test_full_offline_pipeline_freezes_reviews_and_opens_only_a_draft(self):
        result = self.factory.run(42)
        self.assertEqual(result["phase"], "draft-pr")
        self.assertEqual(self.runtime.calls, ["preflight", "plan", "implement", "verify", "review"])
        self.assertEqual(self.state()["head_sha"], result["head_sha"])
        self.assertEqual(self.github.drafts[0]["branch"], "factory/issue-42")
        self.assertIn("human review and merge required", self.github.drafts[0]["body"])
        self.assertEqual(len(self.runner.pushes), 1)
        self.assertIn("https://github.com/chronoll/homupe.git", self.runner.pushes[0])
        self.assertEqual((self.repo / "README.md").read_text(), "Original.\n")

    def test_dry_run_has_no_ai_git_network_writes_or_journal(self):
        result = self.factory.dry_run(issue())
        self.assertEqual(result["ai_calls"], 0)
        self.assertEqual(result["github_writes"], 0)
        self.assertFalse(self.factory.store.root.exists())
        self.assertEqual(self.runtime.calls, [])
        self.assertEqual(self.runner.fetches, [])
        self.assert_not_published()

    def test_ineligible_issue_never_claims_or_starts_ai(self):
        variants = [dict(user={"login": "outsider"}), dict(labels=[]), dict(state="closed"),
                    dict(pull_request={"url": "fake"}), dict(number=True),
                    dict(labels=["factory:ready", "factory:stop"])]
        for variant in variants:
            self.github.original = {**issue(), **variant}
            with self.subTest(variant=variant), self.assertRaises(Halt):
                self.factory.run(42)
        self.assertEqual(self.runtime.calls, [])
        self.assert_not_published()

    def test_completed_job_is_not_repeated_after_restart(self):
        self.factory.run(42)
        previous = list(self.runtime.calls)
        again = Factory(self.repo, runner=self.runner, github=self.github, runtime=self.runtime)
        with self.assertRaises(Halt):
            again.run(42)
        self.assertEqual(previous, self.runtime.calls)

    def test_failure_at_each_phase_is_retained_without_automatic_retry(self):
        for phase in ("preflight", "plan", "implement", "verify", "review"):
            with self.subTest(phase=phase):
                factory = Factory(self.repo, Path(self.temp.name) / phase,
                                  runner=self.runner, github=self.github, runtime=FakeRuntime())
                factory.runtime.fail_at = phase
                with self.assertRaises(Halt):
                    factory.run(42)
                previous = list(factory.runtime.calls)
                with self.assertRaises(Halt):
                    factory.run(42)
                self.assertEqual(factory.runtime.calls, previous)
                state = parse_json((factory.store.job(42) / "state.json").read_bytes())
                self.assertEqual(state["phase"], "needs-human")
                self.assertIn("simulated", state["reason"])
        self.assert_not_published()

    def test_protected_path_is_rejected_before_verification(self):
        self.runtime.path = ".github/workflows/pwn.yml"
        with self.assertRaisesRegex(Halt, "protected path"):
            self.factory.run(42)
        self.assertNotIn("verify", self.runtime.calls)
        self.assert_not_published()

    def test_issue_change_or_stop_after_plan_blocks_implementation(self):
        def change(phase):
            if phase == "plan":
                self.github.original["body"] = "changed after freezing"
        self.runtime.callback = change
        with self.assertRaises(Halt):
            self.factory.run(42)
        self.assertNotIn("implement", self.runtime.calls)
        self.assert_not_published()

    def test_local_stop_after_implementation_blocks_verification(self):
        def stop(phase):
            if phase == "implement":
                (self.factory.store.root / "STOP").touch()
        self.runtime.callback = stop
        # A production Runner checks STOP before every container call. Use the
        # same boundary in this fake rather than running a real container.
        original = self.runtime.verify
        def verify(*args):
            self.factory.store.check_stop()
            return original(*args)
        self.runtime.verify = verify
        with self.assertRaisesRegex(Halt, "STOP"):
            self.factory.run(42)
        self.assert_not_published()

    def test_verification_mutation_cannot_be_reviewed(self):
        self.runtime.mutate_verify = True
        with self.assertRaisesRegex(Halt, "verification modified"):
            self.factory.run(42)
        self.assertNotIn("review", self.runtime.calls)
        self.assert_not_published()

    def test_ignored_new_source_cannot_pass_review_as_the_verified_commit(self):
        def ignore_new_file(phase):
            if phase == "implement":
                work = self.factory.store.job(42) / "workspace"
                ignore = work / ".gitignore"
                ignore.write_text(ignore.read_text() + "\nnew-helper.ts\n")
                (work / "new-helper.ts").write_text("export const required = true;\n")
        self.runtime.callback = ignore_new_file
        with self.assertRaisesRegex(Halt, "committed tree differs"):
            self.factory.run(42)
        job = self.factory.store.job(42)
        self.assertIn("verify", self.runtime.calls)
        self.assertTrue((job / "workspace" / "new-helper.ts").exists())
        self.assertEqual(git(self.runner, job / "checkout", "ls-tree", "HEAD", "new-helper.ts"), "")
        self.assertNotIn("review", self.runtime.calls)
        self.assert_not_published()

    def test_export_ignored_source_cannot_disappear_from_review_snapshot(self):
        # Attributes are trusted baseline policy; the agent only adds source.
        (self.repo / ".gitattributes").write_text("new-helper.ts export-ignore\n")
        git(self.runner, self.repo, "add", ".gitattributes")
        git(self.runner, self.repo, "-c", "user.name=Test", "-c", "user.email=test@example.com",
            "commit", "-m", "baseline archive policy")
        self.github.base = git(self.runner, self.repo, "rev-parse", "HEAD")
        def hide_new_file(phase):
            if phase == "implement":
                work = self.factory.store.job(42) / "workspace"
                (work / "new-helper.ts").write_text("export const required = true;\n")
        self.runtime.callback = hide_new_file
        with self.assertRaisesRegex(Halt, "committed tree differs"):
            self.factory.run(42)
        job = self.factory.store.job(42)
        self.assertIn("verify", self.runtime.calls)
        self.assertIn("new-helper.ts", git(self.runner, job / "checkout", "ls-tree", "HEAD", "new-helper.ts"))
        self.assertFalse((job / "review-source" / "new-helper.ts").exists())
        self.assertNotIn("review", self.runtime.calls)
        self.assert_not_published()

    def test_ui_change_requires_both_size_screenshots(self):
        self.runtime.path = "src/components/Widget.tsx"
        self.runtime.screenshots = False
        with self.assertRaisesRegex(Halt, "screenshots"):
            self.factory.run(42)
        self.assert_not_published()

    def test_review_must_match_head_and_have_no_blocking_findings(self):
        variants = [("wrong_head", True), ("verdict", "changes"), ("mutate_review", True),
                    ("mutate_checkout", True), ("findings", [{"severity": "must", "file": "README.md",
                                                              "line": 1, "message": "defect"}])]
        for key, value in variants:
            with self.subTest(variant=key):
                runtime = FakeRuntime()
                setattr(runtime, key, value)
                factory = Factory(self.repo, Path(self.temp.name) / key,
                                  runner=self.runner, github=self.github, runtime=runtime)
                with self.assertRaises(Halt):
                    factory.run(42)
        self.assert_not_published()

    def test_staging_advance_stops_publication(self):
        self.github.advance = True
        with self.assertRaisesRegex(Halt, "staging advanced"):
            self.factory.run(42)
        self.assert_not_published()

    def test_missing_staging_does_not_fall_back_to_main(self):
        self.github.get = lambda _path: (_ for _ in ()).throw(Halt("404 staging"))
        with self.assertRaisesRegex(Halt, "404 staging"):
            self.factory.run(42)
        self.assertEqual(self.runtime.calls, [])
        self.assert_not_published()

    def test_lost_pr_response_is_not_retried_and_preserves_head(self):
        self.github.lose_response = True
        with self.assertRaisesRegex(Halt, "response lost"):
            self.factory.run(42)
        self.assertEqual(self.state()["previous_phase"], "publishing")
        self.assertEqual(self.state()["branch"], "factory/issue-42")
        self.assertRegex(self.state()["head_sha"], r"^[0-9a-f]{40}$")
        previous = list(self.runtime.calls)
        with self.assertRaises(Halt):
            self.factory.run(42)
        self.assertEqual(self.runtime.calls, previous)
        self.assertEqual(len(self.github.drafts), 1)
        self.assertEqual(len(self.runner.pushes), 1)

    def test_configuration_cannot_select_main_or_auto_merge(self):
        path = self.repo / ".factory/config.json"
        original = parse_json(path.read_bytes())
        for key, value in (("base", "main"), ("auto_merge", True), ("verify", [["sh", "-c", "echo pass"]])):
            path.write_text(json.dumps({**original, key: value}))
            with self.subTest(key=key), self.assertRaises(Halt):
                config_at(self.repo)


class StateAndProcessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_lock_excludes_another_dispatcher(self):
        first, second = Store(self.root), Store(self.root)
        with first.lock():
            with self.assertRaises(Halt):
                with second.lock():
                    self.fail("lock allowed a second dispatcher")

    def test_partial_claim_after_hard_crash_is_not_reused(self):
        store = Store(self.root)
        job = store.job(42)
        job.mkdir(parents=True)
        with self.assertRaises(Halt):
            store.claim(42, issue())

    def test_corrupt_state_does_not_erase_claim(self):
        store = Store(self.root)
        store.claim(42, issue())
        (store.job(42) / "state.json").write_text('{"phase":')
        with self.assertRaises(Halt):
            store.save(42, "claimed")
        with self.assertRaises(Halt):
            store.claim(42, issue())

    def test_timeout_kills_spawned_process_group(self):
        pid_file = self.root / "child.pid"
        heartbeat = self.root / "heartbeat"
        child = "import pathlib,time,sys\np=pathlib.Path(sys.argv[1])\nwhile True:\n p.write_text(str(time.time_ns())); time.sleep(0.03)"
        script = ("import subprocess,sys,time,pathlib; "
                  "p=subprocess.Popen([sys.executable,'-c',sys.argv[2],sys.argv[3]]); "
                  "pathlib.Path(sys.argv[1]).write_text(str(p.pid)); time.sleep(30)")
        with self.assertRaisesRegex(Halt, "timed out"):
            Runner().run([sys.executable, "-c", script, str(pid_file), child, str(heartbeat)], timeout=0.3)
        self.assertTrue(pid_file.exists())
        time.sleep(0.1)
        last = heartbeat.read_text()
        time.sleep(0.15)
        self.assertEqual(heartbeat.read_text(), last, "spawned child survived group termination")

    def test_stop_interrupts_hung_process_even_with_large_stdin(self):
        store = Store(self.root)
        thread = threading.Timer(0.1, lambda: (self.root / "STOP").touch())
        thread.start()
        self.addCleanup(thread.join)
        start = time.monotonic()
        with self.assertRaisesRegex(Halt, "STOP"):
            Runner(store).run([sys.executable, "-c", "import time; time.sleep(30)"],
                              stdin="x" * 1024 * 1024, timeout=5)
        self.assertLess(time.monotonic() - start, 3)

    def test_machine_stdout_is_not_polluted_by_stderr(self):
        output = Runner().run([sys.executable, "-c", "import sys; print('{}'); print('progress',file=sys.stderr)"])
        self.assertEqual(parse_json(output), {})

    def test_output_cap_also_applies_after_a_fast_process_exits(self):
        with patch("factory.core.MAX_OUTPUT", 1024):
            with self.assertRaisesRegex(Halt, "output exceeds"):
                Runner().run([sys.executable, "-c", "print('x'*2048)"])

    def test_files_reject_symlinks_and_hardlinks(self):
        original = self.root / "original"
        original.write_text("source")
        link = self.root / "link"
        link.symlink_to(original)
        with self.assertRaisesRegex(Halt, "non-regular"):
            files(self.root)
        link.unlink()
        os.link(original, link)
        with self.assertRaisesRegex(Halt, "hard-linked"):
            files(self.root)


class ContractTests(unittest.TestCase):
    def assert_isolated_codex(self, argv, writable):
        argv = argv[argv.index("codex"):]
        self.assertIn("--strict-config", argv)
        self.assertEqual(argv[argv.index("--cd") + 1], "/tmp")
        disabled = {argv[index + 1] for index, value in enumerate(argv) if value == "--disable"}
        self.assertTrue({"shell_tool", "unified_exec", "apps", "hooks", "plugins", "remote_plugin",
                         "browser_use", "computer_use", "multi_agent", "image_generation",
                         "view_image", "code_mode", "request_permissions_tool"} <= disabled)
        self.assertNotIn("--enable", argv)
        settings = [argv[index + 1] for index, value in enumerate(argv) if value == "-c"]
        for setting in ('forced_login_method="chatgpt"', 'model_provider="openai"',
                        'model="' + CODEX_MODEL + '"', 'web_search="disabled"',
                        'model_catalog_json="/opt/factory-model-catalog.json"',
                        'project_doc_max_bytes=0'):
            self.assertIn(setting, settings)
        mcp = next(setting for setting in settings if setting.startswith("mcp_servers="))
        self.assertIn('command="/usr/bin/python3"', mcp)
        self.assertIn('"-I","/opt/factory-read-tools.py"', mcp)
        self.assertIn("required=true", mcp)
        self.assertEqual('"--allow-write"' in mcp, writable)
        enabled = parse_json(re.search(r"enabled_tools=(\[[^]]+\])", mcp).group(1))
        self.assertEqual(set(enabled), {"list_files", "read_file", "search", "read_image"} |
                         ({"write_file", "delete_file"} if writable else set()))

    def test_case_aliases_cannot_reach_protected_paths_on_macos(self):
        aliases = [".GIT", ".Git/config", "nested/.GiT/hooks/pre-commit",
                   ".FaCtOrY", ".FaCtOrY/config.json", "FaCtOrY/core.py",
                   ".GiTHuB/workflows/ci.yml", "AgEnTs.md", "cLaUdE.Md",
                   ".CoDeX/config.toml", ".MCP.JSON", "PACKAGE.JSON",
                   "nested/.GiTaTtRiBuTeS", "nested/.ENV.local", "nested/.EnV.Local.Example"]
        for relative in aliases:
            with self.subTest(path=relative), self.assertRaises(Halt):
                check_paths([relative])
        check_paths(["README.md", "src/components/Widget.tsx", "public/Logo.PNG"])

    def test_only_the_two_codex_authentication_roles_can_mount_persistent_homes(self):
        runtime = DockerRuntime(parse_json((SOURCE / ".factory/config.json").read_bytes()), Runner())
        for role in ("claude", "review", "codex,src=/home", "codex/../other"):
            with self.subTest(role=role), self.assertRaises(Halt):
                runtime.command("/tmp/source", ["codex", "login", "status"], role=role)

    def test_cleanup_failure_sets_stop_even_if_docker_cli_disappears(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            runner = Runner(Store(root / "state"))
            runtime = DockerRuntime(parse_json((SOURCE / ".factory/config.json").read_bytes()), runner)
            with patch.object(runner, "run", return_value="{}"):
                with patch.object(Runner, "run", side_effect=OSError("Docker disappeared")):
                    with self.assertRaisesRegex(Halt, "cleanup failed"):
                        runtime.call(root, ["true"])
            self.assertTrue(runner.store.stopped())

    def test_strict_json_rejects_ambiguous_or_oversized_outputs(self):
        for raw in ('{"a":1,"a":2}', '{"a":NaN}', "{} {}", "```json\n{}\n```", "x" * (1024 * 1024 + 1)):
            with self.subTest(raw=raw[:30]), self.assertRaises(Halt):
                parse_json(raw)

    def test_result_schema_rejects_unknown_missing_and_wrong_fields(self):
        good = {"phase": "plan", "decision": "go", "summary": "Ready", "plan": "Steps"}
        self.assertEqual(validate(good, PLAN_SCHEMA), good)
        for value in ({**good, "extra": True}, {**good, "phase": "implement"},
                      {**good, "plan": []}, {"phase": "plan"}):
            with self.assertRaises(Halt):
                validate(value, PLAN_SCHEMA)

    def test_docker_never_mounts_host_home_git_or_socket(self):
        config = parse_json((SOURCE / ".factory/config.json").read_bytes())
        runtime = DockerRuntime(config, Runner())
        for role in ("codex", "codex-review"):
            with self.subTest(role=role):
                command = runtime.command("/tmp/source", ["codex", "exec"], role=role, readonly=True)
                mounts = [command[i + 1] for i, item in enumerate(command) if item == "--mount"]
                self.assertEqual(mounts, ["type=bind,src=%s,dst=/workspace,readonly" % Path("/tmp/source").resolve(),
                                         "type=volume,src=homupe-factory-%s,dst=/home/node" % role])
                self.assertNotIn("--privileged", command)
                self.assertNotIn("--network=host", command)
                self.assertIn("--read-only", command)
                self.assertFalse(any(os.path.expanduser("~") in mount for mount in mounts))
                self.assertFalse(any("docker.sock" in mount or "/.git" in mount for mount in mounts))
        verify = runtime.command("/tmp/source", ["npm", "ci"])
        self.assertFalse(any("type=volume" in item for item in verify))

    def test_container_cleanup_runs_after_success_and_timeout(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log = root / "calls.jsonl"
            tool = root / "docker"
            tool.write_text("#!" + sys.executable + "\n" +
                "import json,os,sys,time\n" +
                "with open(os.environ['FACTORY_TEST_CALLS'],'a') as f: f.write(json.dumps(sys.argv[1:])+'\\n')\n" +
                "if sys.argv[1]=='run':\n" +
                " if os.environ.get('FACTORY_TEST_HANG'): time.sleep(30)\n" +
                " print('{}')\n")
            tool.chmod(0o755)
            config = parse_json((SOURCE / ".factory/config.json").read_bytes())
            with patch.dict(os.environ, {"PATH": str(root) + os.pathsep + os.environ["PATH"],
                                        "FACTORY_TEST_CALLS": str(log)}):
                runtime = DockerRuntime(config, Runner())
                self.assertEqual(parse_json(runtime.call(root, ["true"])), {})
                with patch.dict(os.environ, {"FACTORY_TEST_HANG": "1"}):
                    with self.assertRaisesRegex(Halt, "timed out"):
                        runtime.call(root, ["true"], timeout=0.1)
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual([call[0] for call in calls], ["run", "rm", "run", "rm"])
            self.assertEqual(calls[1], ["rm", "-f", calls[0][calls[0].index("--name") + 1]])

    def test_each_codex_worker_phase_is_fresh_and_has_its_own_output_contract(self):
        results = {
            "plan": {"phase": "plan", "decision": "go", "summary": "Ready", "plan": "Steps"},
            "implement": {"phase": "implement", "status": "done", "summary": "Clarified",
                          "pr_title": "docs: clarify README", "pr_body": "Clarifies behavior."},
        }
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            runtime = DockerRuntime(parse_json((SOURCE / ".factory/config.json").read_bytes()), Runner())
            for phase, good in results.items():
                with self.subTest(phase=phase), patch.object(runtime, "call", return_value=json.dumps(good)) as call:
                    self.assertEqual(runtime.worker(root, phase, "literal task", root / (phase + ".log")), good)
                    argv = call.call_args.args[1]
                    self.assertIn("codex", argv)
                    self.assertIn("exec", argv)
                    self.assertIn("--ephemeral", argv)
                    self.assertIn("--ignore-user-config", argv)
                    self.assertIn("--ignore-rules", argv)
                    self.assertIn("--output-schema", argv)
                    self.assertIn("--output-last-message", argv)
                    self.assert_isolated_codex(argv, writable=phase == "implement")
                    self.assertNotIn("resume", argv)
                    self.assertNotIn("claude", argv)
                    self.assertEqual(call.call_args.kwargs["role"], "codex")
                    self.assertEqual(call.call_args.kwargs["readonly"], phase == "plan")
                    self.assertEqual(call.call_args.kwargs["stdin"], "literal task")
                    evidence = call.call_args.kwargs["evidence"]
                    schema_path = argv[argv.index("--output-schema") + 1]
                    self.assertTrue(schema_path.startswith("/evidence/"))
                    schema = parse_json((Path(evidence) / Path(schema_path).name).read_bytes())
                    self.assertEqual(schema, PLAN_SCHEMA if phase == "plan" else IMPLEMENT_SCHEMA)

    def test_codex_worker_rejects_invalid_phase_without_invoking_container(self):
        runtime = DockerRuntime(parse_json((SOURCE / ".factory/config.json").read_bytes()), Runner())
        with patch.object(runtime, "call") as call:
            with self.assertRaises(Halt):
                runtime.worker(Path("/tmp/source"), "review", "task", None)
            call.assert_not_called()

    def test_codex_worker_rejects_invalid_json_and_wrong_phase_results(self):
        plan = {"phase": "plan", "decision": "go", "summary": "Ready", "plan": "Steps"}
        implementation = {"phase": "implement", "status": "done", "summary": "Clarified",
                          "pr_title": "docs: clarify README", "pr_body": "Clarifies behavior."}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            runtime = DockerRuntime(parse_json((SOURCE / ".factory/config.json").read_bytes()), Runner())
            for phase, good, wrong in (("plan", plan, implementation), ("implement", implementation, plan)):
                variants = ["{} {}", '{"phase":"plan","phase":"implement"}',
                            "```json\n" + json.dumps(good) + "\n```", json.dumps(wrong),
                            json.dumps({**good, "extra": "untrusted"})]
                for index, raw in enumerate(variants):
                    with self.subTest(phase=phase, raw=raw[:40]), patch.object(runtime, "call", return_value=raw):
                        attempt = root / (phase + "-" + str(index))
                        attempt.mkdir()
                        with self.assertRaises(Halt):
                            runtime.worker(root, phase, "task", attempt / (phase + ".log"))

    def test_codex_review_uses_a_fresh_session_and_separate_home_with_readonly_evidence(self):
        good = {"phase": "review", "verdict": "approve", "head_sha": "a" * 40,
                "summary": "No blocking findings.", "findings": []}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, evidence = root / "source", root / "evidence"
            source.mkdir()
            evidence.mkdir()
            (evidence / "schema.json").write_text(json.dumps(REVIEW_SCHEMA))
            runtime = DockerRuntime(parse_json((SOURCE / ".factory/config.json").read_bytes()), Runner())
            with patch.object(runtime, "call", return_value=json.dumps(good)) as call:
                self.assertEqual(runtime.review(source, evidence, "review task", root / "review.log"), good)
                argv = call.call_args.args[1]
                self.assertIn("codex", argv)
                self.assertIn("--ephemeral", argv)
                self.assertIn("--ignore-user-config", argv)
                self.assertIn("--ignore-rules", argv)
                self.assert_isolated_codex(argv, writable=False)
                self.assertNotIn("resume", argv)
                self.assertEqual(call.call_args.kwargs["role"], "codex-review")
                self.assertTrue(call.call_args.kwargs["readonly"])
                self.assertEqual(call.call_args.kwargs["evidence"], evidence)
                self.assertEqual(call.call_args.kwargs["stdin"], "review task")
                command = runtime.command(source, argv, role="codex-review", evidence=evidence, readonly=True)
                mounts = [command[index + 1] for index, item in enumerate(command) if item == "--mount"]
                self.assertIn("type=bind,src=%s,dst=/evidence,readonly" % evidence.resolve(), mounts)
                self.assertIn("type=bind,src=%s,dst=/workspace,readonly" % source.resolve(), mounts)
                self.assertIn("type=volume,src=homupe-factory-codex-review,dst=/home/node", mounts)
                self.assertFalse(any("src=homupe-factory-codex," in mount for mount in mounts))
            for raw in ("{} {}", json.dumps({**good, "phase": "implement"}),
                        json.dumps({**good, "extra": "untrusted"}),
                        json.dumps({**good, "findings": [{"severity": "critical", "file": "README.md",
                                                         "line": 1, "message": "wrong enum"}]})):
                with self.subTest(raw=raw[:50]), patch.object(runtime, "call", return_value=raw):
                    with self.assertRaises(Halt):
                        runtime.review(source, evidence, "review task", root / "review.log")

    def test_preflight_checks_both_separate_codex_subscription_homes(self):
        config = parse_json((SOURCE / ".factory/config.json").read_bytes())
        runner = Runner()
        runtime = DockerRuntime(config, runner)
        image = [{"Id": "sha256:" + "a" * 64,
                  "Config": {"User": "%s:%s" % (os.getuid(), os.getgid()), "Env": []}}]
        with patch.object(runner, "run", return_value=json.dumps(image)):
            with patch.object(runtime, "call", return_value="Logged in using ChatGPT") as call:
                runtime.preflight(Path("/tmp/source"))
                self.assertEqual([entry.kwargs["role"] for entry in call.call_args_list], ["codex", "codex-review"])
                for entry in call.call_args_list:
                    self.assertEqual(entry.args[1], ["codex", "-C", "/tmp", "login", "status"])
                    self.assertTrue(entry.kwargs["readonly"])
                self.assertEqual(runtime.image, image[0]["Id"])

    def test_preflight_rejects_api_key_or_missing_auth_in_either_codex_home(self):
        config = parse_json((SOURCE / ".factory/config.json").read_bytes())
        image = [{"Id": "sha256:" + "a" * 64,
                  "Config": {"User": "%s:%s" % (os.getuid(), os.getgid()), "Env": []}}]
        for bad_role in ("codex", "codex-review"):
            for status in ("Not logged in", "Logged in using an API key",
                           "Logged in using an API key; ChatGPT subscription is unavailable",
                           "Not logged in (ChatGPT)"):
                with self.subTest(role=bad_role, status=status):
                    runner = Runner()
                    runtime = DockerRuntime(config, runner)
                    def auth(_workspace, _argv, **kwargs):
                        return status if kwargs["role"] == bad_role else "Logged in using ChatGPT"
                    with patch.object(runner, "run", return_value=json.dumps(image)):
                        with patch.object(runtime, "call", side_effect=auth):
                            with self.assertRaises(Halt):
                                runtime.preflight(Path("/tmp/source"))

    def test_offline_cli_example_does_not_invoke_any_external_command(self):
        with patch.object(Runner, "run", side_effect=AssertionError("external command")):
            with patch("sys.stdout"):
                self.assertEqual(main(["--repo", str(SOURCE), "run", "999999", "--dry-run",
                    "--issue-file", str(SOURCE / ".factory/example-issue.json")]), 0)


if __name__ == "__main__":
    unittest.main()
