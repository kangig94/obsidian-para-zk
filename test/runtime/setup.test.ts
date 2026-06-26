import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { LAYOUT_FOLDERS, PARA_ZK_PATHS } from "../../src/layout";
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

function managedArtifactAt(settings: ParaZkSettings, path: string): ManagedArtifact {
  const artifact = managedArtifacts(settings).find((candidate) => candidate.path === path);
  if (!artifact) throw new Error(`Missing managed artifact ${path}`);
  return artifact;
}

function targetArtifact(settings: ParaZkSettings): ManagedArtifact {
  return managedArtifactAt(settings, `${PARA_ZK_PATHS.managedTemplatesFolder}/template_project.md`);
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

function createSetupAppWithPluginManager(): MockApp {
  const app = createSetupApp();
  Object.assign(app, {
    plugins: {
      manifests: {},
      enabledPlugins: new Set<string>()
    }
  });
  return app;
}

async function runSetup(
  app: MockApp,
  settings: ParaZkSettings,
  options: SetupOptions = {}
): Promise<Awaited<ReturnType<typeof setupVault>>> {
  return setupVault(app as unknown as App, settings, options);
}

const REQUIRED_DEPENDENCY_IDS = [
  "dataview",
  "folder-notes",
  "update-time-on-edit",
  "custom-sort"
] as const;

const ENHANCEMENT_DEPENDENCY_IDS = [
  "obsidian-tasks-plugin",
  "obsidian-trash-explorer",
  "homepage",
  "open-tab-settings"
] as const;

function dependencyActions(result: Awaited<ReturnType<typeof runSetup>>["result"]): Map<string, string> {
  return new Map(result.dependencies.map((dependency) => [dependency.id, dependency.action]));
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

describe("setup managed scaffolding", () => {
  it("prunes a legacy LLM-Wiki log graph exclusion idempotently without creating the log", async () => {
    const settings = baseSettings();
    const app = createSetupApp();
    await app.vault.create(".obsidian/app.json", JSON.stringify({
      userIgnoreFilters: [
        "LLM-Wiki/log.md",
        "Notes/log.md",
        "LLM-Wiki/log.md.backup"
      ]
    }, null, 2));

    const initial = await runSetup(app, settings);
    const appConfig = JSON.parse(app.readPath(".obsidian/app.json") ?? "{}") as { userIgnoreFilters?: string[] };
    expect(initial.result.updated).toContain(".obsidian/app.json");
    expect(appConfig.userIgnoreFilters).not.toContain("LLM-Wiki/log.md");
    expect(appConfig.userIgnoreFilters).toContain("Notes/log.md");
    expect(appConfig.userIgnoreFilters).toContain("LLM-Wiki/log.md.backup");
    expect(app.readPath("LLM-Wiki/log.md")).toBeUndefined();

    const rerun = await runSetup(app, initial.settings);
    expect(rerun.result.existing).toContain(".obsidian/app.json");
    expect(rerun.result.updated).not.toContain(".obsidian/app.json");
    const rerunConfig = JSON.parse(app.readPath(".obsidian/app.json") ?? "{}") as { userIgnoreFilters?: string[] };
    expect(rerunConfig.userIgnoreFilters).toEqual(appConfig.userIgnoreFilters);
    expect(app.readPath("LLM-Wiki/log.md")).toBeUndefined();
  });

  it("creates every fixed layout folder from code constants", async () => {
    const settings = baseSettings();
    const app = createSetupApp();

    const initial = await runSetup(app, settings);

    for (const folder of LAYOUT_FOLDERS) {
      expect(initial.result.created).toContain(folder);
      expect(app.vault.getAbstractFileByPath(folder)).toBeTruthy();
    }

    const rerun = await runSetup(app, initial.settings);
    for (const folder of LAYOUT_FOLDERS) {
      expect(rerun.result.created).not.toContain(folder);
      expect(rerun.result.existing).toContain(folder);
    }
  });

  it("reports the llm-wiki managed template as existing on a second setup run", async () => {
    const settings = baseSettings();
    const target = managedArtifactAt(settings, `${PARA_ZK_PATHS.managedTemplatesFolder}/template_llm-wiki.md`);
    const app = createSetupApp();

    const initial = await runSetup(app, settings);

    expect(initial.result.created).toContain(target.path);
    expect(app.readPath(target.path)).toBe(target.content);
    expect(target.content).toContain("type: llm-wiki");
    expect(target.content).toContain("aliases:\n---\n{{cursor}}\n");
    expect(target.content).not.toContain("```para-zk-props");
    expect(target.content).not.toContain("```para-zk-managed");

    const rerun = await runSetup(app, initial.settings);
    expect(rerun.result.existing).toContain(target.path);
    expect(rerun.result.created).not.toContain(target.path);
    expect(rerun.result.updated).not.toContain(target.path);
  });

  it("creates missing managed files and previews them during dry-run", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const dryRunApp = createSetupApp();

    const dryRun = await runSetup(dryRunApp, settings, { dryRun: true });

    expect(dryRun.result.created).toContain(target.path);
    expect(dryRunApp.readPath(target.path)).toBeUndefined();

    const app = createSetupApp();
    const actual = await runSetup(app, settings);

    expect(actual.result.created).toContain(target.path);
    expect(app.readPath(target.path)).toBe(target.content);
  });

  it("accepts matching generated content as existing", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const app = createSetupApp();

    await app.vault.create(target.path, target.content);
    const actual = await runSetup(app, settings);

    expect(actual.result.existing).toContain(target.path);
    expect(actual.result.skipped).not.toContain(target.path);

    const dryRunApp = createSetupApp();
    await dryRunApp.vault.create(target.path, target.content);
    const dryRun = await runSetup(dryRunApp, settings, { dryRun: true });

    expect(dryRun.result.existing).toContain(target.path);
    expect(dryRun.result.updated).not.toContain(target.path);
  });

  it("updates managed files when generated output changes", async () => {
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
  });

  it("overwrites existing managed files by default", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const userContent = "# User-edited managed template\n";

    const defaultApp = createSetupApp();
    await defaultApp.vault.create(target.path, userContent);
    const defaultRun = await runSetup(defaultApp, settings);

    expect(defaultRun.result.updated).toContain(target.path);
    expect(defaultRun.result.skipped).not.toContain(target.path);
    expect(defaultRun.result.warnings.some((warning) => warning.includes(target.path))).toBe(false);
    expect(defaultApp.readPath(target.path)).toBe(target.content);

    const dryRunApp = createSetupApp();
    await dryRunApp.vault.create(target.path, userContent);
    const dryRun = await runSetup(dryRunApp, settings, { dryRun: true });

    expect(dryRun.result.updated).toContain(target.path);
    expect(dryRun.result.skipped).not.toContain(target.path);
    expect(dryRunApp.readPath(target.path)).toBe(userContent);
  });

  it("overwrites user-modified managed files from previous setup runs", async () => {
    const defaultState = await prepareKnownUserModifiedFile();

    const defaultRun = await runSetup(defaultState.app, defaultState.settings);

    expect(defaultRun.result.updated).toContain(defaultState.target.path);
    expect(defaultRun.result.skipped).not.toContain(defaultState.target.path);
    expect(defaultRun.result.warnings.some((warning) => warning.includes(defaultState.target.path))).toBe(false);
    expect(defaultState.app.readPath(defaultState.target.path)).toBe(defaultState.target.content);

    const dryRunState = await prepareKnownUserModifiedFile();
    const dryRun = await runSetup(dryRunState.app, dryRunState.settings, { dryRun: true });

    expect(dryRun.result.updated).toContain(dryRunState.target.path);
    expect(dryRun.result.skipped).not.toContain(dryRunState.target.path);
    expect(dryRunState.app.readPath(dryRunState.target.path)).toBe(dryRunState.userContent);
  });

  it("skips managed file paths occupied by folders", async () => {
    const settings = baseSettings();
    const target = targetArtifact(settings);
    const warning = `Cannot create file because a folder already exists at ${target.path}`;

    for (const options of [{}, { dryRun: true }] satisfies SetupOptions[]) {
      const app = createSetupApp();
      await app.vault.createFolder(target.path);

      const actual = await runSetup(app, settings, options);

      expect(actual.result.skipped).toContain(target.path);
      expect(actual.result.warnings).toContain(warning);
      expect(app.vault.getFileByPath(target.path)).toBeNull();
      expect(app.readPath(target.path)).toBeUndefined();
    }
  });

  it("warns only for missing required dependencies when dependency installation is not selected", async () => {
    const settings = baseSettings();
    const app = createSetupAppWithPluginManager();

    const actual = await runSetup(app, settings);
    const actions = dependencyActions(actual.result);

    for (const id of REQUIRED_DEPENDENCY_IDS) {
      expect(actions.get(id)).toBe("warn");
      expect(actual.result.dependencies.find((dependency) => dependency.id === id)?.tier).toBe("required");
    }
    for (const id of ENHANCEMENT_DEPENDENCY_IDS) {
      expect(actions.get(id)).toBe("none");
      expect(actual.result.dependencies.find((dependency) => dependency.id === id)?.tier).toBe("enhancement");
    }
    expect(actual.result.warnings.filter((warning) => warning.startsWith("Required plugin"))).toHaveLength(
      REQUIRED_DEPENDENCY_IDS.length
    );
  });

  it("dry-runs only the selected dependency group", async () => {
    const settings = baseSettings();

    const requiredRun = await runSetup(createSetupAppWithPluginManager(), settings, {
      deps: "required",
      dryRun: true
    });
    const requiredActions = dependencyActions(requiredRun.result);
    for (const id of REQUIRED_DEPENDENCY_IDS) {
      expect(requiredActions.get(id)).toBe("would_install_and_enable");
    }
    for (const id of ENHANCEMENT_DEPENDENCY_IDS) {
      expect(requiredActions.get(id)).toBe("none");
    }

    const enhancementRun = await runSetup(createSetupAppWithPluginManager(), settings, {
      deps: "enhancements",
      dryRun: true
    });
    const enhancementActions = dependencyActions(enhancementRun.result);
    for (const id of REQUIRED_DEPENDENCY_IDS) {
      expect(enhancementActions.get(id)).toBe("warn");
    }
    for (const id of ENHANCEMENT_DEPENDENCY_IDS) {
      expect(enhancementActions.get(id)).toBe("would_install_and_enable");
    }
  });
});
