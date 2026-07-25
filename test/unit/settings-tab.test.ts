import { beforeEach, describe, expect, it, vi } from "vitest";
import { localePack } from "../../src/i18n";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { ParaZkSettingTab } from "../../src/ux/settings";

const effects = vi.hoisted(() => ({
  confirm: vi.fn(),
  explorer: vi.fn(),
  locale: vi.fn(),
  ribbon: vi.fn(),
  width: vi.fn(),
  registerPosition: vi.fn(),
  unregisterPosition: vi.fn()
}));

vi.mock("../../src/ux/prompts", () => ({ confirmAction: effects.confirm }));
vi.mock("../../src/ux/actions/explorer", () => ({ refreshExplorerActions: effects.explorer }));
vi.mock("../../src/ux/locale-labels", () => ({ refreshRegisteredLocaleLabels: effects.locale }));
vi.mock("../../src/ux/actions/ribbon", () => ({ refreshRibbonActions: effects.ribbon }));
vi.mock("../../src/ux/editor-width", () => ({ refreshEditorWidthControl: effects.width }));
vi.mock("../../src/ux/position-memory", () => ({
  registerPositionMemory: effects.registerPosition,
  unregisterPositionMemory: effects.unregisterPosition
}));

describe("ParaZkSettingTab controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    effects.confirm.mockResolvedValue(true);
    effects.registerPosition.mockResolvedValue(undefined);
  });

  it("renders and persists the locale selector through the 1.13 update path", async () => {
    const plugin = fakePlugin();
    const tab = new ParaZkSettingTab(plugin);
    const update = vi.fn();
    Object.assign(tab, { update });
    const setting = renderDefinition(tab, localePack("en").labels.settingsSetupVault);

    expect(setting.spans).toContainEqual({ cls: "para-zk-language-label", text: "Language:" });
    expect(setting.dropdown?.options).toEqual({ ko: "한국어", en: "English" });
    expect(setting.dropdown?.value).toBe("en");
    expect(setting.button?.text).toBe("Set up");
    expect(setting.button?.cta).toBe(true);

    await setting.dropdown?.change?.("ko");

    expect(plugin.settings.locale).toBe("ko");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(effects.locale).toHaveBeenCalledWith(plugin, "en");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("renders all toggles with their stored values and preserves save side effects", async () => {
    const plugin = fakePlugin();
    const tab = new ParaZkSettingTab(plugin);
    const labels = localePack("en").labels;
    const cases = [
      {
        name: labels.settingsShowRibbon,
        key: "showRibbon" as const,
        next: false,
        effect: effects.ribbon
      },
      {
        name: labels.settingsEmptyTrashAction,
        key: "showEmptyTrashAction" as const,
        next: false,
        effect: effects.explorer
      },
      {
        name: labels.settingsEditorWidthSlider,
        key: "editorWidthSliderEnabled" as const,
        next: false,
        effect: effects.width
      },
      {
        name: labels.settingsRememberCursorPosition,
        key: "rememberCursorPosition" as const,
        next: true,
        effect: effects.registerPosition
      }
    ];

    for (const testCase of cases) {
      const setting = renderDefinition(tab, testCase.name);
      expect(setting.toggle?.value).toBe(plugin.settings[testCase.key]);

      await setting.toggle?.change?.(testCase.next);

      expect(plugin.settings[testCase.key]).toBe(testCase.next);
      expect(testCase.effect).toHaveBeenCalledWith(plugin);
    }
    expect(plugin.saveSettings).toHaveBeenCalledTimes(cases.length);

    const positionSetting = renderDefinition(tab, labels.settingsRememberCursorPosition);
    await positionSetting.toggle?.change?.(false);
    expect(effects.unregisterPosition).toHaveBeenCalledWith(plugin);
  });

  it("waits for persistence before running refresh side effects", async () => {
    let resolveSave: (() => void) | undefined;
    const plugin = fakePlugin();
    plugin.saveSettings.mockImplementation(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    const setting = renderDefinition(
      new ParaZkSettingTab(plugin),
      localePack("en").labels.settingsShowRibbon
    );

    const pending = setting.toggle?.change?.(false);
    expect(effects.ribbon).not.toHaveBeenCalled();

    resolveSave?.();
    await pending;
    expect(effects.ribbon).toHaveBeenCalledWith(plugin);

    effects.ribbon.mockClear();
    plugin.saveSettings.mockRejectedValueOnce(new Error("save failed"));
    await expect(setting.toggle?.change?.(true)).rejects.toThrow("save failed");
    expect(effects.ribbon).not.toHaveBeenCalled();
  });

  it("runs each setup action and refreshes declarative settings", async () => {
    const plugin = fakePlugin();
    const tab = new ParaZkSettingTab(plugin);
    const update = vi.fn();
    Object.assign(tab, { update });
    const labels = localePack("en").labels;

    for (const [name, deps] of [
      [labels.settingsSetupVault, "none"],
      [labels.setupRequiredDeps, "required"],
      [labels.setupEnhancementDeps, "enhancements"]
    ] as const) {
      const setting = renderDefinition(tab, name);
      setting.button?.click?.();
      await flushPromises();
      expect(plugin.setupVault).toHaveBeenLastCalledWith({ locale: "en", deps });
      expect(setting.button?.disabled).toBe(false);
    }

    expect(effects.confirm).toHaveBeenCalledTimes(1);
    expect(plugin.setupVault).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it("renders and refreshes the complete imperative fallback when update is unavailable", async () => {
    const plugin = fakePlugin();
    const container = new FakeElement("section");
    Object.assign(plugin, { __settingContainerEl: container as unknown as HTMLElement });
    const tab = new ParaZkSettingTab(plugin);
    const setting = renderDefinition(tab, localePack("en").labels.settingsSetupVault);

    tab.display();
    expect(container.children).toHaveLength(9);
    expect(container.textContent).toContain("Set up PARA-ZK vault");
    expect(container.querySelectorAll("select")).toHaveLength(1);
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelectorAll("input")).toHaveLength(4);

    await setting.dropdown?.change?.("ko");
    expect(container.children).toHaveLength(9);
    expect(container.textContent).toContain("PARA-ZK 구성");
  });

  it("keeps the support row as a searchable heading with donation controls", () => {
    const tab = new ParaZkSettingTab(fakePlugin());
    const setting = renderDefinition(tab, localePack("en").labels.settingsSupportHeading);
    const links = setting.settingEl.querySelectorAll("a");

    expect(setting.heading).toBe(true);
    expect(setting.settingEl.createdDivs).toBe(1);
    expect(links.map((link) => link.attrs)).toEqual([
      expect.objectContaining({
        href: "https://github.com/sponsors/kangig94",
        target: "_blank",
        rel: "noopener",
        "aria-label": "GitHub Sponsors"
      }),
      expect.objectContaining({
        href: "https://www.buymeacoffee.com/kangig94",
        target: "_blank",
        rel: "noopener",
        "aria-label": "Buy me a coffee"
      })
    ]);
    expect(setting.settingEl.textContent).toContain("Sponsors");
    expect(setting.settingEl.querySelectorAll("img")).toHaveLength(2);
  });
});

function renderDefinition(tab: ParaZkSettingTab, name: string): FakeSetting {
  const definition = tab.getSettingDefinitions().find((candidate) => candidate.name === name);
  expect(definition, `missing setting definition: ${name}`).toBeDefined();
  const setting = new FakeSetting();
  definition?.render(setting as never);
  return setting;
}

function fakePlugin(): ParaZkPluginContext & {
  saveSettings: ReturnType<typeof vi.fn>;
  setupVault: ReturnType<typeof vi.fn>;
} {
  return {
    app: {},
    manifest: {
      id: "para-zk",
      name: "Para-ZK",
      version: "0.2.2",
      minAppVersion: "1.12.3",
      description: "",
      author: "kangig94",
      fundingUrl: "https://github.com/sponsors/kangig94"
    },
    settings: structuredClone(DEFAULT_SETTINGS),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    setupVault: vi.fn().mockResolvedValue({
      created: [],
      updated: [],
      dependencies: [],
      warnings: []
    })
  } as unknown as ParaZkPluginContext & {
    saveSettings: ReturnType<typeof vi.fn>;
    setupVault: ReturnType<typeof vi.fn>;
  };
}

class FakeSetting {
  readonly controlEl = new FakeElement();
  readonly settingEl = new FakeElement();
  readonly spans: Array<{ cls?: string; text?: string }> = [];
  dropdown: FakeDropdown | undefined;
  button: FakeButton | undefined;
  toggle: FakeToggle | undefined;
  heading = false;

  constructor() {
    this.controlEl.onSpan = (options) => this.spans.push(options);
  }

  setHeading(): this {
    this.heading = true;
    return this;
  }

  addDropdown(callback: (dropdown: FakeDropdown) => void): this {
    this.dropdown = new FakeDropdown();
    callback(this.dropdown);
    return this;
  }

  addButton(callback: (button: FakeButton) => void): this {
    this.button = new FakeButton();
    callback(this.button);
    return this;
  }

  addToggle(callback: (toggle: FakeToggle) => void): this {
    this.toggle = new FakeToggle();
    callback(this.toggle);
    return this;
  }
}

class FakeDropdown {
  readonly options: Record<string, string> = {};
  value = "";
  change: ((value: string) => Promise<void>) | undefined;

  addOption(value: string, label: string): this {
    this.options[value] = label;
    return this;
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  onChange(callback: (value: string) => Promise<void>): this {
    this.change = callback;
    return this;
  }
}

class FakeButton {
  text = "";
  cta = false;
  disabled = false;
  click: (() => void) | undefined;

  setButtonText(text: string): this {
    this.text = text;
    return this;
  }

  setCta(): this {
    this.cta = true;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }

  onClick(callback: () => void): this {
    this.click = callback;
    return this;
  }
}

class FakeToggle {
  value = false;
  change: ((value: boolean) => Promise<void>) | undefined;

  setValue(value: boolean): this {
    this.value = value;
    return this;
  }

  onChange(callback: (value: boolean) => Promise<void>): this {
    this.change = callback;
    return this;
  }
}

type FakeElementOptions = {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
  href?: string;
  type?: string;
  value?: string;
};

class FakeElement {
  createdDivs = 0;
  onSpan: ((options: { cls?: string; text?: string }) => void) | undefined;
  readonly children: FakeElement[] = [];
  readonly attrs: Record<string, string> = {};
  readonly classes = new Set<string>();
  value = "";
  checked = false;
  disabled = false;
  type = "";
  private ownText = "";

  constructor(readonly tag = "div") {}

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children.length = 0;
  }

  createSpan(options: FakeElementOptions = {}): FakeElement {
    this.onSpan?.(options);
    return this.createEl("span", options);
  }

  createDiv(options: FakeElementOptions = {}): FakeElement {
    this.createdDivs += 1;
    return this.createEl("div", options);
  }

  createEl(tag: string, options: FakeElementOptions = {}): FakeElement {
    const child = new FakeElement(tag);
    if (options.cls) child.addClass(...options.cls.split(/\s+/).filter(Boolean));
    if (options.text !== undefined) child.textContent = options.text;
    Object.assign(child.attrs, options.attr);
    if (options.href !== undefined) child.attrs.href = options.href;
    if (options.type !== undefined) {
      child.type = options.type;
      child.attrs.type = options.type;
    }
    if (options.value !== undefined) child.value = options.value;
    this.children.push(child);
    return child;
  }

  empty(): void {
    this.ownText = "";
    this.children.length = 0;
  }

  addClass(...classes: string[]): void {
    for (const className of classes) this.classes.add(className);
  }

  setAttr(key: string, value: string): void {
    this.attrs[key] = value;
  }

  setAttribute(key: string, value: string): void {
    this.setAttr(key, value);
  }

  addEventListener(): void {}

  querySelectorAll(tag: string): FakeElement[] {
    const result: FakeElement[] = [];
    for (const child of this.children) {
      if (child.tag === tag) result.push(child);
      result.push(...child.querySelectorAll(tag));
    }
    return result;
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
