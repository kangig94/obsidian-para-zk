import { describe, expect, it } from "vitest";
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  TFile
} from "obsidian";
import { CitationSuggest } from "../../src/ux/citation-suggest";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import { MockApp } from "../harness/vault";
import { expectGeneratedReferenceId } from "./reference-id-test-helpers";

describe("CitationSuggest", () => {
  it("triggers on PZ[ before the cursor", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "Before PZ[ali";
    const cursor = { line: 0, ch: "Before PZ[ali".length };
    const editor = fakeEditor(line);

    const trigger = suggest.onTrigger(cursor, editor, file);

    expect(trigger).toEqual({
      start: { line: 0, ch: "Before ".length },
      end: cursor,
      query: "ali"
    });
  });

  it("does not trigger without an open PZ[ token at the cursor", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));

    expect(suggest.onTrigger({ line: 0, ch: "Before ".length }, fakeEditor("Before PZ[ali"), file))
      .toBeNull();
  });

  it("does not trigger inside an already closed PZ token", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "Before PZ[ali] after";

    expect(suggest.onTrigger({ line: 0, ch: "Before PZ[ali".length }, fakeEditor(line), file))
      .toBeNull();
  });

  it("does not trigger without a file", () => {
    const app = new MockApp();
    const suggest = new CitationSuggest(fakePlugin(app));

    expect(suggest.onTrigger({ line: 0, ch: "PZ[".length }, fakeEditor("PZ["), null))
      .toBeNull();
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

    expect(suggest.getSuggestions(context(file, "", fakeEditor("PZ["))).map((reference) => reference.id))
      .toEqual(["alias1", "other2"]);
    expect(suggest.getSuggestions(context(file, "alias", fakeEditor("PZ[alias"))).map((reference) => reference.id))
      .toEqual(["alias1"]);
    expect(suggest.getSuggestions(context(file, "primary", fakeEditor("PZ[primary"))).map((reference) => reference.id))
      .toEqual(["alias1"]);
    expect(suggest.getSuggestions(context(file, "example.com/other", fakeEditor("PZ[example"))).map((reference) => reference.id))
      .toEqual(["other2"]);
  });

  it("renders the current index, title, description, and link", async () => {
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
    const suggestions = suggest.getSuggestions(context(file, "beta", fakeEditor("PZ[beta")));
    const el = fakeSuggestionElement();

    suggest.renderSuggestion(suggestions[0], el.host);

    expect(el.classes).toContain("para-zk-reference-suggestion");
    expect(el.children.map((child) => child.text)).toEqual([
      "[1] https://example.com/b",
      "Beta source",
      "https://example.com/b"
    ]);
  });

  it("renders an unindexed suggestion without a registry position prefix", () => {
    const app = new MockApp();
    const suggest = new CitationSuggest(fakePlugin(app));
    const el = fakeSuggestionElement();

    suggest.renderSuggestion({
      id: null,
      link: "https://example.com/unindexed",
      kind: "url",
      target: "https://example.com/unindexed"
    }, el.host);

    expect(el.children.map((child) => child.text)).toEqual([
      "https://example.com/unindexed",
      "https://example.com/unindexed"
    ]);
  });

  it("persists a missing reference id before inserting the citation token", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Legacy.md", [
      "---",
      "references:",
      "  - link: https://example.com/legacy",
      "    description: Legacy source",
      "---",
      "Body"
    ].join("\n"));
    const plugin = fakePlugin(app);
    const suggest = new CitationSuggest(plugin);
    const editor = fakeEditor("Body PZ[legacy");
    const suggestContext = context(file, "legacy", editor, { line: 0, ch: 5 }, { line: 0, ch: 14 });
    const suggestions = suggest.getSuggestions(suggestContext);
    expect(suggestions[0].id).toBeNull();
    suggest.context = suggestContext;

    suggest.selectSuggestion(suggestions[0], {} as KeyboardEvent);
    await waitFor(() => editor.replacement !== undefined);

    const token = editor.replacement ?? "";
    const id = token.match(/^`PZ\[([A-Za-z0-9_-]+)\]`$/)?.[1];
    expectGeneratedReferenceId(id);
    expect(token).toBe(`\`PZ[${id}]\``);
    expect(editor.cursor).toEqual({ line: 0, ch: 5 + token.length });
    expect(app.readPath("Legacy.md")).toContain(`id: ${id}`);
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
    const editor = fakeEditor("Body PZ[legacy");
    const suggestContext = context(file, "legacy", editor, { line: 0, ch: 5 }, { line: 0, ch: 14 });
    const suggestions = suggest.getSuggestions(suggestContext);
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
    getLine: () => line,
    replaceRange(replacement: string) {
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
