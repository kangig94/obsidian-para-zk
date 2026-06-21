import type { Plugin } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { normalizeAliasList } from "../text";
import type { CliArgs, CliOptionSpec } from "../types";
import {
  ENERGY_CODE_HELP,
  MATURITY_CODE_HELP,
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  RESOURCE_KIND_CODE_HELP,
  SUBNOTE_TYPE_CODE_HELP
} from "../vocabulary";
import { RESOURCE_CREATE_KIND_CODE_HELP, ZK_KIND_CODE_HELP } from "../zk/kinds";
import { parseList } from "./parse";
import { renderCliText } from "./text-output";
import { workflowContext } from "../vault/host";
import { joinVaultPath, normalizeVaultPath, sanitizeFileName, wikiLink } from "../vault/paths";
import {
  describeSurface,
  describeSurfaces,
  type AuditOptions,
  surfaceReadKeys,
  surfaceTypes,
  surfaceWriteKeys,
  type CollectionReadOptions,
  type SurfaceDescription,
  type WikiDomainsOptions,
  type WikiIngestCandidatesOptions
} from "../workflows";

type CliCapablePlugin = Plugin & {
  registerCliHandler?: (
    command: string,
    description: string,
    options: Record<string, CliOptionSpec>,
    handler: (args?: CliArgs) => string | Promise<string>
  ) => void;
};

type NativeCliCommand = {
  command: string;
  description: string;
  options: Record<string, CliOptionSpec>;
  text: string;
  preResolve?: (args: CliArgs) => void;
  run: (plugin: ParaZkPluginContext, args: CliArgs) => Promise<Record<string, unknown>>;
};

const ZK_KEY_TYPES = ["spark", "digest", "permanent"];

function readKeyOption(type: string, childAware = false): CliOptionSpec {
  const childNote = childAware ? " On child commands, the key belongs to the addressed child; see para-zk:describe for that child's type." : "";
  return {
    value: "<map-path>",
    description: `Optional stable read key. Valid: ${surfaceReadKeys(type).join(", ")}.${childNote}`
  };
}

function writeKeyOption(type: string, childAware = false): CliOptionSpec {
  const childNote = childAware ? " On child commands, the key belongs to the addressed child; see para-zk:describe for that child's type." : "";
  return {
    value: "<map-path>",
    description: `Stable writable key. Valid: ${surfaceWriteKeys(type).join(", ")}.${childNote}`
  };
}

function zkKeyOption(keysFor: (type: string) => string[], verb: string): CliOptionSpec {
  const byKind = ZK_KEY_TYPES.map((type) => `${type}: ${keysFor(type).join(", ")}`);
  return { value: "<map-path>", description: `Stable ${verb} key; depends on ZK kind. ${byKind.join("; ")}.` };
}

const UPDATE_OPTIONS: Record<string, CliOptionSpec> = {
  op: { value: "<set|insert|append|prepend|replace|delete|backfill>", description: "Update operation." },
  value: { value: "<text>", description: "Text value for scalar set, append, or prepend operations." },
  value_json: { value: "<json>", description: "Structured value for frontmatter updates and task inserts." },
  match: { value: "<text>", description: "Exact text to match inside the selected key for op=replace." },
  with: { value: "<text>", description: "Replacement text for op=replace." },
  all: { value: "<true|false>", description: "For op=replace, replace all matches instead of requiring a single match." },
  format: { value: "<text|json>", description: "Output format (default: text)." }
};

const CURRENT_TITLE_OPTION: CliOptionSpec = { value: "<title>", description: "Current note title." };

const RENAME_OPTIONS: Record<string, CliOptionSpec> = {
  title: CURRENT_TITLE_OPTION,
  new_title: { value: "<title>", description: "New note title." },
  format: { value: "<text|json>", description: "Output format (default: text)." }
};

const DELETE_OPTIONS: Record<string, CliOptionSpec> = {
  title: CURRENT_TITLE_OPTION,
  force: { value: "<true|false>", description: "Required when deleting a folder-style note that contains child files." },
  format: { value: "<text|json>", description: "Output format (default: text)." }
};

const READ_COLLECTION_OPTIONS: Record<string, CliOptionSpec> = {
  offset: { value: "<number>", description: "Collection key reads only: zero-based item offset (default: 0)." },
  limit: { value: "<number|all>", description: "Collection key reads only: maximum items to return (default: 50)." },
  query: { value: "<text>", description: "Collection key reads only: case-insensitive item text filter." },
  type: { value: "<note-type>", description: "Backlink collection reads only: filter source notes by frontmatter type." },
  checkbox: { value: "<status>", description: "Task collection reads only: checkbox status character. Use space/blank/todo/open for [ ]." },
  priority: { value: "<priority>", description: "Task collection reads only: parsed Tasks priority such as high or medium." },
  due_before: { value: "<YYYY-MM-DD>", description: "Task collection reads only: include tasks due on or before this date." },
  due_after: { value: "<YYYY-MM-DD>", description: "Task collection reads only: include tasks due on or after this date." },
  ref_kind: { value: "<url|note|file|wiki|text>", description: "Reference collection reads only: filter references by kind." }
};

const COLLECTION_FILTERS: Record<string, string[]> = {
  task: ["offset", "limit", "query", "checkbox", "priority", "due_before", "due_after"],
  reference: ["offset", "limit", "query", "ref_kind"],
  backlink: ["offset", "limit", "query", "type"]
};

const DEFAULT_ATTACHMENT_FOLDER = "assets";

let attachmentCreateQueue: Promise<void> = Promise.resolve();

type AttachmentJob = {
  sourcePath: string;
  targetFolder: string;
  requestedName?: string;
};

type AttachedFile = {
  source: string;
  path: string;
  name: string;
  kind: string;
  size: number;
  link: string;
  embed: string;
};

type WorkflowFunctionName =
  | "auditVault"
  | "captureJournal"
  | "createArea"
  | "createLlmWiki"
  | "createProject"
  | "createResource"
  | "createRetro"
  | "createSubnote"
  | "createZk"
  | "deleteArea"
  | "deleteJournal"
  | "deleteLlmWiki"
  | "deleteProject"
  | "deleteResource"
  | "deleteRetro"
  | "deleteZk"
  | "distillSpark"
  | "createFromDigest"
  | "createFromResource"
  | "listNotes"
  | "readArea"
  | "readJournal"
  | "readLlmWiki"
  | "readProject"
  | "readResource"
  | "readRetro"
  | "readZk"
  | "renameArea"
  | "renameLlmWiki"
  | "renameProject"
  | "renameResource"
  | "renameZk"
  | "updateArea"
  | "updateJournal"
  | "updateLlmWiki"
  | "updateProject"
  | "updateResource"
  | "updateRetro"
  | "updateZk"
  | "wikiDomains"
  | "wikiIngestCandidates";

type WorkflowRunFunction = (
  ctx: ReturnType<typeof workflowContext>,
  options: Record<string, unknown>
) => Promise<Record<string, unknown>>;

type SelectorVariant =
  | { variant: "by-title"; label: string; type: string }
  | { variant: "by-title-no-archive"; label: string; type: string }
  | { variant: "zk" }
  | { variant: "journal" }
  | { variant: "retro" };

type WorkflowOptionMode = "read" | "write" | "rename";

type ParaNoteCommandConfig = {
  type: string;
  label: string;
  article: "a" | "an";
  readWorkflow: WorkflowFunctionName;
  updateWorkflow: WorkflowFunctionName;
  renameWorkflow: WorkflowFunctionName;
  deleteWorkflow: WorkflowFunctionName;
  renameDescription: string;
};

type ChildRootType = "project" | "area";

type ChildAddress = {
  rootType: ChildRootType;
  rootTitle: string;
  archived?: boolean;
  relpath: string[];
  title: string;
  child: string[];
};

const FORMAT_OPTION: CliOptionSpec = { value: "<text|json>", description: "Output format (default: text)." };
const ALIAS_OPTION: CliOptionSpec = { value: "<text>", description: "Optional single Obsidian alias to store in frontmatter." };
const BY_OPTION: CliOptionSpec = { value: "<model-id>", description: "Locale-neutral model id to stamp as llm-wiki authorship." };
const RESOURCE_CREATE_TITLE_OPTION: CliOptionSpec = {
  value: "<title>",
  description: "Resource title. Use / to address/create a Resources-relative path, e.g. AI/Foo."
};
const RESOURCE_TITLE_OPTION: CliOptionSpec = {
  value: "<title>",
  description: "Resource title. Use / to address a Resources-relative path, e.g. AI/Foo."
};
const RESOURCE_CURRENT_TITLE_OPTION: CliOptionSpec = {
  value: "<title>",
  description: "Current resource title. Use / to address a Resources-relative path, e.g. AI/Foo."
};
const RESOURCE_SOURCE_TITLE_OPTION: CliOptionSpec = {
  value: "<title>",
  description: "Optional source note title to link this resource from. When source_type=resource, use / to address a Resources-relative path, e.g. AI/Foo."
};
const SOURCE_RESOURCE_TITLE_OPTION: CliOptionSpec = {
  value: "<title>",
  description: "Source resource title. Use / to address a Resources-relative path, e.g. AI/Foo."
};
const LLM_WIKI_CREATE_TITLE_OPTION: CliOptionSpec = {
  value: "<domain>/<concept>",
  description: "LLM-Wiki page as <domain>/<concept> — exactly one domain folder (e.g. AI/Diffusion Policy). The concept is reused if it already exists under any domain."
};
const LLM_WIKI_TITLE_OPTION: CliOptionSpec = {
  value: "<title>",
  description: "LLM-Wiki title. Use / to address an LLM-Wiki-relative path, e.g. AI/Foo."
};
const LLM_WIKI_CURRENT_TITLE_OPTION: CliOptionSpec = {
  value: "<title>",
  description: "Current LLM-Wiki title. Use / to address an LLM-Wiki-relative path, e.g. AI/Foo."
};
const ARCHIVED_OPTION: CliOptionSpec = {
  value: "<true|false>",
  description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy."
};
const ZK_KIND_FILTER_OPTION: CliOptionSpec = { value: `<${ZK_KIND_CODE_HELP}>`, description: "Optional ZK kind filter." };
const JOURNAL_DATE_OPTION: CliOptionSpec = { value: "<YYYY-MM-DD>", description: "Journal date. Defaults to today." };
const RETRO_DATE_OPTION: CliOptionSpec = { value: "<YYYY-MM-DD>", description: "Optional date used to narrow the ISO week folder." };
const CHILD_READ_KEY_OPTION: CliOptionSpec = {
  value: "<map-path>",
  description: "Optional stable read key on the addressed child. The key is the child's key; valid keys depend on the resolved child type (subnote, note, or nested area)."
};
const CHILD_WRITE_KEY_OPTION: CliOptionSpec = {
  value: "<map-path>",
  description: "Stable writable key on the addressed child. The key is the child's key; valid keys depend on the resolved child type (subnote, note, or nested area)."
};
const CHILD_ADDRESS_OPTIONS: Record<string, CliOptionSpec> = {
  root_type: { value: "<project|area>", description: "Directly-addressable root ancestor type. Must be project or area." },
  root_title: { value: "<title>", description: "Directly-addressable root ancestor title." },
  relpath: { value: `<["title", ...]>`, description: "Optional ancestor chain from the root to the immediate parent. Empty or omitted means directly under the root." },
  title: { value: "<title>", description: "Child title. The full child drill path is [...relpath, title]." }
};
const CHILD_COMMANDS_HINT = "para-zk:read-child|update-child|delete-child|rename-child";
const CRUD_CHILD_MIGRATION_ERROR = `child= is not accepted here — address a child note with ${CHILD_COMMANDS_HINT} (root_type/root_title/relpath/title)`;
const CREATE_AREA_CHILD_MIGRATION_ERROR = "parent_title, parentTitle, and child are not accepted by para-zk:create-area — create a nested area with para-zk:create-child type=area root_type=area root_title=<root> relpath=<ancestors> title=<child>";
const LLM_WIKI_BY_ALIASES: Record<string, string> = {
  author: "by",
  created_by: "by",
  createdBy: "by",
  model: "by",
  model_id: "by",
  modelId: "by",
  updated_by: "by",
  updatedBy: "by"
};

const PARA_NOTE_COMMANDS: ParaNoteCommandConfig[] = [
  {
    type: "project",
    label: "Project",
    article: "a",
    readWorkflow: "readProject",
    updateWorkflow: "updateProject",
    renameWorkflow: "renameProject",
    deleteWorkflow: "deleteProject",
    renameDescription: "Rename a project note, including its folder-style parent folder"
  },
  {
    type: "area",
    label: "Area",
    article: "an",
    readWorkflow: "readArea",
    updateWorkflow: "updateArea",
    renameWorkflow: "renameArea",
    deleteWorkflow: "deleteArea",
    renameDescription: "Rename an area note, including its folder-style parent folder"
  },
  {
    type: "resource",
    label: "Resource",
    article: "a",
    readWorkflow: "readResource",
    updateWorkflow: "updateResource",
    renameWorkflow: "renameResource",
    deleteWorkflow: "deleteResource",
    renameDescription: "Rename a resource note file"
  }
];

const LLM_WIKI_SELECTOR: Extract<SelectorVariant, { variant: "by-title-no-archive" }> = {
  variant: "by-title-no-archive",
  label: "LLM-Wiki",
  type: "llm-wiki"
};

let workflowsModulePromise: Promise<unknown> | undefined;

function loadWorkflows(): Promise<unknown> {
  return (workflowsModulePromise ??= import("../workflows"));
}

// Notes are addressed by name, never by path. Reject the removed path-style
// aliases with a direct error instead of silently ignoring them (file imports
// use attach-file's `source`, which runs outside workflowRun).
const PATH_ALIASES = ["path", "file_path", "filePath", "sourcePath", "source", "file"];

function rejectPathAliases(args: CliArgs): void {
  for (const alias of PATH_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(args, alias)) {
      throw new Error(`${alias} is not supported — address notes by name (title/date, plus root_type/root_title/relpath/title for child notes and source_* for origins)`);
    }
  }
}

function rejectChildOnCrudCommands(args: CliArgs): void {
  if (Object.prototype.hasOwnProperty.call(args, "child")) {
    throw new Error(CRUD_CHILD_MIGRATION_ERROR);
  }
}

function rejectArchivedSelector(args: CliArgs, type: string): void {
  if (Object.prototype.hasOwnProperty.call(args, "archived")) {
    throw new Error(`archived is not accepted by ${type} commands — ${type} notes do not have an archive selector`);
  }
}

function rejectCreateAreaChildArgs(args: CliArgs): void {
  for (const key of ["parent_title", "parentTitle", "child"]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(CREATE_AREA_CHILD_MIGRATION_ERROR);
    }
  }
  if (Object.prototype.hasOwnProperty.call(args, "inherit_parent_tag")) {
    throw new Error("inherit_parent_tag is not accepted by para-zk:create-area — pass it to para-zk:create-child type=area");
  }
}

function workflowRun(
  fnName: WorkflowFunctionName,
  readOptions: (args: CliArgs) => Record<string, unknown>
): NativeCliCommand["run"] {
  return async (plugin, args) => {
    rejectPathAliases(args);
    const workflows = await loadWorkflows() as Record<WorkflowFunctionName, WorkflowRunFunction>;
    const result = await workflows[fnName](workflowContext(plugin), readOptions(args));
    return { ...result };
  };
}

function makeReadCommand(config: {
  command: string;
  description: string;
  options: Record<string, CliOptionSpec>;
  text: string;
  workflow: WorkflowFunctionName;
  selector: SelectorVariant;
}): NativeCliCommand {
  return {
    command: config.command,
    description: config.description,
    options: config.options,
    text: config.text,
    run: workflowRun(config.workflow, (args) => ({
      ...selectorOptions(args, config.selector, "read"),
      key: readCliString(args, "key"),
      collection: readCliCollectionOptions(args)
    }))
  };
}

function makeUpdateCommand(config: {
  command: string;
  description: string;
  options: Record<string, CliOptionSpec>;
  text: string;
  workflow: WorkflowFunctionName;
  selector: SelectorVariant;
}): NativeCliCommand {
  return {
    command: config.command,
    description: config.description,
    options: config.options,
    text: config.text,
    run: workflowRun(config.workflow, (args) => ({
      ...selectorOptions(args, config.selector, "write"),
      ...readCliUpdateOptions(args)
    }))
  };
}

function makeRenameCommand(config: {
  command: string;
  description: string;
  options: Record<string, CliOptionSpec>;
  text: string;
  workflow: WorkflowFunctionName;
  selector: Extract<SelectorVariant, { variant: "by-title" | "by-title-no-archive" | "zk" }>;
}): NativeCliCommand {
  return {
    command: config.command,
    description: config.description,
    options: config.options,
    text: config.text,
    run: workflowRun(config.workflow, (args) => ({
      ...selectorOptions(args, config.selector, "rename"),
      newTitle: readCliNewTitle(args)
    }))
  };
}

function makeDeleteCommand(config: {
  command: string;
  description: string;
  options: Record<string, CliOptionSpec>;
  text: string;
  workflow: WorkflowFunctionName;
  selector: Exclude<SelectorVariant, { variant: "journal" }>;
}): NativeCliCommand {
  return {
    command: config.command,
    description: config.description,
    options: config.options,
    text: config.text,
    run: workflowRun(config.workflow, (args) => ({
      ...selectorOptions(args, config.selector, "rename"),
      force: readCliBoolean(args, "force") ?? false
    }))
  };
}

function makeParaReadCommand(config: ParaNoteCommandConfig): NativeCliCommand {
  return makeReadCommand({
    command: `para-zk:read-${config.type}`,
    description: `Read ${config.article} ${config.type} note's stable PARA-ZK surface, optionally by map key`,
    options: readCommandOptions({ variant: "by-title", label: config.label, type: config.type }, readKeyOption(config.type)),
    text: `${config.type} read`,
    workflow: config.readWorkflow,
    selector: { variant: "by-title", label: config.label, type: config.type }
  });
}

function makeParaUpdateCommand(config: ParaNoteCommandConfig): NativeCliCommand {
  return makeUpdateCommand({
    command: `para-zk:update-${config.type}`,
    description: `Update ${config.article} ${config.type} note's stable PARA-ZK surface by map key`,
    options: updateCommandOptions({ variant: "by-title", label: config.label, type: config.type }, writeKeyOption(config.type)),
    text: `${config.type} updated`,
    workflow: config.updateWorkflow,
    selector: { variant: "by-title", label: config.label, type: config.type }
  });
}

function makeParaRenameCommand(config: ParaNoteCommandConfig): NativeCliCommand {
  return makeRenameCommand({
    command: `para-zk:rename-${config.type}`,
    description: config.renameDescription,
    options: renameCommandOptions({ variant: "by-title", label: config.label, type: config.type }),
    text: `${config.type} renamed`,
    workflow: config.renameWorkflow,
    selector: { variant: "by-title", label: config.label, type: config.type }
  });
}

function makeParaDeleteCommand(config: ParaNoteCommandConfig): NativeCliCommand {
  return makeDeleteCommand({
    command: `para-zk:delete-${config.type}`,
    description: `Move ${config.article} ${config.type} note to Obsidian trash and clean PARA-ZK-owned references`,
    options: deleteCommandOptions({ variant: "by-title", label: config.label, type: config.type }),
    text: `${config.type} deleted`,
    workflow: config.deleteWorkflow,
    selector: { variant: "by-title", label: config.label, type: config.type }
  });
}

function readCommandOptions(selector: SelectorVariant, key: CliOptionSpec): Record<string, CliOptionSpec> {
  return {
    ...selectorDefaultAddressOptions(selector),
    key,
    ...READ_COLLECTION_OPTIONS,
    format: FORMAT_OPTION
  };
}

function updateCommandOptions(selector: SelectorVariant, key: CliOptionSpec): Record<string, CliOptionSpec> {
  return {
    ...selectorDefaultAddressOptions(selector),
    key,
    ...UPDATE_OPTIONS
  };
}

function renameCommandOptions(selector: Extract<SelectorVariant, { variant: "by-title" | "by-title-no-archive" | "zk" }>): Record<string, CliOptionSpec> {
  return {
    ...selectorCurrentTitleOption(selector),
    new_title: RENAME_OPTIONS.new_title,
    format: RENAME_OPTIONS.format,
    ...selectorKindOption(selector),
    ...selectorArchiveOption(selector)
  };
}

function deleteCommandOptions(selector: Exclude<SelectorVariant, { variant: "journal" }>): Record<string, CliOptionSpec> {
  return {
    ...selectorCurrentTitleOption(selector),
    force: DELETE_OPTIONS.force,
    format: DELETE_OPTIONS.format,
    ...selectorKindOption(selector),
    ...selectorDateOption(selector),
    ...selectorArchiveOption(selector)
  };
}

function titleOption(selector: Extract<SelectorVariant, { variant: "by-title" | "by-title-no-archive" }>, current = false): CliOptionSpec {
  if (selector.type === "resource") return current ? RESOURCE_CURRENT_TITLE_OPTION : RESOURCE_TITLE_OPTION;
  if (selector.type === "llm-wiki") return current ? LLM_WIKI_CURRENT_TITLE_OPTION : LLM_WIKI_TITLE_OPTION;
  return current
    ? { value: "<title>", description: "Current note title." }
    : { value: "<title>", description: `${selector.label} title.` };
}

function selectorDefaultAddressOptions(selector: SelectorVariant): Record<string, CliOptionSpec> {
  return {
    ...selectorDefaultTitleOption(selector),
    ...selectorKindOption(selector),
    ...selectorDateOption(selector),
    ...selectorArchiveOption(selector)
  };
}

function selectorDefaultTitleOption(selector: SelectorVariant): Record<string, CliOptionSpec> {
  if (selector.variant === "by-title" || selector.variant === "by-title-no-archive") {
    return { title: titleOption(selector) };
  }
  if (selector.variant === "zk") {
    return { title: { value: "<title>", description: "ZK note title." } };
  }
  if (selector.variant === "retro") {
    return { title: { value: "<title>", description: "Retro note title." } };
  }
  return {};
}

function selectorCurrentTitleOption(
  selector: Exclude<SelectorVariant, { variant: "journal" }>
): Record<string, CliOptionSpec> {
  if (selector.variant === "by-title" || selector.variant === "by-title-no-archive") {
    return { title: titleOption(selector, true) };
  }
  return { title: CURRENT_TITLE_OPTION };
}

function selectorKindOption(selector: SelectorVariant): Record<string, CliOptionSpec> {
  return selector.variant === "zk" ? { kind: ZK_KIND_FILTER_OPTION } : {};
}

function selectorDateOption(selector: SelectorVariant): Record<string, CliOptionSpec> {
  if (selector.variant === "journal") return { date: JOURNAL_DATE_OPTION };
  if (selector.variant === "retro") return { date: RETRO_DATE_OPTION };
  return {};
}

function selectorArchiveOption(selector: SelectorVariant): Record<string, CliOptionSpec> {
  return selector.variant === "by-title" || selector.variant === "retro"
    ? { archived: ARCHIVED_OPTION }
    : {};
}

function selectorOptions(
  args: CliArgs,
  selector: SelectorVariant,
  mode: WorkflowOptionMode
): Record<string, unknown> {
  rejectSelectorArgs(args, selector);
  return {
    ...selectorTitleValue(args, selector),
    ...selectorKindValue(args, selector, mode),
    ...selectorDateValue(args, selector),
    ...selectorArchivedValue(args, selector)
  };
}

function rejectSelectorArgs(args: CliArgs, selector: SelectorVariant): void {
  if (selector.variant === "by-title" || selector.variant === "by-title-no-archive") {
    rejectChildOnCrudCommands(args);
  }
  if (selector.variant === "by-title-no-archive") {
    rejectArchivedSelector(args, selector.type);
  }
}

function selectorTitleValue(args: CliArgs, selector: SelectorVariant): Record<string, unknown> {
  return selector.variant === "journal" ? {} : { title: readCliTitle(args) };
}

function selectorKindValue(args: CliArgs, selector: SelectorVariant, mode: WorkflowOptionMode): Record<string, unknown> {
  return selector.variant === "zk" ? { kind: readCliZkKind(args, mode) } : {};
}

function selectorDateValue(args: CliArgs, selector: SelectorVariant): Record<string, unknown> {
  return selector.variant === "journal" || selector.variant === "retro"
    ? { date: readCliString(args, "date") }
    : {};
}

function selectorArchivedValue(args: CliArgs, selector: SelectorVariant): Record<string, unknown> {
  return selector.variant === "by-title" || selector.variant === "retro"
    ? { archived: readCliBoolean(args, "archived") }
    : {};
}

function readCliZkKind(args: CliArgs, mode: WorkflowOptionMode): string | undefined {
  if (mode === "read") return readCliReadZkKind(args);
  if (mode === "rename") return readCliRenameKind(args);
  return readCliKind(args);
}

function childWorkflowRun(
  workflowByRoot: Record<ChildRootType, WorkflowFunctionName>,
  readOptions: (args: CliArgs, address: ChildAddress) => Record<string, unknown>
): NativeCliCommand["run"] {
  return async (plugin, args) => {
    rejectPathAliases(args);
    const address = readCliChildAddress(args);
    const workflows = await loadWorkflows() as Record<WorkflowFunctionName, WorkflowRunFunction>;
    const result = await workflows[workflowByRoot[address.rootType]](workflowContext(plugin), readOptions(args, address));
    return { ...result };
  };
}

function readCliChildAddress(args: CliArgs): ChildAddress {
  rejectCliAliases(args, {
    rootType: "root_type",
    rootTitle: "root_title",
    relPath: "relpath",
    name: "title"
  });
  rejectChildAddressMigrationArgs(args);
  const rootType = readCliRootType(args);
  const rootTitle = readRequiredCliString(args, "root_title");
  const archived = readCliBoolean(args, "archived");
  const relpath = parseList(readCliString(args, "relpath"));
  const title = readRequiredCliString(args, "title");
  return {
    rootType,
    rootTitle,
    archived,
    relpath,
    title,
    child: [...relpath, title]
  };
}

function rejectChildAddressMigrationArgs(args: CliArgs): void {
  if (Object.prototype.hasOwnProperty.call(args, "parent_type")) {
    throw new Error("parent_type is not accepted here — use root_type");
  }
  if (Object.prototype.hasOwnProperty.call(args, "parentType")) {
    throw new Error("parentType is not accepted here — use root_type");
  }
  if (Object.prototype.hasOwnProperty.call(args, "parent_title")) {
    throw new Error("parent_title is not accepted here — use root_title");
  }
  if (Object.prototype.hasOwnProperty.call(args, "parentTitle")) {
    throw new Error("parentTitle is not accepted here — use root_title");
  }
  if (Object.prototype.hasOwnProperty.call(args, "child")) {
    throw new Error("child= is not accepted on *-child commands — use relpath for the ancestor chain to the immediate parent and title for the addressed child");
  }
}

function readCliRootType(args: CliArgs): ChildRootType {
  const rootType = readRequiredCliString(args, "root_type");
  if (rootType === "project" || rootType === "area") return rootType;
  throw new Error("root_type must be project or area");
}

function readCliChildCreateType(args: CliArgs): "subnote" | "area" {
  rejectCliAliases(args, { childType: "type", child_type: "type" });
  const type = readRequiredCliString(args, "type");
  if (type === "subnote" || type === "area") return type;
  throw new Error("type must be subnote or area");
}

function rejectArgsForChildCreateType(args: CliArgs, type: "subnote" | "area"): void {
  rejectCliAliases(args, {
    subnoteType: "subnote_type",
    inheritParentTag: "inherit_parent_tag"
  });
  if (Object.prototype.hasOwnProperty.call(args, "archived")) {
    throw new Error("archived is not accepted by para-zk:create-child — create child notes under an active root");
  }
  if (type === "subnote") {
    if (Object.prototype.hasOwnProperty.call(args, "inherit_parent_tag")) {
      throw new Error("inherit_parent_tag is only valid with type=area");
    }
    return;
  }
  for (const key of ["subnote_type", "body"]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`${key} is only valid with type=subnote`);
    }
  }
}

async function createChild(plugin: ParaZkPluginContext, args: CliArgs): Promise<Record<string, unknown>> {
  rejectPathAliases(args);
  const address = readCliChildAddress(args);
  const type = readCliChildCreateType(args);
  rejectArgsForChildCreateType(args, type);
  const workflows = await loadWorkflows() as Record<WorkflowFunctionName, WorkflowRunFunction>;
  if (type === "area") {
    if (address.rootType !== "area") {
      throw new Error("type=area requires root_type=area; nested areas can only be created under areas");
    }
    const result = await workflows.createArea(workflowContext(plugin), {
      title: address.title,
      parentTitle: address.rootTitle,
      child: address.relpath,
      inheritParentTag: readCliBoolean(args, "inherit_parent_tag") ?? true,
      open: readCliBoolean(args, "open") ?? false
    });
    return { ...result };
  }

  const result = await workflows.createSubnote(workflowContext(plugin), {
    title: address.title,
    parentType: address.rootType,
    parentTitle: address.rootTitle,
    child: address.relpath,
    subnoteType: readCliSubnoteType(args),
    body: readCliString(args, "body"),
    open: readCliBoolean(args, "open") ?? false
  });
  return { ...result };
}

const NATIVE_CLI_COMMANDS: NativeCliCommand[] = [
  {
    command: "para-zk:conventions",
    description: "Describe PARA-ZK usage conventions to fetch once per task",
    options: {
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    text: "conventions described",
    run: async () => ({
      command: "para-zk:conventions",
      vault: VAULT_CONVENTION,
      scope: SCOPE_CONVENTION,
      wiki: WIKI_CONVENTION,
      citation: CITATION_CONVENTION,
      compounding: COMPOUNDING_CONVENTION
    })
  },
  {
    command: "para-zk:describe",
    description: "Describe PARA-ZK CLI surface types, stable read/write keys, and collection filters",
    options: {
      type: { value: `<${surfaceTypes().join("|")}>`, description: "Optional surface type. Omit to describe all supported surfaces." },
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    text: "CLI surface described",
    run: async (_plugin, args) => {
      const type = readCliString(args, "type");
      if (!type) {
        return {
          surfaceTypes: surfaceTypes(),
          collectionFilters: describeCollectionFilters(describeSurfaces()),
          workflows: namedWorkflows(),
          conventions: CONVENTIONS_POINTER,
          safety: SAFETY_NOTE
        };
      }
      const surfaces = [describeSurface(type)].map(withCreateInputs);
      return {
        collectionFilters: describeCollectionFilters(surfaces),
        surfaces
      };
    }
  },
  {
    command: "para-zk:list",
    description: "List PARA-ZK notes by type with optional filters (structured enumeration by name/frontmatter). For content/full-text search, use `optsidian grep` or `optsidian search`.",
    options: {
      type: { value: "<project|area|resource|llm-wiki|zk|retro|journal|subnote>", description: "Optional note-type filter. Omit to list all PARA-ZK notes; zk spans all ZK kinds." },
      archived: { value: "<true|false>", description: "true lists archived notes; default lists active notes." },
      query: { value: "<text>", description: "Optional case-insensitive substring filter over the note's name or address path. Use query=<subpath>/ to scope to a subfolder (e.g. a wiki domain or Resources folder)." },
      offset: { value: "<number>", description: "Zero-based item offset (default: 0)." },
      limit: { value: "<number|all>", description: "Maximum items to return (default: 50)." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "notes listed",
    run: workflowRun("listNotes", (args) => ({
      type: readCliString(args, "type"),
      archived: readCliBoolean(args, "archived"),
      query: readCliString(args, "query"),
      offset: readCliInteger(args, "offset"),
      limit: readCliCollectionLimit(args)
    }))
  },
  {
    command: "para-zk:audit",
    description: "Audit the vault for deterministic PARA-ZK content-health findings",
    options: {
      check: { value: "<broken_link|dangling_reference|idless_reference|bare_reference|bad_citation_subpath|orphan_note|upward_wiki_link|orphan_wiki_page|wiki_tag_domain_mismatch|unprocessed_spark|stale_draft_permanent>", description: "Optional check code filter." },
      severity: { value: "<high|medium|low>", description: "Optional severity filter." },
      type: { value: "<note-type>", description: "Optional stored frontmatter type filter, e.g. resource or permanent." },
      offset: { value: "<number>", description: "Zero-based finding offset (default: 0)." },
      limit: { value: "<number|all>", description: "Maximum findings to return (default: 50)." },
      fix: { value: "<true|false>", description: "When true, apply auto-repairs vault-wide: backfill id-less reference ids, expand unique bare reference links to full paths, and correct llm-wiki tag domains; all other findings (including ambiguous bare references) remain report-only." },
      format: FORMAT_OPTION
    },
    text: "vault audited",
    run: async (plugin, args) => {
      const workflows = await loadWorkflows() as Record<WorkflowFunctionName, WorkflowRunFunction>;
      const result = await workflows.auditVault(workflowContext(plugin), readCliAuditOptions(args));
      return {
        command: "para-zk:audit",
        ...result
      };
    }
  },
  {
    command: "para-zk:wiki-ingest-candidates",
    description: "List canonical source notes that should be folded into the LLM-Wiki",
    options: {
      mode: { value: "<per-import|delta|init|re-ingest>", description: "Candidate discovery mode." },
      source_path: { value: "<vault-path>", description: "Single source note path. Required for per-import and re-ingest; rejected for delta and init." },
      source_paths: { value: "<json|comma-list>", description: "Multiple source note paths. Required for per-import and re-ingest when source_path is omitted; rejected for delta and init." },
      offset: { value: "<number>", description: "Zero-based candidate offset (default: 0)." },
      limit: { value: "<number|all>", description: "Maximum candidates to return (default: 50)." },
      format: FORMAT_OPTION
    },
    text: "wiki ingest candidates listed",
    run: async (plugin, args) => {
      const workflows = await loadWorkflows() as Record<WorkflowFunctionName, WorkflowRunFunction>;
      const result = await workflows.wikiIngestCandidates(workflowContext(plugin), readCliWikiIngestCandidatesOptions(args));
      return {
        command: "para-zk:wiki-ingest-candidates",
        ...result
      };
    }
  },
  {
    command: "para-zk:wiki-domains",
    description: "List the LLM-Wiki domains (per-domain index entry points) to read the wiki",
    options: {
      offset: { value: "<number>", description: "Zero-based domain offset (default: 0)." },
      limit: { value: "<number|all>", description: "Maximum domains to return (default: 50)." },
      format: FORMAT_OPTION
    },
    text: "wiki domains listed",
    run: async (plugin, args) => {
      const workflows = await loadWorkflows() as Record<WorkflowFunctionName, WorkflowRunFunction>;
      const result = await workflows.wikiDomains(workflowContext(plugin), readCliWikiDomainsOptions(args));
      return {
        command: "para-zk:wiki-domains",
        ...result
      };
    }
  },
  {
    command: "para-zk:setup",
    description: "Set up the PARA-ZK vault layout and managed files",
    options: {
      locale: { value: "<ko|en>", description: "Language for UI, generated files, and tags." },
      dryRun: { value: "<true|false>", description: "Plan changes without writing." },
      installDeps: { value: "<true|false>", description: "Install and enable required community plugins." },
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    text: "vault set up",
    run: async (plugin, args) => {
      const locale = normalizeLocale(readCliString(args, "locale"), plugin.settings.locale);
      const result = await plugin.setupVault({
        locale,
        dryRun: readCliBoolean(args, "dryRun") ?? false,
        installDeps: readCliBoolean(args, "installDeps") ?? false
      });
      return {
        message: localePack(locale).messages.setupReady,
        ...result
      };
    }
  },
  {
    command: "para-zk:attach-file",
    description: "Copy local files or directories into the vault attachment folder",
    options: {
      source: { value: "<local-path>", description: "Local file or directory path to copy into the vault." },
      sources: { value: "<json|comma-list>", description: "Additional local file or directory paths to copy." },
      folder: { value: "<vault-folder>", description: "Vault-relative target folder (default: assets)." },
      name: { value: "<filename>", description: "Optional destination filename. The source extension is preserved when omitted." },
      recursive: { value: "<true|false>", description: "For directory sources, include nested files (default: true)." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "file attached",
    run: async (plugin, args) => attachLocalFile(plugin, args)
  },
  ...PARA_NOTE_COMMANDS.map(makeParaReadCommand),
  makeReadCommand({
    command: "para-zk:read-llm-wiki",
    description: "Read an llm-wiki note's stable PARA-ZK surface, optionally by map key",
    options: readCommandOptions(LLM_WIKI_SELECTOR, readKeyOption("llm-wiki")),
    text: "llm-wiki read",
    workflow: "readLlmWiki",
    selector: LLM_WIKI_SELECTOR
  }),
  makeReadCommand({
    command: "para-zk:read-zk",
    description: "Read a ZK note's stable PARA-ZK surface, optionally by map key",
    options: readCommandOptions({ variant: "zk" }, zkKeyOption(surfaceReadKeys, "read")),
    text: "ZK read",
    workflow: "readZk",
    selector: { variant: "zk" }
  }),
  makeReadCommand({
    command: "para-zk:read-journal",
    description: "Read a daily journal note's stable PARA-ZK surface, optionally by map key",
    options: readCommandOptions({ variant: "journal" }, readKeyOption("journal")),
    text: "journal read",
    workflow: "readJournal",
    selector: { variant: "journal" }
  }),
  makeReadCommand({
    command: "para-zk:read-retro",
    description: "Read a retro note's stable PARA-ZK surface, optionally by map key",
    options: readCommandOptions({ variant: "retro" }, readKeyOption("retro")),
    text: "retro read",
    workflow: "readRetro",
    selector: { variant: "retro" }
  }),
  ...PARA_NOTE_COMMANDS.map(makeParaUpdateCommand),
  {
    command: "para-zk:update-llm-wiki",
    description: "Update an llm-wiki note's stable PARA-ZK surface by map key",
    options: {
      ...updateCommandOptions(LLM_WIKI_SELECTOR, writeKeyOption("llm-wiki")),
      by: BY_OPTION
    },
    text: "llm-wiki updated",
    run: workflowRun("updateLlmWiki", (args) => ({
      ...selectorOptions(args, LLM_WIKI_SELECTOR, "write"),
      ...readCliUpdateOptions(args),
      by: readCliBy(args)
    }))
  },
  makeUpdateCommand({
    command: "para-zk:update-zk",
    description: "Update a ZK note's stable PARA-ZK surface by map key",
    options: updateCommandOptions({ variant: "zk" }, zkKeyOption(surfaceWriteKeys, "write")),
    text: "ZK updated",
    workflow: "updateZk",
    selector: { variant: "zk" }
  }),
  makeUpdateCommand({
    command: "para-zk:update-journal",
    description: "Update a daily journal note's stable PARA-ZK surface by map key",
    options: updateCommandOptions({ variant: "journal" }, writeKeyOption("journal")),
    text: "journal updated",
    workflow: "updateJournal",
    selector: { variant: "journal" }
  }),
  makeUpdateCommand({
    command: "para-zk:update-retro",
    description: "Update a retro note's stable PARA-ZK surface by map key",
    options: updateCommandOptions({ variant: "retro" }, writeKeyOption("retro")),
    text: "retro updated",
    workflow: "updateRetro",
    selector: { variant: "retro" }
  }),
  ...PARA_NOTE_COMMANDS.map(makeParaRenameCommand),
  makeRenameCommand({
    command: "para-zk:rename-llm-wiki",
    description: "Rename an llm-wiki note file",
    options: renameCommandOptions(LLM_WIKI_SELECTOR),
    text: "llm-wiki renamed",
    workflow: "renameLlmWiki",
    selector: LLM_WIKI_SELECTOR
  }),
  makeRenameCommand({
    command: "para-zk:rename-zk",
    description: "Rename a ZK note file",
    options: renameCommandOptions({ variant: "zk" }),
    text: "ZK renamed",
    workflow: "renameZk",
    selector: { variant: "zk" }
  }),
  ...PARA_NOTE_COMMANDS.map(makeParaDeleteCommand),
  makeDeleteCommand({
    command: "para-zk:delete-llm-wiki",
    description: "Move an llm-wiki note to Obsidian trash and clean PARA-ZK-owned references",
    options: deleteCommandOptions(LLM_WIKI_SELECTOR),
    text: "llm-wiki deleted",
    workflow: "deleteLlmWiki",
    selector: LLM_WIKI_SELECTOR
  }),
  makeDeleteCommand({
    command: "para-zk:delete-zk",
    description: "Move a ZK note to Obsidian trash and clean PARA-ZK-owned references",
    options: deleteCommandOptions({ variant: "zk" }),
    text: "ZK deleted",
    workflow: "deleteZk",
    selector: { variant: "zk" }
  }),
  {
    command: "para-zk:delete-journal",
    description: "Move a daily journal note to Obsidian trash and report incoming links",
    options: {
      date: JOURNAL_DATE_OPTION,
      format: FORMAT_OPTION
    },
    text: "journal deleted",
    run: workflowRun("deleteJournal", (args) => ({
      date: readCliString(args, "date")
    }))
  },
  makeDeleteCommand({
    command: "para-zk:delete-retro",
    description: "Move a retro note to Obsidian trash and clean PARA-ZK-owned references",
    options: deleteCommandOptions({ variant: "retro" }),
    text: "retro deleted",
    workflow: "deleteRetro",
    selector: { variant: "retro" }
  }),
  {
    command: "para-zk:read-child",
    description: "Read a child note under a project or root area. relpath is the ancestor chain to the immediate parent; title is the child.",
    options: {
      ...CHILD_ADDRESS_OPTIONS,
      archived: ARCHIVED_OPTION,
      key: CHILD_READ_KEY_OPTION,
      ...READ_COLLECTION_OPTIONS,
      format: FORMAT_OPTION
    },
    text: "child read",
    run: childWorkflowRun({ project: "readProject", area: "readArea" }, (args, address) => ({
      title: address.rootTitle,
      archived: address.archived,
      child: address.child,
      key: readCliString(args, "key"),
      collection: readCliCollectionOptions(args)
    }))
  },
  {
    command: "para-zk:update-child",
    description: "Update a child note under a project or root area. relpath is the ancestor chain to the immediate parent; title is the child.",
    options: {
      ...CHILD_ADDRESS_OPTIONS,
      archived: ARCHIVED_OPTION,
      key: CHILD_WRITE_KEY_OPTION,
      ...UPDATE_OPTIONS
    },
    text: "child updated",
    run: childWorkflowRun({ project: "updateProject", area: "updateArea" }, (args, address) => ({
      title: address.rootTitle,
      archived: address.archived,
      child: address.child,
      ...readCliUpdateOptions(args)
    }))
  },
  {
    command: "para-zk:delete-child",
    description: "Delete a child note under a project or root area. relpath is the ancestor chain to the immediate parent; title is the child.",
    options: {
      ...CHILD_ADDRESS_OPTIONS,
      archived: ARCHIVED_OPTION,
      force: DELETE_OPTIONS.force,
      format: FORMAT_OPTION
    },
    text: "child deleted",
    run: childWorkflowRun({ project: "deleteProject", area: "deleteArea" }, (args, address) => ({
      title: address.rootTitle,
      archived: address.archived,
      child: address.child,
      force: readCliBoolean(args, "force") ?? false
    }))
  },
  {
    command: "para-zk:rename-child",
    description: "Rename a child note under a project or root area. relpath is the ancestor chain to the immediate parent; title is the child being renamed.",
    options: {
      ...CHILD_ADDRESS_OPTIONS,
      archived: ARCHIVED_OPTION,
      new_title: RENAME_OPTIONS.new_title,
      format: FORMAT_OPTION
    },
    text: "child renamed",
    run: childWorkflowRun({ project: "renameProject", area: "renameArea" }, (args, address) => ({
      title: address.rootTitle,
      archived: address.archived,
      child: address.child,
      newTitle: readCliNewTitle(args)
    }))
  },
  {
    command: "para-zk:create-child",
    description: "Create a child note under a project or root area. relpath is the ancestor chain to the immediate parent; title is the new child (for type=subnote, may be a subdir/title path to file it in a subfolder under the parent).",
    options: {
      type: { value: "<subnote|area>", description: "Child type to create. type=area requires root_type=area; type=subnote allows root_type=project or area." },
      ...CHILD_ADDRESS_OPTIONS,
      title: { value: "<title|subdir/title>", description: "New child. For type=subnote, a relative path (subdir/title) files it in a subfolder under the parent; it stays the parent's child by frontmatter regardless of subfolder. For type=area, the child area title." },
      subnote_type: { value: `<${SUBNOTE_TYPE_CODE_HELP}>`, description: "type=subnote only. Locale-neutral subnote type code." },
      body: { value: "<markdown>", description: "type=subnote only. Optional initial free-form body content." },
      inherit_parent_tag: { value: "<true|false>", description: "type=area only. Include the parent area tag as well as the child tag (default true)." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: FORMAT_OPTION
    },
    text: "child created",
    preResolve: (args) => {
      const type = readCliChildCreateType(args);
      rejectArgsForChildCreateType(args, type);
    },
    run: createChild
  },
  {
    command: "para-zk:create-project",
    description: "Create a PARA project note",
    options: {
      title: { value: "<title>", description: "Project title." },
      alias: ALIAS_OPTION,
      areas: { value: "<json|comma-list>", description: "Area links to store in frontmatter." },
      area_titles: { value: "<json|comma-list>", description: "Area titles to reuse or create and link." },
      status: { value: `<${PROJECT_STATUS_CODE_HELP}>`, description: "Locale-neutral project status code." },
      priority: { value: `<${PRIORITY_CODE_HELP}>`, description: "Locale-neutral project priority code." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "project created",
    run: workflowRun("createProject", (args) => ({
      title: readCliTitle(args),
      alias: readCliAlias(args),
      areas: parseList(readCliString(args, "areas")),
      areaTitles: parseList(readCliAreaTitles(args)),
      status: readCliString(args, "status"),
      priority: readCliString(args, "priority"),
      open: readCliBoolean(args, "open") ?? false
    }))
  },
  {
    command: "para-zk:create-area",
    description: "Create a root PARA area note",
    options: {
      title: { value: "<title>", description: "Area title." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "area created",
    run: workflowRun("createArea", (args) => {
      rejectCreateAreaChildArgs(args);
      return {
        title: readCliTitle(args),
        open: readCliBoolean(args, "open") ?? false
      };
    })
  },
  {
    command: "para-zk:create-resource",
    description: "Create a PARA resource note and optionally link it from a source note",
    options: {
      title: RESOURCE_CREATE_TITLE_OPTION,
      alias: ALIAS_OPTION,
      source_type: { value: "<project|area|resource|zk>", description: "Optional source note type to link this resource from." },
      source_title: RESOURCE_SOURCE_TITLE_OPTION,
      link: { value: "<true|false>", description: "Whether to add the link to the source note." },
      url: { value: "<url>", description: "Optional provenance: where the source came from." },
      first_author: { value: "<name>", description: "Optional provenance: the source's first author." },
      license: { value: "<spdx-id>", description: "Optional provenance: source license as an SPDX identifier (e.g. MIT, CC-BY-4.0); when no SPDX id fits, a short recognizable token (e.g. arXiv)." },
      kind: { value: `<${RESOURCE_KIND_CODE_HELP}>`, description: "Optional provenance: locale-neutral source kind code." },
      domain: { value: "<domain>", description: "Optional subject domain for the identity tag (<type>/<domain>, e.g. resource/ai); omit for a flat type tag. Reuse an existing domain vocabulary." },
      body: { value: "<markdown>", description: "Optional initial free-form body content." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "resource created",
    run: workflowRun("createResource", (args) => {
      const sourceTitle = readCliString(args, "source_title");
      return {
        title: readCliTitle(args),
        alias: readCliAlias(args),
        sourceType: readCliString(args, "source_type"),
        sourceTitle,
        linkToSource: readCliBoolean(args, "link") ?? Boolean(sourceTitle),
        url: readCliString(args, "url"),
        firstAuthor: readCliString(args, "first_author"),
        license: readCliString(args, "license"),
        kind: readCliString(args, "kind"),
        domain: readCliString(args, "domain"),
        body: readCliString(args, "body"),
        open: readCliBoolean(args, "open") ?? false
      };
    })
  },
  {
    command: "para-zk:create-llm-wiki",
    description: "Create an llm-wiki note",
    options: {
      title: LLM_WIKI_CREATE_TITLE_OPTION,
      alias: ALIAS_OPTION,
      body: { value: "<markdown>", description: "Optional initial free-form body content." },
      by: BY_OPTION,
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "llm-wiki created",
    run: workflowRun("createLlmWiki", (args) => ({
      title: readCliTitle(args),
      alias: readCliAlias(args),
      body: readCliString(args, "body"),
      by: readCliBy(args),
      open: readCliBoolean(args, "open") ?? false
    }))
  },
  {
    command: "para-zk:create-retro",
    description: "Create a weekly retro note, optionally scoped to a project or area",
    options: {
      source_type: { value: "<project|area>", description: "Optional scope note type." },
      source_title: { value: "<title>", description: "Optional scope note title." },
      title: { value: "<title>", description: "Retro title segment." },
      date: { value: "<YYYY-MM-DD>", description: "Date used for ISO week calculation." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "retro created",
    run: workflowRun("createRetro", (args) => ({
      sourceType: readCliString(args, "source_type"),
      sourceTitle: readCliString(args, "source_title"),
      title: readCliTitle(args),
      date: readCliString(args, "date"),
      open: readCliBoolean(args, "open") ?? false
    }))
  },
  {
    command: "para-zk:create-zk",
    description: "Create a ZK note",
    options: {
      title: { value: "<title>", description: "ZK note title." },
      alias: ALIAS_OPTION,
      kind: { value: `<${ZK_KIND_CODE_HELP}>`, description: "Locale-neutral ZK note kind." },
      maturity: { value: `<${MATURITY_CODE_HELP}>`, description: "Permanent-note maturity code." },
      body: { value: "<markdown>", description: "Optional initial free-form body content." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "ZK note created",
    run: workflowRun("createZk", (args) => ({
      title: readCliTitle(args),
      alias: readCliAlias(args),
      kind: readCliKind(args),
      maturity: readCliString(args, "maturity"),
      body: readCliString(args, "body"),
      open: readCliBoolean(args, "open") ?? false
    }))
  },
  {
    command: "para-zk:capture-journal",
    description: "Append a quick memo to the daily journal",
    options: {
      content: { value: "<content>", description: "Memo content." },
      date: { value: "<YYYY-MM-DD>", description: "Journal date." },
      time: { value: "<HH:mm>", description: "Memo time." },
      energy: { value: `<${ENERGY_CODE_HELP}>`, description: "Locale-neutral daily energy code." },
      open: { value: "<true|false>", description: "Open the journal note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "journal captured",
    run: workflowRun("captureJournal", (args) => ({
      content: readCliContent(args),
      date: readCliString(args, "date"),
      time: readCliString(args, "time"),
      energy: readCliString(args, "energy"),
      open: readCliBoolean(args, "open") ?? false
    }))
  },
  {
    command: "para-zk:create-from-resource",
    description: "Create a Digest or Permanent ZK note from a resource (resource preserved)",
    options: {
      source_title: SOURCE_RESOURCE_TITLE_OPTION,
      title: { value: "<title>", description: "New ZK note title." },
      kind: { value: `<${RESOURCE_CREATE_KIND_CODE_HELP}>`, description: "Locale-neutral target ZK kind (digest|permanent)." },
      maturity: { value: `<${MATURITY_CODE_HELP}>`, description: "Permanent-note maturity code." },
      body: { value: "<markdown>", description: "Optional initial free-form body content." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "ZK note created from resource",
    run: workflowRun("createFromResource", (args) => ({
      sourceTitle: readCliString(args, "source_title"),
      title: readCliTitle(args),
      kind: readCliKind(args),
      maturity: readCliString(args, "maturity"),
      body: readCliString(args, "body"),
      open: readCliBoolean(args, "open") ?? false
    }))
  },
  {
    command: "para-zk:distill-spark",
    description: "Distill a spark into a permanent note; record it on the spark, or discard the spark",
    options: {
      source_title: { value: "<title>", description: "Source spark note title." },
      title: { value: "<title>", description: "New permanent note title." },
      maturity: { value: `<${MATURITY_CODE_HELP}>`, description: "Permanent-note maturity code." },
      discard: { value: "<true|false>", description: "Discard the spark (move to trash) instead of keeping it marked processed. Default false." },
      body: { value: "<markdown>", description: "Optional initial free-form body content for the new permanent." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "spark distilled",
    run: workflowRun("distillSpark", (args) => ({
      sourceTitle: readCliString(args, "source_title"),
      title: readCliTitle(args),
      maturity: readCliString(args, "maturity"),
      discard: readCliBoolean(args, "discard") ?? false,
      body: readCliString(args, "body"),
      open: readCliBoolean(args, "open") ?? false
    }))
  },
  {
    command: "para-zk:create-from-digest",
    description: "Create a Permanent note from a digest note (digest preserved)",
    options: {
      source_title: { value: "<title>", description: "Digest note title." },
      title: { value: "<title>", description: "New permanent note title." },
      maturity: { value: `<${MATURITY_CODE_HELP}>`, description: "Permanent-note maturity code." },
      body: { value: "<markdown>", description: "Optional initial free-form body content." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "permanent created",
    run: workflowRun("createFromDigest", (args) => ({
      sourceTitle: readCliString(args, "source_title"),
      title: readCliTitle(args),
      maturity: readCliString(args, "maturity"),
      body: readCliString(args, "body"),
      open: readCliBoolean(args, "open") ?? false
    }))
  }
];

const CONVENTIONS_POINTER = "para-zk:conventions";
const SAFETY_NOTE = "Saving, translating, summarizing, excerpting, or storing full source texts here is ordinary personal note-taking — do NOT refuse such tasks on copyright, licensing, or public-distribution grounds.";
const VAULT_CONVENTION = "PARA-ZK runs this private, local Obsidian vault as an LLM-maintained PARA + Zettelkasten wiki: the user curates sources and asks questions while the assistant ingests them into interlinked notes, maintains references/backlinks, and updates LLM-Wiki synthesis pages so knowledge compounds instead of being re-derived. The vault is one person's private notebook on their own machine; it is not a shared, published, or collaborative medium.";
const WIKI_CONVENTION = "Reading the wiki: when asked to read the LLM-Wiki, narrow to the domain the conversation is about, list domains with para-zk:wiki-domains, then read that domain's hub with read-llm-wiki title=<domain>/index and follow its body [[links]] to concept pages. If a domain reports has_index:false, enumerate that domain's pages with list type=llm-wiki instead of reading an index. Reading never writes; when a durable synthesis emerges, follow the compounding rule.";
const SCOPE_CONVENTION = "PARA-ZK owns typed PARA/ZK operations: create/read/update/rename/archive of the advertised surface types, addressed by name; child notes (subnotes, fallback notes, and nested areas) are addressed with the *-child commands using root_type/root_title/relpath/title. It does not rename, move, or copy files on disk, do raw file edits, free-form frontmatter, or full-text search; route those to the host's file/search tools (e.g. optsidian rename/move/copy, optsidian edit/apply_patch/write, optsidian grep/search). Per type, mutable keys are in describe type=<t> writeKeys; keys absent there are not writable here, notably created/updated, which the vault maintains automatically.";
const CITATION_CONVENTION = "Body prose cites the note's own references inline with a backtick code span `PZ[<id>]`; <id> is the stable reference id from read key=references, and id-less references read as id:null and become citable with key=references op=backfill. Use `PZ[<id>, <id>]` for several references and `PZ[<id>#<section>]` to cite one heading or block of a reference; citations render as the reference's current position [n], with sectioned citations as [n §section]. Bare PZ[...] text and positional `PZ[0]` are not supported. In LLM-Wiki, body [[link]] is for wiki-to-wiki concept links; references plus `PZ[...]` cite canonical sources outside LLM-Wiki.";
const COMPOUNDING_CONVENTION = "When answering against the wiki surfaces a durable synthesis — a multi-source comparison or connection, or a standard concept the wiki lacks — do not write it silently: propose filing it back as a new or updated LLM-Wiki page (create-llm-wiki/update-llm-wiki) and write only on the user's confirmation; skip one-off lookups and navigation.";

// Discoverability: derive create/workflow inputs from the real command option
// specs so `describe` is self-contained (a caller never needs `obsidian help`).
// Sourced from NATIVE_CLI_COMMANDS itself, so there is no drift to maintain.
const UNIVERSAL_OPTIONS = new Set(["open", "format"]);
const NAMED_WORKFLOW_COMMANDS = [
  "para-zk:conventions",
  "para-zk:list",
  "para-zk:audit",
  "para-zk:wiki-ingest-candidates",
  "para-zk:wiki-domains",
  "para-zk:create-child",
  "para-zk:read-child",
  "para-zk:update-child",
  "para-zk:rename-child",
  "para-zk:delete-child",
  "para-zk:capture-journal",
  "para-zk:distill-spark",
  "para-zk:create-from-digest",
  "para-zk:create-from-resource",
  "para-zk:attach-file"
];

function commandInputs(command: string): string[] {
  const entry = NATIVE_CLI_COMMANDS.find((candidate) => candidate.command === command);
  return entry ? Object.keys(entry.options).filter((key) => !UNIVERSAL_OPTIONS.has(key)) : [];
}

function namedWorkflows(): Array<{ command: string; inputs: string[] }> {
  return NAMED_WORKFLOW_COMMANDS.map((command) => ({ command, inputs: commandInputs(command) }));
}

function withCreateInputs(surface: SurfaceDescription): SurfaceDescription {
  const create = surface.addressing?.create;
  if (!create) return surface;
  return { ...surface, addressing: { ...surface.addressing, createInputs: commandInputs(create) } };
}

// The CLI adapter is desktop-only — handlers are never registered on mobile (the host
// injects registerCliHandler only on desktop) — so it may use Node. It is loaded lazily,
// never at the top level, so the plugin bundle carries no eager Node require and still
// loads on Obsidian mobile (iPad/Android). Obsidian desktop (Electron) resolves Node
// modules via window.require; a plain import() does NOT work there (the renderer tries to
// fetch the specifier as a URL), so prefer window.require and fall back to a dynamic
// import only off-Electron (e.g. the Node test runner).
function loadNodeModule<T>(id: string): Promise<T> {
  const electronRequire = (globalThis as { window?: { require?: (id: string) => unknown } }).window?.require;
  if (typeof electronRequire === "function") return Promise.resolve(electronRequire(id) as T);
  return import(id) as Promise<T>;
}

function nodeFs(): Promise<typeof import("node:fs/promises")> {
  return loadNodeModule("node:fs/promises");
}

function nodePath(): Promise<typeof import("node:path")> {
  return loadNodeModule("node:path");
}

// Create body and update value may carry large markdown; an @file value is read from
// disk so the caller never pushes multiline/quoted content through a shell. Works
// through any host (native obsidian or optsidian) because the plugin does the read.
// Pass an absolute path — the read resolves against the Obsidian process working
// directory, not the caller's shell. Scoped to declared body/value options: short
// fields like a journal `content` memo commonly begin with a literal "@" (mentions),
// which must not be misread as a file path.
const FILE_BACKED_OPTIONS = ["body", "value"];

async function resolveFileBackedArgs(args: CliArgs, options: Record<string, CliOptionSpec>): Promise<CliArgs> {
  let resolved: CliArgs | undefined;
  for (const key of FILE_BACKED_OPTIONS) {
    if (!(key in options)) continue;
    const value = args[key];
    if (typeof value !== "string" || !value.startsWith("@")) continue;
    const filePath = value.slice(1);
    if (!filePath) throw new Error("@file value must include a path");
    const { readFile } = await nodeFs();
    resolved ??= { ...args };
    resolved[key] = await readFile(filePath, "utf8");
  }
  return resolved ?? args;
}

export function registerNativeCliHandlers(plugin: ParaZkPluginContext): void {
  const cliPlugin = plugin as CliCapablePlugin;
  if (!cliPlugin.registerCliHandler) return;

  for (const command of NATIVE_CLI_COMMANDS) {
    cliPlugin.registerCliHandler(
      command.command,
      command.description,
      command.options,
      async (args = {}) => {
        if (isHelpRequest(args)) return renderCommandHelp(command, args);
        return withCliErrors(command.command, args, async () => {
          command.preResolve?.(args);
          rejectUnsupportedByArg(command, args);
          const resolved = await resolveFileBackedArgs(args, command.options);
          return command.run(plugin, resolved);
        }, command.text);
      }
    );
  }
}

function rejectUnsupportedByArg(command: NativeCliCommand, args: CliArgs): void {
  if (Object.prototype.hasOwnProperty.call(command.options, "by")) return;
  if (Object.prototype.hasOwnProperty.call(args, "by")) {
    throw new Error(`by is not accepted by ${command.command}`);
  }
}

// Any command answers `help=true` with its own option schema instead of running,
// so a caller can discover arguments without first triggering a "required" error.
// `--help`/`-h` are honored too when the host forwards them as args.
function isHelpRequest(args: CliArgs): boolean {
  for (const key of ["help", "--help", "-h"]) {
    if (!Object.prototype.hasOwnProperty.call(args, key)) continue;
    const value = args[key];
    if (value === false) return false;
    if (typeof value === "string" && ["false", "0", "no", "off"].includes(value.trim().toLowerCase())) {
      return false;
    }
    return true;
  }
  return false;
}

function renderCommandHelp(command: NativeCliCommand, args: CliArgs): string {
  const options = Object.entries(command.options).map(([name, spec]) => ({
    name,
    value: spec.value ?? null,
    description: spec.description
  }));
  if (readCliString(args, "format") === "json") {
    return JSON.stringify({ ok: true, description: command.description, options });
  }
  const lines = [command.command, `  ${command.description}`, "", "Options:"];
  for (const { name, value, description } of options) {
    lines.push(`  ${value ? `${name}=${value}` : name}`);
    lines.push(`      ${description}`);
  }
  return lines.join("\n");
}

async function withCliErrors(
  command: string,
  args: CliArgs,
  fn: () => Promise<Record<string, unknown>>,
  text: string
): Promise<string> {
  try {
    const payload = await fn();
    return renderCli(command, args, {
      ...payload,
      ok: true
    }, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return renderCli(command, args, {
      ok: false,
      error: message
    }, `error: ${message}`);
  }
}

async function attachLocalFile(plugin: ParaZkPluginContext, args: CliArgs): Promise<Record<string, unknown>> {
  rejectCliAliases(args, {
    file: "source",
    file_path: "source",
    filePath: "source",
    sourcePath: "source"
  });

  const sourcePaths = readAttachmentSources(args);
  const folder = normalizeAttachmentFolder(readCliString(args, "folder"));
  const requestedName = readCliString(args, "name")?.trim();
  if (requestedName && sourcePaths.length !== 1) {
    throw new Error("name is only valid for a single file source");
  }

  const recursive = readCliBoolean(args, "recursive") ?? true;
  const { jobs, collectionMode } = await collectAttachmentJobs(sourcePaths, folder, requestedName, recursive);
  const files: AttachedFile[] = [];
  for (const job of jobs) {
    files.push(await attachAttachmentJob(plugin, job));
  }

  if (!collectionMode && files[0]) return files[0];
  return { count: files.length, files };
}

function readAttachmentSources(args: CliArgs): string[] {
  const source = readCliString(args, "source")?.trim();
  const sources = parseList(readCliString(args, "sources"));
  const paths = [source, ...sources].filter((value): value is string => Boolean(value));
  if (paths.length === 0) throw new Error("source or sources is required");
  return paths;
}

async function collectAttachmentJobs(
  sourcePaths: string[],
  folder: string,
  requestedName: string | undefined,
  recursive: boolean
): Promise<{ jobs: AttachmentJob[]; collectionMode: boolean }> {
  const { stat } = await nodeFs();
  const jobs: AttachmentJob[] = [];
  let collectionMode = sourcePaths.length > 1;

  for (const sourcePath of sourcePaths) {
    const info = await stat(sourcePath);
    if (info.isFile()) {
      jobs.push({ sourcePath, targetFolder: folder, requestedName });
      continue;
    }

    if (info.isDirectory()) {
      if (requestedName) throw new Error("name is only valid for a single file source");
      collectionMode = true;
      const rootFolder = joinVaultPath(folder, vaultPathSegment(localFileName(sourcePath), "directory name"));
      await collectDirectoryAttachmentJobs(sourcePath, rootFolder, recursive, jobs);
      continue;
    }

    throw new Error(`source is not a file or directory: ${sourcePath}`);
  }

  return { jobs, collectionMode };
}

async function collectDirectoryAttachmentJobs(
  sourceDir: string,
  targetFolder: string,
  recursive: boolean,
  jobs: AttachmentJob[]
): Promise<void> {
  const { readdir } = await nodeFs();
  const { join } = await nodePath();
  async function visit(localFolder: string, vaultFolder: string): Promise<void> {
    const entries = (await readdir(localFolder, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const localPath = join(localFolder, entry.name);
      if (entry.isFile()) {
        jobs.push({ sourcePath: localPath, targetFolder: vaultFolder });
        continue;
      }
      if (entry.isDirectory() && recursive) {
        await visit(localPath, joinVaultPath(vaultFolder, vaultPathSegment(entry.name, "directory name")));
      }
    }
  }

  await visit(sourceDir, targetFolder);
}

async function attachAttachmentJob(plugin: ParaZkPluginContext, job: AttachmentJob): Promise<AttachedFile> {
  const { readFile } = await nodeFs();
  const bytes = await readFile(job.sourcePath);
  const filename = attachmentFileName(job.sourcePath, job.requestedName);
  const file = await createUniqueVaultBinary(plugin, job.targetFolder, filename, bytes);
  const link = wikiLink(file.path);

  return {
    source: job.sourcePath,
    path: file.path,
    name: file.name,
    kind: attachmentKind(file.name),
    size: bytes.byteLength,
    link,
    embed: `!${link}`
  };
}

function normalizeAttachmentFolder(value: string | undefined): string {
  const folder = normalizeVaultPath(value || DEFAULT_ATTACHMENT_FOLDER);
  if (!folder) throw new Error("folder is required");
  assertVaultPathSafe(folder, "folder");
  return folder;
}

function attachmentFileName(sourcePath: string, requestedName: string | undefined): string {
  const sourceName = localFileName(sourcePath);
  const sourceExtension = fileExtension(sourceName);
  const trimmedRequestedName = requestedName?.trim();
  let filename = sanitizeFileName(trimmedRequestedName || sourceName);
  if (!filename) throw new Error("attachment filename is required");
  if (trimmedRequestedName && !fileExtension(filename) && sourceExtension) {
    filename = `${filename}${sourceExtension}`;
  }
  assertVaultPathSafe(filename, "name");
  return filename;
}

function vaultPathSegment(value: string, label: string): string {
  const segment = sanitizeFileName(value.trim());
  if (!segment) throw new Error(`${label} is required`);
  assertVaultPathSafe(segment, label);
  return segment;
}

function localFileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
}

function fileExtension(filename: string): string {
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(index) : "";
}

function attachmentKind(filename: string): string {
  const extension = fileExtension(filename).slice(1).toLowerCase();
  if (["apng", "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "webp"].includes(extension)) return "image";
  if (["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm"].includes(extension)) return "video";
  if (["aac", "aiff", "flac", "m4a", "mp3", "ogg", "oga", "opus", "wav", "weba"].includes(extension)) return "audio";
  if (extension === "pdf") return "pdf";
  return "file";
}

async function createUniqueVaultBinary(
  plugin: ParaZkPluginContext,
  folder: string,
  filename: string,
  bytes: Uint8Array
): Promise<{ path: string; name: string }> {
  return withAttachmentCreateLock(async () => {
    await ensureVaultFolder(plugin, folder);
    const extension = fileExtension(filename);
    const stem = extension ? filename.slice(0, -extension.length) : filename;
    for (let index = 0; index < 1000; index += 1) {
      const candidateName = index === 0 ? filename : `${stem} ${index}${extension}`;
      const candidatePath = joinVaultPath(folder, candidateName);
      if (await vaultPathExists(plugin, candidatePath)) continue;
      try {
        return await createVaultBinary(plugin, candidatePath, bytes);
      } catch (error) {
        if (!isAlreadyExistsError(error)) throw error;
      }
    }
    throw new Error(`failed to allocate unique attachment path: ${joinVaultPath(folder, filename)}`);
  });
}

async function withAttachmentCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = attachmentCreateQueue.catch(() => undefined);
  let release: () => void = () => {};
  attachmentCreateQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function vaultPathExists(plugin: ParaZkPluginContext, path: string): Promise<boolean> {
  const adapter = plugin.app.vault.adapter as { exists?: (path: string) => Promise<boolean> };
  if (adapter.exists) return adapter.exists(path);
  return plugin.app.vault.getAbstractFileByPath(path) !== null;
}

async function ensureVaultFolder(plugin: ParaZkPluginContext, folder: string): Promise<void> {
  const parts = normalizeVaultPath(folder).split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = plugin.app.vault.getAbstractFileByPath(current);
    if (existing) {
      if (!isFolderLike(existing)) throw new Error(`target folder path is a file: ${current}`);
      continue;
    }
    try {
      await plugin.app.vault.createFolder(current);
    } catch (error) {
      const after = plugin.app.vault.getAbstractFileByPath(current);
      if (isAlreadyExistsError(error) && (!after || isFolderLike(after))) continue;
      if (after && !isFolderLike(after)) throw new Error(`target folder path is a file: ${current}`);
      throw error;
    }
  }
}

function isFolderLike(value: unknown): boolean {
  return typeof value === "object" && value !== null && Array.isArray((value as { children?: unknown }).children);
}

async function createVaultBinary(
  plugin: ParaZkPluginContext,
  path: string,
  bytes: Uint8Array
): Promise<{ path: string; name: string }> {
  const vault = plugin.app.vault as typeof plugin.app.vault & {
    createBinary?: (path: string, data: ArrayBuffer) => Promise<{ path: string; name: string }>;
  };
  if (!vault.createBinary) throw new Error("binary file creation is unavailable in this Obsidian runtime");
  return vault.createBinary(path, bytesToArrayBuffer(bytes));
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\bEEXIST\b/i.test(message) || /already exists/i.test(message) || /file exists/i.test(message);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertVaultPathSafe(path: string, label: string): void {
  const bad = normalizeVaultPath(path).split("/").some((part) => part === "." || part === "..");
  if (bad) throw new Error(`${label} must not contain . or .. path segments`);
}

function describeCollectionFilters(surfaces: SurfaceDescription[]): Record<string, string[]> {
  const collectionKinds = new Set<string>(
    surfaces.flatMap((surface) => Object.values(surface.collections))
  );
  return Object.fromEntries(
    Object.entries(COLLECTION_FILTERS)
      .filter(([kind]) => collectionKinds.has(kind))
      .map(([kind, keys]) => [kind, [...keys]])
  );
}

function renderCli(command: string, args: CliArgs, payload: Record<string, unknown>, text: string): string {
  if (readCliString(args, "format") === "json") return JSON.stringify(payload);
  return renderCliText(command, payload, text);
}

function readCliString(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function readRequiredCliString(args: CliArgs, key: string): string {
  const value = readCliString(args, key)?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function readCliBoolean(args: CliArgs, key: string): boolean | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") throw new Error(`${key} must be a boolean (got ${String(value)})`);
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`${key} must be a boolean (got ${value})`);
}

function readCliTitle(args: CliArgs): string {
  rejectCliAliases(args, { name: "title" });
  return readCliString(args, "title") ?? "";
}

function readCliKind(args: CliArgs): string | undefined {
  rejectCliAliases(args, { type: "kind" });
  return readCliString(args, "kind");
}

function readCliReadZkKind(args: CliArgs): string | undefined {
  return readCliString(args, "kind");
}

function readCliAreaTitles(args: CliArgs): string | undefined {
  rejectCliAliases(args, { areaTitles: "area_titles" });
  return readCliString(args, "area_titles");
}

function readCliAlias(args: CliArgs): string | undefined {
  rejectCliAliases(args, {
    aliases: "alias",
    alias_list: "alias",
    aliasList: "alias"
  });
  if (!Object.prototype.hasOwnProperty.call(args, "alias")) return undefined;
  const list = normalizeAliasList(args.alias);
  return list[0];
}

function readCliSubnoteType(args: CliArgs): string | undefined {
  rejectCliAliases(args, {
    subnoteType: "subnote_type"
  });
  return readCliString(args, "subnote_type");
}

function readCliNewTitle(args: CliArgs): string {
  rejectCliAliases(args, {
    newTitle: "new_title",
    newName: "new_title"
  });
  return readCliString(args, "new_title") ?? "";
}

function readCliBy(args: CliArgs): string | undefined {
  rejectCliAliases(args, LLM_WIKI_BY_ALIASES);
  if (!Object.prototype.hasOwnProperty.call(args, "by")) return undefined;
  const by = readCliString(args, "by")?.trim();
  if (!by) throw new Error("by must be a model id");
  return by;
}

function readCliRenameKind(args: CliArgs): string | undefined {
  return readCliKind(args);
}

function readCliAuditOptions(args: CliArgs): AuditOptions {
  rejectCliAuditAliases(args);
  return {
    check: readCliString(args, "check"),
    severity: readCliAuditSeverity(args),
    type: readCliString(args, "type"),
    offset: readCliInteger(args, "offset"),
    limit: readCliCollectionLimit(args),
    fix: readCliBoolean(args, "fix") ?? false
  };
}

function rejectCliAuditAliases(args: CliArgs): void {
  for (const key of ["dryRun", "dry_run"]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`${key} is not accepted by para-zk:audit — run without fix to preview, then use fix=true to apply repairs (id-less reference backfill, wiki tag domain)`);
    }
  }
  rejectCliAliases(args, {
    code: "check",
    checkCode: "check",
    level: "severity",
    noteType: "type",
    note_type: "type",
    start: "offset",
    max: "limit",
    autoFix: "fix",
    auto_fix: "fix"
  });
}

function readCliAuditSeverity(args: CliArgs): AuditOptions["severity"] {
  const severity = readCliString(args, "severity");
  if (severity === undefined) return undefined;
  if (severity === "high" || severity === "medium" || severity === "low") return severity;
  throw new Error("severity must be one of high, medium, low");
}

function readCliWikiIngestCandidatesOptions(args: CliArgs): WikiIngestCandidatesOptions {
  rejectCliAliases(args, {
    sourcePath: "source_path",
    sourcePaths: "source_paths",
    source: "source_path",
    sources: "source_paths",
    path: "source_path",
    paths: "source_paths",
    start: "offset",
    max: "limit"
  });
  const sourcePath = readCliString(args, "source_path");
  const sourcePaths = parseList(readCliString(args, "source_paths"));
  const options: WikiIngestCandidatesOptions = {
    mode: readCliString(args, "mode") as WikiIngestCandidatesOptions["mode"],
    offset: readCliInteger(args, "offset"),
    limit: readCliCollectionLimit(args)
  };
  if (sourcePath !== undefined) options.source_path = sourcePath;
  if (sourcePaths.length > 0) options.source_paths = sourcePaths;
  return options;
}

function readCliWikiDomainsOptions(args: CliArgs): WikiDomainsOptions {
  rejectCliAliases(args, { start: "offset", max: "limit" });
  return {
    offset: readCliInteger(args, "offset"),
    limit: readCliCollectionLimit(args)
  };
}

function readCliCollectionOptions(args: CliArgs): CollectionReadOptions | undefined {
  rejectCliAliases(args, {
    dueBefore: "due_before",
    dueAfter: "due_after",
    refKind: "ref_kind"
  });

  const options: CollectionReadOptions = {
    offset: readCliInteger(args, "offset"),
    limit: readCliCollectionLimit(args),
    query: readCliString(args, "query"),
    type: readCliString(args, "type"),
    checkbox: readCliString(args, "checkbox"),
    priority: readCliString(args, "priority"),
    dueBefore: readCliString(args, "due_before"),
    dueAfter: readCliString(args, "due_after"),
    refKind: readCliString(args, "ref_kind")
  };
  return Object.values(options).some((value) => value !== undefined) ? options : undefined;
}

function readCliInteger(args: CliArgs, key: string): number | undefined {
  const raw = readCliString(args, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
}

function readCliCollectionLimit(args: CliArgs): number | "all" | undefined {
  const raw = readCliString(args, "limit");
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (value === "all") return "all";
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) throw new Error("limit must be an integer or all");
  return numberValue;
}

function readCliUpdateOptions(args: CliArgs): {
  key?: string;
  operation?: string;
  value?: unknown;
  valueSource?: "value" | "value_json";
  match?: string;
  replacement?: string;
  all?: boolean;
} {
  rejectCliAliases(args, {
    operation: "op",
    valueJson: "value_json",
    body: "value",
    content: "value",
    text: "value",
    replacement: "with"
  });
  const value = readCliUpdateValue(args);
  const match = readCliStringIfPresent(args, "match");
  const replacement = readCliReplacement(args);
  return {
    key: readCliString(args, "key"),
    operation: readCliString(args, "op"),
    ...(value.present ? { value: value.value } : {}),
    ...(value.source ? { valueSource: value.source } : {}),
    ...(match !== undefined ? { match } : {}),
    ...(replacement.present ? { replacement: replacement.value } : {}),
    all: readCliBoolean(args, "all") ?? false
  };
}

function readCliUpdateValue(args: CliArgs): { present: boolean; value?: unknown; source?: "value" | "value_json" } {
  const hasJson = Object.prototype.hasOwnProperty.call(args, "value_json");
  const hasText = Object.prototype.hasOwnProperty.call(args, "value");

  if (hasJson && hasText) throw new Error("Use only one of value or value_json");
  if (hasJson) {
    const raw = readCliString(args, "value_json") ?? "";
    try {
      return {
        present: true,
        value: JSON.parse(raw),
        source: "value_json"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid value_json: ${message}`);
    }
  }

  if (!hasText) return { present: false };
  return {
    present: true,
    value: readCliString(args, "value") ?? "",
    source: "value"
  };
}

function readCliStringIfPresent(args: CliArgs, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  return readCliString(args, key) ?? "";
}

function readCliReplacement(args: CliArgs): { present: boolean; value?: string } {
  if (!Object.prototype.hasOwnProperty.call(args, "with")) return { present: false };
  return { present: true, value: readCliString(args, "with") ?? "" };
}

function rejectCliAliases(args: CliArgs, aliases: Record<string, string>): void {
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (Object.prototype.hasOwnProperty.call(args, alias)) {
      throw new Error(`Use ${canonical} instead of ${alias}`);
    }
  }
}

function readCliContent(args: CliArgs): string {
  rejectCliAliases(args, {
    text: "content",
    memo: "content"
  });
  return readCliString(args, "content") ?? "";
}
