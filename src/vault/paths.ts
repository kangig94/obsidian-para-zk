export function normalizeVaultPath(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

export function joinVaultPath(...parts: Array<string | undefined>): string {
  return normalizeVaultPath(parts.filter(Boolean).join("/"));
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

export function wikiLink(path: string, alias?: string): string {
  const normalized = normalizeVaultPath(path);
  return alias ? `[[${normalized}|${alias}]]` : `[[${normalized}]]`;
}
