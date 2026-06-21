import type { TFile } from "obsidian";
import {
  applyTemplateVariables,
  readTemplate,
  type TemplateName,
  type TemplateVariables
} from "../templates";
import { slugify } from "../text";
import type { ZkKind } from "../types";
import {
  applyResourceFrontmatter,
  applySubnoteFrontmatter,
  applyZkFrontmatter
} from "./frontmatter-builders";
import type { WorkflowContext } from "./context";
import { classifyManagedNoteLocation, type ManagedNoteLocation } from "./locations";

export async function applyManagedTemplate(ctx: WorkflowContext, file: TFile): Promise<void> {
  const location = classifyManagedNoteLocation(ctx, file.path);
  if (!location) return;

  const current = await ctx.host.read(file);
  if (current.trim()) return;

  const templateName = location.type as TemplateName;
  const template = await readTemplate(ctx, templateName);
  const content = applyTemplateVariables(template, templateVariablesForLocation(file, location));
  await ctx.host.modify(file, content);
  await applyManagedFrontmatter(ctx, file, location);
}

function templateVariablesForLocation(file: TFile, location: ManagedNoteLocation): TemplateVariables {
  if (location.type === "subnote") {
    return { subnote_type: "free", cursor: "" };
  }
  if (location.type === "spark" || location.type === "digest" || location.type === "permanent") {
    return { slug: slugify(file.basename), maturity: "draft", cursor: "" };
  }
  return { slug: slugify(file.basename), cursor: "" };
}

async function applyManagedFrontmatter(
  ctx: WorkflowContext,
  file: TFile,
  location: ManagedNoteLocation
): Promise<void> {
  if (location.type === "resource") {
    await applyResourceFrontmatter(ctx, file);
    return;
  }
  if (location.type === "subnote") {
    if (!location.parent) return;
    await applySubnoteFrontmatter(ctx, file, { parent: location.parent, subnoteType: "free" });
    return;
  }
  await applyZkFrontmatter(ctx, file, zkKindForLocation(location));
}

function zkKindForLocation(location: ManagedNoteLocation): ZkKind {
  if (location.type === "digest") return "Digest";
  if (location.type === "permanent") return "Permanent";
  return "Spark";
}
