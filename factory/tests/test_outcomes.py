"""Offline contracts for concrete, non-retrying failure classification."""
from copy import deepcopy
import unittest

from factory.core import VerificationFailure
from factory.outcomes import classify_failure


class FailureOutcomes(unittest.TestCase):
    def test_only_selected_public_metadata_is_returned_without_mutating_state(self):
        state = {"phase": "implementing", "private": {"token": "not-selected"}}
        before = deepcopy(state)
        outcome = classify_failure(RuntimeError("unrecognized failure"), state)
        self.assertEqual(set(outcome), {"halt_kind", "next_action", "reason", "human_message"})
        self.assertEqual(state, before)
        self.assertNotIn("not-selected", str(outcome))
        self.assertEqual(outcome["next_action"], "maintenance")

    def test_structured_verification_is_technical_even_if_diagnostics_mention_schema(self):
        for step in (["npm", "run", "check"], "npm run check", 1):
            result = classify_failure(VerificationFailure(step, "schema assertion failed at src/example.ts:7"), {})
            self.assertEqual((result["halt_kind"], result["next_action"]), ("technical", "retry"))
            self.assertIn("npm run check", result["reason"])
            self.assertIn("schema assertion", result["reason"])
            self.assertIn("自動修正の上限", result["reason"])
            self.assertIn("業務上の判断", result["human_message"])

    def test_verification_does_not_publish_arbitrary_command_or_traceback(self):
        result = classify_failure(VerificationFailure(["sh", "-c", "private-command"],
            "test failed\nTraceback (most recent call last):\nFile private-diagnostic.py\nGH_TOKEN=ghp_SECRET123456"), {})
        self.assertIn("アプリ検証", result["reason"])
        for secret in ("private-command", "Traceback", "private-diagnostic.py", "ghp_SECRET123456"):
            self.assertNotIn(secret, str(result))

    def test_plan_and_implementation_preserve_the_specific_question(self):
        for prefix in ("plan requires human input:", "implementation requires human input:"):
            result = classify_failure(prefix + " Which timezone should the report use?", {})
            self.assertEqual((result["halt_kind"], result["next_action"]), ("question", "answer"))
            self.assertEqual(result["human_message"], "Which timezone should the report use?")
        self.assertEqual(classify_failure("plan requires human input:", {})["next_action"], "maintenance")

    def test_review_human_question_requires_evidence_instead_of_inventing_facts(self):
        question = "Should the empty-state link open the pricing page?"
        for state in ({"human_message": question}, {"review_summary": question}, {"review": {"summary": question}}):
            result = classify_failure("review requires human attention", state)
            self.assertEqual(result["next_action"], "answer")
            self.assertEqual(result["human_message"], question)
        result = classify_failure("review requires human attention", {})
        self.assertEqual(result["next_action"], "maintenance")
        self.assertNotIn("どちら", result["human_message"])

    def test_exhausted_review_is_technical_but_time_and_base_changes_do_not_claim_repair_exhaustion(self):
        result = classify_failure("review still requires changes after one bounded repair", {})
        self.assertEqual((result["halt_kind"], result["next_action"]), ("technical", "retry"))
        self.assertIn("自動修正の上限", result["reason"])
        for error in ("one-hour job limit reached", "staging advanced; candidate must be rebuilt and reviewed"):
            result = classify_failure(error, {})
            self.assertEqual(result["next_action"], "retry")
            self.assertNotIn("自動修正の上限", result["reason"])

    def test_explicit_stop_is_optional_retry_and_input_change_is_recoverable(self):
        for error in ("local STOP requested", "dispatcher interrupted", KeyboardInterrupt()):
            result = classify_failure(error, {})
            self.assertEqual((result["halt_kind"], result["next_action"]), ("stopped", "retry"))
            self.assertIn("停止したままなら操作不要", result["human_message"])
        result = classify_failure("issue changed since plan", {})
        self.assertEqual((result["halt_kind"], result["next_action"]), ("input", "retry"))

    def test_auth_runtime_policy_and_uncertain_publication_require_maintenance(self):
        cases = (("authentication required", {}, "auth"), ("model is not available", {}, "auth"),
                 ("quota exhausted", {}, "auth"), ("docker cleanup failed", {}, "runtime"),
                 ("protected path changed", {}, "policy"), ("symlink rejected", {}, "policy"),
                 ("remote issue branch already exists", {}, "publication"),
                 ("connection closed", {"phase": "publishing"}, "publication"),
                 ("local STOP requested", {"phase": "publishing"}, "publication"))
        for error, state, kind in cases:
            with self.subTest(error=error):
                result = classify_failure(error, state)
                self.assertEqual((result["halt_kind"], result["next_action"]), (kind, "maintenance"))

    def test_selected_errors_and_questions_redact_credentials_paths_and_tracebacks(self):
        secret = "ghp_123456789PRIVATESECRET"
        errors = ("unrecognized GH_TOKEN=" + secret + " at /Users/private/file.py",
                  "plan requires human input: GH_TOKEN=" + secret + " at /Users/private/file.py",
                  "Traceback (most recent call last):\nprivate-frame.py token=" + secret)
        for error in errors:
            result = classify_failure(error, {})
            for value in (secret, "/Users/private", "private-frame.py", "Traceback"):
                self.assertNotIn(value, str(result))


if __name__ == "__main__":
    unittest.main()
