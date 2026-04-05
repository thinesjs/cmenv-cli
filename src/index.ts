#!/usr/bin/env node

import { Command } from "commander";
import { syncCommand } from "./commands/sync";
import { listCommand } from "./commands/list";
import { cleanCommand } from "./commands/clean";
import { initCommand } from "./commands/init";

const program = new Command();

program
  .name("cmenv")
  .description("Sync environment variables from codemagic.plains.yaml to Codemagic")
  .version("0.1.0");

function addGlobalOptions(cmd: Command): Command {
  return cmd
    .option("--config <path>", "Path to codemagic.plains.yaml")
    .option("--env-file <path>", "Path to env file for credentials")
    .option("--api-key <key>", "Codemagic API key")
    .option("--app-id <id>", "Codemagic app ID")
    .option("--team-id <id>", "Codemagic team ID");
}

addGlobalOptions(
  program
    .command("sync")
    .description("Sync variables from config to Codemagic")
    .option("-u, --update", "Update existing variables", false)
    .option("-d, --delete-extra", "Delete remote variables not in config", false)
    .option("--dry-run", "Preview changes without applying", false)
    .option("-g, --group <name>", "Sync only a specific group")
).action(syncCommand);

addGlobalOptions(
  program
    .command("list")
    .description("List all variable groups from Codemagic")
).action(listCommand);

addGlobalOptions(
  program
    .command("clean")
    .description("Remove variables from Codemagic")
    .option("-g, --group <name>", "Clean a specific group")
    .option("--all", "Clean all groups", false)
    .option("--delete-groups", "Also delete the groups themselves", false)
    .option("--dry-run", "Preview deletions without applying", false)
    .option("--yes", "Confirm deletion", false)
).action(cleanCommand);

program
  .command("init")
  .description("Initialize cmenv in the current directory")
  .option("--force", "Overwrite existing files", false)
  .option("-e, --environments <envs>", "Comma-separated environments (default: staging,production)")
  .action(initCommand);

program.parse();
