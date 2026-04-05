import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";

function generatePlainsTemplate(environments: string[]): string {
  let yaml = `groups:
  global-vars:
    variables:
      - name: NODEJS_VERSION
        value: "22"
`;

  for (const env of environments) {
    const envLower = env.toLowerCase();
    const envUpper = env.toUpperCase();
    const envFile = `.env.${envLower}`;
    const envVarName = `ENV_${envUpper}`;

    yaml += `
  ${envLower}-vars:
    secure: true
    variables:
      - name: BUILD_ENV
        value: "${envLower}"
      - name: BUNDLE_ID
        value: "com.example.app${envLower === environments[environments.length - 1] ? "" : "." + envLower}"
        secure: false
      - name: GOOGLE_SERVICES_JSON
        file: ${envLower}/google-services.json
      - name: GOOGLE_SERVICES_PLIST
        file: ${envLower}/GoogleService-Info.plist
      - name: ${envVarName}
        file: ${envLower}/${envFile}
`;
  }

  yaml += `
  ios-global-vars:
    variables:
      - name: XCODE_VERSION
        value: "26.1"
      - name: COCOAPODS_VERSION
        value: "1.16.2"
      - name: RUBY_VERSION
        value: "3.4.1"
      - name: XCODE_WORKSPACE
        value: "MyApp.xcworkspace"
      - name: XCODE_SCHEME
        value: "MyApp"
`;

  return yaml;
}

const CONFIG_TEMPLATE = `{
  "api_key": "your-codemagic-api-key",
  "team_id": "your-team-id",
  "app_id": "your-app-id"
}
`;

const GITIGNORE_ENTRIES = [
  "",
  "# cmenv",
  "codemagic.config.json",
  "codemagic.secrets.yaml",
  ".codemagic/",
];

const DEFAULT_ENVIRONMENTS = ["production"];

interface InitCommandOptions {
  force: boolean;
  environments?: string;
}

export function initCommand(options: InitCommandOptions): void {
  const cwd = process.cwd();

  const environments = options.environments
    ? options.environments.split(",").map((e) => e.trim()).filter(Boolean)
    : DEFAULT_ENVIRONMENTS;

  console.log(chalk.cyan("\nInitializing cmenv...\n"));
  console.log(chalk.gray(`  environments: ${environments.join(", ")}\n`));

  // codemagic.plains.yaml
  const plainsPath = join(cwd, "codemagic.plains.yaml");
  if (existsSync(plainsPath) && !options.force) {
    console.log(chalk.gray("  skip  codemagic.plains.yaml (exists)"));
  } else {
    writeFileSync(plainsPath, generatePlainsTemplate(environments));
    console.log(chalk.green("  create  codemagic.plains.yaml"));
  }

  // codemagic.config.json
  const configPath = join(cwd, "codemagic.config.json");
  if (existsSync(configPath) && !options.force) {
    console.log(chalk.gray("  skip  codemagic.config.json (exists)"));
  } else {
    writeFileSync(configPath, CONFIG_TEMPLATE);
    console.log(chalk.green("  create  codemagic.config.json"));
  }

  // .codemagic/ directory
  const dirs = [
    ...environments.map((e) => `.codemagic/${e.toLowerCase()}`),
    ".codemagic/credentials",
  ];
  for (const dir of dirs) {
    const dirPath = join(cwd, dir);
    if (existsSync(dirPath)) {
      console.log(chalk.gray(`  skip  ${dir}/ (exists)`));
    } else {
      mkdirSync(dirPath, { recursive: true });
      console.log(chalk.green(`  create  ${dir}/`));
    }
  }

  // .gitignore
  const gitignorePath = join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes("codemagic.config.json")) {
      console.log(chalk.gray("  skip  .gitignore (already has cmenv entries)"));
    } else {
      appendFileSync(gitignorePath, GITIGNORE_ENTRIES.join("\n") + "\n");
      console.log(chalk.green("  update  .gitignore"));
    }
  } else {
    writeFileSync(gitignorePath, GITIGNORE_ENTRIES.slice(1).join("\n") + "\n");
    console.log(chalk.green("  create  .gitignore"));
  }

  console.log(chalk.cyan("\nDone. Next steps:\n"));
  console.log("  1. Edit codemagic.plains.yaml with your variable groups");
  console.log("  2. Fill in codemagic.config.json with your API credentials");
  console.log("  3. Drop secret files into .codemagic/");
  console.log("  4. Run " + chalk.bold("cmenv sync --dry-run") + " to preview\n");
}
