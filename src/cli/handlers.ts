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
import type { WorkflowContext } from "../workflows";

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
    command: "para-zk:init",
    description: "Initialize the PARA-ZK vault layout and managed files",
    options: {
      locale: { value: "<ko|en>", description: "Language for UI, generated files, and tags." },
      dryRun: { value: "<true|false>", description: "Plan changes without writing." },
      force: { value: "<true|false>", description: "Overwrite PARA-ZK managed files when content differs." },
      installDeps: { value: "<true|false>", description: "Install and enable required community plugins." },
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    text: "vault initialized",
    run: async (plugin, args) => {
      const locale = normalizeLocale(readCliString(args, "locale"), plugin.settings.locale);
      const result = await plugin.initializeVault({
        locale,
        dryRun: readCliBoolean(args, "dryRun") ?? false,
        force: readCliBoolean(args, "force") ?? false,
        installDeps: readCliBoolean(args, "installDeps") ?? false
      });
      return {
        message: localePack(locale).messages.initReady,
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
      key: { value: "<map-path>", description: "Optional stable key such as frontmatter/status, summary, children, or children/<title>/body." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "project read",
    run: async (plugin, args) => {
      const { readProject } = await import("../workflows");
      const result = await readProject(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        key: readCliString(args, "key")
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
      key: { value: "<map-path>", description: "Optional stable key such as overview, references, children, or children/<title>/overview." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "area read",
    run: async (plugin, args) => {
      const { readArea } = await import("../workflows");
      const result = await readArea(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        key: readCliString(args, "key")
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
      key: { value: "<map-path>", description: "Optional stable key such as overview, body, or references." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "resource read",
    run: async (plugin, args) => {
      const { readResource } = await import("../workflows");
      const result = await readResource(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        archived: readCliBoolean(args, "archived"),
        key: readCliString(args, "key")
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
      key: { value: "<map-path>", description: "Optional stable key such as summary, body, frontmatter/maturity, or references." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "ZK read",
    run: async (plugin, args) => {
      const { readZk } = await import("../workflows");
      const result = await readZk(workflowContext(plugin), {
        title: readCliTitle(args),
        path: readCliPath(args),
        kind: readCliString(args, "kind") ?? readCliString(args, "type"),
        key: readCliString(args, "key")
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
      key: { value: "<map-path>", description: "Optional stable key such as focus, quick_memo, timeline, or today_tasks." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "journal read",
    run: async (plugin, args) => {
      const { readJournal } = await import("../workflows");
      const result = await readJournal(workflowContext(plugin), {
        date: readCliString(args, "date"),
        path: readCliPath(args),
        key: readCliString(args, "key")
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
      key: { value: "<map-path>", description: "Optional stable key such as week_progress, next_actions, or retro_summary." },
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
        key: readCliString(args, "key")
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
        areaTitles: parseList(readCliString(args, "area_titles") ?? readCliString(args, "areaTitles")),
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
    description: "Add an existing vault file, wikilink, markdown link, or URL to a note's References section",
    options: {
      path: { value: "<path>", description: "Source note path that receives the reference." },
      target: { value: "<path|url|wikilink|markdown-link>", description: "Reference target to add." },
      label: { value: "<label>", description: "Optional display label for file paths and URLs." },
      open: { value: "<true|false>", description: "Open the source note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "reference added",
    run: async (plugin, args) => {
      const { addReference } = await import("../workflows");
      const result = await addReference(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        target: readRequiredCliString(args, "target"),
        label: readCliString(args, "label"),
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
        subnoteType: readCliString(args, "subnote_type") ?? readCliString(args, "subnoteType") ?? readCliString(args, "type"),
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
      name: { value: "<name>", description: "Retro name segment." },
      date: { value: "<YYYY-MM-DD>", description: "Date used for ISO week calculation." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    text: "retro created",
    run: async (plugin, args) => {
      const { createRetro } = await import("../workflows");
      const result = await createRetro(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        name: readCliString(args, "name") ?? readCliString(args, "title"),
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
        kind: readCliString(args, "kind") ?? readCliString(args, "type"),
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
        title: readCliString(args, "title") ?? readCliString(args, "name"),
        kind: readCliString(args, "kind") ?? readCliString(args, "type"),
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
        title: readCliString(args, "title") ?? readCliString(args, "name"),
        kind: readCliString(args, "kind") ?? readCliString(args, "type"),
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
  return readCliString(args, "title") ?? readCliString(args, "name") ?? "";
}

function readCliPath(args: CliArgs): string | undefined {
  for (const key of ["file_path", "filePath", "source", "sourcePath", "file"]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      throw new Error(`Use path instead of ${key}`);
    }
  }
  return readCliString(args, "path");
}

function readCliContent(args: CliArgs): string {
  return readCliString(args, "content")
    ?? readCliString(args, "text")
    ?? readCliString(args, "memo")
    ?? "";
}
