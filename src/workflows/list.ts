import { fileFrontmatter, readType } from "../vault/frontmatter";
import { normalizeVaultPath } from "../vault/paths";
import type { ListOptions, WorkflowContext } from "./context";
import { isArchivedFile } from "./locations";

// Note types this command enumerates. `zk` is an addressing family spanning the
// stored zk_<kind> surface types; everything else maps to its stored type.
const LISTABLE_TYPES = new Set(["project", "area", "resource", "journal", "retro", "subnote"]);

function typeMatcher(type: string | undefined): (stored: string) => boolean {
  if (!type) return (stored) => LISTABLE_TYPES.has(stored) || stored.startsWith("zk_");
  if (type === "zk") return (stored) => stored.startsWith("zk_");
  return (stored) => stored === type;
}

type ListItem = { title: string; type: string; path: string; archived?: true };

// Managed template files carry a `type` frontmatter (e.g. type: resource) but are not
// real notes, so they must not surface in the listing. Exclude the templates folders.
function isUnderAnyFolder(path: string, folders: string[]): boolean {
  const normalized = normalizeVaultPath(path);
  return folders.some((folder) => normalized === folder || normalized.startsWith(`${folder}/`));
}

// Structured enumeration by name/type for LLMs that need to find a note before
// addressing it. Content search is intentionally left to the host CLI's grep/search.
export async function listNotes(ctx: WorkflowContext, options: ListOptions = {}): Promise<Record<string, unknown>> {
  const matches = typeMatcher(options.type?.trim() || undefined);
  const query = options.query?.trim().toLowerCase();
  const wantArchived = options.archived === true;

  const templateFolders = [ctx.settings.paths.templatesFolder, ctx.settings.paths.managedTemplatesFolder]
    .map(normalizeVaultPath)
    .filter(Boolean);

  const all: ListItem[] = [];
  for (const file of ctx.host.getMarkdownFiles()) {
    if (isUnderAnyFolder(file.path, templateFolders)) continue;
    const type = readType(fileFrontmatter(ctx, file));
    if (!matches(type)) continue;
    if (isArchivedFile(ctx, file) !== wantArchived) continue;
    if (query && !file.basename.toLowerCase().includes(query)) continue;
    all.push({ title: file.basename, type, path: file.path, ...(wantArchived ? { archived: true } : {}) });
  }
  all.sort((left, right) => left.path.localeCompare(right.path));

  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit === "all" ? all.length : Math.max(0, options.limit ?? 50);
  const items = all.slice(offset, offset + limit);

  return {
    count: all.length,
    offset,
    limit: options.limit === "all" ? "all" : limit,
    returned: items.length,
    has_more: offset + items.length < all.length,
    items
  };
}
