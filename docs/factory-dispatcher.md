# Local factory dispatcher: shadow rollout

This second increment is stacked on PR #29's verification foundation. It processes
one trusted Issue through planning, implementation, independent checks and a fresh
review, then pushes a **draft PR to staging**. It does not merge, wait for remote
CI, deploy, or claim that a protected Preview was checked. Those gates come next.

## Offline trial

From the repository root, with Python 3.9 or newer:

```sh
python3 -B -m unittest discover -s factory/tests -v
python3 bin/factory run 999999 --dry-run --issue-file .factory/example-issue.json
python3 bin/factory doctor
```

The sample is local data. Dry-run starts no AI, writes nothing to GitHub and does
not claim a job. Without `--issue-file`, it reads the real Issue through `gh`.
Offline tests use temporary Git repositories, fake agent/GitHub boundaries and a
fake Docker executable. They cover the draft-PR path, failures, source/commit
identity, stop/timeout cleanup, strict JSON, claims and publication uncertainty.
They do not prove a real container or subscription login works. CI separately
builds the Linux image and checks its boundaries and application verification,
without model calls. A local image build and subscription-backed trial remain required.

## Runtime and cost

The parent uses Python's standard library, Git and GitHub CLI on this Mac.
Agents and application commands run in a local Docker-compatible Linux VM.
[Colima](https://colima.run/docs/getting-started/) is an MIT-licensed option;
its [installation guide](https://colima.run/docs/installation/) includes the
Docker client. No paid server or hosted worker is needed. For example:

```sh
brew install colima docker
colima start --cpu 2 --memory 6
docker build --build-arg FACTORY_UID=$(id -u) --build-arg FACTORY_GID=$(id -g) -f .factory/Dockerfile -t homupe-factory:local .factory
```

The image installs the official CLIs and Playwright Chromium; it needs several GB
of disk and downloads dependencies. The Node base tag is moving: rebuild
deliberately. Each job resolves the built image to its immutable image ID.
CLI versions are pinned to the locally checked interfaces in the Dockerfile.

AI usage uses the subscriptions and their existing limits/settings. The code
supplies no API key, buys no credits, and does not switch to API billing when
rate-limited. It makes at most three model invocations per attempt (plan,
implementation, review), with a one-hour job deadline and no automatic retries.
A loop defaults to one job per invocation. Jev is not used. CI makes no AI calls.

## Setup before a live trial

Review/merge the foundation and dispatcher changes first. Create `staging` from
the resulting current `main`; do not reuse the diverged `develop`. Confirm that
staging is a Vercel Preview branch and `main` is Production. This PR does not
create staging, change Vercel settings or merge either PR.

Sign in to GitHub CLI **on the host**, with permission to push this repo:

```sh
gh auth login --hostname github.com
```

Create independent AI homes in Docker named volumes. Do not mount the host home,
GitHub config, SSH agent, application env files or Docker socket. Use subscription
logins, not API/Console accounts:

```sh
docker run --rm -it --mount type=volume,src=homupe-factory-claude,dst=/home/node homupe-factory:local claude auth login --claudeai
docker run --rm -it --mount type=volume,src=homupe-factory-codex,dst=/home/node homupe-factory:local codex login --device-auth
```

Follow the CLI browser instructions. These logins are separate from this chat's
connector/browser and host CLI logins. Never sign in to GitHub inside either AI
volume. Preflight requires Claude's `authMethod=claude.ai` and Codex's ChatGPT
sign-in; a changed CLI contract stops execution for inspection.

`doctor` reports host prerequisites. Live execution also checks the built image,
container subscriptions, exact staging SHA, existing Issue branches/PRs, and
current Issue eligibility before invoking a model.

## Run an Issue

Only an open Issue authored by `chronoll` with `factory:ready` is eligible.
PRs returned by the Issues API, other authors, and Issues with `factory:stop`,
`factory:skip` or `factory:needs-human` are rejected. Create `factory:ready` as a
repo label if needed and add it to a small trial Issue. Automatic labeling and
arbitrary contributor requests are outside this rollout.

```sh
python3 bin/factory run 123 --dry-run
python3 bin/factory run 123 --execute
```

The live path freezes the Issue, claims it durably and reads the exact staging
SHA. Claude receives a source snapshot without `.git`. Planning is read-only;
implementation has file tools but no shell, browser, MCP or subagents. The parent
runs `npm ci`, `npm run check`, fixture build and desktop/mobile Playwright in
containers with neither GitHub nor AI credentials. UI changes require both
sizes of dispatcher-produced screenshots.

The parent creates a private commit and verifies its source equals the tested
snapshot. A fresh Codex session reads a separate read-only snapshot, diff, Issue,
plan and screenshots. Its reviewed SHA must match. Changes/needs-human or any
must finding stops the attempt. Before publishing, the parent rechecks the
Issue, STOP, unchanged staging SHA and clean candidate HEAD. It uses a normal
push and `gh pr create --draft --base staging`; it never force-pushes or merges.

The outer read-only Docker root/source/evidence provide the review sandbox.
Codex uses `--sandbox danger-full-access` **only inside that container**, avoiding
nested Linux namespace requirements. Never run that reviewer command on the
host. Outbound networking remains enabled for AI/npm; this is not a domain
firewall. Container-reachable host/network services must not expose
unauthenticated administrative endpoints.

Protected paths include workflows, factory policy/code, agent configuration,
guidance, environment files and package manifests. Changes stop before local
verification/publication and need a separate human-owned PR. The agent cannot
change its own checks. Draft PRs contain the plan, review summary and SHA.
Screenshots/full logs remain local; this increment does not upload them.
Remote CI/Preview checks and human review/merge are still required.

## Polling, stopping and recovery

This rollout has one worker. Keep one controller on one awake PC. No daemon or
scheduled task is installed. Local state does not coordinate multiple PCs.

```sh
python3 bin/factory loop --execute --max-jobs 1 --interval 300
python3 bin/factory status
python3 bin/factory stop
```

`stop` sets local STOP and interrupts the supervised process/container.
`factory:stop` is checked between phases and before publication. Use local stop
to interrupt a running model immediately. Ctrl-C/SIGTERM, timeout, invalid output,
failed tests, review rejection, changed Issue/base/head, or uncertain remote
writes retain the job as `needs-human` and exit the loop. Container removal
failure also sets STOP. Inspect Docker before resuming; a killed host/daemon may
leave a container requiring manual cleanup.

The journal at `.factory-state/jobs/<Issue>/` keeps the input, phase outputs,
logs, tested source, private worktree, evidence, SHA and PR URL. A claimed or
incomplete job after a crash needs inspection; startup never replays it. Do not
delete the journal to recover an uncertain remote write.

After inspecting the job and reconciling existing remote branches/PRs:

```sh
python3 bin/factory resume
python3 bin/factory retry 123
python3 bin/factory run 123 --execute
```

`resume` only clears STOP. `retry` archives a needs-human attempt and permits a
new, potentially usage-consuming attempt. Existing remote branches/PRs still
block fresh attempts before AI starts. A hard crash leaving a nonterminal state
requires manual inspection; retry deliberately does not reset it. State and
worktrees remain available and are not pruned automatically in this increment.

## CLI references

- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode):
  saved authentication, structured output and isolated automation.
- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference): print mode,
  structured output, subscription login, tool and MCP settings.
- [Claude sandbox boundaries](https://code.claude.com/docs/en/sandboxing): the Bash
  sandbox alone does not wrap every CLI capability, hence the outer container.
- [Docker run](https://docs.docker.com/engine/containers/run/): read-only mounts,
  resource limits and container lifecycle.
