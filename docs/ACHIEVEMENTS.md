# gh-forge achievements catalogue

Every entry below records **where** its requirement came from and **when** it
was last verified. GitHub does not publish requirement thresholds; the
official profile docs say only that achievements "celebrate specific events
and actions" and that the feature is in public preview. The numbers here are
data with explicit provenance — nothing marked `unknown` is ever planned or
executed.

Canonical source: <https://github.com/drknzz/GitHub-Achievements>
(community-maintained, ~3.1k stars). Values were cross-checked on
**2026-09-16** against live badge assets GitHub serves (tier names are encoded
in the PNGs), public profiles (`?tab=achievements` exposes
`data-achievement-slug` and the tier label), and the 2026 changelog note that
"Profiles now show your highest achievement badge tier".

The machine-readable version of this table is the single source of truth for
planner, executor, and CLI: `src/achievements/catalog.ts`. If GitHub changes a
threshold, edit only that file. `CATALOG_VERIFIED_AT = "2026-09-16"`.

## Automatable (GAF plans and executes these)

| id                   | name                | tier thresholds                    | risk       | notes |
|----------------------|---------------------|------------------------------------|------------|-------|
| quickdraw            | Quickdraw           | 1                                  | safe       | single tier |
| pull-shark           | Pull Shark          | 2 / 16 / 128 / 1024                | safe       | only merged PRs count |
| yolo                 | YOLO                | 1                                  | safe       | merged with no review decision |
| pair-extraordinaire  | Pair Extraordinaire | 1 / 10 / 24 / 48                   | safe       | needs 2 accounts (Co-authored-by) |
| galaxy-brain         | Galaxy Brain        | 2 / 8 / 16 / 32                    | opt-in     | discussion answer accepted |
| starstruck           | Starstruck          | 16 / 128 / 512 / 4096              | high-risk  | see docs/SECURITY.md |

## Listed but never executed

| id                         | name                             | reason |
|----------------------------|----------------------------------|--------|
| public-sponsor             | Public Sponsor                   | requires a real payment |
| heart-on-your-sleeve       | Heart On Your Sleeve             | trigger not documented (unknown) |
| open-sourcerer             | Open Sourcerer                   | trigger not documented (unknown) |
| arctic-code-vault-contributor | Arctic Code Vault Contributor | retired, 2020 program ended |
| mars-2020-contributor      | Mars 2020 Helicopter Contributor | retired, badge no longer available (official) |

## How each automatable achievement is executed

| id                   | strategy |
|----------------------|----------|
| quickdraw            | Open an issue on the sandbox repository and close it immediately (within 5 minutes). |
| pull-shark           | Open a PR on the sandbox repository and merge it. Volume limits reported, never silently grinded. |
| yolo                 | Open a PR with no reviews and merge it, when branch protection does not require approving reviews. |
| pair-extraordinaire  | Two accounts: author commits with a `Co-authored-by` trailer naming the helper account; open + merge the PR. |
| galaxy-brain         | Two accounts: one opens a discussion, main answers, discussion author accepts the answer. |
| starstruck           | Main account creates a repo and distinct owned accounts star it. Requires one account per star. **High risk.** |

## Verification status

- `high` confidence: pull-shark, pair-extraordinaire, starstruck (tier assets +
  multiple live profiles).
- `medium` confidence: quickdraw, yolo, galaxy-brain (community catalogue +
  live assets; slightly weaker corroboration).
- `unknown`: heart-on-your-sleeve, open-sourcerer — never planned or executed.
- Retired: arctic-code-vault-contributor, mars-2020-contributor.

How to re-verify: check live tier assets, sample recent public profiles, and
update both `src/achievements/catalog.ts` and this table, bumping
`CATALOG_VERIFIED_AT`.