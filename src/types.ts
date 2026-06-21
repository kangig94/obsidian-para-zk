import type { ZkKindCode } from "./zk/kinds";

export type CliArgs = Record<string, unknown>;

export type CliOptionSpec = {
  value?: string;
  description: string;
};

export type ZkKind = "Spark" | "Digest" | "Permanent";

export type ResourceCreateKind = "Digest" | "Permanent";

export type Locale = "en" | "ko";

export type ParaZkSettings = {
  locale: Locale;
  showRibbon: boolean;
  showEmptyTrashAction: boolean;
  editorWidthSliderEnabled: boolean;
  editorLineWidth: number;
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
  kind: ZkKindCode;
};

export type CaptureResult = {
  path: string;
  content: string;
  date: string;
  created: boolean;
};

export const EDITOR_LINE_WIDTH_MIN = 600;
export const EDITOR_LINE_WIDTH_MAX = 1600;
export const EDITOR_LINE_WIDTH_STEP = 20;

export const DEFAULT_SETTINGS: ParaZkSettings = {
  locale: "en",
  showRibbon: true,
  showEmptyTrashAction: true,
  editorWidthSliderEnabled: true,
  editorLineWidth: 700
};
