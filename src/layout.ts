export const PARA_ZK_PATHS = {
  projectsFolder: "PARA/Projects",
  areasFolder: "PARA/Areas",
  resourcesFolder: "PARA/Resources",
  wikiFolder: "LLM-Wiki",
  retrosFolder: "PARA/Retros",
  archivesFolder: "PARA/Archives",
  zkFolder: "ZK",
  sparkFolder: "ZK/Spark",
  digestFolder: "ZK/Digest",
  permanentFolder: "ZK/Permanent",
  journalFolder: "Journal",
  dashboardFolder: "Dashboard",
  tasksFolder: "Tasks",
  templatesFolder: "Templates",
  managedTemplatesFolder: "Templates/para-zk"
} as const;

export type ParaZkPaths = typeof PARA_ZK_PATHS;

export const LAYOUT_FOLDERS: readonly string[] = [
  "PARA",
  "PARA/Projects",
  "PARA/Areas",
  "PARA/Resources",
  "PARA/Retros",
  "PARA/Archives",
  "LLM-Wiki",
  "ZK",
  "ZK/Spark",
  "ZK/Digest",
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
