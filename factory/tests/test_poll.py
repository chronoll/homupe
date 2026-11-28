"""Scheduled ticks use fake GitHub/Docker boundaries and never start models."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from factory.core import Busy, Halt, Runner, Store, parse_json
from factory.runtime import DockerRuntime, MANAGED_REPOSITORY_LABEL, MANAGED_UID_LABEL
from factory.tests import test_dispatcher as contracts


class PollRuntime(contracts.FakeRuntime):
    def __init__(self):
        super().__init__()
        self.orphans = []
        self.inspections = 0
        self.removed = []
        self.cleanup_error = False
        self.store = None

    def orphan_containers(self):
        self.inspections += 1
        return list(self.orphans)

    def remove_orphans(self, identifiers):
        assert self.store.stopped(), "STOP must be durable before orphan removal"
        self.removed.extend(identifiers)
        if self.cleanup_error:
            raise Halt("simulated Docker cleanup failure")


class PollTests(unittest.TestCase):
    def setUp(self):
        contracts.PipelineTests.setUp(self)
        self.runtime = PollRuntime()
        self.runtime.store = self.factory.store
        self.factory.runtime = self.runtime
        self.queue = []
        self.queue_reads = 0

        def pending():
            self.queue_reads += 1
            return copy.deepcopy(self.queue)
        self.github.pending = pending

    def watch(self):
        return parse_json((self.factory.store.root / "watch.json").read_bytes())

    def assert_no_ai_or_writes(self):
        self.assertEqual(self.runtime.calls, [])
        self.assertEqual(self.runner.pushes, [])
        self.assertEqual(self.github.drafts, [])

    def test_idle_tick_exits_without_ai_or_claim(self):
        result = self.factory.poll()
        self.assertEqual(result, {"status": "idle", "processed": 0, "stopped": False})
        self.assertEqual(self.queue_reads, 1)
        self.assertFalse((self.factory.store.root / "jobs").exists())
        self.assert_no_ai_or_writes()
        watch = self.watch()
        self.assertEqual(watch["status"], "idle")
        self.assertIsInstance(watch["last_checked"], float)
        self.assertNotIn("body", json.dumps(watch))
        self.assertEqual((self.factory.store.root / "watch.json").stat().st_mode & 0o777, 0o600)

    def test_trusted_queue_is_sorted_and_only_one_job_runs(self):
        self.queue = [{**contracts.issue(), "number": 100},
                      {**contracts.issue(), "number": 1, "user": {"login": "outsider"}},
                      contracts.issue()]
        result = self.factory.poll()
        self.assertEqual(result["status"], "processed")
        self.assertEqual(result["processed"], 1)
        self.assertEqual(result["issue"], 42)
        self.assertEqual(self.queue_reads, 1)
        self.assertEqual(len(self.github.drafts), 1)
        self.assertEqual(self.runtime.calls, ["preflight", "plan", "implement", "verify", "review"])
        self.assertIsNone(self.runner.deadline)
        self.assertFalse(self.factory.store.job(100).exists())

    def test_terminal_claims_are_skipped_without_implicit_retry(self):
        self.queue = [contracts.issue()]
        self.factory.store.claim(42, contracts.issue())
        for phase in ("needs-human", "draft-pr"):
            with self.subTest(phase=phase):
                self.factory.store.save(42, phase)
                self.assertEqual(self.factory.poll()["status"], "idle")
        self.assert_no_ai_or_writes()

    def test_busy_tick_is_a_normal_skip(self):
        with Store(self.factory.store.root).lock():
            self.assertEqual(self.factory.poll()["status"], "busy")
        self.assertEqual(self.runtime.inspections, 0)
        self.assertEqual(self.queue_reads, 0)
        self.assert_no_ai_or_writes()
        self.assertEqual(self.watch()["status"], "busy")
        self.assertTrue(issubclass(Busy, Halt))

    def test_stop_prevents_even_queue_and_container_inspection(self):
        self.factory.store.stop()
        self.assertEqual(self.factory.poll()["status"], "stopped")
        self.assertEqual(self.runtime.inspections, 0)
        self.assertEqual(self.queue_reads, 0)
        self.assert_no_ai_or_writes()

    def test_nonterminal_state_is_retained_as_needs_human_and_stops_polling(self):
        self.factory.store.claim(42, contracts.issue())
        self.factory.store.save(42, "publishing", head_sha="a" * 40)
        result = self.factory.poll()
        self.assertEqual(result["status"], "needs-human")
        self.assertEqual(result["interrupted_jobs"], [42])
        state = parse_json((self.factory.store.job(42) / "state.json").read_bytes())
        self.assertEqual(state["phase"], "needs-human")
        self.assertEqual(state["previous_phase"], "publishing")
        self.assertEqual(state["head_sha"], "a" * 40)
        self.assertTrue(self.factory.store.stopped())
        self.assertEqual(self.queue_reads, 0)
        self.assert_no_ai_or_writes()

    def test_missing_corrupt_and_invalid_state_stay_as_crash_evidence(self):
        variants = [None, b'{"phase":', b'[]', b'{"phase":"draft-pr"}']
        for index, raw in enumerate(variants):
            with self.subTest(raw=raw):
                number = 100 + index
                job = self.factory.store.job(number)
                job.mkdir(parents=True)
                if raw is not None:
                    (job / "state.json").write_bytes(raw)
                result = self.factory.poll()
                self.assertEqual(result["status"], "needs-human")
                self.assertIn(number, result["interrupted_jobs"])
                self.assertTrue(self.factory.store.stopped())
                if raw is None:
                    self.assertFalse((job / "state.json").exists())
                else:
                    self.assertEqual((job / "state.json").read_bytes(), raw)
                (self.factory.store.root / "STOP").unlink()
        self.assert_no_ai_or_writes()

    def test_explicit_retry_archives_are_not_active_jobs(self):
        archive = self.factory.store.root / "jobs" / "42.attempt-1234"
        archive.mkdir(parents=True)
        self.assertEqual(self.factory.poll()["status"], "idle")
        self.assertFalse(self.factory.store.stopped())
        self.assert_no_ai_or_writes()

    def test_orphans_are_removed_only_after_stop_and_no_job_starts(self):
        self.runtime.orphans = ["a" * 64]
        self.queue = [contracts.issue()]
        result = self.factory.poll()
        self.assertEqual(result["status"], "needs-human")
        self.assertEqual(result["orphan_containers_removed"], 1)
        self.assertEqual(self.runtime.removed, ["a" * 64])
        self.assertTrue(self.factory.store.stopped())
        self.assertEqual(self.queue_reads, 0)
        self.assert_no_ai_or_writes()

    def test_failed_orphan_removal_retains_stop(self):
        self.runtime.orphans = ["a" * 64]
        self.runtime.cleanup_error = True
        with self.assertRaisesRegex(Halt, "cleanup"):
            self.factory.poll()
        self.assertTrue(self.factory.store.stopped())
        self.assertEqual(self.watch()["status"], "needs-human")
        self.assert_no_ai_or_writes()

    def test_failure_after_claim_stops_all_later_ticks_without_retry(self):
        self.queue = [contracts.issue()]
        self.runtime.fail_at = "plan"
        with self.assertRaisesRegex(Halt, "simulated plan"):
            self.factory.poll()
        state = parse_json((self.factory.store.job(42) / "state.json").read_bytes())
        self.assertEqual(state["phase"], "needs-human")
        self.assertTrue(self.factory.store.stopped())
        calls = list(self.runtime.calls)
        self.assertEqual(self.factory.poll()["status"], "stopped")
        self.assertEqual(self.runtime.calls, calls)
        self.assertEqual(self.queue_reads, 1)
        self.assertIsNone(self.runner.deadline)
        self.assertEqual(self.runner.pushes, [])

    def test_read_failure_before_claim_is_retryable_without_subscription_use(self):
        self.github.pending = lambda: (_ for _ in ()).throw(Halt("temporary read failure"))
        with self.assertRaisesRegex(Halt, "read failure"):
            self.factory.poll()
        self.assertFalse(self.factory.store.stopped())
        self.assertEqual(self.watch()["status"], "error")
        self.assertFalse((self.factory.store.root / "jobs").exists())
        self.assert_no_ai_or_writes()
        self.github.pending = lambda: []
        self.assertEqual(self.factory.poll()["status"], "idle")


class RuntimeRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.config = {"image": "homupe-factory:local"}
        self.runtime = DockerRuntime(self.config, Runner())

    def test_all_runtime_commands_have_repo_and_uid_labels(self):
        command = self.runtime.command(Path.cwd(), ["true"])
        labels = [command[index + 1] for index, item in enumerate(command) if item == "--label"]
        self.assertEqual(labels, [MANAGED_REPOSITORY_LABEL, MANAGED_UID_LABEL + str(os.getuid())])

    def test_recovery_filters_managed_labels_and_exact_legacy_names(self):
        managed, legacy, unrelated = "a" * 64, "b" * 64, "c" * 64
        listing = (legacy + " homupe-factory-" + "f" * 32 + "\n" +
                   unrelated + " homupe-factory-my-unrelated-service\n")
        with patch("factory.runtime.Runner") as supervisor:
            supervisor.return_value.run.side_effect = [managed + "\n", listing]
            self.assertEqual(self.runtime.orphan_containers(), [managed, legacy])
            first = supervisor.return_value.run.call_args_list[0].args[0]
            self.assertIn("label=" + MANAGED_REPOSITORY_LABEL, first)
            self.assertIn("label=" + MANAGED_UID_LABEL + str(os.getuid()), first)
            self.assertIn("--no-trunc", first)

    def test_cleanup_uses_fresh_supervisor_and_only_validated_ids(self):
        with patch("factory.runtime.Runner") as supervisor:
            self.runtime.remove_orphans(["a" * 64])
            supervisor.assert_called_once_with()
            supervisor.return_value.run.assert_called_once_with(
                ["docker", "rm", "-f", "a" * 64], timeout=30)
        with patch("factory.runtime.Runner") as supervisor:
            with self.assertRaisesRegex(Halt, "unverified"):
                self.runtime.remove_orphans(["--all"])
            supervisor.assert_not_called()

    def test_short_or_malformed_docker_ids_are_rejected(self):
        for output in ("short\n", "--all\n"):
            with self.subTest(output=output), patch("factory.runtime.Runner") as supervisor:
                supervisor.return_value.run.return_value = output
                with self.assertRaisesRegex(Halt, "invalid managed"):
                    self.runtime.orphan_containers()


if __name__ == "__main__":
    unittest.main()
