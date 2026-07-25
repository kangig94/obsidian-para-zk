import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const skill = readFileSync(
  path.resolve("clients/skills/import-resource/SKILL.md"),
  "utf8"
);
const latexReference = readFileSync(
  path.resolve("clients/skills/import-resource/references/latex.md"),
  "utf8"
);

describe("import-resource skill contract", () => {
  it("preserves source intent instead of requiring verbatim surface text", () => {
    expect(skill).toContain("**Faithful** (default)");
    expect(skill).toContain("preserves the author's intent");
    expect(skill).toContain("exact bytes and incidental source syntax are not the preservation target");
    expect(skill).not.toContain("**Verbatim** (default)");
  });

  it("routes LaTeX imports through the compatibility reference", () => {
    expect(skill).toContain("[references/latex.md](references/latex.md)");
    expect(skill).not.toContain("references/math.md");
    expect(skill).not.toContain("reject `\\bm`");
    expect(skill).not.toContain("a KaTeX-only check is");
    expect(skill).not.toContain("no `\\(...\\)` or standalone");
    expect(latexReference).toContain("Replace every `\\bm` command with `\\boldsymbol`");
    expect(latexReference).toContain(String.raw`\left[c\right] & d`);
  });

  it("documents the matrix preflight and final Obsidian MathJax verification", () => {
    expect(latexReference).toContain(String.raw`rg -n -U '\\\\\s*\[' <draft.md>`);
    expect(latexReference).toContain("intentional TeX length such as `[4pt]` or");
    expect(latexReference).toContain("A KaTeX parse or preview is useful only as a preflight");
    expect(latexReference).toContain("open the actual note in Obsidian Reading view or Live Preview");
  });
});
