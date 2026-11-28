"""Offline LaunchAgent contracts; all service/VM/dispatcher calls are fakes."""
from pathlib import Path
import json
import os
import plistlib
import shlex
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from factory import launchd
from factory.core import Busy, Halt


class FakeFactory:
    def __init__(self, runtime):
        self.runtime = runtime
        self.sync_controls = Mock(return_value={"status": "synced"})
        self.control = SimpleNamespace(queue_failure=Mock())


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.home = self.root / "fake-home"
        self.home.mkdir()
        self.repo = self.root / "checkout 'quoted'; $(not-a-command)"
        self.repo.mkdir()
        self.runtime = self.root / "runtime 'quoted'; $(not-a-command)"
        self.runtime.mkdir()
        (self.runtime / "env.sh").write_text("# prepared test runtime\n")
        home = patch.object(launchd.Path, "home", return_value=self.home)
        home.start()
        self.addCleanup(home.stop)
        self.service = launchd.Service(self.repo, self.runtime)
        self.loaded = False
        self.events = []
        self.observe_ctl = None
        self.ctl_failure = None
        controller = patch.object(self.service, "ctl", side_effect=self.ctl)
        self.ctl_mock = controller.start()
        self.addCleanup(controller.stop)
        self.agent_runtime = SimpleNamespace(orphan_containers=Mock(return_value=[]), remove_orphans=Mock())
        self.fake_factory = FakeFactory(self.agent_runtime)
        factory = patch.object(launchd, "Factory", return_value=self.fake_factory)
        self.factory_mock = factory.start()
        self.addCleanup(factory.stop)
        docker = patch.object(launchd.shutil, "which", return_value="/fake/docker")
        self.which_mock = docker.start()
        self.addCleanup(docker.stop)
        dispatch = patch.object(launchd, "dispatch", return_value=0)
        self.dispatch_mock = dispatch.start()
        self.addCleanup(dispatch.stop)
        runner = patch.object(launchd, "Runner")
        self.runner_class = runner.start()
        self.addCleanup(runner.stop)
        self.runner = self.runner_class.return_value

    def ctl(self, *args, check=True):
        self.events.append(args)
        if self.observe_ctl:
            self.observe_ctl(args)
        if self.ctl_failure and args[0] == self.ctl_failure:
            raise Halt("simulated launchctl " + args[0] + " failure")
        if args[0] == "print":
            output = "state = running\nlast exit code = 0\n" if self.loaded else ""
            return subprocess.CompletedProcess(args, 0 if self.loaded else 3, output, "")
        if args[0] == "bootstrap":
            if self.loaded:
                raise Halt("an existing service was bootstrapped again")
            self.loaded = True
        elif args[0] == "bootout":
            self.loaded = False
        return subprocess.CompletedProcess(args, 0, "", "")

    def installed_plist(self, repo=None):
        self.service.plist.parent.mkdir(parents=True, exist_ok=True)
        self.service.plist.write_bytes(plistlib.dumps(launchd.property_list(repo or self.repo, self.runtime)))

    def vm_profile(self):
        profile = self.runtime / "colima/default/colima.yaml"
        profile.parent.mkdir(parents=True)
        profile.write_text("# existing factory profile\n")

    def assert_poll_once(self):
        self.dispatch_mock.assert_called_once_with(["--repo", str(self.repo), "poll", "--execute"])

    def test_plist_is_fixed_periodic_one_shot_with_literal_paths(self):
        value = plistlib.loads(plistlib.dumps(launchd.property_list(self.repo, self.runtime)))
        self.assertEqual(value["Label"], "com.chronoll.homupe.factory")
        self.assertEqual(value["StartInterval"], 300)
        self.assertIs(value["RunAtLoad"], True)
        self.assertIs(value["KeepAlive"], False)
        self.assertEqual(value["Umask"], 0o077)
        self.assertEqual(value["ProgramArguments"], ["/bin/bash", str(self.runtime / "watch.command")])
        self.assertEqual(value["WorkingDirectory"], str(self.repo))
        self.assertEqual(value["EnvironmentVariables"],
                         {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(value["StandardOutPath"], str(self.runtime / "launchd.stdout.log"))
        self.assertEqual(value["StandardErrorPath"], str(self.runtime / "launchd.stderr.log"))

    def test_wrapper_quotes_shell_metacharacters_and_has_no_execution_loop(self):
        script = launchd.wrapper(self.repo, self.runtime)
        lines = script.splitlines()
        self.assertEqual(lines[:3], ["#!/bin/bash", "set -eu", "umask 077"])
        self.assertEqual(shlex.split(lines[3]), ["cd", str(self.repo)])
        self.assertEqual(shlex.split(lines[4]), [".", str(self.runtime / "env.sh")])
        self.assertEqual(shlex.split(lines[5]), ["exec", "/usr/bin/python3", "-B", "-m", "factory.launchd",
            "--repo", str(self.repo), "--runtime", str(self.runtime), "tick"])
        self.assertEqual(len(lines), 6)

    def test_install_validates_config_and_loads_paused_with_private_files(self):
        result = self.service.install()
        self.factory_mock.assert_any_call(self.repo)
        self.assertTrue(result["installed"])
        self.assertTrue(result["registered"])
        self.assertTrue(result["stopped"])
        self.assertTrue(self.service.store.stopped())
        expected = launchd.property_list(self.repo, self.runtime)
        self.assertEqual(plistlib.loads(self.service.plist.read_bytes()), expected)
        for path, mode in ((self.runtime / "watch.command", 0o700),
                           (self.runtime / (launchd.LABEL + ".plist"), 0o600),
                           (self.service.plist, 0o600), (self.service.settings, 0o600)):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), mode, path)
        for name in ("watch.log", "launchd.stdout.log", "launchd.stderr.log"):
            self.assertEqual(stat.S_IMODE((self.runtime / name).stat().st_mode), 0o600)
        settings = json.loads(self.service.settings.read_text())
        self.assertEqual(settings["repo"], str(self.repo))
        self.assertEqual(settings["runtime"], str(self.runtime))
        self.assertEqual(settings["interval_seconds"], 300)
        operations = [event[0] for event in self.events]
        self.assertLess(operations.index("disable"), operations.index("bootstrap"))
        self.dispatch_mock.assert_not_called()

    def test_another_checkout_cannot_be_installed_started_or_stopped(self):
        self.installed_plist(self.root / "another-checkout")
        for command in ("install", "start", "stop"):
            with self.subTest(command=command), self.assertRaisesRegex(Halt, "another checkout"):
                getattr(self.service, command)()
        self.ctl_mock.assert_not_called()
        self.assertFalse(self.service.store.stopped())
        self.assertFalse((self.runtime / "watch.command").exists())

    def test_symlink_launchagent_is_rejected_before_service_mutation(self):
        other = self.root / "other.plist"
        other.write_bytes(plistlib.dumps(launchd.property_list(self.repo, self.runtime)))
        self.service.plist.parent.mkdir(parents=True)
        self.service.plist.symlink_to(other)
        for command in ("install", "start", "stop"):
            with self.subTest(command=command), self.assertRaises(Halt):
                getattr(self.service, command)()
        self.ctl_mock.assert_not_called()
        self.assertFalse(self.service.store.stopped())

    def test_start_requires_installation_and_does_not_implicitly_resume(self):
        self.service.store.stop()
        with self.assertRaisesRegex(Halt, "install"):
            self.service.start()
        self.assertTrue(self.service.store.stopped())
        self.ctl_mock.assert_not_called()

    def test_explicit_start_bootstraps_once_and_clears_stop(self):
        self.installed_plist()
        self.service.store.stop()
        result = self.service.start()
        self.assertFalse(self.service.store.stopped())
        self.assertTrue(result["registered"])
        self.assertEqual([event[0] for event in self.events], ["enable", "print", "bootstrap", "print"])
        self.assertEqual(self.events[2], ("bootstrap", self.service.domain, str(self.service.plist)))
        self.dispatch_mock.assert_not_called()

    def test_start_of_loaded_service_never_bootstraps_or_kills_it(self):
        self.installed_plist()
        self.loaded = True
        self.service.store.stop()
        self.service.start()
        self.assertFalse(self.service.store.stopped())
        self.assertIn(("kickstart", self.service.target), self.events)
        self.assertFalse(any(event[0] in {"bootstrap", "bootout"} or "-k" in event for event in self.events))

    def test_start_failure_restores_stop_without_retry(self):
        self.installed_plist()
        self.service.store.stop()
        self.ctl_failure = "bootstrap"
        with self.assertRaisesRegex(Halt, "bootstrap"):
            self.service.start()
        self.assertTrue(self.service.store.stopped())
        self.assertEqual(sum(event[0] == "bootstrap" for event in self.events), 1)
        self.dispatch_mock.assert_not_called()

    def test_busy_controller_prevents_start_from_clearing_stop_or_launching(self):
        self.installed_plist()
        self.service.store.stop()
        with patch.object(self.service.store, "lock", side_effect=Busy("another dispatcher")):
            with self.assertRaises(Busy):
                self.service.start()
        self.assertTrue(self.service.store.stopped())
        self.ctl_mock.assert_not_called()

    def test_stop_is_persisted_before_unregister_and_orphan_removal(self):
        self.installed_plist()
        self.loaded = True
        self.observe_ctl = lambda _args: self.assertTrue(self.service.store.stopped())
        self.agent_runtime.orphan_containers.side_effect = lambda: self.assertTrue(self.service.store.stopped()) or ["a" * 64]
        self.agent_runtime.remove_orphans.side_effect = lambda _ids: self.assertTrue(self.service.store.stopped())
        result = self.service.stop()
        self.assertEqual([event[0] for event in self.events], ["disable", "print", "bootout"])
        self.assertTrue(result["stopped"])
        self.assertTrue(result["disabled"])
        self.assertTrue(self.service.store.stopped())
        self.agent_runtime.remove_orphans.assert_called_once_with(["a" * 64])
        self.dispatch_mock.assert_not_called()

    def test_stop_of_unregistered_service_keeps_stop_and_does_not_bootout(self):
        result = self.service.stop()
        self.assertTrue(result["stopped"])
        self.assertTrue(self.service.store.stopped())
        self.assertEqual([event[0] for event in self.events], ["disable", "print"])
        self.agent_runtime.orphan_containers.assert_called_once_with()

    def test_stop_keeps_pause_when_launchctl_or_docker_cleanup_fails(self):
        self.installed_plist()
        self.loaded = True
        self.ctl_failure = "disable"
        with self.assertRaises(Halt):
            self.service.stop()
        self.assertTrue(self.service.store.stopped())
        self.agent_runtime.orphan_containers.assert_not_called()
        self.ctl_failure = None
        self.agent_runtime.orphan_containers.side_effect = Halt("invalid Docker container listing")
        with self.assertRaisesRegex(Halt, "invalid Docker"):
            self.service.stop()
        self.assertFalse(self.loaded)
        self.assertTrue(self.service.store.stopped())
        self.agent_runtime.remove_orphans.assert_not_called()

    def test_stop_does_not_claim_cleanup_if_docker_is_missing(self):
        self.which_mock.return_value = None
        with self.assertRaisesRegex(Halt, "cleanup.*verified"):
            self.service.stop()
        self.assertTrue(self.service.store.stopped())
        self.agent_runtime.orphan_containers.assert_not_called()

    def test_paused_tick_still_synchronizes_github_controls_without_waking_vm(self):
        self.service.store.stop()
        self.assertEqual(self.service.tick(), 0)
        self.runner_class.assert_not_called()
        self.factory_mock.assert_called_once_with(self.repo)
        self.fake_factory.sync_controls.assert_called_once_with()
        self.assert_poll_once()
        self.assertTrue(self.service.store.stopped())
        self.assertEqual(stat.S_IMODE((self.runtime / "watch.log").stat().st_mode), 0o600)

    def test_healthy_vm_tick_checks_docker_then_polls_once(self):
        self.assertEqual(self.service.tick(), 0)
        self.fake_factory.sync_controls.assert_called_once_with()
        self.runner.run.assert_called_once_with(["docker", "info"], timeout=15)
        self.assert_poll_once()

    def test_github_resume_clears_stop_before_cold_vm_start_and_poll(self):
        self.service.store.stop()
        self.vm_profile()
        order = []
        def resume():
            order.append("controls")
            (self.service.store.root / "STOP").unlink()
            return {"status": "synced"}
        def run(argv, **_kwargs):
            self.assertFalse(self.service.store.stopped())
            order.append(argv[0])
            if argv == ["docker", "info"]:
                raise Halt("VM stopped")
            return ""
        self.fake_factory.sync_controls.side_effect = resume
        self.runner.run.side_effect = run
        self.dispatch_mock.side_effect = lambda _argv: order.append("poll") or 0
        self.assertEqual(self.service.tick(), 0)
        self.assertEqual(order, ["controls", "docker", "colima", "poll"])
        self.assertFalse(self.service.store.stopped())
        self.assert_poll_once()

    def test_github_stop_prevents_vm_start_in_the_same_tick(self):
        def stop():
            self.service.store.stop()
            return {"status": "synced"}
        self.fake_factory.sync_controls.side_effect = stop
        self.assertEqual(self.service.tick(), 0)
        self.runner_class.assert_not_called()
        self.assertTrue(self.service.store.stopped())
        self.assert_poll_once()

    def test_busy_control_sync_skips_without_stopping_or_waking_vm(self):
        for outcome in (Busy("active dispatcher"), {"status": "busy"}):
            with self.subTest(outcome=outcome):
                self.fake_factory.sync_controls.side_effect = outcome if isinstance(outcome, Busy) else None
                self.fake_factory.sync_controls.return_value = outcome
                self.assertEqual(self.service.tick(), 0)
                self.assertFalse(self.service.store.stopped())
                self.assertEqual(json.loads((self.service.store.root / "watch.json").read_text())["status"], "busy")
        self.runner_class.assert_not_called()
        self.dispatch_mock.assert_not_called()

    def test_control_read_failure_is_retryable_without_vm_or_new_stop(self):
        self.fake_factory.sync_controls.side_effect = Halt("GitHub unavailable")
        self.assertEqual(self.service.tick(), 1)
        self.assertFalse(self.service.store.stopped())
        self.runner_class.assert_not_called()
        self.dispatch_mock.assert_not_called()
        status = json.loads((self.service.store.root / "watch.json").read_text())
        self.assertEqual(status["status"], "error")
        self.assertEqual(status["reason"], "GitHub control synchronization failed")

    def test_missing_vm_profile_stops_before_dispatch_or_vm_creation(self):
        self.runner.run.side_effect = Halt("VM stopped")
        self.assertEqual(self.service.tick(), 1)
        self.assertEqual(self.runner.run.call_count, 1)
        self.dispatch_mock.assert_not_called()
        self.assertTrue(self.service.store.stopped())
        self.assertEqual(json.loads((self.service.store.root / "watch.json").read_text())["status"], "needs-human")
        self.fake_factory.control.queue_failure.assert_called_once_with("runtime-unavailable")

    def test_known_vm_profile_uses_fixed_limits_and_polls_once_after_start(self):
        self.vm_profile()
        self.runner.run.side_effect = [Halt("VM stopped"), ""]
        self.assertEqual(self.service.tick(), 0)
        self.assertEqual(self.runner.run.call_count, 2)
        call = self.runner.run.call_args_list[1]
        argv = call.args[0]
        self.assertEqual(argv[:2], ["colima", "start"])
        for flag, value in (("--vm-type", "vz"), ("--arch", "aarch64"), ("--cpus", "2"),
                            ("--memory", "6"), ("--disk", "40"), ("--mount", str(self.repo) + ":w")):
            self.assertEqual(argv[argv.index(flag) + 1], value)
        for flag in ("--ssh-config=false", "--ssh-agent=false", "--activate=false", "--binfmt=false"):
            self.assertIn(flag, argv)
        self.assertEqual(call.kwargs["timeout"], 180)
        self.assert_poll_once()

    def test_vm_start_failure_persists_stop_and_never_dispatches(self):
        self.vm_profile()
        self.runner.run.side_effect = [Halt("VM stopped"), Halt("VM could not start")]
        self.assertEqual(self.service.tick(), 1)
        self.assertTrue(self.service.store.stopped())
        self.dispatch_mock.assert_not_called()
        self.fake_factory.control.queue_failure.assert_called_once_with("runtime-unavailable")

    def test_runtime_failure_notification_follows_stop_and_uses_only_fixed_code(self):
        self.runner.run.side_effect = OSError("private host path /Users/owner/runtime failed")
        def notify(code):
            self.assertTrue(self.service.store.stopped())
            self.assertEqual(code, "runtime-unavailable")
        self.fake_factory.control.queue_failure.side_effect = notify
        self.assertEqual(self.service.tick(), 1)
        self.fake_factory.control.queue_failure.assert_called_once_with("runtime-unavailable")
        self.dispatch_mock.assert_not_called()

    def test_runtime_notification_failure_keeps_stop_and_does_not_retry_vm(self):
        self.vm_profile()
        self.runner.run.side_effect = [Halt("VM stopped"), Halt("VM could not start")]
        self.fake_factory.control.queue_failure.side_effect = Halt("GitHub notification unavailable")
        self.assertEqual(self.service.tick(), 1)
        self.assertTrue(self.service.store.stopped())
        self.assertEqual(self.runner.run.call_count, 2)
        self.fake_factory.control.queue_failure.assert_called_once_with("runtime-unavailable")
        self.dispatch_mock.assert_not_called()
        self.assertEqual(json.loads((self.service.store.root / "watch.json").read_text())["status"], "needs-human")

    def test_short_custom_colima_home_preserves_existing_vm_startup(self):
        colima_home = self.runtime / "c"
        profile = colima_home / "default/colima.yaml"
        profile.parent.mkdir(parents=True)
        profile.write_text("# existing relocated profile\n")
        self.runner.run.side_effect = [Halt("VM stopped"), ""]
        with patch.dict(launchd.os.environ, {"COLIMA_HOME": str(colima_home)}):
            self.assertEqual(self.service.tick(), 0)
        self.assertEqual(self.runner.run.call_count, 2)
        self.assert_poll_once()

    def test_stop_arriving_after_docker_failure_prevents_vm_start(self):
        self.vm_profile()
        def stopped(_argv, **_kwargs):
            self.service.store.stop()
            raise Halt("VM stopped")
        self.runner.run.side_effect = stopped
        self.assertEqual(self.service.tick(), 1)
        self.runner.run.assert_called_once_with(["docker", "info"], timeout=15)
        self.dispatch_mock.assert_not_called()

    def test_rotation_keeps_launchd_log_inode_bounds_backup_and_private_modes(self):
        path = self.runtime / "watch.log"
        path.write_bytes(b"old" + b"x" * launchd.LOG_LIMIT)
        inode = path.stat().st_ino
        launchd.rotate(path)
        self.assertEqual(path.stat().st_ino, inode)
        self.assertEqual(path.read_bytes(), b"")
        backup = path.with_name("watch.log.1")
        self.assertEqual(backup.read_bytes(), b"x" * launchd.LOG_LIMIT)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)

    def test_service_file_writer_rejects_symlinks_and_unfinished_replacements(self):
        target = self.runtime / "service.plist"
        other = self.root / "outside"
        other.write_text("preserve")
        target.symlink_to(other)
        with self.assertRaises(Halt):
            launchd.write_private(target, "replacement")
        self.assertEqual(other.read_text(), "preserve")
        target.unlink()
        temporary = target.with_name(target.name + ".tmp")
        temporary.write_text("unfinished evidence")
        with self.assertRaises(Halt):
            launchd.write_private(target, "replacement")
        self.assertEqual(temporary.read_text(), "unfinished evidence")
        self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
