import { describe, expect, it } from "vitest";
import { renderCliText } from "../../src/cli/text-output";

// Direct tests over the pure renderer: each constructed envelope mirrors a real
// command payload, so every distinctive output shape (pagination hints, the
// AMBIGUOUS finding line, exact-key reads, collection pages, candidates, describe,
// appended warnings) is asserted without driving the whole CLI harness.

describe("renderCliText", () => {
  describe("audit", () => {
    it("renders the count header, groups findings by path, and shows the resolved arrow", () => {
      const text = renderCliText("para-zk:audit", {
        ok: true,
        counts: { bare_reference: 1 },
        count: 1, offset: 0, limit: 50, returned: 1, has_more: false,
        findings: [
          { code: "bare_reference", path: "Note.md", detail: { index: 0, link: "[[X]]", base: "X", resolved: "P/X.md" }, fix: "..." }
        ],
        fixed: [{ code: "bare_reference", path: "Note.md", action: "expandBareReferenceLinks" }]
      }, "vault audited");

      expect(text).toContain("bare_reference: 1");
      expect(text).toContain("Note.md");
      expect(text).toContain("[[X]] -> P/X.md");
      expect(text).toContain("fixed: expandBareReferenceLinks (1)");
      expect(text).not.toContain("vault audited");
    });

    it("renders an ambiguous finding with its candidates", () => {
      const text = renderCliText("para-zk:audit", {
        ok: true,
        counts: { bare_reference: 1 },
        count: 1, offset: 0, limit: 50, returned: 1, has_more: false,
        findings: [
          { code: "bare_reference", path: "Note.md", detail: { link: "[[X]]", base: "X", ambiguous: true, candidates: ["P/X.md", "Q/X.md"] }, fix: "Ambiguous..." }
        ]
      }, "vault audited");

      expect(text).toContain("[[X]]  AMBIGUOUS (2: P/X.md, Q/X.md)");
    });

    it("prefixes the check code only when findings span multiple codes", () => {
      const single = renderCliText("para-zk:audit", {
        ok: true, counts: { bare_reference: 1 }, count: 1, offset: 0, limit: 50, returned: 1, has_more: false,
        findings: [
          { code: "bare_reference", path: "A.md", detail: { link: "[[X]]", resolved: "P/X.md" }, fix: "..." },
          "not-a-record"
        ]
      }, "vault audited");
      expect(single).not.toContain("[bare_reference]");

      const mixed = renderCliText("para-zk:audit", {
        ok: true, counts: { bare_reference: 1, broken_link: 1 }, count: 2, offset: 0, limit: 50, returned: 2, has_more: false,
        findings: [
          { code: "bare_reference", path: "A.md", detail: { link: "[[X]]", resolved: "P/X.md" }, fix: "..." },
          { code: "broken_link", path: "A.md", detail: { link: "[[Y]]" }, fix: "..." }
        ]
      }, "vault audited");
      expect(mixed).toContain("[bare_reference]");
      expect(mixed).toContain("[broken_link]");
    });

    it("emits a pagination hint when more findings remain", () => {
      const text = renderCliText("para-zk:audit", {
        ok: true, counts: { bare_reference: 5 }, count: 5, offset: 0, limit: 2, returned: 2, has_more: true,
        findings: [
          { code: "bare_reference", path: "A.md", detail: { link: "[[X]]", resolved: "P/X.md" }, fix: "..." },
          { code: "bare_reference", path: "B.md", detail: { link: "[[Y]]", resolved: "P/Y.md" }, fix: "..." }
        ]
      }, "vault audited");

      expect(text).toContain("… +3 more (2/5; offset/limit or limit=all)");
    });

    it("reports a clean vault as 'no findings'", () => {
      const text = renderCliText("para-zk:audit", {
        ok: true, counts: {}, count: 0, offset: 0, limit: 50, returned: 0, has_more: false, findings: []
      }, "vault audited");
      expect(text).toBe("no findings");
    });
  });

  describe("read", () => {
    it("renders an exact string key after a path · key header", () => {
      const text = renderCliText("para-zk:read-project", {
        ok: true, mode: "exact", path: "P/A.md", type: "project", key: "summary", value: "line one\nline two"
      }, "project read");

      const lines = text.split("\n");
      expect(lines[0]).toBe("project  P/A.md  ·  summary");
      expect(text).toContain("line one");
      expect(text).toContain("line two");
      expect(text).not.toContain("project read");
    });

    it("renders a collection-page value as a counted list", () => {
      const text = renderCliText("para-zk:read-resource", {
        ok: true, mode: "exact", path: "P/A.md", type: "resource", key: "references",
        value: { count: 2, offset: 0, limit: 50, returned: 2, has_more: false, items: { aaa: { link: "[[X]]", id: "aaa", description: "desc X" }, bbb: { link: "[[Y]]", id: "bbb" } } }
      }, "resource read");

      expect(text).toContain("2 items");
      expect(text).toContain("aaa  [[X]]  —  desc X");
      expect(text).toContain("bbb  [[Y]]");
    });

    it("renders a compact surface with section/collection summaries", () => {
      const text = renderCliText("para-zk:read-project", {
        ok: true, mode: "compact", path: "P/A.md", type: "project",
        frontmatter: { status: "in_progress", tags: ["a", "b"] },
        body: { chars: 42 },
        references: { count: 3 }
      }, "project read");

      expect(text.split("\n")[0]).toBe("project  P/A.md");
      expect(text).toContain("status: in_progress");
      expect(text).toContain("tags: a, b");
      expect(text).toContain("body: 42 chars");
      expect(text).toContain("references: 3 items");
    });
  });

  describe("list and candidates", () => {
    it("renders a single-type list as root-relative names with a pagination hint", () => {
      const text = renderCliText("para-zk:list", {
        ok: true, count: 19, offset: 0, limit: 2, returned: 2, has_more: true,
        type: "resource", root: "PARA/Resources",
        items: ["Paper/ASAP", "Paper/BeyondMimic"]
      }, "notes listed");

      expect(text.split("\n")[0]).toBe("19 resources · root: PARA/Resources");
      expect(text).toContain("\n  Paper/ASAP");
      expect(text).toContain("\n  Paper/BeyondMimic");
      expect(text).toContain("… +17 more (2/19; offset/limit or limit=all)");
    });

    it("renders a mixed list as {name, type} items", () => {
      const text = renderCliText("para-zk:list", {
        ok: true, count: 2, offset: 0, limit: 50, returned: 2, has_more: false,
        items: [
          { name: "PARA/Projects/Demo", type: "project" },
          { name: "ZK/Spark/Idea", type: "spark" }
        ]
      }, "notes listed");

      expect(text.split("\n")[0]).toBe("2 notes");
      expect(text).toContain("  project  PARA/Projects/Demo");
      expect(text).toContain("  spark  ZK/Spark/Idea");
    });

    it("renders an empty single-type list as just the root header", () => {
      const text = renderCliText("para-zk:list", {
        ok: true, count: 0, offset: 0, limit: 50, returned: 0, has_more: false,
        type: "project", root: "PARA/Projects", items: []
      }, "notes listed");
      expect(text).toBe("0 projects · root: PARA/Projects");
    });

    it("renders candidates with reason and stale wikis", () => {
      const text = renderCliText("para-zk:wiki-ingest-candidates", {
        ok: true, count: 1, offset: 0, limit: 50, returned: 1, has_more: false,
        candidates: [{ path: "P/A.md", type: "resource", reason: "new_source", stale_llm_wikis: ["Wiki One"] }]
      }, "wiki ingest candidates listed");

      expect(text).toContain("1 candidates");
      expect(text).toContain("P/A.md  [new_source]  (stale: Wiki One)");
    });
  });

  describe("describe, mutations, warnings, errors", () => {
    it("renders describe as a schema dump", () => {
      const text = renderCliText("para-zk:describe", {
        ok: true, surfaceTypes: ["project", "area"], collectionFilters: { reference: ["link"] }
      }, "CLI surface described");

      expect(text.split("\n")[0]).toBe("CLI surface described");
      expect(text).toContain("surfaceTypes: project, area");
      expect(text).toContain("collectionFilters:");
      expect(text).toContain("  reference: link");
    });

    it("renders a mutation summary, path, and array fields", () => {
      const text = renderCliText("para-zk:create-project", {
        ok: true, path: "P/A.md", title: "A", created: true,
        areas: [{ title: "AI", created: false }, { title: "ML", created: true }]
      }, "project created");

      expect(text.split("\n")[0]).toBe("project created");
      expect(text).toContain("path: P/A.md");
      expect(text).toContain("created: true");
      expect(text).toContain("areas: AI, ML (new)");
    });

    it("appends warnings after the body", () => {
      const text = renderCliText("para-zk:create-project", {
        ok: true, path: "P/A.md", title: "A", created: true, warnings: ["areas not found: Z"]
      }, "project created");

      expect(text.split("\n").at(-1)).toBe("warning: areas not found: Z");
    });

    it("renders an error payload as the error summary", () => {
      const text = renderCliText("para-zk:read-project", { ok: false, error: "not found" }, "error: not found");
      expect(text).toBe("error: not found");
    });
  });
});
