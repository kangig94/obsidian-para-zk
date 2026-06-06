import { localePack } from "../i18n";
import type { Locale } from "../types";
import {
  ENERGY_CODES,
  MATURITY_CODES,
  PRIORITY_CODES,
  PROJECT_STATUS_CODES,
  RESOURCE_KIND_CODES,
  SUBNOTE_TYPE_CODES,
  energyLabel,
  maturityLabel,
  priorityLabel,
  projectStatusLabel,
  resourceKindLabel,
  subnoteTypeLabel,
  type EnergyCode,
  type MaturityCode,
  type PriorityCode,
  type ProjectStatusCode,
  type ResourceKindCode,
  type SubnoteTypeCode
} from "../vocabulary";

const PROPS_VIEW_TYPES = [
  "project",
  "area",
  "resource",
  "journal",
  "retro",
  "subnote",
  "zk_spark",
  "zk_digest",
  "zk_permanent"
] as const;

export type PropsViewType = typeof PROPS_VIEW_TYPES[number];

type PropsFieldControl =
  | "area-list"
  | "date"
  | "datetime"
  | "display"
  | "select"
  | "text"
  | "text-list";

export type PropsSelectOption = {
  value: string;
  label: string;
};

export type PropsField = {
  id: string;
  key?: string;
  label: string;
  control: PropsFieldControl;
  options?: PropsSelectOption[];
  display?: "areas" | "period";
};

export type PropsSchema = {
  type: PropsViewType;
  rows: PropsField[][];
};

export function parsePropsViewType(value: string | undefined): PropsViewType | undefined {
  const token = value?.trim();
  if (!token) return undefined;
  return PROPS_VIEW_TYPES.find((type) => type === token);
}

export function inferPropsViewType(frontmatter: Record<string, unknown> | undefined): PropsViewType | undefined {
  const type = typeof frontmatter?.type === "string" ? frontmatter.type : undefined;

  if (type === "doc") return "subnote";
  if (type === "subarea") return "area";
  return parsePropsViewType(type);
}

export function propsSchemaForType(type: PropsViewType, locale: Locale): PropsSchema {
  const t = localePack(locale);
  const created = field("created", "created", t.labels.created, "datetime");
  const updated = field("updated", "updated", t.labels.updated, "datetime");

  const schemas: Record<PropsViewType, PropsSchema> = {
    project: {
      type: "project",
      rows: [
        [
          field("areas", "areas", t.labels.area, "area-list"),
          field("due_date", "due_date", t.labels.dueDate, "date")
        ],
        [
          selectField("status", "status", t.labels.status, statusOptions(locale)),
          field("start_date", "start_date", t.labels.startDate, "date")
        ],
        [
          selectField("priority", "priority", t.labels.priority, priorityOptions(locale)),
          field("done_date", "done_date", t.labels.doneDate, "date")
        ]
      ]
    },
    area: {
      type: "area",
      rows: [
        [created, updated],
        [displayField("parent", "parent", t.labels.area)]
      ]
    },
    resource: {
      type: "resource",
      rows: [
        [created, updated],
        [
          field("url", "url", t.labels.url, "text"),
          field("first_author", "first_author", t.labels.firstAuthor, "text")
        ],
        [
          field("license", "license", t.labels.license, "text"),
          selectField("kind", "kind", t.labels.kind, resourceKindOptions(locale))
        ]
      ]
    },
    journal: {
      type: "journal",
      rows: [
        [
          field("date", "date", t.labels.date, "date"),
          selectField("energy", "energy", t.labels.energy, energyOptions(locale))
        ]
      ]
    },
    retro: {
      type: "retro",
      rows: [
        [
          displayField("project", "project", t.labels.project),
          { id: "period", label: t.labels.period, control: "display", display: "period" }
        ],
        [
          { id: "areas", key: "areas", label: t.labels.area, control: "display", display: "areas" },
          displayField("week_iso", "week_iso", t.labels.week)
        ]
      ]
    },
    subnote: {
      type: "subnote",
      rows: [
        [created, updated],
        [selectField("subnote_type", "subnote_type", t.labels.kind, subnoteTypeOptions(locale))]
      ]
    },
    zk_spark: {
      type: "zk_spark",
      rows: [[created, updated]]
    },
    zk_digest: {
      type: "zk_digest",
      rows: [
        [created, updated],
        [
          field("sourceTitle", "sourceTitle", t.labels.source, "text"),
          field("url", "url", t.labels.url, "text")
        ],
        [
          field("first_author", "first_author", t.labels.firstAuthor, "text"),
          field("published", "published", t.labels.published, "date")
        ]
      ]
    },
    zk_permanent: {
      type: "zk_permanent",
      rows: [
        [created, updated],
        [
          selectField("maturity", "maturity", t.labels.status, maturityOptions(locale)),
          field("aliases", "aliases", t.labels.aliases, "text-list")
        ]
      ]
    }
  };

  return schemas[type];
}

export function findPropsField(schema: PropsSchema, id: string): PropsField | undefined {
  return schema.rows.flat().find((field) => field.id === id || field.key === id);
}

function field(id: string, key: string, label: string, control: PropsFieldControl): PropsField {
  return { id, key, label, control };
}

function displayField(id: string, key: string, label: string): PropsField {
  return { id, key, label, control: "display" };
}

function selectField(id: string, key: string, label: string, options: PropsSelectOption[]): PropsField {
  return { id, key, label, control: "select", options };
}

function statusOptions(locale: Locale): PropsSelectOption[] {
  return PROJECT_STATUS_CODES.map((code: ProjectStatusCode) => ({
    value: code,
    label: projectStatusLabel(code, locale)
  }));
}

function priorityOptions(locale: Locale): PropsSelectOption[] {
  return PRIORITY_CODES.map((code: PriorityCode) => ({
    value: code,
    label: priorityLabel(code, locale)
  }));
}

function maturityOptions(locale: Locale): PropsSelectOption[] {
  return MATURITY_CODES.map((code: MaturityCode) => ({
    value: code,
    label: maturityLabel(code, locale)
  }));
}

function energyOptions(locale: Locale): PropsSelectOption[] {
  return ENERGY_CODES.map((code: EnergyCode) => ({
    value: code,
    label: energyLabel(code, locale)
  }));
}

function subnoteTypeOptions(locale: Locale): PropsSelectOption[] {
  return SUBNOTE_TYPE_CODES.map((code: SubnoteTypeCode) => ({
    value: code,
    label: subnoteTypeLabel(code, locale)
  }));
}

function resourceKindOptions(locale: Locale): PropsSelectOption[] {
  return RESOURCE_KIND_CODES.map((code: ResourceKindCode) => ({
    value: code,
    label: resourceKindLabel(code, locale)
  }));
}
