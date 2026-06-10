import { ButtonComponent, type MarkdownPostProcessorContext } from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { createWorkflowButton } from "./workflow-buttons";

type DashboardAction = {
  kind: "command" | "link";
  label: string;
  target: string;
};

type DashboardActionGroup = {
  title: string;
  tone: "primary" | "secondary";
  actions: DashboardAction[];
};

export function registerDashboardActionRenderers(plugin: ParaZkPluginContext): void {
  plugin.registerMarkdownCodeBlockProcessor("para-zk-dashboard-actions", (_source, el, ctx) => {
    renderDashboardActions(plugin, el, ctx);
  });
}

function renderDashboardActions(
  plugin: ParaZkPluginContext,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  el.empty();
  el.addClass("para-zk-dashboard-actions");

  for (const group of dashboardActionGroups(plugin)) {
    renderActionGroup(plugin, group, el, ctx.sourcePath);
  }
}

function renderActionGroup(
  plugin: ParaZkPluginContext,
  group: DashboardActionGroup,
  container: HTMLElement,
  sourcePath: string
): void {
  const section = container.createDiv({
    cls: `para-zk-action-panel para-zk-action-panel-${group.tone}`
  });
  section.createDiv({ cls: "para-zk-action-panel-title", text: group.title });
  const controls = section.createDiv({ cls: "para-zk-action-panel-controls" });

  for (const action of group.actions) {
    if (action.kind === "command") {
      const button = createWorkflowButton(plugin, action.label, action.target);
      button.addClass("para-zk-dashboard-action", `para-zk-dashboard-action-${group.tone}`);
      controls.appendChild(button);
    } else {
      const button = new ButtonComponent(controls);
      button.buttonEl.addClass("para-zk-dashboard-link", "para-zk-dashboard-action", `para-zk-dashboard-action-${group.tone}`);
      button
        .setButtonText(action.label)
        .onClick(() => {
          void plugin.app.workspace.openLinkText(action.target, sourcePath);
        });
    }
  }
}

function dashboardActionGroups(plugin: ParaZkPluginContext): DashboardActionGroup[] {
  const t = localePack(plugin.settings.locale);
  return [
    {
      title: `✨ ${t.labels.createNew}`,
      tone: "primary",
      actions: [
        commandAction(t.labels.homeNewProject, "create-project"),
        commandAction(t.labels.homeNewArea, "create-area"),
        commandAction(t.labels.homeNewResource, "create-resource"),
        commandAction(t.labels.homeNewZk, "create-zk"),
        commandAction(t.labels.openJournalCommandName, "open-journal"),
        commandAction(t.labels.captureJournalCommandName, "capture-journal")
      ]
    },
    {
      title: `📄 ${t.labels.openDashboards}`,
      tone: "secondary",
      actions: [
        linkAction(t.labels.homeProjects, "Projects.md"),
        linkAction(t.labels.homeAreas, "Areas.md"),
        linkAction(t.labels.homeResources, "Resources.md"),
        linkAction("ZK", "ZK.md"),
        linkAction(t.labels.dashboardReview, "Review.md"),
        linkAction(t.labels.homeTasks, "Tasks.md")
      ]
    }
  ];
}

function commandAction(label: string, command: string): DashboardAction {
  return {
    kind: "command",
    label,
    target: command
  };
}

function linkAction(label: string, path: string): DashboardAction {
  return {
    kind: "link",
    label,
    target: path
  };
}
