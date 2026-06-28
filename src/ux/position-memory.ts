import {
  Component,
  MarkdownView,
  type Editor,
  type EditorPosition,
  type EditorSelectionOrCaret,
  type TAbstractFile
} from "obsidian";
import type { ParaZkPluginContext } from "../plugin-interface";
import { isRecord } from "../records";
import { joinVaultPath, obsidianConfigPath } from "../vault/paths";

const POSITION_MEMORY_VERSION = 1;
const POSITION_MEMORY_FILE_NAME = "position-memory.json";
const CAPTURE_INTERVAL_MS = 100;
const CAPTURE_AFTER_INTERACTION_DELAY_MS = 50;
const ACTIVATION_ZERO_SCROLL_GRACE_MS = 1000;
const FLUSH_DELAY_MS = 2500;
const MAX_ENTRY_COUNT = 5000;
const RESTORE_SETTLE_QUIET_MS = 120;
const RESTORE_SETTLE_TIMEOUT_MS = 1200;
const RESTORE_SUPPRESSION_MS = 1500;
const RESTORE_RETRY_DELAYS_MS = [0, 100, 250, 500, 1000];
const RESTORE_LATE_SCROLL_DELAY_MS = 250;
const RESTORE_RETRY_WINDOW_MS = sum(RESTORE_RETRY_DELAYS_MS);
const RESTORE_CAPTURE_PAUSE_MS = (
  RESTORE_RETRY_WINDOW_MS
  + RESTORE_SETTLE_TIMEOUT_MS
  + RESTORE_SETTLE_QUIET_MS
  + RESTORE_LATE_SCROLL_DELAY_MS
  + 250
);

export type PositionMemoryData = {
  version: 1;
  entries: Record<string, PositionEntry>;
};

export type PositionEntry = {
  updatedAt: number;
  lastMode: "source" | "preview";
  source?: SourcePositionState;
  preview?: ScrollPositionState;
};

type SourcePositionState = ScrollPositionState & {
  selections?: EditorSelectionOrCaret[];
};

type ScrollPositionState = {
  scroll?: number;
};

export type PositionRestoreSuppression = {
  cursor?: boolean;
  scroll?: boolean;
  durationMs?: number;
};

type SuppressionState = Required<Pick<PositionRestoreSuppression, "cursor" | "scroll">> & {
  expiresAt: number;
};

type ViewEphemeralState = {
  scroll?: number;
};

const services = new WeakMap<ParaZkPluginContext, PositionMemoryService>();

export async function registerPositionMemory(plugin: ParaZkPluginContext): Promise<void> {
  if (services.has(plugin)) return;

  const service = new PositionMemoryService(plugin);
  services.set(plugin, service);
  try {
    await service.loadStore();
    if (services.get(plugin) !== service || !plugin.settings.rememberCursorPosition) {
      if (services.get(plugin) === service) services.delete(plugin);
      service.cancelPendingWork();
      return;
    }
    plugin.addChild(service);
    service.markAttached();
  } catch (error) {
    if (services.get(plugin) === service) services.delete(plugin);
    service.cancelPendingWork();
    throw error;
  }
}

export function unregisterPositionMemory(plugin: ParaZkPluginContext): void {
  const service = services.get(plugin);
  if (!service) return;

  services.delete(plugin);
  if (service.isAttached()) {
    plugin.removeChild(service);
  } else {
    service.cancelPendingWork();
  }
}

export function suppressNextPositionRestore(
  plugin: ParaZkPluginContext,
  path: string,
  suppression: PositionRestoreSuppression = {}
): void {
  services.get(plugin)?.suppressNextRestore(path, suppression);
}

export function parsePositionMemoryData(value: unknown): PositionMemoryData {
  if (!isRecord(value) || value.version !== POSITION_MEMORY_VERSION || !isRecord(value.entries)) {
    return emptyPositionMemoryData();
  }

  const entries: Record<string, PositionEntry> = {};
  for (const [path, entryValue] of Object.entries(value.entries)) {
    const entry = parsePositionEntry(entryValue);
    if (entry) entries[path] = entry;
  }
  return { version: POSITION_MEMORY_VERSION, entries };
}

export function capturePositionEntry(view: MarkdownView, now = Date.now()): PositionEntry | undefined {
  const mode = markdownMode(view);
  if (!mode) return undefined;

  const scroll = readCurrentModeScroll(view);
  const entry: PositionEntry = {
    updatedAt: now,
    lastMode: mode
  };
  if (mode === "source") {
    const selections = readEditorSelections(view.editor);
    const source: SourcePositionState = {};
    if (scroll !== undefined) source.scroll = scroll;
    if (selections.length > 0) source.selections = selections;
    if (hasPositionState(source)) entry.source = source;
  } else if (scroll !== undefined) {
    entry.preview = { scroll };
  }

  return entry.source || entry.preview ? entry : undefined;
}

export function restoreCursorPosition(view: MarkdownView, entry: PositionEntry): void {
  if (markdownMode(view) !== "source") return;
  const selections = entry.source?.selections;
  if (!selections || selections.length === 0) return;

  const clamped = selections
    .map((selection) => clampEditorSelection(view.editor, selection))
    .filter((selection): selection is EditorSelectionOrCaret => Boolean(selection));
  if (clamped.length === 0) return;
  if (entry.source?.scroll && entry.source.scroll > 0 && clamped.every(isDocumentStartSelection)) return;
  if (selectionsEqual(readEditorSelections(view.editor), clamped)) return;

  try {
    view.editor.setSelections(clamped, 0);
  } catch {
    const first = clamped[0];
    try {
      view.editor.setSelection(first.anchor, first.head);
    } catch {
      // Ignore transient editor readiness failures.
    }
  }
}

export function restoreScrollPosition(view: MarkdownView, entry: PositionEntry): void {
  const mode = markdownMode(view);
  const scroll = mode === "source"
    ? entry.source?.scroll
    : mode === "preview"
      ? entry.preview?.scroll
      : undefined;
  if (scroll === undefined || scroll <= 0) return;

  if (setViewEphemeralState(view, { scroll })) return;

  if (mode === "source") {
    try {
      view.editor.scrollTo(null, scroll);
    } catch {
      try {
        view.currentMode.applyScroll(scroll);
      } catch {
        // Ignore transient view readiness failures.
      }
    }
    return;
  }

  try {
    view.currentMode.applyScroll(scroll);
  } catch {
    // Ignore transient view readiness failures.
  }
}

function restorePositionState(
  view: MarkdownView,
  entry: PositionEntry,
  suppression: Pick<SuppressionState, "cursor" | "scroll">
): void {
  if (!suppression.cursor) restoreCursorPosition(view, entry);
  if (!suppression.scroll) restoreScrollPosition(view, entry);
}

function setViewEphemeralState(view: MarkdownView, state: ViewEphemeralState): boolean {
  try {
    view.setEphemeralState(state);
    return true;
  } catch {
    return false;
  }
}

function findMarkdownViewForPath(plugin: ParaZkPluginContext, path: string): MarkdownView | undefined {
  const active = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (active?.file?.path === path) return active;

  const leaf = plugin.app.workspace.getLeavesOfType("markdown").find((candidate) => (
    candidate.view instanceof MarkdownView && candidate.view.file?.path === path
  ));
  return leaf?.view instanceof MarkdownView ? leaf.view : undefined;
}

function eventTargetBelongsToView(event: Event, view: MarkdownView): boolean {
  const container = view.containerEl;
  if (!container) return false;

  if (typeof event.composedPath === "function" && event.composedPath().includes(container)) {
    return true;
  }

  const target = event.target;
  if (typeof Node === "undefined" || !(target instanceof Node)) return false;
  return target === container || container.contains(target);
}

function readCurrentModeScroll(view: MarkdownView): number | undefined {
  let fallbackScroll: number | undefined;
  try {
    const modeScroll = readScroll(view.currentMode.getScroll());
    if (modeScroll !== undefined && modeScroll > 0) return modeScroll;
    fallbackScroll = modeScroll;
  } catch {
    // Fall through to editor scroll info.
  }

  const ephemeralScroll = readEphemeralScroll(view);
  if (ephemeralScroll !== undefined && ephemeralScroll > 0) return ephemeralScroll;

  try {
    const editorScroll = readScroll(view.editor.getScrollInfo().top);
    if (editorScroll !== undefined && editorScroll > 0) return editorScroll;
  } catch {
    // Fall through to zero fallback.
  }
  return fallbackScroll;
}

function readEphemeralScroll(view: MarkdownView): number | undefined {
  try {
    const state = view.getEphemeralState();
    return isRecord(state) ? readScroll(state.scroll) : undefined;
  } catch {
    return undefined;
  }
}

class PositionMemoryService extends Component {
  private readonly store: PositionMemoryStore;
  private readonly plugin: ParaZkPluginContext;
  private readonly restoreTokens = new WeakMap<MarkdownView, number>();
  private readonly restoreTimers = new Set<number>();
  private readonly activeRestores = new Set<RestoreSession>();
  private readonly suppressions = new Map<string, SuppressionState>();
  private readonly capturePausedUntil = new Map<string, number>();
  private readonly activatedAtByPath = new Map<string, number>();
  private readonly cursorCaptureRequiresUserInput = new Set<string>();
  private captureTimer: number | undefined;
  private nextRestoreToken = 0;
  private disposed = false;
  private attached = false;

  constructor(plugin: ParaZkPluginContext) {
    super();
    this.plugin = plugin;
    this.store = new PositionMemoryStore(plugin);
  }

  async loadStore(): Promise<void> {
    await this.store.load();
  }

  markAttached(): void {
    this.attached = true;
  }

  isAttached(): boolean {
    return this.attached;
  }

  cancelPendingWork(): void {
    this.stop();
  }

  override onload(): void {
    this.disposed = false;
    this.registerEvent(
      this.plugin.app.workspace.on("file-open", (file) => {
        if (file) this.activatePath(file.path);
      })
    );
    this.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", () => this.activateCurrentView())
    );
    this.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => this.scheduleCaptureActiveMarkdownView())
    );
    this.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => this.renameEntry(file, oldPath))
    );
    this.registerEvent(
      this.plugin.app.vault.on("delete", (file) => this.deleteEntry(file))
    );

    this.registerInterval(
      window.setInterval(() => this.safeCaptureActiveMarkdownView(), CAPTURE_INTERVAL_MS)
    );
    this.registerDomEvent(
      this.plugin.app.workspace.containerEl,
      "scroll",
      () => this.scheduleCaptureActiveMarkdownView(CAPTURE_AFTER_INTERACTION_DELAY_MS),
      { capture: true, passive: true }
    );
    this.registerDomEvent(
      this.plugin.app.workspace.containerEl,
      "pointerup",
      (event) => {
        this.markCursorCaptureAllowedByUserInput(event);
        this.scheduleCaptureActiveMarkdownView(CAPTURE_AFTER_INTERACTION_DELAY_MS);
      },
      { capture: true, passive: true }
    );
    this.registerDomEvent(
      this.plugin.app.workspace.containerEl,
      "keyup",
      (event) => {
        this.markCursorCaptureAllowedByUserInput(event);
        this.scheduleCaptureActiveMarkdownView(CAPTURE_AFTER_INTERACTION_DELAY_MS);
      },
      { capture: true }
    );
    this.plugin.app.workspace.onLayoutReady(() => {
      if (!this.disposed) this.activateCurrentView();
    });
  }

  override onunload(): void {
    this.attached = false;
    this.stop();
  }

  private stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearCaptureTimer();
    this.clearRestoreTimers();
    for (const restore of this.activeRestores) restore.cancel();
    this.activeRestores.clear();
    this.store.cancelScheduledFlush();
    if (services.get(this.plugin) === this) services.delete(this.plugin);
  }

  suppressNextRestore(path: string, suppression: PositionRestoreSuppression): void {
    this.suppressions.set(path, {
      cursor: suppression.cursor ?? true,
      scroll: suppression.scroll ?? true,
      expiresAt: Date.now() + (suppression.durationMs ?? RESTORE_SUPPRESSION_MS)
    });
  }

  private enabled(): boolean {
    return !this.disposed && this.plugin.settings.rememberCursorPosition;
  }

  private renameEntry(file: TAbstractFile, oldPath: string): void {
    this.store.rename(oldPath, file.path);
    if (this.cursorCaptureRequiresUserInput.delete(oldPath)) {
      this.cursorCaptureRequiresUserInput.add(file.path);
    }
  }

  private deleteEntry(file: TAbstractFile): void {
    this.store.delete(file.path);
    this.cursorCaptureRequiresUserInput.delete(file.path);
  }

  private captureActiveMarkdownView(): void {
    if (!this.enabled()) return;
    const view = this.activeMarkdownView();
    if (view) this.captureView(view);
  }

  private scheduleCaptureActiveMarkdownView(delayMs = 0): void {
    if (!this.enabled() || this.captureTimer !== undefined) return;
    this.captureTimer = window.setTimeout(() => {
      this.captureTimer = undefined;
      this.safeCaptureActiveMarkdownView();
    }, delayMs);
  }

  private safeCaptureActiveMarkdownView(): void {
    try {
      this.captureActiveMarkdownView();
    } catch (error) {
      console.warn("PARA-ZK could not capture position memory", error);
    }
  }

  private captureView(view: MarkdownView): void {
    const path = view.file?.path;
    if (!path) return;
    if (this.isCapturePaused(path)) return;

    const entry = capturePositionEntry(view);
    if (!entry) return;
    const stableEntry = this.preserveRestoredCursorUntilUserInput(path, entry);
    if (this.isTransientZeroScrollCapture(path, stableEntry)) return;
    this.store.update(path, stableEntry);
  }

  private activateCurrentView(): void {
    if (!this.enabled()) return;
    const path = this.activeMarkdownView()?.file?.path;
    if (path) this.activatePath(path);
  }

  private activatePath(path: string): void {
    if (!this.enabled()) return;
    this.activatedAtByPath.set(path, Date.now());
    this.scheduleRestoreForPath(path);
  }

  private scheduleRestoreForPath(path: string): void {
    if (!this.enabled()) return;
    if (!this.store.get(path)) return;
    this.pauseCapture(path);
    this.scheduleRestoreAttempt(path, 0);
  }

  private scheduleRestoreAttempt(path: string, attempt: number): void {
    const delay = RESTORE_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      this.capturePausedUntil.delete(path);
      return;
    }

    this.setRestoreTimer(() => {
      if (!this.enabled() || !this.store.get(path)) {
        this.capturePausedUntil.delete(path);
        return;
      }

      const view = this.activeMarkdownView(path);
      if (view) {
        this.scheduleRestore(view, path);
        return;
      }

      this.scheduleRestoreAttempt(path, attempt + 1);
    }, delay);
  }

  private scheduleRestore(view: MarkdownView, path: string): void {
    const entry = this.store.get(path);
    if (!entry) return;

    this.pauseCapture(path);
    if (entry.source?.selections?.length) this.cursorCaptureRequiresUserInput.add(path);
    const token = this.nextRestoreToken + 1;
    this.nextRestoreToken = token;
    this.restoreTokens.set(view, token);
    const session = new RestoreSession();
    this.activeRestores.add(session);
    void this.restore(view, path, entry, token, session)
      .finally(() => {
        session.cancel();
        this.activeRestores.delete(session);
      });
  }

  private async restore(
    view: MarkdownView,
    path: string,
    entry: PositionEntry,
    token: number,
    session: RestoreSession
  ): Promise<void> {
    try {
      await session.animationFrame();
      if (!this.isCurrentRestore(view, path, token)) return;

      const suppression = this.currentSuppression(path);
      const abort = createUserInteractionAbort(view, session);
      try {
        if (!abort.cancelled) restorePositionState(view, entry, suppression);
        await waitForStableLayout(view, () => this.isCurrentRestore(view, path, token), abort, session);
        if (!this.isCurrentRestore(view, path, token) || abort.cancelled) return;
        if (!suppression.scroll) restoreScrollPosition(view, entry);
        await this.applyLateScrollRestore(view, path, entry, token, suppression, abort, session);
      } finally {
        abort.dispose();
      }
    } finally {
      this.capturePausedUntil.delete(path);
    }
  }

  private isCurrentRestore(view: MarkdownView, path: string, token: number): boolean {
    return (
      this.enabled()
      && this.restoreTokens.get(view) === token
      && view.file?.path === path
    );
  }

  private currentSuppression(path: string): SuppressionState {
    const now = Date.now();
    for (const [suppressedPath, suppression] of this.suppressions.entries()) {
      if (suppression.expiresAt <= now) this.suppressions.delete(suppressedPath);
    }

    return this.suppressions.get(path) ?? {
      cursor: false,
      scroll: false,
      expiresAt: 0
    };
  }

  private pauseCapture(path: string): void {
    this.capturePausedUntil.set(path, Date.now() + RESTORE_CAPTURE_PAUSE_MS);
  }

  private isCapturePaused(path: string): boolean {
    const pausedUntil = this.capturePausedUntil.get(path);
    if (pausedUntil === undefined) return false;
    if (pausedUntil > Date.now()) return true;

    this.capturePausedUntil.delete(path);
    return false;
  }

  private isTransientZeroScrollCapture(path: string, entry: PositionEntry): boolean {
    const activatedAt = this.activatedAtByPath.get(path);
    if (activatedAt === undefined || Date.now() - activatedAt > ACTIVATION_ZERO_SCROLL_GRACE_MS) return false;

    const previous = this.store.get(path);
    const previousScroll = previous?.lastMode === "source"
      ? previous.source?.scroll
      : previous?.preview?.scroll;
    const nextScroll = entry.lastMode === "source"
      ? entry.source?.scroll
      : entry.preview?.scroll;
    return Boolean(previousScroll && previousScroll > 0 && nextScroll === 0);
  }

  private preserveRestoredCursorUntilUserInput(path: string, entry: PositionEntry): PositionEntry {
    if (entry.lastMode !== "source" || !this.cursorCaptureRequiresUserInput.has(path)) return entry;

    const selections = this.store.get(path)?.source?.selections;
    if (!selections || selections.length === 0) return entry;

    return {
      ...entry,
      source: {
        ...entry.source,
        selections
      }
    };
  }

  private markCursorCaptureAllowedByUserInput(event: Event): void {
    const view = this.activeMarkdownView();
    const path = view?.file?.path;
    if (!view || !path || markdownMode(view) !== "source") return;
    if (!eventTargetBelongsToView(event, view)) return;

    this.cursorCaptureRequiresUserInput.delete(path);
  }

  private activeMarkdownView(path?: string): MarkdownView | undefined {
    const view = path
      ? findMarkdownViewForPath(this.plugin, path)
      : this.plugin.app.workspace.getActiveViewOfType(MarkdownView) ?? undefined;
    if (!view) return undefined;
    if (path && view.file?.path !== path) return undefined;
    return view;
  }

  private setRestoreTimer(callback: () => void, delayMs: number): void {
    const timer = window.setTimeout(() => {
      this.restoreTimers.delete(timer);
      callback();
    }, delayMs);
    this.restoreTimers.add(timer);
  }

  private clearRestoreTimers(): void {
    for (const timer of this.restoreTimers) window.clearTimeout(timer);
    this.restoreTimers.clear();
  }

  private clearCaptureTimer(): void {
    if (this.captureTimer === undefined) return;
    window.clearTimeout(this.captureTimer);
    this.captureTimer = undefined;
  }

  private async applyLateScrollRestore(
    view: MarkdownView,
    path: string,
    entry: PositionEntry,
    token: number,
    suppression: SuppressionState,
    abort: { readonly cancelled: boolean },
    session: RestoreSession
  ): Promise<void> {
    await session.delay(RESTORE_LATE_SCROLL_DELAY_MS);
    if (!this.isCurrentRestore(view, path, token) || abort.cancelled) return;
    if (!suppression.scroll) restoreScrollPosition(view, entry);
  }
}

class PositionMemoryStore {
  private readonly plugin: ParaZkPluginContext;
  private data: PositionMemoryData = emptyPositionMemoryData();
  private dirty = false;
  private flushTimer: number | undefined;
  private lastSavedJson = "";

  constructor(plugin: ParaZkPluginContext) {
    this.plugin = plugin;
  }

  async load(): Promise<void> {
    const path = this.path();
    try {
      if (!await this.plugin.app.vault.adapter.exists(path)) {
        this.data = emptyPositionMemoryData();
        this.lastSavedJson = serializePositionMemoryData(this.data);
        return;
      }
      const raw = await this.plugin.app.vault.adapter.read(path);
      this.data = parsePositionMemoryData(JSON.parse(raw));
      this.lastSavedJson = serializePositionMemoryData(this.data);
    } catch (error) {
      console.warn("PARA-ZK could not read position memory; resetting", error);
      this.data = emptyPositionMemoryData();
      await this.persist(serializePositionMemoryData(this.data));
    }
  }

  get(path: string): PositionEntry | undefined {
    return this.data.entries[path];
  }

  update(path: string, entry: PositionEntry): void {
    const previous = this.data.entries[path];
    const next = mergePositionEntry(previous, entry);
    if (previous && positionEntryStateEquals(previous, next)) return;

    this.data.entries[path] = next;
    this.markDirty();
  }

  rename(oldPath: string, newPath: string): void {
    if (oldPath === newPath) return;
    const entry = this.data.entries[oldPath];
    if (!entry) return;

    this.data.entries[newPath] = entry;
    delete this.data.entries[oldPath];
    this.markDirty();
  }

  delete(path: string): void {
    if (!this.data.entries[path]) return;

    delete this.data.entries[path];
    this.markDirty();
  }

  cancelScheduledFlush(): void {
    if (this.flushTimer === undefined) return;
    window.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
  }

  async flush(): Promise<void> {
    this.cancelScheduledFlush();
    if (!this.dirty) return;

    pruneEntries(this.data);
    const json = serializePositionMemoryData(this.data);
    if (json === this.lastSavedJson) {
      this.dirty = false;
      return;
    }

    await this.persist(json);
  }

  private async persist(json: string): Promise<void> {
    try {
      await this.ensureParentFolder();
      await this.plugin.app.vault.adapter.write(this.path(), json);
      this.lastSavedJson = json;
      this.dirty = false;
    } catch (error) {
      this.dirty = true;
      console.error("PARA-ZK could not write position memory", error);
    }
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.flushTimer !== undefined) return;

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, FLUSH_DELAY_MS);
  }

  private async ensureParentFolder(): Promise<void> {
    const parent = parentPath(this.path());
    if (!parent || await this.plugin.app.vault.adapter.exists(parent)) return;
    await this.plugin.app.vault.adapter.mkdir(parent);
  }

  private path(): string {
    const dir = this.plugin.manifest.dir
      ?? obsidianConfigPath(this.plugin.app.vault, "plugins", this.plugin.manifest.id);
    return joinVaultPath(dir, POSITION_MEMORY_FILE_NAME);
  }
}

function emptyPositionMemoryData(): PositionMemoryData {
  return { version: POSITION_MEMORY_VERSION, entries: {} };
}

function parsePositionEntry(value: unknown): PositionEntry | undefined {
  if (!isRecord(value)) return undefined;

  const lastMode = value.lastMode === "preview" ? "preview" : "source";
  const source = parseSourcePositionState(value.source);
  const preview = parseScrollPositionState(value.preview);
  if (!source && !preview) return undefined;

  return {
    updatedAt: readFiniteNumber(value.updatedAt) ?? 0,
    lastMode,
    ...(source ? { source } : {}),
    ...(preview ? { preview } : {})
  };
}

function parseSourcePositionState(value: unknown): SourcePositionState | undefined {
  if (!isRecord(value)) return undefined;

  const state: SourcePositionState = {};
  const scroll = readScroll(value.scroll);
  const selections = parseSelections(value.selections);
  if (scroll !== undefined) state.scroll = scroll;
  if (selections.length > 0) state.selections = selections;
  return hasPositionState(state) ? state : undefined;
}

function parseScrollPositionState(value: unknown): ScrollPositionState | undefined {
  if (!isRecord(value)) return undefined;

  const scroll = readScroll(value.scroll);
  return scroll === undefined ? undefined : { scroll };
}

function parseSelections(value: unknown): EditorSelectionOrCaret[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return undefined;
      const anchor = parseEditorPosition(item.anchor);
      if (!anchor) return undefined;
      const head = parseEditorPosition(item.head);
      return head ? { anchor, head } : { anchor };
    })
    .filter((selection): selection is EditorSelectionOrCaret => Boolean(selection))
    .slice(0, 16);
}

function parseEditorPosition(value: unknown): EditorPosition | undefined {
  if (!isRecord(value)) return undefined;

  const line = readNonNegativeInteger(value.line);
  const ch = readNonNegativeInteger(value.ch);
  if (line === undefined || ch === undefined) return undefined;
  return { line, ch };
}

function readEditorSelections(editor: Editor): EditorSelectionOrCaret[] {
  try {
    const selections = editor.listSelections()
      .map((selection) => normalizeSelection(selection))
      .filter((selection): selection is EditorSelectionOrCaret => Boolean(selection));
    if (selections.length > 0) return selections.slice(0, 16);
  } catch {
    // Fall through to the anchor/head APIs below.
  }

  try {
    const anchor = normalizeEditorPosition(editor.getCursor("anchor"));
    const head = normalizeEditorPosition(editor.getCursor("head"));
    if (!anchor) return [];
    return head ? [{ anchor, head }] : [{ anchor }];
  } catch {
    return [];
  }
}

function normalizeSelection(selection: EditorSelectionOrCaret): EditorSelectionOrCaret | undefined {
  const anchor = normalizeEditorPosition(selection.anchor);
  const head = normalizeEditorPosition(selection.head);
  if (!anchor) return undefined;
  return head ? { anchor, head } : { anchor };
}

function normalizeEditorPosition(position: EditorPosition | undefined): EditorPosition | undefined {
  if (!position) return undefined;

  const line = readNonNegativeInteger(position.line);
  const ch = readNonNegativeInteger(position.ch);
  if (line === undefined || ch === undefined) return undefined;
  return { line, ch };
}

function isDocumentStartSelection(selection: EditorSelectionOrCaret): boolean {
  return (
    positionsEqual(selection.anchor, { line: 0, ch: 0 })
    && (!selection.head || positionsEqual(selection.head, { line: 0, ch: 0 }))
  );
}

function clampEditorSelection(editor: Editor, selection: EditorSelectionOrCaret): EditorSelectionOrCaret | undefined {
  const anchor = clampEditorPosition(editor, selection.anchor);
  if (!anchor) return undefined;
  const head = selection.head ? clampEditorPosition(editor, selection.head) : undefined;
  return head ? { anchor, head } : { anchor };
}

function clampEditorPosition(editor: Editor, position: EditorPosition): EditorPosition | undefined {
  const lineCount = editor.lineCount();
  if (lineCount <= 0) return undefined;

  const line = Math.min(Math.max(0, Math.trunc(position.line)), lineCount - 1);
  const text = editor.getLine(line);
  const ch = Math.min(Math.max(0, Math.trunc(position.ch)), text.length);
  return { line, ch };
}

function markdownMode(view: MarkdownView): "source" | "preview" | undefined {
  const mode = view.getMode();
  return mode === "source" || mode === "preview" ? mode : undefined;
}

function hasPositionState(state: SourcePositionState): boolean {
  return state.scroll !== undefined || Boolean(state.selections && state.selections.length > 0);
}

function readScroll(value: unknown): number | undefined {
  const number = readFiniteNumber(value);
  if (number === undefined || number < 0) return undefined;
  return Math.round(number * 10000) / 10000;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.trunc(value);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function positionEntryStateEquals(left: PositionEntry, right: PositionEntry): boolean {
  return (
    left.lastMode === right.lastMode
    && scrollStateEquals(left.source, right.source)
    && scrollStateEquals(left.preview, right.preview)
    && selectionsEqual(left.source?.selections, right.source?.selections)
  );
}

function mergePositionEntry(previous: PositionEntry | undefined, next: PositionEntry): PositionEntry {
  if (!previous) return next;

  const source = next.source
    ? { ...previous.source, ...next.source }
    : previous.source;
  const preview = next.preview
    ? { ...previous.preview, ...next.preview }
    : previous.preview;

  return {
    updatedAt: next.updatedAt,
    lastMode: next.lastMode,
    ...(source ? { source } : {}),
    ...(preview ? { preview } : {})
  };
}

function scrollStateEquals(left: ScrollPositionState | undefined, right: ScrollPositionState | undefined): boolean {
  return left?.scroll === right?.scroll;
}

function selectionsEqual(
  left: EditorSelectionOrCaret[] | undefined,
  right: EditorSelectionOrCaret[] | undefined
): boolean {
  const leftSelections = left ?? [];
  const rightSelections = right ?? [];
  if (leftSelections.length !== rightSelections.length) return false;

  return leftSelections.every((selection, index) => (
    positionsEqual(selection.anchor, rightSelections[index].anchor)
    && positionsEqual(selection.head, rightSelections[index].head)
  ));
}

function positionsEqual(left: EditorPosition | undefined, right: EditorPosition | undefined): boolean {
  return left?.line === right?.line && left?.ch === right?.ch;
}

function pruneEntries(data: PositionMemoryData): void {
  const entries = Object.entries(data.entries);
  if (entries.length <= MAX_ENTRY_COUNT) return;

  entries
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(MAX_ENTRY_COUNT)
    .forEach(([path]) => {
      delete data.entries[path];
    });
}

function serializePositionMemoryData(data: PositionMemoryData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function parentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

class RestoreSession {
  private readonly frames = new Set<number>();
  private readonly timers = new Set<number>();
  private readonly disposers = new Set<() => void>();
  private readonly resolvers = new Set<() => void>();
  private cancelledState = false;

  get cancelled(): boolean {
    return this.cancelledState;
  }

  animationFrame(): Promise<void> {
    if (this.cancelledState) return Promise.resolve();

    return new Promise((resolve) => {
      let frame = 0;
      const finish = () => {
        this.frames.delete(frame);
        this.resolvers.delete(finish);
        resolve();
      };
      frame = window.requestAnimationFrame(finish);
      this.frames.add(frame);
      this.resolvers.add(finish);
    });
  }

  delay(ms: number): Promise<void> {
    if (this.cancelledState) return Promise.resolve();

    return new Promise((resolve) => {
      let timer: number | undefined;
      const cancel = () => {
        this.clearTimeout(timer);
        this.resolvers.delete(cancel);
        resolve();
      };
      timer = this.setTimeout(() => {
        this.resolvers.delete(cancel);
        resolve();
      }, ms);
      this.resolvers.add(cancel);
    });
  }

  setTimeout(callback: () => void, ms: number): number {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  clearTimeout(timer: number | undefined): void {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.timers.delete(timer);
  }

  addDisposer(disposer: () => void): void {
    this.disposers.add(disposer);
  }

  cancel(): void {
    if (this.cancelledState) return;
    this.cancelledState = true;
    for (const frame of this.frames) window.cancelAnimationFrame(frame);
    this.frames.clear();
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    for (const disposer of Array.from(this.disposers)) disposer();
    this.disposers.clear();
    for (const resolve of Array.from(this.resolvers)) resolve();
    this.resolvers.clear();
  }
}

function createUserInteractionAbort(
  view: MarkdownView,
  session: RestoreSession
): { readonly cancelled: boolean; dispose(): void } {
  let cancelled = false;
  const abort = () => {
    cancelled = true;
  };
  const target = view.containerEl?.ownerDocument?.defaultView ?? window;
  const options = { capture: true, passive: true };
  target.addEventListener("wheel", abort, options);
  target.addEventListener("touchmove", abort, options);
  target.addEventListener("keydown", abort, options);
  target.addEventListener("pointerdown", abort, options);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener("wheel", abort, options);
    target.removeEventListener("touchmove", abort, options);
    target.removeEventListener("keydown", abort, options);
    target.removeEventListener("pointerdown", abort, options);
  };
  session.addDisposer(dispose);

  return {
    get cancelled() {
      return cancelled;
    },
    dispose
  };
}

async function waitForStableLayout(
  view: MarkdownView,
  isCurrent: () => boolean,
  abort: { readonly cancelled: boolean },
  session: RestoreSession
): Promise<void> {
  const container = currentModeContainer(view);
  if (!container || !container.isConnected || typeof MutationObserver === "undefined") {
    await session.delay(RESTORE_SETTLE_QUIET_MS);
    return;
  }

  await new Promise<void>((resolve) => {
    if (session.cancelled) {
      resolve();
      return;
    }

    let settledTimer: number | undefined;
    let timeoutTimer: number | undefined;
    let observer: MutationObserver | undefined;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      session.clearTimeout(settledTimer);
      session.clearTimeout(timeoutTimer);
      observer?.disconnect();
      resolve();
    };
    const scheduleSettled = () => {
      session.clearTimeout(settledTimer);
      settledTimer = session.setTimeout(finish, RESTORE_SETTLE_QUIET_MS);
    };
    session.addDisposer(finish);
    observer = new MutationObserver(() => {
      if (!isCurrent() || abort.cancelled) {
        finish();
        return;
      }
      scheduleSettled();
    });
    timeoutTimer = session.setTimeout(finish, RESTORE_SETTLE_TIMEOUT_MS);
    observer.observe(container, { childList: true, subtree: true });
    scheduleSettled();
  });

  await session.animationFrame();
  await session.animationFrame();
}

function currentModeContainer(view: MarkdownView): HTMLElement | undefined {
  const modeWithContainer = view.currentMode as { containerEl?: HTMLElement };
  return modeWithContainer.containerEl ?? view.containerEl;
}
