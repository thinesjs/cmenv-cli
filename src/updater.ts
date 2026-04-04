import chalk from "chalk";
import { CodemagicAPI } from "./api/codemagic";
import {
  ResolvedGroup,
  ResolvedVariable,
  SyncOptions,
  CleanOptions,
} from "./types";

export class Updater {
  constructor(private api: CodemagicAPI) {}

  async sync(groups: ResolvedGroup[], options: SyncOptions): Promise<void> {
    const remoteGroups = await this.api.listVariableGroups();

    const groupsToSync = options.group
      ? groups.filter((g) => g.name === options.group)
      : groups;

    if (options.group && groupsToSync.length === 0) {
      throw new Error(`Group "${options.group}" not found in config`);
    }

    for (const localGroup of groupsToSync) {
      const remote = remoteGroups.find((g) => g.name === localGroup.name);

      if (!remote) {
        console.log(chalk.cyan(`Creating group: ${localGroup.name}`));
        if (!options.dryRun) {
          const newGroup = await this.api.createVariableGroup(localGroup.name);
          await this.api.bulkImportVariables(
            newGroup.id,
            localGroup.variables.map((v) => ({ name: v.name, value: v.value })),
            localGroup.variables[0]?.secure ?? false
          );
        }
        console.log(
          chalk.green(
            `  + Created with ${localGroup.variables.length} variable(s)`
          )
        );
      } else if (options.update) {
        console.log(chalk.cyan(`Updating group: ${localGroup.name}`));
        if (!options.dryRun) {
          await this.syncGroupVariables(
            remote.id,
            localGroup.variables,
            options
          );
        } else {
          await this.previewGroupSync(remote.id, localGroup.variables, options);
        }
      } else {
        console.log(
          chalk.gray(
            `Skipping existing group: ${localGroup.name} (use --update)`
          )
        );
      }
    }
  }

  private async syncGroupVariables(
    groupId: string,
    localVars: ResolvedVariable[],
    options: SyncOptions
  ): Promise<void> {
    const remoteVars = await this.api.listVariables(groupId);
    const remoteMap = new Map(remoteVars.map((v) => [v.name, v]));

    for (const localVar of localVars) {
      const remote = remoteMap.get(localVar.name);

      if (remote && remote.id) {
        await this.api.updateVariable(groupId, remote.id, {
          value: localVar.value,
          secure: localVar.secure,
        });
        console.log(chalk.yellow(`  ~ Updated: ${localVar.name}`));
        remoteMap.delete(localVar.name);
      } else {
        await this.api.bulkImportVariables(
          groupId,
          [{ name: localVar.name, value: localVar.value }],
          localVar.secure
        );
        console.log(chalk.green(`  + Added: ${localVar.name}`));
      }
    }

    if (options.deleteExtra) {
      for (const [name, remote] of remoteMap) {
        if (!remote.id) continue;
        await this.api.deleteVariable(groupId, remote.id);
        console.log(chalk.red(`  - Deleted extra: ${name}`));
      }
    }
  }

  private async previewGroupSync(
    groupId: string,
    localVars: ResolvedVariable[],
    options: SyncOptions
  ): Promise<void> {
    const remoteVars = await this.api.listVariables(groupId);
    const remoteMap = new Map(remoteVars.map((v) => [v.name, v]));

    for (const localVar of localVars) {
      const remote = remoteMap.get(localVar.name);
      if (remote) {
        console.log(chalk.yellow(`  ~ Would update: ${localVar.name}`));
        remoteMap.delete(localVar.name);
      } else {
        console.log(chalk.green(`  + Would add: ${localVar.name}`));
      }
    }

    if (options.deleteExtra) {
      for (const [name] of remoteMap) {
        console.log(chalk.red(`  - Would delete extra: ${name}`));
      }
    }
  }

  async list(): Promise<void> {
    const groups = await this.api.listVariableGroups();
    console.log(`\nFound ${groups.length} variable group(s):\n`);

    for (const group of groups) {
      const variables = await this.api.listVariables(group.id);
      console.log(chalk.cyan(`${group.name} (${group.id})`));
      console.log(`  ${variables.length} variable(s):`);

      for (const variable of variables) {
        const secureTag = variable.secure ? chalk.yellow(" [secure]") : "";
        const value = variable.secure ? "***" : variable.value;
        console.log(`  - ${variable.name}: ${value}${secureTag}`);
      }
      console.log("");
    }
  }

  async clean(options: CleanOptions): Promise<void> {
    const remoteGroups = await this.api.listVariableGroups();

    const groupsToClean = options.all
      ? remoteGroups
      : remoteGroups.filter((g) => g.name === options.group);

    if (groupsToClean.length === 0) {
      console.log(chalk.yellow("No matching groups found in Codemagic"));
      return;
    }

    for (const group of groupsToClean) {
      const variables = await this.api.listVariables(group.id);
      console.log(
        chalk.cyan(`Cleaning: ${group.name} (${variables.length} variables)`)
      );

      if (options.dryRun) {
        console.log(
          chalk.yellow(`  [DRY RUN] Would delete ${variables.length} variable(s)`)
        );
        if (options.deleteGroups) {
          console.log(chalk.yellow(`  [DRY RUN] Would delete group`));
        }
        continue;
      }

      for (const variable of variables) {
        if (!variable.id) continue;
        await this.api.deleteVariable(group.id, variable.id);
        console.log(chalk.red(`  - Deleted: ${variable.name}`));
      }

      if (options.deleteGroups) {
        await this.api.deleteVariableGroup(group.id);
        console.log(chalk.red(`  - Deleted group: ${group.name}`));
      }
    }
  }
}
