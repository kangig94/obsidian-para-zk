import { fileFrontmatter, readType } from "../vault/frontmatter";
import { isZkType } from "../zk/kinds";
import type { ListOptions, WorkflowContext } from "./context";
import { isArchivedFile, isUnderAnyFolder, templateFolderPaths } from "./locations";

// Note types this command enumerates. `zk` is an addressing family spanning the
// stored ZK kind surface types (spark/digest/permanent); everything else maps to its stored type.
const LISTABLE_TYPES = new Set(["project", "area", "resource", "llm-wiki", "journal", "retro", "subnote"]);

function typeMatcher(type: string | undefined): (stored: string) => boolean {
  if (!type) return (stored) => LISTABLE_TYPES.has(stored) || isZkType(stored);
  if (type === "zk") return (stored) => isZkType(stored);
  return (stored) => stored === type;
}

type ListItem = { title: string; type: string; path: string; archived?: true };

// Structured enumeration by name/type for LLMs that need to find a note before
// addressing it. Content search is intentionally left to the host CLI's grep/search.
export async function listNotes(ctx: WorkflowContext, options: ListOptions = {}): Promise<Record<string, unknown>> {
  const matches = typeMatcher(options.type?.trim() || undefined);
  const query = options.query?.trim().toLowerCase();
  const wantArchived = options.archived === true;

  const templateFolders = templateFolderPaths(ctx);

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
