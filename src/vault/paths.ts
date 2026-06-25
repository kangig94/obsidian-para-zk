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

export function obsidianConfigPath(vault: { configDir: string }, ...parts: string[]): string {
  return joinVaultPath(vault.configDir, ...parts);
}

export function parentFolder(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
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

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

export function sanitizeVaultRelativePath(value: string | undefined, label = "vault-relative path"): string[] {
  const text = (value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);

  return text.split("/").map((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) throw new Error(`${label} must not contain empty path segments`);
    if (trimmed === "." || trimmed === "..") {
      throw new Error(`${label} must not contain . or .. path segments`);
    }
    const sanitized = sanitizeFileName(trimmed);
    if (!sanitized) throw new Error(`${label} segment is empty after sanitizing`);
    if (sanitized === "." || sanitized === "..") {
      throw new Error(`${label} must not contain . or .. path segments`);
    }
    return sanitized;
  });
}

export function wikiLink(path: string, alias?: string): string {
  const normalized = normalizeVaultPath(path);
  return alias ? `[[${normalized}|${alias}]]` : `[[${normalized}]]`;
}
