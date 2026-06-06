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
  open?: boolean;
};

export type CreateResourceOptions = {
  title: string;
  sourcePath?: string;
  sourceType?: string;
  sourceTitle?: string;
  linkToSource?: boolean;
  url?: string;
  firstAuthor?: string;
  license?: string;
  kind?: string;
  body?: string;
  open?: boolean;
};

export type AddReferenceOptions = {
  sourcePath?: string;
  type?: string;
  title?: string;
  kind?: string;
  date?: string;
  child?: string[];
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

export type CreateSubareaOptions = {
  title: string;
  sourcePath?: string;
  parentType?: string;
  parentTitle?: string;
  child?: string[];
  inheritParentTag?: boolean;
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

export type UpdateOperation = "set" | "insert" | "append" | "prepend" | "replace" | "delete";

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
  moved?: boolean;
  fromPath?: string;
  toPath?: string;
};

export type RenameByTitleOptions = {
  path?: string;
  title?: string;
  newTitle?: string;
  archived?: boolean;
  child?: string[];
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
  description?: string;
};

export type ReferenceRead = {
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
};

export type SurfaceAddressing = {
  addressable: boolean;
  selectors?: string[];
  addressVia?: string;
  create?: string;
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
export type CreateSubnoteResult = NoteResult & { parentPath: string };
export type CreateSubareaResult = NoteResult & { parentPath: string };
export type CreateRetroResult = NoteResult & { sourcePath?: string; weekIso: string };
export type CreateZkResult = NoteResult & { kind: ZkKindCode };
export type OpenJournalResult = NoteResult & { date: string; energy: string };
export type AddReferenceResult = {
  path: string;
  title: string;
  index: number;
  link: string;
  added: boolean;
  opened?: boolean;
};
