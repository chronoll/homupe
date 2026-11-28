"""Selected verification diagnostics from fake calls; no npm/API/model runs."""
from __future__ import annotations

from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

from factory.core import Halt, Runner, Store
from factory.runtime import DockerRuntime


COMMANDS = [["npm", "ci"], ["npm", "run", "check"],
            ["npm", "run", "build:fixtures"], ["npm", "run", "test:e2e"]]


class VerificationDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / "workspace"
        self.logs = self.root / "logs"
        self.work.mkdir()
        self.logs.mkdir()
        self.runner = Runner()
        self.runtime = DockerRuntime({"image": "homupe-factory:local"}, self.runner)

    def fail_with(self, output=None, error=None, commands=None):
        error = error or Halt("command failed (1): docker; see job logs")
        def fail(_workspace, _argv, **kwargs):
            if output is not None:
                Path(kwargs["log"]).write_text(output)
            raise error
        self.runtime.call = Mock(side_effect=fail)
        with self.assertRaises(Halt) as caught:
            self.runtime.verify(self.work, commands or [COMMANDS[1]], self.logs)
        return caught.exception

    def test_each_fixed_failed_command_is_identified_and_later_steps_do_not_run(self):
        for index, command in enumerate(COMMANDS):
            with self.subTest(command=command):
                original = Halt("command failed (1): docker; see job logs")
                def call(_workspace, argv, **kwargs):
                    if argv == command:
                        Path(kwargs["log"]).write_text("FAIL fixed verification step\n")
                        raise original
                    return ""
                self.runtime.call = Mock(side_effect=call)
                with self.assertRaises(Halt) as caught:
                    self.runtime.verify(self.work, COMMANDS, self.logs)
                self.assertTrue(str(caught.exception).startswith("検証失敗: " + " ".join(command) + " | "))
                self.assertIn("FAIL fixed verification step", str(caught.exception))
                self.assertIs(caught.exception.__cause__, original)
                self.assertEqual(self.runtime.call.call_count, index + 1)

    def test_selects_actionable_lines_and_redacts_secret_mention_path_and_url(self):
        output = (
            "Ordinary output must remain private and unselected.\n"
            "FAIL src/components/Thing.test.tsx\n"
            "error TS2322: Type string is not assignable to number.\n"
            "error token=super-secret-value @chronoll /Users/owner/private/config.json https://secret.example/x\n"
            "lint **unsafe** <script>markdown</script>\n"
        )
        error = self.fail_with(output)
        summary = str(error)
        self.assertIn("npm run check", summary)
        self.assertIn("FAIL src/components/Thing.test.tsx", summary)
        self.assertIn("TS2322", summary)
        self.assertIn("＠chronoll", summary)
        self.assertIn("credential redacted", summary)
        self.assertIn("local path redacted", summary)
        self.assertIn("URL redacted", summary)
        self.assertIn(r"\*\*unsafe\*\*", summary)
        self.assertIn(r"\<script\>", summary)
        for private in ("Ordinary output", "super-secret-value", "/Users/owner", "https://secret.example"):
            self.assertNotIn(private, summary)

    def test_diagnostics_remain_bounded_after_markdown_escaping(self):
        error = self.fail_with("error " + "*[]<>" * 1000 + "\n")
        summary = str(error).split(" | ", 1)[1]
        self.assertLessEqual(len(summary), 600)
        self.assertTrue(summary.endswith("…"))

    def test_bounded_tail_finds_the_final_error_without_dumping_progress(self):
        output = "ordinary progress output\n" * 30000 + "error TS2307: Cannot find module required-helper.\n"
        self.assertGreater(len(output), 512 * 1024)
        error = self.fail_with(output)
        self.assertIn("TS2307", str(error))
        self.assertNotIn("ordinary progress", str(error))

    def test_timeout_without_a_log_still_names_the_fixed_command_and_reason(self):
        original = Halt("command timed out: docker")
        error = self.fail_with(error=original, commands=[COMMANDS[3]])
        self.assertIn("検証失敗: npm run test:e2e | command timed out: docker", str(error))
        self.assertIs(error.__cause__, original)

    def test_stop_from_the_store_preserves_the_original_exception(self):
        store = Store(self.root / "state")
        self.runner.store = store
        original = Halt("local STOP requested")
        def stop(_workspace, _argv, **_kwargs):
            store.stop()
            raise original
        self.runtime.call = Mock(side_effect=stop)
        with self.assertRaises(Halt) as caught:
            self.runtime.verify(self.work, COMMANDS, self.logs)
        self.assertIs(caught.exception, original)
        self.assertNotIn("検証失敗", str(caught.exception))
        self.assertEqual(self.runtime.call.call_count, 1)

    def test_original_stop_without_a_store_is_not_reclassified(self):
        original = Halt("local STOP requested")
        self.assertIs(self.fail_with(error=original), original)

    def test_unrecognized_argv_is_not_echoed_into_public_failure_text(self):
        error = self.fail_with("FAIL example\n", commands=[["private-command", "secret-argument"]])
        self.assertIn("検証失敗: verification step 1", str(error))
        self.assertNotIn("private-command", str(error))
        self.assertNotIn("secret-argument", str(error))


if __name__ == "__main__":
    unittest.main()
