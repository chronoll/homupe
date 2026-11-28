# Factory verification foundation

This is the verification layer for the Issue-to-Staging Factory. It does not yet
poll Issues, invoke AI agents, merge PRs, or deploy changes itself.

## Local checks

Use Node.js 22 and install the committed lockfile:

```sh
npm ci
npm run check
npm run build
npm run build:fixtures
npx playwright install chromium
npm run test:e2e
```

`check` runs ESLint (zero warnings), Next route type generation + TypeScript,
and Jest. Jest uses `next/jest` for TS/TSX transforms and only discovers unit tests
under `src/**/__tests__/`; Playwright tests run separately.

`build:fixtures` writes `.next-fixtures/`, separate from the normal `.next/` build.
`start:fixtures` serves that build on `127.0.0.1:3100`. Set `FACTORY_PORT` for an
independent worktree. Playwright starts/stops its own server and rejects an
already-running server on that port. Do not start another server first.

The fixture runner removes Notion, Redis and Blob application credentials from
the child environment. No application API key or paid service is required.

## Data boundaries

- Local fixture commands opt in with `FACTORY_FIXTURES=1`.
- All Vercel Preview deployments use fixtures automatically (`VERCEL_ENV=preview`),
  even if the project currently has live service credentials in its Preview settings.
- Production and ordinary local builds retain the existing live-data behavior.
  `FACTORY_FIXTURES=1` with `VERCEL_ENV=production` fails the build. Production must
  be rebuilt from `main` as a Production deployment. Do not promote or copy a
  fixture Preview build directly to Production: its prerendered HTML contains fixtures.
- Both Notion API routes and server-side repositories return seeded blog articles,
  related articles, books and contents. Unknown fixture article IDs return API 404.
- Fixture BBS reads return a fixed seed. Valid POSTs return 403 with an explicit
  message; they never claim a post was persisted. Existing validation still returns
  400 for invalid messages. Counter GET/POST returns a fixed 1234 without writes.
- The Redis diagnostic endpoint is disabled in fixture mode because it writes data.
- Analytics and Speed Insights are disabled in fixture mode so acceptance runs do
  not send telemetry or depend on Vercel's measurement scripts.
- Fixture dates and images are local and fixed. No Notion, Redis or link-enrichment
  requests are needed to render the seeded pages.
- Fixture pages use system fonts. The existing Google Fonts stylesheet is loaded
  only in live mode so an offline run cannot fail on a blocked font request.

Jest proves the service boundary with configured dummy credentials and mock
clients/fetch that throw if used. Fixture acceptance is not a test of real Notion,
Redis, or future Blob integration; those need separate staging resources later.

## Browser acceptance and evidence

Chromium runs at 1440 x 900 and 390 x 844, with Japanese locale and Tokyo timezone.
Tests check seeded pages, blog filtering/detail/related/back navigation, book
details, BBS validation/write rejection, and unknown article handling. Uncaught
browser errors fail the run. External browser requests are blocked.

Screenshots and the HTML report are saved under `test-results/` and
`playwright-report/` (ignored by Git). The CI artifact is retained for seven days;
traces are retained only for failures. These are evidence captures, not pixel
snapshot baselines.

## Vercel Preview verification

Use the deployment URL for the exact PR commit:

```sh
PREVIEW_BASE_URL=https://your-commit-preview.vercel.app \
PREVIEW_REVISION=your_full_40_character_commit_sha \
npm run test:preview
```

The command only accepts HTTPS `*.vercel.app` URLs and requires a full commit SHA.
Before any browser visit (which triggers the visitor counter), every test checks
`/api/health` for `dataMode=fixture` and the expected revision. A stale deployment,
live environment, or authentication page fails before browser activity. Deployment
Protection may require access to be configured by the owner; do not publish bypass
tokens in commands, reports or PRs.

## CI

`CI / Verify` runs on PRs and pushes to `main` or `staging`, using the public
repository's standard Ubuntu runner. It runs static/unit checks, both build modes,
and browser acceptance. Workflow permissions are read-only, checkout credentials
are not persisted, and no AI tokens or application service secrets are supplied.
New runs cancel obsolete runs for the same PR. The job has a 20-minute timeout.

Make this check required when staging branch protection is introduced. Until then,
its existence alone does not prevent merging a failed PR.
