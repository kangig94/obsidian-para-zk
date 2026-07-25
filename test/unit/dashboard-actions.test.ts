import { describe, expect, it } from "vitest";
import { localePack } from "../../src/i18n";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { registerDashboardActionRenderers } from "../../src/ux/actions/dashboard";

describe("dashboard action rendering", () => {
  it("appends exactly one button per action in declaration order", () => {
    let processor: ((source: string, el: HTMLElement, ctx: { sourcePath: string }) => void) | undefined;
    const plugin = {
      app: {
        workspace: {
          openLinkText: () => Promise.resolve()
        }
      },
      settings: structuredClone(DEFAULT_SETTINGS),
      registerMarkdownCodeBlockProcessor: (
        _language: string,
        callback: (source: string, el: HTMLElement, ctx: { sourcePath: string }) => void
      ) => {
        processor = callback;
      }
    } as unknown as ParaZkPluginContext;
    const root = new FakeElement("div");

    registerDashboardActionRenderers(plugin);
    processor?.("", root.asHtml(), { sourcePath: "Dashboard.md" });

    const labels = localePack("en").labels;
    const controls = root.querySelectorAll(".para-zk-action-panel-controls");
    expect(controls).toHaveLength(2);
    expect(controls[0]?.elementChildren().map((child) => child.tagName)).toEqual(Array(6).fill("button"));
    expect(controls[1]?.elementChildren().map((child) => child.tagName)).toEqual(Array(6).fill("button"));
    expect(controls[0]?.elementChildren().map((child) => child.textContent)).toEqual([
      labels.homeNewProject,
      labels.homeNewArea,
      labels.homeNewResource,
      labels.homeNewZk,
      labels.openJournalCommandName,
      labels.captureJournalCommandName
    ]);
    expect(root.querySelectorAll(".para-zk-dashboard-action")).toHaveLength(12);
  });
});

type FakeChild = FakeElement | string;

class FakeElement {
  readonly classes = new Set<string>();
  readonly attrs = new Map<string, string>();
  private children: FakeChild[] = [];

  constructor(readonly tagName: string) {}

  get textContent(): string {
    return this.children.map((child) => typeof child === "string" ? child : child.textContent).join("");
  }

  set textContent(value: string) {
    this.children = value ? [value] : [];
  }

  createDiv(options?: { cls?: string; text?: string }): FakeElement {
    return this.createEl("div", options);
  }

  createEl(tag: string, options?: { cls?: string; text?: string }): FakeElement {
    const child = new FakeElement(tag);
    if (options?.cls) child.addClass(...options.cls.split(/\s+/).filter(Boolean));
    if (options?.text !== undefined) child.textContent = options.text;
    this.children.push(child);
    return child;
  }

  elementChildren(): FakeElement[] {
    return this.children.filter((child): child is FakeElement => typeof child !== "string");
  }

  empty(): void {
    this.children = [];
  }

  addClass(...classes: string[]): void {
    for (const className of classes) this.classes.add(className);
  }

  setAttr(key: string, value: string): void {
    this.attrs.set(key, value);
  }

  addEventListener(): void {}

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    for (const child of this.elementChildren()) {
      if (selector.startsWith(".") && child.classes.has(selector.slice(1))) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  asHtml(): HTMLElement {
    return this as unknown as HTMLElement;
  }
}
