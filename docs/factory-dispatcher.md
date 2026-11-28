# Local factory dispatcher: shadow rollout

The verification foundation and dispatcher from PRs #29 and #30 are merged into
`staging`; those merges left `main` unchanged. The dispatcher processes one trusted
Issue through Codex planning, implementation, independent checks and a fresh Codex
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
colima start --cpus 2 --memory 6 --disk 40 --mount "$(pwd):w" --ssh-config=false --ssh-agent=false
docker build --build-arg FACTORY_UID=$(id -u) --build-arg FACTORY_GID=$(id -g) -f .factory/Dockerfile -t homupe-factory:local .factory
```

The image installs the official Codex CLI and Playwright Chromium; it needs
several GB of disk and downloads dependencies. The Node base tag is moving: rebuild
deliberately. Each job resolves the built image to its immutable image ID.
The CLI version is pinned to the locally checked interface in the Dockerfile.

AI usage uses the ChatGPT subscription and its existing limits/settings. The code
supplies no API key, buys no credits, and does not switch to API billing when
rate-limited. An attempt starts Codex for up to three phases (plan,
implementation, review), with a one-hour job deadline and no automatic retries.
Each phase can involve multiple inference requests and tool operations;
subscription consumption depends on the Issue, rather than a fixed request count.
A watcher tick processes at most one job. Jev is not used. CI makes no AI calls.

## Setup before a live trial

The rollout created `staging` from the current `main` and merged PRs #29, #30 and #31
there first; it did not reuse the diverged `develop` or merge these changes into
`main`. Confirm that staging is a Vercel Preview branch and `main` is Production.
The Codex configuration change is included in staging. Rebuild the local image
when changing its pinned tools or model settings. Production remains a separate
human-controlled step.

Sign in to GitHub CLI **on the host**, with permission to push this repo:

```sh
gh auth login --hostname github.com
```

Create independent Codex homes in Docker named volumes: `homupe-factory-codex`
for planning/implementation and `homupe-factory-codex-review` for review. Do not
mount the host home, GitHub config, SSH agent, application env files or Docker
socket. Sign in with ChatGPT:

```sh
image_id="$(docker image inspect --format '{{.Id}}' homupe-factory:local)"
login_factory_codex() {
  docker run --rm -it --init --user "$(id -u):$(id -g)" \
    --cap-drop ALL --security-opt no-new-privileges \
    --pids-limit 256 --memory 4g --cpus 2 --read-only --network bridge \
    --tmpfs /tmp:rw,nosuid,size=1g --workdir /tmp \
    --mount "type=volume,src=homupe-factory-$1,dst=/home/node" \
    --env GH_TOKEN=factory-disabled --env GITHUB_TOKEN=factory-disabled \
    --env GIT_TERMINAL_PROMPT=0 --env GIT_SSH_COMMAND=false \
    "$image_id" codex login --device-auth
}
login_factory_codex codex && login_factory_codex codex-review
```

Use each URL and code shown by the CLI in a browser on any device; the user does
not need to operate the Mac's Terminal to approve a device login. The person
running the CLI can relay those device-login instructions. These logins are
separate from this chat's connector/browser and host CLI logins. Never sign in to
GitHub inside either AI volume. Preflight requires ChatGPT sign-in in both
volumes; a changed CLI contract stops execution for inspection.

`doctor` reports host prerequisites. Live execution also checks the built image,
both container logins, exact staging SHA, existing Issue branches/PRs, and
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
SHA. Each phase starts a fresh Codex session with a source snapshot without
`.git`. Planning mounts the source read-only; implementation mounts the source
writable. These phases use the planning/implementation authentication volume.
The fixed factory MCP file server exposes `list_files`, `read_file` and literal
`search` for supplied source/evidence paths, plus `read_image` for PNGs below
`/evidence/screenshots`. It cannot execute commands or read the authentication
home. Only implementation also receives `write_file` and `delete_file`, confined
to permitted source paths. Each edit requires the expected SHA-256 of the
existing file; `null` is accepted only when creating a new file. Protected paths
cannot be edited by these tools.

The image contains a read-only [model capability catalog](../.factory/model-catalog.md)
for the explicitly selected `gpt-5.6-sol`. Together with the CLI flags, it disables
built-in `apply_patch`, `view_image` and process execution; the MCP server supplies
the permitted file operations. Codex starts in clean `/tmp` with strict CLI
configuration, ignored user configuration/rules and no automatic project-document
loading. Factory prompts explicitly require reading repository guidance through
the bounded MCP tools. Apps, plugins, browser tools, hooks, bundled skills and
subagents are disabled for these calls.

The parent independently runs `npm ci`, `npm run check`, fixture build and
desktop/mobile Playwright in containers with neither GitHub nor AI credentials.
Agent commands do not replace those independent checks. UI changes require both
sizes of dispatcher-produced screenshots.

The parent creates a private commit and verifies its source equals the tested
snapshot. A fresh Codex session, with its separate review authentication volume,
reads a separate read-only snapshot, diff, Issue, plan and screenshots. It does
not resume either earlier conversation. Its reviewed SHA must match.
Changes/needs-human or any must finding stops the attempt. Before publishing,
the parent rechecks the Issue, STOP, unchanged staging SHA and clean candidate
HEAD. It uses a normal
push and `gh pr create --draft --base staging`; it never force-pushes or merges.

The outer container provides each phase's filesystem boundary: read-only root,
read-only source for planning/review, writable source for implementation, and
read-only evidence for review. Containers drop capabilities, disallow privilege
escalation and limit resources; no host credentials or sockets are mounted.
Codex uses `--sandbox danger-full-access` **only inside these containers**,
avoiding nested Linux namespace requirements. Never run that agent command on
the host. Outbound networking remains enabled for AI/npm; this is not a domain
firewall. Container-reachable host/network services must not expose
unauthenticated administrative endpoints.

Protected paths include workflows, factory policy/code, agent configuration,
guidance, environment files and package manifests. Changes stop before local
verification/publication and need a separate human-owned PR. The agent cannot
change its own checks. Draft PRs contain the plan, review summary and SHA.
Screenshots/full logs remain local; this increment does not upload them.
Remote CI/Preview checks and human review/merge are still required.

## Polling, stopping and recovery

This rollout has one worker. Keep one controller on one awake PC. The optional
macOS per-user LaunchAgent `com.chronoll.homupe.factory` checks immediately when
loaded (`RunAtLoad`) and every 300 seconds while idle (`StartInterval`). Each
one-shot poll processes at most one eligible Issue and then exits. A running job
does not overlap another poll and has a one-hour deadline; checks may therefore
be farther apart than five minutes. Local state does not coordinate multiple PCs.

Before installing on macOS, place an independent clone of the verified revision
and the dedicated runtime under `~/Library/Application Support/homupe`, outside
Documents and other TCC-protected folders. A worktree elsewhere is insufficient
if its Git metadata still points back into Documents. Keep `COLIMA_HOME` short,
for example the runtime's `c` directory, to fit the Unix socket path limit. Use
that runtime's environment configuration when building or operating its VM.

Install the watcher with the dedicated runtime directory, then explicitly start
it from that independent repository root. The paths below are examples:

```sh
factory_runtime="$HOME/Library/Application Support/homupe"
. "$factory_runtime/env.sh"
cd "$factory_runtime/repo"
python3 -B -m factory.launchd --runtime "$factory_runtime" install
python3 -B -m factory.launchd start
python3 -B -m factory.launchd status
python3 -B -m factory.launchd stop
```

The Mac must be logged into this user account, awake, online, and able to use its
container VM and saved CLI authentication. The Codex app and an open Terminal
are not required. When enabled, the watcher loads at the user's next login.
An explicit stop disables it across logins until an explicit start.

`start` clears STOP under the controller lock, enables/loads the LaunchAgent and
requests a check without killing an existing worker. `stop` sets STOP first,
then disables/unloads the LaunchAgent and waits a bounded time for cleanup.
Stop the watcher before stopping the VM. A job failure or detected crash sets
STOP; the watcher does not retry the failed Issue or update its own code.

The runtime directory keeps `watch.log` and its rotated `watch.log.1`,
`watch-vm.log`, `launchd.stdout.log` and `launchd.stderr.log`. The last poll result
is saved in `.factory-state/watch.json`. Inspect service status and these logs
before clearing STOP after a failure.

For a foreground session instead, the manual dispatcher commands remain:

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
- [Docker run](https://docs.docker.com/engine/containers/run/): read-only mounts,
  resource limits and container lifecycle.
