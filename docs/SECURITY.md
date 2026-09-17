# gh-forge security & acceptable-use policy

`gh-forge` automates real GitHub actions. That is the entire point of the tool
— but the actions change the state of GitHub, and a small subset of them exist
in a grey area of GitHub's Acceptable Use Policies. This document explains the
risk classification the tool uses, where the line is drawn, what the consent
flags actually do, and where every consent decision is recorded.

## Acceptable Use Policies §4 (quoted)

The relevant text from GitHub's Acceptable Use Policies (section 4. "Compliance
with Laws and Regulations" / what is prohibited) includes:

> "rank abuse, such as automated starring or following"

and

> "coordinated inauthentic activity"

These are quoted **literally** in the risk banner GAF prints to stderr before
any opt-in or high-risk action runs.

## Risk classification

Every action in the catalogue is tagged `PolicyRisk` (`src/domain/policy.ts`):

| risk       | meaning                                                    | required consent |
|------------|------------------------------------------------------------|------------------|
| `safe`     | normal GitHub activity on repositories/PRs you own         | none             |
| `opt-in`   | multi-account activity that could look coordinated         | `--allow-policy-risks` or `policy.allowOptInAchievements: true` |
| `high-risk`| activity expressly contemplated by AUP §4 (automated starring) | `--allow-policy-risks` **and** `--allow-high-risk` |

Only one achievement is currently `high-risk`: **starstruck**, because the
requirements state it is earned by "rank, such as automated starring" territory
— each distinct owned account stars the target repository, which is exactly the
§4 "automated starring" pattern. `galaxy-brain` is `opt-in` because it relies
on two owned accounts coordinating on a discussion answer, which borders on
"coordinated inauthentic activity".

## Consent flags

- `gh-forge run --yes` — skips interactive confirmations. It is **never** a
  policy flag: `--allow-policy-risks` / `--allow-high-risk` are still required.
- `--allow-policy-risks` — required for `opt-in` actions.
- `--allow-high-risk` — required for `high-risk` actions.

An action whose gate is not met is marked `skipped` in the run state and is
never executed. There is no "silent bypass"; flags must be passed explicitly at
run time (or persisted in config, which itself is a deliberate local decision).

## What GAF will never do (non-negotiable)

These are architectural limits, not configurable knobs:

- create accounts, or act on behalf of accounts you do not own;
- circumvent, rotate, or otherwise evade rate limits;
- store, print, or log any token value (see `src/utils/redact.ts`);
- run "plan" mode or `--dry-run` with mutating calls (guarded at the executor
  boundary and asserted by tests);
- execute against a repository unless it is the sandbox repository or is
  explicitly owned by the main account.

## Audit log

Every execution of an `opt-in` or `high-risk` action, plus every profile scan
that feeds the planner, writes one JSON line to:

```
~/.gh-forge/state/audit.log
```

The entry records the timestamp, the kind of event (`consent-granted`,
`consent-declined`, `profile-scan`, ...), the achievement ids involved, the
`policyRisk`, the exact flags that were passed, and any detail (redacted of
secrets). `recordAudit` is the single entry point
(`src/state/audit-log.ts`), so the log is complete and tamper-evident in the
sense that it is append-only JSONL.

The same `--home` override that relocates config also relocates the audit log.

## Threat notes worth stating plainly

- **Automated starring is against the AUP.** GAF can do it, but only with the
  explicit high-risk flag, and the audit log records that you did. If you are
  uncomfortable with that, do not pass the flag; starstruck will stay `skipped`.
- **GitHub may change policies.** The classification is a point-in-time
  judgement (verified 2026-09-16). Re-check before relying on it.
- **Do not run this on an account you do not control.** GAF refuses to go
  further than the accounts you configured.

## Where the code enforces this

- `src/domain/policy.ts` — risk taxonomy and the `riskAllowed` gate.
- `src/domain/consent.ts` — `markRiskAccepted` gate used by the CLI.
- `src/executor/executor.ts` — per-action enforcement + skipped marking.
- `src/state/audit-log.ts` — append-only JSONL audit store.
- `src/utils/redact.ts` — token/secret redaction in every log path.
- `src/cli/ui/policy-banner.ts` — the literal §4 banner printed at run time.