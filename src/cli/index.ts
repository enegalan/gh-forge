#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { pathsFor, type GlobalCliOptions } from "./context.js";
import { renderError } from "./ui/format.js";
import { initCommand } from "./commands/init.js";
import { accountsAdd, accountsList, accountsTest, accountsRemove, accountsSetEmail } from "./commands/accounts.js";
import { planCommand } from "./commands/plan.js";
import { runCommand } from "./commands/run.js";
import { statusCommand } from "./commands/status.js";
import { configGetCommand, configSetCommand, configProgressCommand } from "./commands/config.js";
import { achievementsListCommand, achievementsShowCommand } from "./commands/achievements.js";
import { progressCommand } from "./commands/progress.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("gh-forge")
  .description("GitHub Achievement Forge (GAF) — plan and execute real GitHub actions to earn achievements using accounts you own.")
  .version(version)
  .option("--home <path>", "override gh-forge home directory")
  .option("--verbose", "enable debug logging")
  .option("--quiet", "suppress non-error output")
  .option("--yes", "skip interactive confirmations (policy flags still required)");

function globalOptions(): GlobalCliOptions {
  const opts = program.opts();
  return {
    home: opts.home as string | undefined,
    verbose: opts.verbose as boolean | undefined,
    quiet: opts.quiet as boolean | undefined,
    yes: opts.yes as boolean | undefined,
  };
}

// ─── init ────────────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Create or overwrite the gh-forge configuration file.")
  .option("--main <username>", "set the main account username")
  .option("--sandbox <name>", "set the sandbox repository name")
  .option("--visibility <public|private>", "sandbox repository visibility", "public")
  .option("--force", "overwrite existing configuration")
  .action(async (opts) => {
    try {
      const paths = pathsFor(globalOptions());
      await initCommand(paths, {
        main: opts.main as string | undefined,
        force: opts.force as boolean | undefined,
        sandbox: opts.sandbox as string | undefined,
        visibility: opts.visibility as "public" | "private" | undefined,
      });
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

// ─── accounts ────────────────────────────────────────────────────────────────
const accountsCmd = program
  .command("accounts")
  .description("Manage GitHub accounts used by gh-forge.");

accountsCmd
  .command("add <id>")
  .description("Add or update an account.")
  .option("--role <main|helper>", "account role", "helper")
  .option("--username <login>", "GitHub username (required)")
  .option("--auth <method>", "authentication method: gh, token-command, env", "gh")
  .option("--login <login>", "login hint for gh keychain auth")
  .option("--command <cmd>", "shell command that prints the token on stdout")
  .option("--env-var <name>", "environment variable containing the token")
  .option("--email <email>", "commit email for Co-authored-by trailers")
  .option("--no-verify", "skip verification after adding")
  .option("--force", "overwrite if the account already exists")
  .action(async (id, opts) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await accountsAdd(paths, id, {
        role: opts.role as "main" | "helper" | undefined,
        username: opts.username as string | undefined,
        auth: opts.auth as "gh" | "token-command" | "env" | undefined,
        login: opts.login as string | undefined,
        command: opts.command as string | undefined,
        envVar: opts.envVar as string | undefined,
        email: opts.email as string | undefined,
        noVerify: opts.noVerify as boolean | undefined,
        force: opts.force as boolean | undefined,
      });
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

accountsCmd
  .command("list")
  .description("List all configured accounts.")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await accountsList(paths, opts.json as boolean);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

accountsCmd
  .command("test [accountId]")
  .description("Test authentication for one or all accounts.")
  .action(async (accountId) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await accountsTest(paths, accountId as string | undefined);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

accountsCmd
  .command("remove <id>")
  .description("Remove an account from the configuration.")
  .action(async (id) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await accountsRemove(paths, id);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

accountsCmd
  .command("set-email <id> <email>")
  .description("Set the commit email for an account (must be verified on GitHub).")
  .action(async (id, email) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await accountsSetEmail(paths, id, email);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

// ─── plan ────────────────────────────────────────────────────────────────────
program
  .command("plan")
  .description("Plan which actions are needed to reach target achievement levels.")
  .option("--only <id...>", "limit plan to specific achievement ids")
  .option("--target <id=level...>", "override per-achievement target levels")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    try {
      const paths = pathsFor(globalOptions());
      const gOpts = globalOptions();
      const code = await planCommand(paths, {
        only: opts.only as string[] | undefined,
        target: opts.target as string[] | undefined,
        json: opts.json as boolean | undefined,
        verbose: gOpts.verbose,
        quiet: gOpts.quiet,
      });
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

// ─── run ─────────────────────────────────────────────────────────────────────
program
  .command("run")
  .description("Execute planned actions on GitHub.")
  .option("--dry-run", "validate and print actions without executing")
  .option("--only <id...>", "limit execution to specific achievement ids")
  .option("--target <id=level...>", "override per-achievement target levels")
  .option("--allow-policy-risks", "consent to opt-in achievements (Galaxy Brain)")
  .option("--allow-high-risk", "consent to high-risk achievements (Starstruck)")
  .option("--resume [runId]", "resume a previous run (latest resumable if no id)")
  .option("--status", "show status of the latest run instead of executing")
  .action(async (opts) => {
    try {
      const paths = pathsFor(globalOptions());
      const gOpts = globalOptions();
      const code = await runCommand(paths, {
        dryRun: opts.dryRun as boolean | undefined,
        only: opts.only as string[] | undefined,
        target: opts.target as string[] | undefined,
        allowPolicyRisks: opts.allowPolicyRisks as boolean | undefined,
        allowHighRisk: opts.allowHighRisk as boolean | undefined,
        resume: opts.resume as string | boolean | undefined,
        status: opts.status as boolean | undefined,
        yes: gOpts.yes,
        verbose: gOpts.verbose,
        quiet: gOpts.quiet,
      });
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

// ─── status ──────────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show the status of past and current runs.")
  .option("--run <runId>", "show details for a specific run")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await statusCommand(paths, {
        run: opts.run as string | undefined,
        json: opts.json as boolean | undefined,
      });
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

// ─── config ──────────────────────────────────────────────────────────────────
const configCmd = program
  .command("config")
  .description("Read and write gh-forge configuration.");

configCmd
  .command("get <key>")
  .description("Get a configuration value (e.g. execution.minIntervalMs).")
  .action(async (key) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await configGetCommand(paths, key);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value (e.g. execution.minIntervalMs 2000).")
  .action(async (key, value) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await configSetCommand(paths, key, value);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

configCmd
  .command("progress")
  .description("Show or sync known achievement progress.")
  .option("--sync", "scan public profiles and reconcile progress")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    try {
      const paths = pathsFor(globalOptions());
      const gOpts = globalOptions();
      const code = await configProgressCommand(paths, {
        sync: opts.sync as boolean | undefined,
        json: opts.json as boolean | undefined,
        verbose: gOpts.verbose,
      });
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

// ─── achievements ────────────────────────────────────────────────────────────
const achievementsCmd = program
  .command("achievements")
  .description("List and inspect GitHub achievements.");

achievementsCmd
  .command("list")
  .description("List all known achievements with their policy risk.")
  .option("--json", "output as JSON")
  .action(async (opts) => {
    try {
      const code = await achievementsListCommand(opts.json as boolean);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

achievementsCmd
  .command("show <id>")
  .description("Show detailed information about a specific achievement.")
  .option("--json", "output as JSON")
  .action(async (id, opts) => {
    try {
      const code = await achievementsShowCommand(id, opts.json as boolean);
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

// ─── progress ────────────────────────────────────────────────────────────────
program
  .command("progress")
  .description("Set or view known achievement progress levels.")
  .argument("[achievementId]", "achievement to view or set")
  .argument("[level]", "new level (0-4) to set")
  .option("--clear", "remove the progress entry for this achievement")
  .option("--json", "output as JSON")
  .action(async (achievementId, level, opts) => {
    try {
      const paths = pathsFor(globalOptions());
      const code = await progressCommand(paths, achievementId as string | undefined, level as string | undefined, {
        clear: opts.clear as boolean | undefined,
        json: opts.json as boolean | undefined,
      });
      process.exitCode = code;
    } catch (error) {
      renderError(error);
      process.exitCode = 1;
    }
  });

program.parse();
