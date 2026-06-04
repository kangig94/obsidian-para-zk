import { normalizeVaultPath } from "../vault/paths";

export function pathBasenameWithoutExtension(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last.replace(/\.md$/i, "");
}

export function parseWikiLink(value: string): { target: string; alias?: string } | undefined {
  const match = value.trim().match(/^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/);
  const target = match?.[1]?.trim();
  if (!target) return undefined;
  return {
    target,
    ...(match?.[2] !== undefined ? { alias: match[2].trim() } : {})
  };
}

export function parseMarkdownLink(value: string): { target: string } | undefined {
  const match = value.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  const text = match?.[1]?.trim();
  const target = match?.[2]?.trim();
  if (!text || !target) return undefined;
  return { target };
}

export function splitObsidianSubpath(value: string): { base: string; subpath: string } {
  const normalizedSeparators = value.trim().replace(/\\/g, "/");
  const hash = normalizedSeparators.indexOf("#");
  if (hash === -1) {
    return {
      base: normalizeVaultPath(normalizedSeparators),
      subpath: ""
    };
  }
  return {
    base: normalizeVaultPath(normalizedSeparators.slice(0, hash)),
    subpath: normalizedSeparators.slice(hash).trim()
  };
}

export function normalizedReferenceTargetWithSubpath(value: string): string {
  const split = splitObsidianSubpath(value);
  return referenceTargetWithSubpath(split.base, split.subpath);
}

export function referenceTargetWithSubpath(base: string, subpath: string): string {
  return `${base}${subpath}`;
}

export function canonicalWikiLink(target: string): string {
  return `[[${target}]]`;
}

export function isExternalReference(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(mailto|tel):/i.test(trimmed);
}
