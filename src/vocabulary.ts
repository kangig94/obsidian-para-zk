import { localePack } from "./i18n";
import type { Locale } from "./types";

export const PROJECT_STATUS_CODES = ["idea", "in_progress", "paused", "done", "archived"] as const;
export const PRIORITY_CODES = ["low", "medium", "high"] as const;
export const MATURITY_CODES = ["draft", "refined", "evergreen"] as const;
export const ENERGY_CODES = ["high", "normal", "low"] as const;
export const SUBNOTE_TYPE_CODES = [
  "free",
  "checklist",
  "todo",
  "plan",
  "research",
  "meeting",
  "decision",
  "guide",
  "risk",
  "idea",
  "settlement"
] as const;
// Suggested Resource kinds for localized UI choices only. Resource `kind`
// storage remains free-form and is not validated against this list.
export const RESOURCE_KIND_CODES = [
  "paper",
  "article",
  "book",
  "video",
  "web",
  "code",
  "guide",
  "other"
] as const;

export type ProjectStatusCode = typeof PROJECT_STATUS_CODES[number];
export type PriorityCode = typeof PRIORITY_CODES[number];
export type MaturityCode = typeof MATURITY_CODES[number];
export type EnergyCode = typeof ENERGY_CODES[number];
export type SubnoteTypeCode = typeof SUBNOTE_TYPE_CODES[number];
export type ResourceKindCode = typeof RESOURCE_KIND_CODES[number];

export const PROJECT_STATUS_CODE_HELP = codeHelp(PROJECT_STATUS_CODES);
export const PRIORITY_CODE_HELP = codeHelp(PRIORITY_CODES);
export const MATURITY_CODE_HELP = codeHelp(MATURITY_CODES);
export const ENERGY_CODE_HELP = codeHelp(ENERGY_CODES);
export const SUBNOTE_TYPE_CODE_HELP = codeHelp(SUBNOTE_TYPE_CODES);

export function parseProjectStatusCode(value: string | undefined): ProjectStatusCode | undefined {
  return parseCode(value, PROJECT_STATUS_CODES);
}

export function parsePriorityCode(value: string | undefined): PriorityCode | undefined {
  return parseCode(value, PRIORITY_CODES);
}

export function parseMaturityCode(value: string | undefined): MaturityCode | undefined {
  return parseCode(value, MATURITY_CODES);
}

export function parseEnergyCode(value: string | undefined): EnergyCode | undefined {
  return parseCode(value, ENERGY_CODES);
}

export function parseSubnoteTypeCode(value: string | undefined): SubnoteTypeCode | undefined {
  return parseCode(value, SUBNOTE_TYPE_CODES);
}

export function projectStatusLabel(code: ProjectStatusCode, locale: Locale): string {
  return projectStatusLabels(locale)[code];
}

export function priorityLabel(code: PriorityCode, locale: Locale): string {
  return priorityLabels(locale)[code];
}

export function maturityLabel(code: MaturityCode, locale: Locale): string {
  return maturityLabels(locale)[code];
}

export function energyLabel(code: EnergyCode, locale: Locale): string {
  return energyLabels(locale)[code];
}

export function subnoteTypeLabel(code: SubnoteTypeCode, locale: Locale): string {
  return subnoteTypeLabels(locale)[code];
}

export function resourceKindLabel(code: ResourceKindCode, locale: Locale): string {
  return resourceKindLabels(locale)[code];
}

function projectStatusLabels(locale: Locale): Record<ProjectStatusCode, string> {
  const status = localePack(locale).projectStatus;
  return {
    idea: status.idea,
    in_progress: status.active,
    paused: status.paused,
    done: status.done,
    archived: status.archived
  };
}

function priorityLabels(locale: Locale): Record<PriorityCode, string> {
  return localePack(locale).priority;
}

function maturityLabels(locale: Locale): Record<MaturityCode, string> {
  return localePack(locale).maturity;
}

function energyLabels(locale: Locale): Record<EnergyCode, string> {
  return localePack(locale).energy;
}

function subnoteTypeLabels(locale: Locale): Record<SubnoteTypeCode, string> {
  const labels = localePack(locale).subnoteTypes;
  return {
    free: labels[0] ?? "Freeform",
    checklist: labels[1] ?? "Checklist",
    todo: labels[2] ?? "Task",
    plan: labels[3] ?? "Plan/Design",
    research: labels[4] ?? "Research",
    meeting: labels[5] ?? "Meeting notes",
    decision: labels[6] ?? "Decision record",
    guide: labels[7] ?? "Guide",
    risk: labels[8] ?? "Issue/Risk",
    idea: labels[9] ?? "Idea",
    settlement: labels[10] ?? "Accounting"
  };
}

function resourceKindLabels(locale: Locale): Record<ResourceKindCode, string> {
  const labels = localePack(locale).resourceKinds;
  return {
    paper: labels[0] ?? "Paper",
    article: labels[1] ?? "Article",
    book: labels[2] ?? "Book",
    video: labels[3] ?? "Video",
    web: labels[4] ?? "Web",
    code: labels[5] ?? "Code",
    guide: labels[6] ?? "Guide",
    other: labels[7] ?? "Other"
  };
}

function parseCode<T extends string>(value: string | undefined, codes: readonly T[]): T | undefined {
  const token = normalizeToken(value);
  if (!token) return undefined;

  for (const code of codes) {
    if (token === normalizeToken(code)) return code;
  }

  return undefined;
}

function codeHelp(codes: readonly string[]): string {
  return codes.join("|");
}

function normalizeToken(value: string | undefined): string {
  return (value ?? "").trim();
}
