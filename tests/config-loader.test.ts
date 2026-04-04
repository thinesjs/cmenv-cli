import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { loadConfig } from "../src/config-loader";

const TMP = join(__dirname, "__tmp_config__");

function writePlains(content: string) {
  writeFileSync(join(TMP, "codemagic.plains.yaml"), content);
}

function writeSecrets(content: string) {
  writeFileSync(join(TMP, "codemagic.secrets.yaml"), content);
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(join(TMP, ".codemagic"), { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("parses a basic plains file", () => {
    writePlains(`
groups:
  my-group:
    variables:
      - name: FOO
        value: "bar"
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: null,
      codemagicDir: null,
      configFile: null,
      baseDir: TMP,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("my-group");
    expect(groups[0].variables).toEqual([
      { name: "FOO", value: "bar", secure: false },
    ]);
  });

  it("applies group-level secure default", () => {
    writePlains(`
groups:
  secrets:
    secure: true
    variables:
      - name: TOKEN
        value: "abc"
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: null,
      codemagicDir: null,
      configFile: null,
      baseDir: TMP,
    });
    expect(groups[0].variables[0].secure).toBe(true);
  });

  it("per-variable secure overrides group default", () => {
    writePlains(`
groups:
  secrets:
    secure: true
    variables:
      - name: PUBLIC_VAR
        value: "visible"
        secure: false
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: null,
      codemagicDir: null,
      configFile: null,
      baseDir: TMP,
    });
    expect(groups[0].variables[0].secure).toBe(false);
  });

  it("resolves file references to base64", () => {
    writeFileSync(join(TMP, ".codemagic", "test.json"), '{"key":"val"}');
    writePlains(`
groups:
  g:
    variables:
      - name: ENCODED
        file: test.json
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: null,
      codemagicDir: join(TMP, ".codemagic"),
      configFile: null,
      baseDir: TMP,
    });
    const expected = Buffer.from('{"key":"val"}').toString("base64");
    expect(groups[0].variables[0].value).toBe(expected);
    expect(groups[0].variables[0].secure).toBe(true);
  });

  it("resolves file_raw references as-is", () => {
    writeFileSync(join(TMP, ".codemagic", "raw.json"), '{"raw":true}');
    writePlains(`
groups:
  g:
    variables:
      - name: RAW
        file_raw: raw.json
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: null,
      codemagicDir: join(TMP, ".codemagic"),
      configFile: null,
      baseDir: TMP,
    });
    expect(groups[0].variables[0].value).toBe('{"raw":true}');
    expect(groups[0].variables[0].secure).toBe(true);
  });

  it("throws when file reference not found", () => {
    writePlains(`
groups:
  g:
    variables:
      - name: MISSING
        file: nonexistent.json
`);
    expect(() =>
      loadConfig({
        plainsFile: join(TMP, "codemagic.plains.yaml"),
        secretsFile: null,
        codemagicDir: join(TMP, ".codemagic"),
        configFile: null,
        baseDir: TMP,
      })
    ).toThrow("nonexistent.json");
  });

  it("throws when no .codemagic dir but file ref used", () => {
    writePlains(`
groups:
  g:
    variables:
      - name: F
        file: something.json
`);
    expect(() =>
      loadConfig({
        plainsFile: join(TMP, "codemagic.plains.yaml"),
        secretsFile: null,
        codemagicDir: null,
        configFile: null,
        baseDir: TMP,
      })
    ).toThrow(".codemagic");
  });

  it("merges secrets into plains", () => {
    writePlains(`
groups:
  my-group:
    variables:
      - name: PUBLIC
        value: "hello"
`);
    writeSecrets(`
groups:
  my-group:
    variables:
      - name: SECRET_KEY
        value: "s3cret"
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: join(TMP, "codemagic.secrets.yaml"),
      codemagicDir: null,
      configFile: null,
      baseDir: TMP,
    });
    expect(groups[0].variables).toHaveLength(2);
    expect(groups[0].variables.map((v) => v.name)).toContain("SECRET_KEY");
  });

  it("secrets override plains on name conflict", () => {
    writePlains(`
groups:
  g:
    variables:
      - name: VAR
        value: "from-plains"
`);
    writeSecrets(`
groups:
  g:
    variables:
      - name: VAR
        value: "from-secrets"
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: join(TMP, "codemagic.secrets.yaml"),
      codemagicDir: null,
      configFile: null,
      baseDir: TMP,
    });
    expect(groups[0].variables[0].value).toBe("from-secrets");
  });

  it("secrets add new groups", () => {
    writePlains(`
groups:
  existing:
    variables:
      - name: A
        value: "1"
`);
    writeSecrets(`
groups:
  new-group:
    variables:
      - name: B
        value: "2"
`);
    const groups = loadConfig({
      plainsFile: join(TMP, "codemagic.plains.yaml"),
      secretsFile: join(TMP, "codemagic.secrets.yaml"),
      codemagicDir: null,
      configFile: null,
      baseDir: TMP,
    });
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.name)).toContain("new-group");
  });

  it("throws on duplicate variable names within same group in same file", () => {
    writePlains(`
groups:
  g:
    variables:
      - name: DUPE
        value: "one"
      - name: DUPE
        value: "two"
`);
    expect(() =>
      loadConfig({
        plainsFile: join(TMP, "codemagic.plains.yaml"),
        secretsFile: null,
        codemagicDir: null,
        configFile: null,
        baseDir: TMP,
      })
    ).toThrow("Duplicate variable");
  });

  it("throws when variable has no value, file, or file_raw", () => {
    writePlains(`
groups:
  g:
    variables:
      - name: EMPTY
`);
    expect(() =>
      loadConfig({
        plainsFile: join(TMP, "codemagic.plains.yaml"),
        secretsFile: null,
        codemagicDir: null,
        configFile: null,
        baseDir: TMP,
      })
    ).toThrow('must have either "value", "file", or "file_raw"');
  });
});
