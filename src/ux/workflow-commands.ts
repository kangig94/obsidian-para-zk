import { Notice } from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { isRecord } from "../records";
import type { WorkflowContext } from "../workflows";
import { chooseValue, promptText } from "./prompts";

export function registerStatusAndInitCommands(plugin: ParaZkPluginContext): void {
  const labels = localePack(plugin.settings.locale).labels;

  plugin.addCommand({
    id: "check-status",
    name: labels.statusCommandName,
    callback: () => {
      new Notice(localePack(plugin.settings.locale).messages.statusReady);
    }
  });

  plugin.addCommand({
    id: "initialize-vault",
    name: labels.initCommandName,
    callback: async () => {
      const result = await plugin.initializeVault({ force: false, dryRun: false });
      new Notice(`${localePack(plugin.settings.locale).messages.initReady}: ${result.created.length} created, ${result.updated.length} updated`);
    }
  });

  plugin.addCommand({
    id: "sync-managed-files",
    name: labels.syncTemplatesCommandName,
    callback: async () => {
      const result = await plugin.initializeVault({ force: true, dryRun: false });
      new Notice(`${localePack(plugin.settings.locale).messages.initReady}: ${result.created.length} created, ${result.updated.length} updated`);
    }
  });
}

export function registerWorkflowCommands(plugin: ParaZkPluginContext): void {
  const labels = localePack(plugin.settings.locale).labels;
  const commands = [
    ["create-project", labels.createProjectCommandName],
    ["create-area", labels.createAreaCommandName],
    ["create-resource", labels.createResourceCommandName],
    ["create-subnote", labels.createSubnoteCommandName],
    ["create-subarea", labels.createSubareaCommandName],
    ["create-retro", labels.createRetroCommandName],
    ["create-zk", labels.createZkCommandName],
    ["capture-journal", labels.captureJournalCommandName],
    ["promote-resource", labels.promoteResourceCommandName],
    ["promote-fleeting", labels.promoteFleetingCommandName]
  ] as const;

  for (const [id, name] of commands) {
    plugin.addCommand({
      id,
      name,
      callback: () => {
        void runGuiWorkflow(plugin, id);
      }
    });
  }
}

export async function runGuiWorkflow(plugin: ParaZkPluginContext, command: string, sourcePath?: string): Promise<void> {
  try {
    const result = await executeInteractiveWorkflow(plugin, command, sourcePath);
    if (!result) {
      new Notice(localePack(plugin.settings.locale).messages.commandCancelled);
      return;
    }
    const path = isRecord(result) && typeof result.path === "string" ? `: ${result.path}` : "";
    new Notice(`${localePack(plugin.settings.locale).messages.commandComplete}${path}`);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`PARA-ZK error: ${message}`);
  }
}

export function workflowButtonLabel(plugin: ParaZkPluginContext, command: string | undefined): string | undefined {
  if (!command) return undefined;
  const labels = localePack(plugin.settings.locale).labels;
  const labelByCommand: Record<string, string> = {
    "create-project": labels.createProjectCommandName,
    "create-area": labels.createAreaCommandName,
    "create-resource": labels.createResource,
    "create-subnote": labels.createSubnote,
    "create-subarea": labels.createSubarea,
    "create-retro": labels.createRetro,
    "create-zk": labels.createZkCommandName,
    "capture-journal": labels.captureJournalCommandName,
    "promote-resource": labels.promoteToZk,
    "promote-fleeting": labels.promote
  };
  return labelByCommand[command];
}

export function normalizeWorkflowCommand(value: string | undefined): string | undefined {
  const command = value?.trim();
  if (!command) return undefined;
  const aliases: Record<string, string> = {
    "create-project-subnote": "create-subnote",
    "promote-to-zk": "promote-resource"
  };
  return aliases[command] ?? command;
}

async function executeInteractiveWorkflow(plugin: ParaZkPluginContext, command: string, sourcePath?: string): Promise<unknown | undefined> {
  const workflows = await import("../workflows");
  const ctx = workflowContext(plugin);
  const labels = localePack(plugin.settings.locale).labels;
  const activePath = sourcePath ?? plugin.app.workspace.getActiveFile()?.path;
  const sourceFile = activePath ? plugin.app.vault.getFileByPath(activePath) : null;

  switch (command) {
    case "create-project": {
      const title = await prompt(plugin, labels.createProjectCommandName, labels.promptProjectTitle);
      return title ? workflows.createProject(ctx, { title, open: true }) : undefined;
    }
    case "create-area": {
      const title = await prompt(plugin, labels.createAreaCommandName, labels.promptAreaTitle);
      return title ? workflows.createArea(ctx, { title, open: true }) : undefined;
    }
    case "create-resource": {
      const title = await prompt(plugin, labels.createResourceCommandName, labels.promptResourceTitle);
      return title ? workflows.createResource(ctx, {
        title,
        sourcePath,
        linkToSource: Boolean(sourcePath),
        open: true
      }) : undefined;
    }
    case "create-subnote": {
      const title = await prompt(plugin, labels.createSubnoteCommandName, labels.promptSubnoteTitle);
      return title ? workflows.createSubnote(ctx, { title, sourcePath: activePath, open: true }) : undefined;
    }
    case "create-subarea": {
      const title = await prompt(plugin, labels.createSubareaCommandName, labels.promptSubareaTitle);
      return title ? workflows.createSubarea(ctx, { title, sourcePath: activePath, inheritParentTag: true, open: true }) : undefined;
    }
    case "create-retro":
      return workflows.createRetro(ctx, { sourcePath: activePath, open: true });
    case "create-zk": {
      const kind = await chooseValue(plugin.app, labels.promptPromoteKind, [
        { label: "Fleeting", value: "Fleeting" },
        { label: "Literature", value: "Literature" },
        { label: "Permanent", value: "Permanent" }
      ]);
      if (!kind) return undefined;
      const title = await prompt(plugin, labels.createZkCommandName, labels.promptZkTitle, sourceFile?.basename ?? "");
      return title ? workflows.createZk(ctx, { title, kind, open: true }) : undefined;
    }
    case "capture-journal": {
      const content = await prompt(plugin, labels.captureJournalCommandName, labels.promptCaptureContent);
      return content ? workflows.captureJournal(ctx, { content, open: true }) : undefined;
    }
    case "promote-resource": {
      const kind = await chooseValue(plugin.app, labels.promptPromoteKind, [
        { label: "Fleeting", value: "Fleeting" },
        { label: "Literature", value: "Literature" },
        { label: "Permanent", value: "Permanent" }
      ]);
      if (!kind) return undefined;
      const title = await prompt(plugin, labels.promoteResourceCommandName, labels.promptZkTitle, sourceFile?.basename ?? "");
      return title ? workflows.promoteResource(ctx, { sourcePath: activePath, title, kind, open: true }) : undefined;
    }
    case "promote-fleeting": {
      const kind = await chooseValue(plugin.app, labels.promptPromoteKind, [
        { label: "Literature", value: "Literature" },
        { label: "Permanent", value: "Permanent" }
      ]);
      if (!kind) return undefined;
      const title = await prompt(plugin, labels.promoteFleetingCommandName, labels.promptZkTitle, sourceFile?.basename ?? "");
      return title ? workflows.promoteFleeting(ctx, { sourcePath: activePath, title, kind, open: true }) : undefined;
    }
    default:
      throw new Error(`${localePack(plugin.settings.locale).messages.unknownCommand}: ${command}`);
  }
}

function workflowContext(plugin: ParaZkPluginContext): WorkflowContext {
  return {
    app: plugin.app,
    settings: plugin.settings
  };
}

function prompt(plugin: ParaZkPluginContext, title: string, placeholder: string, initialValue = ""): Promise<string | null> {
  const labels = localePack(plugin.settings.locale).labels;
  return promptText(plugin.app, title, placeholder, initialValue, labels.confirm, labels.cancel);
}
