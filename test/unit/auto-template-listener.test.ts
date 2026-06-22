import { describe, expect, it } from "vitest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { registerAutoTemplate } from "../../src/ux/actions/auto-template";
import { MockApp } from "../harness/vault";

describe("registerAutoTemplate", () => {
  // MockApp fires onLayoutReady immediately, so this unit suite cannot observe
  // the deferral guard directly; Obsidian smoke coverage keeps that path covered.
  it("templates an empty managed Markdown file created after layout-ready", async () => {
    const app = new MockApp();
    registerAutoTemplate(fakePlugin(app));

    await app.vault.create("PARA/Resources/Native.md", "");
    await app.flushVaultEvents();

    const content = app.readPath("PARA/Resources/Native.md") ?? "";
    expect(content).toContain("type: resource");
    expect(content).not.toContain("```para-zk-props");
    expect(content).not.toContain("```para-zk-managed");
  });

  it("leaves non-empty managed Markdown files untouched", async () => {
    const app = new MockApp();
    registerAutoTemplate(fakePlugin(app));

    await app.vault.create("PARA/Resources/Existing.md", "Human text\n");
    await app.flushVaultEvents();

    expect(app.readPath("PARA/Resources/Existing.md")).toBe("Human text\n");
  });

  it("leaves files unchanged when content appears before the async read runs", async () => {
    const app = new MockApp();
    const originalRead = app.vault.read;
    let resolveReadStarted: () => void = () => {};
    let releaseRead: () => void = () => {};
    const readStarted = new Promise<void>((resolve) => {
      resolveReadStarted = resolve;
    });
    const readCanContinue = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    app.vault.read = async (file) => {
      resolveReadStarted();
      await readCanContinue;
      return originalRead(file);
    };
    registerAutoTemplate(fakePlugin(app));

    const file = await app.vault.create("PARA/Resources/Race.md", "");
    await readStarted;
    await app.vault.modify(file, "Human text\n");
    releaseRead();
    await app.flushVaultEvents();

    expect(app.readPath("PARA/Resources/Race.md")).toBe("Human text\n");
  });

  it("leaves empty project subfolder notes without folder-notes untouched", async () => {
    const app = new MockApp();
    registerAutoTemplate(fakePlugin(app));

    await app.vault.create("PARA/Projects/Loose/Plan.md", "");
    await app.flushVaultEvents();

    expect(app.readPath("PARA/Projects/Loose/Plan.md")).toBe("");
  });

  it("leaves empty non-managed Markdown files untouched", async () => {
    const app = new MockApp();
    registerAutoTemplate(fakePlugin(app));

    await app.vault.create("Scratch/Note.md", "");
    await app.flushVaultEvents();

    expect(app.readPath("Scratch/Note.md")).toBe("");
  });

  it("ignores non-Markdown files", async () => {
    const app = new MockApp();
    registerAutoTemplate(fakePlugin(app));

    await app.vault.create("PARA/Resources/Native.txt", "");
    await app.flushVaultEvents();

    expect(app.readPath("PARA/Resources/Native.txt")).toBe("");
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
