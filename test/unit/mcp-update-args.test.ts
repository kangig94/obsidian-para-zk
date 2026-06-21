import { describe, expect, it } from "vitest";
import { buildUpdateArgs } from "../../src/mcp/server";

describe("MCP update arg builder", () => {
  it("builds shell-safe replace args for optsidian ZK notes", () => {
    const oldString = "line one\n\"quoted\" $HOME `tick`";
    const newString = "line two\n'quoted' $PATH `next`";

    expect(buildUpdateArgs({
      tool: "replace",
      params: {
        type: "spark",
        title: "My Note",
        key: "body",
        old_string: oldString,
        new_string: newString
      }
    })).toEqual([
      "para-zk:update-zk",
      "kind=spark",
      "title=My Note",
      "key=body",
      "op=replace",
      `match=${oldString}`,
      `with=${newString}`,
      "format=json"
    ]);
  });

  it("maps replace_all to all=true and uses the obsidian command shape", () => {
    expect(buildUpdateArgs({
      tool: "replace",
      params: {
        type: "project",
        title: "Launch",
        key: "body",
        old_string: "old",
        new_string: "new",
        replace_all: true
      }
    })).toEqual([
      "para-zk:update-project",
      "title=Launch",
      "key=body",
      "op=replace",
      "match=old",
      "with=new",
      "all=true",
      "format=json"
    ]);
  });

  it("builds set args with child drill and raw multi-line content", () => {
    const content = "first line\nsecond line with $ and `backticks`";

    expect(buildUpdateArgs({
      tool: "set",
      params: {
        type: "area",
        title: "Health",
        child: ["Habits"],
        key: "body",
        content
      }
    })).toEqual([
      "para-zk:update-child",
      "root_type=area",
      "root_title=Health",
      "title=Habits",
      "key=body",
      "op=set",
      `value=${content}`,
      "format=json"
    ]);
  });

  it("rejects a child selector that is not an array of strings", () => {
    expect(() => buildUpdateArgs({
      tool: "set",
      params: { type: "area", title: "Health", child: "Habits", key: "body", content: "x" }
    })).toThrow(/child must be an array of strings/);
  });

  it("emits a child drill as a single JSON-list argv element", () => {
    expect(buildUpdateArgs({
      tool: "set",
      params: { type: "area", title: "Ops", child: ["Hiring", "Interviews"], key: "body", content: "x" }
    })).toEqual([
      "para-zk:update-child",
      "root_type=area",
      "root_title=Ops",
      `relpath=${JSON.stringify(["Hiring"])}`,
      "title=Interviews",
      "key=body",
      "op=set",
      "value=x",
      "format=json"
    ]);
  });

  it("passes a qualified subfolder child title through to update-child", () => {
    expect(buildUpdateArgs({
      tool: "set",
      params: { type: "project", title: "Alpha", child: ["Notes/Plan.md"], key: "body", content: "x" }
    })).toEqual([
      "para-zk:update-child",
      "root_type=project",
      "root_title=Alpha",
      "title=Notes/Plan.md",
      "key=body",
      "op=set",
      "value=x",
      "format=json"
    ]);
  });

  it("rejects child updates on non-project/area types", () => {
    expect(() => buildUpdateArgs({
      tool: "set",
      params: { type: "resource", title: "Reading Queue", child: ["Plan"], key: "body", content: "x" }
    })).toThrow(/child updates require type=project or type=area/);
  });

  it("builds add args for append and prepend positions", () => {
    expect(buildUpdateArgs({
      tool: "add",
      params: {
        type: "resource",
        title: "Reading Queue",
        key: "body",
        content: "- Default append"
      }
    })).toEqual([
      "para-zk:update-resource",
      "title=Reading Queue",
      "key=body",
      "op=append",
      "value=- Default append",
      "format=json"
    ]);

    expect(buildUpdateArgs({
      tool: "add",
      params: {
        type: "resource",
        title: "Reading Queue",
        key: "body",
        content: "- Prepend",
        position: "start"
      }
    })).toEqual([
      "para-zk:update-resource",
      "title=Reading Queue",
      "key=body",
      "op=prepend",
      "value=- Prepend",
      "format=json"
    ]);
  });

  it("maps llm-wiki slash-path title selectors to update-llm-wiki", () => {
    expect(buildUpdateArgs({
      tool: "set",
      params: {
        type: "llm-wiki",
        title: "AI/Policy",
        key: "body",
        content: "Updated wiki synthesis"
      }
    })).toEqual([
      "para-zk:update-llm-wiki",
      "title=AI/Policy",
      "key=body",
      "op=set",
      "value=Updated wiki synthesis",
      "format=json"
    ]);
  });

  it("rejects archived selectors for llm-wiki mutation tools", () => {
    expect(() => buildUpdateArgs({
      tool: "set",
      params: {
        type: "llm-wiki",
        title: "AI/Policy",
        archived: true,
        key: "body",
        content: "Updated wiki synthesis"
      }
    })).toThrow(/llm-wiki does not support archived selector/);
  });

  it("maps journal date selectors and retro date pass-through", () => {
    expect(buildUpdateArgs({
      tool: "set",
      params: {
        type: "journal",
        date: "2026-06-04",
        key: "body",
        content: "Today"
      }
    })).toEqual([
      "para-zk:update-journal",
      "date=2026-06-04",
      "key=body",
      "op=set",
      "value=Today",
      "format=json"
    ]);

    expect(buildUpdateArgs({
      tool: "add",
      params: {
        type: "retro",
        title: "Week 23",
        date: "2026-06-04",
        key: "body",
        content: "Reflection"
      }
    })).toEqual([
      "para-zk:update-retro",
      "title=Week 23",
      "date=2026-06-04",
      "key=body",
      "op=append",
      "value=Reflection",
      "format=json"
    ]);
  });

  it("validates missing required mutation fields before spawning", () => {
    expect(() => buildUpdateArgs({
      tool: "replace",
      params: { type: "project", title: "Launch", old_string: "old", new_string: "new" }
    })).toThrow(/key is required/);

    expect(() => buildUpdateArgs({
      tool: "replace",
      params: { type: "project", title: "Launch", key: "body", new_string: "new" }
    })).toThrow(/old_string is required/);

    expect(() => buildUpdateArgs({
      tool: "set",
      params: { type: "project", title: "Launch", key: "body" }
    })).toThrow(/content is required/);

    expect(() => buildUpdateArgs({
      tool: "add",
      params: { type: "project", key: "body", content: "text" }
    })).toThrow(/requires a title selector/);

    expect(() => buildUpdateArgs({
      tool: "set",
      params: { title: "Launch", key: "body", content: "text" }
    })).toThrow(/type is required/);
  });

  it("rejects unknown and empty mutation types", () => {
    expect(() => buildUpdateArgs({
      tool: "set",
      params: { type: "task", title: "Launch", key: "body", content: "text" }
    })).toThrow(/unknown type: task/);

    expect(() => buildUpdateArgs({
      tool: "set",
      params: { type: "", title: "Launch", key: "body", content: "text" }
    })).toThrow(/type is required/);
  });
});
