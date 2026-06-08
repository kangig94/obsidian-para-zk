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

    const permanent = propsSchemaForType("zk_permanent", "en");
    expect(permanent.lead?.id).toBe("aliases");
    expect(permanent.rows.map((row) => row.map((field) => field.id))).toEqual([
      ["created", "updated"],
      ["maturity"]
    ]);
    expect(findPropsField(permanent, "aliases")).toBe(permanent.lead);
  });
});
