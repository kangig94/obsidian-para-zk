import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backlinkReadInstrumentation } from "../../src/workflows/surfaces";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;

const originalEnumerateSources = backlinkReadInstrumentation.enumerateSources;

beforeEach(() => {
  cli = createCliHarness();
});

afterEach(() => {
  backlinkReadInstrumentation.enumerateSources = originalEnumerateSources;
});

function seedResolvedLinks(links: Record<string, string[]>): void {
  cli.app.metadataCache.resolvedLinks = Object.fromEntries(
    Object.entries(links).map(([sourcePath, targetPaths]) => [
      sourcePath,
      Object.fromEntries(targetPaths.map((targetPath) => [targetPath, 1]))
    ])
  );
}

function collectionValue(result: Record<string, unknown>): {
  count: number;
  offset: number;
  limit: number | "all";
  returned: number;
  has_more: boolean;
  items: Record<string, Record<string, unknown>>;
} {
  return result.value as {
    count: number;
    offset: number;
    limit: number | "all";
    returned: number;
    has_more: boolean;
    items: Record<string, Record<string, unknown>>;
  };
}

async function createArea(title: string): Promise<string> {
  const created = await cli.run("para-zk:create-area", { title, open: "false" });
  expect(created.ok).toBe(true);
  return String(created.path);
}

async function createProject(title: string): Promise<string> {
  const created = await cli.run("para-zk:create-project", { title, open: "false" });
  expect(created.ok).toBe(true);
  return String(created.path);
}

async function createResource(title: string): Promise<string> {
  const created = await cli.run("para-zk:create-resource", { title, open: "false" });
  expect(created.ok).toBe(true);
  return String(created.path);
}

async function createZk(title: string, kind: string): Promise<string> {
  const created = await cli.run("para-zk:create-zk", { title, kind, open: "false" });
  expect(created.ok).toBe(true);
  return String(created.path);
}

describe("backlink read collection", () => {
  it("lists inbound links ordered by source path, derives source type, and excludes self", async () => {
    const targetPath = await createArea("Backlink Target");
    const resourcePath = await createResource("Beta Source");
    const projectPath = await createProject("Alpha Source");
    seedResolvedLinks({
      [resourcePath]: [targetPath],
      [projectPath]: [targetPath],
      [targetPath]: [targetPath]
    });

    const read = await cli.run("para-zk:read-area", {
      title: "Backlink Target",
      key: "backlinks",
      limit: "all"
    });
    const value = collectionValue(read);

    expect(value.count).toBe(2);
    expect(value.returned).toBe(2);
    expect(Object.keys(value.items)).toEqual(["0", "1"]);
    expect(value.items["0"]).toEqual({
      link: `[[${projectPath}]]`,
      path: projectPath,
      title: "Alpha Source",
      type: "project"
    });
    expect(value.items["1"]).toEqual({
      link: `[[${resourcePath}]]`,
      path: resourcePath,
      title: "Beta Source",
      type: "resource"
    });
  });

  it("skips unresolvable source paths", async () => {
    const targetPath = await createArea("Resolvable Target");
    const sourcePath = await createProject("Resolvable Source");
    const ghostPath = "PARA/Projects/Ghost Source/Ghost Source.md";
    seedResolvedLinks({
      [sourcePath]: [targetPath],
      [ghostPath]: [targetPath]
    });

    const read = await cli.run("para-zk:read-area", {
      title: "Resolvable Target",
      key: "backlinks",
      limit: "all"
    });
    const value = collectionValue(read);

    expect(value.count).toBe(1);
    expect(value.returned).toBe(1);
    expect(Object.values(value.items).some((item) => item.path === ghostPath)).toBe(false);
    expect(Object.values(value.items)[0]?.path).toBe(sourcePath);
  });

  it("filters backlinks by query and source frontmatter type", async () => {
    const targetPath = await createArea("Filter Target");
    const projectPath = await createProject("Alpha Query Source");
    const resourcePath = await createResource("Beta Query Source");
    seedResolvedLinks({
      [resourcePath]: [targetPath],
      [projectPath]: [targetPath]
    });

    const query = await cli.run("para-zk:read-area", {
      title: "Filter Target",
      key: "backlinks",
      query: "alpha query"
    });
    expect(collectionValue(query).count).toBe(1);
    expect(Object.values(collectionValue(query).items)[0]?.path).toBe(projectPath);

    const typed = await cli.run("para-zk:read-area", {
      title: "Filter Target",
      key: "backlinks",
      type: "resource"
    });
    expect(collectionValue(typed).count).toBe(1);
    expect(Object.values(collectionValue(typed).items)[0]?.path).toBe(resourcePath);
  });

  it("matches backlink query against source path but not link text", async () => {
    const targetPath = await createArea("Path Query Target");
    const projectPath = await createProject("Path Token Source");
    const resourcePath = await createResource("Resource Token Source");
    seedResolvedLinks({
      [projectPath]: [targetPath],
      [resourcePath]: [targetPath]
    });

    const pathQuery = await cli.run("para-zk:read-area", {
      title: "Path Query Target",
      key: "backlinks",
      query: "projects",
      limit: "all"
    });
    expect(collectionValue(pathQuery).count).toBe(1);
    expect(Object.values(collectionValue(pathQuery).items)[0]?.path).toBe(projectPath);

    const linkQuery = await cli.run("para-zk:read-area", {
      title: "Path Query Target",
      key: "backlinks",
      query: "[[",
      limit: "all"
    });
    expect(collectionValue(linkQuery).count).toBe(0);
  });

  it("pages collection reads and reads a single backlink item by index", async () => {
    const targetPath = await createArea("Paged Target");
    const alphaPath = await createProject("Page Alpha");
    const betaPath = await createProject("Page Beta");
    const gammaPath = await createResource("Page Gamma");
    seedResolvedLinks({
      [gammaPath]: [targetPath],
      [betaPath]: [targetPath],
      [alphaPath]: [targetPath]
    });

    const page = await cli.run("para-zk:read-area", {
      title: "Paged Target",
      key: "backlinks",
      offset: "1",
      limit: "1"
    });
    const value = collectionValue(page);
    expect(value.count).toBe(3);
    expect(value.offset).toBe(1);
    expect(value.limit).toBe(1);
    expect(value.returned).toBe(1);
    expect(value.has_more).toBe(true);
    expect(Object.keys(value.items)).toEqual(["1"]);
    expect(value.items["1"]?.path).toBe(betaPath);

    const single = await cli.run("para-zk:read-area", {
      title: "Paged Target",
      key: "backlinks/1"
    });
    expect(single.value).toEqual({
      link: `[[${betaPath}]]`,
      path: betaPath,
      title: "Page Beta",
      type: "project"
    });
  });

  it("omits backlinks from compact reads when there are no inbound links", async () => {
    await createResource("Empty Backlinks");

    const compact = await cli.run("para-zk:read-resource", { title: "Empty Backlinks" });
    expect(compact.backlinks).toBeUndefined();

    const exact = await cli.run("para-zk:read-resource", {
      title: "Empty Backlinks",
      key: "backlinks"
    });
    expect(collectionValue(exact).count).toBe(0);
    expect(collectionValue(exact).returned).toBe(0);
  });

  it("rejects backlink update keys as read-only", async () => {
    const title = "Locked Backlinks";
    await createProject(title);

    const collectionUpdate = await cli.run("para-zk:update-project", {
      title,
      key: "backlinks",
      op: "set",
      value: "x"
    });
    expect(collectionUpdate.ok).toBe(false);
    expect(String(collectionUpdate.error).length).toBeGreaterThan(0);

    const itemUpdate = await cli.run("para-zk:update-project", {
      title,
      key: "backlinks/0",
      op: "set",
      value: "x"
    });
    expect(itemUpdate.ok).toBe(false);
    expect(String(itemUpdate.error).length).toBeGreaterThan(0);
  });

  it("exposes backlinks on DOC and NOTE child specs and supports compact, page, and single-item child reads", async () => {
    const parentPath = await createProject("Child Backlinks");
    const docChild = await cli.run("para-zk:create-subnote", {
      title: "Doc Child",
      path: parentPath,
      subnote_type: "meeting",
      open: "false"
    });
    expect(docChild.ok).toBe(true);
    const docPath = String(docChild.path);
    const notePath = "PARA/Projects/Child Backlinks/Loose Child.md";
    await cli.app.vault.create(notePath, "Loose child body");
    const sourcePath = await createProject("Child Source");
    seedResolvedLinks({
      [sourcePath]: [docPath, notePath]
    });

    const docCompact = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Doc Child"
    });
    expect((docCompact.value as { type: string; backlinks?: { count: number } }).type).toBe("doc");
    expect((docCompact.value as { backlinks?: { count: number } }).backlinks?.count).toBe(1);

    const noteCompact = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Loose Child"
    });
    expect((noteCompact.value as { type: string; backlinks?: { count: number } }).type).toBe("note");
    expect((noteCompact.value as { backlinks?: { count: number } }).backlinks?.count).toBe(1);

    const page = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Doc Child/backlinks"
    });
    expect(collectionValue(page).count).toBe(1);
    expect(collectionValue(page).items["0"]?.path).toBe(sourcePath);

    const notePage = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Loose Child/backlinks"
    });
    expect(collectionValue(notePage).count).toBe(1);
    expect(collectionValue(notePage).items["0"]?.path).toBe(sourcePath);

    const single = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Doc Child/backlinks/0"
    });
    expect((single.value as Record<string, unknown>).path).toBe(sourcePath);

    const noteSingle = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Loose Child/backlinks/0"
    });
    expect((noteSingle.value as Record<string, unknown>).path).toBe(sourcePath);

    const docUnknown = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Doc Child/__missing__"
    });
    expect(docUnknown.ok).toBe(false);
    expect(String(docUnknown.error)).toContain("backlinks");

    const noteUnknown = await cli.run("para-zk:read-project", {
      title: "Child Backlinks",
      key: "children/Loose Child/__missing__"
    });
    expect(noteUnknown.ok).toBe(false);
    expect(String(noteUnknown.error)).toContain("backlinks");
  });

  it("exposes backlinks on journal and retro reads", async () => {
    const journal = await cli.run("para-zk:capture-journal", {
      content: "Journal backlink target",
      date: "2026-06-02",
      time: "09:30",
      open: "false"
    });
    expect(journal.ok).toBe(true);
    const journalPath = String(journal.path);
    const journalSourcePath = await createProject("Journal Backlink Source");

    const retroScopePath = await createProject("Retro Scope");
    const retro = await cli.run("para-zk:create-retro", {
      path: retroScopePath,
      date: "2026-06-02",
      open: "false"
    });
    expect(retro.ok).toBe(true);
    const retroPath = String(retro.path);
    const retroSourcePath = await createProject("Retro Backlink Source");

    seedResolvedLinks({
      [journalSourcePath]: [journalPath],
      [retroSourcePath]: [retroPath]
    });

    const journalRead = await cli.run("para-zk:read-journal", {
      path: journalPath,
      key: "backlinks",
      limit: "all"
    });
    const journalValue = collectionValue(journalRead);
    expect(journalValue.count).toBeGreaterThanOrEqual(1);
    expect(Object.values(journalValue.items).some((item) => item.path === journalSourcePath)).toBe(true);

    const retroRead = await cli.run("para-zk:read-retro", {
      path: retroPath,
      key: "backlinks",
      limit: "all"
    });
    const retroValue = collectionValue(retroRead);
    expect(retroValue.count).toBeGreaterThanOrEqual(1);
    expect(Object.values(retroValue.items).some((item) => item.path === retroSourcePath)).toBe(true);
  });

  it("supports read-zk key=backlinks type=project without treating type as the ZK selector", async () => {
    const targetPath = await createZk("Backlinked Permanent", "permanent");
    const projectPath = await createProject("ZK Project Source");
    const areaPath = await createArea("ZK Area Source");
    seedResolvedLinks({
      [projectPath]: [targetPath],
      [areaPath]: [targetPath]
    });

    const read = await cli.run("para-zk:read-zk", {
      title: "Backlinked Permanent",
      kind: "permanent",
      key: "backlinks",
      type: "project"
    });
    const value = collectionValue(read);
    expect(value.count).toBe(1);
    expect(Object.values(value.items)[0]?.path).toBe(projectPath);
  });

  it("exposes backlinks on fleeting and literature ZK reads", async () => {
    for (const kind of ["fleeting", "literature"]) {
      const title = `Backlinked ${kind}`;
      const targetPath = await createZk(title, kind);
      const sourcePath = await createProject(`${kind} ZK Source`);
      seedResolvedLinks({
        [sourcePath]: [targetPath]
      });

      const read = await cli.run("para-zk:read-zk", {
        title,
        kind,
        key: "backlinks",
        limit: "all"
      });
      const value = collectionValue(read);
      expect(value.count).toBe(1);
      expect(Object.values(value.items)[0]?.path).toBe(sourcePath);
    }
  });

  it("defaults frontmatter-less backlink sources to note type", async () => {
    const targetPath = await createArea("Plain Source Target");
    const sourcePath = "Loose Source.md";
    await cli.app.vault.create(sourcePath, "links [[Plain Source Target]]");
    seedResolvedLinks({
      [sourcePath]: [targetPath]
    });

    const read = await cli.run("para-zk:read-area", {
      title: "Plain Source Target",
      key: "backlinks",
      limit: "all"
    });
    const item = Object.values(collectionValue(read).items).find((entry) => entry.path === sourcePath);

    expect(item?.type).toBe("note");
  });

  it("does not scan backlinks for non-backlink exact reads, including child body reads", async () => {
    const projectPath = await createProject("No Scan");
    const child = await cli.run("para-zk:create-subnote", {
      title: "Body Child",
      path: projectPath,
      subnote_type: "free",
      open: "false"
    });
    expect(child.ok).toBe(true);
    await cli.run("para-zk:update-project", {
      title: "No Scan",
      key: "children/Body Child/body",
      op: "set",
      value: "Exact child body"
    });
    backlinkReadInstrumentation.enumerateSources = () => {
      throw new Error("backlink scan should not run for exact non-backlink reads");
    };

    const summary = await cli.run("para-zk:read-project", { title: "No Scan", key: "summary" });
    expect(summary.ok).toBe(true);

    const status = await cli.run("para-zk:read-project", {
      title: "No Scan",
      key: "frontmatter/status"
    });
    expect(status.ok).toBe(true);

    const childBody = await cli.run("para-zk:read-project", {
      title: "No Scan",
      key: "children/Body Child/body"
    });
    expect(childBody.ok).toBe(true);
    expect(childBody.value).toBe("Exact child body");
  });

  it("uses count-only compact backlink reads without materializing BacklinkRead items", async () => {
    const targetPath = await createResource("Perf Target");
    const sourceCount = 600;
    const links: Record<string, string[]> = {};
    for (let index = 0; index < sourceCount; index += 1) {
      const sourcePath = `Perf Sources/Source ${String(index).padStart(4, "0")}.md`;
      await cli.app.vault.create(sourcePath, "---\ntype: project\n---\nPerf source");
      links[sourcePath] = [targetPath];
    }
    seedResolvedLinks(links);

    let enumerateCalls = 0;
    let materializedEnumerations = 0;
    const originalGetFileCache = cli.app.metadataCache.getFileCache;
    let sourceFrontmatterReads = 0;
    cli.app.metadataCache.getFileCache = (file) => {
      if (file.path.startsWith("Perf Sources/")) sourceFrontmatterReads += 1;
      return originalGetFileCache(file);
    };
    backlinkReadInstrumentation.enumerateSources = (ctx, file, visitor) => {
      enumerateCalls += 1;
      if (visitor) materializedEnumerations += 1;
      return originalEnumerateSources(ctx, file, visitor);
    };

    const compact = await cli.run("para-zk:read-resource", { title: "Perf Target" });
    expect((compact.backlinks as { count: number }).count).toBe(sourceCount);
    expect(enumerateCalls).toBe(1);
    expect(materializedEnumerations).toBe(0);
    expect(sourceFrontmatterReads).toBe(0);

    const exact = await cli.run("para-zk:read-resource", {
      title: "Perf Target",
      key: "backlinks",
      limit: "1"
    });
    expect(collectionValue(exact).count).toBe(sourceCount);
    expect(materializedEnumerations).toBe(1);
    expect(sourceFrontmatterReads).toBeGreaterThan(0);
  });
});
