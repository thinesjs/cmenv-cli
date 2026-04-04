import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { discoverPaths, resolveCredentials } from "../src/discovery";

const TMP = join(__dirname, "__tmp_discovery__");

function setup(structure: Record<string, string>) {
  mkdirSync(TMP, { recursive: true });
  for (const [path, content] of Object.entries(structure)) {
    const full = join(TMP, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
}

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("discoverPaths", () => {
  it("finds plains file in given directory", () => {
    setup({ "codemagic.plains.yaml": "groups: {}" });
    const result = discoverPaths({ startDir: TMP });
    expect(result.plainsFile).toBe(join(TMP, "codemagic.plains.yaml"));
    expect(result.baseDir).toBe(TMP);
  });

  it("finds sibling secrets and config files", () => {
    setup({
      "codemagic.plains.yaml": "groups: {}",
      "codemagic.secrets.yaml": "groups: {}",
      "codemagic.config.json": '{"api_key": "x"}',
    });
    const result = discoverPaths({ startDir: TMP });
    expect(result.secretsFile).toBe(join(TMP, "codemagic.secrets.yaml"));
    expect(result.configFile).toBe(join(TMP, "codemagic.config.json"));
  });

  it("finds .codemagic directory", () => {
    setup({ "codemagic.plains.yaml": "groups: {}" });
    mkdirSync(join(TMP, ".codemagic"), { recursive: true });
    const result = discoverPaths({ startDir: TMP });
    expect(result.codemagicDir).toBe(join(TMP, ".codemagic"));
  });

  it("returns null for missing optional files", () => {
    setup({ "codemagic.plains.yaml": "groups: {}" });
    const result = discoverPaths({ startDir: TMP });
    expect(result.secretsFile).toBeNull();
    expect(result.configFile).toBeNull();
    expect(result.codemagicDir).toBeNull();
  });

  it("walks up directories to find plains file", () => {
    setup({ "codemagic.plains.yaml": "groups: {}" });
    const subDir = join(TMP, "a", "b", "c");
    mkdirSync(subDir, { recursive: true });
    const result = discoverPaths({ startDir: subDir });
    expect(result.plainsFile).toBe(join(TMP, "codemagic.plains.yaml"));
  });

  it("throws when no plains file found", () => {
    mkdirSync(TMP, { recursive: true });
    expect(() => discoverPaths({ startDir: TMP, stopAt: TMP })).toThrow(
      "No codemagic.plains.yaml found"
    );
  });

  it("uses explicit config path over discovery", () => {
    const explicit = join(TMP, "custom", "my-plains.yaml");
    setup({ "custom/my-plains.yaml": "groups: {}" });
    const result = discoverPaths({ configPath: explicit });
    expect(result.plainsFile).toBe(explicit);
    expect(result.baseDir).toBe(join(TMP, "custom"));
  });
});

describe("resolveCredentials", () => {
  it("uses CLI args first", () => {
    const creds = resolveCredentials({
      cliArgs: { apiKey: "cli-key", teamId: "cli-team", appId: "cli-app" },
    });
    expect(creds).toEqual({
      apiKey: "cli-key",
      teamId: "cli-team",
      appId: "cli-app",
    });
  });

  it("falls back to config file", () => {
    setup({
      "codemagic.config.json": JSON.stringify({
        api_key: "cfg-key",
        team_id: "cfg-team",
        app_id: "cfg-app",
      }),
    });
    const creds = resolveCredentials({
      configFile: join(TMP, "codemagic.config.json"),
    });
    expect(creds).toEqual({
      apiKey: "cfg-key",
      teamId: "cfg-team",
      appId: "cfg-app",
    });
  });

  it("falls back to env vars", () => {
    const prevApiKey = process.env.CODEMAGIC_API_KEY;
    const prevTeamId = process.env.CODEMAGIC_TEAM_ID;
    const prevAppId = process.env.CODEMAGIC_APP_ID;
    process.env.CODEMAGIC_API_KEY = "env-key";
    process.env.CODEMAGIC_TEAM_ID = "env-team";
    process.env.CODEMAGIC_APP_ID = "env-app";
    try {
      const creds = resolveCredentials({});
      expect(creds).toEqual({
        apiKey: "env-key",
        teamId: "env-team",
        appId: "env-app",
      });
    } finally {
      if (prevApiKey === undefined) delete process.env.CODEMAGIC_API_KEY;
      else process.env.CODEMAGIC_API_KEY = prevApiKey;
      if (prevTeamId === undefined) delete process.env.CODEMAGIC_TEAM_ID;
      else process.env.CODEMAGIC_TEAM_ID = prevTeamId;
      if (prevAppId === undefined) delete process.env.CODEMAGIC_APP_ID;
      else process.env.CODEMAGIC_APP_ID = prevAppId;
    }
  });

  it("merges across sources (CLI > config > env)", () => {
    setup({
      "codemagic.config.json": JSON.stringify({
        api_key: "cfg-key",
        team_id: "cfg-team",
        app_id: "cfg-app",
      }),
    });
    const creds = resolveCredentials({
      cliArgs: { apiKey: "cli-key" },
      configFile: join(TMP, "codemagic.config.json"),
    });
    expect(creds.apiKey).toBe("cli-key");
    expect(creds.teamId).toBe("cfg-team");
    expect(creds.appId).toBe("cfg-app");
  });

  it("throws when required credentials missing", () => {
    expect(() => resolveCredentials({})).toThrow();
  });
});
