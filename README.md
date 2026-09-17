# gh-forge

**GitHub Achievement Forge** — plan and execute real GitHub actions to earn
GitHub Achievements, using accounts you own.

GitHub achievements (Quickdraw, Pull Shark, YOLO, Starstruck, ...) are earned
by doing real things on GitHub: opening and closing issues quickly, merging
pull requests, getting a discussion answer accepted. `gh-forge` knows the
requirements, checks what you've already done, tells you exactly what actions
are needed, and executes them on your behalf — safely, idempotently, and with
full transparency about policy risk.

> **Honesty first.** `gh-forge` is a real automation tool that performs real
> GitHub API calls. Some achievements live in a grey area of GitHub's
> Acceptable Use Policies. `gh-forge` refuses to hide that: opt-in and
> high-risk actions require explicit consent flags and are recorded in an
> audit log. Read [`docs/SECURITY.md`](docs/SECURITY.md) before running.

---

## What it does

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ gh-forge │ => │ gh-forge │ => │ gh-forge │
  │ plan     │    │ run      │    │ status   │
  └──────────┘    └──────────┘    └──────────┘
  "what do I        "does it,       "did it
   need to do?"      safely"         work?"
```

1. **`gh-forge plan`** — reads your configured accounts, your current known
   progress, and your targets, then prints the exact GitHub actions needed to
   earn each achievement. Nothing is executed in this step.
2. **`gh-forge run`** — executes the planned actions. Every action is
   idempotent: re-running never duplicates work. Use `--dry-run` to preview
   before anything happens.
3. **`gh-forge status`** — shows the state of past and current runs, so you can
   resume after an interruption.

## Quick start

Requires **Node.js ≥ 20.11** and the [GitHub CLI](https://cli.github.com/)
already authenticated with at least your main account:

```sh
npm install
npm run build

# 1. Initialize configuration (creates ~/.gh-forge/)
node dist/cli/index.js init --main <your-username>

# 2. Add the accounts you own
node dist/cli/index.js accounts add helper-1 --role helper --username <second-username>

# 3. Verify authentication works
node dist/cli/index.js accounts test

# 4. Record how far you already are (optional but recommended: 0=none, 1=default, 2=bronze, 3=silver, 4=gold)
node dist/cli/index.js progress pull-shark 1

# 5. Plan and preview
node dist/cli/index.js plan --target quickdraw=1
node dist/cli/index.js run --dry-run

# 6. Go
node dist/cli/index.js run
```

> **Tip:** install a small alias so you don't type `node dist/cli/index.js` every
> time: `alias gh-forge="node /path/to/gh-forge/dist/cli/index.js"` (or add a
> `bin` entry for `gh-forge` in your `PATH`).

## The commands

### `gh-forge init`

Creates `~/.gh-forge/config.json`. Use `--main <username>` to set your own
account, `--sandbox <name>` to name the sandbox repository, and `--force` to
overwrite an existing config (accounts and progress are preserved).

### `gh-forge accounts`

| subcommand | purpose |
|---|---|
| `add <id> [--role main\|helper] [--username <login>] [--auth gh\|token-command\|env]` | add one of your accounts |
| `list` | show all configured accounts |
| `test [accountId]` | verify each account is authenticated and probe its capabilities (scopes, repo access, discussions, ...) |
| `remove <id>` | forget an account |
| `set-email <id> <email>` | set a verified commit email (needed for Pair Extraordinaire) |

Authentication methods:

- `gh` (default) — tokens come from the GitHub CLI's OS keychain. The web flow
  reuses your browser session; use `gh auth login --with-token` with a PAT for
  additional accounts.
- `token-command` — any shell command that prints the token on stdout (e.g. a
  `security find-generic-password` call). Read into memory only, never stored.
- `env` — read the token from an environment variable.

### `gh-forge plan`

| option | purpose |
|---|---|
| `--target <id=level>` | override a target level (1–4, matching default/bronze/silver/gold) |
| `--only <id...>` | plan only specific achievements |
| `--json` | machine-readable output |

`plan` is read-only — it never touches GitHub.

### `gh-forge run`

| option | purpose |
|---|---|
| `--dry-run` | validate and print the actions **without executing anything** |
| `--only <id...>` | limit execution to specific achievements |
| `--target <id=level>` | override target levels for this run |
| `--allow-policy-risks` | consent to opt-in achievements (Galaxy Brain) |
| `--allow-high-risk` | consent to high-risk achievements (Starstruck) |
| `--resume [runId]` | resume a pending run (latest resumable if no id) |
| `--status` | show the latest run instead of executing |

`run` without `--target` reuses the targets from your last `gh-forge plan`, so
`plan` → `run` executes exactly what you previewed. An explicit `--target` on
`run` always wins; targets are stored in `~/.gh-forge/state/last-plan.json`.

### `gh-forge status`

Shows past runs. `--run <runId>` and `--json` give more detail. Interrupted
runs can be continued with `gh-forge run --resume`.

### `gh-forge achievements` / `progress` / `config`

- `achievements list` — the whole catalogue with policy risk per achievement.
- `achievements show <id>` — details, requirements, tiers, and *provenance*
  (where the requirement comes from and when it was verified).
- `progress` (no arguments) — shows the full reference table: every achievement
  (id + name) with your recorded level (`0` = none). Run this first to learn
  the ids.
- `progress <id> [level]` — record how far you already are so the planner
  doesn't repeat earned levels. **The level is the badge tier** (`0` = none,
  `1` = default, `2` = bronze, `3` = silver, `4` = gold);
  `progress pull-shark 1` means "I already have the default Pull Shark badge".
  Setting `0` is the same as not having recorded anything (it clears the
  entry).
- `config get/set <key>` — fine-tune defaults
  (e.g. `execution.minIntervalMs`, `execution.branchPrefix`).

## Policy safety

Every action is tagged with a risk level:

| risk | what it means | consent required |
|---|---|---|
| `safe` | normal activity on repositories/PRs you own | none |
| `opt-in` | multi-account coordination (Galaxy Brain) | `--allow-policy-risks` |
| `high-risk` | automated starring (Starstruck) — flagged in GitHub's AUP §4 | `--allow-policy-risks` **and** `--allow-high-risk` |

`--yes` skips interactive prompts but is **never** a consent flag. Actions
missing consent are marked `skipped`, never executed. Every opt-in/high-risk
run prints a warning banner quoting GitHub's Acceptable Use Policies and writes
an entry to `~/.gh-forge/state/audit.log`. See
[`docs/SECURITY.md`](docs/SECURITY.md).

## What it will never do

- create accounts, or act on accounts you don't own
- circumvent or evade rate limits
- store or print your tokens
- run mutating calls in `plan` mode or `--dry-run`
- automate payments (Public Sponsor) or anything whose requirement is unknown

## How execution works (short version)

`gh-forge` does its work in a **sandbox repository** (`gh-forge-sandbox`,
created automatically for you) that it fully controls. Each action leaves a
marker (`gh-forge:key=...`) on the remote — in issue/PR bodies, branch names,
or commit files — so re-running the same plan can never produce duplicates.
Pull requests are opened and merged from dedicated branches; Pair Extraordinaire
uses a real `Co-authored-by` trailer from the second account's verified email;
Galaxy Brain uses the sandbox repository's Discussions.

Hard caps (actions per run, per hour, and per-account throttling) are enforced
by the executor and can't be bypassed from configuration.

## Documentation

- [`docs/design.md`](docs/design.md) — architecture and design decisions
- [`docs/ACHIEVEMENTS.md`](docs/ACHIEVEMENTS.md) — the catalogue with provenance (verified 2026-09-16)
- [`docs/SECURITY.md`](docs/SECURITY.md) — policy model, AUP, audit log

## Development

```sh
npm run typecheck   # tsc --noEmit (includes tests)
npm run lint        # same, explicit alias
npm test            # vitest, 168 tests, all offline
npm run build       # compile to dist/
```

The test suite is fully offline: GitHub is replaced by a stub client whose
mutating calls are counted, so tests prove that dry-runs never mutate and that
idempotency short-circuits correctly.

## License

See `package.json`.