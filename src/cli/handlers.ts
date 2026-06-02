import type { Plugin } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { CliArgs, CliOptionSpec } from "../types";
import {
  ENERGY_CODE_HELP,
  MATURITY_CODE_HELP,
  PRIORITY_CODE_HELP,
  PROJECT_STATUS_CODE_HELP,
  SUBNOTE_TYPE_CODE_HELP
} from "../vocabulary";
import { PROMOTION_ZK_KIND_CODE_HELP, ZK_KIND_CODE_HELP } from "../zk/kinds";
import { parseList } from "./parse";
import { surfaceReadKeys, surfaceWriteKeys, type CollectionReadOptions, type WorkflowContext } from "../workflows";

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
  run: (plugin: ParaZkPluginContext, args: CliArgs) => Promise<Record<string, unknown>>;
};

const ZK_KEY_TYPES = ["zk_fleeting", "zk_literature", "zk_permanent"];

function readKeyOption(type: string): CliOptionSpec {
  return { value: "<map-path>", description: `Optional stable read key. Valid: ${surfaceReadKeys(type).join(", ")}.` };
}

function writeKeyOption(type: string): CliOptionSpec {
  return { value: "<map-path>", description: `Stable writable key. Valid: ${surfaceWriteKeys(type).join(", ")}.` };
}

function zkKeyOption(keysFor: (type: string) => string[], verb: string): CliOptionSpec {
  const byKind = ZK_KEY_TYPES.map((type) => `${type.replace("zk_", "")}: ${keysFor(type).join(", ")}`);
  return { value: "<map-path>", description: `Stable ${verb} key; depends on ZK kind. ${byKind.join("; ")}.` };
}

const UPDATE_OPTIONS: Record<string, CliOptionSpec> = {
  op: { value: "<set|insert|append|prepend|replace|delete>", description: "Update operation." },
  value: { value: "<text>", description: "Text value for scalar set, append, or prepend operations." },
  value_json: { value: "<json>", description: "Structured value for frontmatter updates and task inserts." },
  match: { value: "<text>", description: "Exact text to match inside the selected key for op=replace." },
  with: { value: "<text>", description: "Replacement text for op=replace." },
  all: { value: "<true|false>", description: "For op=replace, replace all matches instead of requiring a single match." },
  format: { value: "<text|json>", description: "Output format (default: text)." }
};

const RENAME_OPTIONS: Record<string, CliOptionSpec> = {
  title: { value: "<title>", description: "Current note title. Used when path is omitted." },
  path: { value: "<path>", description: "Exact note path." },
  new_title: { value: "<title>", description: "New note title." },
  format: { value: "<text|json>", description: "Output format (default: text)." }
};

const DELETE_OPTIONS: Record<string, CliOptionSpec> = {
  title: { value: "<title>", description: "Current note title. Used when path is omitted." },
  path: { value: "<path>", description: "Exact note path." },
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

const NATIVE_CLI_COMMANDS: NativeCliCommand[] = [
  {
    command: "para-zk:ping",
    description: "Check that the PARA-ZK native CLI handler is loaded",
    options: {
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    text: "pong",
    run: async (plugin) => ({
      pluginId: plugin.manifest.id,
      message: localePack(plugin.settings.locale).messages.pong,
      settings: plugin.settings
    })
  },
  {
    command: "para-zk:setup",
    description: "Set up the PARA-ZK vault layout and managed files",
    options: {
      locale: { value: "<ko|en>", description: "Language for UI, generated files, and tags." },
      dryRun: { value: "<true|false>", description: "Plan changes without writing." },
      force: { value: "<true|false>", description: "Overwrite PARA-ZK managed files when content differs." },
      installDeps: { value: "<true|false>", description: "Install and enable required community plugins." },
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    text: "vault set up",
    run: async (plugin, args) => {
      const locale = normalizeLocale(readCliString(args, "locale"), plugin.settings.locale);
      const result = await plugin.setupVault({
        locale,
        dryRun: readCliBoolean(args, "dryRun") ?? false,
        force: readCliBoolean(args, "force") ?? false,
        installDeps: readCliBoolean(args, "installDeps") ?? false
      });
      return {
        message: localePack(locale).messages.setupReady,
        ...result
      };
    }
  },
  {
    command: "para-zk:read-project",
    description: "Read a project note's stable PARA-ZK surface, optionally by map key",
    options: {
      title: { value: "<title>", description: "Project title. Used when path is omitted." },
      path: { value: "<path>", description: "Project note path for exact selection." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: readKeyOption("project"),
      ...READ_COLLECTION_OPTIONS,
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "project read",
    run: async (plugin, args) => {
      const { readProject } = await import("../workflows");
      const result = await readProject(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        key: readCliString(args, "key"),
        collection: readCliCollectionOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:read-area",
    description: "Read an area note's stable PARA-ZK surface, optionally by map key",
    options: {
      title: { value: "<title>", description: "Area title. Used when path is omitted." },
      path: { value: "<path>", description: "Area note path for exact selection." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: readKeyOption("area"),
      ...READ_COLLECTION_OPTIONS,
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "area read",
    run: async (plugin, args) => {
      const { readArea } = await import("../workflows");
      const result = await readArea(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        key: readCliString(args, "key"),
        collection: readCliCollectionOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:read-resource",
    description: "Read a resource note's stable PARA-ZK surface, optionally by map key",
    options: {
      title: { value: "<title>", description: "Resource title. Used when path is omitted." },
      path: { value: "<path>", description: "Resource note path for exact selection." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: readKeyOption("resource"),
      ...READ_COLLECTION_OPTIONS,
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "resource read",
    run: async (plugin, args) => {
      const { readResource } = await import("../workflows");
      const result = await readResource(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        key: readCliString(args, "key"),
        collection: readCliCollectionOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:read-zk",
    description: "Read a ZK note's stable PARA-ZK surface, optionally by map key",
    options: {
      title: { value: "<title>", description: "ZK note title. Used when path is omitted." },
      path: { value: "<path>", description: "ZK note path for exact selection." },
      kind: { value: `<${ZK_KIND_CODE_HELP}>`, description: "Optional ZK kind filter." },
      key: zkKeyOption(surfaceReadKeys, "read"),
      ...READ_COLLECTION_OPTIONS,
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "ZK read",
    run: async (plugin, args) => {
      const { readZk } = await import("../workflows");
      const result = await readZk(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        kind: readCliReadZkKind(args),
        key: readCliString(args, "key"),
        collection: readCliCollectionOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:read-journal",
    description: "Read a daily journal note's stable PARA-ZK surface, optionally by map key",
    options: {
      date: { value: "<YYYY-MM-DD>", description: "Journal date. Defaults to today." },
      path: { value: "<path>", description: "Journal note path for exact selection." },
      key: readKeyOption("journal"),
      ...READ_COLLECTION_OPTIONS,
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "journal read",
    run: async (plugin, args) => {
      const { readJournal } = await import("../workflows");
      const result = await readJournal(workflowContext(plugin), {
        date: readCliString(args, "date"),
        path: readCliPath(args),
        key: readCliString(args, "key"),
        collection: readCliCollectionOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:read-retro",
    description: "Read a retro note's stable PARA-ZK surface, optionally by map key",
    options: {
      title: { value: "<title>", description: "Retro note title. Used when path is omitted." },
      path: { value: "<path>", description: "Retro note path for exact selection." },
      date: { value: "<YYYY-MM-DD>", description: "Optional date used to narrow the ISO week folder." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: readKeyOption("retro"),
      ...READ_COLLECTION_OPTIONS,
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "retro read",
    run: async (plugin, args) => {
      const { readRetro } = await import("../workflows");
      const result = await readRetro(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        date: readCliString(args, "date"),
        archived: readCliBoolean(args, "archived"),
        key: readCliString(args, "key"),
        collection: readCliCollectionOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:update-project",
    description: "Update a project note's stable PARA-ZK surface by map key",
    options: {
      title: { value: "<title>", description: "Project title. Used when path is omitted." },
      path: { value: "<path>", description: "Project note path for exact selection." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: writeKeyOption("project"),
      ...UPDATE_OPTIONS
    },
    text: "project updated",
    run: async (plugin, args) => {
      const { updateProject } = await import("../workflows");
      const result = await updateProject(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        ...readCliUpdateOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:update-area",
    description: "Update an area note's stable PARA-ZK surface by map key",
    options: {
      title: { value: "<title>", description: "Area title. Used when path is omitted." },
      path: { value: "<path>", description: "Area note path for exact selection." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: writeKeyOption("area"),
      ...UPDATE_OPTIONS
    },
    text: "area updated",
    run: async (plugin, args) => {
      const { updateArea } = await import("../workflows");
      const result = await updateArea(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        ...readCliUpdateOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:update-resource",
    description: "Update a resource note's stable PARA-ZK surface by map key",
    options: {
      title: { value: "<title>", description: "Resource title. Used when path is omitted." },
      path: { value: "<path>", description: "Resource note path for exact selection." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: writeKeyOption("resource"),
      ...UPDATE_OPTIONS
    },
    text: "resource updated",
    run: async (plugin, args) => {
      const { updateResource } = await import("../workflows");
      const result = await updateResource(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        ...readCliUpdateOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:update-zk",
    description: "Update a ZK note's stable PARA-ZK surface by map key",
    options: {
      title: { value: "<title>", description: "ZK note title. Used when path is omitted." },
      path: { value: "<path>", description: "ZK note path for exact selection." },
      kind: { value: `<${ZK_KIND_CODE_HELP}>`, description: "Optional ZK kind filter." },
      key: zkKeyOption(surfaceWriteKeys, "write"),
      ...UPDATE_OPTIONS
    },
    text: "ZK updated",
    run: async (plugin, args) => {
      const { updateZk } = await import("../workflows");
      const result = await updateZk(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        kind: readCliKind(args),
        ...readCliUpdateOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:update-journal",
    description: "Update a daily journal note's stable PARA-ZK surface by map key",
    options: {
      date: { value: "<YYYY-MM-DD>", description: "Journal date. Defaults to today." },
      path: { value: "<path>", description: "Journal note path for exact selection." },
      key: writeKeyOption("journal"),
      ...UPDATE_OPTIONS
    },
    text: "journal updated",
    run: async (plugin, args) => {
      const { updateJournal } = await import("../workflows");
      const result = await updateJournal(workflowContext(plugin), {
        date: readCliString(args, "date"),
        path: readCliPath(args),
        ...readCliUpdateOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:update-retro",
    description: "Update a retro note's stable PARA-ZK surface by map key",
    options: {
      title: { value: "<title>", description: "Retro note title. Used when path is omitted." },
      path: { value: "<path>", description: "Retro note path for exact selection." },
      date: { value: "<YYYY-MM-DD>", description: "Optional date used to narrow the ISO week folder." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." },
      key: writeKeyOption("retro"),
      ...UPDATE_OPTIONS
    },
    text: "retro updated",
    run: async (plugin, args) => {
      const { updateRetro } = await import("../workflows");
      const result = await updateRetro(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        date: readCliString(args, "date"),
        archived: readCliBoolean(args, "archived"),
        ...readCliUpdateOptions(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:rename-project",
    description: "Rename a project note, including its folder-style parent folder",
    options: {
      ...RENAME_OPTIONS,
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." }
    },
    text: "project renamed",
    run: async (plugin, args) => {
      const { renameProject } = await import("../workflows");
      const result = await renameProject(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        newTitle: readCliNewTitle(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:rename-area",
    description: "Rename an area note, including its folder-style parent folder",
    options: {
      ...RENAME_OPTIONS,
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." }
    },
    text: "area renamed",
    run: async (plugin, args) => {
      const { renameArea } = await import("../workflows");
      const result = await renameArea(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        newTitle: readCliNewTitle(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:rename-resource",
    description: "Rename a resource note file",
    options: {
      ...RENAME_OPTIONS,
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." }
    },
    text: "resource renamed",
    run: async (plugin, args) => {
      const { renameResource } = await import("../workflows");
      const result = await renameResource(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        newTitle: readCliNewTitle(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:rename-zk",
    description: "Rename a ZK note file",
    options: {
      ...RENAME_OPTIONS,
      kind: { value: `<${ZK_KIND_CODE_HELP}>`, description: "Optional ZK kind filter." }
    },
    text: "ZK renamed",
    run: async (plugin, args) => {
      const { renameZk } = await import("../workflows");
      const result = await renameZk(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        kind: readCliRenameKind(args),
        newTitle: readCliNewTitle(args)
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:delete-project",
    description: "Move a project note to Obsidian trash and clean PARA-ZK-owned references",
    options: {
      ...DELETE_OPTIONS,
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." }
    },
    text: "project deleted",
    run: async (plugin, args) => {
      const { deleteProject } = await import("../workflows");
      const result = await deleteProject(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        force: readCliBoolean(args, "force") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:delete-area",
    description: "Move an area note to Obsidian trash and clean PARA-ZK-owned references",
    options: {
      ...DELETE_OPTIONS,
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." }
    },
    text: "area deleted",
    run: async (plugin, args) => {
      const { deleteArea } = await import("../workflows");
      const result = await deleteArea(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        force: readCliBoolean(args, "force") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:delete-resource",
    description: "Move a resource note to Obsidian trash and clean PARA-ZK-owned references",
    options: {
      ...DELETE_OPTIONS,
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." }
    },
    text: "resource deleted",
    run: async (plugin, args) => {
      const { deleteResource } = await import("../workflows");
      const result = await deleteResource(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        force: readCliBoolean(args, "force") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:delete-zk",
    description: "Move a ZK note to Obsidian trash and clean PARA-ZK-owned references",
    options: {
      ...DELETE_OPTIONS,
      kind: { value: `<${ZK_KIND_CODE_HELP}>`, description: "Optional ZK kind filter." }
    },
    text: "ZK deleted",
    run: async (plugin, args) => {
      const { deleteZk } = await import("../workflows");
      const result = await deleteZk(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        kind: readCliRenameKind(args),
        force: readCliBoolean(args, "force") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:delete-journal",
    description: "Move a daily journal note to Obsidian trash and report incoming links",
    options: {
      date: { value: "<YYYY-MM-DD>", description: "Journal date. Defaults to today." },
      path: { value: "<path>", description: "Exact journal note path." },
      force: { value: "<true|false>", description: "Reserved for consistency with other delete commands." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "journal deleted",
    run: async (plugin, args) => {
      const { deleteJournal } = await import("../workflows");
      const result = await deleteJournal(workflowContext(plugin), {
        date: readCliString(args, "date"),
        path: readCliPath(args),
        force: readCliBoolean(args, "force") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:delete-retro",
    description: "Move a retro note to Obsidian trash and clean PARA-ZK-owned references",
    options: {
      ...DELETE_OPTIONS,
      date: { value: "<YYYY-MM-DD>", description: "Optional date used to narrow the ISO week folder." },
      archived: { value: "<true|false>", description: "When selecting by title, true selects the archived PARA copy and false restricts lookup to the active copy." }
    },
    text: "retro deleted",
    run: async (plugin, args) => {
      const { deleteRetro } = await import("../workflows");
      const result = await deleteRetro(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        date: readCliString(args, "date"),
        archived: readCliBoolean(args, "archived"),
        force: readCliBoolean(args, "force") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:create-project",
    description: "Create a PARA project note",
    options: {
      title: { value: "<title>", description: "Project title." },
      areas: { value: "<json|comma-list>", description: "Area links to store in frontmatter." },
      area_titles: { value: "<json|comma-list>", description: "Area titles to reuse or create and link." },
      status: { value: `<${PROJECT_STATUS_CODE_HELP}>`, description: "Locale-neutral project status code." },
      priority: { value: `<${PRIORITY_CODE_HELP}>`, description: "Locale-neutral project priority code." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "project created",
    run: async (plugin, args) => {
      const { createProject } = await import("../workflows");
      const result = await createProject(workflowContext(plugin), {
        title: readCliTitle(args),
        areas: parseList(readCliString(args, "areas")),
        areaTitles: parseList(readCliAreaTitles(args)),
        status: readCliString(args, "status"),
        priority: readCliString(args, "priority"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:create-area",
    description: "Create a PARA area note",
    options: {
      title: { value: "<title>", description: "Area title." },
      parent: { value: "<path>", description: "Optional parent area path." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "area created",
    run: async (plugin, args) => {
      const { createArea } = await import("../workflows");
      const result = await createArea(workflowContext(plugin), {
        title: readCliTitle(args),
        parentPath: readCliString(args, "parent"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:create-resource",
    description: "Create a PARA resource note and optionally link it from a source note",
    options: {
      title: { value: "<title>", description: "Resource title." },
      path: { value: "<path>", description: "Source note path to receive the resource link." },
      link: { value: "<true|false>", description: "Whether to add the link to the source note." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "resource created",
    run: async (plugin, args) => {
      const { createResource } = await import("../workflows");
      const sourcePath = readCliPath(args);
      const result = await createResource(workflowContext(plugin), {
        title: readCliTitle(args),
        sourcePath,
        linkToSource: readCliBoolean(args, "link") ?? Boolean(sourcePath),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:add-reference",
    description: "Add an existing vault file, wikilink, markdown link, URL, or text to a note's frontmatter reference registry",
    options: {
      path: { value: "<path>", description: "Source note path that receives the reference." },
      target: { value: "<path|url|wikilink|markdown-link|text>", description: "Reference target to add." },
      description: { value: "<text>", description: "Optional per-reference description." },
      open: { value: "<true|false>", description: "Open the source note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "reference added",
    run: async (plugin, args) => {
      const { addReference } = await import("../workflows");
      const result = await addReference(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        target: readRequiredCliString(args, "target"),
        description: readCliString(args, "description"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:create-subnote",
    description: "Create a child document under a project or area note",
    options: {
      title: { value: "<title>", description: "Subnote title." },
      path: { value: "<path>", description: "Parent note path." },
      subnote_type: { value: `<${SUBNOTE_TYPE_CODE_HELP}>`, description: "Locale-neutral subnote type code." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "subnote created",
    run: async (plugin, args) => {
      const { createSubnote } = await import("../workflows");
      const result = await createSubnote(workflowContext(plugin), {
        title: readCliTitle(args),
        sourcePath: readCliPath(args),
        subnoteType: readCliSubnoteType(args),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:create-subarea",
    description: "Create a child area under an area note",
    options: {
      title: { value: "<title>", description: "Subarea title." },
      path: { value: "<path>", description: "Parent area path." },
      inheritParentTag: { value: "<true|false>", description: "Include parent area tag as well as child tag." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "subarea created",
    run: async (plugin, args) => {
      const { createSubarea } = await import("../workflows");
      const result = await createSubarea(workflowContext(plugin), {
        title: readCliTitle(args),
        sourcePath: readCliPath(args),
        inheritParentTag: readCliBoolean(args, "inheritParentTag") ?? true,
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:create-retro",
    description: "Create a weekly retro note, optionally scoped to a project or area",
    options: {
      path: { value: "<path>", description: "Project or area note path." },
      title: { value: "<title>", description: "Retro title segment." },
      date: { value: "<YYYY-MM-DD>", description: "Date used for ISO week calculation." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "retro created",
    run: async (plugin, args) => {
      const { createRetro } = await import("../workflows");
      const result = await createRetro(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        title: readCliTitle(args),
        date: readCliString(args, "date"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:create-zk",
    description: "Create a ZK note",
    options: {
      title: { value: "<title>", description: "ZK note title." },
      kind: { value: `<${ZK_KIND_CODE_HELP}>`, description: "Locale-neutral ZK note kind." },
      maturity: { value: `<${MATURITY_CODE_HELP}>`, description: "Permanent-note maturity code." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "ZK note created",
    run: async (plugin, args) => {
      const { createZk } = await import("../workflows");
      const result = await createZk(workflowContext(plugin), {
        title: readCliTitle(args),
        kind: readCliKind(args),
        maturity: readCliString(args, "maturity"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
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
    run: async (plugin, args) => {
      const { captureJournal } = await import("../workflows");
      const result = await captureJournal(workflowContext(plugin), {
        content: readCliContent(args),
        date: readCliString(args, "date"),
        time: readCliString(args, "time"),
        energy: readCliString(args, "energy"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:promote-resource",
    description: "Promote a resource note to a ZK note",
    options: {
      path: { value: "<path>", description: "Source resource path." },
      title: { value: "<title>", description: "New ZK note title." },
      kind: { value: `<${ZK_KIND_CODE_HELP}>`, description: "Locale-neutral target ZK kind." },
      maturity: { value: `<${MATURITY_CODE_HELP}>`, description: "Permanent-note maturity code." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "resource promoted",
    run: async (plugin, args) => {
      const { promoteResource } = await import("../workflows");
      const result = await promoteResource(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        title: readCliTitle(args),
        kind: readCliKind(args),
        maturity: readCliString(args, "maturity"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  },
  {
    command: "para-zk:promote-fleeting",
    description: "Promote a fleeting note to Literature or Permanent and mark the source processed",
    options: {
      path: { value: "<path>", description: "Source fleeting note path." },
      title: { value: "<title>", description: "New ZK note title." },
      kind: { value: `<${PROMOTION_ZK_KIND_CODE_HELP}>`, description: "Locale-neutral target ZK kind." },
      maturity: { value: `<${MATURITY_CODE_HELP}>`, description: "Permanent-note maturity code." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "fleeting promoted",
    run: async (plugin, args) => {
      const { promoteFleeting } = await import("../workflows");
      const result = await promoteFleeting(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        title: readCliTitle(args),
        kind: readCliKind(args),
        maturity: readCliString(args, "maturity"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ...result };
    }
  }
];

export function registerNativeCliHandlers(plugin: ParaZkPluginContext): void {
  const cliPlugin = plugin as CliCapablePlugin;
  if (!cliPlugin.registerCliHandler) return;

  for (const command of NATIVE_CLI_COMMANDS) {
    cliPlugin.registerCliHandler(
      command.command,
      command.description,
      command.options,
      async (args = {}) => withCliErrors(
        plugin,
        args,
        command.command,
        () => command.run(plugin, args),
        command.text
      )
    );
  }
}

async function withCliErrors(
  plugin: ParaZkPluginContext,
  args: CliArgs,
  command: string,
  fn: () => Promise<Record<string, unknown>>,
  text: string
): Promise<string> {
  try {
    const payload = await fn();
    return renderCli(args, {
      ...payload,
      ok: true,
      command
    }, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return renderCli(args, {
      ok: false,
      command,
      error: message
    }, `error: ${message}`);
  }
}

function workflowContext(plugin: ParaZkPluginContext): WorkflowContext {
  return {
    app: plugin.app,
    settings: plugin.settings
  };
}

function renderCli(args: CliArgs, payload: Record<string, unknown>, text: string): string {
  if (readCliString(args, "format") === "json") return JSON.stringify(payload);
  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  return warnings.length > 0
    ? [text, ...warnings.map((warning) => `warning: ${warning}`)].join("\n")
    : text;
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
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
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

function readCliSubnoteType(args: CliArgs): string | undefined {
  rejectCliAliases(args, {
    subnoteType: "subnote_type",
    type: "subnote_type"
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

function readCliRenameKind(args: CliArgs): string | undefined {
  return readCliKind(args);
}

function readCliPath(args: CliArgs): string | undefined {
  for (const key of ["file_path", "filePath", "source", "sourcePath", "file"]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`Use path instead of ${key}`);
    }
  }
  return readCliString(args, "path");
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
    content: "value",
    text: "value",
    replacement: "with"
  });
  const value = readCliUpdateValue(args);
  const match = readDecodedCliString(args, "match");
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
    value: decodeCliEscapes(readCliString(args, "value") ?? ""),
    source: "value"
  };
}

function readDecodedCliString(args: CliArgs, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(args, key)) return undefined;
  return decodeCliEscapes(readCliString(args, key) ?? "");
}

function readCliReplacement(args: CliArgs): { present: boolean; value?: string } {
  return Object.prototype.hasOwnProperty.call(args, "with")
    ? { present: true, value: decodeCliEscapes(readCliString(args, "with") ?? "") }
    : { present: false };
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

function decodeCliEscapes(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}
