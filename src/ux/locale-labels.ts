import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { isRecord } from "../records";
import { refreshExplorerActionLabels } from "./actions/explorer";

type Labels = Record<string, string>;

export type RibbonAction = {
  id: string;
  icon: string;
  color: string;
  lightColor?: string;
  label: (labels: Labels) => string;
  command: string;
};

export const RIBBON_ACTIONS: RibbonAction[] = [
  {
    id: "create-project",
    icon: "rocket",
    color: "#f59e0b",
    label: (labels) => labels.homeNewProject,
    command: "create-project"
  },
  {
    id: "create-area",
    icon: "layers",
    color: "#a855f7",
    label: (labels) => labels.homeNewArea,
    command: "create-area"
  },
  {
    id: "create-resource",
    icon: "file-plus",
    color: "#3b82f6",
    label: (labels) => labels.homeNewResource,
    command: "create-resource"
  },
  {
    id: "create-zk",
    icon: "library-big",
    color: "#ffff00",
    lightColor: "#a16207",
    label: (labels) => labels.homeNewZk,
    command: "create-zk"
  },
  {
    id: "open-journal",
    icon: "calendar",
    color: "#d4497a",
    label: (labels) => labels.openJournalCommandName,
    command: "open-journal"
  },
  {
    id: "capture-journal",
    icon: "fast-forward",
    color: "#ffffff",
    lightColor: "#0f766e",
    label: (labels) => labels.captureJournalCommandName,
    command: "capture-journal"
  }
];

export function statusCommandEntries(labels: Labels): Array<readonly [string, string]> {
  return [
    ["check-status", labels.statusCommandName],
    ["setup-vault", labels.setupCommandName]
  ];
}

export function workflowCommandEntries(labels: Labels): Array<readonly [string, string]> {
  return [
    ["create-project", labels.createProjectCommandName],
    ["create-area", labels.createAreaCommandName],
    ["add-reference", labels.addReferenceCommandName],
    ["create-resource", labels.createResourceCommandName],
    ["create-subnote", labels.createSubnoteCommandName],
    ["create-subarea", labels.createSubareaCommandName],
    ["create-retro", labels.createRetroCommandName],
    ["create-zk", labels.createZkCommandName],
    ["open-journal", labels.openJournalCommandName],
    ["capture-journal", labels.captureJournalCommandName],
    ["create-from-resource", labels.createZkButton],
    ["distill-spark", labels.distillButton],
    ["create-from-digest", labels.createPermanentButton]
  ];
}

export function refreshRegisteredLocaleLabels(plugin: ParaZkPluginContext, previousLocale: string): void {
  if (plugin.settings.locale === previousLocale) return;

  const labels = localePack(plugin.settings.locale).labels;
  for (const [id, name] of [
    ...statusCommandEntries(labels),
    ...workflowCommandEntries(labels)
  ]) {
    setCommandName(plugin, id, name);
  }

  for (const action of RIBBON_ACTIONS) {
    for (const button of activeDocument.querySelectorAll<HTMLElement>(`.para-zk-ribbon-action-${action.id}`)) {
      button.setAttribute("aria-label", action.label(labels));
    }
  }
  refreshExplorerActionLabels(plugin);
}

function setCommandName(plugin: ParaZkPluginContext, id: string, name: string): void {
  const manager = (plugin.app as unknown as { commands?: unknown }).commands;
  if (!isRecord(manager) || !isRecord(manager.commands)) return;

  const command = manager.commands[`${plugin.manifest.id}:${id}`];
  if (isRecord(command)) command.name = `${plugin.manifest.name}: ${name}`;
}
