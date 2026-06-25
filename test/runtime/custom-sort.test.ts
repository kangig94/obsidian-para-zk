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
// (the on-disk shape a vault first set up before LLM-Wiki was a top-level folder still carries).
function staleBookmarks(): { items: Item[] } {
  return sortspecBookmarks(groups(BASELINE_ORDER.filter((title) => title !== "LLM-Wiki")));
}

function fakeApp(files: Map<string, string>): App {
  return {
    vault: {
      configDir: ".obsidian",
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

// The baseline nested order custom-sort.ts mints inside the ZK group.
const ZK_ORDER = ["Spark", "Digest", "Permanent"];

// A complete top-level sortspec whose ZK group carries the given nested groups (others empty).
function bookmarksWithZkChildren(zkTitles: string[]): { items: Item[] } {
  const top = BASELINE_ORDER.map((title, i) =>
    title === "ZK" ? group("ZK", i + 2, groups(zkTitles)) : group(title, i + 2)
  );
  return sortspecBookmarks(top);
}

function zkChildren(files: Map<string, string>): string[] {
  const zk = sortspecChildren(files).find((item) => item.title === "ZK");
  return (zk?.items ?? []).map((item) => item.title ?? "");
}

// A complete sortspec whose PARA group is fully populated, with Archives carrying the given
// nested groups — exercises reconcile two levels deep (sortspec → PARA → Archives → children).
function bookmarksWithArchivesChildren(archiveTitles: string[]): { items: Item[] } {
  const para = group("PARA", 3, [
    group("Projects", 30),
    group("Areas", 31),
    group("Resources", 32),
    group("Archives", 33, groups(archiveTitles)),
    group("Retros", 34)
  ]);
  const top = BASELINE_ORDER.map((title, i) => (title === "PARA" ? para : group(title, i + 2)));
  return sortspecBookmarks(top);
}

function archivesChildren(files: Map<string, string>): string[] {
  const para = sortspecChildren(files).find((item) => item.title === "PARA");
  const archives = para?.items?.find((item) => item.title === "Archives");
  return (archives?.items ?? []).map((item) => item.title ?? "");
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

  it("heals a missing nested folder (Digest) inside a populated ZK group", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithZkChildren(["Spark", "Permanent"]), null, 2)}\n`]]);
    const app = fakeApp(files);

    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(sortspecTitles(files)).toEqual(BASELINE_ORDER); // top level untouched
    expect(zkChildren(files)).toEqual(ZK_ORDER); // Digest inserted between Spark and Permanent
  });

  it("preserves a user reorder of nested folders inside a populated group", async () => {
    const reordered = ["Permanent", "Spark", "Digest"];
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithZkChildren(reordered), null, 2)}\n`]]);
    const app = fakeApp(files);
    const before = files.get(BOOKMARKS_PATH);

    // Complete (just permuted) → reconcile makes no change, so bookmarks.json is never rewritten.
    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(files.get(BOOKMARKS_PATH)).toBe(before);
    expect(zkChildren(files)).toEqual(reordered);
  });

  it("leaves an EMPTY managed group's nested folders unpopulated (never force-filled)", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithZkChildren([]), null, 2)}\n`]]);
    const app = fakeApp(files);
    const before = files.get(BOOKMARKS_PATH);

    // ZK is present but empty, so reconcile must not descend and fill it — bookmarks.json untouched.
    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(files.get(BOOKMARKS_PATH)).toBe(before);
    expect(zkChildren(files)).toEqual([]);
  });

  it("isConfigured detects nested drift after settings are already configured", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithZkChildren(ZK_ORDER), null, 2)}\n`]]);
    const app = fakeApp(files);
    const services = fileBackedServices();

    // First configure writes custom-sort settings; with readRuntimePluginSettings returning
    // undefined (see fileBackedServices), isConfigured's check below is driven only by bookmarks.
    await customSortDependencyConfiguration.configure(services, app, noManager, settings());
    expect(await customSortDependencyConfiguration.isConfigured(services, app, noManager, settings())).toBe(true);

    // Drop Digest from the populated ZK group; a top-level-only check would still report configured.
    files.set(BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithZkChildren(["Spark", "Permanent"]), null, 2)}\n`);

    expect(await customSortDependencyConfiguration.isConfigured(services, app, noManager, settings())).toBe(false);
  });

  it("heals a folder two levels deep (PARA → Archives → Resources)", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithArchivesChildren(["Projects", "Areas"]), null, 2)}\n`]]);
    const app = fakeApp(files);

    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    // Descends sortspec → PARA → Archives; a flat (recurse-once) impl would never reach this depth.
    expect(archivesChildren(files)).toEqual(["Projects", "Areas", "Resources"]);
  });

  it("does not descend into a group whose only child is a file bookmark", async () => {
    const top = BASELINE_ORDER.map((title, i) =>
      title === "ZK" ? group("ZK", i + 2, [fileItem("Spark", 50)]) : group(title, i + 2)
    );
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(sortspecBookmarks(top), null, 2)}\n`]]);
    const app = fakeApp(files);
    const before = files.get(BOOKMARKS_PATH);

    // ZK holds a file (length > 0) but no nested GROUP, so hasNestedGroups is false — no descent.
    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(files.get(BOOKMARKS_PATH)).toBe(before);
    expect(zkChildren(files)).toEqual(["Spark"]); // the file bookmark, untouched; no groups added
  });

  it("heals a missing FIRST nested folder (Spark) at the front of ZK", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithZkChildren(["Digest", "Permanent"]), null, 2)}\n`]]);
    const app = fakeApp(files);

    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(zkChildren(files)).toEqual(ZK_ORDER); // anchor -1 → inserted at the front
  });

  it("heals a missing LAST nested folder (Permanent) at the end of ZK", async () => {
    const files = new Map([[BOOKMARKS_PATH, `${JSON.stringify(bookmarksWithZkChildren(["Spark", "Digest"]), null, 2)}\n`]]);
    const app = fakeApp(files);

    await customSortDependencyConfiguration.configure(fileBackedServices(), app, noManager, settings());

    expect(zkChildren(files)).toEqual(ZK_ORDER); // appended after Digest
  });
});
