"""PR revision host contracts with fake GitHub and real temporary journals."""
from __future__ import annotations

import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from factory.core import Halt, Store, atomic_json, parse_json
from factory.github_host import GitHubControl
from factory.revisions import (HELP_MARKER, RECEIPT_MARKER, Revisions,
                               RevisionQueueStopped, instruction)


NOW = "2026-11-28T13:01:00Z"
CUTOFF = "2026-11-28T13:00:00Z"
HEAD = "a" * 40
PR_URL = "https://github.com/chronoll/homupe/pull/33"
PR_API = "https://api.github.com/repos/chronoll/homupe/issues/33"


def comment(body="/factory fix\nUse a concise title.", comment_id=100):
    return {"id": comment_id, "body": body, "created_at": NOW, "updated_at": NOW,
            "issue_url": PR_API, "user": {"id": 7, "login": "chronoll", "type": "User",
                                            "avatar_url": "https://example.test/old-avatar"}}


def revision():
    return {"issue": 35, "pr": 33, "head_sha": HEAD, "comment_id": 100,
            "instructions": "Use a concise title."}


class FakeGitHub:
    def __init__(self):
        self.pr = {"number": 33, "state": "open", "merged_at": None,
            "html_url": PR_URL, "user": {"login": "chronoll"},
            "base": {"ref": "staging", "repo": {"full_name": "chronoll/homupe"}},
            "head": {"ref": "factory/issue-35", "sha": HEAD,
                     "repo": {"full_name": "chronoll/homupe"}}}
        self.original_issue = {"number": 35, "state": "open", "user": {"login": "chronoll"},
            "title": "Improve a page", "body": "Original task.",
            "labels": ["factory:ready"], "updated_at": NOW}
        self.comments = {}
        self.writes = []
        self.removed = []
        self.next_id = 1000

    def add(self, value):
        self.comments[value["id"]] = copy.deepcopy(value)
        return copy.deepcopy(value)

    def get(self, path):
        if path == "pulls/33":
            return copy.deepcopy(self.pr)
        if path.startswith("issues/comments/"):
            return copy.deepcopy(self.comments[int(path.rsplit("/", 1)[1])])
        raise AssertionError("unexpected fake GitHub get: " + path)

    def issue(self, number):
        if number == 33:
            return {"number": 33, "state": self.pr["state"], "pull_request": {"url": PR_URL},
                    "user": {"login": "chronoll"}}
        assert number == 35
        return copy.deepcopy(self.original_issue)

    def pages(self, path):
        if path.startswith("issues/comments?since="):
            return [copy.deepcopy(x) for x in self.comments.values()]
        assert path in {"issues/33/comments?per_page=100", "issues/35/comments?per_page=100"}
        number = path.split("/")[1]
        return [copy.deepcopy(x) for x in self.comments.values()
                if x["issue_url"].endswith("/" + number)]

    def write(self, path, value, method="POST"):
        assert path in {"issues/33/comments", "issues/35/comments"} and method == "POST"
        self.writes.append((path, copy.deepcopy(value), method))
        result = comment(value["body"], self.next_id)
        result["issue_url"] = PR_API.rsplit("/", 1)[0] + "/" + path.split("/")[1]
        self.next_id += 1
        return self.add(result)

    def remove_label(self, number, label):
        assert number == 35
        self.removed.append((number, label))
        self.original_issue["labels"] = [x for x in self.original_issue["labels"]
            if (x if isinstance(x, str) else x["name"]) != label]


class FakeFactory:
    def __init__(self, root):
        self.repo = root / "repo"
        self.repo.mkdir(parents=True)
        self.store = Store(root / "state")
        self.runtime = Mock()


class RevisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.factory = FakeFactory(self.root)
        self.store = self.factory.store
        self.github = FakeGitHub()
        self.revisions = Revisions(self.factory, self.github)
        self.store.claim(35, self.github.issue(35))
        self.store.save(35, "draft-pr", url=PR_URL, branch="factory/issue-35", head_sha=HEAD)

    def journal(self):
        return parse_json(self.revisions.path.read_bytes())

    def sync(self, comments):
        with self.store.lock():
            self.revisions.sync(comments, CUTOFF)

    def marked(self, marker, author="chronoll"):
        return [x for x in self.github.comments.values()
                if x["user"]["login"] == author and x["body"].startswith(marker)]

    def controls(self):
        self.factory.config = {"trusted_author": "chronoll", "repository": "chronoll/homupe"}
        self.factory._interrupted_jobs = Mock(return_value=[])
        self.factory.revisions = self.revisions
        control = GitHubControl(self.factory, self.github)
        data = control._load()
        control._write({**data, "installed_at": CUTOFF})
        return control

    def test_instruction_accepts_only_trusted_unedited_whole_body_fix_requests(self):
        self.assertEqual(instruction(comment()), "Use a concise title.")
        self.assertEqual(instruction(comment("/factory fix Use a concise title.")), "Use a concise title.")
        variants = [{"body": "> /factory fix Use a concise title."},
                    {"body": " /factory fix Use a concise title."},
                    {"body": "```\n/factory fix\nUse a concise title.\n```"},
                    {"body": "/factory fix"}, {"body": "/factory fix\n  "},
                    {"body": "/factory fix\r\nUse a concise title."},
                    {"body": "/factory fix " + "x" * 8000}, {"body": None},
                    {"user": {"login": "outsider", "type": "User"}},
                    {"user": {"login": "chronoll", "type": "Bot"}},
                    {"id": True}, {"id": 0}, {"updated_at": "2026-11-28T13:02:00Z"}]
        for variant in variants:
            with self.subTest(variant=variant):
                self.assertIsNone(instruction({**comment(), **variant}))

    def test_instruction_rejects_malformed_identity_and_timestamps(self):
        for variant in ({"user": None}, {"created_at": "not-a-date", "updated_at": "not-a-date"},
                        {"created_at": "", "updated_at": ""}):
            with self.subTest(variant=variant):
                self.assertIsNone(instruction({**comment(), **variant}))

    def test_validate_rejects_changed_closed_forked_or_unowned_pr(self):
        variants = [lambda pr: pr.update(state="closed"),
                    lambda pr: pr.update(merged_at=NOW),
                    lambda pr: pr.update(number=34),
                    lambda pr: pr["user"].update(login="outsider"),
                    lambda pr: pr["base"].update(ref="main"),
                    lambda pr: pr["base"]["repo"].update(full_name="outsider/homupe"),
                    lambda pr: pr["head"]["repo"].update(full_name="outsider/homupe"),
                    lambda pr: pr["head"].update(ref="factory/issue-36"),
                    lambda pr: pr["head"].update(sha="b" * 40)]
        original = copy.deepcopy(self.github.pr)
        for mutate in variants:
            self.github.pr = copy.deepcopy(original)
            mutate(self.github.pr)
            with self.subTest(pr=self.github.pr), self.assertRaises(Halt):
                self.revisions.validate(revision())
        self.assertEqual(self.github.writes, [])
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_validate_freezes_task_content_and_rejects_invalid_original_issue(self):
        frozen = self.github.issue(35)
        self.github.original_issue["updated_at"] = "2026-11-28T14:00:00Z"
        self.revisions.validate(revision(), frozen)
        self.github.original_issue["body"] = "Changed task."
        with self.assertRaisesRegex(Halt, "Issue changed"):
            self.revisions.validate(revision(), frozen)
        for variant in ({"state": "closed"}, {"user": {"login": "outsider"}},
                        {"pull_request": {"url": PR_URL}}):
            with self.subTest(variant=variant):
                self.github.original_issue = {**frozen, **variant}
                with self.assertRaises(Halt):
                    self.revisions.validate(revision())

    def test_queue_archives_old_attempt_and_preserves_new_revision_metadata(self):
        self.github.original_issue["body"] = "Latest Issue text."
        self.github.original_issue["labels"] += ["factory:needs-human", "custom"]
        result = self.revisions.queue(revision())
        self.assertEqual(result, {"issue": 35, "pr": 33, "phase": "revision-queued"})
        archives = list((self.store.root / "jobs").glob("35.attempt-*"))
        self.assertEqual(len(archives), 1)
        self.assertEqual(parse_json((archives[0] / "state.json").read_bytes())["phase"], "draft-pr")
        job = self.store.job(35)
        self.assertEqual(parse_json((job / "revision.json").read_bytes()), revision())
        self.assertEqual(parse_json((job / "issue.json").read_bytes())["body"], "Latest Issue text.")
        state = parse_json((job / "state.json").read_bytes())
        self.assertEqual((state["phase"], state["head_sha"], state["url"]), ("revision-queued", HEAD, PR_URL))
        self.assertIs(state["revision"], True)
        self.assertFalse(self.store.stopped())
        self.assertEqual(self.github.removed, [(35, "factory:needs-human")])
        self.assertIn("custom", self.github.original_issue["labels"])
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_queue_rejects_an_active_wrong_pr_or_stale_local_head_before_archiving(self):
        path = self.store.job(35) / "state.json"
        original = parse_json(path.read_bytes())
        for variant in ({"phase": "implementing"}, {"url": "https://github.com/chronoll/homupe/pull/44"},
                        {"head_sha": "b" * 40}):
            with self.subTest(variant=variant):
                atomic_json(path, {**original, **variant})
                with self.assertRaises(Halt):
                    self.revisions.queue(revision())
                self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])
                self.assertFalse(self.store.stopped())
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_sync_accepts_avatar_changes_but_not_a_different_user_identity(self):
        listed = self.github.add(comment())
        self.github.comments[100]["user"]["avatar_url"] = "https://example.test/new-avatar"
        self.sync([listed])
        self.assertEqual(self.journal()["commands"]["100"]["status"], "done")
        self.assertEqual(parse_json((self.store.job(35) / "revision.json").read_bytes())["instructions"], "Use a concise title.")

    def test_fresh_fix_inherits_human_updated_head_and_preserves_the_previous_attempt(self):
        changed_head = "b" * 40
        self.github.pr["head"]["sha"] = changed_head
        listed = self.github.add(comment("/factory fix\nKeep my conflict resolution and shorten the title."))
        self.sync([listed])
        self.assertEqual(self.journal()["commands"]["100"]["status"], "done")
        job = self.store.job(35)
        queued = parse_json((job / "revision.json").read_bytes())
        self.assertEqual(queued["head_sha"], changed_head)
        self.assertEqual(queued["instructions"], "Keep my conflict resolution and shorten the title.")
        self.assertEqual(parse_json((job / "state.json").read_bytes())["head_sha"], changed_head)
        archives = list((self.store.root / "jobs").glob("35.attempt-*"))
        self.assertEqual(len(archives), 1)
        self.assertEqual(parse_json((archives[0] / "state.json").read_bytes())["head_sha"], HEAD)
        self.assertFalse(self.store.stopped())
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_fresh_fix_of_a_held_revision_uses_current_remote_head_not_unpublished_candidate(self):
        job = self.store.job(35)
        atomic_json(job / "revision.json", revision())
        self.store.save(35, "needs-human", head_sha="c" * 40)
        self.github.pr["head"]["sha"] = "b" * 40
        listed = self.github.add(comment("/factory fix\nUse the updated PR as the starting point."))
        self.sync([listed])
        self.assertEqual(self.journal()["commands"]["100"]["status"], "done")
        queued = parse_json((job / "revision.json").read_bytes())
        self.assertEqual(queued["head_sha"], "b" * 40)
        self.assertEqual(queued["instructions"], "Use the updated PR as the starting point.")
        archive = next((self.store.root / "jobs").glob("35.attempt-*"))
        self.assertEqual(parse_json((archive / "revision.json").read_bytes())["head_sha"], HEAD)
        self.assertEqual(parse_json((archive / "state.json").read_bytes())["head_sha"], "c" * 40)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_earlier_fix_cannot_clear_a_later_stop_in_the_same_tick(self):
        control = self.controls()
        self.github.add(comment(comment_id=100))
        stop = comment("/factory stop", comment_id=101)
        stop["issue_url"] = PR_API.rsplit("/", 1)[0] + "/35"
        self.github.add(stop)
        with self.store.lock(), patch.object(control, "publish"):
            control.commands()
        self.assertTrue(self.store.stopped())
        self.assertEqual(self.journal()["commands"]["100"]["status"], "failed")
        receipt = self.marked(RECEIPT_MARKER + "100 -->")
        self.assertEqual(len(receipt), 1)
        self.assertIn("/factory resume", receipt[0]["body"])
        self.assertIn("35", receipt[0]["body"])
        self.assertEqual(control._load()["cursor"]["comments"]["101"]["status"], "done")
        self.assertEqual(parse_json((self.store.job(35) / "state.json").read_bytes())["phase"], "draft-pr")
        self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_stopped_fix_requires_explicit_resume_then_a_new_fix_comment(self):
        control = self.controls()
        self.store.stop()
        self.github.add(comment(comment_id=100))
        with self.store.lock(), patch.object(control, "publish"):
            control.commands()
        self.assertTrue(self.store.stopped())
        self.assertEqual(self.journal()["commands"]["100"]["status"], "failed")
        self.assertIn("/factory resume", self.marked(RECEIPT_MARKER + "100 -->")[0]["body"])
        self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])

        resume = comment("/factory resume", comment_id=101)
        resume["issue_url"] = PR_API.rsplit("/", 1)[0] + "/35"
        self.github.add(resume)
        with self.store.lock(), patch.object(control, "publish"):
            control.commands()
        self.assertFalse(self.store.stopped())
        self.assertEqual(self.journal()["commands"]["100"]["status"], "failed")
        self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])

        self.github.add(comment("/factory fix\nStart this newly requested revision.", comment_id=102))
        with self.store.lock(), patch.object(control, "publish"):
            control.commands()
        self.assertFalse(self.store.stopped())
        self.assertEqual(self.journal()["commands"]["100"]["status"], "failed")
        self.assertEqual(self.journal()["commands"]["102"]["status"], "done")
        queued = parse_json((self.store.job(35) / "revision.json").read_bytes())
        self.assertEqual((queued["comment_id"], queued["instructions"]),
                         (102, "Start this newly requested revision."))
        self.assertEqual(len(list((self.store.root / "jobs").glob("35.attempt-*"))), 1)
        self.assertEqual(len(self.marked(RECEIPT_MARKER + "100 -->")), 1)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_retry_cannot_accept_a_changed_remote_head_without_a_new_fix_instruction(self):
        job = self.store.job(35)
        atomic_json(job / "revision.json", revision())
        self.store.save(35, "needs-human", head_sha="c" * 40)
        self.store.stop()
        self.github.pr["head"]["sha"] = "b" * 40
        with self.assertRaisesRegex(Halt, "PR changed"):
            self.revisions.retry(35)
        self.assertEqual(parse_json((job / "revision.json").read_bytes()), revision())
        self.assertEqual(parse_json((job / "state.json").read_bytes())["phase"], "needs-human")
        self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])
        self.assertTrue(self.store.stopped())
        self.assertEqual(self.github.writes, [])
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_fresh_fix_still_rejects_active_jobs_and_a_different_owned_pr(self):
        path = self.store.job(35) / "state.json"
        original = parse_json(path.read_bytes())
        self.github.pr["head"]["sha"] = "b" * 40
        fresh = {**revision(), "head_sha": "b" * 40}
        for variant in ({"phase": "implementing"}, {"url": "https://github.com/chronoll/homupe/pull/44"}):
            with self.subTest(variant=variant):
                atomic_json(path, {**original, **variant})
                with self.assertRaises(Halt):
                    self.revisions.queue(fresh, fresh_request=True)
                self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])
                self.assertFalse(self.store.stopped())

    def test_new_user_id_edited_comment_and_old_cutoff_are_not_queued(self):
        listed = self.github.add(comment())
        self.github.comments[100]["user"]["id"] = 8
        self.sync([listed])
        self.assertEqual(self.revisions.load()["commands"], {})
        self.github.comments[100] = copy.deepcopy(listed)
        self.github.comments[100]["body"] = "/factory fix Different instructions."
        self.sync([listed])
        self.assertEqual(self.revisions.load()["commands"], {})
        old = comment(comment_id=101)
        old.update(created_at="2026-11-28T12:59:59Z", updated_at="2026-11-28T12:59:59Z")
        self.github.add(old)
        self.sync([old])
        self.assertEqual(self.revisions.load()["commands"], {})
        self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])

    def test_fix_on_an_ordinary_issue_is_not_interpreted_as_a_pr_request(self):
        listed = comment()
        listed["issue_url"] = "https://api.github.com/repos/chronoll/homupe/issues/35"
        self.github.add(listed)
        self.sync([listed])
        self.assertEqual(self.revisions.load()["commands"], {})
        self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_known_comment_cannot_requeue_after_replay_or_edit(self):
        listed = self.github.add(comment())
        self.sync([listed])
        self.github.comments[100]["body"] = "/factory fix New text under an old comment."
        self.github.comments[100]["updated_at"] = "2026-11-28T13:02:00Z"
        self.sync([listed, copy.deepcopy(self.github.comments[100])])
        self.assertEqual(len(list((self.store.root / "jobs").glob("35.attempt-*"))), 1)
        self.assertEqual(len(self.marked(RECEIPT_MARKER + "100")), 1)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_claim_is_durable_before_queue_and_crash_never_reexecutes_it(self):
        class Crash(BaseException):
            pass
        listed = self.github.add(comment())
        def crash(_revision, fresh_request=False):
            self.assertTrue(fresh_request)
            self.assertEqual(self.journal()["commands"]["100"]["status"], "claimed")
            raise Crash()
        with patch.object(self.revisions, "queue", side_effect=crash):
            with self.assertRaises(Crash):
                self.sync([listed])
        restarted = Revisions(self.factory, self.github)
        with patch.object(restarted, "queue") as queue:
            restarted.sync([listed], CUTOFF)
            restarted.sync([listed], CUTOFF)
            queue.assert_not_called()
        self.assertEqual(len(self.marked(RECEIPT_MARKER + "100")), 1)
        self.assertEqual(list((self.store.root / "jobs").glob("35.attempt-*")), [])

    def test_help_and_receipt_only_target_the_same_pr_and_are_idempotent(self):
        forged = comment(HELP_MARKER + "\nForged help", comment_id=200)
        forged["user"]["login"] = "outsider"
        self.github.add(forged)
        self.revisions.help()
        self.revisions.help()
        self.assertEqual(len(self.marked(HELP_MARKER)), 1)
        listed = self.github.add(comment())
        self.sync([listed])
        self.sync([listed])
        self.assertEqual(len(self.marked(RECEIPT_MARKER + "100")), 1)
        self.assertTrue(all(path == "issues/33/comments" for path, _value, _method in self.github.writes))

    def test_help_does_not_advertise_controls_on_closed_merged_or_stale_prs(self):
        original = copy.deepcopy(self.github.pr)
        variants = [lambda pr: pr.update(state="closed"),
                    lambda pr: pr.update(merged_at=NOW),
                    lambda pr: pr["head"].update(sha="b" * 40),
                    lambda pr: pr["head"]["repo"].update(full_name="outsider/homupe")]
        for mutate in variants:
            self.github.pr = copy.deepcopy(original)
            mutate(self.github.pr)
            with self.subTest(pr=self.github.pr):
                self.revisions.help()
                self.assertEqual(self.github.writes, [])
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_one_failed_receipt_does_not_block_new_commands_other_receipts_or_help(self):
        atomic_json(self.revisions.path, {"version": 1, "commands": {"99": {
            "comment_id": 99, "pr": 33, "issue": 35, "status": "done",
            "body_sha": "0" * 64, "message": "Previously accepted request."}}})
        listed = self.github.add(comment())
        failed = []
        real_write = self.github.write
        def write(path, value, method="POST"):
            if value.get("body", "").startswith(RECEIPT_MARKER + "99 -->"):
                failed.append(path)
                raise Halt("fake receipt unavailable")
            return real_write(path, value, method)
        with patch.object(self.github, "write", side_effect=write), \
                patch.object(self.revisions, "queue", wraps=self.revisions.queue) as queue, \
                patch.object(self.revisions, "help", wraps=self.revisions.help) as help_projection:
            self.sync([listed])
            self.sync([listed])
        queue.assert_called_once()
        self.assertEqual(help_projection.call_count, 2)
        self.assertEqual(len(failed), 2)
        self.assertEqual(self.journal()["commands"]["100"]["status"], "done")
        self.assertEqual(len(self.marked(RECEIPT_MARKER + "100 -->")), 1)
        self.assertEqual(len(list((self.store.root / "jobs").glob("35.attempt-*"))), 1)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_optional_help_failure_never_replays_a_committed_request(self):
        listed = self.github.add(comment())
        with patch.object(self.revisions, "help", side_effect=Halt("fake help unavailable")), \
                patch.object(self.revisions, "queue", wraps=self.revisions.queue) as queue:
            self.sync([listed])
            self.sync([listed])
        queue.assert_called_once()
        self.assertEqual(self.journal()["commands"]["100"]["status"], "done")
        self.assertEqual(len(self.marked(RECEIPT_MARKER + "100 -->")), 1)
        self.assertEqual(len(list((self.store.root / "jobs").glob("35.attempt-*"))), 1)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_committed_queue_is_not_reported_rejected_when_label_write_fails(self):
        self.github.original_issue['labels'].append('factory:needs-human')
        listed = self.github.add(comment())
        with patch.object(self.github, 'remove_label', side_effect=Halt('label unavailable')):
            self.sync([listed])
        record = self.journal()['commands']['100']
        self.assertEqual(record['status'], 'done')
        self.assertIn('受付記録を保存', record['message'])
        self.assertNotIn('開始できません', record['message'])
        self.assertTrue(self.store.stopped())
        self.sync([listed])
        self.assertFalse(self.store.stopped())
        self.assertEqual(len(list((self.store.root / 'jobs').glob('35.attempt-*'))), 1)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_recover_rolls_back_a_crash_before_new_state_is_committed(self):
        class Crash(BaseException):
            pass
        with patch.object(self.store, "save", side_effect=Crash):
            with self.assertRaises(Crash):
                self.revisions.queue(revision())
        self.assertTrue(self.store.stopped())
        self.revisions.recover()
        state = parse_json((self.store.job(35) / "state.json").read_bytes())
        self.assertEqual(state["phase"], "draft-pr")
        self.assertTrue(self.store.stopped())
        self.assertEqual(len(list((self.store.root / "jobs").glob("35.partial-revision-*"))), 1)
        self.assertEqual(list((self.store.root / "revision-intents").glob("*.json")), [])

    def test_recover_commits_a_fully_queued_revision_without_losing_the_old_attempt(self):
        class Crash(BaseException):
            pass
        with patch.object(self.revisions, "_repair_paths", side_effect=Crash):
            with self.assertRaises(Crash):
                self.revisions.queue(revision())
        self.assertTrue(self.store.stopped())
        self.revisions.recover()
        self.assertFalse(self.store.stopped())
        self.assertEqual(parse_json((self.store.job(35) / "revision.json").read_bytes()), revision())
        self.assertEqual(len(list((self.store.root / "jobs").glob("35.attempt-*"))), 1)

    def test_new_stop_during_queue_is_not_cleared_by_recovery(self):
        def stop_again(_archive):
            stop = self.store.root / "STOP"
            current = stop.stat().st_mtime_ns
            os.utime(stop, ns=(current + 1_000_000, current + 1_000_000))
        with patch.object(self.revisions, "_repair_paths", side_effect=stop_again):
            self.revisions.queue(revision())
        self.assertTrue(self.store.stopped())
        self.assertEqual(parse_json((self.store.job(35) / "state.json").read_bytes())["phase"], "revision-queued")

    def test_new_stop_during_validation_rejects_fresh_fix_and_is_preserved_by_retry(self):
        for fresh_request, previous_stop in ((True, False), (False, False), (False, True)):
            with self.subTest(fresh_request=fresh_request, previous_stop=previous_stop):
                root = self.root / ("validate-stop-%s-%s" % (fresh_request, previous_stop))
                factory = FakeFactory(root)
                github = FakeGitHub()
                revisions = Revisions(factory, github)
                store = factory.store
                store.claim(35, github.issue(35))
                phase = "draft-pr" if fresh_request else "needs-human"
                store.save(35, phase, url=PR_URL, branch="factory/issue-35", head_sha=HEAD)
                if not fresh_request:
                    atomic_json(store.job(35) / "revision.json", revision())
                if previous_stop:
                    store.stop()
                validate = revisions.validate
                stops = []
                def stop_during_validation(request, issue=None):
                    result = validate(request, issue)
                    store.stop()
                    stop = store.root / "STOP"
                    stamp = stop.stat().st_mtime_ns + 1_000_000
                    os.utime(stop, ns=(stamp, stamp))
                    stops.append(stamp)
                    return result
                with store.lock(), patch.object(revisions, "validate", side_effect=stop_during_validation):
                    if fresh_request:
                        with self.assertRaises(RevisionQueueStopped):
                            revisions.queue(revision(), fresh_request=True)
                    else:
                        self.assertEqual(revisions.retry(35)["phase"], "revision-queued")
                self.assertEqual(len(stops), 1)
                self.assertTrue(store.stopped())
                self.assertEqual((store.root / "STOP").stat().st_mtime_ns, stops[0])
                state = parse_json((store.job(35) / "state.json").read_bytes())
                self.assertEqual(state["phase"], "draft-pr" if fresh_request else "revision-queued")
                self.assertEqual(len(list((store.root / "jobs").glob("35.attempt-*"))),
                                 0 if fresh_request else 1)
                self.assertEqual(list(store.root.glob(".revision-stop-*")), [])
                self.assertEqual(list((store.root / "revision-intents").glob("*.json")), [])
                self.assertEqual(factory.runtime.mock_calls, [])
                self.assertEqual(github.writes, [])

    def test_issue_retry_preserves_a_new_stop_after_revision_queue_recovery(self):
        self.factory.config = {"trusted_author": "chronoll"}
        self.factory._interrupted_jobs = Mock(return_value=[])
        self.factory.revisions = self.revisions
        atomic_json(self.store.job(35) / "revision.json", revision())
        self.store.save(35, "needs-human", head_sha="c" * 40)
        control = GitHubControl(self.factory, self.github)
        stops = []
        def stop_again(_archive):
            stop = self.store.root / "STOP"
            current = stop.stat().st_mtime_ns
            os.utime(stop, ns=(current + 1_000_000, current + 1_000_000))
            stops.append(stop.stat().st_mtime_ns)
        with self.store.lock(), patch.object(self.revisions, "_repair_paths", side_effect=stop_again):
            message = control._act(35, "retry", in_run=False)
        self.assertIn("再試行を受け付け", message)
        self.assertTrue(stops)
        self.assertTrue(self.store.stopped(), "Issue retry erased a newer independent STOP")
        self.assertEqual((self.store.root / "STOP").stat().st_mtime_ns, stops[-1])
        self.assertEqual(parse_json((self.store.job(35) / "state.json").read_bytes())["phase"], "revision-queued")
        self.assertEqual(len(list((self.store.root / "jobs").glob("35.attempt-*"))), 1)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def prepare_partial(self, state):
        job = self.store.job(35)
        archive = job.with_name("35.attempt-123")
        job.rename(archive)
        job.mkdir()
        atomic_json(job / "issue.json", self.github.issue(35))
        atomic_json(job / "revision.json", revision())
        if isinstance(state, bytes):
            (job / "state.json").write_bytes(state)
        else:
            atomic_json(job / "state.json", state)
        self.store.stop()
        intent = self.store.root / "revision-intents/35.json"
        atomic_json(intent, {"issue": 35, "archive": archive.name, "comment_id": 100,
                            "stop_mtime_ns": (self.store.root / "STOP").stat().st_mtime_ns})
        return archive, intent

    def test_invalid_partial_job_metadata_cannot_be_committed_or_release_stop(self):
        archive, intent = self.prepare_partial({"version": 1, "issue": 999, "phase": "revision-queued",
                                               "head_sha": HEAD, "url": PR_URL})
        try:
            self.revisions.recover()
        except Halt:
            self.assertTrue(self.store.stopped())
            self.assertTrue(archive.exists())
            self.assertTrue(intent.exists())
            return
        self.assertTrue(self.store.stopped(), "invalid partial job released STOP")
        state = parse_json((self.store.job(35) / "state.json").read_bytes())
        self.assertNotEqual(state.get("phase"), "revision-queued", "invalid metadata was treated as committed")

    def test_corrupt_partial_job_preserves_recovery_evidence_and_stop(self):
        archive, intent = self.prepare_partial(b'{"phase":')
        with self.assertRaises(Halt):
            self.revisions.recover()
        self.assertTrue(self.store.stopped())
        self.assertTrue(archive.exists())
        self.assertTrue(intent.exists())

    def test_missing_frozen_issue_rolls_back_incomplete_revision_without_releasing_stop(self):
        archive, intent = self.prepare_partial({
            "version": 1, "issue": 35, "phase": "revision-queued", "revision": True,
            "head_sha": HEAD, "url": PR_URL, "branch": "factory/issue-35"})
        (self.store.job(35) / "issue.json").unlink()
        data = parse_json(intent.read_bytes())
        atomic_json(intent, {**data, "pr": 33, "head_sha": HEAD})
        self.revisions.recover()
        self.assertTrue(self.store.stopped())
        self.assertFalse(archive.exists())
        self.assertFalse(intent.exists())
        self.assertEqual(parse_json((self.store.job(35) / "state.json").read_bytes())["phase"], "draft-pr")
        partial = next((self.store.root / "jobs").glob("35.partial-revision-*"))
        self.assertEqual(parse_json((partial / "state.json").read_bytes())["phase"], "revision-queued")


if __name__ == "__main__":
    unittest.main()
