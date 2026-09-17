import { describe, expect, it } from "vitest";
import {
  parseAchievements,
  scanProfile,
  tierToLevel,
  describeScraped,
} from "../../src/profile/achievement-scraper.js";

const PROFILE_HTML = `<!doctype html>
<html>
<body>
  <div data-achievement-slug="pull-shark">
    <img src="https://github.githubassets.com/assets/pull-shark-silver-abc123.png">
  </div>
  <div data-achievement-slug="quickdraw">
    <img src="https://github.githubassets.com/assets/quickdraw-default-def456.png">
  </div>
  <div data-achievement-slug="starstruck">
    <img src="https://github.githubassets.com/assets/starstruck-gold-789def.png">
  </div>
</body>
</html>`;

describe("parseAchievements", () => {
  it("extracts slugs and tiers from profile HTML", () => {
    const achievements = parseAchievements(PROFILE_HTML);
    expect(achievements).toContainEqual({ slug: "pull-shark", tier: "silver" });
    expect(achievements).toContainEqual({ slug: "quickdraw", tier: "default" });
    expect(achievements).toContainEqual({ slug: "starstruck", tier: "gold" });
  });

  it("deduplicates repeated slugs", () => {
    const html = PROFILE_HTML + PROFILE_HTML;
    expect(parseAchievements(html).length).toBe(3);
  });

  it("returns [] for html without achievements", () => {
    expect(parseAchievements("<html><body>nothing here</body></html>")).toEqual([]);
  });

  it("ignores unmatched images", () => {
    const html = `<div data-achievement-slug="mystery"> 
      <img src="https://x/assets/unknown-tag-zzz.png">
    </div>`;
    expect(parseAchievements(html)).toEqual([]);
  });
});

describe("tierToLevel", () => {
  it("maps tiers to levels 1..4", () => {
    expect(tierToLevel("default")).toBe(1);
    expect(tierToLevel("bronze")).toBe(2);
    expect(tierToLevel("silver")).toBe(3);
    expect(tierToLevel("gold")).toBe(4);
  });
});

describe("describeScraped", () => {
  it("describes a scraped achievement", () => {
    expect(describeScraped({ slug: "yolo", tier: "default" })).toContain("yolo");
    expect(describeScraped({ slug: "yolo", tier: "default" })).toContain("default");
  });
});

describe("scanProfile", () => {
  it("uses the injected fetch implementation", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response(PROFILE_HTML, { status: 200 });
    const result = await scanProfile("octocat", { fetchImpl });
    expect(result.username).toBe("octocat");
    expect(result.achievements.length).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  it("warns when the profile cannot be reached", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response("rate limited", { status: 429 });
    const result = await scanProfile("octocat", { fetchImpl });
    expect(result.achievements).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("429"))).toBe(true);
  });

  it("warns when no achievements are found but the page loads", async () => {
    const fetchImpl = async (): Promise<Response> =>
      new Response("<html><body>empty profile</body></html>", { status: 200 });
    const result = await scanProfile("octocat", { fetchImpl });
    expect(result.achievements).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});