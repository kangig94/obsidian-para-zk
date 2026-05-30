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
  "tabs",
  "folder-notes",
  "update-time-on-edit",
  "obsidian-trash-explorer",
  "custom-sort",
  "homepage"
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

const init = initializeVaultCli([], "init");
assertInitializedEnvironment(init);
assertGuiLocale("en");

initializeVaultCli(["locale=ko", "force=true"], "ko locale init");
assertGuiLocale("ko");

initializeVaultCli(["locale=en", "force=true"], "en locale init");
assertGuiLocale("en");

const today = todayIso();
assertGuiJournalCommand(today);

const scenario = runWorkflowScenario(today);
assertDryRunInit();
assertWorkflowFiles(scenario);

console.log(JSON.stringify(smokeSummary(scenario), null, 2));

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

function initializeVaultCli(extraArgs = [], label = "init") {
  const payload = cliJson("para-zk:init", [
    ...extraArgs,
    `installDeps=${installDeps}`,
    "format=json"
  ]);
  assert(payload.ok === true, `${label} failed`);
  return payload;
}

function assertInitializedEnvironment(initPayload) {
  assert(
    Array.isArray(initPayload.warnings) && initPayload.warnings.length === 0,
    `init warnings: ${JSON.stringify(initPayload.warnings)}`
  );

  for (const id of requiredDependencyIds) {
    assertDependency(initPayload, id);
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

function runWorkflowScenario(today) {
  const areaTitle = `Smoke Area ${stamp}`;
  const linkedAreaTitle = `Smoke Linked Area ${stamp}`;
  const projectTitle = `Smoke Project ${stamp}`;
  const archiveProjectTitle = `Smoke Archive Project ${stamp}`;
  const renameProjectTitle = `Smoke Rename Project ${stamp}`;
  const renamedProjectTitle = `Smoke Renamed Project ${stamp}`;
  const renameAreaTitle = `Smoke Rename Area ${stamp}`;
  const renamedAreaTitle = `Smoke Renamed Area ${stamp}`;
  const renameNestedAreaTitle = `Smoke Rename Nested Area ${stamp}`;
  const renamedNestedAreaTitle = `Smoke Renamed Nested Area ${stamp}`;
  const renameAreaLinkProjectTitle = `Smoke Area Link Project ${stamp}`;
  const resourceTitle = `Smoke Resource ${stamp}`;
  const renameResourceTitle = `Smoke Rename Resource ${stamp}`;
  const renamedResourceTitle = `Smoke Renamed Resource ${stamp}`;
  const fleetingTitle = `Smoke Fleeting ${stamp}`;
  const permanentTitle = `Smoke Permanent ${stamp}`;
  const renameZkTitle = `Smoke Rename Permanent ${stamp}`;
  const renamedZkTitle = `Smoke Renamed Permanent ${stamp}`;

  const area = cliJson("para-zk:create-area", [
    `title=${areaTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(area, "area");

  const project = cliJson("para-zk:create-project", [
    `title=${projectTitle}`,
    `area_titles=${JSON.stringify([areaTitle, linkedAreaTitle])}`,
    "status=in_progress",
    "priority=high",
    "open=false",
    "format=json"
  ]);
  assertCreated(project, "project");
  assert(Array.isArray(project.areas), "project did not return resolved areas");

  const reusedArea = project.areas.find((item) => item.title === areaTitle);
  const createdArea = project.areas.find((item) => item.title === linkedAreaTitle);
  assert(reusedArea, "project did not return reused area");
  assert(createdArea, "project did not return created linked area");
  assert(reusedArea.created === false, "project did not reuse existing area");
  assert(createdArea.created === true, "project did not create missing area");
  assert(existsSync(join(vaultPath, createdArea.path)), `created linked area does not exist: ${createdArea.path}`);
  assertLegacyPathAliasRejected(project.path);

  const reference = cliJson("para-zk:add-reference", [
    `path=${project.path}`,
    "target=https://example.com/reference",
    "label=Reference URL",
    "open=false",
    "format=json"
  ]);
  assert(reference.ok === true, "reference add failed");
  assert(reference.added === true, "reference was not added");

  const subnote = cliJson("para-zk:create-subnote", [
    `title=Smoke Meeting ${stamp}`,
    `path=${project.path}`,
    "subnote_type=meeting",
    "open=false",
    "format=json"
  ]);
  assertCreated(subnote, "subnote");

  const projectRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "format=json"
  ]);
  assert(projectRead.ok === true, "project read failed");
  assert(projectRead.frontmatter?.status === "in_progress", "project read did not expose stable frontmatter");
  assert(projectRead.children?.[`Smoke Meeting ${stamp}`]?.path === subnote.path, "project read did not expose child map");
  assert(projectRead.children?.[`Smoke Meeting ${stamp}`]?.key === `children/Smoke Meeting ${stamp}`, "project read did not expose child key path");

  const projectStatusRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=frontmatter/status",
    "format=json"
  ]);
  assert(projectStatusRead.value === "in_progress", "project frontmatter/status key read failed");

  const projectChildrenRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=children",
    "format=json"
  ]);
  assert(projectChildrenRead.value?.[`Smoke Meeting ${stamp}`]?.path === subnote.path, "project children key read failed");

  const projectChildrenUpdateRejected = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=children",
    "op=set",
    "value=should fail",
    "format=json"
  ]);
  assert(projectChildrenUpdateRejected.ok === false, "project children map update was accepted");
  assert(
    typeof projectChildrenUpdateRejected.error === "string" && projectChildrenUpdateRejected.error.includes("read-only"),
    `project children map update error was not explicit: ${JSON.stringify(projectChildrenUpdateRejected)}`
  );

  const projectUpdateAliasRejected = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=summary",
    "operation=set",
    "value=should fail",
    "format=json"
  ]);
  assert(projectUpdateAliasRejected.ok === false, "update operation alias was accepted");
  assert(
    typeof projectUpdateAliasRejected.error === "string" && projectUpdateAliasRejected.error.includes("Use op instead of operation"),
    `update operation alias error was not explicit: ${JSON.stringify(projectUpdateAliasRejected)}`
  );

  const subnoteTypeRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    `key=children/Smoke Meeting ${stamp}/frontmatter/subnote_type`,
    "format=json"
  ]);
  assert(subnoteTypeRead.value === "meeting", "project child frontmatter key read failed");

  const archivedProject = createArchivedProjectCopy(project, projectTitle);
  const archivedProjectRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "archived=true",
    "format=json"
  ]);
  assert(archivedProjectRead.path === archivedProject.path, "archived project read selected the wrong path");
  assert(archivedProjectRead.archived === true, "archived project read did not mark archived=true");

  const archivedProjectStatusRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "archived=true",
    "key=frontmatter/status",
    "format=json"
  ]);
  assert(archivedProjectStatusRead.value === "archived", "archived project status key read failed");

  const archiveFlowProject = cliJson("para-zk:create-project", [
    `title=${archiveProjectTitle}`,
    "status=in_progress",
    "open=false",
    "format=json"
  ]);
  assertCreated(archiveFlowProject, "archive flow project");
  const archiveFlowArchivedPath = `PARA/Archives/Projects/${archiveProjectTitle}/${archiveProjectTitle}.md`;
  const archiveMove = cliJson("para-zk:update-project", [
    `title=${archiveProjectTitle}`,
    "key=frontmatter/status",
    "op=set",
    "value=archived",
    "format=json"
  ]);
  assert(archiveMove.moved === true, "project status archived did not move the project");
  assert(archiveMove.fromPath === archiveFlowProject.path, "project archive move returned wrong fromPath");
  assert(archiveMove.toPath === archiveFlowArchivedPath, "project archive move returned wrong toPath");
  assertFileExists(archiveFlowArchivedPath, "archived project was not moved to archive folder");
  assert(!existsSync(join(vaultPath, archiveFlowProject.path)), "project archive left the active project path behind");

  const archiveFlowRead = cliJson("para-zk:read-project", [
    `title=${archiveProjectTitle}`,
    "archived=true",
    "key=frontmatter/status",
    "format=json"
  ]);
  assert(archiveFlowRead.value === "archived", "archived project status read after move failed");

  const restoreMove = cliJson("para-zk:update-project", [
    `title=${archiveProjectTitle}`,
    "archived=true",
    "key=frontmatter/status",
    "op=set",
    "value=in_progress",
    "format=json"
  ]);
  assert(restoreMove.moved === true, "project status restore did not move the project");
  assert(restoreMove.fromPath === archiveFlowArchivedPath, "project restore returned wrong fromPath");
  assert(restoreMove.toPath === archiveFlowProject.path, "project restore returned wrong toPath");
  assertFileExists(archiveFlowProject.path, "restored project was not moved back to active folder");
  assert(!existsSync(join(vaultPath, archiveFlowArchivedPath)), "project restore left the archived project path behind");

  const renameProject = cliJson("para-zk:create-project", [
    `title=${renameProjectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(renameProject, "rename project");
  const renameProjectSubnote = cliJson("para-zk:create-subnote", [
    `title=Smoke Rename Child ${stamp}`,
    `path=${renameProject.path}`,
    "subnote_type=free",
    "open=false",
    "format=json"
  ]);
  assertCreated(renameProjectSubnote, "rename project child");
  const renameAliasRejected = cliJson("para-zk:rename-project", [
    `title=${renameProjectTitle}`,
    `newTitle=${renamedProjectTitle}`,
    "format=json"
  ]);
  assert(renameAliasRejected.ok === false, "rename newTitle alias was accepted");
  assert(
    typeof renameAliasRejected.error === "string" && renameAliasRejected.error.includes("Use new_title instead of newTitle"),
    `rename newTitle alias error was not explicit: ${JSON.stringify(renameAliasRejected)}`
  );

  const renamedProject = cliJson("para-zk:rename-project", [
    `title=${renameProjectTitle}`,
    `new_title=${renamedProjectTitle}`,
    "format=json"
  ]);
  const renamedProjectPath = `PARA/Projects/${renamedProjectTitle}/${renamedProjectTitle}.md`;
  const renamedProjectChildPath = `PARA/Projects/${renamedProjectTitle}/Smoke Rename Child ${stamp}.md`;
  assert(renamedProject.path === renamedProjectPath, "rename-project returned wrong path");
  assertFileExists(renamedProjectPath, "renamed project file is missing");
  assertFileExists(renamedProjectChildPath, "renamed project child did not move with folder");
  assert(!existsSync(join(vaultPath, renameProject.path)), "rename-project left the old project file behind");

  const projectPriorityUpdate = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=frontmatter/priority",
    "op=set",
    "value=medium",
    "format=json"
  ]);
  assert(projectPriorityUpdate.changed === true, "project priority update did not report a change");

  const projectSummarySet = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=summary",
    "op=set",
    `value=Smoke summary draft ${stamp}`,
    "format=json"
  ]);
  assert(projectSummarySet.changed === true, "project summary set did not report a change");

  const projectSummaryReplace = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=summary",
    "op=replace",
    `match=summary draft ${stamp}`,
    `with=summary updated ${stamp}`,
    "format=json"
  ]);
  assert(projectSummaryReplace.matches === 1, "project summary replace did not report one match");

  const projectSummaryRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=summary",
    "format=json"
  ]);
  assert(projectSummaryRead.value === `Smoke summary updated ${stamp}`, "project summary update read failed");

  const childBodyAppend = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=children/Smoke Meeting ${stamp}/body`,
    "op=append",
    `value=Smoke child body update ${stamp}`,
    "format=json"
  ]);
  assert(childBodyAppend.path === subnote.path && childBodyAppend.changed === true, "project child body update failed");

  const childBodyRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    `key=children/Smoke Meeting ${stamp}/body`,
    "format=json"
  ]);
  assert(String(childBodyRead.value).includes(`Smoke child body update ${stamp}`), "project child body update read failed");

  const subarea = cliJson("para-zk:create-subarea", [
    `title=Smoke Subarea ${stamp}`,
    `path=${area.path}`,
    "inheritParentTag=true",
    "open=false",
    "format=json"
  ]);
  assertCreated(subarea, "subarea");

  const areaChildrenRead = cliJson("para-zk:read-area", [
    `title=${areaTitle}`,
    "key=children",
    "format=json"
  ]);
  assert(areaChildrenRead.value?.[`Smoke Subarea ${stamp}`]?.path === subarea.path, "area children key read failed");

  const subareaOverviewRead = cliJson("para-zk:read-area", [
    `title=${areaTitle}`,
    `key=children/Smoke Subarea ${stamp}/overview`,
    "format=json"
  ]);
  assert(subareaOverviewRead.ok === true, "area child overview key read failed");

  const areaChildOverviewUpdate = cliJson("para-zk:update-area", [
    `title=${areaTitle}`,
    `key=children/Smoke Subarea ${stamp}/overview`,
    "op=set",
    `value=Smoke subarea overview ${stamp}`,
    "format=json"
  ]);
  assert(areaChildOverviewUpdate.path === subarea.path && areaChildOverviewUpdate.changed === true, "area child overview update failed");

  const renameArea = cliJson("para-zk:create-area", [
    `title=${renameAreaTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(renameArea, "rename area");
  const renameNestedArea = cliJson("para-zk:create-subarea", [
    `title=${renameNestedAreaTitle}`,
    `path=${renameArea.path}`,
    "inheritParentTag=true",
    "open=false",
    "format=json"
  ]);
  assertCreated(renameNestedArea, "rename nested area");
  const renameAreaLinkProject = cliJson("para-zk:create-project", [
    `title=${renameAreaLinkProjectTitle}`,
    `area_titles=${JSON.stringify([renameAreaTitle])}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(renameAreaLinkProject, "rename area link project");
  const renamedArea = cliJson("para-zk:rename-area", [
    `title=${renameAreaTitle}`,
    `new_title=${renamedAreaTitle}`,
    "format=json"
  ]);
  const renamedAreaPath = `PARA/Areas/${renamedAreaTitle}/${renamedAreaTitle}.md`;
  const movedNestedAreaPath = `PARA/Areas/${renamedAreaTitle}/${renameNestedAreaTitle}/${renameNestedAreaTitle}.md`;
  const renamedAreaSlug = smokeSlug(renamedAreaTitle);
  const renameAreaSlug = smokeSlug(renameAreaTitle);
  const renameNestedAreaSlug = smokeSlug(renameNestedAreaTitle);
  assert(renamedArea.path === renamedAreaPath, "rename-area returned wrong path");
  assertFileExists(renamedAreaPath, "renamed area file is missing");
  assertFileExists(movedNestedAreaPath, "nested area did not move with renamed parent area");
  assert(!existsSync(join(vaultPath, renameArea.path)), "rename-area left the old area file behind");
  assertFileContainsAny(renameAreaLinkProject.path, [
    `[[PARA/Areas/${renamedAreaTitle}/${renamedAreaTitle}.md|${renamedAreaTitle}]]`,
    `[[PARA/Areas/${renamedAreaTitle}/${renamedAreaTitle}|${renamedAreaTitle}]]`,
    `[[${renamedAreaTitle}|${renamedAreaTitle}]]`
  ]);
  assertFileNotContains(renameAreaLinkProject.path, [
    renameAreaTitle
  ]);
  assertFileContains(movedNestedAreaPath, [
    `  - area/${renamedAreaSlug}`,
    `  - area/${renamedAreaSlug}/${renameNestedAreaSlug}`
  ]);
  assertFileNotContains(movedNestedAreaPath, [
    `  - area/${renameAreaSlug}`
  ]);

  const renamedNestedArea = cliJson("para-zk:rename-area", [
    `title=${renameNestedAreaTitle}`,
    `new_title=${renamedNestedAreaTitle}`,
    "format=json"
  ]);
  const renamedNestedAreaPath = `PARA/Areas/${renamedAreaTitle}/${renamedNestedAreaTitle}/${renamedNestedAreaTitle}.md`;
  const renamedNestedAreaSlug = smokeSlug(renamedNestedAreaTitle);
  assert(renamedNestedArea.path === renamedNestedAreaPath, "rename nested area returned wrong path");
  assertFileExists(renamedNestedAreaPath, "renamed nested area file is missing");
  assertFileContains(renamedNestedAreaPath, [
    `  - area/${renamedAreaSlug}`,
    `  - area/${renamedAreaSlug}/${renamedNestedAreaSlug}`
  ]);
  assertFileNotContains(renamedNestedAreaPath, [
    `  - area/${renamedNestedAreaSlug}`
  ]);

  const resource = cliJson("para-zk:create-resource", [
    `title=${resourceTitle}`,
    `path=${project.path}`,
    "link=true",
    "open=false",
    "format=json"
  ]);
  assertCreated(resource, "resource");
  assert(resource.linkedFromSource === true, "resource was not linked from source");

  const resourceRead = cliJson("para-zk:read-resource", [
    `title=${resourceTitle}`,
    "key=body",
    "format=json"
  ]);
  assert(resourceRead.ok === true && typeof resourceRead.value === "string", "resource body key read failed");

  const resourceBodySet = cliJson("para-zk:update-resource", [
    `title=${resourceTitle}`,
    "key=body",
    "op=set",
    `value=repeat ${stamp}\\nrepeat ${stamp}`,
    "format=json"
  ]);
  assert(resourceBodySet.changed === true, "resource body set failed");

  const resourceDuplicateReplace = cliJson("para-zk:update-resource", [
    `title=${resourceTitle}`,
    "key=body",
    "op=replace",
    `match=repeat ${stamp}`,
    `with=Smoke resource body updated ${stamp}`,
    "format=json"
  ]);
  assert(resourceDuplicateReplace.ok === false, "duplicate resource body replace was accepted without all=true");
  assert(
    typeof resourceDuplicateReplace.error === "string" && resourceDuplicateReplace.error.includes("matched 2 times"),
    `duplicate resource body replace error was not explicit: ${JSON.stringify(resourceDuplicateReplace)}`
  );

  const resourceBodyReplace = cliJson("para-zk:update-resource", [
    `title=${resourceTitle}`,
    "key=body",
    "op=replace",
    `match=repeat ${stamp}`,
    `with=Smoke resource body updated ${stamp}`,
    "all=true",
    "format=json"
  ]);
  assert(resourceBodyReplace.matches === 2, "resource body replace all did not report two matches");

  const renameResource = cliJson("para-zk:create-resource", [
    `title=${renameResourceTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(renameResource, "rename resource");
  const renamedResource = cliJson("para-zk:rename-resource", [
    `title=${renameResourceTitle}`,
    `new_title=${renamedResourceTitle}`,
    "format=json"
  ]);
  const renamedResourcePath = `PARA/Resources/${renamedResourceTitle}.md`;
  assert(renamedResource.path === renamedResourcePath, "rename-resource returned wrong path");
  assertFileExists(renamedResourcePath, "renamed resource file is missing");
  assert(!existsSync(join(vaultPath, renameResource.path)), "rename-resource left the old resource file behind");

  const fleeting = cliJson("para-zk:create-zk", [
    `title=${fleetingTitle}`,
    "kind=fleeting",
    "open=false",
    "format=json"
  ]);
  assertCreated(fleeting, "fleeting");

  const permanent = cliJson("para-zk:create-zk", [
    `title=${permanentTitle}`,
    "kind=permanent",
    "maturity=refined",
    "open=false",
    "format=json"
  ]);
  assertCreated(permanent, "permanent");

  const zkRead = cliJson("para-zk:read-zk", [
    `title=${permanentTitle}`,
    "kind=permanent",
    "key=frontmatter/maturity",
    "format=json"
  ]);
  assert(zkRead.value === "refined", "ZK frontmatter/maturity key read failed");

  const zkMaturityUpdate = cliJson("para-zk:update-zk", [
    `title=${permanentTitle}`,
    "kind=permanent",
    "key=frontmatter/maturity",
    "op=set",
    "value=evergreen",
    "format=json"
  ]);
  assert(zkMaturityUpdate.changed === true, "ZK maturity update failed");

  const renameZk = cliJson("para-zk:create-zk", [
    `title=${renameZkTitle}`,
    "kind=permanent",
    "maturity=draft",
    "open=false",
    "format=json"
  ]);
  assertCreated(renameZk, "rename ZK");
  const renamedZk = cliJson("para-zk:rename-zk", [
    `title=${renameZkTitle}`,
    "kind=permanent",
    `new_title=${renamedZkTitle}`,
    "format=json"
  ]);
  const renamedZkPath = `ZK/Permanent/${renamedZkTitle}.md`;
  assert(renamedZk.path === renamedZkPath, "rename-zk returned wrong path");
  assertFileExists(renamedZkPath, "renamed ZK file is missing");
  assert(!existsSync(join(vaultPath, renameZk.path)), "rename-zk left the old ZK file behind");

  const journal = cliJson("para-zk:capture-journal", [
    `content=Smoke memo ${stamp}`,
    `date=${today}`,
    "time=09:01",
    "energy=high",
    "open=false",
    "format=json"
  ]);
  assert(journal.ok === true, "journal capture failed");

  const journalRead = cliJson("para-zk:read-journal", [
    `date=${today}`,
    "key=quick_memo",
    "format=json"
  ]);
  assert(typeof journalRead.value === "string" && journalRead.value.includes(`Smoke memo ${stamp}`), "journal quick_memo key read failed");

  const journalUpdate = cliJson("para-zk:update-journal", [
    `date=${today}`,
    "key=quick_memo",
    "op=append",
    `value=Smoke journal update ${stamp}`,
    "format=json"
  ]);
  assert(journalUpdate.changed === true, "journal quick_memo update failed");

  const retro = cliJson("para-zk:create-retro", [
    `path=${project.path}`,
    `date=${today}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(retro, "retro");

  const retroRead = cliJson("para-zk:read-retro", [
    `path=${retro.path}`,
    "key=frontmatter/week_iso",
    "format=json"
  ]);
  assert(typeof retroRead.value === "string" && retroRead.value.length > 0, "retro week_iso key read failed");

  const retroUpdate = cliJson("para-zk:update-retro", [
    `path=${retro.path}`,
    "key=next_actions",
    "op=set",
    `value=- [ ] Smoke retro action ${stamp}`,
    "format=json"
  ]);
  assert(retroUpdate.changed === true, "retro next_actions update failed");

  const promotedResource = cliJson("para-zk:promote-resource", [
    `path=${resource.path}`,
    `title=Smoke Resource Promoted ${stamp}`,
    "kind=literature",
    "open=false",
    "format=json"
  ]);
  assertCreated(promotedResource, "promoted resource");

  const promotedFleeting = cliJson("para-zk:promote-fleeting", [
    `path=${fleeting.path}`,
    `title=Smoke Fleeting Promoted ${stamp}`,
    "kind=permanent",
    "maturity=evergreen",
    "open=false",
    "format=json"
  ]);
  assertCreated(promotedFleeting, "promoted fleeting");

  return {
    area,
    createdArea,
    reference,
    project,
    archiveFlowProject,
    renamedProject,
    renamedProjectPath,
    renamedProjectChildPath,
    archivedProject,
    subnote,
    subarea,
    renamedArea,
    renamedAreaPath,
    renamedNestedArea,
    renamedNestedAreaPath,
    renameAreaLinkProject,
    resource,
    renamedResource,
    renamedResourcePath,
    fleeting,
    permanent,
    renamedZk,
    renamedZkPath,
    journal,
    retro,
    promotedResource,
    promotedFleeting
  };
}

function assertLegacyPathAliasRejected(projectPath) {
  const rejected = cliJson("para-zk:create-subnote", [
    `title=Legacy Alias ${stamp}`,
    `file_path=${projectPath}`,
    "format=json"
  ]);
  assert(rejected.ok === false, "legacy file_path alias was accepted");
  assert(
    typeof rejected.error === "string" && rejected.error.includes("Use path instead of file_path"),
    `legacy file_path alias error was not explicit: ${JSON.stringify(rejected)}`
  );
}

function createArchivedProjectCopy(project, title) {
  const archived = guiJson(`(async () => {
    const sourcePath = ${JSON.stringify(project.path)};
    const title = ${JSON.stringify(title)};
    const folder = ["PARA/Archives/Projects", title].join("/");
    const targetPath = [folder, title + ".md"].join("/");

    async function ensureFolder(path) {
      let current = "";
      for (const part of path.split("/").filter(Boolean)) {
        current = current ? current + "/" + part : part;
        if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
      }
    }

    await ensureFolder(folder);
    const source = app.vault.getFileByPath(sourcePath);
    if (!source) throw new Error("source project not found: " + sourcePath);

    const existing = app.vault.getFileByPath(targetPath);
    const content = await app.vault.read(source);
    const target = existing ?? (await app.vault.create(targetPath, content));
    if (existing) await app.vault.modify(existing, content);
    await app.fileManager.processFrontMatter(target, (fm) => {
      fm.status = "archived";
    });

    for (let index = 0; index < 20; index += 1) {
      if (app.metadataCache.getFileCache(target)?.frontmatter?.status === "archived") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(JSON.stringify({ ok: true, path: targetPath }));
  })()`);

  assert(archived.ok === true, "archived project copy failed");
  return archived;
}

function assertDryRunInit() {
  const dryRun = cliJson("para-zk:init", [
    "dryRun=true",
    "format=json"
  ]);
  assert(dryRun.ok === true, "dry-run init failed");
  assert(Array.isArray(dryRun.created) && dryRun.created.length === 0, "dry-run init reported created files");
  assert(Array.isArray(dryRun.updated) && dryRun.updated.length === 0, "dry-run init reported updated files");
  assert(Array.isArray(dryRun.skipped) && dryRun.skipped.length === 0, "dry-run init reported skipped files");
  assert(Array.isArray(dryRun.warnings) && dryRun.warnings.length === 0, "dry-run init reported warnings");
}

function assertWorkflowFiles(result) {
  assertFileContains(result.project.path, [
    "status: in_progress",
    "priority: medium",
    `Smoke summary updated ${stamp}`,
    result.area.path,
    result.createdArea.path,
    "[Reference URL](https://example.com/reference)",
    `[[${result.resource.path}|${result.resource.title}]]`
  ]);
  assertFileContains(result.archiveFlowProject.path, [
    "status: in_progress"
  ]);
  assertFileContains(result.renamedProjectPath, [
    "type: project",
    "project/smoke_renamed_project"
  ]);
  assertFileContains(result.renamedProjectChildPath, [
    "type: doc"
  ]);
  assertFileContains(result.archivedProject.path, [
    "status: archived"
  ]);
  assertFileContains(result.subnote.path, [
    "type: doc",
    "subnote_type: meeting",
    result.project.path,
    `Smoke child body update ${stamp}`
  ]);
  assertFileContains(result.subarea.path, [
    "type: area",
    result.area.path,
    `Smoke subarea overview ${stamp}`
  ]);
  assertFileContains(result.renamedAreaPath, [
    "type: area",
    "area/smoke_renamed_area"
  ]);
  assertFileContains(result.renamedNestedAreaPath, [
    "type: area",
    `area/${smokeSlug(result.renamedArea.title)}/${smokeSlug(result.renamedNestedArea.title)}`
  ]);
  assertFileContains(result.resource.path, [
    `Smoke resource body updated ${stamp}`
  ]);
  assertFileContains(result.renamedResourcePath, [
    "type: resource",
    "resource/smoke_renamed_resource"
  ]);
  assertFileContains(result.permanent.path, [
    "type: zk_permanent",
    "maturity: evergreen"
  ]);
  assertFileContains(result.renamedZkPath, [
    "type: zk_permanent",
    "knowledge/smoke_renamed_permanent"
  ]);
  assertFileContains(result.promotedResource.path, [
    "type: zk_literature",
    `[[${result.resource.path}]]`
  ]);
  assertFileContains(result.promotedFleeting.path, [
    "type: zk_permanent",
    "maturity: evergreen",
    `[[${result.fleeting.path}]]`
  ]);
  assertFileContains(result.fleeting.path, [
    "processed: true",
    result.promotedFleeting.path
  ]);
  assert(existsSync(join(vaultPath, result.fleeting.path)), "fleeting source should remain in place after promotion");
  assertFileContains(result.journal.path, [
    `Smoke memo ${stamp}`,
    `Smoke journal update ${stamp}`
  ]);
  assertFileContains(result.retro.path, [
    "type: retro",
    result.project.path,
    `Smoke retro action ${stamp}`
  ]);
}

function smokeSummary(result) {
  return {
    ok: true,
    vaultPath,
    stamp,
    paths: {
      area: result.area.path,
      project: result.project.path,
      archiveFlowProject: result.archiveFlowProject.path,
      renamedProject: result.renamedProject.path,
      archivedProject: result.archivedProject.path,
      subnote: result.subnote.path,
      subarea: result.subarea.path,
      renamedArea: result.renamedArea.path,
      renamedNestedArea: result.renamedNestedArea.path,
      resource: result.resource.path,
      renamedResource: result.renamedResource.path,
      renamedZk: result.renamedZk.path,
      promotedResource: result.promotedResource.path,
      promotedFleeting: result.promotedFleeting.path,
      journal: result.journal.path,
      retro: result.retro.path
    }
  };
}

function parseArgs(rawArgs) {
  const parsed = {
    build: true,
    clean: false,
    installDeps: true
  };

  for (const arg of rawArgs) {
    if (arg === "--clean") {
      parsed.clean = true;
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
  console.log(`Usage: npm run smoke:vault -- [--vault <path>] [--clean] [--no-build] [--no-install-deps]

Options:
  --vault <path>       Disposable test vault path. Defaults to PARA_ZK_TEST_VAULT or a local para-zk vault.
  --clean              Delete all top-level vault contents except .obsidian and remove para-zk plugin data.
  --no-build           Skip npm run build and plugin sync.
  --no-install-deps    Run para-zk:init without installing required dependencies.
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

function assertDependency(initPayload, id) {
  const dependency = initPayload.dependencies?.find((item) => item.id === id);
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
  for (const filter of ["Templates/", "Dashboard/", "README"]) {
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

  for (const folder of ["Templates", "Dashboard", "assets", "README"]) {
    assert(config.ignoreGlobalFolder?.includes(folder), `update-time-on-edit ignoreGlobalFolder is missing ${folder}`);
  }
  for (const folder of ["Templates", "Dashboard", "README"]) {
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

function smokeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_\/]+/g, "_")
    .replace(/-/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "untitled";
}

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
