import { redactSecrets } from "../../utils/redact.js";

/**
 * Prints a line of text to the standard output.
 *
 * @param text - The text.
 */
export function printLine(text = ""): void {
  process.stdout.write(`${text}\n`);
}

/**
 * Prints a JSON value to the standard output.
 *
 * @param value - The value.
 */
export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Prints a section title to the standard output.
 *
 * @param title - The title.
 */
export function section(title: string): void {
  printLine();
  printLine(title);
}

/**
 * Prints a bullet list to the standard output.
 *
 * @param lines - The lines.
 * @returns The bullet list.
 */
export function bullet(lines: string[]): string[] {
  return lines.map((line) => `  - ${line}`);
}

/**
 * Prints a table to the standard output.
 *
 * @param headers - The headers.
 * @param rows - The rows.
 * @returns The rendered table.
 */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const renderRow = (row: string[]): string =>
    row
      .map((cell, index) => (cell ?? "").padEnd(widths[index] ?? 0))
      .join("  ")
      .trimEnd();
  return [
    renderRow(headers),
    renderRow(widths.map((width) => "-".repeat(width))),
    ...rows.map(renderRow),
  ].join("\n");
}

/**
 * Renders an error to the standard error output.
 *
 * @param error - The error.
 */
export function renderError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${redactSecrets(message)}\n`);
  if (error instanceof Error && "hints" in error) {
    const hints = (error as { hints?: unknown }).hints;
    if (Array.isArray(hints)) {
      for (const hint of hints) {
        if (typeof hint === "string") process.stderr.write(`  hint: ${redactSecrets(hint)}\n`);
      }
    }
  }
}

/**
 * Confirms a question with the user.
 *
 * @param question - The question.
 * @returns The result of the confirmation.
 */
export async function confirm(question: string): Promise<boolean> {
  process.stdout.write(`${question} [y/N] `);
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("");
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Parses a key-value pair from a string.
 *
 * @param input - The input.
 * @param flag - The flag.
 * @returns The parsed key-value pair.
 */
export function parseKeyValue(input: string, flag: string): [string, string] {
  const index = input.indexOf("=");
  if (index <= 0) {
    throw new Error(`${flag} expects <key>=<value>, received "${input}"`);
  }
  return [input.slice(0, index), input.slice(index + 1)];
}

/**
 * Parses a number from a string.
 *
 * @param value - The value.
 * @param flag - The flag.
 * @returns The parsed number.
 */
export function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} expects a number, received "${value}"`);
  }
  return parsed;
}
