import { redactSecrets } from "../../utils/redact.js";

export function printLine(text = ""): void {
  process.stdout.write(`${text}\n`);
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function section(title: string): void {
  printLine();
  printLine(title);
}

export function bullet(lines: string[]): string[] {
  return lines.map((line) => `  - ${line}`);
}

export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const renderRow = (row: string[]): string =>
    row.map((cell, index) => (cell ?? "").padEnd(widths[index] ?? 0)).join("  ").trimEnd();
  return [renderRow(headers), renderRow(widths.map((width) => "-".repeat(width))), ...rows.map(renderRow)].join(
    "\n",
  );
}

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

export function parseKeyValue(input: string, flag: string): [string, string] {
  const index = input.indexOf("=");
  if (index <= 0) {
    throw new Error(`${flag} expects <key>=<value>, received "${input}"`);
  }
  return [input.slice(0, index), input.slice(index + 1)];
}

export function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} expects a number, received "${value}"`);
  }
  return parsed;
}