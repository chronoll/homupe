"""Offline contracts for exact comments, durable receipts and public redaction."""
from __future__ import annotations

from copy import deepcopy
import unittest

from factory.github_control import (COMMANDS, MAX_STATUS_CHARS, STATUS_MARKER, action_requirements,
    claim_command, command_record, finish_command, new_cursor, parse_command,
    safe_text, status_body, validate_cursor)


def comment(command="status", identifier=100):
    return {"id": identifier, "body": "/factory " + command,
            "user": {"login": "chronoll", "type": "User"},
            "created_at": "2026-11-28T00:00:00Z",
            "updated_at": "2026-11-28T00:00:00Z"}


class ExactComments(unittest.TestCase):
    def test_only_complete_exact_bodies_are_commands(self):
        for command in COMMANDS:
            self.assertEqual(parse_command(comment(command), "chronoll"), command)
        for body in (" /factory status", "/factory status ", "/factory status\n",
                     "/factory status\r\n", "/factory\nstatus", "> /factory stop",
                     "Please /factory retry", "/factory resume please",
                     "/factory STATUS", "/Factory status", "/factory  status",
                     "~~~\n/factory stop\n~~~", chr(96) + "/factory stop" + chr(96),
                     "/factory stop\n/factory retry", "/factory\u200b status",
                     "/factory delete", None, [], {}):
            item = comment()
            item["body"] = body
            with self.subTest(body=body):
                self.assertIsNone(parse_command(item, "chronoll"))

    def test_only_current_trusted_human_author_is_accepted(self):
        for user in ({"login": "someone"}, {"login": "Chronoll"}, None, {},
                     {"login": "chronoll", "type": "Bot"}):
            item = comment()
            item["user"] = user
            self.assertIsNone(parse_command(item, "chronoll"))
        self.assertIsNone(parse_command(comment(), ""))
        self.assertIsNone(parse_command([], "chronoll"))

    def test_metadata_is_validated_separately_from_body(self):
        item = {"body": "/factory status", "user": {"login": "chronoll"}}
        self.assertEqual(parse_command(item, "chronoll"), "status")
        self.assertIsNone(command_record(item, 42, "chronoll"))

    def test_new_commands_must_have_real_ids_and_unchanged_api_timestamps(self):
        self.assertIsNotNone(command_record(comment(), 42, "chronoll"))
        cases = [("id", True), ("id", 0), ("id", "100"), ("id", 2 ** 64),
                 ("created_at", "2026-02-30T00:00:00Z"),
                 ("created_at", "2026-11-28"), ("updated_at", None),
                 ("updated_at", "2026-11-28T00:00:01Z")]
        for key, value in cases:
            item = comment()
            item[key] = value
            with self.subTest(key=key, value=value):
                self.assertIsNone(command_record(item, 42, "chronoll"))
        self.assertIsNone(command_record(comment(), True, "chronoll"))


class DurableCommentReceipts(unittest.TestCase):
    def test_claim_and_finish_are_pure_and_json_shaped(self):
        original = new_cursor()
        claimed, record = claim_command(original, comment("retry"), 42, "chronoll")
        self.assertEqual(original, new_cursor())
        self.assertEqual(record["command"], "retry")
        self.assertEqual(claimed["comments"]["100"]["status"], "claimed")
        record["status"] = "tampered"
        self.assertEqual(claimed["comments"]["100"]["status"], "claimed")
        finished = finish_command(claimed, 100)
        self.assertEqual(claimed["comments"]["100"]["status"], "claimed")
        self.assertEqual(finished["comments"]["100"]["status"], "done")
        self.assertEqual(validate_cursor(finished), finished)

    def test_claim_is_never_replayed_after_crash_failure_or_uncertain_write(self):
        for outcome in (None, "done", "failed", "uncertain"):
            cursor, _ = claim_command(new_cursor(), comment("retry"), 42, "chronoll")
            if outcome:
                cursor = finish_command(cursor, 100, outcome)
            edited = comment("resume")
            edited["updated_at"] = "2026-11-29T00:00:00Z"
            edited["user"]["login"] = "someone"
            unchanged, record = claim_command(cursor, edited, 43, "chronoll")
            self.assertIsNone(record)
            self.assertEqual(unchanged, cursor)
            self.assertEqual(unchanged["comments"]["100"]["command"], "retry")

    def test_an_unseen_lower_id_is_not_lost_by_a_diagnostic_high_water_mark(self):
        cursor, _ = claim_command(new_cursor(), comment(identifier=200), 42, "chronoll")
        cursor, record = claim_command(cursor, comment("stop", 100), 42, "chronoll")
        self.assertEqual(record["command"], "stop")
        self.assertEqual(cursor["last_comment_id"], 200)
        self.assertEqual(set(cursor["comments"]), {"100", "200"})

    def test_invalid_or_edited_comments_do_not_change_the_cursor(self):
        item = comment("retry")
        item["updated_at"] = "2026-11-28T00:01:00Z"
        cursor, record = claim_command(new_cursor(), item, 42, "chronoll")
        self.assertEqual(cursor, new_cursor())
        self.assertIsNone(record)

    def test_terminal_receipts_cannot_be_reinterpreted_as_another_outcome(self):
        cursor, _ = claim_command(new_cursor(), comment(), 42, "chronoll")
        done = finish_command(cursor, 100)
        self.assertEqual(finish_command(done, 100), done)
        for identifier, outcome in ((101, "done"), (True, "done"), (100, [])):
            with self.assertRaises(ValueError):
                finish_command(cursor, identifier, outcome)
        with self.assertRaises(ValueError):
            finish_command(done, 100, "failed")

    def test_damaged_cursor_fails_closed_instead_of_resetting_replay_protection(self):
        claimed, _ = claim_command(new_cursor(), comment(), 42, "chronoll")
        malformed = [
            None, {}, {**new_cursor(), "version": True},
            {**new_cursor(), "last_comment_id": 10},
            {**new_cursor(), "extra": "not allowed"},
        ]
        for field, value in (("command", []), ("status", {}), ("issue", True),
                             ("updated_at", "2026-11-28T00:00:01Z")):
            item = deepcopy(claimed)
            item["comments"]["100"][field] = value
            malformed.append(item)
        for cursor in malformed:
            with self.subTest(cursor=cursor), self.assertRaises(ValueError):
                validate_cursor(cursor)


class ActionContracts(unittest.TestCase):
    def test_retry_is_explicit_and_requires_remote_and_stop_reconciliation(self):
        request = action_requirements("retry", {"phase": "needs-human"})
        for field in ("requires_open_issue", "reject_pull_request", "requires_held_job",
                      "held_job_available", "requires_remote_reconciliation",
                      "requires_recoverable_stop", "archives_this_attempt",
                      "refreezes_current_issue", "explicit_model_retry", "clears_stop"):
            self.assertTrue(request[field], field)
        self.assertFalse(action_requirements("retry", {})["held_job_available"])

    def test_resume_does_not_retry_held_jobs(self):
        request = action_requirements("resume", {"phase": "needs-human"})
        self.assertTrue(request["queue_only"])
        self.assertTrue(request["preserves_held_jobs"])
        self.assertTrue(request["clears_stop"])
        self.assertFalse(request["explicit_model_retry"])
        self.assertFalse(request["archives_this_attempt"])
        self.assertFalse(action_requirements("stop")["clears_stop"])
        for invalid in ("run", [], None):
            with self.assertRaises(ValueError):
                action_requirements(invalid)


class PublicStatus(unittest.TestCase):
    def test_concrete_question_review_and_only_relevant_command_are_present(self):
        state = {"phase": "needs-human", "halt_kind": "missing-information",
                 "reason": "plan requires human input: Which release date?",
                 "stopped": True}
        review = {"verdict": "changes", "summary": "The empty state is missing.",
                  "findings": [{"severity": "must", "file": "src/app/page.tsx",
                                "line": 12, "message": "Handle an empty list."}]}
        body = status_body(42, state, review)
        self.assertTrue(body.startswith(STATUS_MARKER + "\n<!-- homupe-factory-action:v1:answer -->\n"))
        for text in ("回答待ち", "確認事項: Which release date?", "あなたの操作: 必要",
                     "The empty state is missing.", "src/app/page.tsx:12",
                     "Handle an empty list.", "STOP", "Issue 本文に追記", "通常の返信だけでは再開しません"):
            self.assertIn(text, body)
        self.assertEqual(body.count("/factory "), 1)
        self.assertIn("/factory retry", body)
        # A status posted using the same GitHub account cannot become a command.
        self.assertIsNone(parse_command({"body": body, "user": {"login": "chronoll"}}, "chronoll"))

    def test_secrets_local_paths_and_unselected_state_are_not_published(self):
        secrets = ["ghp_TESTTOPSECRETVALUE123456", "sk-TESTOPENAISECRET123456789",
                   "test-password-value", "test-bearer-value", "my-private-key",
                   "url-password", "hidden-query-value", "private-dir-name",
                   "windows-private-name", "value-not-selected"]
        reason = (
            "Verification failed GH_TOKEN=" + secrets[0] + " OPENAI_API_KEY=" + secrets[1]
            + " password='" + secrets[2] + "'\nAuthorization: Bearer " + secrets[3]
            + "\n-----BEGIN PRIVATE KEY-----\n" + secrets[4] + "\n-----END PRIVATE KEY-----"
            + "\nhttps://account:" + secrets[5] + "@example.test/run?token=" + secrets[6]
            + " '/Users/name/Application Support/" + secrets[7] + "/file.txt'"
            + " C:\\Users\\name\\" + secrets[8] + "\\file.txt"
        )
        body = status_body(42, {"phase": "needs-human", "reason": reason,
                               "credentials": secrets[9]})
        self.assertIn("Verification failed", body)
        for secret in secrets:
            self.assertNotIn(secret, body)
        self.assertNotIn("/Users/name", body)
        self.assertNotIn("C:\\Users", body)

    def test_findings_and_summary_are_also_redacted_and_paths_must_be_relative(self):
        secret = "ghp_FINDINGSECRET123456789"
        body = status_body(42, {}, {"summary": "token=" + secret, "findings": [
            {"severity": "must", "file": "/Users/private/key.txt", "line": 1,
             "message": "GH_TOKEN=" + secret},
            {"severity": "should", "file": "../outside.txt", "line": 2,
             "message": "Do not read this path."}]})
        self.assertNotIn(secret, body)
        self.assertNotIn("/Users/private", body)
        self.assertNotIn("../outside.txt", body)
        self.assertIn("パス非表示", body)

    def test_untrusted_markdown_cannot_add_mentions_fences_or_links(self):
        text = safe_text("@chronoll\n# hello " + chr(96) * 3 + " [click](https://evil.test)")
        self.assertNotIn("@chronoll", text)
        self.assertNotIn("https://evil.test", text)
        self.assertIn("\\#", text)
        self.assertIn("\\" + chr(96), text)

    def test_only_a_verified_repository_pr_url_is_linked(self):
        url = "https://github.com/chronoll/homupe/pull/33"
        self.assertIn(url, status_body(42, {"phase": "draft-pr", "url": url}))
        for invalid in ("https://evil.test/pull/33", url + "?token=secret", url + "/files"):
            self.assertNotIn(invalid, status_body(42, {"url": invalid}))

    def test_output_is_bounded_while_the_relevant_command_remains_copyable(self):
        body = status_body(42, {"phase": "needs-human", "next_action": "retry",
                               "reason": "日本語の長い理由。" * 2000},
                           {"summary": "長い概要。" * 2000, "findings": [
                               {"severity": "must", "file": "README.md", "line": 1,
                                "message": "詳細な指摘。" * 2000} for _ in range(100)]})
        self.assertLessEqual(len(body), MAX_STATUS_CHARS)
        self.assertIn("ほか 92 件", body)
        self.assertEqual(body.count("/factory "), 1)
        self.assertIn("/factory retry", body)

    def test_active_and_repair_phases_need_no_human_action_or_command(self):
        for phase in ("revision-queued", "planning", "implementing", "verifying", "reviewing", "repairing"):
            body = status_body(42, {"phase": phase, "next_action": "answer",
                                    "human_message": "A stale question"})
            self.assertIn("<!-- homupe-factory-action:v1:wait -->", body)
            self.assertIn("あなたの操作: 不要", body)
            self.assertNotIn("/factory ", body)
            self.assertNotIn("A stale question", body)
        self.assertIn("検証エラーを自動修正中。あなたの操作不要", body)

    def test_draft_pr_requires_review_instead_of_retry_or_business_answer(self):
        body = status_body(42, {"phase": "draft-pr", "next_action": "answer",
                               "human_message": "stale", "url": "https://github.com/chronoll/homupe/pull/33"})
        self.assertIn("<!-- homupe-factory-action:v1:review -->", body)
        for text in ("あなたの操作: 必要", "GitHub CI", "Preview", "staging", "main", "新しいトップレベルコメント",
                     "/factory fix\n具体的な修正内容", "同じ PR", "インラインコメント", "Draft に戻します"):
            self.assertIn(text, body)
        self.assertEqual(body.count("/factory "), 1)
        self.assertNotIn("/factory retry", body)
        self.assertNotIn("確認事項: stale", body)

    def test_technical_retry_and_intentional_stop_are_distinguished(self):
        from factory.core import VerificationFailure
        from factory.outcomes import classify_failure
        technical = {"phase": "needs-human", **classify_failure(
            VerificationFailure(["npm", "run", "check"], "Expected 1 but got 0"), {})}
        body = status_body(42, technical)
        for text in ("状態: 技術エラーで保留", "<!-- homupe-factory-action:v1:retry -->", "自動修正の上限", "業務上の判断", "追加のサブスク利用枠"):
            self.assertIn(text, body)
        stopped = status_body(42, {"phase": "needs-human", **classify_failure("local STOP requested", {})})
        self.assertIn("あなたの操作: 不要（停止を続ける場合）", stopped)
        self.assertNotIn("自動修正の上限", stopped)
        self.assertEqual(stopped.count("/factory "), 1)

    def test_missing_question_is_maintenance_and_does_not_invent_business_decisions(self):
        body = status_body(42, {"phase": "needs-human", "next_action": "answer"})
        self.assertIn("<!-- homupe-factory-action:v1:maintenance -->", body)
        self.assertIn("具体的な確認事項を取得できていません", body)
        self.assertNotIn("/factory retry", body)
        self.assertNotIn("Issue 本文に追記", body)

    def test_held_revision_retries_preserve_the_existing_pr_and_one_command(self):
        for action in ("answer", "retry"):
            body = status_body(42, {"phase": "needs-human", "revision": True,
                                    "next_action": action, "human_message": "Which timezone?"})
            self.assertIn("既存 PR を引き継ぎ、同じ PR を更新", body)
            self.assertNotIn("既存 PR・ブランチがある場合は再試行を受け付けません", body)
            self.assertEqual(body.count("/factory "), 1)
            self.assertIn("/factory retry", body)

    def test_maintenance_and_queue_resume_have_distinct_next_actions(self):
        body = status_body(42, {"phase": "needs-human", "reason": "remote issue branch already exists"})
        self.assertIn("<!-- homupe-factory-action:v1:maintenance -->", body)
        self.assertIn("既存 PR", body)
        self.assertNotIn("/factory retry", body)
        queue = status_body(42, {"phase": "unstarted", "queue_stopped": True})
        self.assertIn("/factory resume", queue)
        self.assertEqual(queue.count("/factory "), 1)
        self.assertIn("保留中の試行は再実行しません", queue)

    def test_missing_or_malformed_display_fields_do_not_dump_arbitrary_values(self):
        body = status_body(42, {"phase": {}, "reason": {"password": "hidden"}},
                           {"verdict": [], "summary": [], "findings": [
                               {"severity": {}, "file": {}, "line": False,
                                "message": {"token": "hidden"}}]})
        self.assertIn("状態の確認が必要", body)
        self.assertNotIn("hidden", body)
        with self.assertRaises(ValueError):
            status_body(True, {})


if __name__ == "__main__":
    unittest.main()
