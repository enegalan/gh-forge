import type { GafPaths } from "./paths.js";
import { progressFileSchema, type ProgressEntry, type ProgressFile } from "./schema.js";
import { ConfigError } from "../utils/errors.js";
import { readJson, writeJsonAtomic } from "../utils/fs-atomic.js";
import { formatZodError } from "./config.js";

/**
 * `knownProgress` — what the user knows they already earned.
 *
 * GitHub exposes no achievement progress API (verified: REST /users/{u}/badges
 * and /users/{u}/achievements return 404 and the GraphQL schema has no
 * achievement field), and profiles only show the highest earned tier. This
 * store is therefore the source of truth, optionally reconciled with a public
 * profile scan (`source: "scraped"`).
 */
export class ProgressStore {
  private readonly paths: GafPaths;

  constructor(paths: GafPaths) {
    this.paths = paths;
  }

  async load(): Promise<ProgressFile> {
    const raw = await readJson<unknown>(this.paths.progressFile);
    if (raw === null) return progressFileSchema.parse({});
    const result = progressFileSchema.safeParse(raw);
    if (!result.success) {
      throw new ConfigError(
        `Invalid progress file ${this.paths.progressFile}: ${formatZodError(result.error)}`,
      );
    }
    return result.data;
  }

  async save(file: ProgressFile): Promise<void> {
    await writeJsonAtomic(this.paths.progressFile, progressFileSchema.parse(file));
  }

  async setLevel(achievementId: string, level: number, entry?: Partial<ProgressEntry>): Promise<ProgressFile> {
    const file = await this.load();
    file.entries[achievementId] = {
      level,
      source: entry?.source ?? "manual",
      updatedAt: new Date().toISOString(),
      ...(entry?.note === undefined ? {} : { note: entry.note }),
    };
    await this.save(file);
    return file;
  }

  async clear(achievementId: string): Promise<ProgressFile> {
    const file = await this.load();
    delete file.entries[achievementId];
    await this.save(file);
    return file;
  }

  /** Returns a map of achievementId -> earned tier level (missing means 0). */
  async levels(): Promise<Record<string, number>> {
    const file = await this.load();
    const levels: Record<string, number> = {};
    for (const [id, entry] of Object.entries(file.entries)) {
      levels[id] = entry.level;
    }
    return levels;
  }
}