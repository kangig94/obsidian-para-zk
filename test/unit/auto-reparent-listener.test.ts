import { describe, expect, it } from "vitest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { registerAutoReparent } from "../../src/ux/actions/auto-reparent";
import { workflowContext } from "../../src/vault/host";
import { createProject, createSubnote } from "../../src/workflows";
import { MockApp } from "../harness/vault";

describe("registerAutoReparent", () => {
  it("updates a child parent when Obsidian reports a file rename", async () => {
    const app = new MockApp();
    const plugin = fakePlugin(app);
    const ctx = workflowContext(plugin);
    registerAutoReparent(plugin);
    await createProject(ctx, { title: "Alpha", open: false });
    await createProject(ctx, { title: "Beta", open: false });
    const created = await createSubnote(ctx, {
      parentType: "project",
      parentTitle: "Alpha",
      title: "Plan",
      open: false
    });

    const file = app.vault.getFileByPath(created.path);
    expect(file).not.toBeNull();
    await app.fileManager.renameFile(file!, "PARA/Projects/Beta/Plan.md");
    await app.flushVaultEvents();

    expect(app.readPath("PARA/Projects/Beta/Plan.md")).toContain("[[PARA/Projects/Beta/Beta.md|Beta]]");
  });
});

function fakePlugin(app: MockApp): ParaZkPluginContext {
  return {
    app,
    settings: structuredClone(DEFAULT_SETTINGS),
    registerEvent: () => {},
    saveSettings: async () => {},
    setupVault: async () => {
      throw new Error("setupVault is not available in unit tests");
    }
  } as unknown as ParaZkPluginContext;
}
