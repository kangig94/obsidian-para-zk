export type CliArgs = Record<string, unknown>;

export type CliOptionSpec = {
  value?: string;
  description: string;
};

export type ZkKind = "Spark" | "Source" | "Permanent";

export type ResourceCreateKind = "Source" | "Permanent";

export type Locale = "en" | "ko";

type ParaZkPaths = {
  projectsFolder: string;
  areasFolder: string;
  resourcesFolder: string;
  retrosFolder: string;
  archivesFolder: string;
  zkFolder: string;
  sparkFolder: string;
  sourceFolder: string;
  permanentFolder: string;
  journalFolder: string;
  dashboardFolder: string;
  tasksFolder: string;
  templatesFolder: string;
  managedTemplatesFolder: string;
};

export type ParaZkSettings = {
  paths: ParaZkPaths;
  layoutFolders: string[];
  locale: Locale;
  setupAt?: string;
  managedFiles: Record<string, ManagedFileState>;
};

export type ManagedFileState = {
  hash: string;
  updatedAt: string;
};

export type SetupResult = {
  dryRun: boolean;
  created: string[];
  updated: string[];
  existing: string[];
  skipped: string[];
  warnings: string[];
  dependencies: DependencyResult[];
};

export type SetupOptions = {
  locale?: Locale;
  force?: boolean;
  dryRun?: boolean;
  installDeps?: boolean;
};

type DependencyAction =
  | "none"
  | "warn"
  | "would_install_and_enable"
  | "would_enable"
  | "installed_and_enabled"
  | "enabled"
  | "failed";

export type DependencyResult = {
  id: string;
  name: string;
  repo: string;
  installed: boolean;
  enabled: boolean;
  installedVersion?: string;
  latestVersion?: string;
  action: DependencyAction;
  configured?: string[];
  error?: string;
};

export type NoteResult = {
  path: string;
  title: string;
  created: boolean;
  opened?: boolean;
};

export type PromotionResult = NoteResult & {
  sourcePath: string;
  kind: ZkKind;
};

export type CaptureResult = {
  path: string;
  content: string;
  date: string;
  created: boolean;
};

const DEFAULT_PATHS: ParaZkPaths = {
  projectsFolder: "PARA/Projects",
  areasFolder: "PARA/Areas",
  resourcesFolder: "PARA/Resources",
  retrosFolder: "PARA/Retros",
  archivesFolder: "PARA/Archives",
  zkFolder: "ZK",
  sparkFolder: "ZK/Spark",
  sourceFolder: "ZK/Source",
  permanentFolder: "ZK/Permanent",
  journalFolder: "Journal",
  dashboardFolder: "Dashboard",
  tasksFolder: "Tasks",
  templatesFolder: "Templates",
  managedTemplatesFolder: "Templates/para-zk"
};

const DEFAULT_LAYOUT_FOLDERS = [
  "PARA",
  "PARA/Projects",
  "PARA/Areas",
  "PARA/Resources",
  "PARA/Retros",
  "PARA/Archives",
  "ZK",
  "ZK/Spark",
  "ZK/Source",
  "ZK/Permanent",
  "Journal",
  "Dashboard",
  "Tasks",
  "Tasks/current",
  "Tasks/archives",
  "Templates",
  "Templates/para-zk",
  "assets"
];

export const DEFAULT_SETTINGS: ParaZkSettings = {
  paths: DEFAULT_PATHS,
  layoutFolders: DEFAULT_LAYOUT_FOLDERS,
  locale: "en",
  managedFiles: {}
};
