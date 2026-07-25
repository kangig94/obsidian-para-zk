type DivOptions = Parameters<Node["createDiv"]>[0];
type SpanOptions = Parameters<Node["createSpan"]>[0];
type ObsidianDomWindow = Window & {
  createDiv: Node["createDiv"];
  createSpan: Node["createSpan"];
};

export function createDetachedDiv(owner: Node, options?: DivOptions): HTMLDivElement {
  return (owner.win as ObsidianDomWindow).createDiv(options);
}

export function createDetachedSpan(owner: Node, options?: SpanOptions): HTMLSpanElement {
  return (owner.win as ObsidianDomWindow).createSpan(options);
}
