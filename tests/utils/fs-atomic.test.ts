import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendLine,
  ensureDir,
  joinPath,
  listFiles,
  pathExists,
  readJson,
  writeJsonAtomic,
  writeTextAtomic,
} from "../../src/utils/fs-atomic.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ghforge-atomic-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeJsonAtomic", () => {
  it("writes a readable JSON file", async () => {
    const file = join(dir, "data.json");
    await writeJsonAtomic(file, { hello: "world", n: 42 });
    const raw = await import("node:fs/promises").then((m) => m.readFile(file, "utf8"));
    expect(JSON.parse(raw)).toEqual({ hello: "world", n: 42 });
  });

  it("creates missing parent directories", async () => {
    const file = join(dir, "a", "b", "data.json");
    await writeJsonAtomic(file, { ok: true });
    expect(await pathExists(file)).toBe(true);
  });

  it("overwrites existing files", async () => {
    const file = join(dir, "data.json");
    await writeJsonAtomic(file, { v: 1 });
    await writeJsonAtomic(file, { v: 2 });
    expect(await readJson(file)).toEqual({ v: 2 });
  });
});

describe("readJson", () => {
  it("returns null for a missing file", async () => {
    expect(await readJson(join(dir, "nope.json"))).toBeNull();
  });

  it("returns null for an empty file", async () => {
    const file = join(dir, "empty.json");
    await writeTextAtomic(file, "");
    expect(await readJson(file)).toBeNull();
  });

  it("rethrows on malformed JSON", async () => {
    const file = join(dir, "bad.json");
    await writeTextAtomic(file, "{ not valid json");
    await expect(readJson(file)).rejects.toThrow();
  });
});

describe("writeTextAtomic", () => {
  it("writes text content", async () => {
    const file = join(dir, "note.txt");
    await writeTextAtomic(file, "line one\nline two\n");
    const raw = await import("node:fs/promises").then((m) => m.readFile(file, "utf8"));
    expect(raw).toBe("line one\nline two\n");
  });
});

describe("appendLine", () => {
  it("appends lines creating the file if needed", async () => {
    const file = join(dir, "log.txt");
    await appendLine(file, "first");
    await appendLine(file, "second");
    const raw = await import("node:fs/promises").then((m) => m.readFile(file, "utf8"));
    expect(raw).toBe("first\nsecond\n");
  });
});

describe("pathExists", () => {
  it("distinguishes existing and missing paths", async () => {
    const existing = join(dir, "exists.txt");
    await writeTextAtomic(existing, "x");
    expect(await pathExists(existing)).toBe(true);
    expect(await pathExists(join(dir, "missing.txt"))).toBe(false);
  });
});

describe("ensureDir", () => {
  it("creates nested directories", async () => {
    const nested = join(dir, "x", "y", "z");
    await ensureDir(nested);
    const { access } = await import("node:fs/promises");
    await expect(access(nested)).resolves.toBeUndefined();
  });
});

describe("listFiles", () => {
  it("lists files with a matching suffix sorted", async () => {
    await writeJsonAtomic(join(dir, "b.json"), {});
    await writeJsonAtomic(join(dir, "a.json"), {});
    await writeJsonAtomic(join(dir, "c.txt"), {});
    expect(await listFiles(dir, ".json")).toEqual(["a.json", "b.json"]);
  });

  it("returns [] for a missing directory", async () => {
    expect(await listFiles(join(dir, "does-not-exist"), ".json")).toEqual([]);
  });
});

describe("joinPath", () => {
  it("joins path parts", () => {
    expect(joinPath("a", "b", "c")).toBe(join("a", "b", "c"));
  });
});