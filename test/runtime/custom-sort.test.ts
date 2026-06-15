import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { customSortDependencyConfiguration } from "../../src/runtime/dependencies/custom-sort";
import type { DependencyConfigurationServices, PluginManager } from "../../src/runtime/dependencies/index";
import { DEFAULT_SETTINGS, type ParaZkSettings } from "../../src/types";

const BOOKMARKS_PATH = ".obsidian/bookmarks.json";

// The baseline order custom-sort.ts mints from DEFAULT_SETTINGS, top level only.
const BASELINE_ORDER = ["Dashboard", "PARA", "ZK", "LLM-Wiki", "Journal", "Tasks", "Templates", "assets"];

type Item = { type: string; title?: string; ctime: number; path?: string; subpath?: string; items?: Item[] };

function group(title: string, ctime: number, items: Item[] = []): Item {
  return { type: "group", title, ctime, items };
}

function fileItem(title: string, ctime: number): Item {
  return { type: "file", title, ctime, path: `Some/${title}.md`, subpath: "#^-" };
}

// A sortspec group whose top-level entries are `titles` (each a group), in the given order.
function sortspecBookmarks(top: Item[]): { items: Item[] } {
  return { items: [group("sortspec", 1, top)] };
}

function groups(titles: string[]): Item[] {
  return titles.map((title, i) => group(title, i + 2));
}

// Built from an older baseline: every top-level folder EXCEPT LLM-Wiki, in baseline order
// (exactly the shape found live in the Overmind vault).
function staleBookmarks(): { items: Item[] } {
  return sortspecBookmarks(groups(BASELINE_ORDER.filter((title) => title !== "LLM-Wiki")));
}

function fakeApp(files: Map<string, string>): App {
  return {
    vault: {
      adapter: {
        exists: async (path: string) => files.has(path),
        read: async (path: string) => files.get(path) ?? "",
        write: async (path: string, content: string) => void files.set(path, content)
      }
    }
  } as unknown as App;
}

// Services backed by an in-memory data.json so the second configure() sees the settings it
// wrote and reports no settings change — isolating the bookmarks reconcile.
function fileBackedServices(): DependencyConfigurationServices {
  let data: Record<string, unknown> | undefined;
  return {
    readSettingsFile: async () => (data ? structuredClone(data) : {}),
    writeSettingsFile: async (_app, _path, settings) => void (data = structuredClone(settings)),
    readRuntimePluginSettings: () => undefined,
    updateRunningPluginSettings: async () => {}
  };
}

const noManager = {} as PluginManager;

function sortspecChildren(files: Map<string, string>): Item[] {
  const parsed = JSON.parse(files.get(BOOKMARKS_PATH) ?? "{}") as { items?: Item[] };
  return parsed.items?.find((item) => item.title === "sortspec")?.items ?? [];
}

function sortspecTitles(files: Map<string, string>): string[] {
  return sortspecChildren(files).map((item) => item.title ?? "");
}

function settings(): ParaZkSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

describe("custom-sort bookmarks reconcile", () => {
  it("inserts a missing baseline folder (LLM-Wiki) right after its predecessor (ZK)", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(staleBookmarks(), null, 2)}\n`]]);
    const app = fakeApp(files);

    const changed = await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(changed).toBe(true);
    expect(sortspecTitles(files)).toEqual(BASELINE_ORDER);
  });

  it("is idempotent: a complete group is left untouched and reports no change", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(staleBookmarks(), null, 2)}\n`]]);
    const app = fakeApp(files);
    const services = fileBackedServices();

    await customSortDependencyConfiguration.configure(services, app, noManager, settings());
    const after = files.get(BOOKMARKS_PATH);
    const changedAgain = await customSortDependencyConfiguration.configure(services, app, noManager, settings());

    expect(changedAgain).toBe(false);
    expect(files.get(BOOKMARKS_PATH)).toBe(after);
  });

  it("reports the stale group as not configured, then configured after reconcile", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(staleBookmarks(), null, 2)}\n`]]);
    const app = fakeApp(files);
    const services = fileBackedServices();

    expect(await customSortDependencyConfiguration.isConfigured(services, app, noManager, settings())).toBe(false);
    await customSortDependencyConfiguration.configure(services, app, noManager, settings());
    expect(await customSortDependencyConfiguration.isConfigured(services, app, noManager, settings())).toBe(true);
  });

  it("creates the full baseline when no sortspec group exists yet", async () => {
    const files = new Map<string, string>();
    const app = fakeApp(files);

    const changed = await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(changed).toBe(true);
    expect(sortspecTitles(files)).toEqual(BASELINE_ORDER);
  });

  it("inserts a missing FIRST baseline folder (Dashboard) at the front", async () => {
    const stale = sortspecBookmarks(groups(BASELINE_ORDER.filter((title) => title !== "Dashboard")));
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(stale, null, 2)}\n`]]);
    const app = fakeApp(files);

    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(sortspecTitles(files)).toEqual(BASELINE_ORDER);
  });

  it("respects a user reorder: a complete-but-permuted group is left untouched", async () => {
    const reordered = ["assets", "ZK", "LLM-Wiki", "Dashboard", "Templates", "PARA", "Tasks", "Journal"];
    const stale = sortspecBookmarks(groups(reordered));
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(stale, null, 2)}\n`]]);
    const app = fakeApp(files);
    const before = files.get(BOOKMARKS_PATH);

    // A complete group reconciles to no change, so bookmarks.json is never rewritten — the
    // configure() return is driven only by the settings write, so assert the file directly.
    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(files.get(BOOKMARKS_PATH)).toBe(before);
    expect(sortspecTitles(files)).toEqual(reordered);
  });

  it("inserts a missing folder after its present predecessor even when entries are reordered", async () => {
    // ZK moved to the front; LLM-Wiki (whose baseline predecessor is ZK) must land right after it.
    const reordered = ["ZK", "Dashboard", "PARA", "Journal", "Tasks", "Templates", "assets"];
    const stale = sortspecBookmarks(groups(reordered));
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(stale, null, 2)}\n`]]);
    const app = fakeApp(files);

    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(sortspecTitles(files)).toEqual(["ZK", "LLM-Wiki", "Dashboard", "PARA", "Journal", "Tasks", "Templates", "assets"]);
  });

  it("does not count a same-titled FILE bookmark as the baseline group", async () => {
    // A user bookmarked the LLM-Wiki folder note as a file; the GROUP is still missing.
    const top = groups(BASELINE_ORDER.filter((title) => title !== "LLM-Wiki"));
    top.push(fileItem("LLM-Wiki", 99));
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(sortspecBookmarks(top), null, 2)}\n`]]);
    const app = fakeApp(files);

    // The file bookmark shares the title but is not a group, so reconcile must still insert the
    // LLM-Wiki GROUP after ZK (matching only on title would have skipped it — Finding 2).
    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    const children = sortspecChildren(files);
    expect(children.findIndex((item) => item.type === "group" && item.title === "LLM-Wiki")).toBe(3); // right after ZK
  });
});
