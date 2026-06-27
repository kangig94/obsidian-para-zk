import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "para-zk-marker-script-"));
  tempRoots.push(dir);
  return dir;
}

function parseResult(output: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of output.trim().split(/\n/)) {
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (match) result[match[1].toLowerCase().replaceAll(" ", "_")] = match[2];
  }
  return result;
}

afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("import-resource marker fallback script", () => {
  it("falls back from a failed full marker run to sequential page ranges and merges output", () => {
    const root = tempRoot();
    const bin = path.join(root, "bin");
    const calls = path.join(root, "calls.log");
    const pdf = path.join(root, "sample.pdf");
    mkdirSync(bin, { recursive: true });
    writeFileSync(pdf, "%PDF-1.7\n");

    const pdfinfo = path.join(bin, "pdfinfo");
    writeFileSync(
      pdfinfo,
      `#!/bin/sh
echo "Title: fake"
echo "Pages: 3"
`
    );
    chmodSync(pdfinfo, 0o755);

    const marker = path.join(bin, "marker_single");
    writeFileSync(
      marker,
      `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, args.join(" ") + "\\n");
const out = args[args.indexOf("--output_dir") + 1];
const rangeIndex = args.indexOf("--page_range");
if (rangeIndex === -1) {
  console.error("simulated full conversion OOM");
  process.exit(42);
}
const range = args[rangeIndex + 1];
const page = Number(range.split("-")[0]);
const dir = path.join(out, "sample");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "sample.md"), "# Page " + page + "\\n\\n![figure](image.png)\\n");
fs.writeFileSync(path.join(dir, "image.png"), "image-" + page);
fs.writeFileSync(path.join(dir, "sample_meta.json"), "{}\\n");
`
    );
    chmodSync(marker, 0o755);

    const script = path.resolve("clients/skills/import-resource/scripts/marker_pdf_convert.py");
    const proc = spawnSync("python3", [script, pdf, "--marker-bin", "marker_single"], {
      cwd: path.resolve("."),
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
      encoding: "utf8"
    });
    expect(proc.status).toBe(0);
    expect(proc.stderr).toContain("Saving marker output to: ");

    expect(proc.stdout).toMatch(/^OK\n/);
    const result = parseResult(proc.stdout);
    tempRoots.push(result.output_dir);
    expect(result.mode).toBe("page-fallback");
    expect(result.scope).toBe("full-document");
    expect(result.pages).toBe("3/3");
    expect(result.chunks).toBe("3");
    expect(result.device).toMatch(/^(cpu|cuda|mps|unknown)$/);
    expect(path.basename(result.output_dir)).toMatch(/^para-zk-marker-/);
    expect(result.markdown).toBe(path.join(result.output_dir, "sample", "sample.md"));

    const markdown = readFileSync(result.markdown, "utf8");
    expect(markdown).toContain("# Page 0");
    expect(markdown).toContain("# Page 1");
    expect(markdown).toContain("# Page 2");

    const imageLinks = [...markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)].map((match) => match[1]);
    expect(imageLinks).toHaveLength(3);
    for (const link of imageLinks) {
      expect(readFileSync(path.join(result.output_dir, "sample", link), "utf8")).toMatch(/^image-/);
    }

    expect(readFileSync(calls, "utf8").trim().split(/\n/).map((line) => line.includes("--page_range"))).toEqual([
      false,
      true,
      true,
      true
    ]);
  });

  it("passes page ranges through to marker and uses them for page estimates", () => {
    const root = tempRoot();
    const bin = path.join(root, "bin");
    const out = path.join(root, "out");
    const calls = path.join(root, "calls.log");
    const pdf = path.join(root, "sample.pdf");
    mkdirSync(bin, { recursive: true });
    writeFileSync(pdf, "%PDF-1.7\n");

    const pdfinfo = path.join(bin, "pdfinfo");
    writeFileSync(
      pdfinfo,
      `#!/bin/sh
echo "Pages: 3"
`
    );
    chmodSync(pdfinfo, 0o755);

    const marker = path.join(bin, "marker_single");
    writeFileSync(
      marker,
      `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, args.join(" ") + "\\n");
const out = args[args.indexOf("--output_dir") + 1];
const range = args[args.indexOf("--page_range") + 1];
if (range !== "0-1") process.exit(42);
const dir = path.join(out, "sample");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "sample.md"), "# Range " + range + "\\n");
fs.writeFileSync(path.join(dir, "sample_meta.json"), "{}\\n");
`
    );
    chmodSync(marker, 0o755);

    const script = path.resolve("clients/skills/import-resource/scripts/marker_pdf_convert.py");
    const stdout = execFileSync(
      "python3",
      [script, pdf, "--output_dir", out, "--marker-bin", "marker_single", "--page-range", "0-1"],
      {
        cwd: path.resolve("."),
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
        encoding: "utf8"
      }
    );

    const result = parseResult(stdout);
    expect(result.mode).toBe("single-pass");
    expect(result.scope).toBe("page-range");
    expect(result.page_range).toBe("0-1");
    expect(result.pages).toBe("2/3");
    expect(readFileSync(result.markdown, "utf8")).toContain("# Range 0-1");
    expect(readFileSync(calls, "utf8").trim()).toContain("--page_range 0-1");
  });

  it("uses the marker Python API once and reuses the loaded model dict across page fallback chunks", () => {
    const root = tempRoot();
    const bin = path.join(root, "bin");
    const fakePackage = path.join(root, "fake-marker");
    const out = path.join(root, "out");
    const calls = path.join(root, "calls.log");
    const pdf = path.join(root, "sample.pdf");
    mkdirSync(path.join(fakePackage, "marker", "config"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    writeFileSync(pdf, "%PDF-1.7\n");
    writeFileSync(path.join(fakePackage, "marker", "__init__.py"), "");
    writeFileSync(path.join(fakePackage, "marker", "config", "__init__.py"), "");
    writeFileSync(
      path.join(fakePackage, "marker", "models.py"),
      `import os

def create_model_dict():
    with open(os.environ["FAKE_MARKER_CALLS"], "a", encoding="utf-8") as f:
        f.write("create_model_dict\\n")
    return {"model": object()}
`
    );
    writeFileSync(
      path.join(fakePackage, "marker", "output.py"),
      `import json
import os

def save_output(rendered, output_dir, fname_base):
    os.makedirs(output_dir, exist_ok=True)
    page = rendered["page"]
    with open(os.path.join(output_dir, f"{fname_base}.md"), "w", encoding="utf-8") as f:
        f.write(f"# Page {page}\\n\\n![figure](image.png)\\n")
    with open(os.path.join(output_dir, "image.png"), "w", encoding="utf-8") as f:
        f.write(f"image-{page}")
    with open(os.path.join(output_dir, f"{fname_base}_meta.json"), "w", encoding="utf-8") as f:
        json.dump({}, f)
`
    );
    writeFileSync(
      path.join(fakePackage, "marker", "config", "parser.py"),
      `import os

class FakeConverter:
    def __init__(self, artifact_dict, processor_list=None, renderer=None, llm_service=None, config=None):
        self.config = config or {}
        self.artifact_dict = artifact_dict

    def __call__(self, filepath):
        with open(os.environ["FAKE_MARKER_CALLS"], "a", encoding="utf-8") as f:
            f.write("convert:" + str(self.config.get("page_range")) + "\\n")
        page_range = self.config.get("page_range")
        if not page_range:
            raise RuntimeError("simulated full conversion OOM")
        page = int(str(page_range).split("-")[0])
        return {"page": page}

class ConfigParser:
    def __init__(self, cli_options):
        self.cli_options = cli_options

    def generate_config_dict(self):
        return dict(self.cli_options)

    def get_converter_cls(self):
        return FakeConverter

    def get_processors(self):
        return None

    def get_renderer(self):
        return "fake-renderer"

    def get_llm_service(self):
        return None

    def get_output_folder(self, filepath):
        folder = os.path.join(self.cli_options["output_dir"], os.path.splitext(os.path.basename(filepath))[0])
        os.makedirs(folder, exist_ok=True)
        return folder

    def get_base_filename(self, filepath):
        return os.path.splitext(os.path.basename(filepath))[0]
`
    );

    const pdfinfo = path.join(bin, "pdfinfo");
    writeFileSync(
      pdfinfo,
      `#!/bin/sh
echo "Pages: 3"
`
    );
    chmodSync(pdfinfo, 0o755);

    const script = path.resolve("clients/skills/import-resource/scripts/marker_pdf_convert.py");
    const stdout = execFileSync("python3", [script, pdf, "--output_dir", out], {
      cwd: path.resolve("."),
      env: {
        ...process.env,
        FAKE_MARKER_CALLS: calls,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        PYTHONPATH: fakePackage
      },
      encoding: "utf8"
    });

    const result = parseResult(stdout);
    expect(result.mode).toBe("page-fallback");
    expect(result.scope).toBe("full-document");
    expect(result.chunks).toBe("3");
    expect(result.device).toMatch(/^(cpu|cuda|mps|unknown)$/);
    expect(result.pages).toBe("3/3");
    expect(readFileSync(result.markdown, "utf8")).toContain("# Page 2");
    expect(readFileSync(calls, "utf8").trim().split(/\n/)).toEqual([
      "create_model_dict",
      "convert:None",
      "convert:0",
      "convert:1",
      "convert:2"
    ]);
  });
});
