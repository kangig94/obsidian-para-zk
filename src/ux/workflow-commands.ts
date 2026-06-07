import { Notice } from "obsidian";
import { localePack, normalizeLocale } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { isRecord } from "../records";
import { workflowContext } from "../vault/host";
import {
  statusCommandEntries,
  workflowCommandEntries
} from "./locale-labels";
import { chooseValue, confirmAction, promptDistill, promptSetupOptions, promptText } from "./prompts";

export function registerStatusAndInitCommands(plugin: ParaZkPluginContext): void {
  const labels = localePack(plugin.settings.locale).labels;

  const commandNames = new Map(statusCommandEntries(labels));

  plugin.addCommand({
    id: "check-status",
    name: commandNames.get("check-status") ?? labels.statusCommandName,
    callback: () => {
      new Notice(localePack(plugin.settings.locale).messages.statusReady);
    }
  });

  plugin.addCommand({
    id: "setup-vault",
    name: commandNames.get("setup-vault") ?? labels.setupCommandName,
    callback: async (...rawArgs: unknown[]) => {
      const args = readCommandArgs(rawArgs);
      const options = hasCommandArgs(args)
        ? {
          locale: normalizeLocale(readCommandString(args, "locale"), plugin.settings.locale),
          force: readCommandBoolean(args, "force") ?? false,
          dryRun: readCommandBoolean(args, "dryRun") ?? readCommandBoolean(args, "dry-run") ?? false,
          installDeps: readCommandBoolean(args, "installDeps") ?? readCommandBoolean(args, "install-deps") ?? false
        }
        : await promptSetupOptions(plugin.app, {
          locale: plugin.settings.locale,
          force: false,
          installDeps: false
        });
      if (!options) {
        new Notice(localePack(plugin.settings.locale).messages.commandCancelled);
        return;
      }
      const result = await plugin.setupVault(options);
      const messages = localePack(options.locale).messages;
      new Notice(`${messages.setupReady}: ${result.created.length} created, ${result.updated.length} updated`);
    }
  });
}

export function registerWorkflowCommands(plugin: ParaZkPluginContext): void {
  const labels = localePack(plugin.settings.locale).labels;
  const commands = workflowCommandEntries(labels);

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
    case "add-reference": {
      const target = await prompt(plugin, labels.addReferenceCommandName, labels.promptReferenceTarget);
      return target ? workflows.addReference(ctx, { sourcePath: activePath, target, open: false }) : undefined;
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
      if (!activePath) {
        new Notice(`PARA-ZK: ${localePack(plugin.settings.locale).messages.createSubareaNeedsActiveArea}`);
        return undefined;
      }
      const title = await prompt(plugin, labels.createSubareaCommandName, labels.promptSubareaTitle);
      return title ? workflows.createArea(ctx, { title, sourcePath: activePath, inheritParentTag: true, open: true }) : undefined;
    }
    case "create-retro":
      return workflows.createRetro(ctx, { sourcePath: activePath, open: true });
    case "create-zk": {
      const kind = await chooseValue(plugin.app, labels.promptCreateKind, [
        { label: "Spark", value: "spark" },
        { label: "Digest", value: "digest" },
        { label: "Permanent", value: "permanent" }
      ]);
      if (!kind) return undefined;
      const title = await prompt(plugin, labels.createZkCommandName, labels.promptZkTitle, sourceFile?.basename ?? "");
      return title ? workflows.createZk(ctx, { title, kind, open: true }) : undefined;
    }
    case "open-journal":
      return workflows.openJournal(ctx, { open: true });
    case "capture-journal": {
      const content = await prompt(plugin, labels.captureJournalCommandName, labels.promptCaptureContent);
      return content ? workflows.captureJournal(ctx, { content, open: true }) : undefined;
    }
    case "create-from-resource": {
      const kind = await chooseValue(plugin.app, labels.promptCreateKind, [
        { label: "Digest", value: "digest" },
        { label: "Permanent", value: "permanent" }
      ]);
      if (!kind) return undefined;
      const title = await prompt(plugin, labels.createZkButton, labels.promptZkTitle, sourceFile?.basename ?? "");
      return title ? workflows.createFromResource(ctx, { sourcePath: activePath, title, kind, open: true }) : undefined;
    }
    case "distill-spark": {
      const result = await promptDistill(
        plugin.app,
        labels.distillButton,
        labels.promptZkTitle,
        sourceFile?.basename ?? "",
        labels.distillDiscardToggle,
        labels.confirm,
        labels.cancel
      );
      return result ? workflows.distillSpark(ctx, { sourcePath: activePath, title: result.title, discard: result.discard, open: true }) : undefined;
    }
    case "discard-spark": {
      if (!activePath) return undefined;
      const confirmed = await confirmAction(
        plugin.app,
        labels.discardSparkConfirmTitle,
        labels.discardSparkConfirmMessage,
        labels.discardButton,
        labels.cancel
      );
      return confirmed ? workflows.deleteZk(ctx, { path: activePath }) : undefined;
    }
    case "create-from-digest": {
      const title = await prompt(plugin, labels.createPermanentButton, labels.promptZkTitle, sourceFile?.basename ?? "");
      return title ? workflows.createFromDigest(ctx, { sourcePath: activePath, title, open: true }) : undefined;
    }
    default:
      throw new Error(`${localePack(plugin.settings.locale).messages.unknownCommand}: ${command}`);
  }
}

function readCommandArgs(rawArgs: unknown[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const rawArg of rawArgs) {
    if (isRecord(rawArg)) {
      Object.assign(args, rawArg);
      continue;
    }
    if (typeof rawArg !== "string") continue;
    const index = rawArg.indexOf("=");
    if (index === -1) {
      args[rawArg] = true;
    } else {
      args[rawArg.slice(0, index)] = rawArg.slice(index + 1);
    }
  }
  return args;
}

function hasCommandArgs(args: Record<string, unknown>): boolean {
  return Object.keys(args).length > 0;
}

function readCommandString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function readCommandBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function prompt(plugin: ParaZkPluginContext, title: string, placeholder: string, initialValue = ""): Promise<string | null> {
  const labels = localePack(plugin.settings.locale).labels;
  return promptText(plugin.app, title, placeholder, initialValue, labels.confirm, labels.cancel);
}
