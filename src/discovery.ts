import { existsSync, readFileSync } from "fs";
import { join, dirname, resolve, parse as parsePath } from "path";
import { DiscoveredPaths, Credentials, CmConfig } from "./types";

const PLAINS_FILENAME = "codemagic.plains.yaml";
const SECRETS_FILENAME = "codemagic.secrets.yaml";
const CONFIG_FILENAME = "codemagic.config.json";
const CODEMAGIC_DIR = ".codemagic";

interface DiscoverOptions {
  configPath?: string;
  startDir?: string;
  stopAt?: string;
}

export function discoverPaths(options: DiscoverOptions = {}): DiscoveredPaths {
  let plainsFile: string;
  let baseDir: string;

  if (options.configPath) {
    const abs = resolve(options.configPath);
    if (!existsSync(abs)) {
      throw new Error(`Config file not found: ${options.configPath}`);
    }
    plainsFile = abs;
    baseDir = dirname(abs);
  } else {
    const found = walkUp(options.startDir || process.cwd(), options.stopAt);
    if (!found) {
      throw new Error(
        "No codemagic.plains.yaml found. Create one or use --config <path>"
      );
    }
    plainsFile = found;
    baseDir = dirname(found);
  }

  const secretsPath = join(baseDir, SECRETS_FILENAME);
  const configPath = join(baseDir, CONFIG_FILENAME);
  const codemagicDirPath = join(baseDir, CODEMAGIC_DIR);

  return {
    plainsFile,
    secretsFile: existsSync(secretsPath) ? secretsPath : null,
    configFile: existsSync(configPath) ? configPath : null,
    codemagicDir: existsSync(codemagicDirPath) ? codemagicDirPath : null,
    baseDir,
  };
}

function walkUp(startDir: string, stopAt?: string): string | null {
  let current = resolve(startDir);
  const root = parsePath(current).root;

  while (true) {
    const candidate = join(current, PLAINS_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }

    if (stopAt && current === resolve(stopAt)) {
      return null;
    }

    if (current === root) {
      return null;
    }

    current = dirname(current);
  }
}

interface ResolveCredentialOptions {
  cliArgs?: Partial<Credentials>;
  configFile?: string | null;
  envFile?: string;
}

export function resolveCredentials(options: ResolveCredentialOptions): Credentials {
  const cli = options.cliArgs || {};

  let cfg: CmConfig = {};
  if (options.configFile && existsSync(options.configFile)) {
    const raw = readFileSync(options.configFile, "utf-8");
    cfg = JSON.parse(raw) as CmConfig;
  }

  const env = {
    apiKey: process.env.CODEMAGIC_API_KEY,
    teamId: process.env.CODEMAGIC_TEAM_ID,
    appId: process.env.CODEMAGIC_APP_ID,
  };

  const apiKey = cli.apiKey || cfg.api_key || env.apiKey;
  const teamId = cli.teamId || cfg.team_id || env.teamId;
  const appId = cli.appId || cfg.app_id || env.appId;

  const missing: string[] = [];
  if (!apiKey) missing.push("api_key (--api-key, codemagic.config.json, or CODEMAGIC_API_KEY)");
  if (!teamId) missing.push("team_id (--team-id, codemagic.config.json, or CODEMAGIC_TEAM_ID)");
  if (!appId) missing.push("app_id (--app-id, codemagic.config.json, or CODEMAGIC_APP_ID)");

  if (missing.length > 0) {
    throw new Error(`Missing required credentials:\n  - ${missing.join("\n  - ")}`);
  }

  return { apiKey: apiKey!, teamId: teamId!, appId: appId! };
}
