"""Real child supervision with fake GitHub reads and deferred remote writes."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch

from factory.core import Halt, Runner, Store, parse_json
from factory.github_host import GitHubControl, RECEIPT_MARKER
from factory.tests import test_github_host as host_fakes


class ChildFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "state")
        self.pid_file = self.root / "child.pid"
        self.heartbeat = self.root / "heartbeat"

    def child(self):
        # A fixed ten-second maximum also bounds the child if an assertion fails.
        script = (
            "import os,pathlib,sys,time\n"
            "pathlib.Path(sys.argv[1]).write_text(str(os.getpid()))\n"
            "pulse=pathlib.Path(sys.argv[2]); end=time.monotonic()+10\n"
            "while time.monotonic()<end:\n"
            " pulse.write_text(str(time.time_ns())); time.sleep(0.02)\n"
        )
        return [sys.executable, "-c", script, str(self.pid_file), str(self.heartbeat)]

    def wait_for_child(self, deadline):
        until = min(time.monotonic() + 1, deadline - .1)
        while not (self.pid_file.exists() and self.heartbeat.exists()):
            if time.monotonic() >= until:
                self.fail("child did not start before its bounded supervision deadline")
            time.sleep(.005)
        return int(self.pid_file.read_text())

    def assert_child_stopped(self):
        pid = int(self.pid_file.read_text())
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)
        pulse = self.heartbeat.read_text()
        time.sleep(.06)
        self.assertEqual(self.heartbeat.read_text(), pulse, "heartbeat continued after cleanup")


class SupervisionTests(ChildFixture, unittest.TestCase):
    def test_callback_receives_bounded_process_deadline_and_stop_kills_child(self):
        runner = Runner(self.store)
        runner.deadline = time.monotonic() + 2
        job_deadline = runner.deadline
        deadlines = []
        def stop(deadline):
            self.assertIs(type(deadline), float)
            self.assertGreater(deadline, time.monotonic())
            self.assertLessEqual(deadline, job_deadline + .1)
            deadlines.append(deadline)
            self.wait_for_child(deadline)
            self.store.stop()
        runner.control_check = stop
        with self.assertRaisesRegex(Halt, "STOP"):
            runner.run(self.child(), timeout=10)
        self.assertEqual(len(deadlines), 1)
        self.assert_child_stopped()

    def test_existing_stop_prevents_both_child_launch_and_control_callback(self):
        runner = Runner(self.store)
        runner.control_check = Mock()
        self.store.stop()
        with patch("factory.core.subprocess.Popen") as launch:
            with self.assertRaisesRegex(Halt, "STOP"):
                runner.run(self.child())
            launch.assert_not_called()
        runner.control_check.assert_not_called()

    def test_stop_before_due_control_check_kills_child_without_invoking_callback(self):
        runner = Runner(self.store)
        runner._next_control_check = time.monotonic() + 2
        runner.control_check = Mock()
        stop_finished = threading.Event()
        def stop_when_alive():
            try:
                until = time.monotonic() + 1
                while not self.heartbeat.exists() and time.monotonic() < until:
                    time.sleep(.005)
                self.store.stop()
            finally:
                stop_finished.set()
        thread = threading.Thread(target=stop_when_alive)
        thread.start()
        try:
            with self.assertRaisesRegex(Halt, "STOP"):
                runner.run(self.child(), timeout=3)
        finally:
            thread.join(timeout=2)
        self.assertTrue(stop_finished.is_set())
        runner.control_check.assert_not_called()
        self.assert_child_stopped()


class GitHubControlSupervisionTests(ChildFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.factory = host_fakes.FakeFactory(self.root / "factory")
        self.github = host_fakes.FakeGitHub()
        self.github.runner = Runner()  # Independent parent-only GitHub supervisor.
        self.control = GitHubControl(self.factory, self.github)
        self.factory.control = self.control
        self.store = self.factory.store
        fixed_stamp = patch("factory.github_host.stamp", return_value=host_fakes.CUTOFF)
        fixed_stamp.start()
        self.addCleanup(fixed_stamp.stop)
        self.control._load()

    def journal(self):
        return parse_json(self.control.path.read_bytes())

    def test_stop_command_defer_persists_outcome_and_receipt_without_remote_writes(self):
        self.github.add("/factory stop", comment_id=10)
        with self.store.lock():
            self.control.commands(in_run=True, defer=True)
        self.assertTrue(self.store.stopped())
        value = self.journal()
        self.assertEqual(value["cursor"]["comments"]["10"]["status"], "done")
        self.assertEqual(value["receipts"]["10"]["issue"], 42)
        self.assertIsInstance(value["receipts"]["10"]["message"], str)
        self.assertEqual(self.github.writes, [], "deferred supervision performed a remote mutation")
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_real_child_is_cleaned_up_before_deferred_stop_receipt_is_published(self):
        self.github.add("/factory stop", comment_id=10)
        runner = Runner(self.store)
        runner.deadline = time.monotonic() + 2
        original_gh_deadline = time.monotonic() + 100
        self.github.runner.deadline = original_gh_deadline
        callbacks = []
        def control_check(deadline):
            self.wait_for_child(deadline)
            callbacks.append(deadline)
            self.control.check(in_run=True, during_process=True, deadline=deadline)
            self.assertTrue(self.store.stopped())
            self.assertEqual(self.github.writes, [])
        runner.control_check = control_check
        with self.store.lock():
            with self.assertRaisesRegex(Halt, "STOP"):
                runner.run(self.child(), timeout=10)
            self.assert_child_stopped()
            self.assertEqual(len(callbacks), 1)
            self.assertEqual(self.github.runner.deadline, original_gh_deadline)
            self.assertEqual(self.journal()["cursor"]["comments"]["10"]["status"], "done")
            original_write = self.github.write
            def publish_after_cleanup(*args, **kwargs):
                self.assert_child_stopped()
                return original_write(*args, **kwargs)
            with patch.object(self.github, "write", side_effect=publish_after_cleanup) as write:
                self.control.sync()
                self.assertGreater(write.call_count, 0)
        self.assertEqual(len(self.github.marked(RECEIPT_MARKER + "10", "chronoll")), 1)
        self.assertEqual(self.factory.runtime.mock_calls, [])

    def test_process_control_check_clamps_github_budget_and_restores_prior_deadline(self):
        previous = time.monotonic() + 100
        self.github.runner.deadline = previous
        for remaining in (.5, 10):
            with self.subTest(remaining=remaining):
                self.control._next_check = 0
                before = time.monotonic()
                process_deadline = before + remaining
                observed = []
                def inspect(in_run, defer):
                    observed.append(self.github.runner.deadline)
                    self.assertTrue(in_run)
                    self.assertTrue(defer)
                with patch.object(self.control, "commands", side_effect=inspect):
                    self.control.check(in_run=True, during_process=True, deadline=process_deadline)
                self.assertEqual(len(observed), 1)
                self.assertLessEqual(observed[0], process_deadline)
                self.assertLessEqual(observed[0], before + 4.05)
                self.assertGreater(observed[0], before)
                self.assertEqual(self.github.runner.deadline, previous)


if __name__ == "__main__":
    unittest.main()
