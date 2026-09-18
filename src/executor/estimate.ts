import type { ActionKind } from "../domain/action.js";

/**
 * Deterministic run-time estimates.
 *
 * Execution time is dominated by the per-account HTTP throttle
 * (`execution.minIntervalMs`, applied start-to-start by `FetchHttpClient`), not
 * by GitHub's latency: as long as a single request is faster than the interval,
 * an action that issues N requests takes about `N * minIntervalMs`. That is why
 * estimates are useful at all instead of "it depends".
 */

/**
 * GitHub requests an action issues on the "fresh" path, when nothing exists yet.
 * Idempotency short-circuits make repeats cheaper, so these are the worst case
 * and therefore the right basis for an estimate. The comments map each count to
 * the calls in `action-runner.ts` and the service it uses.
 */
export const REQUESTS_BY_KIND: Record<ActionKind, number> = {
  // repos.get, pulls list, ref(branch), ref(base), create ref, contents GET,
  // contents PUT, pulls POST, pulls list, pull GET, merge PUT
  "merged-pull-request": 11,
  // same as above; the co-author trailer rides on the contents PUT
  "co-authored-merged-pull-request": 11,
  // repos.get, search issues, issues POST, issues PATCH
  "close-issue-fast": 4,
  // repos.get, repository info, list discussions, create discussion,
  // add comment, mark answer (all GraphQL)
  "accepted-discussion-answer": 6,
  // repos.get, starred check, star PUT
  "repository-star": 3,
};

/**
 * Floor for the time a single request needs when `minIntervalMs` is 0, covering
 * network round-trip plus GitHub processing (measured ~85-125 ms).
 */
export const MIN_REQUEST_MS = 120;

export interface TimeEstimate {
  actionCount: number;
  seconds: number;
  /** Estimated seconds per action kind, for a breakdown. */
  byKind: Partial<Record<ActionKind, number>>;
}

export function estimateActionSeconds(kind: ActionKind, minIntervalMs: number): number {
  const perRequestMs = Math.max(minIntervalMs, MIN_REQUEST_MS);
  return (REQUESTS_BY_KIND[kind] * perRequestMs) / 1000;
}

export function estimateActions(
  actions: ReadonlyArray<{ kind: ActionKind }>,
  minIntervalMs: number,
): TimeEstimate {
  const byKind: Partial<Record<ActionKind, number>> = {};
  let seconds = 0;
  for (const action of actions) {
    const actionSeconds = estimateActionSeconds(action.kind, minIntervalMs);
    seconds += actionSeconds;
    byKind[action.kind] = (byKind[action.kind] ?? 0) + actionSeconds;
  }
  return { actionCount: actions.length, seconds, byKind };
}

/** Compact human duration: `42s`, `1m 30s`, `4h 3m`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const restSeconds = total % 60;
  if (minutes < 60) return restSeconds === 0 ? `${minutes}m` : `${minutes}m ${restSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
}
