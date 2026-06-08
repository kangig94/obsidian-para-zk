---
title: Installation
---

PARA-ZK ships with prebuilt plugin files. You do not need to build the repo before installing it into an Obsidian vault.

## Install With Optsidian

If you have `optsidian` installed, install and enable PARA-ZK in one command:

```bash
optsidian plugin:install url=https://github.com/kangig94/obsidian-para-zk enable
```

This installs the committed plugin artifacts into:

```text
<vault>/.obsidian/plugins/para-zk/
```

Use `vault-path=<path>` to target a non-active vault, or `ref=<git-ref>` to pin a version.

## Manual Install

Copy these files from the repo root:

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

## Set Up The Vault

After installing the plugin, run **PARA-ZK: Set up PARA-ZK vault** from the command palette.

Automation can run the same setup as:

```bash
optsidian para-zk:setup installDeps=true
```

Setup is idempotent. It creates or syncs the PARA/ZK layout, managed templates, dashboards, the vault guide, and required Obsidian settings.

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
