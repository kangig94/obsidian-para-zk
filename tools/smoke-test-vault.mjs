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
const ribbonLabelsEn = ["New project", "New area", "New ZK", "New resource", "Open daily note", "Quick memo"];
const ribbonLabelsKo = ["새 프로젝트", "새 영역", "새 ZK", "새 자료", "일일노트", "빠른 메모"];
const emptyTrashLabelEn = "Empty trash";
const emptyTrashLabelKo = "휴지통 비우기";

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

const init = cliJson("para-zk:init", [
  `installDeps=${installDeps}`,
  "format=json"
]);
assert(init.ok === true, "init failed");
assert(Array.isArray(init.warnings) && init.warnings.length === 0, `init warnings: ${JSON.stringify(init.warnings)}`);
assertDependency(init, "dataview");
assertDependency(init, "obsidian-tasks-plugin");
assertDependency(init, "tabs");
assertDependency(init, "folder-notes");
assertDependency(init, "update-time-on-edit");
assertDependency(init, "obsidian-trash-explorer");
assertObsidianCoreConfig();
assertUpdateTimeOnEditConfig();
assertGuiLocaleLabels(ribbonLabelsEn, "PARA-ZK: Create project", emptyTrashLabelEn);

const koInit = cliJson("para-zk:init", [
  "locale=ko",
  "force=true",
  `installDeps=${installDeps}`,
  "format=json"
]);
assert(koInit.ok === true, "ko locale init failed");
assertGuiLocaleLabels(ribbonLabelsKo, "PARA-ZK: 새 프로젝트 만들기", emptyTrashLabelKo);

const enInit = cliJson("para-zk:init", [
  "locale=en",
  "force=true",
  `installDeps=${installDeps}`,
  "format=json"
]);
assert(enInit.ok === true, "en locale init failed");
assertGuiLocaleLabels(ribbonLabelsEn, "PARA-ZK: Create project", emptyTrashLabelEn);

const today = todayIso();
const dailyJournalPath = `Journal/${today.slice(0, 7)}/${today}.md`;
run("optsidian", ["raw", "command", "id=para-zk:open-journal"]);
assertFileExists(dailyJournalPath, "daily journal command did not create journal");
assertFileContains(dailyJournalPath, [
  "type: journal",
  `date: ${today}`
]);

const areaTitle = `Smoke Area ${stamp}`;
const linkedAreaTitle = `Smoke Linked Area ${stamp}`;
const projectTitle = `Smoke Project ${stamp}`;
const resourceTitle = `Smoke Resource ${stamp}`;
const fleetingTitle = `Smoke Fleeting ${stamp}`;

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

const subnote = cliJson("para-zk:create-subnote", [
  `title=Smoke Meeting ${stamp}`,
  `file_path=${project.path}`,
  "subnote_type=meeting",
  "open=false",
  "format=json"
]);
assertCreated(subnote, "subnote");

const subarea = cliJson("para-zk:create-subarea", [
  `title=Smoke Subarea ${stamp}`,
  `file_path=${area.path}`,
  "inheritParentTag=true",
  "open=false",
  "format=json"
]);
assertCreated(subarea, "subarea");

const resource = cliJson("para-zk:create-resource", [
  `title=${resourceTitle}`,
  `file_path=${project.path}`,
  "link=true",
  "open=false",
  "format=json"
]);
assertCreated(resource, "resource");
assert(resource.linkedFromSource === true, "resource was not linked from source");

const fleeting = cliJson("para-zk:create-zk", [
  `title=${fleetingTitle}`,
  "kind=fleeting",
  "open=false",
  "format=json"
]);
assertCreated(fleeting, "fleeting");

const permanent = cliJson("para-zk:create-zk", [
  `title=Smoke Permanent ${stamp}`,
  "kind=permanent",
  "maturity=refined",
  "open=false",
  "format=json"
]);
assertCreated(permanent, "permanent");

const journal = cliJson("para-zk:capture-journal", [
  `content=Smoke memo ${stamp}`,
  `date=${today}`,
  "time=09:01",
  "energy=high",
  "open=false",
  "format=json"
]);
assert(journal.ok === true, "journal capture failed");

const retro = cliJson("para-zk:create-retro", [
  `file_path=${project.path}`,
  `date=${today}`,
  "open=false",
  "format=json"
]);
assertCreated(retro, "retro");

const promotedResource = cliJson("para-zk:promote-resource", [
  `file_path=${resource.path}`,
  `title=Smoke Resource Promoted ${stamp}`,
  "kind=literature",
  "open=false",
  "format=json"
]);
assertCreated(promotedResource, "promoted resource");

const promotedFleeting = cliJson("para-zk:promote-fleeting", [
  `file_path=${fleeting.path}`,
  `title=Smoke Fleeting Promoted ${stamp}`,
  "kind=permanent",
  "maturity=evergreen",
  "open=false",
  "format=json"
]);
assertCreated(promotedFleeting, "promoted fleeting");

const dryRun = cliJson("para-zk:init", [
  "dryRun=true",
  "format=json"
]);
assert(dryRun.ok === true, "dry-run init failed");
assert(Array.isArray(dryRun.created) && dryRun.created.length === 0, "dry-run init reported created files");
assert(Array.isArray(dryRun.updated) && dryRun.updated.length === 0, "dry-run init reported updated files");
assert(Array.isArray(dryRun.skipped) && dryRun.skipped.length === 0, "dry-run init reported skipped files");
assert(Array.isArray(dryRun.warnings) && dryRun.warnings.length === 0, "dry-run init reported warnings");

assertFileContains(project.path, [
  "status: in_progress",
  "priority: high",
  area.path,
  createdArea.path,
  `[[${resource.path}|${resource.title}]]`
]);
assertFileContains(subnote.path, [
  "type: doc",
  "subnote_type: meeting",
  project.path
]);
assertFileContains(subarea.path, [
  "type: area",
  area.path
]);
assertFileContains(permanent.path, [
  "type: zk_permanent",
  "maturity: refined"
]);
assertFileContains(promotedResource.path, [
  "type: zk_literature",
  `[[${resource.path}]]`
]);
assertFileContains(promotedFleeting.path, [
  "type: zk_permanent",
  "maturity: evergreen",
  `[[${promotedFleeting.archivedPath}]]`
]);
assertFileContains(promotedFleeting.archivedPath, [
  "processed: true",
  promotedFleeting.path
]);
assert(!existsSync(join(vaultPath, fleeting.path)), "fleeting source was not archived");
assertFileContains(journal.path, [`Smoke memo ${stamp}`]);
assertFileContains(retro.path, [
  "type: retro",
  project.path
]);

const summary = {
  ok: true,
  vaultPath,
  stamp,
  paths: {
    area: area.path,
    project: project.path,
    subnote: subnote.path,
    subarea: subarea.path,
    resource: resource.path,
    fleetingArchive: promotedFleeting.archivedPath,
    promotedResource: promotedResource.path,
    promotedFleeting: promotedFleeting.path,
    journal: journal.path,
    retro: retro.path
  }
};

console.log(JSON.stringify(summary, null, 2));

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
    "/home/kang/documents/para-zk",
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
  assert(name !== "overmind", "refusing to clean Overmind reference vault");
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
