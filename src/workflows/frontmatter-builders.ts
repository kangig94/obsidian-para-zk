import type { TFile } from "obsidian";
import { localePack } from "../i18n";
import { singleItemList, slugify } from "../text";
import type { ZkKind } from "../types";
import type { Frontmatter } from "../vault/frontmatter";
import {
  type MaturityCode,
  type SubnoteTypeCode
} from "../vocabulary";
import { zkKindCode } from "../zk/kinds";
import type { WorkflowContext } from "./context";
import { linkToFile } from "./locations";
import { ROOT_ID_FRONTMATTER_KEY, newRootId, rootIdFromFrontmatter } from "./tasks";

export type ResourceFrontmatterOptions = {
  alias?: string;
  domain?: string;
  firstAuthor?: string;
  kind?: string;
  license?: string;
  url?: string;
};

export type ZkFrontmatterOptions = {
  alias?: string;
  maturityCode?: MaturityCode;
};

export type SubnoteFrontmatterOptions = {
  parent: TFile;
  subnoteType?: SubnoteTypeCode;
};

export async function applyResourceFrontmatter(
  ctx: WorkflowContext,
  file: TFile,
  options: ResourceFrontmatterOptions = {}
): Promise<void> {
  await ctx.host.processFrontMatter(file, (fm) => {
    applyResourceFrontmatterFields(ctx, fm, options);
  });
}

function applyResourceFrontmatterFields(
  ctx: Pick<WorkflowContext, "settings">,
  frontmatter: Frontmatter,
  options: ResourceFrontmatterOptions = {}
): void {
  const tags = localePack(ctx.settings.locale).tags;
  frontmatter.type = "resource";
  applyAlias(frontmatter, options.alias);
  const resourceDomain = options.domain?.trim();
  frontmatter.tags = [resourceDomain ? `${tags.resource}/${slugify(resourceDomain)}` : tags.resource];
  applyCreatedUpdatedDefaults(frontmatter);
  if (options.url?.trim()) frontmatter.url = options.url.trim();
  if (options.firstAuthor?.trim()) frontmatter.first_author = options.firstAuthor.trim();
  if (options.license?.trim()) frontmatter.license = options.license.trim();
  if (options.kind) frontmatter.kind = options.kind;
}

export async function applyZkFrontmatter(
  ctx: WorkflowContext,
  file: TFile,
  kind: ZkKind,
  options: ZkFrontmatterOptions = {}
): Promise<void> {
  await ctx.host.processFrontMatter(file, (fm) => {
    applyZkFrontmatterFields(fm, kind, options);
  });
}

function applyZkFrontmatterFields(
  frontmatter: Frontmatter,
  kind: ZkKind,
  options: ZkFrontmatterOptions = {}
): void {
  const maturity = options.maturityCode ?? "draft";
  frontmatter.type = zkKindCode(kind);
  applyAlias(frontmatter, options.alias);
  applyCreatedUpdatedDefaults(frontmatter);
  if (kind === "Spark" && frontmatter.processed === undefined) frontmatter.processed = false;
  if (kind === "Permanent") frontmatter.maturity = frontmatter.maturity ?? maturity;
}

export async function applySubnoteFrontmatter(
  ctx: WorkflowContext,
  file: TFile,
  options: SubnoteFrontmatterOptions
): Promise<void> {
  await ctx.host.processFrontMatter(file, (fm) => {
    applySubnoteFrontmatterFields(fm, options);
  });
}

function applySubnoteFrontmatterFields(
  frontmatter: Frontmatter,
  options: SubnoteFrontmatterOptions
): void {
  const subnoteType = options.subnoteType ?? "free";
  frontmatter.type = frontmatter.type || "subnote";
  frontmatter.parent = linkToFile(options.parent);
  frontmatter.subnote_type = frontmatter.subnote_type ?? subnoteType;
  applyCreatedUpdatedDefaults(frontmatter);
}

export function applyAlias(frontmatter: Frontmatter, alias: string | undefined): void {
  if (alias === undefined) return;
  const aliases = singleItemList(alias);
  if (aliases.length > 0) frontmatter.aliases = aliases;
}

export function applyCreatedUpdatedDefaults(frontmatter: {
  updated?: unknown;
  [ROOT_ID_FRONTMATTER_KEY]?: unknown;
}): void {
  if (frontmatter.updated === undefined) frontmatter.updated = "";
  if (!rootIdFromFrontmatter(frontmatter)) frontmatter[ROOT_ID_FRONTMATTER_KEY] = newRootId();
}
