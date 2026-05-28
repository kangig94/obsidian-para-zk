export type CliArgs = Record<string, unknown>;

export type CliOptionSpec = {
  value?: string;
  description: string;
};

export type ZkKind = "Fleeting" | "Literature" | "Permanent";

export type PromotionZkKind = "Literature" | "Permanent";

export type Locale = "en" | "ko";

export type ParaZkPaths = {
  projectsFolder: string;
  areasFolder: string;
  resourcesFolder: string;
  retrosFolder: string;
  archivesFolder: string;
  zkFolder: string;
  fleetingFolder: string;
  fleetingArchiveFolder: string;
  literatureFolder: string;
  permanentFolder: string;
  journalFolder: string;
  dashboardFolder: string;
  templatesFolder: string;
  managedTemplatesFolder: string;
};

export type ParaZkSettings = {
  paths: ParaZkPaths;
  layoutFolders: string[];
  locale: Locale;
  initializedAt?: string;
  managedFiles: Record<string, ManagedFileState>;
};

export type ManagedFileState = {
  hash: string;
  updatedAt: string;
};

export type InitResult = {
  dryRun: boolean;
  created: string[];
  updated: string[];
  existing: string[];
  skipped: string[];
  warnings: string[];
};

export type InitOptions = {
  locale?: Locale;
  force?: boolean;
  dryRun?: boolean;
};

export type NoteResult = {
  path: string;
  title: string;
  created: boolean;
  opened?: boolean;
};

export type PromotionResult = NoteResult & {
  sourcePath: string;
  archivedPath?: string;
  kind: ZkKind;
};

export type CaptureResult = {
  path: string;
  content: string;
  date: string;
  created: boolean;
};

export const DEFAULT_PATHS: ParaZkPaths = {
  projectsFolder: "PARA/Projects",
  areasFolder: "PARA/Areas",
  resourcesFolder: "PARA/Resources",
  retrosFolder: "PARA/Retros",
  archivesFolder: "PARA/Archives",
  zkFolder: "ZK",
  fleetingFolder: "ZK/Fleeting",
  fleetingArchiveFolder: "ZK/Fleeting/Archives",
  literatureFolder: "ZK/Literature",
  permanentFolder: "ZK/Permanent",
  journalFolder: "Journal",
  dashboardFolder: "Dashboard",
  templatesFolder: "Templates",
  managedTemplatesFolder: "Templates/para-zk"
};

export const DEFAULT_LAYOUT_FOLDERS = [
  "PARA",
  "PARA/Projects",
  "PARA/Areas",
  "PARA/Resources",
  "PARA/Retros",
  "PARA/Archives",
  "ZK",
  "ZK/Fleeting",
  "ZK/Fleeting/Archives",
  "ZK/Literature",
  "ZK/Permanent",
  "Journal",
  "Dashboard",
  "Templates",
  "Templates/para-zk",
  "assets"
];

export const DEFAULT_SETTINGS: ParaZkSettings = {
  paths: DEFAULT_PATHS,
  layoutFolders: DEFAULT_LAYOUT_FOLDERS,
  locale: "ko",
  managedFiles: {}
};
