import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { setupVault } from "../../src/runtime/setup";
import { managedArtifacts, type ManagedArtifact } from "../../src/templates";
import { DEFAULT_SETTINGS, type ParaZkSettings, type SetupOptions } from "../../src/types";
import { MockApp } from "../harness/vault";

type AdapterWithIo = MockApp["vault"]["adapter"] & {
  read: (path: string) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

function baseSettings(): ParaZkSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

function targetArtifact(settings: ParaZkSettings): ManagedArtifact {
  const path = `${settings.paths.managedTemplatesFolder}/template_project.md`;
  const artifact = managedArtifacts(settings).find((candidate) => candidate.path === path);
  if (!artifact) throw new Error(`Missing managed artifact ${path}`);
  return artifact;
}

function createSetupApp(): MockApp {
  const app = new MockApp();
  const adapter = app.vault.adapter as AdapterWithIo;

  adapter.read = async (path) => app.readPath(path) ?? "";
  adapter.write = async (path, content) => {
    const existing = app.vault.getFileByPath(path);
    if (existing) {
      await app.vault.modify(existing, content);
      return;
    }
    await app.vault.create(path, content);
  };
  adapter.mkdir = async (path) => {
    await app.vault.createFolder(path);
  };

  return app;
}

async function runSetup(
  app: MockApp,
  settings: ParaZkSettings,
  options: SetupOptions = {}
): Promise<Awaited<ReturnType<typeof setupVault>>> {
  return setupVault(app as unknown as App, settings, options);
}

async function modifyTarget(app: MockApp, path: string, content: string): Promise<void> {
  const file = app.vault.getFileByPath(path);
  if (!file) throw new Error(`Missing test file ${path}`);
  await app.vault.modify(file, content);
}

async function prepareKnownUserModifiedFile(): Promise<{
  app: MockApp;
  settings: ParaZkSettings;
  target: ManagedArtifact;
  userContent: string;
}> {
  const settings = baseSettings();
  const target = targetArtifact(settings);
  const app = createSetupApp();
  const initial = await runSetup(app, settings);
  const userContent = "# User modified managed template\n";

  await modifyTarget(app, target.path, userContent);

  return {
    app,
    settings: initial.settings,
    target,
    userContent
  };
}

describe("setup managed-file state machine", () => {
  it("creates missing managed files and previews them during dry-run", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const dryRunApp = createSetupApp();

    const dryRun = await runSetup(dryRunApp, settings, { dryRun: true });

    expect(dryRun.result.created).toContain(target.path);
    expect(dryRunApp.readPath(target.path)).toBeUndefined();
    expect(dryRun.settings.managedFiles[target.path]).toBeUndefined();

    const app = createSetupApp();
    const actual = await runSetup(app, settings);

    expect(actual.result.created).toContain(target.path);
    expect(app.readPath(target.path)).toBe(target.content);
    expect(actual.settings.managedFiles[target.path]?.hash).toEqual(expect.any(String));

    const forceApp = createSetupApp();
    const forceRun = await runSetup(forceApp, settings, { force: true });

    expect(forceRun.result.created).toContain(target.path);
    expect(forceApp.readPath(target.path)).toBe(target.content);
    expect(forceRun.settings.managedFiles[target.path]?.hash).toEqual(expect.any(String));
  });

  it("accepts matching generated content as existing and records managed state", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const app = createSetupApp();

    await app.vault.create(target.path, target.content);
    const actual = await runSetup(app, settings);

    expect(actual.result.existing).toContain(target.path);
    expect(actual.result.skipped).not.toContain(target.path);
    expect(actual.settings.managedFiles[target.path]?.hash).toEqual(expect.any(String));

    const forceApp = createSetupApp();
    await forceApp.vault.create(target.path, target.content);
    const forceRun = await runSetup(forceApp, settings, { force: true });

    expect(forceRun.result.existing).toContain(target.path);
    expect(forceRun.result.updated).not.toContain(target.path);
    expect(forceRun.settings.managedFiles[target.path]?.hash).toEqual(expect.any(String));

    const dryRunApp = createSetupApp();
    await dryRunApp.vault.create(target.path, target.content);
    const dryRun = await runSetup(dryRunApp, settings, { dryRun: true });

    expect(dryRun.result.existing).toContain(target.path);
    expect(dryRun.result.updated).not.toContain(target.path);
    expect(dryRun.settings.managedFiles[target.path]).toBeUndefined();
  });

  it("updates known unmodified managed files when generated output changes", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const app = createSetupApp();
    const initial = await runSetup(app, settings);
    const koSettings: ParaZkSettings = { ...initial.settings, locale: "ko" };
    const koTarget = targetArtifact(koSettings);

    const dryRun = await runSetup(app, initial.settings, { dryRun: true, locale: "ko" });

    expect(dryRun.result.updated).toContain(target.path);
    expect(app.readPath(target.path)).toBe(target.content);

    const actual = await runSetup(app, initial.settings, { locale: "ko" });

    expect(actual.result.updated).toContain(target.path);
    expect(app.readPath(target.path)).toBe(koTarget.content);
    expect(actual.settings.managedFiles[target.path]?.hash).toEqual(expect.any(String));

    const forceApp = createSetupApp();
    const forceInitial = await runSetup(forceApp, settings);
    const forceRun = await runSetup(forceApp, forceInitial.settings, { force: true, locale: "ko" });

    expect(forceRun.result.updated).toContain(target.path);
    expect(forceApp.readPath(target.path)).toBe(koTarget.content);
  });

  it("skips unknown existing files unless force is used", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const userContent = "# User-managed template\n";
    const warning = `Skipped user-managed file at ${target.path}`;

    const defaultApp = createSetupApp();
    await defaultApp.vault.create(target.path, userContent);
    const defaultRun = await runSetup(defaultApp, settings);

    expect(defaultRun.result.skipped).toContain(target.path);
    expect(defaultRun.result.warnings).toContain(warning);
    expect(defaultApp.readPath(target.path)).toBe(userContent);

    const dryRunApp = createSetupApp();
    await dryRunApp.vault.create(target.path, userContent);
    const dryRun = await runSetup(dryRunApp, settings, { dryRun: true });

    expect(dryRun.result.skipped).toContain(target.path);
    expect(dryRun.result.warnings).toContain(warning);
    expect(dryRunApp.readPath(target.path)).toBe(userContent);

    const forceApp = createSetupApp();
    await forceApp.vault.create(target.path, userContent);
    const forceRun = await runSetup(forceApp, settings, { force: true });

    expect(forceRun.result.updated).toContain(target.path);
    expect(forceRun.result.skipped).not.toContain(target.path);
    expect(forceApp.readPath(target.path)).toBe(target.content);

    const forceDryRunApp = createSetupApp();
    await forceDryRunApp.vault.create(target.path, userContent);
    const forceDryRun = await runSetup(forceDryRunApp, settings, { force: true, dryRun: true });

    expect(forceDryRun.result.updated).toContain(target.path);
    expect(forceDryRun.result.skipped).not.toContain(target.path);
    expect(forceDryRunApp.readPath(target.path)).toBe(userContent);
  });

  it("skips user-modified known managed files unless force is used", async () => {
    const defaultState = await prepareKnownUserModifiedFile();
    const warning = `Skipped user-modified PARA-ZK file at ${defaultState.target.path}; pass force=true to overwrite`;

    const defaultRun = await runSetup(defaultState.app, defaultState.settings);

    expect(defaultRun.result.skipped).toContain(defaultState.target.path);
    expect(defaultRun.result.warnings).toContain(warning);
    expect(defaultState.app.readPath(defaultState.target.path)).toBe(defaultState.userContent);

    const dryRunState = await prepareKnownUserModifiedFile();
    const dryRun = await runSetup(dryRunState.app, dryRunState.settings, { dryRun: true });

    expect(dryRun.result.skipped).toContain(dryRunState.target.path);
    expect(dryRun.result.warnings).toContain(warning);
    expect(dryRunState.app.readPath(dryRunState.target.path)).toBe(dryRunState.userContent);

    const forceState = await prepareKnownUserModifiedFile();
    const forceRun = await runSetup(forceState.app, forceState.settings, { force: true });

    expect(forceRun.result.updated).toContain(forceState.target.path);
    expect(forceRun.result.skipped).not.toContain(forceState.target.path);
    expect(forceState.app.readPath(forceState.target.path)).toBe(forceState.target.content);

    const forceDryRunState = await prepareKnownUserModifiedFile();
    const forceDryRun = await runSetup(forceDryRunState.app, forceDryRunState.settings, {
      force: true,
      dryRun: true
    });

    expect(forceDryRun.result.updated).toContain(forceDryRunState.target.path);
    expect(forceDryRun.result.skipped).not.toContain(forceDryRunState.target.path);
    expect(forceDryRunState.app.readPath(forceDryRunState.target.path)).toBe(forceDryRunState.userContent);
  });

  it("skips managed file paths occupied by folders", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const warning = `Cannot create file because a folder already exists at ${target.path}`;

    for (const options of [{}, { force: true }, { dryRun: true }] satisfies SetupOptions[]) {
      const app = createSetupApp();
      await app.vault.createFolder(target.path);

      const actual = await runSetup(app, settings, options);

      expect(actual.result.skipped).toContain(target.path);
      expect(actual.result.warnings).toContain(warning);
      expect(app.vault.getFileByPath(target.path)).toBeNull();
      expect(app.readPath(target.path)).toBeUndefined();
    }
  });
});
