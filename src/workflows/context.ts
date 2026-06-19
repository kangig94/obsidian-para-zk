import type {
  NoteResult,
  ParaZkSettings
} from "../types";
import type { WorkflowHost } from "../vault/host";
import type { ZkKindCode } from "../zk/kinds";

export type WorkflowContext = {
  host: WorkflowHost;
  settings: ParaZkSettings;
};

export type TemplateVariables = Record<string, string | undefined>;

export type CreateProjectOptions = {
  title: string;
  alias?: string;
  areas?: string[];
  areaTitles?: string[];
  status?: string;
  priority?: string;
  open?: boolean;
};

export type ProjectAreaResult = {
  title: string;
  path: string;
  link: string;
  created: boolean;
};

export type CreateAreaOptions = {
  title: string;
  sourcePath?: string;
  parentTitle?: string;
  child?: string[];
  inheritParentTag?: boolean;
  open?: boolean;
};

export type CreateResourceOptions = {
  title: string;
  alias?: string;
  sourcePath?: string;
  sourceType?: string;
  sourceTitle?: string;
  linkToSource?: boolean;
  url?: string;
  firstAuthor?: string;
  license?: string;
  kind?: string;
  domain?: string;
  body?: string;
  open?: boolean;
};

export type CreateLlmWikiOptions = {
  title: string;
  alias?: string;
  body?: string;
  by?: string;
  open?: boolean;
};

export type AddReferenceOptions = {
  sourcePath: string;
  target: string;
  description?: string;
  open?: boolean;
};

export type CreateSubnoteOptions = {
  title: string;
  sourcePath?: string;
  parentType?: string;
  parentTitle?: string;
  child?: string[];
  subnoteType?: string;
  body?: string;
  open?: boolean;
};


export type CreateRetroOptions = {
  sourcePath?: string;
  sourceType?: string;
  sourceTitle?: string;
  title?: string;
  date?: string;
  open?: boolean;
};

export type CreateZkOptions = {
  title: string;
  alias?: string;
  kind?: string;
  maturity?: string;
  body?: string;
  open?: boolean;
};

export type CaptureJournalOptions = {
  content: string;
  date?: string;
  time?: string;
  energy?: string;
  open?: boolean;
};

export type OpenJournalOptions = {
  date?: string;
  energy?: string;
  open?: boolean;
};

export type CreateFromResourceOptions = {
  sourcePath?: string;
  sourceTitle?: string;
  title?: string;
  kind?: string;
  maturity?: string;
  body?: string;
  open?: boolean;
};

export type CreateFromDigestOptions = {
  sourcePath?: string;
  sourceTitle?: string;
  title?: string;
  maturity?: string;
  body?: string;
  open?: boolean;
};

export type DistillSparkOptions = {
  sourcePath?: string;
  sourceTitle?: string;
  title?: string;
  maturity?: string;
  discard?: boolean;
  body?: string;
  open?: boolean;
};

export type CollectionKind = "task" | "reference" | "backlink";

export type CollectionReadOptions = {
  offset?: number;
  limit?: number | "all";
  query?: string;
  type?: string;
  checkbox?: string;
  priority?: string;
  dueBefore?: string;
  dueAfter?: string;
  refKind?: string;
};

type ReadOptionsWithCollection = {
  collection?: CollectionReadOptions;
};

type ByTitleSelectorOptions = {
  path?: string;
  title?: string;
  key?: string;
  archived?: boolean;
  child?: string[];
};

type NoArchiveByTitleSelectorOptions = {
  path?: string;
  title?: string;
  key?: string;
};

type ZkSelectorOptions = {
  path?: string;
  title?: string;
  key?: string;
  kind?: string;
  child?: string[];
};

type JournalSelectorOptions = {
  path?: string;
  date?: string;
  key?: string;
  child?: string[];
};

type ReadByTitleOptions = ReadOptionsWithCollection & ByTitleSelectorOptions;
export type ReadProjectOptions = ReadByTitleOptions;
export type ReadAreaOptions = ReadByTitleOptions;
export type ReadResourceOptions = ReadByTitleOptions;
export type ReadLlmWikiOptions = ReadOptionsWithCollection & NoArchiveByTitleSelectorOptions;

export type ReadZkOptions = ReadOptionsWithCollection & ZkSelectorOptions;

export type ReadJournalOptions = ReadOptionsWithCollection & JournalSelectorOptions;

export type ReadRetroOptions = ReadOptionsWithCollection & ByTitleSelectorOptions & {
  date?: string;
};

export type ListOptions = {
  type?: string;
  archived?: boolean;
  query?: string;
  offset?: number;
  limit?: number | "all";
};

export type WikiIngestMode = "per-import" | "delta" | "init" | "re-ingest";

export type WikiIngestCandidateReason =
  | "missing_wiki_citation"
  | "source_newer_than_wiki"
  | "per_import"
  | "reingest_requested";

export type WikiIngestCandidatesOptions = {
  mode: WikiIngestMode;
  source_path?: string;
  source_paths?: string[];
  offset?: number;
  limit?: number | "all";
};

export type WikiIngestStalePage = {
  path: string;
  title: string;
  updated_ms: number;
};

export type WikiIngestCandidate = {
  path: string;
  type: string;
  title: string;
  updated: unknown;
  updated_ms: number | null;
  stale_llm_wikis: WikiIngestStalePage[];
  reason: WikiIngestCandidateReason;
};

export type WikiIngestCandidatesResult = {
  count: number;
  offset: number;
  limit: number | "all";
  returned: number;
  has_more: boolean;
  candidates: WikiIngestCandidate[];
};

export type WikiDomainSummary = {
  domain: string;
  pages: number;
  has_index: boolean;
};

export type WikiDomainsOptions = {
  offset?: number;
  limit?: number | "all";
};

export type WikiDomainsResult = {
  count: number;
  offset: number;
  limit: number | "all";
  returned: number;
  has_more: boolean;
  domains: WikiDomainSummary[];
};

export type AuditSeverity = "high" | "medium" | "low";

export type AuditCheckCode =
  | "broken_link"
  | "dangling_reference"
  | "idless_reference"
  | "bare_reference"
  | "bad_citation_subpath"
  | "orphan_note"
  | "upward_wiki_link"
  | "orphan_wiki_page"
  | "wiki_tag_domain_mismatch"
  | "unprocessed_spark"
  | "stale_draft_permanent";

export type AuditOptions = {
  check?: string;
  severity?: AuditSeverity;
  type?: string;
  offset?: number;
  limit?: number | "all";
  fix?: boolean;
};

export type AuditFinding = {
  code: AuditCheckCode;
  severity: AuditSeverity;
  path: string;
  type?: string;
  detail: Record<string, unknown>;
  fix: string;
};

export type AuditFixedItem = {
  code: "idless_reference" | "wiki_tag_domain_mismatch" | "bare_reference";
  path: string;
  action: string;
};

export type AuditResult = {
  counts: Partial<Record<AuditCheckCode, number>>;
  count: number;
  offset: number;
  limit: number | "all";
  returned: number;
  has_more: boolean;
  findings: AuditFinding[];
  fixed?: AuditFixedItem[];
};

export type UpdateOperation = "set" | "insert" | "append" | "prepend" | "replace" | "delete" | "backfill";

export type UpdatePayloadOptions = {
  key?: string;
  operation?: string;
  value?: unknown;
  valueSource?: "value" | "value_json";
  match?: string;
  replacement?: string;
  all?: boolean;
  child?: string[];
};

type UpdateByTitleOptions = ByTitleSelectorOptions & UpdatePayloadOptions;
export type UpdateProjectOptions = UpdateByTitleOptions;
export type UpdateAreaOptions = UpdateByTitleOptions;
export type UpdateResourceOptions = UpdateByTitleOptions;
export type UpdateLlmWikiOptions = NoArchiveByTitleSelectorOptions & UpdatePayloadOptions & {
  by?: string;
};

export type UpdateZkOptions = ZkSelectorOptions & UpdatePayloadOptions;
export type UpdateJournalOptions = JournalSelectorOptions & UpdatePayloadOptions;
export type UpdateRetroOptions = ByTitleSelectorOptions & { date?: string } & UpdatePayloadOptions;

export type UpdateSurfaceResult = {
  path: string;
  title: string;
  type: string;
  archived: boolean;
  key: string;
  operation: UpdateOperation;
  changed: boolean;
  matches?: number;
  index?: number;
  link?: string;
  added?: boolean;
  id?: string;
  moved?: boolean;
  fromPath?: string;
  toPath?: string;
  value?: unknown;
};

export type RenameByTitleOptions = {
  path?: string;
  title?: string;
  newTitle?: string;
  archived?: boolean;
  child?: string[];
};

export type RenameLlmWikiOptions = {
  path?: string;
  title?: string;
  newTitle?: string;
};

export type RenameZkOptions = {
  path?: string;
  title?: string;
  newTitle?: string;
  kind?: string;
  child?: string[];
};

export type RenameResult = {
  path: string;
  title: string;
  changed: boolean;
  fromPath: string;
  toPath: string;
  fromTitle: string;
  toTitle: string;
  renamedRetros?: Array<{
    fromPath: string;
    toPath: string;
  }>;
};

export type DeleteByTitleOptions = {
  path?: string;
  title?: string;
  archived?: boolean;
  force?: boolean;
  child?: string[];
};

export type DeleteLlmWikiOptions = {
  path?: string;
  title?: string;
  force?: boolean;
};

export type DeleteZkOptions = {
  path?: string;
  title?: string;
  kind?: string;
  force?: boolean;
  child?: string[];
};

export type DeleteJournalOptions = {
  path?: string;
  date?: string;
  force?: boolean;
  child?: string[];
};

export type DeleteRetroOptions = DeleteByTitleOptions & {
  date?: string;
};

export type IncomingLink = {
  sourcePath: string;
  targetPath: string;
  count: number;
};

export type DeleteCleanupResult = {
  frontmatter: number;
  references: number;
};

export type DeleteResult = {
  path: string;
  title: string;
  type: string;
  deleted: true;
  trashed: true;
  trashMethod: string;
  containerPath: string;
  deletedPaths: string[];
  incomingLinks: IncomingLink[];
  cleaned: DeleteCleanupResult;
};

export type TaskRead = {
  checkbox: string;
  name: string;
  due?: string;
  scheduled?: string;
  start?: string;
  created?: string;
  done?: string;
  cancelled?: string;
  priority?: string;
};

export type TaskWritableField = keyof TaskRead;

export type RootTaskItem = {
  rootPath: string;
  rootTitle: string;
  rootType: string;
  id: string;
  task: TaskRead;
};

type ReferenceKind = "url" | "note" | "file" | "wiki" | "text";

export type ReferenceStoredItem = string | {
  link: string;
  id?: string;
  description?: string;
};

export type ReferenceRead = {
  id: string | null;
  link: string;
  kind: ReferenceKind;
  description?: string;
  path?: string;
  target?: string;
};

export type ReferenceWritableField = "link" | "description";

export type ReferenceWriteInput = {
  link: unknown;
  description?: unknown;
  position?: unknown;
};

export type ReferenceMutationResult = {
  changed: boolean;
  index: number;
  link: string;
  added?: boolean;
  // The reference's stable id. insert always returns it (so a caller can cite `PZ[<id>]`
  // immediately); other ops omit it.
  id?: string;
};

export type SurfaceAddressing = {
  addressable: boolean;
  selectors?: string[];
  addressVia?: string;
  create?: string;
  read?: string;
  update?: string;
  createInputs?: string[];
  rename?: boolean;
};

export type SurfaceDescription = {
  type: string;
  addressing: SurfaceAddressing;
  readKeys: string[];
  writeKeys: string[];
  frontmatterKeys?: string[];
  collections: Record<string, CollectionKind>;
};

export type BacklinkRead = {
  link: string;
  path: string;
  title: string;
  type: string;
};

export type CreateProjectResult = NoteResult & { areas?: ProjectAreaResult[] };
export type CreateResourceResult = NoteResult & { sourcePath?: string; linkedFromSource: boolean };
export type CreateLlmWikiResult = NoteResult;
export type CreateSubnoteResult = NoteResult & { parentPath: string };
export type CreateAreaResult = NoteResult & { parentPath?: string };
export type CreateRetroResult = NoteResult & { sourcePath?: string; weekIso: string };
export type CreateZkResult = NoteResult & { kind: ZkKindCode };
export type OpenJournalResult = NoteResult & { date: string; energy: string };
export type AddReferenceResult = {
  path: string;
  title: string;
  index: number;
  link: string;
  added: boolean;
  id?: string;
  opened?: boolean;
};
