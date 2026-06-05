import { parseYaml, type App, type TFile } from "obsidian";
import { yamlFrontmatterRange } from "./sections";

export function yamlScalar(value: string | undefined): string {
  if (!value) return "";
  return JSON.stringify(value);
}

export function frontmatterLinks(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export type Frontmatter = Record<string, unknown>;

export type FrontmatterContext = {
  app: App;
};

export function fileFrontmatter(ctx: FrontmatterContext, file: TFile): Frontmatter {
  return ctx.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

// metadataCache.getFileCache() lags behind processFrontMatter writes (the cache updates
// asynchronously), so mutation/render paths should parse current file content first.
export async function readFileFrontmatterFresh(ctx: FrontmatterContext, file: TFile): Promise<Frontmatter> {
  const content = await ctx.app.vault.read(file);
  const fresh = parseFrontmatterFromContent(content);
  if (hasFrontmatterKeys(fresh)) return fresh;

  const cached = fileFrontmatter(ctx, file);
  if (contentHasYamlFrontmatterBlock(content) && hasFrontmatterKeys(cached)) return cached;
  return fresh;
}

export async function readFileTypeFresh(ctx: FrontmatterContext, file: TFile): Promise<string> {
  return readType(await readFileFrontmatterFresh(ctx, file));
}

export function parseFrontmatterFromContent(content: string): Frontmatter {
  const match = stripLeadingUtf8Bom(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]);
    return parsed && typeof parsed === "object" ? parsed as Frontmatter : {};
  } catch {
    return {};
  }
}

export function pickFrontmatter(frontmatter: Frontmatter, keys: string[]): Frontmatter {
  const result: Frontmatter = {};
  for (const key of keys) {
    if (frontmatter[key] !== undefined) result[key] = frontmatter[key];
  }
  return result;
}

export function readType(frontmatter: Frontmatter): string {
  const type = frontmatter.type;
  return typeof type === "string" && type.trim() ? type : "note";
}

function stripLeadingUtf8Bom(content: string): string {
  return content.startsWith("\uFEFF") ? content.slice(1) : content;
}

function hasFrontmatterKeys(frontmatter: Frontmatter): boolean {
  return Object.keys(frontmatter).length > 0;
}

function contentHasYamlFrontmatterBlock(content: string): boolean {
  const normalized = stripLeadingUtf8Bom(content);
  return yamlFrontmatterRange(normalized) !== undefined
    || /^[ \t\r\n]*---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(normalized);
}
