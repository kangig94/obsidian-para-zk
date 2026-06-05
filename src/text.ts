export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_\/]+/g, "_")
    .replace(/-/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "untitled";
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

// Coerce an unknown frontmatter value into a string list, then append the
// (already-transformed) additions that are non-empty and not already present.
export function appendUniqueStrings(current: unknown, additions: string[]): string[] {
  const list = Array.isArray(current)
    ? current.filter((item): item is string => typeof item === "string")
    : [];
  for (const item of additions) {
    if (item && !list.includes(item)) list.push(item);
  }
  return list;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
