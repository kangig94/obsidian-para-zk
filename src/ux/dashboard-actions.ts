import { ButtonComponent, type MarkdownPostProcessorContext } from "obsidian";
import { localePack } from "../i18n";
import type { ParaZkPluginContext } from "../plugin-interface";
import { createWorkflowButton } from "./inline-actions";

type DashboardAction = {
  kind: "command" | "link";
  id: string;
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
        commandAction("new-project", t.labels.homeNewProject, "create-project"),
        commandAction("new-area", t.labels.homeNewArea, "create-area"),
        commandAction("new-resource", t.labels.homeNewResource, "create-resource"),
        commandAction("new-zk", t.labels.homeNewZk, "create-zk"),
        commandAction("journal-capture", t.labels.captureJournalCommandName, "capture-journal")
      ]
    },
    {
      title: `📄 ${t.labels.openDashboards}`,
      tone: "secondary",
      actions: [
        linkAction("projects", t.labels.homeProjects, "Projects.md"),
        linkAction("areas", t.labels.homeAreas, "Areas.md"),
        linkAction("resources", t.labels.homeResources, "Resources.md"),
        linkAction("zk", "ZK", "ZK.md"),
        linkAction("review", t.labels.dashboardReview, "Review.md"),
        linkAction("tasks", t.labels.homeTasks, "Tasks.md")
      ]
    }
  ];
}

function commandAction(id: string, label: string, command: string): DashboardAction {
  return {
    kind: "command",
    id,
    label,
    target: command
  };
}

function linkAction(id: string, label: string, path: string): DashboardAction {
  return {
    kind: "link",
    id,
    label,
    target: path
  };
}
