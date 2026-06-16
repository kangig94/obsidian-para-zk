---
title: PARA-ZK
---

PARA-ZK is a native Obsidian plugin for people who keep a private, local "second brain" with PARA, Zettelkasten, and an LLM-maintained wiki layer.

It turns a hand-built PARA + ZK vault into repeatable, plugin-owned workflows. The same workflow logic is exposed through three surfaces: the Obsidian GUI, a native CLI, and a thin MCP server. That means a person, a script, or an LLM can create and maintain the same vault without drifting into different rules.

## Why Use It

- Create projects, areas, resources, journal entries, retrospectives, and ZK notes from Obsidian commands or ribbon shortcuts.
- Keep frontmatter, references, tasks, backlinks, citations, and folder-style notes coherent without hand-editing YAML.
- Maintain `LLM-Wiki/` as a derived synthesis layer that cites canonical PARA/ZK/resource notes without making those notes depend on the wiki.
- Let automation and LLM clients discover the live vault surface through `para-zk:describe` instead of guessing file shapes.

## Quick Install

```text
BRAT -> Add beta plugin -> https://github.com/kangig94/obsidian-para-zk
```

Then enable **PARA-ZK** and run setup:

```bash
optsidian para-zk:setup installDeps=true
```

For manual installs, download `manifest.json`, `main.js`, and `styles.css` from the latest GitHub release. Local development checkouts should build first and install the generated `build/` folder.

> [!note]
> PARA-ZK is designed for one user's local Obsidian vault. It is not a publishing system or a collaborative workspace.

## Start Here

- [[installation|Install and set up the vault]]
- [[concepts|Learn the mental model]]
- [[features/para|Use PARA workflows]]
- [[features/zettelkasten|Use Zettelkasten workflows]]
- [[features/llm-wiki|Maintain the LLM-Wiki]]
- [[features/journal|Capture daily notes and memos]]
- [[cli|Drive PARA-ZK from the CLI]]
- [[mcp|Connect MCP clients]]
