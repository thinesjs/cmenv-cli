import chalk from "chalk";
import ora from "ora";
import { discoverPaths, resolveCredentials } from "../discovery";
import { loadConfig } from "../config-loader";
import { CodemagicAPI } from "../api/codemagic";
import { Updater } from "../updater";

interface SyncCommandOptions {
  config?: string;
  envFile?: string;
  apiKey?: string;
  appId?: string;
  teamId?: string;
  update: boolean;
  deleteExtra: boolean;
  dryRun: boolean;
  group?: string;
}

export async function syncCommand(options: SyncCommandOptions): Promise<void> {
  const spinner = ora("Discovering configuration...").start();

  try {
    const paths = discoverPaths({
      configPath: options.config,
    });
    spinner.text = "Loading configuration...";

    if (options.envFile) {
      const { config } = await import("dotenv");
      config({ path: options.envFile });
    }

    const credentials = resolveCredentials({
      cliArgs: {
        apiKey: options.apiKey,
        teamId: options.teamId,
        appId: options.appId,
      },
      configFile: paths.configFile,
    });

    const groups = loadConfig(paths);

    if (groups.length === 0) {
      spinner.warn("No groups found in configuration");
      return;
    }

    spinner.stop();

    if (options.dryRun) {
      console.log(chalk.yellow("\nDRY RUN — no changes will be made\n"));
    }

    console.log(chalk.gray(`Config: ${paths.plainsFile}`));
    if (paths.secretsFile) {
      console.log(chalk.gray(`Secrets: ${paths.secretsFile}`));
    }
    console.log("");

    const api = new CodemagicAPI(credentials);
    const updater = new Updater(api);

    await updater.sync(groups, {
      update: options.update,
      deleteExtra: options.deleteExtra,
      dryRun: options.dryRun,
      group: options.group,
    });

    console.log(chalk.green("\nSync complete."));
  } catch (error) {
    spinner.fail(chalk.red("Sync failed"));
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}
