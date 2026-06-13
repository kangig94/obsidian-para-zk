// Tag-slug generator: kebab-case (the common Obsidian tag convention). Used only to
// build the `<type>/<slug>` identity tags; underscores and spaces collapse to hyphens,
// `/` is preserved for nested-area tag namespaces.
export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

// Wrap a single text value as a frontmatter list: a one-item list when non-empty,
// an empty list when blank. List-typed scalar fields like Obsidian `aliases` resolve
// for links/quick-switcher only in list form, so the GUI stores even a single value this way.
export function singleItemList(value: string): string[] {
  const trimmed = value.trim();
  return trimmed ? [trimmed] : [];
}

export function normalizeAliasList(value: unknown): string[] {
  if (Array.isArray(value)) {
    const aliases = value.map((item) => {
      if (typeof item !== "string") throw new Error("aliases value items must be strings");
      return item.trim();
    }).filter(Boolean);
    if (aliases.length > 1) throw new Error("aliases supports one value");
    return aliases;
  }
  if (typeof value !== "string") throw new Error("aliases value must be a string or string array");
  return singleItemList(value);
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
