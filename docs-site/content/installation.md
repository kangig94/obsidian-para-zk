---
title: Installation
---

PARA-ZK is installed from published release assets. You do not need to build the repo unless you are doing local development.

## Install With BRAT

Install the beta with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable BRAT from Obsidian community plugins.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter:

```text
https://github.com/kangig94/obsidian-para-zk
```

BRAT downloads the latest published release and keeps it updated. Enable **PARA-ZK** under **Settings -> Community plugins**.

## Install With Optsidian

If you use `optsidian`, install and enable PARA-ZK with:

```bash
optsidian plugin:install url=https://github.com/kangig94/obsidian-para-zk enable
```

Use `vault-path=<path>` to target a non-active vault.

## Manual Install

Download these files from the latest GitHub release:

```text
manifest.json
main.js
styles.css
```

Place them in:

```text
<vault>/.obsidian/plugins/para-zk/
```

Then open Obsidian and enable **PARA-ZK** under **Settings -> Community plugins**.

## Local Development

Build first, then install the generated deployment folder:

```bash
pnpm install
pnpm run build
optsidian plugin:install path=build enable
```

The repo root does not commit `main.js` or `styles.css`; release assets and `build/` are the deployable plugin shape.

## Set Up The Vault

After installing the plugin, run **PARA-ZK: Set up PARA-ZK vault** from the command palette.

Automation can run the same setup as:

```bash
optsidian para-zk:setup installDeps=true
```

Setup is idempotent. It creates or syncs the PARA/ZK layout, `LLM-Wiki/`, managed templates, dashboards, the vault guide, required Obsidian settings, and dependency configuration.

With `installDeps=true`, setup offers to install and enable the required community plugins:

- Dataview
- Tasks
- Folder Notes
- Update time on edit
- Trash Explorer
- Custom File Explorer sorting
- Homepage
- Open Tab Settings
- Remember cursor position

> [!tip]
> Re-run setup after plugin updates or locale changes. Managed files that PARA-ZK owns are refreshed when safe.

## Locale

English is the default locale.

For Korean generated labels, headings, and tags, pass:

```bash
optsidian para-zk:setup installDeps=true locale=ko
```

CLI and MCP values stay locale-neutral codes such as `status=in_progress` and `priority=high`; Obsidian renders localized labels in the vault.

## Next

Continue with [[concepts]] to understand how PARA-ZK organizes notes.
