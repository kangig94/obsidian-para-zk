import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCliHarness, type CliHarness } from "../harness/cli";

let cli: CliHarness;
let tempDir: string;

beforeEach(async () => {
  cli = createCliHarness();
  tempDir = await mkdtemp(join(tmpdir(), "para-zk-attach-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("attach-file", () => {
  it("copies a local file into the assets folder and returns Obsidian links", async () => {
    const source = join(tempDir, "Capture Image.PNG");
    await writeFile(source, new Uint8Array([1, 2, 3]));

    const result = await cli.run("para-zk:attach-file", { source });

    expect(result).toMatchObject({
      ok: true,
      path: "assets/Capture Image.PNG",
      name: "Capture Image.PNG",
      kind: "image",
      size: 3,
      link: "[[assets/Capture Image.PNG]]",
      embed: "![[assets/Capture Image.PNG]]"
    });
    expect(Array.from(cli.app.readBinaryPath("assets/Capture Image.PNG") ?? [])).toEqual([1, 2, 3]);
  });

  it("preserves the source extension for custom names and allocates unique paths", async () => {
    const source = join(tempDir, "report.pdf");
    await writeFile(source, new Uint8Array([4, 5]));

    const first = await cli.run("para-zk:attach-file", { source, name: "Spec" });
    const second = await cli.run("para-zk:attach-file", { source, name: "Spec" });

    expect(first).toMatchObject({
      path: "assets/Spec.pdf",
      name: "Spec.pdf",
      kind: "pdf"
    });
    expect(second).toMatchObject({
      path: "assets/Spec 1.pdf",
      name: "Spec 1.pdf",
      kind: "pdf"
    });
  });

  it("allocates unique paths from the create attempt when attach requests race", async () => {
    const source = join(tempDir, "race.png");
    await writeFile(source, new Uint8Array([7]));

    const results = await Promise.all([
      cli.run("para-zk:attach-file", { source }),
      cli.run("para-zk:attach-file", { source }),
      cli.run("para-zk:attach-file", { source })
    ]);

    expect(results.every((result) => result.ok === true)).toBe(true);
    expect(new Set(results.map((result) => result.path))).toEqual(
      new Set(["assets/race.png", "assets/race 1.png", "assets/race 2.png"])
    );
  });

  it("serializes allocation when the Obsidian runtime does not reject duplicate binary creates", async () => {
    const source = join(tempDir, "runtime-race.png");
    await writeFile(source, new Uint8Array([7]));
    const originalCreateBinary = cli.app.vault.createBinary;
    cli.app.vault.createBinary = async (path: string, content: ArrayBuffer) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const existing = cli.app.vault.getFileByPath(path);
      if (existing) return existing;
      return originalCreateBinary(path, content);
    };

    const results = await Promise.all([
      cli.run("para-zk:attach-file", { source }),
      cli.run("para-zk:attach-file", { source }),
      cli.run("para-zk:attach-file", { source })
    ]);

    expect(results.every((result) => result.ok === true)).toBe(true);
    expect(new Set(results.map((result) => result.path))).toEqual(
      new Set(["assets/runtime-race.png", "assets/runtime-race 1.png", "assets/runtime-race 2.png"])
    );
  });

  it("copies multiple explicit sources in one command", async () => {
    const image = join(tempDir, "one.png");
    const pdf = join(tempDir, "manual.pdf");
    await writeFile(image, new Uint8Array([8]));
    await writeFile(pdf, new Uint8Array([9, 10]));

    const result = await cli.run("para-zk:attach-file", {
      sources: JSON.stringify([image, pdf])
    });

    expect(result).toMatchObject({
      ok: true,
      count: 2
    });
    const files = result.files as Array<Record<string, unknown>>;
    expect(files.map((file) => file.path)).toEqual(["assets/one.png", "assets/manual.pdf"]);
    expect(files.map((file) => file.kind)).toEqual(["image", "pdf"]);
    expect(Array.from(cli.app.readBinaryPath("assets/manual.pdf") ?? [])).toEqual([9, 10]);
  });

  it("copies directory sources under an assets subfolder and preserves nested folders", async () => {
    const sourceDir = join(tempDir, "media");
    await mkdir(join(sourceDir, "nested"), { recursive: true });
    await writeFile(join(sourceDir, "a.png"), new Uint8Array([11]));
    await writeFile(join(sourceDir, "nested", "sound.mp3"), new Uint8Array([12]));

    const result = await cli.run("para-zk:attach-file", { source: sourceDir });

    expect(result).toMatchObject({
      ok: true,
      count: 2
    });
    const files = result.files as Array<Record<string, unknown>>;
    expect(files.map((file) => file.path)).toEqual([
      "assets/media/a.png",
      "assets/media/nested/sound.mp3"
    ]);
    expect(files.map((file) => file.kind)).toEqual(["image", "audio"]);
  });

  it("rejects custom names for directory sources", async () => {
    const sourceDir = join(tempDir, "folder");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, "file.txt"), "text");

    const result = await cli.run("para-zk:attach-file", { source: sourceDir, name: "Renamed" });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("name is only valid for a single file source");
  });

  it("rejects unsafe destination folders", async () => {
    const source = join(tempDir, "clip.mp4");
    await writeFile(source, new Uint8Array([6]));

    const result = await cli.run("para-zk:attach-file", { source, folder: "../assets" });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("folder must not contain . or .. path segments");
  });
});
