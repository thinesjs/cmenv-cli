import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";

const PLAINS_TEMPLATE = `groups:
  global-vars:
    variables:
      - name: NODEJS_VERSION
        value: "22"

  staging-vars:
    secure: true
    variables:
      - name: BUILD_ENV
        value: "staging"
      - name: BUNDLE_ID
        value: "com.example.app.staging"
        secure: false
      - name: GOOGLE_SERVICES_JSON
        file: staging/google-services.json
      - name: GOOGLE_SERVICES_PLIST
        file: staging/GoogleService-Info.plist
      - name: ENV_STAGING
        file: staging/.env.staging

  prod-vars:
    secure: true
    variables:
      - name: BUILD_ENV
        value: "production"
      - name: BUNDLE_ID
        value: "com.example.app"
        secure: false
      - name: PROD_BUILD_NUMBER
        value: "1"
        secure: false
      - name: GOOGLE_SERVICES_JSON
        file: production/google-services.json
      - name: GOOGLE_SERVICES_PLIST
        file: production/GoogleService-Info.plist
      - name: ENV_PRODUCTION
        file: production/.env.production
      - name: FIREBASE_SERVICE_ACCOUNT
        file_raw: credentials/firebase-service-account.json

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

interface InitCommandOptions {
  force: boolean;
}

export function initCommand(options: InitCommandOptions): void {
  const cwd = process.cwd();

  console.log(chalk.cyan("\nInitializing cmenv...\n"));

  // codemagic.plains.yaml
  const plainsPath = join(cwd, "codemagic.plains.yaml");
  if (existsSync(plainsPath) && !options.force) {
    console.log(chalk.gray("  skip  codemagic.plains.yaml (exists)"));
  } else {
    writeFileSync(plainsPath, PLAINS_TEMPLATE);
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
    ".codemagic/staging",
    ".codemagic/production",
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
