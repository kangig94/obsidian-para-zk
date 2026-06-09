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

describe("CitationSuggest", () => {
  it("triggers on PZ[ before the cursor without swallowing a following bracket", async () => {
    const app = new MockApp();
    const file = await app.vault.create("Source.md", "---\nreferences: []\n---\n");
    const suggest = new CitationSuggest(fakePlugin(app));
    const line = "Before PZ[ali] after";
    const cursor = { line: 0, ch: "Before PZ[ali".length };
    const editor = fakeEditor(line);

    const trigger = suggest.onTrigger(cursor, editor, file);

    expect(trigger).toEqual({
      start: { line: 0, ch: "Before ".length },
      end: cursor,
      query: "ali"
    });
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
    suggest.context = suggestContext;

    suggest.selectSuggestion(suggestions[0], {} as KeyboardEvent);
    await waitFor(() => editor.replacement !== undefined);

    const token = editor.replacement ?? "";
    const id = token.match(/^`PZ\[([A-Za-z0-9_-]+)\]`$/)?.[1];
    expect(id).toBeTruthy();
    expect(token).toBe(`\`PZ[${id}]\``);
    expect(editor.cursor).toEqual({ line: 0, ch: 5 + token.length });
    expect(app.readPath("Legacy.md")).toContain(`id: ${id}`);
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
