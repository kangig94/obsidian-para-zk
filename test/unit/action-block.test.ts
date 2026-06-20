import { describe, it, expect } from "vitest";
import { readActionBlockActions } from "../../src/ux/blocks/action";

describe("readActionBlockActions", () => {
  it("parses one command|icon|label per line", () => {
    const actions = readActionBlockActions("create-subnote|file-plus|Create subnote");
    expect(actions).toEqual([{ command: "create-subnote", icon: "file-plus", label: "Create subnote" }]);
  });

  it("parses multiple lines and skips blank lines", () => {
    const source = "discard-spark|trash-2|Discard\n\ndistill-spark|arrow-up-right|Distill to Permanent\n";
    expect(readActionBlockActions(source)).toEqual([
      { command: "discard-spark", icon: "trash-2", label: "Discard" },
      { command: "distill-spark", icon: "arrow-up-right", label: "Distill to Permanent" }
    ]);
  });

  it("keeps pipes in the label (only the first two pipes are separators)", () => {
    expect(readActionBlockActions("cmd|icon|Archive | Restore")).toEqual([
      { command: "cmd", icon: "icon", label: "Archive | Restore" }
    ]);
  });

  it("trims whitespace around each field", () => {
    expect(readActionBlockActions("  cmd | icon | Label  ")).toEqual([
      { command: "cmd", icon: "icon", label: "Label" }
    ]);
  });

  it("allows an empty icon or empty label", () => {
    expect(readActionBlockActions("cmd||")).toEqual([{ command: "cmd", icon: "", label: "" }]);
  });

  it("skips malformed lines (fewer than two pipes or an empty command)", () => {
    const source = ["plain text", "cmd|only-one-pipe", "|icon|missing command", "   ", "ok|i|L"].join("\n");
    expect(readActionBlockActions(source)).toEqual([{ command: "ok", icon: "i", label: "L" }]);
  });

  it("returns an empty array for empty source", () => {
    expect(readActionBlockActions("")).toEqual([]);
  });
});
