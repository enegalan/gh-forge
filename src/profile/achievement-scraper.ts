import { levelToTierName } from "../achievements/achievement.js";
import { redactSecrets } from "../utils/redact.js";

/**
 * Best-effort reader for the achievements shown on a public GitHub profile.
 *
 * There is no achievements API: `GET /users/{user}/badges` and
 * `/users/{u}/achievements` return 404 and the GraphQL schema has no achievement
 * field. The profile page does expose them as HTML, so GAF can use it as a
 * convenience to reconcile `knownProgress`:
 *
 *   <div data-achievement-slug="pull-shark">
 *     <img src=".../pull-shark-bronze-....png">
 *
 * Limitations (documented in docs/ACHIEVEMENTS.md):
 *  - Since 2026-09-11 profiles show only the HIGHEST earned tier, never counts.
 *  - Achievements can be hidden (globally or individually), so the scan can
 *    under-report. `knownProgress` remains the source of truth.
 *  - The markup is not a public API and may change; failures are not fatal.
 */
export type ScrapedTier = "default" | "bronze" | "silver" | "gold";

export interface ScrapedAchievement {
  slug: string;
  tier: ScrapedTier;
}

export interface ProfileScanResult {
  username: string;
  scannedAt: string;
  achievements: ScrapedAchievement[];
  warnings: string[];
}

export interface ScanProfileOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function scanProfile(
  username: string,
  options: ScanProfileOptions = {},
): Promise<ProfileScanResult> {
  const baseUrl = options.baseUrl ?? "https://github.com";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const warnings: string[] = [];
  const url = `${baseUrl}/${encodeURIComponent(username)}?tab=achievements`;

  const response = await fetchImpl(url, {
    headers: { accept: "text/html", "user-agent": "gh-forge (achievement reconciliation)" },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (!response.ok) {
    warnings.push(`Profile scan returned HTTP ${response.status}; knownProgress was left untouched.`);
    return { username, scannedAt: new Date().toISOString(), achievements: [], warnings };
  }
  const html = await response.text();
  const achievements = parseAchievements(html);
  if (achievements.length === 0) {
    warnings.push(
      "No achievements were found in the profile HTML. They may be hidden in profile settings, or the markup may have changed.",
    );
  }
  return { username, scannedAt: new Date().toISOString(), achievements, warnings };
}

export function parseAchievements(html: string): ScrapedAchievement[] {
  const results: ScrapedAchievement[] = [];
  const seen = new Set<string>();
  const chunks = html.split("data-achievement-slug=");
  for (const chunk of chunks.slice(1)) {
    const slugMatch = /^"([^"]+)"/.exec(chunk);
    const slug = slugMatch?.[1];
    if (slug === undefined) continue;
    const tierMatch = /assets\/[a-z0-9-]*?-?(default|bronze|silver|gold)-[0-9a-f]+\.png/i.exec(
      chunk.slice(0, 4000),
    );
    if (tierMatch === null) continue;
    const tier = tierMatch[1]?.toLowerCase() as ScrapedTier | undefined;
    if (tier === undefined) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    results.push({ slug, tier });
  }
  return results;
}

export function tierToLevel(tier: ScrapedTier): number {
  switch (tier) {
    case "default":
      return 1;
    case "bronze":
      return 2;
    case "silver":
      return 3;
    case "gold":
      return 4;
  }
}

export function describeScraped(achievement: ScrapedAchievement): string {
  return `${achievement.slug}: ${achievement.tier} (level ${tierToLevel(achievement.tier)}, ${levelToTierName(tierToLevel(achievement.tier))})`;
}

export function safeScanError(error: unknown): string {
  return redactSecrets(error instanceof Error ? error.message : String(error));
}