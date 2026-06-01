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
  const referenceOnlyResourceTitle = `Smoke Reference Only Resource ${stamp}`;
  const renameResourceTitle = `Smoke Rename Resource ${stamp}`;
  const renamedResourceTitle = `Smoke Renamed Resource ${stamp}`;
  const deleteAreaTitle = `Smoke Delete Area ${stamp}`;
  const deleteAreaProjectTitle = `Smoke Delete Area Project ${stamp}`;
  const deleteResourceTitle = `Smoke Delete Resource ${stamp}`;
  const deleteProjectTitle = `Smoke Delete Project ${stamp}`;
  const deleteZkTitle = `Smoke Delete Permanent ${stamp}`;
  const fleetingTitle = `Smoke Fleeting ${stamp}`;
  const permanentTitle = `Smoke Permanent ${stamp}`;
  const renameZkTitle = `Smoke Rename Permanent ${stamp}`;
  const renamedZkTitle = `Smoke Renamed Permanent ${stamp}`;
  const deleteJournalDate = "2026-01-15";

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
  assertCanonicalCliAliasesRejected(project.path);

  const reference = cliJson("para-zk:add-reference", [
    `path=${project.path}`,
    "target=https://example.com/reference",
    "label=Reference URL",
    "open=false",
    "format=json"
  ]);
  assert(reference.ok === true, "reference add failed");
  assert(reference.added === true, "reference was not added");
  assert(reference.index === 0, "reference add did not return index 0");
  assert(reference.link === "https://example.com/reference", "reference add did not return canonical link");
  const rawReferenceUpdateRejected = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=references",
    "op=append",
    "value=https://example.com/raw-reference-update",
    "format=json"
  ]);
  assert(rawReferenceUpdateRejected.ok === false, "raw reference update was accepted");
  assert(
    typeof rawReferenceUpdateRejected.error === "string" && rawReferenceUpdateRejected.error.includes("op=insert"),
    `raw reference update error was not explicit: ${JSON.stringify(rawReferenceUpdateRejected)}`
  );

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
  assert(!("keys" in projectRead), "project read should not return static schema keys");
  assert(projectRead.mode === "compact" && projectRead.omits_empty === true, "project read did not expose compact mode metadata");
  assert(projectRead.children?.[`Smoke Meeting ${stamp}`]?.key === undefined, "project child read should not repeat derived key paths");
  assert(projectRead.tasks === undefined, "project read should omit the blank task placeholder");
  assert(projectRead.references?.count === 1, "project read did not summarize references");

  const projectStatusRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=frontmatter/status",
    "format=json"
  ]);
  assert(projectStatusRead.value === "in_progress", "project frontmatter/status key read failed");
  assert(projectStatusRead.mode === "exact", "project key read did not expose exact mode");

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
  const archiveFlowTaskName = `Smoke archive flow task ${stamp}`;
  const archiveFlowTaskInsert = cliJson("para-zk:update-project", [
    `title=${archiveProjectTitle}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ name: archiveFlowTaskName })}`,
    "format=json"
  ]);
  assert(archiveFlowTaskInsert.changed === true, "archive flow task insert failed");
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
  const archiveFlowArchivedTasks = cliJson("para-zk:read-project", [
    `title=${archiveProjectTitle}`,
    "archived=true",
    "key=tasks",
    `query=${archiveFlowTaskName}`,
    "format=json"
  ]);
  assert(archiveFlowArchivedTasks.value?.count === 1, "archived project task read after move failed");
  assertTaskRegistryEntryContains(archiveFlowTaskName, [], "archives");
  assertTaskRegistryEntryMissing(archiveFlowTaskName, "current");

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
  const archiveFlowRestoredTasks = cliJson("para-zk:read-project", [
    `title=${archiveProjectTitle}`,
    "key=tasks",
    `query=${archiveFlowTaskName}`,
    "format=json"
  ]);
  assert(archiveFlowRestoredTasks.value?.count === 1, "restored project task read after move failed");
  assertTaskRegistryEntryContains(archiveFlowTaskName, [], "current");
  assertTaskRegistryEntryMissing(archiveFlowTaskName, "archives");

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
  const renameProjectRetro = cliJson("para-zk:create-retro", [
    `path=${renameProject.path}`,
    `date=${today}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(renameProjectRetro, "rename project retro");
  const renameProjectRetroTaskName = `Smoke rename project retro task ${stamp}`;
  const renameProjectRetroTask = cliJson("para-zk:update-retro", [
    `path=${renameProjectRetro.path}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ name: renameProjectRetroTaskName })}`,
    "format=json"
  ]);
  assert(renameProjectRetroTask.changed === true, "rename project retro task setup failed");
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
  const renamedProjectRetroPath = renameProjectRetro.path.replace(renameProjectTitle, renamedProjectTitle);
  assert(renamedProject.path === renamedProjectPath, "rename-project returned wrong path");
  assertFileExists(renamedProjectPath, "renamed project file is missing");
  assertFileExists(renamedProjectChildPath, "renamed project child did not move with folder");
  assertFileExists(renamedProjectRetroPath, "project-scoped retro did not rename with project");
  assert(!existsSync(join(vaultPath, renameProject.path)), "rename-project left the old project file behind");
  assert(!existsSync(join(vaultPath, renameProjectRetro.path)), "rename-project left the old project-scoped retro file behind");
  assert(
    renamedProject.renamedRetros?.some((item) => item.fromPath === renameProjectRetro.path && item.toPath === renamedProjectRetroPath),
    "rename-project did not report renamed project-scoped retro"
  );
  const renamedProjectRetroTasks = cliJson("para-zk:read-retro", [
    `path=${renamedProjectRetroPath}`,
    "key=tasks",
    `query=${renameProjectRetroTaskName}`,
    "format=json"
  ]);
  assert(renamedProjectRetroTasks.value?.count === 1, "renamed project retro task read failed");
  assertTaskRegistryEntryContains(renameProjectRetroTaskName, []);

  const deleteProject = cliJson("para-zk:create-project", [
    `title=${deleteProjectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(deleteProject, "delete project");
  const deleteProjectChild = cliJson("para-zk:create-subnote", [
    `title=Smoke Delete Child ${stamp}`,
    `path=${deleteProject.path}`,
    "subnote_type=free",
    "open=false",
    "format=json"
  ]);
  assertCreated(deleteProjectChild, "delete project child");
  const deleteProjectRejected = cliJson("para-zk:delete-project", [
    `title=${deleteProjectTitle}`,
    "format=json"
  ]);
  assert(deleteProjectRejected.ok === false, "delete-project accepted child files without force=true");
  assert(
    typeof deleteProjectRejected.error === "string" && deleteProjectRejected.error.includes("force=true"),
    `delete-project force error was not explicit: ${JSON.stringify(deleteProjectRejected)}`
  );
  const deletedProject = cliJson("para-zk:delete-project", [
    `title=${deleteProjectTitle}`,
    "force=true",
    "format=json"
  ]);
  assert(deletedProject.ok === true && deletedProject.trashed === true, "delete-project force failed");
  assert(deletedProject.trashMethod !== "trash-explorer", "delete-project depended on Trash Explorer");
  assertFileMissing(deleteProject.path, "delete-project left project file behind");
  assertFileMissing(deleteProjectChild.path, "delete-project left child file behind");

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

  const projectTaskInsert = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ name: `Smoke structured task ${stamp}`, due: "2026-06-05", priority: "high" })}`,
    "format=json"
  ]);
  assert(projectTaskInsert.changed === true, "project task insert failed");
  assertTaskRegistryEntryContains(`Smoke structured task ${stamp}`, [
    "\u{1F194}",
    "\u{23EB}",
    "\u{1F4C5} 2026-06-05"
  ]);
  assertTaskRegistryExcludes(["[id::", "[priority::", "[due::", "pzt_"]);
  assertTaskRegistryFileNamesExclude(["pzr_"]);
  assertTaskRegistryFilesStartWith("# Tasks");
  assertTaskRegistryExcludes(["type: para_zk_tasks", "root_id:", "root_path:", "root_type:"]);
  const projectRawTaskInsertRejected = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "op=insert",
    `value=- [ ] Smoke raw task ${stamp}`,
    "format=json"
  ]);
  assert(projectRawTaskInsertRejected.ok === false, "project raw task insert was accepted");
  assert(
    typeof projectRawTaskInsertRejected.error === "string" && projectRawTaskInsertRejected.error.includes("value_json object"),
    `project raw task insert error was not explicit: ${JSON.stringify(projectRawTaskInsertRejected)}`
  );

  const projectTasksRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "format=json"
  ]);
  const projectTasks = projectTasksRead.value?.items ?? {};
  const structuredTaskEntry = Object.entries(projectTasks)
    .find(([, task]) => task.name === `Smoke structured task ${stamp}`);
  const structuredTaskId = structuredTaskEntry?.[0];
  const structuredTask = structuredTaskEntry?.[1];
  assert(structuredTask, `project task read did not expose the inserted task: ${JSON.stringify(projectTasksRead.value)}`);
  assert(projectTasksRead.value?.count >= 1 && projectTasksRead.value?.returned >= 1, "project task collection read did not expose page metadata");
  assert(typeof structuredTaskId === "string" && structuredTaskId.length > 0, "project task read did not expose a task id");
  assert(isShortTaskId(structuredTaskId), `project task id is not a short id: ${structuredTaskId}`);
  assert(structuredTask.checkbox === " ", "project task read did not preserve checkbox status");
  assert(structuredTask.due === "2026-06-05", "project task read did not parse the due date");
  assert(structuredTask.priority === "high", "project task read did not parse the priority");
  const projectTaskNameRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    `key=tasks/${structuredTaskId}/name`,
    "format=json"
  ]);
  assert(projectTaskNameRead.value === `Smoke structured task ${stamp}`, "project task map path read failed");
  const projectPositionedTaskInsert = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ name: `Smoke positioned task ${stamp}`, position: 1 })}`,
    "format=json"
  ]);
  assert(projectPositionedTaskInsert.changed === true, "project positioned task insert failed");
  const projectPositionedTaskRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "limit=1",
    "format=json"
  ]);
  assert(
    Object.values(projectPositionedTaskRead.value?.items ?? {})[0]?.name === `Smoke positioned task ${stamp}`,
    "project positioned task insert did not preserve order"
  );
  const projectTaskCheckboxUpdate = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=tasks/${structuredTaskId}/checkbox`,
    "op=set",
    "value=/",
    "format=json"
  ]);
  assert(projectTaskCheckboxUpdate.changed === true, "project task checkbox update failed");
  const projectTaskFieldJsonRejected = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=tasks/${structuredTaskId}/checkbox`,
    "op=set",
    `value_json=${JSON.stringify("/")}`,
    "format=json"
  ]);
  assert(projectTaskFieldJsonRejected.ok === false, "project task field value_json update was accepted");
  assert(
    typeof projectTaskFieldJsonRejected.error === "string" && projectTaskFieldJsonRejected.error.includes("task field updates require value"),
    `project task field value_json error was not explicit: ${JSON.stringify(projectTaskFieldJsonRejected)}`
  );
  const projectTaskInvalidCheckboxRejected = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=tasks/${structuredTaskId}/checkbox`,
    "op=set",
    "value=]",
    "format=json"
  ]);
  assert(projectTaskInvalidCheckboxRejected.ok === false, "project invalid task checkbox was accepted");
  assert(
    typeof projectTaskInvalidCheckboxRejected.error === "string" && projectTaskInvalidCheckboxRejected.error.includes("single status character"),
    `project invalid task checkbox error was not explicit: ${JSON.stringify(projectTaskInvalidCheckboxRejected)}`
  );
  const projectTaskNameUpdate = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=tasks/${structuredTaskId}/name`,
    "op=set",
    `value=Smoke renamed structured task ${stamp}`,
    "format=json"
  ]);
  assert(projectTaskNameUpdate.changed === true, "project task name update failed");
  const projectTaskMultilineNameRejected = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=tasks/${structuredTaskId}/name`,
    "op=set",
    "value=Invalid\\nTask",
    "format=json"
  ]);
  assert(projectTaskMultilineNameRejected.ok === false, "project multiline task name was accepted");
  assert(
    typeof projectTaskMultilineNameRejected.error === "string" && projectTaskMultilineNameRejected.error.includes("single line"),
    `project multiline task name error was not explicit: ${JSON.stringify(projectTaskMultilineNameRejected)}`
  );
  const projectTaskAfterUpdateRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    `key=tasks/${structuredTaskId}`,
    "format=json"
  ]);
  assert(projectTaskAfterUpdateRead.value?.checkbox === "/", "project task checkbox field update was not readable");
  assert(projectTaskAfterUpdateRead.value?.name === `Smoke renamed structured task ${stamp}`, "project task name field update was not readable");
  const projectCustomCheckboxTaskInsert = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ checkbox: "/", name: `Smoke custom checkbox task ${stamp}` })}`,
    "format=json"
  ]);
  assert(projectCustomCheckboxTaskInsert.changed === true, "project custom checkbox task insert failed");
  const projectCustomCheckboxTasksRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "checkbox=/",
    "format=json"
  ]);
  const customCheckboxTask = Object.values(projectCustomCheckboxTasksRead.value?.items ?? {})
    .find((task) => task.name === `Smoke custom checkbox task ${stamp}`);
  assert(customCheckboxTask?.checkbox === "/", "project task read did not preserve custom checkbox status");
  for (let index = 0; index < 11; index += 1) {
    const projectBulkTaskInsert = cliJson("para-zk:update-project", [
      `title=${projectTitle}`,
      "key=tasks",
      "op=insert",
      `value_json=${JSON.stringify({ name: `Smoke bulk task ${index + 1} ${stamp}` })}`,
      "format=json"
    ]);
    assert(projectBulkTaskInsert.changed === true, `project bulk task insert ${index + 1} failed`);
  }
  const projectTaskCompactRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "format=json"
  ]);
  assert(projectTaskCompactRead.tasks?.count > 10, "project compact read did not summarize many tasks");
  assert(projectTaskCompactRead.tasks.preview === undefined, "project compact read should not include task previews");
  const projectTaskPageRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=tasks",
    "offset=5",
    "limit=3",
    "format=json"
  ]);
  assert(projectTaskPageRead.value?.offset === 5, "project task page did not preserve offset");
  assert(projectTaskPageRead.value?.limit === 3, "project task page did not preserve limit");
  assert(projectTaskPageRead.value?.returned === 3, "project task page did not return the requested page size");
  assert(Object.keys(projectTaskPageRead.value?.items ?? {}).length === 3, "project task page items size mismatch");
  assert(projectTaskPageRead.value?.has_more === true, "project task page did not report additional items");
  const projectTaskQueryRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=tasks",
    `query=Smoke bulk task 10 ${stamp}`,
    "format=json"
  ]);
  assert(projectTaskQueryRead.value?.count === 1, "project task query did not filter collection");
  const deleteTaskRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=tasks",
    `query=Smoke bulk task 11 ${stamp}`,
    "format=json"
  ]);
  const deleteTaskId = Object.keys(deleteTaskRead.value?.items ?? {})[0];
  assert(deleteTaskId, "project delete task setup did not find task id");
  const projectTaskDelete = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=tasks/${deleteTaskId}`,
    "op=delete",
    "format=json"
  ]);
  assert(projectTaskDelete.changed === true, "project task delete failed");
  const deleteTaskAfterRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=tasks",
    `query=Smoke bulk task 11 ${stamp}`,
    "format=json"
  ]);
  assert(deleteTaskAfterRead.value?.count === 0, "project deleted task was still readable");
  assertTaskBlockRendererRegression(project.path, `Smoke renamed structured task ${stamp}`);

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
  const renameAreaRetro = cliJson("para-zk:create-retro", [
    `path=${renameArea.path}`,
    `date=${today}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(renameAreaRetro, "rename area retro");
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
  const renamedAreaRetroPath = renameAreaRetro.path.replace(renameAreaTitle, renamedAreaTitle);
  const renamedAreaSlug = smokeSlug(renamedAreaTitle);
  const renameAreaSlug = smokeSlug(renameAreaTitle);
  const renameNestedAreaSlug = smokeSlug(renameNestedAreaTitle);
  assert(renamedArea.path === renamedAreaPath, "rename-area returned wrong path");
  assertFileExists(renamedAreaPath, "renamed area file is missing");
  assertFileExists(movedNestedAreaPath, "nested area did not move with renamed parent area");
  assertFileExists(renamedAreaRetroPath, "area-scoped retro did not rename with area");
  assert(!existsSync(join(vaultPath, renameArea.path)), "rename-area left the old area file behind");
  assert(!existsSync(join(vaultPath, renameAreaRetro.path)), "rename-area left the old area-scoped retro file behind");
  assert(
    renamedArea.renamedRetros?.some((item) => item.fromPath === renameAreaRetro.path && item.toPath === renamedAreaRetroPath),
    "rename-area did not report renamed area-scoped retro"
  );
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

  const deleteArea = cliJson("para-zk:create-area", [
    `title=${deleteAreaTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(deleteArea, "delete area");
  const deleteAreaProject = cliJson("para-zk:create-project", [
    `title=${deleteAreaProjectTitle}`,
    `area_titles=${JSON.stringify([deleteAreaTitle])}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(deleteAreaProject, "delete area project");
  const deleteAreaBodyLink = cliJson("para-zk:update-project", [
    `title=${deleteAreaProjectTitle}`,
    "key=summary",
    "op=set",
    `value=Body mention [[${deleteAreaTitle}]]`,
    "format=json"
  ]);
  assert(deleteAreaBodyLink.ok === true, "delete area body link setup failed");
  const deletedArea = cliJson("para-zk:delete-area", [
    `title=${deleteAreaTitle}`,
    "format=json"
  ]);
  assert(deletedArea.ok === true && deletedArea.trashed === true, "delete-area failed");
  assert(deletedArea.cleaned?.frontmatter >= 1, "delete-area did not clean project areas frontmatter");
  assertFileMissing(deleteArea.path, "delete-area left area file behind");
  assertFileNotContains(deleteAreaProject.path, [
    "areas:"
  ]);
  assertFileContains(deleteAreaProject.path, [
    `Body mention [[${deleteAreaTitle}]]`
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
  assertReferenceRegistryScenario({
    project,
    projectTitle,
    reference,
    resource,
    referenceOnlyResourceTitle
  });

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

  const deleteResource = cliJson("para-zk:create-resource", [
    `title=${deleteResourceTitle}`,
    `path=${project.path}`,
    "link=true",
    "open=false",
    "format=json"
  ]);
  assertCreated(deleteResource, "delete resource");
  assertFileContains(project.path, [
    deleteResource.path
  ]);
  run("optsidian", ["raw", "plugin:disable", "id=obsidian-trash-explorer"], { allowFailure: true });
  const deletedResource = cliJson("para-zk:delete-resource", [
    `title=${deleteResourceTitle}`,
    "format=json"
  ]);
  run("optsidian", ["raw", "plugin:enable", "id=obsidian-trash-explorer"], { allowFailure: true });
  assert(deletedResource.ok === true && deletedResource.trashed === true, "delete-resource failed");
  assert(deletedResource.trashMethod !== "trash-explorer", "delete-resource depended on Trash Explorer");
  assert(deletedResource.cleaned?.references >= 1, "delete-resource did not clean source frontmatter reference");
  assertFileMissing(deleteResource.path, "delete-resource left resource file behind");
  assertFileNotContains(project.path, [
    deleteResource.path
  ]);

  const fleeting = cliJson("para-zk:create-zk", [
    `title=${fleetingTitle}`,
    "kind=fleeting",
    "open=false",
    "format=json"
  ]);
  assertCreated(fleeting, "fleeting");
  const fleetingTasksRead = cliJson("para-zk:read-zk", [
    `title=${fleetingTitle}`,
    "kind=fleeting",
    "key=tasks",
    "format=json"
  ]);
  assert(
    Object.values(fleetingTasksRead.value?.items ?? {}).some((task) => task.name === "Add reference"),
    "fleeting ZK tasks key read failed"
  );

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

  const deleteZk = cliJson("para-zk:create-zk", [
    `title=${deleteZkTitle}`,
    "kind=permanent",
    "maturity=draft",
    "open=false",
    "format=json"
  ]);
  assertCreated(deleteZk, "delete ZK");
  const deleteZkReference = cliJson("para-zk:add-reference", [
    `path=${project.path}`,
    `target=${deleteZk.path}`,
    "format=json"
  ]);
  assert(deleteZkReference.ok === true, "delete ZK reference setup failed");
  const deletedZk = cliJson("para-zk:delete-zk", [
    `title=${deleteZkTitle}`,
    "kind=permanent",
    "format=json"
  ]);
  assert(deletedZk.ok === true && deletedZk.cleaned?.references >= 1, "delete-zk failed to clean source frontmatter reference");
  assertFileMissing(deleteZk.path, "delete-zk left ZK file behind");
  assertFileNotContains(project.path, [
    deleteZk.path
  ]);

  const deleteJournal = cliJson("para-zk:capture-journal", [
    `content=Delete journal memo ${stamp}`,
    `date=${deleteJournalDate}`,
    "format=json"
  ]);
  assert(deleteJournal.ok === true, "delete journal setup failed");
  const deletedJournal = cliJson("para-zk:delete-journal", [
    `date=${deleteJournalDate}`,
    "format=json"
  ]);
  assert(deletedJournal.ok === true && deletedJournal.trashed === true, "delete-journal failed");
  assertFileMissing(deleteJournal.path, "delete-journal left journal file behind");

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
  const journalTaskUpdate = cliJson("para-zk:update-journal", [
    `date=${today}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ name: `Smoke journal task ${stamp}` })}`,
    "format=json"
  ]);
  assert(journalTaskUpdate.changed === true, "journal tasks update failed");
  const journalTasksRead = cliJson("para-zk:read-journal", [
    `date=${today}`,
    "key=tasks",
    "format=json"
  ]);
  assert(
    Object.values(journalTasksRead.value?.items ?? {}).some((task) => task.name === `Smoke journal task ${stamp}`),
    "journal task collection read failed"
  );

  const retro = cliJson("para-zk:create-retro", [
    `path=${project.path}`,
    `date=${today}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(retro, "retro");

  const deleteRetro = cliJson("para-zk:create-retro", [
    `title=Delete Retro ${stamp}`,
    `date=${today}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(deleteRetro, "delete retro");
  const deletedRetro = cliJson("para-zk:delete-retro", [
    `title=${deleteRetro.title}`,
    `date=${today}`,
    "format=json"
  ]);
  assert(deletedRetro.ok === true && deletedRetro.trashed === true, "delete-retro failed");
  assertFileMissing(deleteRetro.path, "delete-retro left retro file behind");

  const retroRead = cliJson("para-zk:read-retro", [
    `path=${retro.path}`,
    "key=frontmatter/week_iso",
    "format=json"
  ]);
  assert(typeof retroRead.value === "string" && retroRead.value.length > 0, "retro week_iso key read failed");

  const retroUpdate = cliJson("para-zk:update-retro", [
    `path=${retro.path}`,
    "key=tasks",
    "op=insert",
    `value_json=${JSON.stringify({ name: `Smoke retro action ${stamp}` })}`,
    "format=json"
  ]);
  assert(retroUpdate.changed === true, "retro tasks update failed");
  const retroActionsRead = cliJson("para-zk:read-retro", [
    `path=${retro.path}`,
    "key=tasks",
    "format=json"
  ]);
  assert(
    Object.values(retroActionsRead.value?.items ?? {}).some((task) => task.name === `Smoke retro action ${stamp}`),
    "retro tasks collection read failed"
  );

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

function assertReferenceRegistryScenario({ project, projectTitle, reference, resource, referenceOnlyResourceTitle }) {
  const originalUrl = "https://example.com/reference";
  const projectReferencesPage = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=references",
    "offset=0",
    "limit=1",
    "format=json"
  ]);
  assert(projectReferencesPage.value?.count >= 2, "project references page did not report expected count");
  assert(projectReferencesPage.value?.offset === 0, "project references page did not preserve offset");
  assert(projectReferencesPage.value?.limit === 1, "project references page did not preserve limit");
  assert(projectReferencesPage.value?.returned === 1, "project references page did not return requested size");
  assert(projectReferencesPage.value?.has_more === true, "project references page did not report more items");
  assert(projectReferencesPage.value?.items?.[String(reference.index)]?.link === originalUrl, "project references page did not key by index");

  const projectReferenceItem = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    `key=references/${reference.index}`,
    "format=json"
  ]);
  assert(projectReferenceItem.value?.link === originalUrl, "single reference item read returned wrong link");
  assert(projectReferenceItem.value?.kind === "url", "single reference item read returned wrong kind");
  assert(projectReferenceItem.value?.label === "Reference URL", "single reference item read lost label");

  const projectReferenceKind = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    `key=references/${reference.index}/kind`,
    "format=json"
  ]);
  assert(projectReferenceKind.value === "url", "single reference field read failed");

  const projectReferencesRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=references",
    "limit=all",
    "format=json"
  ]);
  assert(
    Object.keys(projectReferencesRead.value?.items ?? {}).every((key) => /^\d+$/.test(key)),
    "project references read returned non-index keys"
  );
  assert(
    Object.values(projectReferencesRead.value?.items ?? {}).some((item) => item.target === originalUrl),
    "project references key read did not expose URL reference"
  );
  assert(
    Object.values(projectReferencesRead.value?.items ?? {}).some((item) => item.path === resource.path),
    "project references key read did not expose resource reference path"
  );

  const projectUrlReferencesRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=references",
    "ref_kind=url",
    "format=json"
  ]);
  assert(projectUrlReferencesRead.value?.count === 1, "project references kind filter did not narrow to URL references");
  assert(
    Object.values(projectUrlReferencesRead.value?.items ?? {}).some((item) => item.target === originalUrl),
    "project references kind filter did not expose URL reference"
  );

  const markdownKindRejected = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    "key=references",
    "ref_kind=markdown",
    "format=json"
  ]);
  assert(markdownKindRejected.ok === false, "ref_kind=markdown was accepted");
  assert(
    typeof markdownKindRejected.error === "string" && markdownKindRejected.error.includes("ref_kind"),
    `ref_kind=markdown error was not explicit: ${JSON.stringify(markdownKindRejected)}`
  );

  const referencesBeforeDuplicate = JSON.stringify(readFrontmatterReferences(project.path));
  const duplicateUrl = cliJson("para-zk:add-reference", [
    `path=${project.path}`,
    `target=${originalUrl}`,
    "label=Changed URL Label",
    "open=false",
    "format=json"
  ]);
  assert(duplicateUrl.ok === true, "duplicate URL reference command failed");
  assert(duplicateUrl.added === false, "duplicate URL reference was added");
  assert(duplicateUrl.index === reference.index, "duplicate URL reference did not return existing index");
  assert(duplicateUrl.link === originalUrl, "duplicate URL reference did not return canonical link");
  assert(JSON.stringify(readFrontmatterReferences(project.path)) === referencesBeforeDuplicate, "duplicate URL reference rewrote frontmatter");

  const referenceOnlyResource = cliJson("para-zk:create-resource", [
    `title=${referenceOnlyResourceTitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(referenceOnlyResource, "reference-only resource");
  const fileReference = cliJson("para-zk:add-reference", [
    `path=${project.path}`,
    `target=${referenceOnlyResource.path}`,
    "label=Mutable File Reference",
    "open=false",
    "format=json"
  ]);
  assert(fileReference.ok === true && fileReference.added === true, "vault file reference setup failed");
  assert(fileReference.link === wikiReferenceLink(referenceOnlyResource.path), "vault file reference did not return canonical link");
  const fileReferenceRead = cliJson("para-zk:read-project", [
    `title=${projectTitle}`,
    `key=references/${fileReference.index}`,
    "format=json"
  ]);
  assert(fileReferenceRead.value?.kind === "note", "vault file reference did not derive note kind");
  assert(fileReferenceRead.value?.path === referenceOnlyResource.path, "vault file reference did not derive path");
  const fileReferenceDelete = cliJson("para-zk:update-project", [
    `title=${projectTitle}`,
    `key=references/${fileReference.index}`,
    "op=delete",
    "format=json"
  ]);
  assert(fileReferenceDelete.ok === true && fileReferenceDelete.changed === true, "file reference delete failed");
  assert(fileReferenceDelete.index === fileReference.index, "file reference delete did not return deleted index");
  assert(fileReferenceDelete.link === wikiReferenceLink(referenceOnlyResource.path), "file reference delete did not return deleted link");
  assertFileExists(referenceOnlyResource.path, "reference delete removed the referenced resource file");

  assertReferenceUpdateCollectionScenario();
  assertReferenceSubpathScenario();
  assertObjectReferenceDeleteCleanup();
  assertObjectReferenceRenameSurvival();
}

function assertReferenceUpdateCollectionScenario() {
  const updateProjectTitle = `Smoke Reference Update ${stamp}`;
  const targetATitle = `Smoke Reference Target A ${stamp}`;
  const targetBTitle = `Smoke Reference Target B ${stamp}`;
  const updateUrl = `https://example.com/reference-update-${stamp}`;
  const plainLink = `Plain reference ${stamp}`;

  const updateProject = cliJson("para-zk:create-project", [
    `title=${updateProjectTitle}`,
    "open=false",
    "format=json"
  ]);
  assertCreated(updateProject, "reference update project");
  const targetA = cliJson("para-zk:create-resource", [
    `title=${targetATitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(targetA, "reference target A");
  const targetB = cliJson("para-zk:create-resource", [
    `title=${targetBTitle}`,
    "link=false",
    "open=false",
    "format=json"
  ]);
  assertCreated(targetB, "reference target B");

  const targetAReference = cliJson("para-zk:add-reference", [
    `path=${updateProject.path}`,
    `target=${targetA.path}`,
    "label=Target A",
    "open=false",
    "format=json"
  ]);
  assert(targetAReference.ok === true && targetAReference.index === 0, "target A reference setup failed");
  const urlReference = cliJson("para-zk:add-reference", [
    `path=${updateProject.path}`,
    `target=${updateUrl}`,
    "label=Update URL",
    "open=false",
    "format=json"
  ]);
  assert(urlReference.ok === true && urlReference.index === 1, "update URL reference setup failed");

  const inserted = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references",
    "op=insert",
    `value_json=${JSON.stringify({ link: plainLink, label: "Plain label", note: "Initial note", position: 0 })}`,
    "format=json"
  ]);
  assert(inserted.ok === true && inserted.changed === true, "reference insert failed");
  assert(inserted.added === true, "reference insert did not expose added=true");
  assert(inserted.index === 0, "reference insert did not return 0-based index");
  assert(inserted.link === plainLink, "reference insert did not return canonical link");

  let updateRead = cliJson("para-zk:read-project", [
    `title=${updateProjectTitle}`,
    "key=references",
    "limit=all",
    "format=json"
  ]);
  assert(updateRead.value?.items?.["0"]?.link === plainLink, "reference insert did not land at position 0");
  assert(updateRead.value?.items?.["1"]?.path === targetA.path, "reference insert did not shift item 1");
  assert(updateRead.value?.items?.["2"]?.target === updateUrl, "reference insert did not preserve item 2");

  const duplicateInsert = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references",
    "op=insert",
    `value_json=${JSON.stringify({ link: plainLink, label: "Changed label", note: "Changed note", position: 2 })}`,
    "format=json"
  ]);
  assert(duplicateInsert.ok === true, "duplicate reference insert command failed");
  assert(duplicateInsert.changed === false, "duplicate reference insert reported a write");
  assert(duplicateInsert.added === false, "duplicate reference insert did not expose added=false");
  assert(duplicateInsert.index === 0, "duplicate reference insert did not return existing index");
  assert(duplicateInsert.link === plainLink, "duplicate reference insert did not return existing link");
  updateRead = cliJson("para-zk:read-project", [
    `title=${updateProjectTitle}`,
    "key=references",
    "limit=all",
    "format=json"
  ]);
  assert(updateRead.value?.count === 3, "duplicate reference insert changed collection size");
  assert(updateRead.value?.items?.["0"]?.label === "Plain label", "duplicate reference insert rewrote label");
  assert(updateRead.value?.items?.["0"]?.note === "Initial note", "duplicate reference insert rewrote note");

  const noteUpdate = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references/0/note",
    "op=set",
    "value=Updated note",
    "format=json"
  ]);
  assert(noteUpdate.ok === true && noteUpdate.changed === true, "reference note update failed");
  assert(noteUpdate.index === 0 && noteUpdate.link === plainLink, "reference note update did not keep index/link");
  const noteRead = cliJson("para-zk:read-project", [
    `title=${updateProjectTitle}`,
    "key=references/0/note",
    "format=json"
  ]);
  assert(noteRead.value === "Updated note", "reference note update was not readable");

  const linkUpdate = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references/0/link",
    "op=set",
    `value=${targetB.path}`,
    "format=json"
  ]);
  assert(linkUpdate.ok === true && linkUpdate.changed === true, "reference link update failed");
  assert(linkUpdate.index === 0, "reference link update did not keep index");
  assert(linkUpdate.link === wikiReferenceLink(targetB.path), "reference link update did not return canonical link");
  const linkUpdateRead = cliJson("para-zk:read-project", [
    `title=${updateProjectTitle}`,
    "key=references/0",
    "format=json"
  ]);
  assert(linkUpdateRead.value?.kind === "note", "reference link update did not rederive kind");
  assert(linkUpdateRead.value?.path === targetB.path, "reference link update did not rederive path");

  const duplicateLinkRejected = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references/0/link",
    "op=set",
    `value=${targetA.path}`,
    "format=json"
  ]);
  assert(duplicateLinkRejected.ok === false, "duplicate reference link update was accepted");
  assert(
    typeof duplicateLinkRejected.error === "string" && duplicateLinkRejected.error.includes("duplicate reference target"),
    `duplicate reference link error was not explicit: ${JSON.stringify(duplicateLinkRejected)}`
  );
  updateRead = cliJson("para-zk:read-project", [
    `title=${updateProjectTitle}`,
    "key=references",
    "limit=all",
    "format=json"
  ]);
  assert(updateRead.value?.items?.["0"]?.path === targetB.path, "duplicate link rejection moved index 0");
  assert(updateRead.value?.items?.["1"]?.path === targetA.path, "duplicate link rejection moved index 1");

  const derivedFieldRejected = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references/0/kind",
    "op=set",
    "value=url",
    "format=json"
  ]);
  assert(derivedFieldRejected.ok === false, "derived reference field update was accepted");
  assert(
    typeof derivedFieldRejected.error === "string" && derivedFieldRejected.error.includes("read-only"),
    `derived reference field error was not explicit: ${JSON.stringify(derivedFieldRejected)}`
  );

  const labelClear = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references/0/label",
    "op=set",
    "value=",
    "format=json"
  ]);
  assert(labelClear.ok === true && labelClear.changed === true, "reference label empty-string clear failed");
  const noteClear = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references/0/note",
    "op=set",
    "value_json=null",
    "format=json"
  ]);
  assert(noteClear.ok === true && noteClear.changed === true, "reference note null clear failed");
  const updateFrontmatterReferences = readFrontmatterReferences(updateProject.path);
  assert(updateFrontmatterReferences?.[0] === wikiReferenceLink(targetB.path), "cleared reference did not collapse to bare string");

  const deleteFirst = cliJson("para-zk:update-project", [
    `title=${updateProjectTitle}`,
    "key=references/0",
    "op=delete",
    "format=json"
  ]);
  assert(deleteFirst.ok === true && deleteFirst.changed === true, "reference delete failed");
  assert(deleteFirst.index === 0 && deleteFirst.link === wikiReferenceLink(targetB.path), "reference delete did not return removed index/link");
  updateRead = cliJson("para-zk:read-project", [
    `title=${updateProjectTitle}`,
    "key=references",
    "limit=all",
    "format=json"
  ]);
  assert(updateRead.value?.count === 2, "reference delete did not shrink collection");
  assert(updateRead.value?.items?.["0"]?.path === targetA.path, "reference delete did not shift item 1 to index 0");
  assert(updateRead.value?.items?.["1"]?.target === updateUrl, "reference delete did not shift item 2 to index 1");

  assertReferenceRendererReorder(updateProject.path);
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
    "label=Heading label",
    "open=false",
    "format=json"
  ]);
  assert(headingReference.ok === true && headingReference.added === true, "wiki subpath reference failed");
  assert(headingReference.link === headingLink, "wiki subpath reference did not preserve subpath");

  const duplicateMarkdown = cliJson("para-zk:add-reference", [
    `path=${subpathProject.path}`,
    `target=[Markdown heading](${subpathTarget.path}#${heading})`,
    "label=Different heading label",
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
    `value_json=${JSON.stringify({ link: cleanupTarget.path, label: "Delete object", note: "Delete note" })}`,
    "format=json"
  ]);
  assert(cleanupDeleteReference.ok === true, "reference cleanup delete object setup failed");
  const cleanupKeepReference = cliJson("para-zk:update-project", [
    `title=${cleanupProjectTitle}`,
    "key=references",
    "op=insert",
    `value_json=${JSON.stringify({ link: cleanupKeep.path, label: "Keep object", note: "Keep note" })}`,
    "format=json"
  ]);
  assert(cleanupKeepReference.ok === true, "reference cleanup keep object setup failed");
  const cleanupEmptyReference = cliJson("para-zk:update-project", [
    `title=${cleanupEmptyProjectTitle}`,
    "key=references",
    "op=insert",
    `value_json=${JSON.stringify({ link: cleanupTarget.path, label: "Only object", note: "Only note" })}`,
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
  assert(cleanupItems[0]?.label === "Keep object", "object reference delete cleanup lost preserved label");
  assert(cleanupItems[0]?.note === "Keep note", "object reference delete cleanup lost preserved note");
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
    "label=Object rename label",
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
  const renamedLink = waitForFrontmatterReferenceLink(renameProject.path, "Object rename label", expectedLink);
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

function waitForFrontmatterReferenceLink(path, label, expectedLink) {
  const snapshot = guiJson(`(async () => {
    const file = app.vault.getFileByPath(${JSON.stringify(path)});
    const label = ${JSON.stringify(label)};
    const expectedLink = ${JSON.stringify(expectedLink)};
    if (!file) throw new Error("frontmatter file not found: " + ${JSON.stringify(path)});
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let link = null;
    for (let index = 0; index < 50; index += 1) {
      const references = app.metadataCache.getFileCache(file)?.frontmatter?.references;
      const match = Array.isArray(references)
        ? references.find((item) => typeof item === "object" && item?.label === label)
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

function assertFrontmatterReferenceLinks(path, links) {
  const stored = frontmatterReferenceLinks(path);
  for (const link of links) {
    assert(stored.includes(link), `${path} frontmatter references missing ${link}`);
  }
}

function frontmatterReferenceLink(item) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && typeof item.link === "string") return item.link;
  return undefined;
}

function wikiReferenceLink(target) {
  return `[[${target}]]`;
}

function assertNoBodyReferenceLink(path, link) {
  const text = readFileSync(join(vaultPath, path), "utf8");
  const body = stripFrontmatter(text);
  assert(!body.includes(link), `${path} body should not contain reference link: ${link}`);
}

function stripFrontmatter(text) {
  if (!text.startsWith("---\n")) return text;
  const end = text.indexOf("\n---", 4);
  return end === -1 ? text : text.slice(end + 4);
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

function assertCanonicalCliAliasesRejected(projectPath) {
  const cases = [
    {
      label: "name",
      command: "para-zk:create-area",
      args: [`name=Alias Area ${stamp}`, "format=json"],
      message: "Use title instead of name"
    },
    {
      label: "areaTitles",
      command: "para-zk:create-project",
      args: [`title=Alias Project ${stamp}`, `areaTitles=${JSON.stringify([`Alias Area ${stamp}`])}`, "format=json"],
      message: "Use area_titles instead of areaTitles"
    },
    {
      label: "subnoteType",
      command: "para-zk:create-subnote",
      args: [`title=Alias Subnote ${stamp}`, `path=${projectPath}`, "subnoteType=meeting", "format=json"],
      message: "Use subnote_type instead of subnoteType"
    },
    {
      label: "type",
      command: "para-zk:create-zk",
      args: [`title=Alias ZK ${stamp}`, "type=permanent", "format=json"],
      message: "Use kind instead of type"
    },
    {
      label: "memo",
      command: "para-zk:capture-journal",
      args: [`memo=Alias memo ${stamp}`, "format=json"],
      message: "Use content instead of memo"
    },
    {
      label: "text",
      command: "para-zk:capture-journal",
      args: [`text=Alias text ${stamp}`, "format=json"],
      message: "Use content instead of text"
    }
  ];
  for (const item of cases) {
    const rejected = cliJson(item.command, item.args);
    assert(rejected.ok === false, `${item.label} alias was accepted`);
    assert(
      typeof rejected.error === "string" && rejected.error.includes(item.message),
      `${item.label} alias error was not explicit: ${JSON.stringify(rejected)}`
    );
  }
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
    "id: ",
    "status: in_progress",
    "priority: medium",
    `Smoke summary updated ${stamp}`,
    result.area.path,
    result.createdArea.path,
    "references:",
    "https://example.com/reference",
    `[[${result.resource.path}]]`
  ]);
  assertFrontmatterReferenceLinks(result.project.path, [
    "https://example.com/reference",
    wikiReferenceLink(result.resource.path)
  ]);
  assertNoBodyReferenceLink(result.project.path, "https://example.com/reference");
  assertNoBodyReferenceLink(result.project.path, wikiReferenceLink(result.resource.path));
  assertFileNotContains(result.project.path, ["para_zk_id"]);
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
  assertFrontmatterReferenceLinks(result.promotedResource.path, [
    wikiReferenceLink(result.resource.path)
  ]);
  assertNoBodyReferenceLink(result.promotedResource.path, wikiReferenceLink(result.resource.path));
  assertFileContains(result.promotedFleeting.path, [
    "type: zk_permanent",
    "maturity: evergreen",
    `[[${result.fleeting.path}]]`
  ]);
  assertFrontmatterReferenceLinks(result.promotedFleeting.path, [
    wikiReferenceLink(result.fleeting.path)
  ]);
  assertNoBodyReferenceLink(result.promotedFleeting.path, wikiReferenceLink(result.fleeting.path));
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
    result.project.path
  ]);
  assertTaskRegistryContains([
    `Smoke renamed structured task ${stamp}`,
    `Smoke journal task ${stamp}`,
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

function taskRegistryPath(bucket = "current") {
  return join(vaultPath, "Tasks", bucket);
}

function assertTaskRegistryContains(needles, bucket = "current") {
  const registryPath = taskRegistryPath(bucket);
  const deadline = Date.now() + 3000;
  let text = "";
  while (Date.now() <= deadline) {
    if (existsSync(registryPath)) {
      text = readdirSync(registryPath)
        .filter((entry) => entry.endsWith(".md"))
        .map((entry) => readFileSync(join(registryPath, entry), "utf8"))
        .join("\n");
      if (needles.every((needle) => text.includes(needle))) return;
    }
    sleepMs(100);
  }

  assert(existsSync(registryPath), `missing task registry folder: Tasks/${bucket}`);
  for (const needle of needles) {
    assert(text.includes(needle), `task registry does not contain: ${needle}`);
  }
}

function assertTaskRegistryEntryContains(taskName, needles, bucket = "current") {
  const registryPath = taskRegistryPath(bucket);
  const deadline = Date.now() + 3000;
  let text = "";
  while (Date.now() <= deadline) {
    if (existsSync(registryPath)) {
      for (const entry of readdirSync(registryPath).filter((name) => name.endsWith(".md"))) {
        const content = readFileSync(join(registryPath, entry), "utf8");
        if (!content.includes(taskName)) continue;
        text = content;
        if (needles.every((needle) => content.includes(needle))) return;
      }
    }
    sleepMs(100);
  }

  assert(existsSync(registryPath), `missing task registry folder: Tasks/${bucket}`);
  assert(text.includes(taskName), `task registry ${bucket} does not contain task: ${taskName}`);
  for (const needle of needles) {
    assert(text.includes(needle), `task registry ${bucket} entry for ${taskName} does not contain: ${needle}`);
  }
}

function assertTaskRegistryEntryMissing(taskName, bucket = "current") {
  const registryPath = taskRegistryPath(bucket);
  if (!existsSync(registryPath)) return;

  const text = readdirSync(registryPath)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => readFileSync(join(registryPath, entry), "utf8"))
    .join("\n");
  assert(!text.includes(taskName), `task registry ${bucket} still contains task: ${taskName}`);
}

function assertTaskRegistryExcludes(needles, bucket = "current") {
  const registryPath = taskRegistryPath(bucket);
  assert(existsSync(registryPath), `missing task registry folder: Tasks/${bucket}`);
  const text = readdirSync(registryPath)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => readFileSync(join(registryPath, entry), "utf8"))
    .join("\n");
  for (const needle of needles) {
    assert(!text.includes(needle), `task registry contains deprecated syntax: ${needle}`);
  }
}

function assertTaskRegistryFileNamesExclude(prefixes, bucket = "current") {
  const registryPath = taskRegistryPath(bucket);
  assert(existsSync(registryPath), `missing task registry folder: Tasks/${bucket}`);
  for (const entry of readdirSync(registryPath).filter((name) => name.endsWith(".md"))) {
    for (const prefix of prefixes) {
      assert(!entry.startsWith(prefix), `task registry file name contains deprecated prefix: ${entry}`);
    }
  }
}

function assertTaskRegistryFilesStartWith(expected, bucket = "current") {
  const registryPath = taskRegistryPath(bucket);
  assert(existsSync(registryPath), `missing task registry folder: Tasks/${bucket}`);
  for (const entry of readdirSync(registryPath).filter((name) => name.endsWith(".md"))) {
    const content = readFileSync(join(registryPath, entry), "utf8");
    assert(content.startsWith(expected), `task registry file has unexpected prelude: ${entry}`);
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

function isShortTaskId(value) {
  return /^[a-z0-9]{8}$/.test(value);
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
