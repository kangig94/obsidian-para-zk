import type { Plugin } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import type { CliArgs, CliOptionSpec } from "../types";
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

export function registerNativeCliHandlers(plugin: ParaZkPluginContext): void {
  const cliPlugin = plugin as CliCapablePlugin;
  if (!cliPlugin.registerCliHandler) return;

  cliPlugin.registerCliHandler(
    "para-zk:ping",
    "Check that the PARA-ZK native CLI handler is loaded",
    {
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:ping", async () => ({
      ok: true,
      command: "para-zk:ping",
      pluginId: plugin.manifest.id,
      message: localePack(plugin.settings.locale).messages.pong,
      settings: plugin.settings
    }), "pong")
  );

  cliPlugin.registerCliHandler(
    "para-zk:init",
    "Initialize the PARA-ZK vault layout and managed files",
    {
      locale: { value: "<ko|en>", description: "Language for UI, generated files, and tags." },
      dryRun: { value: "<true|false>", description: "Plan changes without writing." },
      force: { value: "<true|false>", description: "Overwrite PARA-ZK managed files when content differs." },
      format: { value: "<text|json>", description: "Output format (default: text)" }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:init", async () => {
      const locale = normalizeLocale(readCliString(args, "locale"), plugin.settings.locale);
      const result = await plugin.initializeVault({
        locale,
        dryRun: readCliBoolean(args, "dryRun") ?? false,
        force: readCliBoolean(args, "force") ?? false
      });
      return {
        ok: true,
        command: "para-zk:init",
        message: localePack(locale).messages.initReady,
        ...result
      };
    }, "vault initialized")
  );

  registerWorkflowCliHandlers(plugin, cliPlugin);
}

function registerWorkflowCliHandlers(plugin: ParaZkPluginContext, cliPlugin: CliCapablePlugin): void {
  cliPlugin.registerCliHandler(
    "para-zk:create-project",
    "Create a PARA project note",
    {
      title: { value: "<title>", description: "Project title." },
      areas: { value: "<json|comma-list>", description: "Area links to store in frontmatter." },
      status: { value: "<status>", description: "Project status value." },
      priority: { value: "<priority>", description: "Project priority value." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:create-project", async () => {
      const { createProject } = await import("../workflows");
      const result = await createProject(workflowContext(plugin), {
        title: readCliTitle(args),
        areas: parseList(readCliString(args, "areas")),
        status: readCliString(args, "status"),
        priority: readCliString(args, "priority"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:create-project", ...result };
    }, "project created")
  );

  cliPlugin.registerCliHandler(
    "para-zk:create-area",
    "Create a PARA area note",
    {
      title: { value: "<title>", description: "Area title." },
      parent: { value: "<path>", description: "Optional parent area path." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:create-area", async () => {
      const { createArea } = await import("../workflows");
      const result = await createArea(workflowContext(plugin), {
        title: readCliTitle(args),
        parentPath: readCliString(args, "parent"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:create-area", ...result };
    }, "area created")
  );

  cliPlugin.registerCliHandler(
    "para-zk:create-resource",
    "Create a PARA resource note and optionally link it from a source note",
    {
      title: { value: "<title>", description: "Resource title." },
      file_path: { value: "<path>", description: "Source note path to receive the resource link." },
      link: { value: "<true|false>", description: "Whether to add the link to the source note." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:create-resource", async () => {
      const { createResource } = await import("../workflows");
      const sourcePath = readCliPath(args);
      const result = await createResource(workflowContext(plugin), {
        title: readCliTitle(args),
        sourcePath,
        linkToSource: readCliBoolean(args, "link") ?? Boolean(sourcePath),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:create-resource", ...result };
    }, "resource created")
  );

  cliPlugin.registerCliHandler(
    "para-zk:create-subnote",
    "Create a child document under a project or area note",
    {
      title: { value: "<title>", description: "Subnote title." },
      file_path: { value: "<path>", description: "Parent note path." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:create-subnote", async () => {
      const { createSubnote } = await import("../workflows");
      const result = await createSubnote(workflowContext(plugin), {
        title: readCliTitle(args),
        sourcePath: readCliPath(args),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:create-subnote", ...result };
    }, "subnote created")
  );

  cliPlugin.registerCliHandler(
    "para-zk:create-subarea",
    "Create a child area under an area note",
    {
      title: { value: "<title>", description: "Subarea title." },
      file_path: { value: "<path>", description: "Parent area path." },
      inheritParentTag: { value: "<true|false>", description: "Include parent area tag as well as child tag." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:create-subarea", async () => {
      const { createSubarea } = await import("../workflows");
      const result = await createSubarea(workflowContext(plugin), {
        title: readCliTitle(args),
        sourcePath: readCliPath(args),
        inheritParentTag: readCliBoolean(args, "inheritParentTag") ?? true,
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:create-subarea", ...result };
    }, "subarea created")
  );

  cliPlugin.registerCliHandler(
    "para-zk:create-retro",
    "Create a weekly retro note, optionally scoped to a project or area",
    {
      file_path: { value: "<path>", description: "Project or area note path." },
      name: { value: "<name>", description: "Retro name segment." },
      date: { value: "<YYYY-MM-DD>", description: "Date used for ISO week calculation." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:create-retro", async () => {
      const { createRetro } = await import("../workflows");
      const result = await createRetro(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        name: readCliString(args, "name") ?? readCliString(args, "title"),
        date: readCliString(args, "date"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:create-retro", ...result };
    }, "retro created")
  );

  cliPlugin.registerCliHandler(
    "para-zk:create-zk",
    "Create a ZK note",
    {
      title: { value: "<title>", description: "ZK note title." },
      kind: { value: "<Fleeting|Literature|Permanent>", description: "ZK note kind." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:create-zk", async () => {
      const { createZk } = await import("../workflows");
      const result = await createZk(workflowContext(plugin), {
        title: readCliTitle(args),
        kind: readCliString(args, "kind") ?? readCliString(args, "type"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:create-zk", ...result };
    }, "ZK note created")
  );

  cliPlugin.registerCliHandler(
    "para-zk:capture-journal",
    "Append a quick memo to the daily journal",
    {
      content: { value: "<content>", description: "Memo content." },
      date: { value: "<YYYY-MM-DD>", description: "Journal date." },
      time: { value: "<HH:mm>", description: "Memo time." },
      open: { value: "<true|false>", description: "Open the journal note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:capture-journal", async () => {
      const { captureJournal } = await import("../workflows");
      const result = await captureJournal(workflowContext(plugin), {
        content: readCliContent(args),
        date: readCliString(args, "date"),
        time: readCliString(args, "time"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:capture-journal", ...result };
    }, "journal captured")
  );

  cliPlugin.registerCliHandler(
    "para-zk:promote-resource",
    "Promote a resource note to a ZK note",
    {
      file_path: { value: "<path>", description: "Source resource path." },
      title: { value: "<title>", description: "New ZK note title." },
      kind: { value: "<Fleeting|Literature|Permanent>", description: "Target ZK kind." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:promote-resource", async () => {
      const { promoteResource } = await import("../workflows");
      const result = await promoteResource(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        title: readCliString(args, "title") ?? readCliString(args, "name"),
        kind: readCliString(args, "kind") ?? readCliString(args, "type"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:promote-resource", ...result };
    }, "resource promoted")
  );

  cliPlugin.registerCliHandler(
    "para-zk:promote-fleeting",
    "Promote a fleeting note to Literature or Permanent and archive the source",
    {
      file_path: { value: "<path>", description: "Source fleeting note path." },
      title: { value: "<title>", description: "New ZK note title." },
      kind: { value: "<Literature|Permanent>", description: "Target ZK kind." },
      open: { value: "<true|false>", description: "Open the created note in Obsidian." },
      format: { value: "<text|json>", description: "Output format (default: text)." }
    },
    async (args = {}) => withCliErrors(plugin, args, "para-zk:promote-fleeting", async () => {
      const { promoteFleeting } = await import("../workflows");
      const result = await promoteFleeting(workflowContext(plugin), {
        sourcePath: readCliPath(args),
        title: readCliString(args, "title") ?? readCliString(args, "name"),
        kind: readCliString(args, "kind") ?? readCliString(args, "type"),
        open: readCliBoolean(args, "open") ?? false
      });
      return { ok: true, command: "para-zk:promote-fleeting", ...result };
    }, "fleeting promoted")
  );
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
    return renderCli(args, payload, text);
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
  return readCliString(args, "format") === "json" ? JSON.stringify(payload) : text;
}

function readCliString(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
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
  return readCliString(args, "file_path")
    ?? readCliString(args, "filePath")
    ?? readCliString(args, "source")
    ?? readCliString(args, "sourcePath")
    ?? readCliString(args, "path")
    ?? readCliString(args, "file");
}

function readCliContent(args: CliArgs): string {
  return readCliString(args, "content")
    ?? readCliString(args, "text")
    ?? readCliString(args, "memo")
    ?? "";
}
