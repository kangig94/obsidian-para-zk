import { describe, expect, it } from "vitest";
import type { PluginManifest } from "obsidian";
import { fundingLinks } from "../../src/ux/settings";

function manifest(fundingUrl?: unknown): PluginManifest {
  return {
    id: "para-zk",
    name: "Para-ZK",
    version: "0.0.0",
    minAppVersion: "1.0.0",
    description: "",
    author: "kangig94",
    ...(fundingUrl === undefined ? {} : { fundingUrl })
  } as unknown as PluginManifest;
}

describe("fundingLinks", () => {
  it("derives GitHub Sponsors and Buy Me a Coffee URLs from the funding handle", () => {
    expect(fundingLinks(manifest("https://github.com/sponsors/kangig94"))).toEqual({
      githubSponsors: "https://github.com/sponsors/kangig94",
      buyMeACoffee: "https://www.buymeacoffee.com/kangig94"
    });
  });

  it("returns null when no fundingUrl is configured", () => {
    expect(fundingLinks(manifest())).toBeNull();
  });

  it("returns null for a non-string fundingUrl", () => {
    expect(fundingLinks(manifest({ "GitHub Sponsors": "https://github.com/sponsors/kangig94" }))).toBeNull();
  });
});
