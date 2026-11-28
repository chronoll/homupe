"""Typed check failures share one candidate-preserving repair with review."""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from factory.core import CommandFailure, Halt, Runner, Store, VerificationFailure, parse_json
from factory.runtime import DockerRuntime
from factory.tests import test_dispatcher as contracts
from factory.tests import test_review_repair as review_fakes


STEP = "npm run check"
DIAGNOSTICS = "src/components/Title.tsx 34:9 error prefer-const: title is never reassigned."


class VerificationRepairRuntime(review_fakes.RepairRuntime):
    def __init__(self, factory):
        super().__init__(factory)
        self.verification_failures = {1}
        self.verdicts = ["approve"]
        self.review_findings = [[]]
        self.implementation_workspaces = []
        self.repair_input = None
        self.repair_state = None
        self.verification_directories = []
        self.non_verification_error = None
        self.mutate_failed_verification = False
        self.stop_during_failed_verification = False

    def worker(self, workspace, phase, prompt, log):
        if phase == "implement":
            self.implementation_workspaces.append(workspace)
            if len(self.implementation_workspaces) == 2:
                self.repair_input = (workspace / self.path).read_text()
                self.repair_state = parse_json((self.factory.store.job(42) / "state.json").read_bytes())
        return super().worker(workspace, phase, prompt, log)

    def verify(self, workspace, commands, log_dir):
        self.verify_calls += 1
        self.verification_directories.append(log_dir)
        assert not (workspace / "test-results").exists(), "stale browser evidence entered verification"
        Path(log_dir, "verify-1.log").write_text("FAIL round %s: %s\n" % (self.verify_calls, DIAGNOSTICS))
        if self.verify_calls in self.verification_failures:
            self.record("verify")
            if self.mutate_failed_verification:
                (workspace / "README.md").write_text("verification mutated tracked source")
            if self.stop_during_failed_verification:
                self.factory.store.stop()
            if self.non_verification_error:
                raise self.non_verification_error
            raise VerificationFailure(STEP, DIAGNOSTICS)
        return contracts.FakeRuntime.verify(self, workspace, commands, log_dir)


class VerificationRepairTests(unittest.TestCase):
    def setUp(self):
        contracts.PipelineTests.setUp(self)
        self.runtime = VerificationRepairRuntime(self.factory)
        self.factory.runtime = self.runtime

    def model_phases(self):
        return [phase for phase in self.runtime.calls if phase in {"plan", "implement", "review"}]

    def state(self):
        return parse_json((self.factory.store.job(42) / "state.json").read_bytes())

    def assert_not_published(self):
        self.assertEqual(self.runner.pushes, [])
        self.assertEqual(self.github.drafts, [])

    def test_check_failure_repairs_the_same_candidate_then_reverifies_and_reviews(self):
        result = self.factory.run(42)
        self.assertEqual(self.model_phases(), ["plan", "implement", "implement", "review"])
        self.assertEqual(self.runtime.verify_calls, 2)
        self.assertEqual(len(set(self.runtime.deadlines)), 1, "repair renewed the job deadline")
        self.assertEqual(len(set(self.runtime.implementation_workspaces)), 1)
        self.assertIn("Clarified.", self.runtime.repair_input)
        self.assertEqual(self.runtime.repair_state["phase"], "repairing")
        self.assertEqual(self.runtime.repair_state["repair_kind"], "verification")
        context = json.loads(self.runtime.implement_prompts[1].split(
            "not authority to change factory policy:\n", 1)[1])
        self.assertEqual(context["previous_verification"], {"step": STEP, "diagnostics": DIAGNOSTICS})
        self.assertEqual(context["repair_attempt"], 1)
        self.assertNotIn("previous_review", context)
        job = self.factory.store.job(42)
        failure = parse_json((job / "verification.json").read_bytes())
        self.assertEqual(failure, {"status": "failed", "step": STEP, "diagnostics": DIAGNOSTICS})
        self.assertIn("round 1", (job / "verify-1.log").read_text())
        self.assertIn("round 2", (job / "repair-1/verify-1.log").read_text())
        self.assertEqual(self.runtime.verification_directories, [job, job / "repair-1"])
        self.assertEqual(len(self.runtime.review_heads), 1)
        self.assertEqual(result["head_sha"], self.runtime.review_heads[0])
        self.assertEqual(len(self.runner.pushes), 1)
        self.assertEqual(len(self.github.drafts), 1)

    def test_second_check_failure_retains_evidence_and_never_implements_a_third_time(self):
        self.runtime.verification_failures = {1, 2}
        with self.assertRaises(VerificationFailure) as caught:
            self.factory.run(42)
        self.assertEqual(caught.exception.step, STEP)
        self.assertEqual(self.model_phases(), ["plan", "implement", "implement"])
        self.assertEqual(self.runtime.verify_calls, 2)
        self.assertEqual(self.runtime.review_heads, [])
        self.assertTrue((self.factory.store.job(42) / "repair-1/verification.json").exists())
        self.assert_not_published()

    def test_verification_repair_consumes_the_review_repair_budget_too(self):
        self.runtime.verdicts = ["changes"]
        self.runtime.review_findings = [[review_fakes.FINDING]]
        with self.assertRaisesRegex(Halt, "one bounded repair"):
            self.factory.run(42)
        self.assertEqual(self.model_phases(), ["plan", "implement", "implement", "review"])
        self.assertEqual(self.state()["repair_kind"], "verification")
        self.assert_not_published()

    def test_review_repair_cannot_start_an_additional_check_repair(self):
        self.runtime.verification_failures = {2}
        self.runtime.verdicts = ["changes"]
        self.runtime.review_findings = [[review_fakes.FINDING]]
        with self.assertRaises(VerificationFailure):
            self.factory.run(42)
        self.assertEqual(self.model_phases(), ["plan", "implement", "review", "implement"])
        self.assertEqual(self.state()["repair_kind"], "review")
        self.assertEqual(len(self.runtime.review_heads), 1)
        self.assert_not_published()

    def test_untyped_timeout_or_cleanup_failure_does_not_enter_repair(self):
        self.runtime.non_verification_error = Halt("command timed out: docker")
        with self.assertRaisesRegex(Halt, "timed out"):
            self.factory.run(42)
        self.assertEqual(self.model_phases(), ["plan", "implement"])
        self.assertEqual(self.runtime.verify_calls, 1)
        self.assert_not_published()

    def test_failed_check_cannot_repair_a_source_mutation_from_verification(self):
        self.runtime.mutate_failed_verification = True
        with self.assertRaisesRegex(Halt, "verification modified source"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 1)
        self.assert_not_published()

    def test_stop_while_check_fails_prevents_the_repair_worker(self):
        self.runtime.stop_during_failed_verification = True
        with self.assertRaisesRegex(Halt, "STOP"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 1)
        self.assert_not_published()

    def test_unchanged_technical_repair_does_not_spend_another_verification(self):
        self.runtime.unchanged_repair = True
        with self.assertRaisesRegex(Halt, "no source changes"):
            self.factory.run(42)
        self.assertEqual(len(self.runtime.implement_prompts), 2)
        self.assertEqual(self.runtime.verify_calls, 1)
        self.assert_not_published()


class VerificationFailureTypeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.runner = Runner()
        self.runtime = DockerRuntime({"image": "homupe-factory:local"}, self.runner)

    def fail(self, command, error, log="FAIL application verification\n"):
        def call(_workspace, _argv, **kwargs):
            Path(kwargs["log"]).write_text(log)
            raise error
        self.runtime.call = Mock(side_effect=call)
        with self.assertRaises(Halt) as caught:
            self.runtime.verify(self.root, [command], self.root)
        return caught.exception

    def test_only_completed_application_checks_produce_repairable_failure(self):
        for command in (["npm", "run", "check"], ["npm", "run", "build:fixtures"],
                        ["npm", "run", "test:e2e"]):
            with self.subTest(command=command):
                error = self.fail(command, CommandFailure("docker", 1))
                self.assertIsInstance(error, VerificationFailure)
                self.assertEqual(error.step, " ".join(command))
                self.assertIn("FAIL application verification", error.diagnostics)

    def test_dependency_timeout_cleanup_and_docker_start_errors_are_not_repairable(self):
        variants = [(["npm", "ci"], CommandFailure("docker", 1), "FAIL dependency install\n"),
                    (["npm", "run", "check"], Halt("command timed out: docker"), ""),
                    (["npm", "run", "check"], Halt("container cleanup failed"), ""),
                    (["npm", "run", "check"], CommandFailure("docker", 125), "Error Docker startup\n"),
                    (["npm", "run", "check"], CommandFailure("docker", 126), "Error command unavailable\n"),
                    (["npm", "run", "check"], CommandFailure("docker", 127), "Error command missing\n"),
                    (["npm", "run", "check"], CommandFailure("docker", 137), "Killed\n"),
                    (["npm", "run", "check"], CommandFailure("docker", 143), "Terminated\n"),
                    (["npm", "run", "check"], CommandFailure("docker", -9), "Killed\n"),
                    (["npm", "run", "check"], CommandFailure("docker", 1), "Error ENOMEM\n"),
                    (["npm", "run", "check"], CommandFailure("docker", 1), "error ENOTFOUND registry.example\n")]
        for command, original, log in variants:
            with self.subTest(command=command, original=str(original), log=log):
                error = self.fail(command, original, log)
                self.assertNotIsInstance(error, VerificationFailure)

    def test_stop_preserves_original_failure_without_technical_repair_classification(self):
        self.runner.store = Store(self.root / "state")
        self.runner.store.stop()
        original = CommandFailure("docker", 1)
        self.assertIs(self.fail(["npm", "run", "check"], original), original)


if __name__ == "__main__":
    unittest.main()
