import { describe, expect, it } from "vitest";
import {
  placeReadingManagedPanel,
  placeReadingPropsPanel
} from "../../src/ux/blocks/reading-note-chrome-slots";

describe("reading note chrome slots", () => {
  it("places props inside the reading header", () => {
    const container = new SlotElement("sizer");
    const header = new SlotElement("header", ["mod-header"]);
    const props = new SlotElement("props", ["para-zk-note-chrome--props"]);
    container.appendChild(header);

    placeReadingPropsPanel(container.asHtml(), props.asHtml());

    expect(header.lastElementChild).toBe(props);
    expect(props.parentElement).toBe(header);
  });

  it("removes props when the reading header is not mounted", () => {
    const container = new SlotElement("sizer");
    const props = new SlotElement("props", ["para-zk-note-chrome--props"]);
    container.appendChild(props);

    placeReadingPropsPanel(container.asHtml(), props.asHtml());

    expect(props.parentElement).toBeNull();
    expect(container.children).not.toContain(props);
  });

  it("places managed inside the reading footer when available", () => {
    const container = new SlotElement("sizer");
    const footer = new SlotElement("footer", ["mod-footer"]);
    const managed = new SlotElement("managed", ["para-zk-note-chrome--managed"]);
    const existing = new SlotElement("existing");
    footer.appendChild(existing);
    container.appendChild(footer);

    placeReadingManagedPanel(container.asHtml(), managed.asHtml());

    expect(footer.firstElementChild).toBe(managed);
    expect(managed.parentElement).toBe(footer);
  });

  it("places managed at the bottom when the footer is not mounted", () => {
    const container = new SlotElement("sizer");
    const body = new SlotElement("body");
    const managed = new SlotElement("managed", ["para-zk-note-chrome--managed"]);
    container.appendChild(body);

    placeReadingManagedPanel(container.asHtml(), managed.asHtml());

    expect(container.lastElementChild).toBe(managed);
    expect(managed.parentElement).toBe(container);
  });
});

class SlotElement {
  readonly children: SlotElement[] = [];
  parentElement: SlotElement | null = null;

  constructor(
    readonly name: string,
    readonly classes: string[] = []
  ) {}

  get firstElementChild(): SlotElement | null {
    return this.children[0] ?? null;
  }

  get lastElementChild(): SlotElement | null {
    return this.children[this.children.length - 1] ?? null;
  }

  appendChild(child: SlotElement): SlotElement {
    child.remove();
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  prepend(child: SlotElement): void {
    child.remove();
    this.children.unshift(child);
    child.parentElement = this;
  }

  remove(): void {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index !== -1) siblings.splice(index, 1);
    this.parentElement = null;
  }

  querySelector(selector: string): SlotElement | null {
    if (selector === ":scope > .mod-header") {
      return this.children.find((child) => child.classes.includes("mod-header")) ?? null;
    }
    if (selector === ":scope > .mod-footer") {
      return this.children.find((child) => child.classes.includes("mod-footer")) ?? null;
    }
    throw new Error(`unexpected selector: ${selector}`);
  }

  asHtml(): HTMLElement {
    return this as unknown as HTMLElement;
  }
}
