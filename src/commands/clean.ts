import chalk from "chalk";
import ora from "ora";
import { discoverPaths, resolveCredentials } from "../discovery";
import { CodemagicAPI } from "../api/codemagic";
import { Updater } from "../updater";

interface CleanCommandOptions {
  config?: string;
  envFile?: string;
  apiKey?: string;
  appId?: string;
  teamId?: string;
  group?: string;
  all: boolean;
  deleteGroups: boolean;
  dryRun: boolean;
  yes: boolean;
}

export async function cleanCommand(options: CleanCommandOptions): Promise<void> {
  const spinner = ora("Initializing...").start();

  try {
    if (!options.group && !options.all) {
      spinner.fail(chalk.red("Must specify --group <name> or --all"));
      process.exit(1);
    }

    if (!options.dryRun && !options.yes) {
      spinner.fail(
        chalk.red("This will DELETE variables from Codemagic. Add --yes to confirm, or use --dry-run to preview.")
      );
      process.exit(1);
    }

    let configFile: string | null = null;
    try {
      const paths = discoverPaths({ configPath: options.config });
      configFile = paths.configFile;
    } catch {
      // discovery is optional for clean
    }

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
      configFile,
    });

    spinner.stop();

    if (options.dryRun) {
      console.log(chalk.yellow("\nDRY RUN — no changes will be made\n"));
    }

    const api = new CodemagicAPI(credentials);
    const updater = new Updater(api);

    await updater.clean({
      group: options.group,
      all: options.all,
      deleteGroups: options.deleteGroups,
      dryRun: options.dryRun,
      yes: options.yes,
    });

    console.log(chalk.green("\nClean complete."));
  } catch (error) {
    spinner.fail(chalk.red("Clean failed"));
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}
