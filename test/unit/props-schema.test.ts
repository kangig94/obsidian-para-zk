import { describe, expect, it } from "vitest";
import { findPropsField, propsSchemaForType } from "../../src/props/schema";

describe("props schema lead fields", () => {
  it("keeps aliases in the header lead for project, resource, and permanent ZK notes", () => {
    const project = propsSchemaForType("project", "en");
    expect(project.lead?.id).toBe("aliases");
    expect(project.rows.map((row) => row.map((field) => field.id))).toEqual([
      ["areas", "due_date"],
      ["status", "start_date"],
      ["priority", "done_date"]
    ]);
    expect(findPropsField(project, "aliases")).toBe(project.lead);

    const resource = propsSchemaForType("resource", "en");
    expect(resource.lead?.id).toBe("aliases");
    expect(resource.rows.map((row) => row.map((field) => field.id))).toEqual([
      ["created", "updated"],
      ["url", "first_author"],
      ["license", "kind"]
    ]);
    expect(findPropsField(resource, "aliases")).toBe(resource.lead);
    expect(findPropsField(resource, "url")?.control).toBe("url");
    expect(findPropsField(resource, "kind")).toMatchObject({
      control: "kind-suggestions",
      suggestionKind: "resource"
    });

    expect(findPropsField(propsSchemaForType("subnote", "en"), "subnote_type")).toMatchObject({
      control: "kind-suggestions",
      suggestionKind: "subnote"
    });

    const permanent = propsSchemaForType("permanent", "en");
    expect(permanent.lead?.id).toBe("aliases");
    expect(permanent.rows.map((row) => row.map((field) => field.id))).toEqual([
      ["created", "updated"],
      ["maturity"]
    ]);
    expect(findPropsField(permanent, "aliases")).toBe(permanent.lead);
  });

  it("uses the URL control for digest source links", () => {
    const digest = propsSchemaForType("digest", "en");
    expect(findPropsField(digest, "url")?.control).toBe("url");
  });

  it("surfaces llm-wiki authorship as display-only props", () => {
    const llmWiki = propsSchemaForType("llm-wiki", "en");

    expect(llmWiki.rows.map((row) => row.map((field) => field.id))).toEqual([
      ["created", "updated"],
      ["created_by", "updated_by"]
    ]);
    expect(findPropsField(llmWiki, "created_by")).toMatchObject({
      key: "created_by",
      label: "Created by",
      control: "display"
    });
    expect(findPropsField(llmWiki, "updated_by")).toMatchObject({
      key: "updated_by",
      label: "Updated by",
      control: "display"
    });
  });

  it("keeps vault-managed timestamps read-only wherever they are shown", () => {
    for (const type of ["area", "resource", "llm-wiki", "subnote", "spark", "digest", "permanent"] as const) {
      const schema = propsSchemaForType(type, "en");
      // created = absolute read-only display; updated = relative read-only display.
      // Neither is the editable "datetime" input.
      expect(findPropsField(schema, "created")?.control).toBe("datetime-display");
      expect(findPropsField(schema, "updated")?.control).toBe("relative-time");
    }

    expect(findPropsField(propsSchemaForType("project", "en"), "created")).toBeUndefined();

    const journal = propsSchemaForType("journal", "en");
    expect(findPropsField(journal, "created")).toBeUndefined();
    expect(findPropsField(journal, "updated")).toBeUndefined();

    const retro = propsSchemaForType("retro", "en");
    expect(findPropsField(retro, "created")).toBeUndefined();
    expect(findPropsField(retro, "updated")).toBeUndefined();
  });
});
