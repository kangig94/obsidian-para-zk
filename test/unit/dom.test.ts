import { describe, expect, it } from "vitest";
import { createDetachedDiv, createDetachedSpan } from "../../src/ux/dom";

describe("detached Obsidian DOM helpers", () => {
  it("creates detached nodes directly in the owner's realm", () => {
    const owner = new FakeNode();

    const div = createDetachedDiv(owner.asNode(), { cls: "buffer" });
    const span = createDetachedSpan(owner.asNode(), { cls: "inline" });

    expect(owner.children).toEqual([]);
    expect((div as unknown as FakeElement).classes).toEqual(["buffer"]);
    expect((span as unknown as FakeElement).classes).toEqual(["inline"]);
    expect(owner.createdTags).toEqual(["div", "span"]);
    expect((div as unknown as FakeElement).attached).toBe(false);
    expect((span as unknown as FakeElement).attached).toBe(false);
  });
});

class FakeNode {
  readonly children: FakeElement[] = [];
  readonly createdTags: string[] = [];
  readonly win = {
    createDiv: (options?: { cls?: string }) => this.create("div", options),
    createSpan: (options?: { cls?: string }) => this.create("span", options)
  };

  asNode(): Node {
    return this as unknown as Node;
  }

  private create(tag: string, options?: { cls?: string }): FakeElement {
    this.createdTags.push(tag);
    return new FakeElement(tag, options?.cls);
  }
}

class FakeElement {
  readonly classes: string[];
  readonly attached = false;

  constructor(
    readonly tag: string,
    classes = ""
  ) {
    this.classes = classes.split(/\s+/).filter(Boolean);
  }
}
