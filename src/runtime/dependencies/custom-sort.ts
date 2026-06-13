import type { App } from "obsidian";
import { isRecord } from "../../records";
import type { ParaZkSettings } from "../../types";
import { normalizeVaultPath } from "../../vault/paths";
import type { DependencyConfiguration, DependencyConfigurationServices, PluginManager } from "./index";

export const CUSTOM_SORT_PLUGIN_ID = "custom-sort";

const CUSTOM_SORT_SETTINGS_PATH = ".obsidian/plugins/custom-sort/data.json";
const BOOKMARKS_CONFIG_PATH = ".obsidian/bookmarks.json";
const CUSTOM_SORT_BOOKMARKS_GROUP = "sortspec";
const ATTACHMENT_FOLDER = "assets";

type BookmarkItem = Record<string, unknown>;

export const customSortDependencyConfiguration: DependencyConfiguration = {
  wouldConfigure: "would_configure_custom_sort",
  configured: "configured_custom_sort",
  isConfigured: isCustomSortConfigured,
  configure: ensureCustomSortConfigured
};

async function isCustomSortConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, CUSTOM_SORT_SETTINGS_PATH);
  const nextSettings = mergeCustomSortSettings(currentSettings);
  if (JSON.stringify(currentSettings) !== JSON.stringify(nextSettings)) return false;
  if (!await hasCustomSortBookmarksGroup(app)) return false;

  const runtimeSettings = services.readRuntimePluginSettings(manager, CUSTOM_SORT_PLUGIN_ID);
  if (!runtimeSettings) return true;
  return JSON.stringify(runtimeSettings) === JSON.stringify(mergeCustomSortSettings(runtimeSettings));
}

async function ensureCustomSortConfigured(
  services: DependencyConfigurationServices,
  app: App,
  manager: PluginManager,
  settings: ParaZkSettings
): Promise<boolean> {
  const currentSettings = await services.readSettingsFile(app, CUSTOM_SORT_SETTINGS_PATH);
  const nextSettings = mergeCustomSortSettings(currentSettings);
  const runtimeSettings = services.readRuntimePluginSettings(manager, CUSTOM_SORT_PLUGIN_ID);
  const runtimeChanged = runtimeSettings
    ? JSON.stringify(runtimeSettings) !== JSON.stringify(mergeCustomSortSettings(runtimeSettings))
    : false;
  const settingsChanged = JSON.stringify(currentSettings) !== JSON.stringify(nextSettings) || runtimeChanged;
  const bookmarksChanged = await ensureCustomSortBookmarksGroup(app, settings);

  if (settingsChanged) {
    await services.writeSettingsFile(app, CUSTOM_SORT_SETTINGS_PATH, nextSettings);
    await services.updateRunningPluginSettings(manager, CUSTOM_SORT_PLUGIN_ID, nextSettings);
  }

  return settingsChanged || bookmarksChanged;
}

function mergeCustomSortSettings(current: Record<string, unknown>): Record<string, unknown> {
  return {
    ...current,
    additionalSortspecFile: "",
    indexNoteNameForFolderNotes: "",
    suspended: false,
    statusBarEntryEnabled: false,
    notificationsEnabled: false,
    mobileNotificationsEnabled: false,
    customSortContextSubmenu: true,
    automaticBookmarksIntegration: true,
    bookmarksContextMenus: true,
    bookmarksGroupToConsumeAsOrderingReference: CUSTOM_SORT_BOOKMARKS_GROUP,
    delayForInitialApplication: 1000
  };
}

async function hasCustomSortBookmarksGroup(app: App): Promise<boolean> {
  const bookmarks = await readBookmarksConfig(app);
  const group = findCustomSortBookmarksGroup(bookmarks.items);
  return Boolean(group && Array.isArray(group.items) && group.items.length > 0);
}

async function ensureCustomSortBookmarksGroup(app: App, settings: ParaZkSettings): Promise<boolean> {
  const bookmarks = await readBookmarksConfig(app);
  const existing = findCustomSortBookmarksGroup(bookmarks.items);
  if (existing && Array.isArray(existing.items) && existing.items.length > 0) return false;

  const baseline = createCustomSortBookmarksGroup(settings);
  if (existing) {
    existing.items = baseline.items;
  } else {
    bookmarks.items.push(baseline);
  }
  await app.vault.adapter.write(BOOKMARKS_CONFIG_PATH, `${JSON.stringify(bookmarks, null, 2)}\n`);
  return true;
}

async function readBookmarksConfig(app: App): Promise<{ items: BookmarkItem[] }> {
  if (!await app.vault.adapter.exists(BOOKMARKS_CONFIG_PATH)) return { items: [] };
  const raw = await app.vault.adapter.read(BOOKMARKS_CONFIG_PATH);
  if (!raw.trim()) return { items: [] };
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) throw new Error(`${BOOKMARKS_CONFIG_PATH} is not a JSON object`);
  const items = Array.isArray(parsed.items) ? parsed.items.filter(isBookmarkItem) : [];
  return { ...parsed, items };
}

function createCustomSortBookmarksGroup(settings: ParaZkSettings): BookmarkItem {
  const nextCtime = bookmarkCtimeGenerator();
  return bookmarkGroup(CUSTOM_SORT_BOOKMARKS_GROUP, nextCtime, [
    bookmarkGroup(folderName(settings.paths.dashboardFolder), nextCtime, [
      bookmarkFile(`${settings.paths.dashboardFolder}/HomePage.md`, nextCtime),
      bookmarkFile(`${settings.paths.dashboardFolder}/Review.md`, nextCtime),
      bookmarkFile(`${settings.paths.dashboardFolder}/Projects.md`, nextCtime),
      bookmarkFile(`${settings.paths.dashboardFolder}/Areas.md`, nextCtime),
      bookmarkFile(`${settings.paths.dashboardFolder}/Resources.md`, nextCtime),
      bookmarkFile(`${settings.paths.dashboardFolder}/ZK.md`, nextCtime),
      bookmarkFile(`${settings.paths.dashboardFolder}/Tasks.md`, nextCtime)
    ]),
    bookmarkGroup(folderName(settings.paths.projectsFolder, 0), nextCtime, [
      bookmarkGroup(folderName(settings.paths.projectsFolder), nextCtime),
      bookmarkGroup(folderName(settings.paths.areasFolder), nextCtime),
      bookmarkGroup(folderName(settings.paths.resourcesFolder), nextCtime),
      bookmarkGroup(folderName(settings.paths.archivesFolder), nextCtime, [
        bookmarkGroup(folderName(settings.paths.projectsFolder), nextCtime),
        bookmarkGroup(folderName(settings.paths.areasFolder), nextCtime),
        bookmarkGroup(folderName(settings.paths.resourcesFolder), nextCtime)
      ]),
      bookmarkGroup(folderName(settings.paths.retrosFolder), nextCtime)
    ]),
    bookmarkGroup(folderName(settings.paths.zkFolder), nextCtime, [
      bookmarkGroup(folderName(settings.paths.sparkFolder), nextCtime),
      bookmarkGroup(folderName(settings.paths.digestFolder), nextCtime),
      bookmarkGroup(folderName(settings.paths.permanentFolder), nextCtime)
    ]),
    bookmarkGroup(folderName(settings.paths.wikiFolder), nextCtime),
    bookmarkGroup(folderName(settings.paths.journalFolder), nextCtime),
    bookmarkGroup(folderName(settings.paths.tasksFolder), nextCtime),
    bookmarkGroup(folderName(settings.paths.templatesFolder), nextCtime),
    bookmarkGroup(ATTACHMENT_FOLDER, nextCtime)
  ]);
}

function bookmarkGroup(title: string, nextCtime: () => number, items: BookmarkItem[] = []): BookmarkItem {
  return {
    type: "group",
    ctime: nextCtime(),
    items,
    title
  };
}

function bookmarkFile(path: string, nextCtime: () => number): BookmarkItem {
  return {
    type: "file",
    ctime: nextCtime(),
    path: normalizeVaultPath(path),
    subpath: "#^-"
  };
}

function bookmarkCtimeGenerator(): () => number {
  let ctime = Date.now();
  return () => {
    ctime += 1;
    return ctime;
  };
}

function isBookmarkItem(value: unknown): value is BookmarkItem {
  return isRecord(value) && typeof value.type === "string";
}

function isBookmarkGroup(value: unknown, title: string): boolean {
  return isRecord(value) && value.type === "group" && value.title === title;
}

function findCustomSortBookmarksGroup(items: BookmarkItem[]): BookmarkItem | undefined {
  return items.find((item) => isBookmarkGroup(item, CUSTOM_SORT_BOOKMARKS_GROUP));
}

function folderName(path: string, indexFromRoot?: number): string {
  const parts = normalizeVaultPath(path).split("/").filter(Boolean);
  return parts[indexFromRoot ?? parts.length - 1] ?? "";
}
