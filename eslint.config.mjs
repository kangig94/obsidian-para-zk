import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["build/**", "clients/**", "node_modules/**"]
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      obsidianmd
    },
    rules: {
      "obsidianmd/prefer-create-el": "error",
      "obsidianmd/settings-tab/prefer-setting-definitions": "error"
    }
  }
];
