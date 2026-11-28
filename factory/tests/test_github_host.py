"""Parent GitHub controls with in-memory API responses; no API or models run."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import tempfile
from urllib.parse import quote, unquote
import unittest
from unittest.mock import Mock, patch

from factory.core import Halt, Store, atomic_json, parse_json
from factory.dispatcher import Factory, GitHub, issue_fingerprint
from factory.github_control import STATUS_MARKER
from factory.github_host import EVENT_MARKER, RECEIPT_MARKER, GitHubControl


CUTOFF = "2026-11-28T00:00:00Z"
CURRENT = "2026-11-28T00:01:00Z"
ISSUE_URL = "https://api.github.com/repos/chronoll/homupe/issues/42"


def issue():
    return {"number": 42, "state": "open", "user": {"login": "chronoll"},
            "labels": [{"name": "factory:ready"}], "title": "Clarify a page",
            "body": "Explain the existing behavior.", "updated_at": CUTOFF}


class FakeGitHub:
    """A write mutates remote JSON first, then can lose its response."""
    def __init__(self):
        self.current_issue = issue()
        self.comments = {}
        self.listed_overrides = {}
        self.next_id = 1000
        self.writes = []
        self.reads = []
        self.prs = []
        self.refs = []
        self.ambiguous_marker = None
        self.relay_present = True
        self.relay_active = True

    def add(self, body, number=42, author="chronoll", comment_id=None,
            created=CURRENT, updated=None):
        comment_id = self.next_id if comment_id is None else comment_id
        self.next_id = max(self.next_id, comment_id + 1)
        comment = {"id": comment_id, "body": body, "user": {"login": author, "type": "User"},
                   "created_at": created, "updated_at": updated or created,
                   "issue_url": ISSUE_URL.rsplit("/", 1)[0] + "/" + str(number)}
        self.comments[comment_id] = comment
        return copy.deepcopy(comment)

    def issue(self, number):
        self.reads.append(("issue", number))
        if number != 42:
            raise Halt("unknown fake Issue")
        return copy.deepcopy(self.current_issue)

    def pending(self):
        return [copy.deepcopy(self.current_issue)]

    def remove_label(self, number, name):
        return self.write("issues/%s/labels/" % number + quote(name, safe=""), {}, "DELETE")

    def pages(self, path):
        self.reads.append(("pages", path))
        if path.startswith("issues/comments?since="):
            return [copy.deepcopy(self.listed_overrides.get(key, value))
                    for key, value in self.comments.items()]
        if path == "issues/42/comments?per_page=100":
            return [copy.deepcopy(value) for value in self.comments.values()
                    if value["issue_url"] == ISSUE_URL]
        raise AssertionError("unexpected fake pages: " + path)

    def get(self, path):
        self.reads.append(("get", path))
        if path == "contents/.github/workflows/factory-notify.yml?ref=main":
            if not self.relay_present:
                raise Halt("fake notification relay is not installed on main")
            return {"type": "file"}
        if path == "actions/workflows/factory-notify.yml":
            return {"state": "active" if self.relay_active else "disabled_manually"}
        if path.startswith("issues/comments/"):
            return copy.deepcopy(self.comments[int(path.rsplit("/", 1)[1])])
        if path.startswith("pulls?state=all&head=chronoll:factory/issue-42"):
            return copy.deepcopy(self.prs)
        if path == "git/matching-refs/heads/factory/issue-42":
            return copy.deepcopy(self.refs)
        raise AssertionError("unexpected fake get: " + path)

    def write(self, path, value, method="POST"):
        self.writes.append((path, copy.deepcopy(value), method))
        if path == "issues/42/comments" and method == "POST":
            result = self.add(value["body"])
        elif path.startswith("issues/comments/") and method == "PATCH":
            comment_id = int(path.rsplit("/", 1)[1])
            self.comments[comment_id].update(copy.deepcopy(value))
            result = copy.deepcopy(self.comments[comment_id])
        elif path == "issues/42" and method == "PATCH":
            self.current_issue.update(copy.deepcopy(value))
            result = copy.deepcopy(self.current_issue)
        elif path == "issues/42/labels" and method == "POST":
            existing = {x if isinstance(x, str) else x["name"] for x in self.current_issue["labels"]}
            self.current_issue["labels"] = sorted(existing | set(value["labels"]))
            result = copy.deepcopy(self.current_issue["labels"])
        elif path.startswith("issues/42/labels/") and method == "DELETE":
            label = unquote(path[len("issues/42/labels/"):])
            self.current_issue["labels"] = [x for x in self.current_issue["labels"]
                if (x if isinstance(x, str) else x["name"]) != label]
            result = copy.deepcopy(self.current_issue["labels"])
        else:
            raise AssertionError("unexpected fake write: " + repr((path, value, method)))
        self.current_issue["updated_at"] = "2026-11-28T00:02:00Z"
        if self.ambiguous_marker and value.get("body", "").startswith(self.ambiguous_marker):
            self.ambiguous_marker = None
            raise Halt("remote response was lost after applying the write")
        return result

    def marked(self, marker, author=None):
        return [item for item in self.comments.values() if item["body"].startswith(marker)
                and (author is None or item["user"]["login"] == author)]


class FakeFactory:
    def __init__(self, root):
        self.repo = root / "repo"
        self.repo.mkdir(parents=True)
        self.store = Store(root / "state")
        self.config = {"repository": "chronoll/homupe", "trusted_author": "chronoll"}
        self.runtime = Mock()
        self._interrupted_jobs = Mock(return_value=[])
        self.control = None


class GitHubHostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        fixed_stamp = patch("factory.github_host.stamp", return_value=CUTOFF)
        fixed_stamp.start()
        self.addCleanup(fixed_stamp.stop)
        self.factory, self.github, self.control = self.system(self.root)

    def system(self, root):
        factory, github = FakeFactory(root), FakeGitHub()
        control = GitHubControl(factory, github)
        factory.control = control
        control._load()  # Persist installation cutoff before incoming commands.
        return factory, github, control

    def sync(self):
        return Factory.sync_controls(self.factory)

    def journal(self):
        return parse_json(self.control.path.read_bytes())

    def held_job(self, review_round=1):
        self.factory.store.claim(42, issue())
        self.factory.store.save(42, "needs-human", review_round=review_round,
                                reason="Review still needs a technical fix.")
        self.factory.store.stop()

    def assert_no_models(self):
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_status_sync_works_while_stop_is_set_without_starting_models(self):
        self.factory.store.stop()
        command = self.github.add("/factory status", comment_id=10)
        result = self.sync()
        self.assertTrue(result["stopped"])
        self.assertTrue(self.factory.store.stopped())
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "done")
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + str(command["id"]))), 1)
        self.assertEqual(len(self.github.marked(STATUS_MARKER + "\n", "chronoll")), 1)
        self.assertIn("STOP", self.github.marked(STATUS_MARKER)[0]["body"])
        self.assert_no_models()

    def test_resume_clears_stop_but_retains_held_jobs(self):
        self.held_job()
        self.github.add("/factory resume", comment_id=10)
        self.assertFalse(self.sync()["stopped"])
        state = parse_json((self.factory.store.job(42) / "state.json").read_bytes())
        self.assertEqual(state["phase"], "needs-human")
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "done")
        self.assert_no_models()

    def test_retry_archives_the_held_attempt_and_latest_review_before_resume(self):
        self.held_job(review_round=2)
        first = {"verdict": "changes", "summary": "Old review", "findings": []}
        latest = {"verdict": "changes", "summary": "Latest technical review", "findings": []}
        atomic_json(self.factory.store.job(42) / "review.json", first)
        atomic_json(self.factory.store.job(42) / "repair-1/review.json", latest)
        self.github.current_issue["labels"] += ["factory:needs-human", "factory:skip", "custom"]
        self.github.current_issue["body"] = "The user's current task text."
        self.github.add("/factory retry", comment_id=10)
        self.sync()
        self.assertFalse(self.factory.store.stopped())
        self.assertFalse(self.factory.store.job(42).exists())
        archives = list((self.factory.store.root / "jobs").glob("42.attempt-*"))
        self.assertEqual(len(archives), 1)
        self.assertEqual(parse_json((archives[0] / "state.json").read_bytes())["phase"], "needs-human")
        feedback = parse_json((self.factory.store.root / "retry-context/42.json").read_bytes())
        self.assertEqual(feedback, latest)
        labels = {x if isinstance(x, str) else x["name"] for x in self.github.current_issue["labels"]}
        self.assertEqual(labels, {"factory:ready", "factory:skip", "custom"})
        self.assertEqual(self.github.current_issue["body"], "The user's current task text.")
        self.assert_no_models()

    def test_retry_refuses_open_or_merged_pr_and_exact_existing_branch(self):
        variants = [([{"state": "open", "merged_at": None}], []),
                    ([{"state": "closed", "merged_at": CURRENT}], []),
                    ([], [{"ref": "refs/heads/factory/issue-42"}])]
        for index, (prs, refs) in enumerate(variants):
            with self.subTest(index=index):
                factory, github, control = self.system(self.root / str(index))
                factory.store.claim(42, issue())
                factory.store.save(42, "needs-human")
                factory.store.stop()
                github.prs, github.refs = prs, refs
                github.add("/factory retry", comment_id=10)
                Factory.sync_controls(factory)
                self.assertTrue(factory.store.stopped())
                self.assertTrue(factory.store.job(42).exists())
                cursor = parse_json(control.path.read_bytes())["cursor"]
                self.assertEqual(cursor["comments"]["10"]["status"], "failed")
                self.assertEqual(list((factory.store.root / "jobs").glob("42.attempt-*")), [])
                self.assertEqual(factory.runtime.mock_calls, [])

    def test_closed_unmerged_pr_and_different_branch_do_not_prevent_explicit_retry(self):
        self.held_job()
        self.github.prs = [{"state": "closed", "merged_at": None}]
        self.github.refs = [{"ref": "refs/heads/factory/issue-42-unrelated"}]
        self.github.add("/factory retry", comment_id=10)
        self.sync()
        self.assertFalse(self.factory.store.job(42).exists())
        self.assertFalse(self.factory.store.stopped())
        self.assert_no_models()

    def test_only_exact_trusted_never_edited_commands_after_cutoff_are_accepted(self):
        rejected = [("/factory stop", "outsider", CURRENT, CURRENT),
                    ("> /factory stop", "chronoll", CURRENT, CURRENT),
                    ("/factory stop\n", "chronoll", CURRENT, CURRENT),
                    (" /factory stop", "chronoll", CURRENT, CURRENT),
                    ("```\n/factory stop\n```", "chronoll", CURRENT, CURRENT),
                    ("/factory stop", "chronoll", CURRENT, "2026-11-28T00:03:00Z"),
                    ("/factory stop", "chronoll", "2026-11-27T23:59:59Z", "2026-11-27T23:59:59Z")]
        for index, (body, author, created, updated) in enumerate(rejected):
            self.github.add(body, author=author, created=created, updated=updated, comment_id=index + 1)
        self.sync()
        self.assertFalse(self.factory.store.stopped())
        self.assertEqual(self.journal()["cursor"]["comments"], {})
        self.assertEqual(self.github.writes, [])
        self.assert_no_models()

    def test_fresh_read_rejects_a_command_edited_after_listing(self):
        original = self.github.add("/factory stop", comment_id=10)
        self.github.listed_overrides[10] = original
        self.github.comments[10]["body"] = "/factory resume"
        self.github.comments[10]["updated_at"] = "2026-11-28T00:02:00Z"
        self.sync()
        self.assertEqual(self.journal()["cursor"]["comments"], {})
        self.assertFalse(self.factory.store.stopped())
        self.assert_no_models()

    def test_commands_reject_closed_untrusted_pr_or_unrelated_issue_targets(self):
        self.github.add("/factory stop", comment_id=10)
        variants = [{"state": "closed"}, {"user": {"login": "outsider"}},
                    {"pull_request": {"url": "https://api.github.com/fake"}}, {"labels": []}]
        for variant in variants:
            with self.subTest(variant=variant):
                self.github.current_issue = {**issue(), **variant}
                self.sync()
                self.assertEqual(self.journal()["cursor"]["comments"], {})
                self.assertFalse(self.factory.store.stopped())
                self.assertEqual(self.github.writes, [])
        self.assert_no_models()

    def test_in_run_retry_and_resume_are_claimed_but_cannot_release_the_queue(self):
        self.held_job()
        self.github.add("/factory retry", comment_id=10)
        self.github.add("/factory resume", comment_id=11)
        with self.factory.store.lock():
            self.control.commands(in_run=True)
        self.assertTrue(self.factory.store.stopped())
        self.assertTrue(self.factory.store.job(42).exists())
        receipts = self.journal()["cursor"]["comments"]
        self.assertEqual([receipts[key]["status"] for key in ("10", "11")], ["failed", "failed"])
        self.assertEqual(list((self.factory.store.root / "jobs").glob("42.attempt-*")), [])
        self.factory._interrupted_jobs.assert_not_called()
        self.assert_no_models()

    def test_known_command_id_is_not_replayed_even_when_edited_to_resume(self):
        self.github.add("/factory stop", comment_id=10)
        self.sync()
        self.assertTrue(self.factory.store.stopped())
        self.github.comments[10]["body"] = "/factory resume"
        self.github.comments[10]["updated_at"] = "2026-11-28T00:02:00Z"
        self.sync()
        self.assertTrue(self.factory.store.stopped())
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10")), 1)
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["command"], "stop")
        self.assert_no_models()

    def test_durable_claim_precedes_action_failure_and_is_not_repeated(self):
        self.github.add("/factory stop", comment_id=10)
        def fail(*_args):
            self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "claimed")
            raise Halt("controlled action failure")
        with patch.object(self.control, "_act", side_effect=fail) as action:
            self.sync()
            self.sync()
            action.assert_called_once()
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "failed")
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10")), 1)
        self.assert_no_models()

    def test_crash_after_claim_is_uncertain_on_restart_and_never_reexecuted(self):
        class Crash(BaseException):
            pass
        self.github.add("/factory stop", comment_id=10)
        with patch.object(self.control, "_act", side_effect=Crash):
            with self.assertRaises(Crash):
                self.sync()
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "claimed")
        restarted = GitHubControl(self.factory, self.github)
        self.factory.control = restarted
        with patch.object(restarted, "_act") as action:
            self.sync()
            self.sync()
            action.assert_not_called()
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "uncertain")
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10")), 1)
        self.assert_no_models()

    def test_lost_status_response_reconciles_existing_marker_without_duplicate(self):
        self.held_job()
        self.github.ambiguous_marker = STATUS_MARKER
        self.control.publish(42)
        self.assertEqual(len(self.github.marked(STATUS_MARKER, "chronoll")), 1)
        self.sync()
        self.assertEqual(len(self.github.marked(STATUS_MARKER, "chronoll")), 1)
        self.assertEqual(len(self.github.marked(EVENT_MARKER, "chronoll")), 1)
        self.assertTrue(all(event["sent"] is False for event in self.journal()["events"].values()))
        self.assert_no_models()

    def test_lost_event_response_keeps_outbox_then_reconciles_without_duplicate(self):
        self.held_job()
        self.github.ambiguous_marker = EVENT_MARKER
        self.control.publish(42)
        self.assertEqual(len(self.github.marked(EVENT_MARKER, "chronoll")), 1)
        self.assertEqual([event["sent"] for event in self.journal()["events"].values()], [False])
        self.sync()
        self.assertEqual(len(self.github.marked(EVENT_MARKER, "chronoll")), 1)
        self.assertEqual([event["sent"] for event in self.journal()["events"].values()], [False])
        payload = json.loads(self.github.marked(EVENT_MARKER, "chronoll")[0]["body"].split("\n", 1)[1])
        ack = self.github.add("<!-- homupe-factory-notify:v1:" + payload["key"] + " -->\nDelivered",
                              author="github-actions[bot]")
        self.github.comments[ack["id"]]["user"]["type"] = "Bot"
        self.control.flush()
        self.assertEqual([event["sent"] for event in self.journal()["events"].values()], [True])
        self.assert_no_models()

    def test_other_authors_cannot_spoof_owned_status_or_event_markers(self):
        self.held_job()
        self.github.add(STATUS_MARKER + "\nForged status", author="outsider")
        self.control.publish(42)
        self.assertEqual(len(self.github.marked(STATUS_MARKER, "chronoll")), 1)
        event = self.github.marked(EVENT_MARKER, "chronoll")[0]
        del self.github.comments[event["id"]]
        self.github.add(event["body"], author="outsider")
        value = self.journal()
        for pending in value["events"].values():
            pending["sent"] = False
            pending["submitted_at"] = 0
        atomic_json(self.control.path, value)
        self.control.flush()
        self.assertEqual(len(self.github.marked(EVENT_MARKER, "chronoll")), 1)
        self.assertEqual(len(self.github.marked(EVENT_MARKER, "outsider")), 1)
        self.assert_no_models()

    def test_draft_event_contains_only_the_fixed_repository_pr_contract(self):
        self.factory.store.claim(42, issue())
        self.factory.store.save(42, "draft-pr", url="https://github.com/chronoll/homupe/pull/77")
        self.control.publish(42)
        event = self.github.marked(EVENT_MARKER, "chronoll")[0]
        payload = json.loads(event["body"].split("\n", 1)[1])
        self.assertEqual(set(payload), {"key", "kind", "issue", "status_comment", "pr"})
        self.assertRegex(payload["key"], r"^[0-9a-f]{64}$")
        self.assertEqual((payload["kind"], payload["issue"], payload["pr"]), ("draft-complete", 42, 77))
        self.assertEqual(payload["status_comment"], self.github.marked(STATUS_MARKER, "chronoll")[0]["id"])
        self.assert_no_models()

    def test_status_comments_do_not_change_the_frozen_task_fingerprint(self):
        original = self.github.issue(42)
        self.factory.store.claim(42, original)
        self.factory.store.save(42, "planning")
        self.control.publish(42)
        current = self.github.issue(42)
        self.assertNotEqual(original["updated_at"], current["updated_at"])
        self.assertEqual(issue_fingerprint(original), issue_fingerprint(current))
        client = object.__new__(GitHub)
        client.issue = self.github.issue
        GitHub.check_current(client, original, self.factory.config)
        self.github.current_issue["body"] = "A changed task is still rejected."
        with self.assertRaisesRegex(Halt, "Issue changed"):
            GitHub.check_current(client, original, self.factory.config)
        self.assert_no_models()


if __name__ == "__main__":
    unittest.main()
