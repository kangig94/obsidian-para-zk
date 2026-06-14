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

type ListEntry = { type: string; addr: string };

// Structured enumeration by name/type for LLMs that need to find a note before
// addressing it. Content search is intentionally left to the host CLI's grep/search.
export async function listNotes(ctx: WorkflowContext, options: ListOptions = {}): Promise<Record<string, unknown>> {
  const type = options.type?.trim() || undefined;
  const matches = typeMatcher(type);
  const query = options.query?.trim().toLowerCase();
  const wantArchived = options.archived === true;

  const templateFolders = templateFolderPaths(ctx);

  const all: ListEntry[] = [];
  for (const file of ctx.host.getMarkdownFiles()) {
    if (isUnderAnyFolder(file.path, templateFolders)) continue;
    const stored = readType(fileFrontmatter(ctx, file));
    if (!matches(stored)) continue;
    if (isArchivedFile(ctx, file) !== wantArchived) continue;
    if (query && !file.basename.toLowerCase().includes(query)) continue;
    all.push({ type: stored, addr: addressPath(file.path) });
  }
  all.sort((left, right) => left.addr.localeCompare(right.addr));

  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit === "all" ? all.length : Math.max(0, options.limit ?? 50);
  const page = all.slice(offset, offset + limit);

  const envelope = {
    count: all.length,
    offset,
    limit: options.limit === "all" ? "all" : limit,
    returned: page.length,
    has_more: offset + page.length < all.length,
    ...(wantArchived ? { archived: true as const } : {})
  };

  // A single-type listing whose notes all live under one configured root collapses to
  // root-relative names — each `name` is exactly the title= a caller passes back to
  // address it (e.g. "Paper/ASAP"), so the redundant full path and basename title are
  // dropped. An empty such listing still takes this shape (vacuous `every`), so `root`
  // is always reported for those types. Mixed listings, multi-root families (zk),
  // date/basename-addressed types (journal/retro), folder-spanning subnotes, and
  // archived notes (which live under archivesFolder, not the type root) keep an
  // explicit {name, type} per item.
  const root = type ? rootForListType(ctx, type) : undefined;
  if (root && all.every((entry) => isUnderRoot(entry.addr, root))) {
    return { ...envelope, type, root, items: page.map((entry) => relativeName(entry.addr, root)) };
  }
  return { ...envelope, items: page.map((entry) => ({ name: entry.addr, type: entry.type })) };
}

// The address path: a note's path without `.md`, and for a folder-style note
// `<dir>/<X>/<X>.md` the folder `<dir>/<X>` (addressed by its folder, not the
// duplicated leaf), so it round-trips to the title= a caller would use.
function addressPath(path: string): string {
  const segments = path.replace(/\.md$/i, "").split("/");
  const last = segments.length - 1;
  if (last >= 1 && segments[last] === segments[last - 1]) return segments.slice(0, last).join("/");
  return segments.join("/");
}

// Strictly under the root: a note whose address IS the root itself is degenerate
// (it would relativize to an empty name), so it is excluded and the listing falls
// back to the {name, type} shape rather than emitting a blank, unaddressable item.
function isUnderRoot(addr: string, root: string): boolean {
  return addr.startsWith(`${root}/`);
}

function relativeName(addr: string, root: string): string {
  return addr.slice(root.length + 1);
}

// The single configured root for a list type — returned ONLY where a note's
// root-relative name is also the `title=` used to address it: project, area,
// resource, llm-wiki. journal (addressed by date), retro (basename title), the zk
// family (spark/digest/permanent), and folder-spanning subnotes have no such
// round-trip and return undefined, so they list as {name, type}.
function rootForListType(ctx: WorkflowContext, type: string): string | undefined {
  const paths = ctx.settings.paths;
  switch (type) {
    case "project": return paths.projectsFolder;
    case "area": return paths.areasFolder;
    case "resource": return paths.resourcesFolder;
    case "llm-wiki": return paths.wikiFolder;
    default: return undefined;
  }
}
