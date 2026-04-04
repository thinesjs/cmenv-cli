import { readFileSync, existsSync } from "fs";
import { join } from "path";
import * as yaml from "js-yaml";
import {
  PlainsConfig,
  PlainsVariable,
  ResolvedGroup,
  ResolvedVariable,
  DiscoveredPaths,
} from "./types";

export function loadConfig(paths: DiscoveredPaths): ResolvedGroup[] {
  const plains = parseYaml(paths.plainsFile);
  validateNoDuplicates(plains, paths.plainsFile);

  let merged = plains;

  if (paths.secretsFile) {
    const secrets = parseYaml(paths.secretsFile);
    validateNoDuplicates(secrets, paths.secretsFile);
    merged = mergeConfigs(plains, secrets);
  }

  return resolveGroups(merged, paths.codemagicDir);
}

function parseYaml(filePath: string): PlainsConfig {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw) as PlainsConfig;

  if (!parsed || !parsed.groups) {
    return { groups: {} };
  }

  return parsed;
}

function validateNoDuplicates(config: PlainsConfig, filePath: string): void {
  for (const [groupName, group] of Object.entries(config.groups)) {
    if (!group.variables) continue;
    const seen = new Set<string>();
    for (const v of group.variables) {
      if (seen.has(v.name)) {
        throw new Error(
          `Duplicate variable "${v.name}" in group "${groupName}" in ${filePath}`
        );
      }
      seen.add(v.name);
    }
  }
}

function mergeConfigs(
  plains: PlainsConfig,
  secrets: PlainsConfig
): PlainsConfig {
  const merged: PlainsConfig = {
    groups: { ...plains.groups },
  };

  for (const [groupName, secretGroup] of Object.entries(secrets.groups)) {
    if (!merged.groups[groupName]) {
      merged.groups[groupName] = secretGroup;
      continue;
    }

    const plainsGroup = merged.groups[groupName];

    const mergedSecure =
      secretGroup.secure !== undefined
        ? secretGroup.secure
        : plainsGroup.secure;

    const plainsVars = [...(plainsGroup.variables || [])];
    const secretVars = secretGroup.variables || [];

    for (const secretVar of secretVars) {
      const existingIdx = plainsVars.findIndex(
        (v) => v.name === secretVar.name
      );
      if (existingIdx >= 0) {
        plainsVars[existingIdx] = secretVar;
      } else {
        plainsVars.push(secretVar);
      }
    }

    merged.groups[groupName] = {
      secure: mergedSecure,
      variables: plainsVars,
    };
  }

  return merged;
}

function resolveGroups(
  config: PlainsConfig,
  codemagicDir: string | null
): ResolvedGroup[] {
  const groups: ResolvedGroup[] = [];

  for (const [groupName, group] of Object.entries(config.groups)) {
    const groupSecure = group.secure ?? false;
    const variables: ResolvedVariable[] = [];

    for (const variable of group.variables || []) {
      variables.push(
        resolveVariable(variable, groupName, groupSecure, codemagicDir)
      );
    }

    groups.push({ name: groupName, variables });
  }

  return groups;
}

function resolveVariable(
  variable: PlainsVariable,
  groupName: string,
  groupSecure: boolean,
  codemagicDir: string | null
): ResolvedVariable {
  if (variable.file) {
    if (!codemagicDir) {
      throw new Error(
        `Variable "${variable.name}" in group "${groupName}" references file "${variable.file}" but no .codemagic directory found`
      );
    }
    const filePath = join(codemagicDir, variable.file);
    if (!existsSync(filePath)) {
      throw new Error(
        `File not found for variable "${variable.name}" in group "${groupName}": ${filePath}`
      );
    }
    const content = readFileSync(filePath);
    return {
      name: variable.name,
      value: content.toString("base64"),
      secure: variable.secure ?? true,
    };
  }

  if (variable.file_raw) {
    if (!codemagicDir) {
      throw new Error(
        `Variable "${variable.name}" in group "${groupName}" references file_raw "${variable.file_raw}" but no .codemagic directory found`
      );
    }
    const filePath = join(codemagicDir, variable.file_raw);
    if (!existsSync(filePath)) {
      throw new Error(
        `File not found for variable "${variable.name}" in group "${groupName}": ${filePath}`
      );
    }
    return {
      name: variable.name,
      value: readFileSync(filePath, "utf-8"),
      secure: variable.secure ?? true,
    };
  }

  if (!variable.value && variable.value !== "") {
    throw new Error(
      `Variable "${variable.name}" in group "${groupName}" must have either "value", "file", or "file_raw"`
    );
  }

  return {
    name: variable.name,
    value: variable.value!,
    secure: variable.secure ?? groupSecure,
  };
}
