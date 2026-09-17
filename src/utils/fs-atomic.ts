import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    if (raw.trim() === "") return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Atomic JSON write: write to a sibling temp file and rename over the target so
 * an interrupted process can never leave a half written state file behind.
 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

export async function writeTextAtomic(path: string, value: string): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, value, "utf8");
  await rename(tempPath, path);
}

export async function appendLine(path: string, line: string): Promise<void> {
  await ensureDir(dirname(path));
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, `${line}\n`, "utf8");
}

export async function listFiles(dir: string, suffix: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.endsWith(suffix)).sort();
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

export function joinPath(...parts: string[]): string {
  return join(...parts);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
