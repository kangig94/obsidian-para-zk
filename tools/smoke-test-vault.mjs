import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import { basename, join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const vaultPath = resolve(args.vault ?? inferVaultPath());
const pluginDir = resolve(args.pluginDir ?? join(vaultPath, ".obsidian/plugins/para-zk"));
const installDeps = args.installDeps !== false;
const stamp = args.stamp ?? timestamp();
const requiredDependencyIds = [
  "dataview",
  "obsidian-tasks-plugin",
  "folder-notes",
  "update-time-on-edit",
  "obsidian-trash-explorer",
  "custom-sort",
  "homepage",
  "open-tab-settings"
];
const guiLocaleExpectations = {
  en: {
    ribbonLabels: ["New project", "New area", "New ZK", "New resource", "Open daily note", "Quick memo"],
    createProjectCommandName: "PARA-ZK: Create project",
    emptyTrashLabel: "Empty trash"
  },
  ko: {
    ribbonLabels: ["새 프로젝트", "새 영역", "새 ZK", "새 자료", "일일노트", "빠른 메모"],
    createProjectCommandName: "PARA-ZK: 새 프로젝트 만들기",
    emptyTrashLabel: "휴지통 비우기"
  }
};

prepareVault();

const setupResult = setupVaultCli([], "setup");
assertSetupEnvironment(setupResult);
assertGuiLocale("en");

setupVaultCli(["locale=ko", "force=true"], "ko locale init");
assertGuiLocale("ko");

setupVaultCli(["locale=en", "force=true"], "en locale init");
assertGuiLocale("en");

const today = todayIso();
assertGuiJournalCommand(today);

assertDryRunInit();
runLiveScenario();

console.log(JSON.stringify({ ok: true, vaultPath, stamp }, null, 2));

function prepareVault() {
  assertVault(vaultPath);
  mkdirSync(pluginDir, { recursive: true });

  if (args.clean) cleanVault(vaultPath, pluginDir);

  if (args.build !== false) {
    run("npm", ["run", "build"], {
      env: {
        ...process.env,
        OBSIDIAN_PLUGIN_DIR: pluginDir
      }
    });
  }

  ensureGuiVault(vaultPath);
  run("optsidian", ["raw", "plugin:enable", "id=para-zk"], { allowFailure: true });
  run("optsidian", ["raw", "plugin:reload", "id=para-zk"]);
  simulateMissedHomepageStartup();
}

function setupVaultCli(extraArgs = [], label = "init") {
  const payload = cliJson("para-zk:setup", [
    ...extraArgs,
    `installDeps=${installDeps}`,
    "format=json"
  ]);
  assert(payload.ok === true, `${label} failed`);
  return payload;
}

function assertSetupEnvironment(setupPayload) {
  assert(
    Array.isArray(setupPayload.warnings) && setupPayload.warnings.length === 0,
    `init warnings: ${JSON.stringify(setupPayload.warnings)}`
  );

  for (const id of requiredDependencyIds) {
    assertDependency(setupPayload, id);
  }

  assertObsidianCoreConfig();
  assertUpdateTimeOnEditConfig();
  assertCustomSortConfig();
  assertHomepageConfig();
  assertHomepageRuntime();
}

function assertGuiLocale(locale) {
  const expected = guiLocaleExpectations[locale];
  assert(expected, `unsupported GUI locale expectation: ${locale}`);
  assertGuiLocaleLabels(
    expected.ribbonLabels,
    expected.createProjectCommandName,
    expected.emptyTrashLabel
  );
}

function assertGuiJournalCommand(today) {
  const dailyJournalPath = `Journal/${today.slice(0, 7)}/${today}.md`;
  run("optsidian", ["raw", "command", "id=para-zk:open-journal"]);
  assertFileExists(dailyJournalPath, "daily journal command did not create journal");
  assertFileContains(dailyJournalPath, [
    "type: journal",
    `date: ${today}`
  ]);
}

function runLiveScenario() {
  // These scenarios verify behavior only Obsidian's real engine provides:
  // link rewriting on rename, backlink resolution, metadataCache timing, and
  // the live reference/task-block renderers. Pure workflow logic (CRUD,
  // references, tasks, archive, rename, delete) is covered by the vitest unit
  // suite (npm test) and is no longer re-checked here.
  assertReferenceSubpathScenario();
  assertObjectReferenceDeleteCleanup();
  assertObjectReferenceRenameSurvival();
  assertRenameAreaLinkRewrite();
  assertBacklinkReadKeyScenario();

  const reorderProject = cliJson("para-zk:create-project", [
    `title=Smoke Reorder ${stamp}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(reorderProject, "reference reorder project");
  cliJson("para-zk:add-reference", [`path=${reorderProject.path}`, "target=https://example.com/reorder-a", "open=false", "format=json"]);
  cliJson("para-zk:add-reference", [`path=${reorderProject.path}`, "target=https://example.com/reorder-b", "open=false", "format=json"]);
  assertReferenceRendererReorder(reorderProject.path);

  const taskProject = cliJson("para-zk:create-project", [
    `title=Smoke Task Render ${stamp}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(taskProject, "task render project");
  cliJson("para-zk:update-project", [
    `title=Smoke Task Render ${stamp}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ name: `Smoke render task ${stamp}` })}`,
    "format=json"
  ]);
  assertTaskBlockRendererRegression(taskProject.path, `Smoke render task ${stamp}`);
}

function assertRenameAreaLinkRewrite() {
  const areaTitle = `Smoke Link Source ${stamp}`;
  const renamedAreaTitle = `Smoke Link Renamed ${stamp}`;
  const projectTitle = `Smoke Area Link Project ${stamp}`;
  const area = cliJson("para-zk:create-area", [`title=${areaTitle}`, "open=false", "format=json"]);
  assertCreated(area, "rename area link area");
  const project = cliJson("para-zk:create-project", [
    `title=${projectTitle}`,
    `area_titles=${JSON.stringify([areaTitle])}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(project, "rename area link project");
  const renamed = cliJson("para-zk:rename-area", [`title=${areaTitle}`, `new_title=${renamedAreaTitle}`, "format=json"]);
  assert(renamed.ok === true, "rename-area for link rewrite failed");
  assertFileContainsAny(project.path, [
    `[[PARA/Areas/${renamedAreaTitle}/${renamedAreaTitle}.md|${renamedAreaTitle}]]`,
    `[[PARA/Areas/${renamedAreaTitle}/${renamedAreaTitle}|${renamedAreaTitle}]]`,
    `[[${renamedAreaTitle}|${renamedAreaTitle}]]`
  ]);
  assertFileNotContains(project.path, [areaTitle]);
}

function assertBacklinkReadKeyScenario() {
  const targetTitle = `Smoke Backlink Target ${stamp}`;
  const projectTitle = `Smoke Backlink Project ${stamp}`;
  const areaTitle = `Smoke Backlink Area ${stamp}`;
  const target = cliJson("para-zk:create-resource", [
    `title=${targetTitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(target, "backlink read target");
  const project = cliJson("para-zk:create-project", [
    `title=${projectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(project, "backlink read project source");
  const area = cliJson("para-zk:create-area", [
    `title=${areaTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(area, "backlink read area source");

  const projectLink = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=summary",
    "op=set",
    `value=Project backlink smoke [[${target.path}]]`,
    "format=json"
  ]);
  assert(projectLink.ok === true, "backlink read project link setup failed");
  const areaLink = cliJson("para-zk:update-area", [
    `title=${areaTitle}`,
    "key=overview",
    "op=set",
    `value=Area backlink smoke [[${target.path}]]`,
    "format=json"
  ]);
  assert(areaLink.ok === true, "backlink read area link setup failed");

  assert(waitForBacklink(target.path, project.path), "project source did not resolve as a backlink");
  assert(waitForBacklink(target.path, area.path), "area source did not resolve as a backlink");

  const backlinks = cliJson("para-zk:read-resource", [
    `title=${targetTitle}`,
    "key=backlinks",
    "limit=all",
    "format=json"
  ]);
  const items = Object.values(backlinks.value?.items ?? {});
  assert(backlinks.value?.count === 2, `backlink read returned unexpected item count: ${JSON.stringify(backlinks.value)}`);
  assert(items.some((item) => item.path === project.path && item.type === "project"), "backlink read did not include project source");
  assert(items.some((item) => item.path === area.path && item.type === "area"), "backlink read did not include area source");

  const projectBacklinks = cliJson("para-zk:read-resource", [
    `title=${targetTitle}`,
    "key=backlinks",
    "type=project",
    "limit=all",
    "format=json"
  ]);
  const projectItems = Object.values(projectBacklinks.value?.items ?? {});
  assert(projectItems.some((item) => item.path === project.path), "backlink type=project filter excluded the project source");
  assert(!projectItems.some((item) => item.path === area.path), "backlink type=project filter included a non-project source");
}

function assertReferenceSubpathScenario() {
  const subpathProjectTitle = `Smoke Reference Subpath ${stamp}`;
  const subpathTargetTitle = `Smoke Reference Subpath Target ${stamp}`;
  const heading = `Smoke Heading ${stamp}`;
  const blockId = `^smoke-block-${stamp}`;
  const subpathProject = cliJson("para-zk:create-project", [
    `title=${subpathProjectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(subpathProject, "reference subpath project");
  const subpathTarget = cliJson("para-zk:create-resource", [
    `title=${subpathTargetTitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(subpathTarget, "reference subpath target");

  const headingLink = wikiReferenceLink(`${subpathTarget.path}#${heading}`);
  const headingReference = cliJson("para-zk:add-reference", [
    `path=${subpathProject.path}`,
    `target=${headingLink}`,
    "description=Heading description",
    "open=false",
    "format=json"
  ]);
  assert(headingReference.ok === true && headingReference.added === true, "wiki subpath reference failed");
  assert(headingReference.link === headingLink, "wiki subpath reference did not preserve subpath");

  const duplicateMarkdown = cliJson("para-zk:add-reference", [
    `path=${subpathProject.path}`,
    `target=[Markdown heading](${subpathTarget.path}#${heading})`,
    "description=Different heading description",
    "open=false",
    "format=json"
  ]);
  assert(duplicateMarkdown.ok === true, "markdown duplicate subpath command failed");
  assert(duplicateMarkdown.added === false, "markdown duplicate subpath was added");
  assert(duplicateMarkdown.index === headingReference.index, "markdown duplicate subpath did not return existing index");
  assert(duplicateMarkdown.link === headingLink, "markdown duplicate subpath did not canonicalize to wiki link");

  const blockLink = wikiReferenceLink(`${subpathTarget.path}#${blockId}`);
  const blockReference = cliJson("para-zk:add-reference", [
    `path=${subpathProject.path}`,
    `target=${blockLink}`,
    "open=false",
    "format=json"
  ]);
  assert(blockReference.ok === true && blockReference.added === true, "different subpath reference was not added");
  assert(blockReference.link === blockLink, "block subpath reference did not preserve subpath");

  const subpathRead = cliJson("para-zk:read-project", [
    `title=${subpathProjectTitle}`,
    "key=references",
    "limit=all",
    "format=json"
  ]);
  const headingItem = Object.values(subpathRead.value?.items ?? {}).find((item) => item.link === headingLink);
  const blockItem = Object.values(subpathRead.value?.items ?? {}).find((item) => item.link === blockLink);
  assert(headingItem?.path === subpathTarget.path, "heading subpath read did not derive base path");
  assert(blockItem?.path === subpathTarget.path, "block subpath read did not derive base path");
  assert(subpathRead.value?.count === 2, "same-subpath dedupe or different-subpath distinctness failed");
}

function assertObjectReferenceDeleteCleanup() {
  const cleanupProjectTitle = `Smoke Reference Cleanup ${stamp}`;
  const cleanupEmptyProjectTitle = `Smoke Reference Cleanup Empty ${stamp}`;
  const cleanupTargetTitle = `Smoke Reference Cleanup Target ${stamp}`;
  const cleanupKeepTitle = `Smoke Reference Cleanup Keep ${stamp}`;

  const cleanupProject = cliJson("para-zk:create-project", [
    `title=${cleanupProjectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(cleanupProject, "reference cleanup project");
  const cleanupEmptyProject = cliJson("para-zk:create-project", [
    `title=${cleanupEmptyProjectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(cleanupEmptyProject, "reference cleanup empty project");
  const cleanupTarget = cliJson("para-zk:create-resource", [
    `title=${cleanupTargetTitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(cleanupTarget, "reference cleanup target");
  const cleanupKeep = cliJson("para-zk:create-resource", [
    `title=${cleanupKeepTitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(cleanupKeep, "reference cleanup keep");

  const cleanupBodyLink = cliJson("para-zk:update-project", [
    `title=${cleanupProjectTitle}`,
    "key=summary",
    "op=set",
    `value=Body mention [[${cleanupTargetTitle}]]`,
    "format=json"
  ]);
  assert(cleanupBodyLink.ok === true, "reference cleanup body link setup failed");
  const cleanupDeleteReference = cliJson("para-zk:update-project", [
    `title=${cleanupProjectTitle}`,
    "key=references",
    "op=insert",
    `value_json=${JSON.stringify({ link: cleanupTarget.path, description: "Delete object" })}`,
    "format=json"
  ]);
  assert(cleanupDeleteReference.ok === true, "reference cleanup delete object setup failed");
  const cleanupKeepReference = cliJson("para-zk:update-project", [
    `title=${cleanupProjectTitle}`,
    "key=references",
    "op=insert",
    `value_json=${JSON.stringify({ link: cleanupKeep.path, description: "Keep object" })}`,
    "format=json"
  ]);
  assert(cleanupKeepReference.ok === true, "reference cleanup keep object setup failed");
  const cleanupEmptyReference = cliJson("para-zk:update-project", [
    `title=${cleanupEmptyProjectTitle}`,
    "key=references",
    "op=insert",
    `value_json=${JSON.stringify({ link: cleanupTarget.path, description: "Only object" })}`,
    "format=json"
  ]);
  assert(cleanupEmptyReference.ok === true, "reference cleanup empty object setup failed");

  const deletedCleanupTarget = cliJson("para-zk:delete-resource", [
    `title=${cleanupTargetTitle}`,
    "format=json"
  ]);
  assert(deletedCleanupTarget.ok === true && deletedCleanupTarget.trashed === true, "reference cleanup target delete failed");
  assert(deletedCleanupTarget.cleaned?.references >= 2, "object reference delete cleanup did not report removed references");
  assertFileMissing(cleanupTarget.path, "reference cleanup target file remained");
  const cleanupRead = cliJson("para-zk:read-project", [
    `title=${cleanupProjectTitle}`,
    "key=references",
    "limit=all",
    "format=json"
  ]);
  const cleanupItems = Object.values(cleanupRead.value?.items ?? {});
  assert(cleanupRead.value?.count === 1, "object reference delete cleanup did not remove exactly one matching entry");
  assert(cleanupItems[0]?.path === cleanupKeep.path, "object reference delete cleanup removed nonmatching entry");
  assert(cleanupItems[0]?.description === "Keep object", "object reference delete cleanup lost preserved description");
  assert(waitForNoFrontmatterReferences(cleanupEmptyProject.path) === true, "object reference delete cleanup did not remove empty references key");
  assertFileContains(cleanupProject.path, [
    `Body mention [[${cleanupTargetTitle}]]`
  ]);
}

function assertObjectReferenceRenameSurvival() {
  const renameProjectTitle = `Smoke Object Rename Source ${stamp}`;
  const renameTargetTitle = `Smoke Object Rename Target ${stamp}`;
  const renamedTargetTitle = `Smoke Object Renamed Target ${stamp}`;
  const renameProject = cliJson("para-zk:create-project", [
    `title=${renameProjectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(renameProject, "object rename source");
  const renameTarget = cliJson("para-zk:create-resource", [
    `title=${renameTargetTitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(renameTarget, "object rename target");
  const objectReference = cliJson("para-zk:add-reference", [
    `path=${renameProject.path}`,
    `target=${renameTarget.path}`,
    "description=Object rename description",
    "open=false",
    "format=json"
  ]);
  assert(objectReference.ok === true && objectReference.added === true, "object rename reference setup failed");
  assert(readFrontmatterReferences(renameProject.path)?.[0]?.link === wikiReferenceLink(renameTarget.path), "object rename reference was not object-form before rename");

  const renamedTarget = cliJson("para-zk:rename-resource", [
    `title=${renameTargetTitle}`,
    `new_title=${renamedTargetTitle}`,
    "format=json"
  ]);
  assert(renamedTarget.ok === true, "object rename target rename failed");
  // Obsidian's automatic link update rewrites the frontmatter wikilink to the renamed
  // target AND normalizes it to the vault-preferred (bare basename) form, not the stored
  // full-path+.md form. Survival is verified behaviorally by the resolve-based path check
  // below; here we only wait until the link tracks the renamed basename.
  const expectedLink = wikiReferenceLink(renamedTargetTitle);
  const renamedLink = waitForFrontmatterReferenceLink(renameProject.path, "Object rename description", expectedLink);
  assert(renamedLink === expectedLink, "object-form frontmatter link did not survive rename");
  const renamedReferenceRead = cliJson("para-zk:read-project", [
    `title=${renameProjectTitle}`,
    "key=references/0",
    "format=json"
  ]);
  assert(renamedReferenceRead.value?.path === renamedTarget.path, "renamed object-form reference did not read through new path");
  assert(
    waitForBacklink(renamedTarget.path, renameProject.path),
    "renamed target's backlinks did not include the object-form referrer after rename"
  );
  // Re-adding the renamed target must dedupe against the rename-normalized stored link
  // (Obsidian normalized it to a bare basename; dedupe resolves both forms to the same
  // file, so no duplicate entry is created).
  const readdAfterRename = cliJson("para-zk:add-reference", [
    `path=${renameProject.path}`,
    `target=${renamedTarget.path}`,
    "open=false",
    "format=json"
  ]);
  assert(readdAfterRename.ok === true && readdAfterRename.added === false, "re-adding the renamed target should dedupe to the existing reference, not add a duplicate");
  const referencesAfterReadd = readFrontmatterReferences(renameProject.path);
  assert(Array.isArray(referencesAfterReadd) && referencesAfterReadd.length === 1, "rename-normalized reference must not duplicate on re-add");
}

function assertReferenceRendererReorder(path) {
  const before = frontmatterReferenceLinks(path);
  assert(before.length >= 2, "reference reorder setup needs at least two references");
  const snapshot = guiJson(`(async () => {
    const path = ${JSON.stringify(path)};
    const before = ${JSON.stringify(before)};
    const file = app.vault.getFileByPath(path);
    if (!file) throw new Error("reference reorder file not found: " + path);

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    function referenceLinks() {
      const references = app.metadataCache.getFileCache(file)?.frontmatter?.references;
      return Array.isArray(references)
        ? references.map((item) => typeof item === "string" ? item : item?.link).filter(Boolean)
        : [];
    }
    function matchingRows() {
      return Array.from(document.querySelectorAll(".para-zk-reference-row"))
        .filter((row) => before.includes(row.dataset.referenceLink));
    }
    function dragEvent(type, init = {}) {
      try {
        return new DragEvent(type, { bubbles: true, cancelable: true, ...init });
      } catch (_error) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clientY", { value: init.clientY ?? 0 });
        return event;
      }
    }

    const leaf = app.workspace.getLeaf(false);
    await leaf.setViewState({ type: "markdown", state: { file: path, mode: "preview" }, active: true });
    let rows = [];
    for (let index = 0; index < 30; index += 1) {
      rows = matchingRows();
      if (rows.length >= 2) break;
      await sleep(100);
    }
    if (rows.length < 2) {
      console.log(JSON.stringify({ ok: true, rowCount: rows.length, before, after: referenceLinks(), changed: false }));
      return;
    }

    const first = rows[0];
    const second = rows[1];
    const handle = first.querySelector(".para-zk-reference-drag");
    if (!handle) throw new Error("reference drag handle missing");
    handle.dispatchEvent(dragEvent("dragstart"));
    const rect = second.getBoundingClientRect();
    second.dispatchEvent(dragEvent("drop", { clientY: rect.bottom + 1 }));
    handle.dispatchEvent(dragEvent("dragend"));

    let after = referenceLinks();
    for (let index = 0; index < 30; index += 1) {
      after = referenceLinks();
      if (after[0] === before[1] && after[1] === before[0]) break;
      await sleep(100);
    }
    console.log(JSON.stringify({
      ok: true,
      rowCount: rows.length,
      before,
      after,
      changed: after[0] === before[1] && after[1] === before[0],
      firstRowLink: first.dataset.referenceLink,
      secondRowLink: second.dataset.referenceLink
    }));
  })()`);

  assert(snapshot.rowCount >= 2, `reference block did not render rows for reorder: ${JSON.stringify(snapshot)}`);
  assert(snapshot.firstRowLink === before[0], "reference reorder first rendered row did not match frontmatter");
  assert(snapshot.secondRowLink === before[1], "reference reorder second rendered row did not match frontmatter");
  assert(snapshot.changed === true, `reference drag reorder did not persist: ${JSON.stringify(snapshot)}`);
}

function assertTaskBlockRendererRegression(path, taskName) {
  const snapshot = guiJson(`(async () => {
    const path = ${JSON.stringify(path)};
    const taskName = ${JSON.stringify(taskName)};
    const file = app.vault.getFileByPath(path);
    if (!file) throw new Error("task renderer file not found: " + path);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const leaf = app.workspace.getLeaf(false);
    await leaf.setViewState({ type: "markdown", state: { file: path, mode: "preview" }, active: true });

    let block = null;
    let rows = [];
    let row = null;
    for (let index = 0; index < 30; index += 1) {
      rows = Array.from(document.querySelectorAll(".para-zk-task-row"));
      row = rows.find((item) => item.textContent.includes(taskName)) ?? null;
      block = row?.closest(".para-zk-tasks") ?? document.querySelector(".para-zk-tasks");
      if (block && row) break;
      await sleep(100);
    }

    const actions = row ? Array.from(row.querySelectorAll(".para-zk-task-actions button"))
      .map((button) => Array.from(button.classList).filter((name) => name.startsWith("para-zk-task-"))) : [];
    console.log(JSON.stringify({
      ok: true,
      hasBlock: Boolean(block),
      hasToolbar: Boolean(block?.querySelector(".para-zk-task-toolbar")),
      hasSummary: Boolean(block?.querySelector(".para-zk-task-toolbar-summary")),
      hasAdd: Boolean(block?.querySelector(".para-zk-task-add")),
      rowCount: rows.length,
      hasMatchingRow: Boolean(row),
      hasDrag: Boolean(row?.querySelector(".para-zk-task-drag")),
      hasCheckbox: Boolean(row?.querySelector(".para-zk-task-checkbox")),
      hasName: row?.querySelector(".para-zk-task-name")?.textContent === taskName,
      actions
    }));
  })()`);

  assert(snapshot.hasBlock === true, "task block renderer did not render block");
  assert(snapshot.hasToolbar === true, "task block renderer did not render toolbar");
  assert(snapshot.hasSummary === true, "task block renderer did not render summary");
  assert(snapshot.hasAdd === true, "task block renderer did not render add control");
  assert(snapshot.rowCount > 0, "task block renderer did not render rows");
  assert(snapshot.hasMatchingRow === true, "task block renderer did not render expected task row");
  assert(snapshot.hasDrag === false, "task block in default smart order must NOT render a drag handle — drag is manual-order only; this confirms the order-gating survived the registry-block shell extraction");
  assert(snapshot.hasCheckbox === true, "task block renderer did not render checkbox action");
  assert(snapshot.hasName === true, "task block renderer did not render task name");
  assert(
    snapshot.actions?.some((classes) => classes.includes("para-zk-task-edit"))
      && snapshot.actions?.some((classes) => classes.includes("para-zk-task-delete")),
    `task block renderer did not render edit/delete actions: ${JSON.stringify(snapshot.actions)}`
  );
}

function readFrontmatterReferences(path) {
  const snapshot = guiJson(`(async () => {
    const file = app.vault.getFileByPath(${JSON.stringify(path)});
    if (!file) throw new Error("frontmatter file not found: " + ${JSON.stringify(path)});
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let frontmatter;
    for (let index = 0; index < 30; index += 1) {
      frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter) break;
      await sleep(100);
    }
    const hasReferences = Boolean(frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, "references"));
    console.log(JSON.stringify({
      ok: true,
      hasReferences,
      references: hasReferences ? frontmatter.references : null
    }));
  })()`);
  return snapshot.hasReferences ? snapshot.references : undefined;
}

function waitForNoFrontmatterReferences(path) {
  const snapshot = guiJson(`(async () => {
    const file = app.vault.getFileByPath(${JSON.stringify(path)});
    if (!file) throw new Error("frontmatter file not found: " + ${JSON.stringify(path)});
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let hasReferences = true;
    for (let index = 0; index < 30; index += 1) {
      const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
      hasReferences = Boolean(frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, "references"));
      if (!hasReferences) break;
      await sleep(100);
    }
    console.log(JSON.stringify({ ok: true, removed: !hasReferences }));
  })()`);
  return snapshot.removed === true;
}

function waitForBacklink(targetPath, sourcePath) {
  const snapshot = guiJson(`(async () => {
    const targetPath = ${JSON.stringify(targetPath)};
    const sourcePath = ${JSON.stringify(sourcePath)};
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let found = false;
    for (let index = 0; index < 30; index += 1) {
      const resolved = app.metadataCache.resolvedLinks?.[sourcePath];
      found = Boolean(resolved && resolved[targetPath] > 0);
      if (found) break;
      await sleep(100);
    }
    console.log(JSON.stringify({ ok: true, found }));
  })()`);
  return snapshot.found === true;
}

function waitForFrontmatterReferenceLink(path, description, expectedLink) {
  const snapshot = guiJson(`(async () => {
    const file = app.vault.getFileByPath(${JSON.stringify(path)});
    const description = ${JSON.stringify(description)};
    const expectedLink = ${JSON.stringify(expectedLink)};
    if (!file) throw new Error("frontmatter file not found: " + ${JSON.stringify(path)});
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let link = null;
    for (let index = 0; index < 50; index += 1) {
      const references = app.metadataCache.getFileCache(file)?.frontmatter?.references;
      const match = Array.isArray(references)
        ? references.find((item) => typeof item === "object" && item?.description === description)
        : undefined;
      link = match?.link ?? null;
      if (link === expectedLink) break;
      await sleep(100);
    }
    console.log(JSON.stringify({ ok: true, link }));
  })()`);
  return snapshot.link;
}

function frontmatterReferenceLinks(path) {
  const references = readFrontmatterReferences(path);
  assert(Array.isArray(references), `frontmatter references missing for ${path}`);
  return references.map(frontmatterReferenceLink).filter(Boolean);
}

function frontmatterReferenceLink(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && typeof item.link === "string") return item.link;
  return undefined;
}

function wikiReferenceLink(target) {
  return `[[${target}]]`;
}

function assertDryRunInit() {
  const dryRun = cliJson("para-zk:setup", [
    "dryRun=true",
    "format=json"
  ]);
  assert(dryRun.ok === true, "dry-run init failed");
  assert(Array.isArray(dryRun.created) && dryRun.created.length === 0, "dry-run init reported created files");
  assert(Array.isArray(dryRun.updated) && dryRun.updated.length === 0, "dry-run init reported updated files");
  assert(Array.isArray(dryRun.skipped) && dryRun.skipped.length === 0, "dry-run init reported skipped files");
  assert(Array.isArray(dryRun.warnings) && dryRun.warnings.length === 0, "dry-run init reported warnings");
}

function parseArgs(rawArgs) {
  const parsed = {
    build: true,
    clean: true,
    installDeps: true
  };

  for (const arg of rawArgs) {
    if (arg === "--clean") {
      parsed.clean = true;
    } else if (arg === "--no-clean") {
      parsed.clean = false;
    } else if (arg === "--no-build") {
      parsed.build = false;
    } else if (arg === "--no-install-deps") {
      parsed.installDeps = false;
    } else if (arg.startsWith("--vault=")) {
      parsed.vault = arg.slice("--vault=".length);
    } else if (arg === "--vault") {
      parsed.vault = takeNext(rawArgs, arg);
    } else if (arg.startsWith("--plugin-dir=")) {
      parsed.pluginDir = arg.slice("--plugin-dir=".length);
    } else if (arg === "--plugin-dir") {
      parsed.pluginDir = takeNext(rawArgs, arg);
    } else if (arg.startsWith("--stamp=")) {
      parsed.stamp = arg.slice("--stamp=".length);
    } else if (arg === "--stamp") {
      parsed.stamp = takeNext(rawArgs, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return parsed;
}

function takeNext(rawArgs, flag) {
  const index = rawArgs.indexOf(flag);
  const value = rawArgs[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: npm run smoke:vault -- [--vault <path>] [--no-clean] [--no-build] [--no-install-deps]

By default the vault contents are wiped and fully re-initialized before the run
so verification always starts from a clean state.

Options:
  --vault <path>       Disposable test vault path. Defaults to PARA_ZK_TEST_VAULT or a local para-zk vault.
  --no-clean           Skip the default wipe; run against the vault's current contents.
  --no-build           Skip npm run build and plugin sync.
  --no-install-deps    Run para-zk:setup without installing required dependencies.
  --stamp <value>      Stable suffix for generated smoke-test notes.
`);
}

function inferVaultPath() {
  const candidates = [
    process.env.PARA_ZK_TEST_VAULT,
    process.env.OPTSIDIAN_VAULT_PATH,
    join(process.env.HOME ?? "", "documents/para-zk"),
    join(process.env.HOME ?? "", "Documents/para-zk")
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(join(candidate, ".obsidian")));
  if (!found) {
    throw new Error("Cannot infer test vault path. Pass --vault /path/to/disposable-vault.");
  }
  return found;
}

function assertVault(path) {
  assert(existsSync(path), `vault path does not exist: ${path}`);
  assert(existsSync(join(path, ".obsidian")), `vault path has no .obsidian directory: ${path}`);
}

function cleanVault(path, paraZkPluginDir) {
  const name = basename(path).toLowerCase();
  assert(name.includes("para-zk") || name.includes("test"), `refusing to clean non-test vault: ${path}`);
  assert(existsSync(join(path, ".obsidian")), "refusing to clean a path without .obsidian");

  for (const entry of readdirSync(path)) {
    if (entry === ".obsidian") continue;
    rmSync(join(path, entry), { recursive: true, force: true });
  }

  rmSync(join(paraZkPluginDir, "data.json"), { force: true });
  // Drop the PARA-ZK-generated bookmarks so setup regenerates the custom-sort
  // sortspec from scratch (it is only created when missing).
  rmSync(join(path, ".obsidian", "bookmarks.json"), { force: true });
}

function ensureGuiVault(path) {
  run("optsidian", ["open-gui", `vault-path=${path}`, "no-wait", "format=json"]);
  if (waitForActiveVault(path, 2000)) return;

  focusVaultWindow(path);
  if (waitForActiveVault(path, 5000)) return;

  const current = activeVaultPath() ?? "unknown";
  throw new Error(`Timed out waiting for active Obsidian vault: expected ${path}, got ${current}`);
}

function waitForActiveVault(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (samePath(activeVaultPath(), path)) return true;
    sleepMs(250);
  }
  return false;
}

function activeVaultPath() {
  const result = run("optsidian", ["vault", "info=path"], { allowFailure: true });
  return result.status === 0 ? result.stdout : undefined;
}

function focusVaultWindow(path) {
  const targetVaultName = basename(path).toLowerCase();
  const targetTitleSegment = ` - ${targetVaultName} - obsidian`;
  const ids = run("xdotool", ["search", "--onlyvisible", "--class", "obsidian"], { allowFailure: true })
    .stdout
    .split(/\s+/)
    .filter(Boolean);

  for (const id of ids) {
    const title = run("xdotool", ["getwindowname", id], { allowFailure: true }).stdout.toLowerCase();
    if (!title.includes(targetTitleSegment)) continue;
    run("xdotool", ["windowactivate", "--sync", id], { allowFailure: true });
    run("xdotool", ["windowfocus", "--sync", id], { allowFailure: true });
    sleepMs(300);
    return true;
  }

  return false;
}

function cliJson(command, commandArgs) {
  const result = run("optsidian", ["raw", command, ...commandArgs]);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Command did not return JSON: ${command}\n${result.stdout}\n${result.stderr}`);
  }
}

function guiJson(code) {
  const result = run("optsidian", ["eval", `code=${code}`]);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Obsidian eval did not return JSON\n${result.stdout}\n${result.stderr}`);
  }
}

function assertGuiLocaleLabels(expectedRibbonLabels, expectedCreateProjectCommandName, expectedEmptyTrashLabel) {
  const snapshot = guiJson(`console.log(JSON.stringify({
    ribbon: Array.from(document.querySelectorAll(".para-zk-ribbon-action"))
      .map((el) => ({
        label: el.getAttribute("aria-label"),
        order: Number(getComputedStyle(el).order),
        top: el.getBoundingClientRect().top
      }))
      .sort((left, right) => left.top - right.top),
    createProjectCommandName: app.commands.commands["para-zk:create-project"]?.name,
    emptyTrashLabel: document.querySelector(".para-zk-explorer-action-empty-trash")?.getAttribute("aria-label"),
    emptyTrashCommandExists: Boolean(app.commands.commands["obsidian-trash-explorer:empty-trash"])
  }))`);

  assert(Array.isArray(snapshot.ribbon), "ribbon snapshot is not an array");
  assert(
    snapshot.ribbon.length === expectedRibbonLabels.length,
    `expected ${expectedRibbonLabels.length} PARA-ZK ribbon actions, got ${snapshot.ribbon.length}`
  );

  for (const [index, expectedLabel] of expectedRibbonLabels.entries()) {
    const action = snapshot.ribbon[index];
    assert(action.label === expectedLabel, `ribbon label ${index} expected ${expectedLabel}, got ${action.label}`);
    assert(action.order === 100 + index, `ribbon order ${index} expected ${100 + index}, got ${action.order}`);
  }

  assert(
    snapshot.createProjectCommandName === expectedCreateProjectCommandName,
    `create-project command name expected ${expectedCreateProjectCommandName}, got ${snapshot.createProjectCommandName}`
  );
  assert(
    snapshot.emptyTrashLabel === expectedEmptyTrashLabel,
    `empty trash label expected ${expectedEmptyTrashLabel}, got ${snapshot.emptyTrashLabel}`
  );
  if (installDeps) {
    assert(snapshot.emptyTrashCommandExists === true, "Trash Explorer empty-trash command is missing");
  }
}

function simulateMissedHomepageStartup() {
  if (!installDeps) return;

  guiJson(`(() => {
    const plugin = app.plugins.plugins.homepage;
    if (plugin) plugin.loaded = false;
    console.log(JSON.stringify({ ok: true, homepageLoaded: plugin?.loaded ?? null }));
  })()`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8"
  });
  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error([
      `Command failed: ${command} ${commandArgs.join(" ")}`,
      result.error?.message,
      stdout,
      stderr
    ].filter(Boolean).join("\n"));
  }

  return {
    stdout,
    stderr,
    status: result.status
  };
}

function assertDependency(setupPayload, id) {
  const dependency = setupPayload.dependencies?.find((item) => item.id === id);
  assert(dependency, `missing dependency result: ${id}`);
  if (installDeps) {
    assert(dependency.installed === true, `${id} is not installed`);
    assert(dependency.enabled === true, `${id} is not enabled`);
  }
}

function assertObsidianCoreConfig() {
  const appConfig = readVaultJson(".obsidian/app.json");
  assert(appConfig.alwaysUpdateLinks === true, "app.json alwaysUpdateLinks was not enabled");
  assert(appConfig.attachmentFolderPath === "assets", "app.json attachmentFolderPath is not assets");
  assert(appConfig.trashOption === "local", "app.json trashOption is not local");
  assert(appConfig.propertiesInDocument === "hidden", "app.json propertiesInDocument is not hidden");

  const ignoreFilters = appConfig.userIgnoreFilters;
  assert(Array.isArray(ignoreFilters), "app.json userIgnoreFilters is not an array");
  for (const filter of ["Templates/", "Dashboard/", "Tasks/", "README"]) {
    assert(ignoreFilters.includes(filter), `app.json userIgnoreFilters is missing ${filter}`);
  }

  const templatesConfig = readVaultJson(".obsidian/templates.json");
  assert(templatesConfig.folder === "Templates", "templates.json folder is not Templates");
}

function assertUpdateTimeOnEditConfig() {
  if (!installDeps) return;

  const config = readVaultJson(".obsidian/plugins/update-time-on-edit/data.json");
  assert(config.dateFormat === "yyyy-MM-dd'T'HH:mm", "update-time-on-edit dateFormat is not configured");
  assert(config.enableCreateTime === true, "update-time-on-edit enableCreateTime is not enabled");
  assert(config.headerUpdated === "updated", "update-time-on-edit headerUpdated is not updated");
  assert(config.headerCreated === "created", "update-time-on-edit headerCreated is not created");
  assert(config.minMinutesBetweenSaves === 1, "update-time-on-edit minMinutesBetweenSaves is not 1");
  assert(config.enableExperimentalHash === true, "update-time-on-edit enableExperimentalHash is not enabled");

  for (const folder of ["Templates", "Dashboard", "Tasks", "assets", "README"]) {
    assert(config.ignoreGlobalFolder?.includes(folder), `update-time-on-edit ignoreGlobalFolder is missing ${folder}`);
  }
  for (const folder of ["Templates", "Dashboard", "Tasks", "README"]) {
    assert(config.ignoreCreatedFolder?.includes(folder), `update-time-on-edit ignoreCreatedFolder is missing ${folder}`);
  }
}

function assertCustomSortConfig() {
  if (!installDeps) return;

  const config = readVaultJson(".obsidian/plugins/custom-sort/data.json");
  assert(config.suspended === false, "custom-sort is suspended");
  assert(config.statusBarEntryEnabled === false, "custom-sort status bar entry should be disabled");
  assert(config.notificationsEnabled === false, "custom-sort notifications should be disabled");
  assert(config.mobileNotificationsEnabled === false, "custom-sort mobile notifications should be disabled");
  assert(config.customSortContextSubmenu === true, "custom-sort context submenu is not enabled");
  assert(config.automaticBookmarksIntegration === true, "custom-sort bookmarks integration is not enabled");
  assert(config.bookmarksContextMenus === true, "custom-sort bookmark context menus are not enabled");
  assert(config.bookmarksGroupToConsumeAsOrderingReference === "sortspec", "custom-sort bookmark group is not sortspec");
  assert(config.delayForInitialApplication === 1000, "custom-sort delayForInitialApplication is not 1000");

  const bookmarks = readVaultJson(".obsidian/bookmarks.json");
  const sortspec = bookmarks.items?.find((item) => item.type === "group" && item.title === "sortspec");
  assert(sortspec, "bookmarks.json is missing sortspec group");
  const topLevelTitles = sortspec.items?.map((item) => item.title);
  for (const title of ["Dashboard", "PARA", "ZK", "Journal", "Templates"]) {
    assert(topLevelTitles?.includes(title), `sortspec bookmark group is missing ${title}`);
  }
}

function assertHomepageConfig() {
  if (!installDeps) return;

  const config = readVaultJson(".obsidian/plugins/homepage/data.json");
  assert(config.version === 4, "homepage version is not 4");
  assert(config.separateMobile === false, "homepage separateMobile is not false");

  const homepage = config.homepages?.["Main Homepage"];
  assert(homepage, "homepage Main Homepage is missing");
  assert(homepage.value === "Dashboard/HomePage", "homepage value is not Dashboard/HomePage");
  assert(homepage.kind === "File", "homepage kind is not File");
  assert(homepage.openOnStartup === true, "homepage openOnStartup is not enabled");
  assert(homepage.openMode === "Replace all open notes", "homepage openMode is not Replace all open notes");
  assert(homepage.manualOpenMode === "Keep open notes", "homepage manualOpenMode is not Keep open notes");
  assert(homepage.view === "Default view", "homepage view is not Default view");
  assert(homepage.revertView === true, "homepage revertView is not enabled");
  assert(homepage.openWhenEmpty === true, "homepage openWhenEmpty is not enabled");
  assert(homepage.autoCreate === false, "homepage autoCreate should be disabled");
}

function assertHomepageRuntime() {
  if (!installDeps) return;

  const snapshot = guiJson(`(async () => {
    const plugin = app.plugins.plugins.homepage;
    const layout = app.workspace.getLayout();
    layout.main = {
      id: "para-zk-smoke-main",
      type: "split",
      children: [{
        id: "para-zk-smoke-tabs",
        type: "tabs",
        children: [{
          id: "para-zk-smoke-empty",
          type: "leaf",
          state: { type: "empty", state: {}, icon: "lucide-file", title: "New tab" }
        }]
      }],
      direction: "vertical"
    };
    layout.active = "para-zk-smoke-empty";
    await app.workspace.changeLayout(layout);
    for (
      let index = 0;
      index < 30 && (app.workspace.getActiveFile()?.path !== "Dashboard/HomePage.md" || plugin?.executing === true);
      index += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log(JSON.stringify({
      pluginLoaded: Boolean(plugin),
      homepageLoaded: plugin?.loaded,
      homepageExecuting: plugin?.executing,
      activeType: app.workspace.activeLeaf?.getViewState?.().type,
      activeFile: app.workspace.getActiveFile()?.path ?? null
    }));
  })()`);

  assert(snapshot.pluginLoaded === true, "homepage plugin is not loaded in Obsidian runtime");
  assert(snapshot.homepageLoaded === true, "homepage runtime did not reach loaded state after init");
  assert(snapshot.homepageExecuting === false, "homepage runtime is stuck executing after opening HomePage");
  assert(snapshot.activeType === "markdown", `homepage did not replace empty tab; active type is ${snapshot.activeType}`);
  assert(snapshot.activeFile === "Dashboard/HomePage.md", `homepage active file expected Dashboard/HomePage.md, got ${snapshot.activeFile}`);
}

function readVaultJson(path) {
  return JSON.parse(readFileSync(join(vaultPath, path), "utf8"));
}

function assertCreated(payload, label) {
  assert(payload.ok === true, `${label} command failed`);
  assert(typeof payload.path === "string" && payload.path.length > 0, `${label} result has no path`);
  assert(existsSync(join(vaultPath, payload.path)), `${label} file does not exist: ${payload.path}`);
}

function assertFileExists(path, message) {
  const absolute = join(vaultPath, path);
  const deadline = Date.now() + 3000;
  while (Date.now() <= deadline) {
    if (existsSync(absolute)) return;
    sleepMs(100);
  }
  assert(false, `${message}: ${path}`);
}

function assertFileMissing(path, message) {
  const absolute = join(vaultPath, path);
  const deadline = Date.now() + 3000;
  while (Date.now() <= deadline) {
    if (!existsSync(absolute)) return;
    sleepMs(100);
  }
  assert(false, `${message}: ${path}`);
}

function assertFileContains(path, needles) {
  const absolute = join(vaultPath, path);
  const deadline = Date.now() + 3000;
  let text = "";
  while (Date.now() <= deadline) {
    if (existsSync(absolute) && statSync(absolute).isFile()) {
      text = readFileSync(absolute, "utf8");
      if (needles.every((needle) => text.includes(needle))) return;
    }
    sleepMs(100);
  }

  assert(existsSync(absolute), `missing file: ${path}`);
  assert(statSync(absolute).isFile(), `not a file: ${path}`);
  for (const needle of needles) {
    assert(text.includes(needle), `${path} does not contain: ${needle}`);
  }
}

function assertFileContainsAny(path, needles) {
  const absolute = join(vaultPath, path);
  const deadline = Date.now() + 3000;
  let text = "";
  while (Date.now() <= deadline) {
    if (existsSync(absolute) && statSync(absolute).isFile()) {
      text = readFileSync(absolute, "utf8");
      if (needles.some((needle) => text.includes(needle))) return;
    }
    sleepMs(100);
  }

  assert(existsSync(absolute), `missing file: ${path}`);
  assert(statSync(absolute).isFile(), `not a file: ${path}`);
  throw new Error(`${path} does not contain any of: ${needles.join(" | ")}`);
}

function assertFileNotContains(path, needles) {
  const absolute = join(vaultPath, path);
  assert(existsSync(absolute), `missing file: ${path}`);
  assert(statSync(absolute).isFile(), `not a file: ${path}`);
  const text = readFileSync(absolute, "utf8");
  for (const needle of needles) {
    assert(!text.includes(needle), `${path} should not contain: ${needle}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function samePath(left, right) {
  if (!left || !right) return false;
  return resolve(left) === resolve(right);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function timestamp() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ];
  return parts.join("");
}

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
