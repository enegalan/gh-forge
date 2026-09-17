import { ConfigStore } from "../../config/config.js";
import { createDefaultConfig, type Config } from "../../config/schema.js";
import type { GafPaths } from "../../config/paths.js";
import { printLine, section } from "../ui/format.js";

export interface InitOptions {
  main?: string;
  force?: boolean;
  sandbox?: string;
  visibility?: "public" | "private";
}

export async function initCommand(paths: GafPaths, options: InitOptions): Promise<void> {
  const store = new ConfigStore(paths);
  const exists = await store.exists();
  if (exists && options.force !== true) {
    section("Configuration already exists");
    printLine(`  ${paths.configFile}`);
    printLine("  Use --force to overwrite it (accounts and progress are preserved).");
    return;
  }

  const existing = await store.loadOrDefault();
  const config: Config = exists && options.force !== true ? existing : createDefaultConfig();

  if (options.sandbox !== undefined && options.sandbox !== "") {
    config.repositories.sandbox = {
      name: options.sandbox,
      visibility: options.visibility ?? "public",
      discussions: true,
      description: "Sandbox repository used by GitHub Achievement Forge (gh-forge).",
    };
  }

  if (options.main !== undefined && options.main !== "") {
    config.accounts["main"] = {
      username: options.main,
      role: "main",
      auth: { kind: "gh", login: options.main },
    };
    config.mainAccount = "main";
  }

  await store.save(config);

  section("GitHub Achievement Forge");
  printLine(`  Home:   ${paths.home}`);
  printLine(`  Config: ${paths.configFile}`);
  if (config.mainAccount !== null) {
    printLine(`  Main account: ${config.mainAccount} (${config.accounts[config.mainAccount]?.username ?? "?"})`);
  } else {
    printLine("  Main account: (not set) - run `gh-forge accounts add main --role main --username <login>`");
  }
  printLine();
  printLine("Next steps:");
  printLine("  1. gh-forge accounts add main --role main --username <login>");
  printLine("  2. gh-forge accounts add helper-1 --username <login>");
  printLine("  3. gh-forge accounts test");
  printLine("  4. gh-forge config progress");
  printLine("  5. gh-forge plan");
}
