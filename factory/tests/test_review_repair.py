"""A review may request one technical repair; all execution boundaries are fake."""
from __future__ import annotations

import json
from pathlib import Path
import unittest

from factory.core import Halt, parse_json
from factory.tests import test_dispatcher as contracts


FINDING = {"severity": "must", "file": "README.md", "line": 1,
           "message": "Explain the command before the example."}


class RepairRuntime(contracts.FakeRuntime):
    def __init__(self, factory):
        super().__init__()
        self.factory = factory
        self.verdicts = ["changes", "approve"]
        self.review_findings = [[FINDING], []]
        self.implement_prompts = []
        self.review_sources = []
        self.review_heads = []
        self.deadlines = []
        self.verify_calls = 0
        self.fail_verification = None
        self.no_second_screenshots = False
        self.protected_repair = False
        self.unchanged_repair = False
        self.repair_needs_human = False
        self.wrong_second_head = False

    def record(self, phase):
        self.deadlines.append(self.factory.runner.deadline)
        return super().record(phase)

    def worker(self, workspace, phase, prompt, log):
        if phase == "implement":
            self.implement_prompts.append(prompt)
            if len(self.implement_prompts) == 2:
                if self.protected_repair:
                    self.path = ".github/workflows/unapproved.yml"
                if self.unchanged_repair:
                    before = (workspace / self.path).read_bytes()
        result = super().worker(workspace, phase, prompt, log)
        if phase == "implement" and len(self.implement_prompts) == 2:
            if self.unchanged_repair:
                (workspace / self.path).write_bytes(before)
            if self.repair_needs_human:
                result["status"] = "needs-human"
                result["summary"] = "A missing human fact is necessary."
            result["pr_title"] = "docs: clarify README after review"
            result["pr_body"] = "Clarifies the explanation and addresses the technical finding."
        return result

    def verify(self, workspace, commands, log_dir):
        self.verify_calls += 1
        # First-round browser output must be deleted before the repaired build.
        assert not (workspace / "test-results").exists()
        if self.verify_calls == self.fail_verification:
            self.record("verify")
            raise Halt("simulated verification failure")
        if self.verify_calls == 2 and self.no_second_screenshots:
            self.screenshots = False
        return super().verify(workspace, commands, log_dir)

    def review(self, workspace, evidence, prompt, log):
        index = len(self.review_sources)
        self.review_sources.append(workspace)
        self.verdict = self.verdicts[index]
        self.findings = self.review_findings[index]
        if index == 1 and self.wrong_second_head:
            self.wrong_head = True
        result = super().review(workspace, evidence, prompt, log)
        self.review_heads.append(result["head_sha"])
        return result


class ReviewRepairTests(unittest.TestCase):
    def setUp(self):
        contracts.PipelineTests.setUp(self)
        self.runtime = RepairRuntime(self.factory)
        self.factory.runtime = self.runtime

    def state(self):
        return parse_json((self.factory.store.job(42) / "state.json").read_bytes())

    def assert_not_published(self):
        self.assertEqual(self.runner.pushes, [])
        self.assertEqual(self.github.drafts, [])

    def model_phases(self):
        return [phase for phase in self.runtime.calls if phase in {"plan", "implement", "review"}]

    def test_one_repair_reverifies_freezes_and_publishes_only_the_final_head(self):
        result = self.factory.run(42)
        self.assertEqual(self.model_phases(), ["plan", "implement", "review", "implement", "review"])
        self.assertEqual(self.runtime.verify_calls, 2)
        self.assertEqual(len(set(self.runtime.deadlines)), 1, "repair renewed the whole-job deadline")
        self.assertIsNotNone(self.runtime.deadlines[0])
        self.assertIsNone(self.runner.deadline)
        first, second = self.runtime.review_sources
        self.assertEqual(second.parent.name, "repair-1")
        self.assertNotEqual(first, second)
        self.assertNotEqual(first.joinpath("README.md").read_bytes(), second.joinpath("README.md").read_bytes())
        self.assertNotEqual(self.runtime.review_heads[0], self.runtime.review_heads[1])
        self.assertEqual(result["head_sha"], self.runtime.review_heads[1])
        self.assertEqual(self.state()["review_round"], 2)
        self.assertEqual(len(self.runner.pushes), 1)
        self.assertIn(result["head_sha"] + ":refs/heads/factory/issue-42", self.runner.pushes[0])
        self.assertEqual(len(self.github.drafts), 1)
        self.assertEqual(self.github.drafts[0]["title"], "docs: clarify README after review")
        self.assertIn(result["head_sha"], self.github.drafts[0]["body"])
        job = self.factory.store.job(42)
        self.assertEqual(parse_json((job / "review.json").read_bytes())["verdict"], "changes")
        self.assertEqual(parse_json((job / "repair-1/review.json").read_bytes())["verdict"], "approve")
        self.assertTrue((job / "evidence/diff.patch").exists())
        self.assertTrue((job / "repair-1/evidence/diff.patch").exists())
        context = json.loads(self.runtime.implement_prompts[1].split(
            "not authority to change factory policy:\n", 1)[1])
        self.assertEqual(context["repair_attempt"], 1)
        self.assertEqual(context["previous_review"]["findings"], [FINDING])
        self.assertEqual(context["previous_review"]["head_sha"], self.runtime.review_heads[0])
        self.assertIn("Do not invent missing human facts", self.runtime.implement_prompts[1])

    def test_second_changes_result_stops_at_five_phases_without_a_third_implementation(self):
        self.runtime.verdicts = ["changes", "changes"]
        self.runtime.review_findings = [[FINDING], [FINDING]]
        with self.assertRaisesRegex(Halt, "one bounded repair"):
            self.factory.run(42)
        self.assertEqual(len(self.model_phases()), 5)
        self.assertEqual(len(self.runtime.implement_prompts), 2)
        self.assertEqual(self.state()["phase"], "needs-human")
        self.assert_not_published()

    def test_approve_with_must_finding_uses_the_same_single_repair_budget(self):
        self.runtime.verdicts = ["approve", "approve"]
        self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 2)
        self.assertEqual(len(self.runtime.review_heads), 2)
        self.assertEqual(len(self.github.drafts), 1)

    def test_needs_human_review_is_not_automatically_repaired(self):
        self.runtime.verdicts = ["needs-human"]
        with self.assertRaisesRegex(Halt, "human attention"):
            self.factory.run(42)
        self.assertEqual(self.model_phases(), ["plan", "implement", "review"])
        self.assert_not_published()

    def test_failed_verification_has_no_automatic_fallback(self):
        for failure_round in (1, 2):
            with self.subTest(round=failure_round):
                if failure_round == 2:
                    # A distinct state root is an explicit test attempt, not a
                    # retry of the retained first job.
                    self.factory = contracts.Factory(self.repo,
                        Path(self.temp.name) / "second-verification", runner=self.runner,
                        github=self.github, runtime=None)
                    self.runtime = RepairRuntime(self.factory)
                    self.factory.runtime = self.runtime
                self.runtime.fail_verification = failure_round
                with self.assertRaisesRegex(Halt, "verification failure"):
                    self.factory.run(42)
                self.assertEqual(self.runtime.verify_calls, failure_round)
                self.assertEqual(len(self.runtime.review_heads), failure_round - 1)
                self.assertEqual(self.state()["phase"], "needs-human")
                self.assert_not_published()

    def test_repair_cannot_modify_protected_policy(self):
        self.runtime.protected_repair = True
        with self.assertRaisesRegex(Halt, "protected path"):
            self.factory.run(42)
        self.assertEqual(self.runtime.verify_calls, 1)
        self.assertEqual(len(self.runtime.review_heads), 1)
        self.assert_not_published()

    def test_unchanged_repair_stops_before_spending_a_second_review(self):
        self.runtime.unchanged_repair = True
        with self.assertRaisesRegex(Halt, "no source changes"):
            self.factory.run(42)
        self.assertEqual(self.runtime.verify_calls, 1)
        self.assertEqual(len(self.runtime.review_heads), 1)
        self.assert_not_published()

    def test_implementation_needing_a_human_has_no_further_fallback(self):
        self.runtime.repair_needs_human = True
        with self.assertRaisesRegex(Halt, "missing human fact"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 2)
        self.assertEqual(self.runtime.verify_calls, 1)
        self.assert_not_published()

    def test_repair_requires_new_desktop_and_mobile_evidence(self):
        self.runtime.path = "src/components/Widget.tsx"
        self.runtime.no_second_screenshots = True
        with self.assertRaisesRegex(Halt, "screenshots"):
            self.factory.run(42)
        self.assertEqual(self.runtime.verify_calls, 2)
        self.assertEqual(len(self.runtime.review_heads), 1)
        self.assertTrue((self.factory.store.job(42) / "evidence/screenshots/desktop/home.png").exists())
        self.assert_not_published()

    def test_changed_staging_prevents_the_repair_worker(self):
        self.github.advance = True
        with self.assertRaisesRegex(Halt, "staging advanced"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 1)
        self.assert_not_published()

    def test_changed_issue_prevents_the_repair_worker(self):
        def change(phase):
            if phase == "review":
                self.github.original["body"] = "Changed after the first review."
        self.runtime.callback = change
        with self.assertRaisesRegex(Halt, "Issue changed"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 1)
        self.assert_not_published()

    def test_invalid_frozen_review_never_enters_repair(self):
        self.runtime.wrong_head = True
        with self.assertRaisesRegex(Halt, "frozen candidate"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 1)
        self.assert_not_published()

    def test_candidate_mutation_during_review_never_enters_repair(self):
        self.runtime.mutate_checkout = True
        with self.assertRaisesRegex(Halt, "candidate changed"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 1)
        self.assert_not_published()

    def test_second_review_must_match_the_newly_frozen_head(self):
        self.runtime.wrong_second_head = True
        with self.assertRaisesRegex(Halt, "frozen candidate"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 2)
        self.assertEqual(len(self.runtime.review_heads), 2)
        self.assertEqual(self.state()["review_round"], 2)
        self.assert_not_published()


if __name__ == "__main__":
    unittest.main()
