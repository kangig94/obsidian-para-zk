import { ButtonComponent, Notice } from "obsidian";
import { renderBlockNotice } from "./shell";

export type RegistryBlockState<TToolbar, TItem> = {
  toolbar: TToolbar;
  generation: number;
  draggingItemKey?: string;
  summaryEl?: HTMLElement;
  items: TItem[];
  visible: TItem[];
};

export type RegistryDragOptions = {
  onDrop: (draggedKey: string, targetKey: string, placeAfter: boolean) => Promise<void>;
};

type RegistryDragState = {
  draggingItemKey?: string;
};

type RegistryFile = {
  path: string;
};

type RegistryRowDragOptions<TItem, TState extends RegistryDragState> = {
  state: TState;
  itemKey: (item: TItem) => string;
  label: string;
  drag: RegistryDragOptions;
};

const registryFileWriteQueues = new Map<string, Promise<unknown>>();

export function beginRegistryBlockRender<TArgs, TState extends RegistryDragState & { generation: number }>(
  states: WeakMap<HTMLElement, TState>,
  el: HTMLElement,
  args: TArgs,
  createState: (args: TArgs) => TState,
  onBegin?: (state: TState) => void
): TState {
  const state = registryBlockState(states, el, args, createState);
  state.generation += 1;
  state.draggingItemKey = undefined;
  onBegin?.(state);
  return state;
}

function registryBlockState<TArgs, TState>(
  states: WeakMap<HTMLElement, TState>,
  el: HTMLElement,
  args: TArgs,
  createState: (args: TArgs) => TState
): TState {
  const existing = states.get(el);
  if (existing) return existing;

  const state = createState(args);
  states.set(el, state);
  return state;
}

export function isCurrentRegistryBlockGeneration<TState extends { generation: number }>(
  states: WeakMap<HTMLElement, TState>,
  el: HTMLElement,
  generation: number
): boolean {
  return states.get(el)?.generation === generation;
}

export async function runRegistryBlockAction(button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    new Notice(registryErrorMessage(error));
  } finally {
    button.disabled = false;
  }
}

export function renderRegistryBlockError(
  el: HTMLElement,
  error: unknown,
  kind: string
): void {
  renderBlockNotice(el, kind, registryErrorMessage(error));
}

export function registryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function queueRegistryFileWrite<T>(file: RegistryFile, write: () => Promise<T>): Promise<T> {
  const key = file.path;
  const previous = registryFileWriteQueues.get(key) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(write);
  registryFileWriteQueues.set(key, current);
  try {
    return await current;
  } finally {
    if (registryFileWriteQueues.get(key) === current) {
      registryFileWriteQueues.delete(key);
    }
  }
}

export function renderRegistryRow<TItem, TState extends RegistryDragState>(
  list: HTMLElement,
  item: TItem,
  options: {
    dataset?: Record<string, string>;
    drag?: RegistryRowDragOptions<TItem, TState>;
    renderBody: (row: HTMLElement) => void;
  }
): HTMLElement {
  const row = list.createDiv({ cls: "para-zk-block__row" });
  for (const [key, value] of Object.entries(options.dataset ?? {})) {
    row.dataset[key] = value;
  }
  if (options.drag) {
    row.addClass("is-reorderable");
    attachRegistryDragHandle(list, row, item, options.drag);
  }

  options.renderBody(row);
  return row;
}

export function canRegistryDragReorder<TItem>(
  items: TItem[],
  visible: TItem[],
  domainEligible: boolean
): boolean {
  return domainEligible
    && visible.length === items.length
    && items.length > 1;
}

export function createRegistryDragReorder<TItem>(
  options: {
    visibleItems: () => TItem[];
    itemKey: (item: TItem) => string;
    persistOrder: (keys: string[]) => Promise<unknown>;
    rerender: () => Promise<void>;
  }
): RegistryDragOptions {
  return {
    onDrop: async (draggedKey, targetKey, placeAfter) => {
      const nextKeys = reorderedRegistryItemKeys(
        options.visibleItems(),
        draggedKey,
        targetKey,
        placeAfter,
        options.itemKey
      );
      if (!nextKeys) return;
      await options.persistOrder(nextKeys);
      await options.rerender();
    }
  };
}

function reorderedRegistryItemKeys<TItem>(
  visible: TItem[],
  draggedKey: string,
  targetKey: string,
  placeAfter: boolean,
  itemKey: (item: TItem) => string
): string[] | undefined {
  const keys = visible.map(itemKey);
  const from = keys.indexOf(draggedKey);
  const target = keys.indexOf(targetKey);
  if (from === -1 || target === -1 || from === target) return undefined;

  const [moved] = keys.splice(from, 1);
  const targetAfterRemoval = keys.indexOf(targetKey);
  const insertAt = targetAfterRemoval + (placeAfter ? 1 : 0);
  keys.splice(insertAt, 0, moved);
  return keys;
}

function attachRegistryDragHandle<TItem, TState extends RegistryDragState>(
  list: HTMLElement,
  row: HTMLElement,
  item: TItem,
  options: RegistryRowDragOptions<TItem, TState>
): void {
  const handle = new ButtonComponent(row);
  const button = handle.buttonEl;
  button.addClass("para-zk-block__drag");
  button.draggable = true;
  button.setAttr("aria-label", options.label);
  handle
    .setIcon("grip-vertical")
    .setTooltip(options.label);

  button.addEventListener("dragstart", (event) => {
    const key = options.itemKey(item);
    options.state.draggingItemKey = key;
    row.addClass("is-dragging");
    event.dataTransfer?.setData("text/plain", key);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  button.addEventListener("dragend", () => {
    options.state.draggingItemKey = undefined;
    cleanupRegistryDragMarks(list);
  });

  row.addEventListener("dragover", (event) => {
    const draggedKey = options.state.draggingItemKey;
    const key = options.itemKey(item);
    if (!draggedKey || draggedKey === key) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    markRegistryDropPosition(list, row, isRegistryDropAfter(event, row));
  });
  row.addEventListener("dragleave", (event) => {
    if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;
    row.removeClass("is-drop-before", "is-drop-after");
  });
  row.addEventListener("drop", (event) => {
    const key = options.itemKey(item);
    const draggedKey = options.state.draggingItemKey ?? event.dataTransfer?.getData("text/plain");
    if (!draggedKey || draggedKey === key) return;
    event.preventDefault();
    const placeAfter = isRegistryDropAfter(event, row);
    options.state.draggingItemKey = undefined;
    cleanupRegistryDragMarks(list);
    void options.drag.onDrop(draggedKey, key, placeAfter).catch((error: unknown) => {
      new Notice(registryErrorMessage(error));
    });
  });
}

function isRegistryDropAfter(event: DragEvent, row: HTMLElement): boolean {
  const rect = row.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function markRegistryDropPosition(
  list: HTMLElement,
  row: HTMLElement,
  placeAfter: boolean
): void {
  cleanupRegistryDropMarks(list);
  row.addClass(placeAfter ? "is-drop-after" : "is-drop-before");
}

function cleanupRegistryDropMarks(list: HTMLElement): void {
  for (const row of list.querySelectorAll(".para-zk-block__row")) {
    row.removeClass("is-drop-before", "is-drop-after");
  }
}

function cleanupRegistryDragMarks(list: HTMLElement): void {
  for (const row of list.querySelectorAll(".para-zk-block__row")) {
    row.removeClass("is-dragging", "is-drop-before", "is-drop-after");
  }
}
