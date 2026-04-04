import { describe, it, expect, vi } from "vitest";
import { Updater } from "../src/updater";
import { CodemagicAPI } from "../src/api/codemagic";
import { ResolvedGroup, SyncOptions } from "../src/types";

function mockApi(overrides: Partial<CodemagicAPI> = {}): CodemagicAPI {
  return {
    listVariableGroups: vi.fn().mockResolvedValue([]),
    createVariableGroup: vi.fn().mockResolvedValue({ id: "new-id", name: "" }),
    deleteVariableGroup: vi.fn().mockResolvedValue(undefined),
    listVariables: vi.fn().mockResolvedValue([]),
    bulkImportVariables: vi.fn().mockResolvedValue(undefined),
    updateVariable: vi.fn().mockResolvedValue(undefined),
    deleteVariable: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CodemagicAPI;
}

const defaultSyncOpts: SyncOptions = {
  update: false,
  deleteExtra: false,
  dryRun: false,
};

describe("Updater.sync", () => {
  it("creates a new group when it does not exist remotely", async () => {
    const api = mockApi();
    const updater = new Updater(api);
    const groups: ResolvedGroup[] = [
      { name: "my-group", variables: [{ name: "A", value: "1", secure: false }] },
    ];

    await updater.sync(groups, defaultSyncOpts);

    expect(api.createVariableGroup).toHaveBeenCalledWith("my-group");
    expect(api.bulkImportVariables).toHaveBeenCalled();
  });

  it("skips existing groups when update is false", async () => {
    const api = mockApi({
      listVariableGroups: vi.fn().mockResolvedValue([{ id: "g1", name: "my-group" }]),
    });
    const updater = new Updater(api);
    const groups: ResolvedGroup[] = [
      { name: "my-group", variables: [{ name: "A", value: "1", secure: false }] },
    ];

    await updater.sync(groups, { ...defaultSyncOpts, update: false });

    expect(api.createVariableGroup).not.toHaveBeenCalled();
    expect(api.updateVariable).not.toHaveBeenCalled();
  });

  it("updates existing variables when update is true", async () => {
    const api = mockApi({
      listVariableGroups: vi.fn().mockResolvedValue([{ id: "g1", name: "my-group" }]),
      listVariables: vi.fn().mockResolvedValue([
        { id: "v1", name: "A", value: "old", secure: false },
      ]),
    });
    const updater = new Updater(api);
    const groups: ResolvedGroup[] = [
      { name: "my-group", variables: [{ name: "A", value: "new", secure: false }] },
    ];

    await updater.sync(groups, { ...defaultSyncOpts, update: true });

    expect(api.updateVariable).toHaveBeenCalledWith("g1", "v1", {
      value: "new",
      secure: false,
    });
  });

  it("adds new variables to existing group", async () => {
    const api = mockApi({
      listVariableGroups: vi.fn().mockResolvedValue([{ id: "g1", name: "my-group" }]),
      listVariables: vi.fn().mockResolvedValue([]),
    });
    const updater = new Updater(api);
    const groups: ResolvedGroup[] = [
      { name: "my-group", variables: [{ name: "NEW", value: "x", secure: false }] },
    ];

    await updater.sync(groups, { ...defaultSyncOpts, update: true });

    expect(api.bulkImportVariables).toHaveBeenCalledWith(
      "g1",
      [{ name: "NEW", value: "x" }],
      false
    );
  });

  it("deletes extra remote variables when deleteExtra is true", async () => {
    const api = mockApi({
      listVariableGroups: vi.fn().mockResolvedValue([{ id: "g1", name: "my-group" }]),
      listVariables: vi.fn().mockResolvedValue([
        { id: "v1", name: "KEEP", value: "1", secure: false },
        { id: "v2", name: "EXTRA", value: "2", secure: false },
      ]),
    });
    const updater = new Updater(api);
    const groups: ResolvedGroup[] = [
      { name: "my-group", variables: [{ name: "KEEP", value: "1", secure: false }] },
    ];

    await updater.sync(groups, { ...defaultSyncOpts, update: true, deleteExtra: true });

    expect(api.deleteVariable).toHaveBeenCalledWith("g1", "v2");
    expect(api.deleteVariable).not.toHaveBeenCalledWith("g1", "v1");
  });

  it("does not call API in dry-run mode", async () => {
    const api = mockApi();
    const updater = new Updater(api);
    const groups: ResolvedGroup[] = [
      { name: "my-group", variables: [{ name: "A", value: "1", secure: false }] },
    ];

    await updater.sync(groups, { ...defaultSyncOpts, dryRun: true });

    expect(api.createVariableGroup).not.toHaveBeenCalled();
    expect(api.bulkImportVariables).not.toHaveBeenCalled();
  });
});

describe("Updater.clean", () => {
  it("deletes all variables in matched groups", async () => {
    const api = mockApi({
      listVariableGroups: vi.fn().mockResolvedValue([{ id: "g1", name: "my-group" }]),
      listVariables: vi.fn().mockResolvedValue([
        { id: "v1", name: "A" },
        { id: "v2", name: "B" },
      ]),
    });
    const updater = new Updater(api);

    await updater.clean({ group: "my-group", all: false, deleteGroups: false, dryRun: false, yes: true });

    expect(api.deleteVariable).toHaveBeenCalledTimes(2);
    expect(api.deleteVariableGroup).not.toHaveBeenCalled();
  });

  it("deletes groups when deleteGroups is true", async () => {
    const api = mockApi({
      listVariableGroups: vi.fn().mockResolvedValue([{ id: "g1", name: "my-group" }]),
      listVariables: vi.fn().mockResolvedValue([]),
    });
    const updater = new Updater(api);

    await updater.clean({ group: "my-group", all: false, deleteGroups: true, dryRun: false, yes: true });

    expect(api.deleteVariableGroup).toHaveBeenCalledWith("g1");
  });

  it("does not call API in dry-run mode", async () => {
    const api = mockApi({
      listVariableGroups: vi.fn().mockResolvedValue([{ id: "g1", name: "my-group" }]),
      listVariables: vi.fn().mockResolvedValue([{ id: "v1", name: "A" }]),
    });
    const updater = new Updater(api);

    await updater.clean({ group: "my-group", all: false, deleteGroups: false, dryRun: true, yes: true });

    expect(api.deleteVariable).not.toHaveBeenCalled();
  });
});
