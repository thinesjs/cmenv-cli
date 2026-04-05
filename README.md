# cmenv-cli

CLI tool for syncing environment variables to [Codemagic](https://codemagic.io) from a version-controlled YAML config.

Define your variable groups in `codemagic.plains.yaml`, keep secrets in a gitignored `codemagic.secrets.yaml`, and sync them to Codemagic with a single command.

## Install

```bash
npm install -g @thinesjs/cmenv
```

Or run directly:

```bash
npx @thinesjs/cmenv sync --dry-run
```

## Quick Start

### 1. Add to `.gitignore`

```gitignore
# cmenv
codemagic.config.json
codemagic.secrets.yaml
.codemagic/
```

### 2. Create `codemagic.plains.yaml`

This is the source of truth for your Codemagic variable groups. Committed to git.

```yaml
groups:
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
```

### 3. Create `codemagic.config.json` (gitignored)

```json
{
  "api_key": "your-codemagic-api-key",
  "team_id": "your-team-id",
  "app_id": "your-app-id"
}
```

### 4. Set up `.codemagic/` directory (gitignored)

Drop your secret files here. File paths in the YAML resolve relative to this directory.

```
.codemagic/
├── staging/
│   ├── google-services.json
│   ├── GoogleService-Info.plist
│   └── .env.staging
├── production/
│   ├── google-services.json
│   ├── GoogleService-Info.plist
│   └── .env.production
└── credentials/
    └── firebase-service-account.json
```

### 5. Sync

```bash
cmenv sync --dry-run    # preview
cmenv sync --update     # push to codemagic
cmenv list              # verify remote state
```

### 6. Compatible `codemagic.yaml`

Minimal Codemagic workflow config that works with the variable groups above:

```yaml
definitions:
  environments:
    - &base_env
      vars:
        CM_CLONE_DEPTH: 3

    - &android_base_env
      node: $NODEJS_VERSION
      android_signing:
        - your-keystore-name

    - &ios_base_env
      node: $NODEJS_VERSION
      xcode: $XCODE_VERSION
      cocoapods: $COCOAPODS_VERSION
      ruby: $RUBY_VERSION

    - &ios_appstore_signing
      distribution_type: app_store
      bundle_identifier: $BUNDLE_ID

    - &ios_adhoc_signing
      distribution_type: ad_hoc
      bundle_identifier: $BUNDLE_ID

  env_groups:
    - &staging_android_groups
      - global-vars
      - staging-vars

    - &staging_ios_groups
      - global-vars
      - ios-global-vars
      - staging-vars

    - &prod_android_groups
      - global-vars
      - prod-vars

    - &prod_ios_groups
      - global-vars
      - ios-global-vars
      - prod-vars

  steps:
    - step: &android_files_config
        name: Load Android files configuration
        script: |
          #!/usr/bin/env sh
          set -e
          echo $GOOGLE_SERVICES_JSON | base64 --decode > android/app/src/$BUILD_ENV/google-services.json

    - step: &ios_files_config
        name: Load iOS files configuration
        script: |
          #!/usr/bin/env sh
          set -e
          echo $GOOGLE_SERVICES_PLIST | base64 --decode > ios/GoogleService-Info.plist

    - step: &set_android_sdk_location
        name: Set Android SDK location
        script: echo "sdk.dir=$ANDROID_SDK_ROOT" > "android/local.properties"

    - step: &install_deps
        name: Install dependencies
        script: yarn install

    - step: &install_cp_deps
        name: Install CocoaPods dependencies
        script: |
          gem install cocoapods -v $COCOAPODS_VERSION
          gem install xcpretty
          cd ios && pod install

    - step: &generate_env_staging
        name: Export .env.staging
        script: |
          PACKAGE_VERSION=$(cat package.json | jq -r '.version')
          UPDATED_BUILD_NUMBER=$((10000 + $PROJECT_BUILD_NUMBER))
          echo $ENV_STAGING | base64 --decode > .env.staging
          echo "APP_BUILD_NUMBER=$UPDATED_BUILD_NUMBER" >> .env.staging
          echo "APP_VERSION=$PACKAGE_VERSION" >> .env.staging

    - step: &generate_env_prod
        name: Export .env.production
        script: |
          PACKAGE_VERSION=$(cat package.json | jq -r '.version')
          echo $ENV_PRODUCTION | base64 --decode > .env.production
          echo "APP_BUILD_NUMBER=$PROD_BUILD_NUMBER" >> .env.production
          echo "APP_VERSION=$PACKAGE_VERSION" >> .env.production

  signing_steps:
    - step: &setup_adhoc_code_signing
        name: Set up ad-hoc code signing
        script: |
          keychain initialize
          app-store-connect fetch-signing-files "$BUNDLE_ID" --type IOS_APP_ADHOC --create
          keychain add-certificates
          xcode-project use-profiles --project ios/*.xcodeproj --archive-method=ad-hoc

    - step: &setup_appstore_code_signing
        name: Set up App Store code signing
        script: |
          keychain initialize
          app-store-connect fetch-signing-files "$BUNDLE_ID" --type IOS_APP_STORE --create
          keychain add-certificates
          xcode-project use-profiles --project ios/*.xcodeproj

  builds:
    - step: &build_android_staging
        name: Build Android staging
        script: cd android && ./gradlew assembleStagingRelease

    - step: &build_android_prod
        name: Build Android production
        script: cd android && ./gradlew bundleProductionRelease

    - step: &build_ios
        name: Build iOS IPA
        script: |
          xcode-project build-ipa \
            --workspace "ios/$XCODE_WORKSPACE" \
            --scheme "$XCODE_SCHEME"

workflows:
  staging-android-release:
    name: "[Android] Staging Release"
    max_build_duration: 60
    instance_type: linux_x2
    environment:
      <<: [*base_env, *android_base_env]
      groups: *staging_android_groups
    scripts:
      - *set_android_sdk_location
      - *android_files_config
      - *generate_env_staging
      - *install_deps
      - *build_android_staging

  staging-ios-release:
    name: "[iOS] Staging Release"
    max_build_duration: 60
    instance_type: mac_mini_m2
    environment:
      <<: [*base_env, *ios_base_env]
      groups: *staging_ios_groups
      ios_signing:
        <<: *ios_adhoc_signing
    scripts:
      - *ios_files_config
      - *generate_env_staging
      - *install_deps
      - *install_cp_deps
      - *setup_adhoc_code_signing
      - *build_ios

  production-android-release:
    name: "[Android] Production Release"
    max_build_duration: 60
    instance_type: mac_mini_m2
    environment:
      <<: [*base_env, *android_base_env]
      groups: *prod_android_groups
    scripts:
      - *set_android_sdk_location
      - *android_files_config
      - *generate_env_prod
      - *install_deps
      - *build_android_prod
    publishing:
      google_play:
        credentials: $FIREBASE_SERVICE_ACCOUNT
        track: internal
        submit_as_draft: true

  production-ios-release:
    name: "[iOS] Production Release"
    max_build_duration: 60
    instance_type: mac_mini_m2
    integrations:
      app_store_connect: codemagic
    environment:
      <<: [*base_env, *ios_base_env]
      groups: *prod_ios_groups
      ios_signing:
        <<: *ios_appstore_signing
    scripts:
      - *ios_files_config
      - *generate_env_prod
      - *install_deps
      - *install_cp_deps
      - *setup_appstore_code_signing
      - *build_ios
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
```

## File Structure

| File | Committed | Purpose |
|------|-----------|---------|
| `codemagic.plains.yaml` | Yes | Variable groups and non-secret values |
| `codemagic.secrets.yaml` | No | Secret values, merged into plains at sync time |
| `codemagic.config.json` | No | Codemagic API credentials |
| `.codemagic/` | No | Secret files referenced by `file` / `file_raw` |

Only `codemagic.plains.yaml` is required.

## Variable Definitions

Variables support three value sources:

```yaml
groups:
  my-group:
    secure: true  # default secure flag for all variables in group
    variables:
      # inline value
      - name: API_URL
        value: "https://api.example.com"

      # file reference — base64-encoded at sync time, secure by default
      - name: GOOGLE_SERVICES_JSON
        file: staging/google-services.json

      # raw file reference — read as-is, secure by default
      - name: SERVICE_ACCOUNT
        file_raw: credentials/service-account.json

      # per-variable secure override
      - name: BUILD_NUMBER
        value: "42"
        secure: false
```

File paths (`file`, `file_raw`) resolve relative to the `.codemagic/` directory.

## Secrets

`codemagic.secrets.yaml` uses the same format as the plains file. At sync time, it's deep-merged into the plains config:

- Variables are matched by name within each group
- Secrets file wins on conflict
- New variables are appended
- New groups are added

```yaml
# codemagic.secrets.yaml
groups:
  my-group:
    variables:
      - name: API_KEY
        value: "sk-live-abc123"
```

## Commands

### sync

```bash
cmenv sync                    # sync all groups (create only)
cmenv sync --update           # create + update existing
cmenv sync --dry-run          # preview without changes
cmenv sync --group <name>     # sync specific group
cmenv sync --delete-extra     # remove remote vars not in config
```

### list

```bash
cmenv list                    # show remote groups and variables
```

### clean

```bash
cmenv clean --group <name> --dry-run   # preview deletions
cmenv clean --group <name> --yes       # delete variables in group
cmenv clean --all --yes                # delete all variables
cmenv clean --all --delete-groups --yes # delete groups too
```

## Credentials

Resolved in this order (first wins):

1. CLI flags: `--api-key`, `--team-id`, `--app-id`
2. `codemagic.config.json` (sibling of plains file)
3. Environment variables: `CODEMAGIC_API_KEY`, `CODEMAGIC_TEAM_ID`, `CODEMAGIC_APP_ID`

`--env-file <path>` loads a dotenv file into the environment before credential resolution.

## Config Discovery

cmenv finds `codemagic.plains.yaml` automatically:

1. `--config <path>` flag (explicit)
2. Current working directory
3. Walk up parent directories

Once found, sibling files (`codemagic.secrets.yaml`, `codemagic.config.json`) and `.codemagic/` are resolved relative to the same directory.

## License

MIT
