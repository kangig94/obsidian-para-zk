import { describe, expect, it } from "vitest";
import {
  editableBodyRange,
  stripManagedPrelude,
  stripManagedScaffolding,
  trailingManagedBlockStart
} from "../../src/vault/sections";

describe("sections managed block safety net", () => {
  it("keeps a fenceless frontmatter-backed body intact", () => {
    const content = [
      "---",
      "type: project",
      "title: Fenceless",
      "---",
      "",
      "# Summary",
      "",
      "Real body content.",
      "",
      "## Notes",
      "- keep everything",
      ""
    ].join("\n");
    const expectedBody = [
      "# Summary",
      "",
      "Real body content.",
      "",
      "## Notes",
      "- keep everything"
    ].join("\n");
    const bodyStart = content.indexOf("# Summary");
    const bodyEnd = content.indexOf("- keep everything") + "- keep everything".length;

    expect(stripManagedPrelude(content)).toBe(expectedBody);
    expect(stripManagedScaffolding(content)).toBe(content);

    const editable = editableBodyRange(content);
    expect(editable).toEqual({ start: bodyStart, end: bodyEnd });
    expect(content.slice(editable.start, editable.end)).toBe(expectedBody);
    expect(trailingManagedBlockStart(content, bodyStart, content.length)).toBeUndefined();
  });

  it("strips only legacy leading props and trailing managed fences", () => {
    const content = [
      "---",
      "type: project",
      "title: Legacy",
      "---",
      "",
      "```para-zk-props",
      "title: Legacy",
      "status: active",
      "```",
      "",
      "# Summary",
      "",
      "Keep this body.",
      "",
      "## Details",
      "- still editable",
      "",
      "```para-zk-managed",
      "```",
      ""
    ].join("\n");
    const expectedBody = [
      "# Summary",
      "",
      "Keep this body.",
      "",
      "## Details",
      "- still editable"
    ].join("\n");
    const expectedScaffoldStripped = [
      "---",
      "type: project",
      "title: Legacy",
      "---",
      "# Summary",
      "",
      "Keep this body.",
      "",
      "## Details",
      "- still editable"
    ].join("\n");
    const bodyStart = content.indexOf("# Summary");
    const bodyEnd = content.indexOf("- still editable") + "- still editable".length;
    const tailStart = content.indexOf("\n\n```para-zk-managed");

    expect(stripManagedPrelude(content)).toBe(expectedBody);
    expect(stripManagedScaffolding(content)).toBe(expectedScaffoldStripped);
    expect(stripManagedScaffolding(expectedScaffoldStripped)).toBe(expectedScaffoldStripped);

    const editable = editableBodyRange(content);
    expect(editable).toEqual({ start: bodyStart, end: bodyEnd });
    expect(content.slice(editable.start, editable.end)).toBe(expectedBody);
    expect(trailingManagedBlockStart(content, bodyStart, content.length)).toBe(tailStart);
  });

  it("keeps a mid-body managed fence inside the editable body", () => {
    const content = [
      "---",
      "type: project",
      "title: Mid Body",
      "---",
      "",
      "# Summary",
      "",
      "Before managed block.",
      "",
      "```para-zk-managed",
      "```",
      "",
      "After managed block.",
      ""
    ].join("\n");
    const expectedBody = [
      "# Summary",
      "",
      "Before managed block.",
      "",
      "```para-zk-managed",
      "```",
      "",
      "After managed block."
    ].join("\n");
    const bodyStart = content.indexOf("# Summary");
    const bodyEnd = content.indexOf("After managed block.") + "After managed block.".length;

    expect(trailingManagedBlockStart(content, bodyStart, content.length)).toBeUndefined();

    const editable = editableBodyRange(content);
    expect(editable).toEqual({ start: bodyStart, end: bodyEnd });
    expect(content.slice(editable.start, editable.end)).toBe(expectedBody);
  });
});
