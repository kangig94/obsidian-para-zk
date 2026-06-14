import { describe, expect, it } from "vitest";
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  TFile
} from "obsidian";
import { CitationSuggest } from "../../src/ux/citation-suggest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import type { AnchorSuggestion } from "../../src/ux/anchor-suggestions";
import { DEFAULT_SETTINGS } from "../../src/types";
import { MockApp } from "../harness/vault";
import { expectGeneratedReferenceId } from "./reference-id-test-helpers";

describe("CitationSuggest", () => {
  it("triggers inside an open backtick code span", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "Before `PZ[ali";

    expect(suggest.onTrigger({ line: 0, ch: line.length }, fakeEditor(line), file)).toEqual({
      start: { line: 0, ch: line.indexOf("ali") },
      end: { line: 0, ch: line.length },
      query: "ali"
    });
  });

  it("ignores a bare PZ[ without a leading backtick", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "Before PZ[ali";

    expect(suggest.onTrigger({ line: 0, ch: line.length }, fakeEditor(line), file)).toBeNull();
  });

  it("still triggers when the cursor sits before the closing bracket", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "`PZ[ali]`";

    // cursor between "ali" and "]" — the spot left after picking a reference.
    expect(suggest.onTrigger({ line: 0, ch: "`PZ[ali".length }, fakeEditor(line), file)).toEqual({
      start: { line: 0, ch: "`PZ[".length },
      end: { line: 0, ch: "`PZ[ali".length },
      query: "ali"
    });
  });

  it("does not trigger once the cursor is past the closing bracket", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "`PZ[ali]`";

    expect(suggest.onTrigger({ line: 0, ch: "`PZ[ali]".length }, fakeEditor(line), file)).toBeNull();
  });

  it("switches to a section query after a # following the id", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "`PZ[ref1#Tra";

    // The query is the section text after `#`, not the whole "ref1#Tra" entry.
    expect(suggest.onTrigger({ line: 0, ch: line.length }, fakeEditor(line), file)).toEqual({
      start: { line: 0, ch: line.indexOf("Tra") },
      end: { line: 0, ch: line.length },
      query: "Tra"
    });
  });

  it("does not trigger without a file", () => {
    const app = new MockApp();
    const suggest = new CitationSuggest(fakePlugin(app));

    expect(suggest.onTrigger({ line: 0, ch: "`PZ[".length }, fakeEditor("`PZ["), null)).toBeNull();
  });

  it("filters suggestions by title, description, and link in registry order", async () => {
    const app = new MockApp();
    await app.vault.create("Target.md", "---\ntype: resource\n---\n");
    const file = await app.vault.create("Source.md", [
      "---",
      "references:",
      "  - link: '[[Target.md|Alias Paper]]'",
      "    id: alias1",
      "    description: Primary source",
      "  - link: https://example.com/other",
      "    id: other2",
      "---",
      ""
    ].join("\n"));
    const suggest = new CitationSuggest(fakePlugin(app));

    expect((await suggest.getSuggestions(context(file, "", fakeEditor("`PZ[")))).map(referenceId))
      .toEqual(["alias1", "other2"]);
    expect((await suggest.getSuggestions(context(file, "alias", fakeEditor("`PZ[alias")))).map(referenceId))
      .toEqual(["alias1"]);
    expect((await suggest.getSuggestions(context(file, "primary", fakeEditor("`PZ[primary")))).map(referenceId))
      .toEqual(["alias1"]);
    expect((await suggest.getSuggestions(context(file, "example.com/other", fakeEditor("`PZ[example")))).map(referenceId))
      .toEqual(["other2"]);
  });

  it("renders the current index, title, description, and link of a reference suggestion", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", [
      "---",
      "references:",
      "  - link: https://example.com/a",
      "    id: alpha1",
      "  - link: https://example.com/b",
      "    id: beta22",
      "    description: Beta source",
      "---",
      ""
    ].join("\n"));
    const suggest = new CitationSuggest(fakePlugin(app));
    const suggestions = await suggest.getSuggestions(context(file, "beta", fakeEditor("`PZ[beta")));
    const el = fakeSuggestionElement();

    suggest.renderSuggestion(suggestions[0], el.host);

    expect(el.classes).toContain("para-zk-reference-suggestion");
    expect(el.children.map((child) => child.text)).toEqual([
      "[1] https://example.com/b",
      "Beta source",
      "https://example.com/b"
    ]);
  });

  it("renders a heading suggestion as label and detail", () => {
    const app = new MockApp();
    const suggest = new CitationSuggest(fakePlugin(app));
    const el = fakeSuggestionElement();

    suggest.renderSuggestion({ kind: "heading", anchor: headingAnchor("Training Loop") }, el.host);

    expect(el.classes).toContain("para-zk-reference-suggestion");
    expect(el.children.map((child) => child.text)).toEqual(["Training Loop", "H2"]);
  });

  it("inserts <id>] and a closing backtick, absorbing the auto-paired backtick without nesting", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Legacy.md", [
      "---",
      "references:",
      "  - link: https://example.com/legacy",
      "    description: Legacy source",
      "---",
      "Body"
    ].join("\n"));
    const suggest = new CitationSuggest(fakePlugin(app));
    // Obsidian auto-pairs the opening backtick, so the closing one already follows the cursor.
    const editor = fakeEditor("Body `PZ[legacy`");
    const start = { line: 0, ch: "Body `PZ[".length };
    const end = { line: 0, ch: "Body `PZ[legacy".length };
    const suggestContext = context(file, "legacy", editor, start, end);
    const suggestions = await suggest.getSuggestions(suggestContext);
    expect(referenceId(suggestions[0])).toBeNull();
    suggest.context = suggestContext;

    suggest.selectSuggestion(suggestions[0], {} as KeyboardEvent);
    await waitFor(() => editor.replacement !== undefined);

    const id = editor.line.match(/`PZ\[([A-Za-z0-9_-]+)\]`$/)?.[1];
    expectGeneratedReferenceId(id);
    expect(editor.line).toBe(`Body \`PZ[${id}]\``);
    expect(editor.cursor).toEqual({ line: 0, ch: start.ch + (id ?? "").length });
    expect(app.readPath("Legacy.md")).toContain(`id: ${id}`);
  });

  it("inserts a chosen heading after the #, closing and stepping past the token", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const editor = fakeEditor("`PZ[ref1#Tra]`");
    const start = { line: 0, ch: "`PZ[ref1#".length };
    const end = { line: 0, ch: "`PZ[ref1#Tra".length };
    suggest.context = context(file, "Tra", editor, start, end);

    suggest.selectSuggestion({ kind: "heading", anchor: headingAnchor("Training Loop") }, {} as KeyboardEvent);

    expect(editor.line).toBe("`PZ[ref1#Training Loop]`");
    // Past the closing "]`" so the suggester dismisses — the section is the terminal step.
    expect(editor.cursor).toEqual({ line: 0, ch: editor.line.length });
  });

  it("closes a hand-typed section into a valid token when no bracket follows", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    // User typed `PZ[ref1# directly: the auto-paired backtick follows, but no "]" exists yet.
    const editor = fakeEditor("`PZ[ref1#`");
    const start = { line: 0, ch: "`PZ[ref1#".length };
    const end = start;
    suggest.context = context(file, "", editor, start, end);

    suggest.selectSuggestion({ kind: "heading", anchor: headingAnchor("Training Loop") }, {} as KeyboardEvent);

    expect(editor.line).toBe("`PZ[ref1#Training Loop]`");
  });

  it("appends a closing bracket and backtick when none follow the picked reference", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Legacy.md", [
      "---",
      "references:",
      "  - link: https://example.com/legacy",
      "---",
      "Body"
    ].join("\n"));
    const suggest = new CitationSuggest(fakePlugin(app));
    // No auto-paired backtick and no "]" after the cursor.
    const editor = fakeEditor("Body `PZ[legacy");
    const start = { line: 0, ch: "Body `PZ[".length };
    const end = { line: 0, ch: "Body `PZ[legacy".length };
    const suggestContext = context(file, "legacy", editor, start, end);
    const suggestions = await suggest.getSuggestions(suggestContext);
    suggest.context = suggestContext;

    suggest.selectSuggestion(suggestions[0], {} as KeyboardEvent);
    await waitFor(() => editor.replacement !== undefined);

    const id = editor.line.match(/`PZ\[([A-Za-z0-9_-]+)\]`$/)?.[1];
    expectGeneratedReferenceId(id);
    expect(editor.line).toBe(`Body \`PZ[${id}]\``);
    expect(editor.cursor).toEqual({ line: 0, ch: start.ch + (id ?? "").length });
  });

  it("does not trigger when a backtick sits between PZ[ and the cursor", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "`PZ[ali`";

    expect(suggest.onTrigger({ line: 0, ch: line.length }, fakeEditor(line), file)).toBeNull();
  });

  it("reads the id from a non-first multi-cite entry in heading mode", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "`PZ[a1, b2#Sec";

    expect(suggest.onTrigger({ line: 0, ch: line.length }, fakeEditor(line), file)).toEqual({
      start: { line: 0, ch: line.indexOf("Sec") },
      end: { line: 0, ch: line.length },
      query: "Sec"
    });
  });

  it("returns no heading suggestions for a url reference", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", [
      "---",
      "references:",
      "  - link: https://example.com/a",
      "    id: url1",
      "---",
      ""
    ].join("\n"));
    const suggest = new CitationSuggest(fakePlugin(app));
    const editor = fakeEditor("`PZ[url1#Sec");
    // onTrigger sets heading mode + referenceId="url1" from the open token.
    suggest.onTrigger({ line: 0, ch: editor.line.length }, editor, file);

    expect(await suggest.getSuggestions(context(file, "Sec", editor))).toEqual([]);
  });

  it("does not edit the stale editor when context changes before id persistence resolves", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Legacy.md", [
      "---",
      "references:",
      "  - link: https://example.com/legacy",
      "    description: Legacy source",
      "---",
      "Body"
    ].join("\n"));
    const originalProcessFrontMatter = app.fileManager.processFrontMatter;
    let releaseWrite: (() => void) | undefined;
    app.fileManager.processFrontMatter = async (target, fn) => {
      await new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      await originalProcessFrontMatter(target, fn);
    };
    const suggest = new CitationSuggest(fakePlugin(app));
    const editor = fakeEditor("Body `PZ[legacy`");
    const suggestContext = context(file, "legacy", editor, { line: 0, ch: 9 }, { line: 0, ch: 15 });
    const suggestions = await suggest.getSuggestions(suggestContext);
    suggest.context = suggestContext;

    suggest.selectSuggestion(suggestions[0], {} as KeyboardEvent);
    await waitFor(() => releaseWrite !== undefined);
    suggest.context = null;
    releaseWrite?.();
    await waitFor(() => app.readPath("Legacy.md")?.includes("id:") === true);

    expect(editor.replacement).toBeUndefined();
    expect(editor.cursor).toBeUndefined();
  });
});

function referenceId(suggestion: Awaited<ReturnType<CitationSuggest["getSuggestions"]>>[number]): string | null {
  return suggestion.kind === "reference" ? suggestion.reference.id : null;
}

function headingAnchor(value: string): AnchorSuggestion {
  return { kind: "heading", value, label: value, detail: "H2", line: 0, level: 2, searchText: value };
}

function fakePlugin(app: MockApp): ParaZkPluginContext {
  return {
    app,
    settings: DEFAULT_SETTINGS,
    saveSettings: async () => {},
    setupVault: async () => {
      throw new Error("setupVault is not available in unit tests");
    }
  } as unknown as ParaZkPluginContext;
}

function context(
  file: TFile,
  query: string,
  editor: FakeEditor,
  start: EditorPosition = { line: 0, ch: 0 },
  end: EditorPosition = { line: 0, ch: editor.line.length }
): EditorSuggestContext {
  return {
    editor,
    file,
    start,
    end,
    query
  } as unknown as EditorSuggestContext;
}

type FakeEditor = Editor & {
  line: string;
  replacement?: string;
  cursor?: EditorPosition;
};

function fakeEditor(line: string): FakeEditor {
  return {
    line,
    getLine() {
      return this.line;
    },
    replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition) {
      const end = to ?? from;
      this.line = this.line.slice(0, from.ch) + replacement + this.line.slice(end.ch);
      this.replacement = replacement;
    },
    setCursor(pos: EditorPosition) {
      this.cursor = pos;
    }
  } as unknown as FakeEditor;
}

function fakeSuggestionElement(): {
  host: HTMLElement;
  classes: string[];
  children: Array<{ cls?: string; text?: string }>;
} {
  const classes: string[] = [];
  const children: Array<{ cls?: string; text?: string }> = [];
  return {
    host: {
      addClass: (cls: string) => classes.push(cls),
      createDiv: (options: { cls?: string; text?: string }) => {
        children.push(options);
        return {
          addClass: () => {},
          style: {}
        };
      }
    } as unknown as HTMLElement,
    classes,
    children
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}
