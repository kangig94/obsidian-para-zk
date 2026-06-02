import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node"
  },
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./test/mocks/obsidian.ts", import.meta.url))
    }
  }
});
