"""CI-only, credential-free check of the real container and verification path."""
from pathlib import Path
import shutil
import tempfile

from factory.core import Runner, Store, git, parse_json
from factory.dispatcher import config_at, snapshot
from factory.runtime import DockerRuntime


def main():
    repo = Path.cwd()
    with tempfile.TemporaryDirectory(prefix="homupe-factory-smoke-") as temp:
        root = Path(temp)
        work = root / "workspace"
        runner = Runner(Store(root / "state"))
        snapshot(runner, repo, git(runner, repo, "rev-parse", "HEAD"), work, root / "source.tar")
        runtime = DockerRuntime(config_at(repo), runner)
        runtime.pin_image(parse_json(runner.run(["docker", "image", "inspect", runtime.image])))
        # No AI homes mounted. Exercise read-only source/root and absence of all
        # credential entry points without reading secrets or contacting providers.
        probe = """import os,pathlib
assert not pathlib.Path('/workspace/.git').exists()
assert not pathlib.Path('/var/run/docker.sock').exists()
assert not pathlib.Path('/home/node/.config/gh').exists()
assert not any(os.environ.get(k) for k in ['OPENAI_API_KEY','CODEX_API_KEY','ANTHROPIC_API_KEY'])
assert os.environ['GH_TOKEN']=='factory-disabled'
for path in ['/workspace/README.md','/etc/factory-probe']:
 try:
  pathlib.Path(path).write_text('must fail')
 except OSError:
  pass
 else:
  raise AssertionError('read-only boundary failed: '+path)
print('container boundaries verified')
"""
        print(runtime.call(work, ["python3", "-c", probe], readonly=True, network=False), flush=True)
        print(runtime.call(work, ["claude", "--version"], readonly=True, network=False), flush=True)
        print(runtime.call(work, ["codex", "--version"], readonly=True, network=False, combine=True), flush=True)
        try:
            runtime.verify(work, runtime.config["verify"], root)
        finally:
            results = repo / "factory-container-results"
            results.mkdir(exist_ok=True)
            for log in root.glob("verify-*.log"):
                shutil.copyfile(log, results / log.name)
                print(log.name + ":\n" + log.read_text(errors="replace")[-16000:], flush=True)
            for directory in ("test-results", "playwright-report"):
                if (work / directory).exists():
                    shutil.copytree(work / directory, results / directory, dirs_exist_ok=True)
        print("Container lint/types/unit, fixture build and desktop/mobile E2E passed.", flush=True)


if __name__ == "__main__":
    main()
