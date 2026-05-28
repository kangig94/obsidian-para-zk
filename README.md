# PARA-ZK

Native Obsidian plugin for PARA and Zettelkasten workflows.

When Obsidian is running, the plugin can expose native CLI handlers through Obsidian's own CLI.

## Commands

GUI commands:

- `PARA-ZK: Initialize vault layout`
- `PARA-ZK: Create fleeting note`
- `PARA-ZK: Check plugin status`

Native CLI handlers, when supported by the running Obsidian app:

```bash
obsidian para-zk:ping format=json
obsidian para-zk:init format=json
obsidian para-zk:create title="Draft idea" format=json
```

## Development

```bash
npm install
npm run build
```

The build writes `main.js` at the repository root because Obsidian plugins are installed from `manifest.json`, `main.js`, and optional `styles.css`.

It also writes a clean install artifact to `dist/obsidian-plugin`. Copy that directory to:

```text
<vault>/.obsidian/plugins/para-zk
```
