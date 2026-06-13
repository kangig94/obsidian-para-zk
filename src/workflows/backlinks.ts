import { TFile } from "obsidian";
import { hasOwn, isRecord } from "../records";
import { fileFrontmatter, readType } from "../vault/frontmatter";
import { wikiLink } from "../vault/paths";
import type { BacklinkRead, WorkflowContext } from "./context";

type BacklinkSourceVisitor = (sourceFile: TFile, index: number) => void;

type BacklinkTransformContext = {
  ctx: WorkflowContext;
  file: TFile;
};

export const backlinkReadInstrumentation = {
  enumerateSources: enumerateBacklinkSources
};

export function countBacklinks(ctx: WorkflowContext, file: TFile): number {
  return backlinkReadInstrumentation.enumerateSources(ctx, file);
}

export function readBacklinks(_content: string, context: BacklinkTransformContext): Record<string, BacklinkRead> {
  const items: Record<string, BacklinkRead> = {};
  backlinkReadInstrumentation.enumerateSources(context.ctx, context.file, (sourceFile, index) => {
    items[String(index)] = {
      link: wikiLink(sourceFile.path),
      path: sourceFile.path,
      title: sourceFile.basename,
      type: readType(fileFrontmatter(context.ctx, sourceFile))
    };
  });
  return items;
}

function enumerateBacklinkSources(
  ctx: WorkflowContext,
  targetFile: TFile,
  visitor?: BacklinkSourceVisitor
): number {
  const sourcePaths = Object.entries(ctx.host.resolvedLinks())
    .filter(([sourcePath, targets]) => sourcePath !== targetFile.path
      && isRecord(targets)
      && hasOwn(targets, targetFile.path))
    .map(([sourcePath]) => sourcePath)
    .sort((left, right) => left.localeCompare(right));

  let count = 0;
  for (const sourcePath of sourcePaths) {
    const sourceFile = ctx.host.getFile(sourcePath);
    if (!sourceFile || sourceFile.path === targetFile.path) continue;
    visitor?.(sourceFile, count);
    count += 1;
  }
  return count;
}
