# gh-forge design

`gh-forge` (GitHub Achievement Forge, "GAF") plans and executes real GitHub
actions that earn GitHub Achievements, using accounts you own. It is built to
be **transparent**, **idempotent**, and **policy-safe**.

## Layout

```
src/
  cli/           commander CLI, entry point, command implementations
  accounts/      account model + capability probing (auth via gh CLI / env)
  achievements/  achievement model, registry, catalogue (provenance)
  config/        zod-schema config + atomic JSON stores
  domain/        PolicyRisk model, PlannedAction, consent helpers
  executor/      execution engine: branches, markers, idempotent actions
  github/        facade + services (users, repos, issues, PRs, discussions,
                 stars) over a single native-fetch HTTP client
  planner/       turns target levels + observations into a plan
  profile/       reads the live GitHub profile page for AMVP data
  runtime/       wires config, CLI, accounts, executor together
  state/         per-run state machine, run store, audit log, last-plan targets
  utils/         hashing, redaction, atomic fs writes
tests/           vitest suite
```

## Dependency policy

- Only two runtime dependencies: `commander` (CLI parsing) and `zod`
  (configuration validation). Everything else — HTTP, retries, pagination,
  GraphQL, atomic JSON persistence — is hand-rolled in `src/`.
- Communication with GitHub goes through **one** `FetchHttpClient`
  (`src/github/http/http-client.ts`) wrapping the native `fetch`. It provides:
  retries with backoff, `Retry-After` handling, rate-limit header capture,
  token redaction in logs, pagination, and a GraphQL path. No "octokit".
- This keeps the surface area small enough to audit and to test with stub
  requests (see `tests/github/http-client.test.ts`).

## Core model

- `Achievement` (interface) exposes `getTiers()`, `getRequirements()`,
  `validate()`, `execute()`. Executors are registered in the
  `AchievementRegistry` (`src/achievements/achievement-registry.ts`) and model
  classes live under `src/achievements/<id>/index.ts`.
- `PlannedAction` (`src/domain/action.ts`) is the unit of work. It carries an
  `actionKey` (16 hex chars, derived from achievement id + a per-run nonce),
  a `policyRisk`, capability requirements, and an `idempotencyKey`.
- Everything policy-related lives in `src/domain/policy.ts` (the
  `PolicyRisk` taxonomy) and `src/domain/consent.ts` (the allow gates).

## The policy model

Each action is classified `safe | opt-in | high-risk`:

- `safe` — runs on `gh-forge run` with no extra flags (but still idempotent).
- `opt-in` — requires `--allow-policy-risks` (or `policy.allowOptInAchievements: true`).
- `high-risk` — additionally requires `--allow-high-risk`.

`--yes` skips interactive prompts but **never** acts as a policy flag. An
action whose policy gate is not met is marked `skipped` in the run state and
reported; it is never mutated. See `docs/SECURITY.md`.

## Idempotency and remote state

Re-running a plan must not duplicate work. Each action:

1. Builds an idempotency marker
   (`<!-- gh-forge:key=<actionKey> -->` in issue/PR/discussion bodies,
   `gh-forge/<achievement>/<actionKey>` for branches, marker files for commits).
2. Before mutating, checks the marker on the remote (issue open of that key,
   merged PR with that head ref, file already committed, repository already
   starred per account).
3. Skips with a `done`-style "already present" result when a marker exists.

This makes `run`, `resume`, and repeated `plan`+`run` safe.

GitHub computes a pull request's mergeability lazily, so a freshly created PR can
reject `PUT /pulls/{n}/merge` with `405: Pull Request is not mergeable`. The
merged-PR action polls the PR until GitHub reports it as mergeable and retries
transient 405s before failing the action.

`gh-forge run --resume` re-queues actions that failed in the previous attempt with
a fresh attempt budget (`Executor.prepareRun`), so a transient failure can always
be retried without editing the run file by hand.

## Time estimates

Execution time is dominated by the per-account HTTP throttle
(`execution.minIntervalMs`, applied start-to-start), not by GitHub's latency: as
long as one request is faster than the interval, an action that issues N requests
takes about `N * minIntervalMs`. `src/executor/estimate.ts` encodes the request
count per action kind, and both commands print an ETA:

- `gh-forge plan` — `Estimated execution time: ~4h 6m (896 actions, …)`.
- `gh-forge run` / `run --resume` — `Estimated time for the remaining N actions`.

The counts describe the "fresh" path, so an estimate is a slight upper bound:
actions that short-circuit on an existing marker are much cheaper. Calibration: a
real 896-action run (all merged PRs, default 1500 ms) measured p50 15.85 s per
action and the estimator says 16.5 s. Backoff after a rate limit is the only
genuinely unpredictable part.

## Non-negotiable limits

`src/executor/executor.ts` enforces hard caps: max actions per run,
max actions per hour, and per-account throttling (`minIntervalMs`). These are
not bypassable via configuration; a late warning is logged when a plan would
need more than the caps allow.

## Configuration

`gh-forge init` writes a zod-validated JSON file (`~/.gh-forge/config.json`
by default, `--home` to relocate). Accounts, targets, and progress are stored
in adjacent JSON files and read/written atomically (`src/utils/fs-atomic.ts`).
`gh-forge config get/set/progress` are thin wrappers over that store.

## Testing

`npm test` runs the vitest suite. All tests are offline: GitHub services are
doubled by `tests/helpers.ts` `makeStubGitHub()` (mutating methods record
calls, so tests assert dry-runs never mutate and idempotency short-circuits).
`npm run typecheck` (`tsc --noEmit`, includes tests) and `npm run build`
(`tsc -p tsconfig.build.json`, `src` only) must both pass.