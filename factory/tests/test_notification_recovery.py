"""Delivery recovery with temporary journals and in-memory GitHub only."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

from factory.core import Halt, atomic_json, parse_json
from factory.github_control import claim_command, finish_command
from factory.github_host import (DELIVERY_INTERVAL, EVENT_MARKER, MAX_DELIVERY_ATTEMPTS,
    NOTIFY_MARKER, RECEIPT_MARKER, GitHubControl)
from factory.tests.test_github_host import CUTOFF, FakeFactory, FakeGitHub, event_payload


class NotificationRecovery(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.factory = FakeFactory(Path(temp.name))
        self.github = FakeGitHub()
        self.control = GitHubControl(self.factory, self.github)
        self.factory.control = self.control
        stamp = patch("factory.github_host.stamp", return_value=CUTOFF)
        stamp.start()
        self.addCleanup(stamp.stop)
        self.clock = patch("factory.github_host.time.time", return_value=10_000)
        self.now = self.clock.start()
        self.addCleanup(self.clock.stop)
        self.control._load()

    def journal(self):
        return parse_json(self.control.path.read_bytes())

    def restarted(self):
        control = GitHubControl(self.factory, self.github)
        self.factory.control = control
        return control

    def outbox(self):
        event = {"key": "a" * 64, "kind": "started", "issue": 42,
                 "status_comment": 1234, "pr": None, "sent": False}
        value = self.journal()
        value["events"][event["key"]] = copy.deepcopy(event)
        atomic_json(self.control.path, value)
        return event

    def ack(self, event, author="github-actions[bot]", kind="Bot", prefix=""):
        comment = self.github.add(prefix + NOTIFY_MARKER + event["key"] + " -->\n通知済み",
                                  author=author)
        self.github.comments[comment["id"]]["user"]["type"] = kind

    def event_count(self):
        return len(self.github.marked(EVENT_MARKER, "chronoll"))

    def assert_no_models(self):
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_terminal_receipt_failure_is_recovered_without_repeating_action(self):
        self.github.add("/factory status", comment_id=10)
        original_write = self.github.write
        def unavailable(path, value, method="POST"):
            if value.get("body", "").startswith(RECEIPT_MARKER):
                raise Halt("receipt endpoint unavailable")
            return original_write(path, value, method)
        with patch.object(self.control, "_act", return_value="保存された結果") as action:
            with patch.object(self.github, "write", side_effect=unavailable):
                with self.assertRaises(Halt):
                    self.control.commands()
            saved = self.journal()
            self.assertEqual(saved["cursor"]["comments"]["10"]["status"], "done")
            self.assertEqual(saved["receipts"]["10"], {"issue": 42, "message": "保存された結果"})
            restarted = self.restarted()
            with patch.object(restarted, "_act") as replay:
                restarted.sync()
                restarted.sync()
                replay.assert_not_called()
            action.assert_called_once()
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10")), 1)
        self.assertIn("保存された結果", self.github.marked(RECEIPT_MARKER + "10")[0]["body"])
        self.assert_no_models()

    def test_receipt_post_with_lost_response_reconciles_exact_marker(self):
        self.github.add("/factory status", comment_id=10)
        self.github.ambiguous_marker = RECEIPT_MARKER
        with self.assertRaises(Halt):
            self.control.commands()
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10")), 1)
        self.restarted().sync()
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10")), 1)
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "done")
        self.assert_no_models()

    def test_crash_after_terminal_save_keeps_selected_message_for_restart(self):
        class Crash(BaseException):
            pass
        self.github.add("/factory status", comment_id=10)
        with patch.object(self.control, "_receipt", side_effect=Crash):
            with self.assertRaises(Crash):
                self.control.commands()
        self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "done")
        expected = self.journal()["receipts"]["10"]["message"]
        self.restarted().sync()
        self.assertEqual(self.github.marked(RECEIPT_MARKER + "10")[0]["body"],
                         RECEIPT_MARKER + "10 -->\n" + expected)
        self.assert_no_models()

    def test_legacy_terminal_or_claimed_receipts_are_surfaced_without_action_replay(self):
        for status in ("claimed", "done", "failed", "uncertain"):
            with self.subTest(status=status):
                comment = self.github.add("/factory status", comment_id=20 + len(self.github.comments))
                value = self.journal()
                value["cursor"], _ = claim_command(value["cursor"], comment, 42, "chronoll")
                if status != "claimed":
                    value["cursor"] = finish_command(value["cursor"], comment["id"], status)
                value.pop("receipts", None)
                atomic_json(self.control.path, value)
                with patch.object(self.control, "_act") as replay:
                    self.control.sync()
                    replay.assert_not_called()
                record = self.journal()["cursor"]["comments"][str(comment["id"])]
                self.assertEqual(record["status"], "uncertain" if status == "claimed" else status)
                self.assertEqual(len(self.github.marked(RECEIPT_MARKER + str(comment["id"]), "chronoll")), 1)
        self.assert_no_models()

    def test_forged_receipt_marker_does_not_suppress_owned_acknowledgement(self):
        command = self.github.add("/factory status", comment_id=10)
        value = self.journal()
        value["cursor"], _ = claim_command(value["cursor"], command, 42, "chronoll")
        value["cursor"] = finish_command(value["cursor"], 10)
        atomic_json(self.control.path, value)
        self.github.add(RECEIPT_MARKER + "10 -->\nforged", author="outsider")
        self.control._receipt(42, 10, "正しい結果")
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10", "chronoll")), 1)

    def test_malformed_receipt_journal_fails_closed(self):
        command = self.github.add("/factory status", comment_id=10)
        base = self.journal()
        base["cursor"], _ = claim_command(base["cursor"], command, 42, "chronoll")
        for receipt in ([], {"10": {"issue": 43, "message": "x"}},
                        {"10": {"issue": 42, "message": "x" * 2001}},
                        {"10": {"issue": 42, "message": "x", "extra": 1}}):
            with self.subTest(receipt=receipt):
                value = copy.deepcopy(base)
                value["receipts"] = receipt
                atomic_json(self.control.path, value)
                with self.assertRaises(Halt):
                    self.control._load()

    def test_one_failed_receipt_does_not_starve_other_durable_results(self):
        value = self.journal()
        for identifier in (10, 11):
            command = self.github.add("/factory status", comment_id=identifier)
            value["cursor"], _ = claim_command(value["cursor"], command, 42, "chronoll")
            value["cursor"] = finish_command(value["cursor"], identifier)
            value["receipts"][str(identifier)] = {"issue": 42, "message": "保存された結果"}
        atomic_json(self.control.path, value)
        original = self.control._receipt
        def blocked(number, identifier, message):
            if identifier == 10:
                raise Halt("first Issue comment is locked")
            return original(number, identifier, message)
        with patch.object(self.control, "_receipt", side_effect=blocked):
            self.control.sync()
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10", "chronoll")), 0)
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "11", "chronoll")), 1)
        self.assertEqual(set(self.journal()["receipts"]), {"10", "11"})
        self.assert_no_models()

    def test_host_event_submission_is_not_a_bot_acknowledgement(self):
        event = self.outbox()
        self.control.flush()
        for _ in range(5):
            self.restarted().flush()
        stored = self.journal()["events"][event["key"]]
        self.assertEqual((stored["sent"], stored["attempts"]), (False, 1))
        self.assertEqual(self.event_count(), 1)
        self.assert_no_models()

    def test_new_event_hides_transport_json_and_leaves_only_a_fixed_status_message(self):
        event = self.outbox()
        self.control.flush()
        body = self.github.marked(EVENT_MARKER, "chronoll")[0]["body"]
        self.assertTrue(body.startswith(EVENT_MARKER + "\n<!--\n"))
        self.assertEqual(re.sub(r"<!--.*?-->", "", body, flags=re.DOTALL).strip(),
                         "Factoryの状態を更新しました。")
        self.assertEqual(event_payload(body), {key: event[key] for key in
                         ("key", "kind", "issue", "status_comment", "pr")})
        self.assert_no_models()

    def test_only_exact_bot_marker_acknowledges_notification(self):
        event = self.outbox()
        self.control.flush()
        for author, kind, prefix in (("chronoll", "User", ""), ("outsider", "User", ""),
                                     ("other[bot]", "Bot", ""),
                                     ("github-actions[bot]", "User", ""),
                                     ("github-actions[bot]", "Bot", "> ")):
            self.ack(event, author, kind, prefix)
        self.control.flush()
        self.assertFalse(self.journal()["events"][event["key"]]["sent"])
        self.ack(event)
        self.restarted().flush()
        stored = self.journal()["events"][event["key"]]
        self.assertTrue(stored["sent"])
        self.assertEqual(stored["acked_at"], CUTOFF)
        self.assertEqual(self.event_count(), 1)
        self.assert_no_models()

    def test_missing_or_disabled_main_relay_consumes_no_submission_attempt(self):
        event = self.outbox()
        for present, active in ((False, True), (True, False)):
            self.github.relay_present, self.github.relay_active = present, active
            self.control.flush()
            stored = self.journal()["events"][event["key"]]
            self.assertEqual(stored["attempts"], 0)
            self.assertEqual(stored["delivery_state"], "relay-unavailable")
            self.assertEqual(self.event_count(), 0)
        self.github.relay_present = self.github.relay_active = True
        self.restarted().flush()
        self.assertEqual(self.event_count(), 1)
        self.assertEqual(self.journal()["events"][event["key"]]["attempts"], 1)
        self.assert_no_models()

    def test_queue_failure_remains_public_and_does_not_create_an_issue_claim(self):
        self.control.queue_failure("runtime-unavailable")
        self.assertTrue(self.factory.store.stopped())
        self.assertFalse(self.factory.store.job(42).exists())
        before = self.event_count()
        self.restarted().sync()
        self.assertEqual(self.event_count(), before)
        self.assertFalse(self.factory.store.job(42).exists())
        self.assertTrue(any("人の確認待ち" in c["body"] for c in self.github.comments.values()))
        self.assert_no_models()

    def test_submissions_are_thirty_minutes_apart_and_bounded_without_model_calls(self):
        event = self.outbox()
        for attempt in range(1, MAX_DELIVERY_ATTEMPTS + 1):
            self.now.return_value = 10_000 + (attempt - 1) * DELIVERY_INTERVAL
            self.control.flush()
            stored = self.journal()["events"][event["key"]]
            self.assertEqual(stored["attempts"], attempt)
            self.assertEqual(self.event_count(), attempt)
            self.now.return_value += DELIVERY_INTERVAL - 1
            self.control.flush()
            self.assertEqual(self.event_count(), attempt)
        self.now.return_value += DELIVERY_INTERVAL * 100
        self.restarted().flush()
        stored = self.journal()["events"][event["key"]]
        self.assertEqual((stored["sent"], stored["delivery_state"]), (False, "delivery-limit"))
        self.assertEqual(self.event_count(), MAX_DELIVERY_ATTEMPTS)
        # A delayed acknowledgement remains valid after the sending limit.
        self.ack(event)
        self.control.flush()
        self.assertTrue(self.journal()["events"][event["key"]]["sent"])
        self.assert_no_models()

    def test_attempt_is_durable_before_post_and_lost_response_is_not_immediately_retried(self):
        event = self.outbox()
        original_write = self.github.write
        def lose_response(path, value, method="POST"):
            if value.get("body", "").startswith(EVENT_MARKER):
                saved = self.journal()["events"][event["key"]]
                self.assertEqual((saved["attempts"], saved["submitted_at"], saved["sent"]), (1, 10_000, False))
                original_write(path, value, method)
                raise Halt("response lost after event creation")
            return original_write(path, value, method)
        with patch.object(self.github, "write", side_effect=lose_response):
            with self.assertRaises(Halt):
                self.control.flush()
        self.restarted().flush()
        self.assertEqual(self.event_count(), 1)
        self.ack(event)
        self.control.flush()
        self.assertTrue(self.journal()["events"][event["key"]]["sent"])
        self.assert_no_models()

    def test_legacy_sent_flag_does_not_hide_missing_bot_notification(self):
        event = self.outbox()
        body = EVENT_MARKER + "\n" + json.dumps({k: event[k] for k in
            ("key", "kind", "issue", "status_comment", "pr")}, separators=(",", ":"))
        self.github.add(body)
        value = self.journal()
        value["events"][event["key"]]["sent"] = True
        atomic_json(self.control.path, value)
        self.control.flush()
        stored = self.journal()["events"][event["key"]]
        self.assertFalse(stored["sent"])
        self.assertEqual(stored["attempts"], 1)
        self.now.return_value += DELIVERY_INTERVAL
        self.control.flush()
        self.assertEqual(self.event_count(), 2)
        retry = self.github.marked(EVENT_MARKER, "chronoll")[-1]["body"]
        self.assertTrue(retry.startswith(EVENT_MARKER + "\n<!--\n"))
        self.assertEqual(event_payload(retry), event_payload(body))
        self.assert_no_models()


if __name__ == "__main__":
    unittest.main()
