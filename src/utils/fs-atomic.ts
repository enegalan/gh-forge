import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Checks if a path exists.
 *
 * @param path - The path.
 * @returns True if the path exists, false otherwise.
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a JSON file.
 *
 * @param path - The path.
 * @returns The JSON content.
 */
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

/**
 * Ensures a directory exists.
 *
 * @param path - The path.
 * @returns The void.
 */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Atomic JSON write: write to a sibling temp file and rename over the target so
 * an interrupted process can never leave a half written state file behind.
 *
 * @param path - The path.
 * @param value - The value.
 * @returns The void.
 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

/**
 * Atomic text write: write to a sibling temp file and rename over the target so
 * an interrupted process can never leave a half written state file behind.
 *
 * @param path - The path.
 * @param value - The value.
 * @returns The void.
 */
export async function writeTextAtomic(path: string, value: string): Promise<void> {
  await ensureDir(dirname(path));
  const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, value, "utf8");
  await rename(tempPath, path);
}

/**
 * Atomic line append: append to a file atomically.
 *
 * @param path - The path.
 * @param line - The line.
 * @returns The void.
 */
export async function appendLine(path: string, line: string): Promise<void> {
  await ensureDir(dirname(path));
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, `${line}\n`, "utf8");
}

/**
 * Lists files in a directory.
 *
 * @param dir - The directory.
 * @param suffix - The suffix.
 * @returns The files.
 */
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

/**
 * Joins paths.
 *
 * @param parts - The parts.
 * @returns The joined path.
 */
export function joinPath(...parts: string[]): string {
  return join(...parts);
}

/**
 * Checks if a path is not found.
 *
 * @param error - The error.
 * @returns True if the path is not found, false otherwise.
 */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
