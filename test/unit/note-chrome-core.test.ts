import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import type { ParaZkPluginContext } from "../../src/plugin-interface";
import { DEFAULT_SETTINGS } from "../../src/types";
import {
  buildCachedNoteChromeSpec,
  buildEditorNoteChromeSpec,
  hasNoteChrome
} from "../../src/ux/note-chrome-core";

describe("note chrome core", () => {
  it("splits props data changes from managed layout", () => {
    const file = testFile("PARA/Resources/Paper.md");
    let frontmatter: Record<string, unknown> = {
      type: "resource",
      url: "https://example.com/a"
    };
    const plugin = fakePlugin(file, () => frontmatter);

    const first = buildCachedNoteChromeSpec(plugin, file.path);
    expect(first).toMatchObject({
      sourcePath: file.path,
      type: "resource",
      hasProps: true,
      hasManaged: true
    });
    expect(hasNoteChrome(first)).toBe(true);

    frontmatter = {
      type: "resource",
      url: "https://example.com/b"
    };
    const second = buildCachedNoteChromeSpec(plugin, file.path);
    expect(second.propsSignature).not.toBe(first.propsSignature);
    expect(second.managedLayoutSignature).toBe(first.managedLayoutSignature);
  });

  it("does not dirty top-level chrome signatures for reference content changes", () => {
    const file = testFile("PARA/Projects/Launch.md");
    let frontmatter: Record<string, unknown> = {
      type: "project",
      status: "active",
      references: [{ link: "https://example.com/a" }]
    };
    const plugin = fakePlugin(file, () => frontmatter);

    const first = buildCachedNoteChromeSpec(plugin, file.path);
    frontmatter = {
      type: "project",
      status: "active",
      references: [
        { link: "https://example.com/a" },
        { link: "https://example.com/b" }
      ]
    };
    const second = buildCachedNoteChromeSpec(plugin, file.path);

    expect(second.propsSignature).toBe(first.propsSignature);
    expect(second.managedLayoutSignature).toBe(first.managedLayoutSignature);
  });

  it("prefers the live editor frontmatter type over stale cached metadata", () => {
    const file = testFile("PARA/Projects/Launch.md");
    const plugin = fakePlugin(file, () => ({ type: "area" }));

    const spec = buildEditorNoteChromeSpec(plugin, file, [
      "---",
      "type: project",
      "status: active",
      "---",
      "body"
    ].join("\n"));

    expect(spec.type).toBe("project");
    expect(spec.frontmatter.status).toBe("active");
    expect(spec.hasProps).toBe(true);
    expect(spec.hasManaged).toBe(true);

    const updated = buildEditorNoteChromeSpec(plugin, file, [
      "---",
      "type: project",
      "status: paused",
      "---",
      "body"
    ].join("\n"));
    expect(updated.propsSignature).not.toBe(spec.propsSignature);
    expect(updated.managedLayoutSignature).toBe(spec.managedLayoutSignature);
  });

  it("does not revive a removed live editor type from stale cached metadata", () => {
    const file = testFile("PARA/Projects/Launch.md");
    const plugin = fakePlugin(file, () => ({ type: "project" }));

    const spec = buildEditorNoteChromeSpec(plugin, file, [
      "---",
      "status: active",
      "---",
      "body"
    ].join("\n"));

    expect(spec.type).toBeUndefined();
    expect(hasNoteChrome(spec)).toBe(false);
  });

  it("does not revive removed live editor frontmatter from stale cached metadata", () => {
    const file = testFile("PARA/Projects/Launch.md");
    const plugin = fakePlugin(file, () => ({
      type: "project",
      status: "active"
    }));

    const spec = buildEditorNoteChromeSpec(plugin, file, "body only");

    expect(spec.type).toBeUndefined();
    expect(hasNoteChrome(spec)).toBe(false);
  });

  it("stays inert for ordinary notes", () => {
    const file = testFile("README.md");
    const plugin = fakePlugin(file, () => ({}));

    const spec = buildCachedNoteChromeSpec(plugin, file.path);

    expect(spec.type).toBeUndefined();
    expect(spec.hasProps).toBe(false);
    expect(spec.hasManaged).toBe(false);
    expect(hasNoteChrome(spec)).toBe(false);
  });
});

function testFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").pop() ?? path;
  file.basename = file.name.replace(/\.md$/, "");
  file.extension = "md";
  return file;
}

function fakePlugin(
  file: TFile,
  frontmatter: () => Record<string, unknown>
): ParaZkPluginContext {
  return {
    app: {
      vault: {
        getFileByPath: (path: string) => (path === file.path ? file : null)
      },
      metadataCache: {
        getFileCache: (candidate: TFile) => (
          candidate.path === file.path ? { frontmatter: frontmatter() } : null
        )
      }
    },
    settings: DEFAULT_SETTINGS
  } as unknown as ParaZkPluginContext;
}
