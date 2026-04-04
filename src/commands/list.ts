import chalk from "chalk";
import ora from "ora";
import { discoverPaths, resolveCredentials } from "../discovery";
import { CodemagicAPI } from "../api/codemagic";
import { Updater } from "../updater";

interface ListCommandOptions {
  config?: string;
  envFile?: string;
  apiKey?: string;
  appId?: string;
  teamId?: string;
}

export async function listCommand(options: ListCommandOptions): Promise<void> {
  const spinner = ora("Fetching variable groups...").start();

  try {
    let configFile: string | null = null;
    try {
      const paths = discoverPaths({ configPath: options.config });
      configFile = paths.configFile;
    } catch {
      // discovery is optional for list — credentials might come from CLI args or env
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

    const api = new CodemagicAPI(credentials);
    const updater = new Updater(api);

    await updater.list();
  } catch (error) {
    spinner.fail(chalk.red("Failed to list groups"));
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}
