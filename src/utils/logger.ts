import { redactSecrets } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  child(prefix: string): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Data stream (stdout) is reserved for machine readable output. */
  stream?: NodeJS.WritableStream;
  prefix?: string;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const stream = options.stream ?? process.stderr;
  const prefix = options.prefix ?? "";

  const log = (entryLevel: LogLevel, message: string): void => {
    if (LEVEL_WEIGHT[entryLevel] < LEVEL_WEIGHT[level]) return;
    stream.write(`${prefix}${entryLevel}: ${redactSecrets(message)}\n`);
  };

  return {
    debug: (message) => log("debug", message),
    info: (message) => log("info", message),
    warn: (message) => log("warn", message),
    error: (message) => log("error", message),
    child: (childPrefix) =>
      createLogger({ level, stream, prefix: `${prefix}${childPrefix}` }),
  };
}

export function createSilentLogger(): Logger {
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => logger,
  };
  return logger;
}
