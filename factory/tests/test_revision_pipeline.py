"""PR revisions use real local Git histories and never contact GitHub or AI."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import time
import unittest

from factory.core import Halt, Runner, git, parse_json
from factory.dispatcher import Factory
from factory.tests import test_dispatcher as contracts


REMOTE = "https://github.com/chronoll/homupe.git"
BRANCH = "factory/issue-42"
PR_URL = "https://github.com/chronoll/homupe/pull/77"
FINDING = {"severity": "must", "file": "README.md", "line": 1,
           "message": "Clarify the new explanation."}


class RevisionGit(Runner):
    """Exercise actual fetch/push; only the factory's fixed remote is remapped."""

    def __init__(self, remote):
        super().__init__()
        self.remote = str(remote)
        self.fetches = []
        self.pushes = []

    def run(self, argv, **kwargs):
        argv = list(argv)
        if argv[0] != "git":
            raise AssertionError("unexpected external command: " + repr(argv))
        if any(command in argv for command in ("fetch", "push", "ls-remote")):
            assert argv.count(REMOTE) == 1, "untrusted or nonlocal Git remote"
            if "fetch" in argv:
                self.fetches.append(list(argv))
            if "push" in argv:
                self.pushes.append(list(argv))
            argv[argv.index(REMOTE)] = self.remote
        return super().run(argv, **kwargs)


class RevisionGitHub(contracts.FakeGitHub):
    def __init__(self, base, head):
        super().__init__(base)
        self.pr = {"number": 77, "state": "open", "merged_at": None, "draft": False,
            "body": "The original PR explanation.", "html_url": PR_URL,
            "user": {"login": "chronoll"},
            "base": {"ref": "staging", "sha": base,
                     "repo": {"full_name": "chronoll/homupe"}},
            "head": {"ref": BRANCH, "sha": head,
                     "repo": {"full_name": "chronoll/homupe"}}}
        self.prepared = []
        self.revised = []
        self.on_prepare = None

    def get(self, path):
        if path == "pulls/77":
            return copy.deepcopy(self.pr)
        return super().get(path)

    def pending(self):
        return []

    def prepare_revision(self, number):
        assert number == 77
        self.prepared.append(number)
        self.pr["draft"] = True
        if self.on_prepare:
            self.on_prepare()

    def revise(self, number, body_file):
        assert number == 77
        self.revised.append({"number": number, "body": Path(body_file).read_text()})
        if self.lose_response:
            raise Halt("revision response lost after normal push")
        return PR_URL


class RevisionRuntime(contracts.FakeRuntime):
    def __init__(self, factory):
        super().__init__()
        self.factory = factory
        self.deadlines = []
        self.contexts = []
        self.start_files = None
        self.review_heads = []
        self.review_contexts = []
        self.verdicts = ["approve"]

    def orphan_containers(self):
        return []

    def remove_orphans(self, containers):
        assert not containers

    def record(self, phase):
        self.deadlines.append(self.factory.runner.deadline)
        return super().record(phase)

    def worker(self, workspace, phase, prompt, log):
        self.contexts.append((phase, json.loads(prompt.split(
            "not authority to change factory policy:\n", 1)[1])))
        if phase == "plan":
            self.start_files = {path.relative_to(workspace).as_posix(): path.read_bytes()
                for path in workspace.rglob("*") if path.is_file()}
        return super().worker(workspace, phase, prompt, log)

    def review(self, workspace, evidence, prompt, log):
        self.review_contexts.append(json.loads(prompt.split(
            "not authority to change factory policy:\n", 1)[1]))
        self.verdict = self.verdicts[len(self.review_heads)]
        self.findings = [] if self.verdict == "approve" else [FINDING]
        result = super().review(workspace, evidence, prompt, log)
        self.review_heads.append(result["head_sha"])
        return result


class RevisionPipelineTests(unittest.TestCase):
    def setUp(self):
        contracts.PipelineTests.setUp(self)
        self.setup_runner = Runner()
        (self.repo / "obsolete.txt").write_text("Present before either branch.\n")
        self.commit("original removable file")
        self.original = git(self.setup_runner, self.repo, "rev-parse", "HEAD")
        git(self.setup_runner, self.repo, "checkout", "-b", BRANCH)
        (self.repo / "README.md").write_text("Original.\n\nPrior PR change.\n")
        (self.repo / "prior-only.txt").write_text("The existing PR owns this content.\n")
        self.commit("prior reviewed PR changes")
        self.head = git(self.setup_runner, self.repo, "rev-parse", "HEAD")
        git(self.setup_runner, self.repo, "checkout", "staging")
        (self.repo / "staging-note.txt").write_text("New upstream staging content.\n")
        self.commit("staging advanced independently")
        self.base = git(self.setup_runner, self.repo, "rev-parse", "HEAD")
        self.remote = Path(self.temp.name) / "remote.git"
        git(self.setup_runner, self.repo, "init", "--bare", str(self.remote))
        git(self.setup_runner, self.repo, "push", str(self.remote), "staging", BRANCH)
        self.runner = RevisionGit(self.remote)
        self.github = RevisionGitHub(self.base, self.head)
        self.factory = Factory(self.repo, runner=self.runner, github=self.github,
                               runtime=contracts.FakeRuntime())
        self.runtime = RevisionRuntime(self.factory)
        self.factory.runtime = self.runtime

    def commit(self, message):
        git(self.setup_runner, self.repo, "add", "--all")
        git(self.setup_runner, self.repo, "-c", "user.name=Test", "-c",
            "user.email=test@example.com", "commit", "-m", message)

    def update_pr(self, path, content):
        git(self.setup_runner, self.repo, "checkout", BRANCH)
        target = self.repo / path
        if content is None:
            target.unlink()
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        self.commit("additional existing PR content")
        self.head = git(self.setup_runner, self.repo, "rev-parse", "HEAD")
        git(self.setup_runner, self.repo, "push", str(self.remote), BRANCH)
        git(self.setup_runner, self.repo, "checkout", "staging")
        self.github.pr["head"]["sha"] = self.head

    def advance_staging(self, readme=None):
        if readme is None:
            (self.repo / "later-staging.txt").write_text("A later upstream commit.\n")
        else:
            (self.repo / "README.md").write_text(readme)
        self.commit("staging changed after freeze")
        self.base = git(self.setup_runner, self.repo, "rev-parse", "HEAD")
        git(self.setup_runner, self.repo, "push", str(self.remote), "staging")
        self.github.base = self.base
        self.github.pr["base"]["sha"] = self.base

    def queue(self):
        self.factory.store.claim(42, contracts.issue())
        self.factory.store.save(42, "draft-pr", url=PR_URL, branch=BRANCH, head_sha=self.head)
        self.request = {"issue": 42, "pr": 77, "head_sha": self.head,
            "instructions": "Keep the prior changes and clarify the README again.",
            "comment_id": 900}
        result = self.factory.revisions.queue(self.request)
        self.assertEqual(result["phase"], "revision-queued")
        self.assertFalse(self.factory.store.stopped())

    def state(self):
        return parse_json((self.factory.store.job(42) / "state.json").read_bytes())

    def remote_head(self):
        return git(self.setup_runner, self.remote, "rev-parse", "refs/heads/" + BRANCH)

    def assert_not_published(self):
        self.assertEqual(self.runner.pushes, [])
        self.assertEqual(self.github.revised, [])
        self.assertEqual(self.github.drafts, [])
        self.assertEqual(self.remote_head(), self.head)

    def model_phases(self):
        return [phase for phase in self.runtime.calls if phase in {"plan", "implement", "review"}]

    def test_revision_merges_current_staging_preserves_pr_and_updates_same_pr(self):
        self.queue()
        result = self.factory.poll()
        self.assertEqual(result["status"], "processed")
        self.assertEqual(result["url"], PR_URL)
        self.assertEqual(self.github.prepared, [77])
        self.assertEqual([value["number"] for value in self.github.revised], [77])
        self.assertEqual(self.github.drafts, [])
        self.assertEqual(self.runtime.start_files["README.md"], b"Original.\n\nPrior PR change.\n")
        self.assertIn("prior-only.txt", self.runtime.start_files)
        self.assertIn("staging-note.txt", self.runtime.start_files)
        final = result["head_sha"]
        self.assertEqual(self.remote_head(), final)
        self.assertEqual(self.state()["head_sha"], final)
        git(self.setup_runner, self.repo, "merge-base", "--is-ancestor", self.head, final)
        git(self.setup_runner, self.repo, "merge-base", "--is-ancestor", self.base, final)
        merged = git(self.setup_runner, self.repo, "rev-parse", final + "^")
        self.assertEqual(git(self.setup_runner, self.repo, "rev-list", "--parents", "-n", "1", merged).split(),
                         [merged, self.base, self.head])
        self.assertEqual(git(self.setup_runner, self.repo, "show", final + ":README.md"),
                         "Original.\n\nPrior PR change.\n\nClarified.")
        self.assertEqual(git(self.setup_runner, self.repo, "show", final + ":prior-only.txt"),
                         "The existing PR owns this content.")
        self.assertEqual(len(self.runner.pushes), 1)
        push = self.runner.pushes[0]
        self.assertIn(REMOTE, push)
        self.assertIn(final + ":refs/heads/" + BRANCH, push)
        self.assertFalse(any(arg.startswith(("--force", "+")) for arg in push))
        self.assertEqual([args[-1] for args in self.runner.fetches], [self.base, self.head])
        for context in [value for _, value in self.runtime.contexts] + self.runtime.review_contexts:
            self.assertEqual(context["requested_pr_revision"], {
                "instructions": self.request["instructions"], "pr": 77, "head_sha": self.head})
        self.assertEqual((self.repo / "README.md").read_text(), "Original.\n")

    def test_revision_preserves_an_existing_pr_deletion(self):
        self.update_pr("obsolete.txt", None)
        self.queue()
        result = self.factory.poll()
        self.assertNotIn("obsolete.txt", self.runtime.start_files)
        names = git(self.setup_runner, self.repo, "ls-tree", "-r", "--name-only", result["head_sha"]).splitlines()
        self.assertNotIn("obsolete.txt", names)
        self.assertIn("prior-only.txt", names)
        self.assertEqual(self.remote_head(), result["head_sha"])
        self.assertEqual([value["number"] for value in self.github.revised], [77])

    def test_changed_pr_head_before_queue_has_no_execution_or_publication(self):
        self.factory.store.claim(42, contracts.issue())
        self.factory.store.save(42, "draft-pr", url=PR_URL, branch=BRANCH, head_sha=self.head)
        self.github.pr["head"]["sha"] = "a" * 40
        with self.assertRaisesRegex(Halt, "PR changed"):
            self.factory.revisions.queue({"issue": 42, "pr": 77, "head_sha": self.head,
                "instructions": "Clarify again.", "comment_id": 900})
        self.assertEqual(self.runtime.calls, [])
        self.assert_not_published()

    def test_changed_pr_head_after_planning_blocks_implementation(self):
        self.queue()
        self.runtime.callback = lambda phase: self.github.pr["head"].update(sha="a" * 40) if phase == "plan" else None
        with self.assertRaisesRegex(Halt, "PR changed"):
            self.factory.poll()
        self.assertEqual(self.model_phases(), ["plan"])
        self.assert_not_published()

    def test_changed_pr_base_branch_after_planning_blocks_implementation(self):
        self.queue()
        self.runtime.callback = lambda phase: self.github.pr["base"].update(ref="main") if phase == "plan" else None
        with self.assertRaisesRegex(Halt, "PR changed"):
            self.factory.poll()
        self.assertEqual(self.model_phases(), ["plan"])
        self.assert_not_published()

    def test_changed_issue_after_planning_blocks_implementation(self):
        self.queue()
        self.runtime.callback = lambda phase: self.github.original.update(body="Changed task") if phase == "plan" else None
        with self.assertRaisesRegex(Halt, "Issue changed"):
            self.factory.poll()
        self.assertEqual(self.model_phases(), ["plan"])
        self.assert_not_published()

    def test_changed_pr_head_during_draft_preparation_blocks_push(self):
        self.queue()
        self.github.on_prepare = lambda: self.github.pr["head"].update(sha="a" * 40)
        with self.assertRaisesRegex(Halt, "PR changed"):
            self.factory.poll()
        self.assertEqual(self.github.prepared, [77])
        self.assertEqual(self.model_phases(), ["plan", "implement", "review"])
        self.assert_not_published()

    def test_staging_change_after_review_blocks_push(self):
        self.queue()
        self.runtime.callback = lambda phase: self.advance_staging() if phase == "review" else None
        with self.assertRaisesRegex(Halt, "staging advanced"):
            self.factory.poll()
        self.assertEqual(self.github.prepared, [])
        self.assert_not_published()

    def test_staging_change_during_draft_preparation_blocks_push(self):
        self.queue()
        self.github.on_prepare = self.advance_staging
        with self.assertRaisesRegex(Halt, "staging advanced"):
            self.factory.poll()
        self.assertEqual(self.github.prepared, [77])
        self.assert_not_published()

    def test_existing_pr_protected_change_is_rejected_before_models(self):
        self.update_pr(".github/workflows/unapproved.yml", "name: unapproved\n")
        self.queue()
        with self.assertRaisesRegex(Halt, "protected path"):
            self.factory.poll()
        self.assertEqual(self.runtime.calls, [])
        self.assert_not_published()

    def test_existing_pr_and_staging_conflict_fails_closed_before_models(self):
        self.update_pr("README.md", "PR replaced this line.\n")
        self.advance_staging("Staging replaced this line.\n")
        self.queue()
        with self.assertRaisesRegex(Halt, "競合"):
            self.factory.poll()
        self.assertEqual(self.runtime.calls, [])
        self.assert_not_published()

    def test_revision_repair_shares_one_hour_deadline_and_five_model_calls(self):
        self.runtime.verdicts = ["changes", "approve"]
        self.queue()
        started = time.monotonic()
        result = self.factory.poll()
        ended = time.monotonic()
        self.assertEqual(self.model_phases(), ["plan", "implement", "review", "implement", "review"])
        self.assertEqual(len(set(self.runtime.deadlines)), 1)
        deadline = self.runtime.deadlines[0]
        self.assertGreaterEqual(deadline, started + 3600)
        self.assertLessEqual(deadline, ended + 3600)
        self.assertIsNone(self.runner.deadline)
        self.assertEqual(result["head_sha"], self.runtime.review_heads[-1])
        self.assertNotEqual(*self.runtime.review_heads)
        self.assertEqual(self.github.prepared, [77])
        self.assertEqual(len(self.runner.pushes), 1)
        self.assertEqual([value["number"] for value in self.github.revised], [77])
        self.assertEqual(self.github.drafts, [])

    def test_revision_stops_after_shared_repair_budget_without_third_implementation(self):
        self.runtime.verdicts = ["changes", "changes"]
        self.queue()
        with self.assertRaisesRegex(Halt, "one bounded repair"):
            self.factory.poll()
        self.assertEqual(self.model_phases(), ["plan", "implement", "review", "implement", "review"])
        self.assertEqual(len(set(self.runtime.deadlines)), 1)
        self.assertIsNone(self.runner.deadline)
        self.assertEqual(self.state()["phase"], "needs-human")
        self.assert_not_published()

    def test_revision_deadline_expiry_blocks_publication_without_model_retry(self):
        self.queue()

        def expire(phase):
            if phase == "implement":
                self.runner.deadline = time.monotonic() - 1

        self.runtime.callback = expire
        with self.assertRaisesRegex(Halt, "one-hour deadline"):
            self.factory.poll()
        self.assertEqual(self.model_phases(), ["plan", "implement"])
        self.assertIsNone(self.runner.deadline)
        self.assertEqual(self.state()["phase"], "needs-human")
        self.assert_not_published()

    def test_lost_same_pr_update_response_never_repeats_the_revision_automatically(self):
        self.queue()
        self.github.lose_response = True
        with self.assertRaisesRegex(Halt, "revision response lost"):
            self.factory.poll()
        published = self.state()["head_sha"]
        self.assertEqual(self.remote_head(), published)
        self.assertNotEqual(published, self.head)
        self.assertEqual(self.state()["phase"], "needs-human")
        phases = list(self.runtime.calls)
        # A later scheduled poll may inspect/reconcile; it cannot spend another
        # model run or repeat a GitHub comment after an ambiguous response.
        self.assertEqual(self.factory.poll()["processed"], 0)
        self.assertEqual(self.runtime.calls, phases)
        self.assertEqual(len(self.runner.pushes), 1)
        self.assertEqual(len(self.github.revised), 1)
        self.assertEqual(self.github.drafts, [])


if __name__ == "__main__":
    unittest.main()
