import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor, MarkdownView } from "obsidian";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import {
  capturePositionEntry,
  parsePositionMemoryData,
  registerPositionMemory,
  restoreCursorPosition,
  restoreScrollPosition,
  unregisterPositionMemory,
  type PositionEntry
} from "../../src/ux/position-memory";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("parsePositionMemoryData", () => {
  it("keeps only valid entries and normalizes numeric values", () => {
    const data = parsePositionMemoryData({
      version: 1,
      entries: {
        "Project.md": {
          updatedAt: 10,
          lastMode: "source",
          source: {
            scroll: 12.345678,
            selections: [
              {
                anchor: { line: 4.9, ch: 2.1 },
                head: { line: 6, ch: 0 }
              },
              {
                anchor: { line: -1, ch: 0 }
              }
            ]
          },
          preview: {
            scroll: -10
          }
        },
        "Invalid.md": {
          updatedAt: 20,
          source: {
            selections: [{ anchor: { line: "4", ch: 0 } }]
          }
        }
      }
    });

    expect(data).toEqual({
      version: 1,
      entries: {
        "Project.md": {
          updatedAt: 10,
          lastMode: "source",
          source: {
            scroll: 12.3457,
            selections: [
              {
                anchor: { line: 4, ch: 2 },
                head: { line: 6, ch: 0 }
              }
            ]
          }
        }
      }
    });
  });
});

describe("capturePositionEntry", () => {
  it("captures source scroll and selections from public Obsidian APIs", () => {
    const view = fakeView({
      mode: "source",
      scroll: 7.123456,
      selections: [
        {
          anchor: { line: 3, ch: 2 },
          head: { line: 3, ch: 8 }
        }
      ]
    });

    expect(capturePositionEntry(view, 123)).toEqual({
      updatedAt: 123,
      lastMode: "source",
      source: {
        scroll: 7.1235,
        selections: [
          {
            anchor: { line: 3, ch: 2 },
            head: { line: 3, ch: 8 }
          }
        ]
      }
    });
  });

  it("captures preview scroll separately", () => {
    const view = fakeView({
      mode: "preview",
      scroll: 45
    });

    expect(capturePositionEntry(view, 456)).toEqual({
      updatedAt: 456,
      lastMode: "preview",
      preview: {
        scroll: 45
      }
    });
  });

  it("captures ephemeral scroll when the current source mode reports top", () => {
    const view = fakeView({
      mode: "source",
      scroll: 0,
      ephemeralScroll: 64.5,
      selections: [
        {
          anchor: { line: 12, ch: 0 },
          head: { line: 12, ch: 0 }
        }
      ]
    });

    expect(capturePositionEntry(view, 789)).toMatchObject({
      source: {
        scroll: 64.5
      }
    });
  });
});

describe("restorePosition", () => {
  it("clamps source selections to the current editor contents", () => {
    const view = fakeView({
      mode: "source",
      scroll: 0,
      lines: ["abc", "de"]
    });
    const entry: PositionEntry = {
      updatedAt: 1,
      lastMode: "source",
      source: {
        selections: [
          {
            anchor: { line: 10, ch: 99 },
            head: { line: 0, ch: 5 }
          }
        ]
      }
    };

    restoreCursorPosition(view, entry);

    expect(view.editor.setSelections).toHaveBeenCalledWith([
      {
        anchor: { line: 1, ch: 2 },
        head: { line: 0, ch: 3 }
      }
    ], 0);
  });

  it("does not reapply an already restored source selection", () => {
    const view = fakeView({
      mode: "source",
      scroll: 0,
      lines: ["abc", "de"],
      selections: [
        {
          anchor: { line: 1, ch: 1 },
          head: { line: 1, ch: 1 }
        }
      ]
    });
    const entry: PositionEntry = {
      updatedAt: 1,
      lastMode: "source",
      source: {
        selections: [
          {
            anchor: { line: 1, ch: 1 },
            head: { line: 1, ch: 1 }
          }
        ]
      }
    };

    restoreCursorPosition(view, entry);

    expect(view.editor.setSelections).not.toHaveBeenCalled();
  });

  it("does not let a document-start cursor override a nonzero source scroll", () => {
    const view = fakeView({
      mode: "source",
      scroll: 0,
      lines: ["# Title", "body"]
    });
    const entry: PositionEntry = {
      updatedAt: 1,
      lastMode: "source",
      source: {
        scroll: 8,
        selections: [
          {
            anchor: { line: 0, ch: 0 },
            head: { line: 0, ch: 0 }
          }
        ]
      }
    };

    restoreCursorPosition(view, entry);
    restoreScrollPosition(view, entry);

    expect(view.editor.setSelections).not.toHaveBeenCalled();
    expect(view.setEphemeralState).toHaveBeenCalledWith({ scroll: 8 });
  });

  it("restores only the scroll state for the active markdown mode", () => {
    const sourceView = fakeView({
      mode: "source",
      scroll: 0
    });
    const previewView = fakeView({
      mode: "preview",
      scroll: 0
    });
    const entry: PositionEntry = {
      updatedAt: 1,
      lastMode: "preview",
      source: {
        scroll: 10
      },
      preview: {
        scroll: 20
      }
    };

    restoreScrollPosition(sourceView, entry);
    restoreScrollPosition(previewView, entry);

    expect(sourceView.setEphemeralState).toHaveBeenCalledWith({ scroll: 10 });
    expect(sourceView.editor.scrollTo).not.toHaveBeenCalled();
    expect(sourceView.currentMode.applyScroll).not.toHaveBeenCalled();
    expect(previewView.setEphemeralState).toHaveBeenCalledWith({ scroll: 20 });
    expect(previewView.currentMode.applyScroll).not.toHaveBeenCalled();
  });
});

describe("registerPositionMemory", () => {
  it("cancels scheduled writes on unload instead of writing during renderer teardown", async () => {
    vi.useFakeTimers();
    stubWindow();

    const write = vi.fn(async () => {});
    const activeView = fakeView({
      mode: "preview",
      scroll: 42
    });
    const handlers = new Map<string, (...args: unknown[]) => void>();
    let child: { unload(): void } | undefined;
    const removeChild = vi.fn((component: { unload(): void }) => {
      component.unload();
      if (component === child) child = undefined;
      return component;
    });
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        rememberCursorPosition: true
      },
      manifest: {
        id: "para-zk",
        name: "PARA-ZK",
        author: "test",
        version: "0.0.0",
        minAppVersion: "1.0.0",
        description: "",
        dir: ".obsidian/plugins/para-zk"
      },
      app: {
        vault: {
          on: vi.fn(() => ({ detach: vi.fn() })),
          adapter: {
            exists: vi.fn(async () => false),
            read: vi.fn(async () => "{}"),
            write,
            mkdir: vi.fn(async () => {})
          }
        },
        workspace: {
          containerEl: fakeEventTarget(),
          on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
            handlers.set(name, callback);
            return { detach: vi.fn() };
          }),
          onLayoutReady: vi.fn(),
          getActiveViewOfType: vi.fn(() => activeView)
        }
      },
      addChild: vi.fn((component: { load(): void; unload(): void }) => {
        child = component;
        component.load();
        return component;
      }),
      removeChild,
      saveSettings: vi.fn(async () => {}),
      setupVault: vi.fn(async () => ({
        dryRun: false,
        created: [],
        updated: [],
        existing: [],
        skipped: [],
        warnings: [],
        dependencies: []
      }))
    } as unknown as ParaZkPluginContext;

    await registerPositionMemory(plugin);
    handlers.get("active-leaf-change")?.();
    unregisterPositionMemory(plugin);
    await vi.advanceTimersByTimeAsync(3000);

    expect(write).not.toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
  });

  it("retries restore until the opened markdown view is attached", async () => {
    vi.useFakeTimers();
    stubWindow();

    let activeView: MarkdownView | undefined;
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        rememberCursorPosition: true
      },
      manifest: {
        id: "para-zk",
        name: "PARA-ZK",
        author: "test",
        version: "0.0.0",
        minAppVersion: "1.0.0",
        description: "",
        dir: ".obsidian/plugins/para-zk"
      },
      app: {
        vault: {
          on: vi.fn(() => ({ detach: vi.fn() })),
          adapter: {
            exists: vi.fn(async () => true),
            read: vi.fn(async () => JSON.stringify({
              version: 1,
              entries: {
                "Project.md": {
                  updatedAt: 1,
                  lastMode: "preview",
                  preview: { scroll: 88 }
                }
              }
            })),
            write: vi.fn(async () => {}),
            mkdir: vi.fn(async () => {})
          }
        },
        workspace: {
          containerEl: fakeEventTarget(),
          on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
            handlers.set(name, callback);
            return { detach: vi.fn() };
          }),
          onLayoutReady: vi.fn(),
          getActiveViewOfType: vi.fn(() => activeView ?? null),
          getLeavesOfType: vi.fn(() => (activeView ? [{ view: activeView }] : []))
        }
      },
      addChild: vi.fn((component: { load(): void }) => {
        component.load();
        return component;
      }),
      removeChild: vi.fn(),
      saveSettings: vi.fn(async () => {}),
      setupVault: vi.fn(async () => ({
        dryRun: false,
        created: [],
        updated: [],
        existing: [],
        skipped: [],
        warnings: [],
        dependencies: []
      }))
    } as unknown as ParaZkPluginContext;

    await registerPositionMemory(plugin);
    handlers.get("file-open")?.({ path: "Project.md" });
    await vi.advanceTimersByTimeAsync(49);

    activeView = fakeView({
      mode: "preview",
      scroll: 0
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(activeView.setEphemeralState).toHaveBeenCalledWith({ scroll: 88 });
    unregisterPositionMemory(plugin);
  });

  it("restores instead of capturing top when switching back to an already open markdown leaf", async () => {
    vi.useFakeTimers();
    stubWindow();

    const activeView = fakeView({
      mode: "preview",
      scroll: 0
    });
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        rememberCursorPosition: true
      },
      manifest: {
        id: "para-zk",
        name: "PARA-ZK",
        author: "test",
        version: "0.0.0",
        minAppVersion: "1.0.0",
        description: "",
        dir: ".obsidian/plugins/para-zk"
      },
      app: {
        vault: {
          on: vi.fn(() => ({ detach: vi.fn() })),
          adapter: {
            exists: vi.fn(async () => true),
            read: vi.fn(async () => JSON.stringify({
              version: 1,
              entries: {
                "Project.md": {
                  updatedAt: 1,
                  lastMode: "preview",
                  preview: { scroll: 120 }
                }
              }
            })),
            write: vi.fn(async () => {}),
            mkdir: vi.fn(async () => {})
          }
        },
        workspace: {
          containerEl: fakeEventTarget(),
          on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
            handlers.set(name, callback);
            return { detach: vi.fn() };
          }),
          onLayoutReady: vi.fn(),
          getActiveViewOfType: vi.fn(() => activeView),
          getLeavesOfType: vi.fn(() => [{ view: activeView }])
        }
      },
      addChild: vi.fn((component: { load(): void }) => {
        component.load();
        return component;
      }),
      removeChild: vi.fn(),
      saveSettings: vi.fn(async () => {}),
      setupVault: vi.fn(async () => ({
        dryRun: false,
        created: [],
        updated: [],
        existing: [],
        skipped: [],
        warnings: [],
        dependencies: []
      }))
    } as unknown as ParaZkPluginContext;

    await registerPositionMemory(plugin);
    handlers.get("active-leaf-change")?.();
    await vi.advanceTimersByTimeAsync(20);

    expect(activeView.setEphemeralState).toHaveBeenCalledWith({ scroll: 120 });
    unregisterPositionMemory(plugin);
  });

  it("restores source cursor through the editor without passing cursor through ephemeral state", async () => {
    vi.useFakeTimers();
    stubWindow();

    const activeView = fakeView({
      mode: "source",
      scroll: 0,
      lines: ["# Title", "body", "target"]
    });
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        rememberCursorPosition: true
      },
      manifest: {
        id: "para-zk",
        name: "PARA-ZK",
        author: "test",
        version: "0.0.0",
        minAppVersion: "1.0.0",
        description: "",
        dir: ".obsidian/plugins/para-zk"
      },
      app: {
        vault: {
          on: vi.fn(() => ({ detach: vi.fn() })),
          adapter: {
            exists: vi.fn(async () => true),
            read: vi.fn(async () => JSON.stringify({
              version: 1,
              entries: {
                "Project.md": {
                  updatedAt: 1,
                  lastMode: "source",
                  source: {
                    scroll: 72,
                    selections: [
                      {
                        anchor: { line: 2, ch: 1 },
                        head: { line: 2, ch: 1 }
                      }
                    ]
                  }
                }
              }
            })),
            write: vi.fn(async () => {}),
            mkdir: vi.fn(async () => {})
          }
        },
        workspace: {
          containerEl: fakeEventTarget(),
          on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
            handlers.set(name, callback);
            return { detach: vi.fn() };
          }),
          onLayoutReady: vi.fn(),
          getActiveViewOfType: vi.fn(() => activeView),
          getLeavesOfType: vi.fn(() => [{ view: activeView }])
        }
      },
      addChild: vi.fn((component: { load(): void }) => {
        component.load();
        return component;
      }),
      removeChild: vi.fn(),
      saveSettings: vi.fn(async () => {}),
      setupVault: vi.fn(async () => ({
        dryRun: false,
        created: [],
        updated: [],
        existing: [],
        skipped: [],
        warnings: [],
        dependencies: []
      }))
    } as unknown as ParaZkPluginContext;

    await registerPositionMemory(plugin);
    handlers.get("active-leaf-change")?.();
    await vi.advanceTimersByTimeAsync(500);

    expect(activeView.editor.setSelections).toHaveBeenCalledWith([
      {
        anchor: { line: 2, ch: 1 },
        head: { line: 2, ch: 1 }
      }
    ], 0);
    expect(activeView.setEphemeralState).toHaveBeenCalledWith({ scroll: 72 });
    expect(activeView.setEphemeralState).not.toHaveBeenCalledWith(expect.objectContaining({
      cursor: expect.anything()
    }));
    unregisterPositionMemory(plugin);
  });

  it("does not overwrite a restored source cursor with post-restore editor normalization", async () => {
    vi.useFakeTimers();
    stubWindow();

    const write = vi.fn(async () => {});
    const activeView = fakeView({
      mode: "source",
      scroll: 99,
      lines: ["# Title", "body", "target"],
      reportedSelectionsAfterSet: [
        {
          anchor: { line: 1, ch: 0 },
          head: { line: 1, ch: 0 }
        }
      ]
    });
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        rememberCursorPosition: true
      },
      manifest: {
        id: "para-zk",
        name: "PARA-ZK",
        author: "test",
        version: "0.0.0",
        minAppVersion: "1.0.0",
        description: "",
        dir: ".obsidian/plugins/para-zk"
      },
      app: {
        vault: {
          on: vi.fn(() => ({ detach: vi.fn() })),
          adapter: {
            exists: vi.fn(async () => true),
            read: vi.fn(async () => JSON.stringify({
              version: 1,
              entries: {
                "Project.md": {
                  updatedAt: 1,
                  lastMode: "source",
                  source: {
                    scroll: 72,
                    selections: [
                      {
                        anchor: { line: 2, ch: 1 },
                        head: { line: 2, ch: 1 }
                      }
                    ]
                  }
                }
              }
            })),
            write,
            mkdir: vi.fn(async () => {})
          }
        },
        workspace: {
          containerEl: fakeEventTarget(),
          on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
            handlers.set(name, callback);
            return { detach: vi.fn() };
          }),
          onLayoutReady: vi.fn(),
          getActiveViewOfType: vi.fn(() => activeView),
          getLeavesOfType: vi.fn(() => [{ view: activeView }])
        }
      },
      addChild: vi.fn((component: { load(): void }) => {
        component.load();
        return component;
      }),
      removeChild: vi.fn(),
      saveSettings: vi.fn(async () => {}),
      setupVault: vi.fn(async () => ({
        dryRun: false,
        created: [],
        updated: [],
        existing: [],
        skipped: [],
        warnings: [],
        dependencies: []
      }))
    } as unknown as ParaZkPluginContext;

    await registerPositionMemory(plugin);
    handlers.get("active-leaf-change")?.();
    await vi.advanceTimersByTimeAsync(3500);

    expect(write).toHaveBeenCalled();
    const saved = JSON.parse(write.mock.calls.at(-1)?.[1] as string);
    expect(saved.entries["Project.md"].source.selections).toEqual([
      {
        anchor: { line: 2, ch: 1 },
        head: { line: 2, ch: 1 }
      }
    ]);
    expect(saved.entries["Project.md"].source.scroll).toBe(99);
    unregisterPositionMemory(plugin);
  });

  it("captures a new source cursor after a user editor interaction", async () => {
    vi.useFakeTimers();
    stubWindow();

    const write = vi.fn(async () => {});
    const workspaceEl = fakeEventTarget();
    const activeView = fakeView({
      mode: "source",
      scroll: 99,
      lines: ["# Title", "body", "target", "new target"],
      reportedSelectionsAfterSet: [
        {
          anchor: { line: 1, ch: 0 },
          head: { line: 1, ch: 0 }
        }
      ]
    });
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        rememberCursorPosition: true
      },
      manifest: {
        id: "para-zk",
        name: "PARA-ZK",
        author: "test",
        version: "0.0.0",
        minAppVersion: "1.0.0",
        description: "",
        dir: ".obsidian/plugins/para-zk"
      },
      app: {
        vault: {
          on: vi.fn(() => ({ detach: vi.fn() })),
          adapter: {
            exists: vi.fn(async () => true),
            read: vi.fn(async () => JSON.stringify({
              version: 1,
              entries: {
                "Project.md": {
                  updatedAt: 1,
                  lastMode: "source",
                  source: {
                    scroll: 72,
                    selections: [
                      {
                        anchor: { line: 2, ch: 1 },
                        head: { line: 2, ch: 1 }
                      }
                    ]
                  }
                }
              }
            })),
            write,
            mkdir: vi.fn(async () => {})
          }
        },
        workspace: {
          containerEl: workspaceEl,
          on: vi.fn((name: string, callback: (...args: unknown[]) => void) => {
            handlers.set(name, callback);
            return { detach: vi.fn() };
          }),
          onLayoutReady: vi.fn(),
          getActiveViewOfType: vi.fn(() => activeView),
          getLeavesOfType: vi.fn(() => [{ view: activeView }])
        }
      },
      addChild: vi.fn((component: { load(): void }) => {
        component.load();
        return component;
      }),
      removeChild: vi.fn(),
      saveSettings: vi.fn(async () => {}),
      setupVault: vi.fn(async () => ({
        dryRun: false,
        created: [],
        updated: [],
        existing: [],
        skipped: [],
        warnings: [],
        dependencies: []
      }))
    } as unknown as ParaZkPluginContext;

    await registerPositionMemory(plugin);
    handlers.get("active-leaf-change")?.();
    await vi.advanceTimersByTimeAsync(700);
    (activeView as unknown as MutableFakeMarkdownView).__setSelections([
      {
        anchor: { line: 3, ch: 4 },
        head: { line: 3, ch: 4 }
      }
    ]);
    workspaceEl.__dispatch("pointerup", eventInsideView(activeView));
    await vi.advanceTimersByTimeAsync(3000);

    expect(write).toHaveBeenCalled();
    const saved = JSON.parse(write.mock.calls.at(-1)?.[1] as string);
    expect(saved.entries["Project.md"].source.selections).toEqual([
      {
        anchor: { line: 3, ch: 4 },
        head: { line: 3, ch: 4 }
      }
    ]);
    unregisterPositionMemory(plugin);
  });
});

type MutableFakeMarkdownView = MarkdownView & {
  __setSelections(selections: Array<{ anchor: { line: number; ch: number }; head?: { line: number; ch: number } }>): void;
};

type FakeEventTarget = HTMLElement & {
  __dispatch(type: string, event: Event): void;
};

function fakeView(options: {
  mode: "source" | "preview";
  scroll: number;
  editorScroll?: number;
  modeScroll?: number;
  ephemeralScroll?: number;
  selections?: Array<{ anchor: { line: number; ch: number }; head?: { line: number; ch: number } }>;
  reportedSelectionsAfterSet?: Array<{ anchor: { line: number; ch: number }; head?: { line: number; ch: number } }>;
  lines?: string[];
}): MutableFakeMarkdownView {
  const lines = options.lines ?? [""];
  const editorScroll = options.editorScroll ?? options.scroll;
  const modeScroll = options.modeScroll ?? options.scroll;
  let selections = options.selections ?? [];
  const setSelections = vi.fn((next: Array<{ anchor: { line: number; ch: number }; head?: { line: number; ch: number } }>) => {
    selections = options.reportedSelectionsAfterSet ?? next;
  });
  const setSelection = vi.fn((anchor: { line: number; ch: number }, head?: { line: number; ch: number }) => {
    selections = [{ anchor, ...(head ? { head } : {}) }];
  });
  const editor = {
    listSelections: () => selections,
    getCursor: (side?: "from" | "to" | "head" | "anchor") => {
      const selection = selections[0];
      if (!selection) return { line: 0, ch: 0 };
      if (side === "head" || side === "to") return selection.head ?? selection.anchor;
      return selection.anchor;
    },
    getScrollInfo: () => ({ top: editorScroll, left: 0, width: 0, height: 0, clientWidth: 0, clientHeight: 0 }),
    lineCount: () => lines.length,
    getLine: (line: number) => lines[line] ?? "",
    setSelections,
    setSelection,
    scrollTo: vi.fn()
  } as unknown as Editor;
  const currentMode = {
    getScroll: () => modeScroll,
    applyScroll: vi.fn(),
    get: () => "",
    set: () => {}
  };

  const containerEl = fakeViewContainer();
  return {
    file: { path: "Project.md" },
    editor,
    currentMode,
    containerEl,
    getMode: () => options.mode,
    getEphemeralState: () => (
      options.ephemeralScroll === undefined ? {} : { scroll: options.ephemeralScroll }
    ),
    setEphemeralState: vi.fn(),
    __setSelections(next) {
      selections = next;
    }
  } as unknown as MutableFakeMarkdownView;
}

function stubWindow(): void {
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    requestAnimationFrame: (callback: FrameRequestCallback) => (
      globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number
    ),
    cancelAnimationFrame: (id: number) => {
      globalThis.clearTimeout(id);
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
}

function fakeEventTarget(): FakeEventTarget {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    addEventListener: vi.fn((type: string, callback: (...args: unknown[]) => void) => {
      const existing = listeners.get(type) ?? [];
      existing.push(callback);
      listeners.set(type, existing);
    }),
    removeEventListener: vi.fn((type: string, callback: (...args: unknown[]) => void) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((listener) => listener !== callback));
    }),
    __dispatch(type: string, event: Event): void {
      for (const listener of listeners.get(type) ?? []) listener(event);
    }
  } as unknown as FakeEventTarget;
}

function fakeViewContainer(): HTMLElement {
  return {
    contains: vi.fn(() => false)
  } as unknown as HTMLElement;
}

function eventInsideView(view: MarkdownView): Event {
  return {
    composedPath: () => [view.containerEl],
    target: view.containerEl
  } as unknown as Event;
}
