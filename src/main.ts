import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  TextComponent
} from "obsidian";

type CliArgs = Record<string, unknown>;

type CliOptionSpec = {
  value?: string;
  description: string;
};

type CliCapablePlugin = Plugin & {
  registerCliHandler?: (
    command: string,
    description: string,
    options: Record<string, CliOptionSpec>,
    handler: (args?: CliArgs) => string | Promise<string>
  ) => void;
};

type ParaZkSettings = {
  layoutFolders: string[];
  fleetingFolder: string;
};

type InitResult = {
  created: string[];
  existing: string[];
};

type CreateNoteResult = {
  path: string;
  title: string;
};

const DEFAULT_SETTINGS: ParaZkSettings = {
  layoutFolders: [
    "Projects",
    "Areas",
    "Resources",
    "Archives",
    "Zettelkasten",
    "Zettelkasten/Fleeting",
    "Zettelkasten/Literature",
    "Zettelkasten/Permanent"
  ],
  fleetingFolder: "Zettelkasten/Fleeting"
};

export default class ParaZkPlugin extends Plugin {
  settings: ParaZkSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "check-status",
      name: "Check plugin status",
      callback: () => {
        new Notice("PARA-ZK plugin loaded");
      }
    });

    this.addCommand({
      id: "initialize-vault-layout",
      name: "Initialize vault layout",
      callback: async () => {
        const result = await this.initializeVaultLayout();
        new Notice(`PARA-ZK layout ready: ${result.created.length} created, ${result.existing.length} existing`);
      }
    });

    this.addCommand({
      id: "create-fleeting-note",
      name: "Create fleeting note",
      callback: () => {
        new TitlePromptModal(this.app, async (title) => {
          const result = await this.createFleetingNote(title);
          const file = this.app.vault.getAbstractFileByPath(result.path);
          if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
          }
          new Notice(`Created ${result.path}`);
        }).open();
      }
    });

    this.addSettingTab(new ParaZkSettingTab(this.app, this));
    this.registerNativeCliHandlers();
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData())
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async initializeVaultLayout(): Promise<InitResult> {
    const result: InitResult = { created: [], existing: [] };
    for (const folder of this.settings.layoutFolders) {
      const normalized = normalizeVaultPath(folder);
      if (!normalized) continue;
      const created = await this.ensureFolder(normalized);
      if (created) result.created.push(normalized);
      else result.existing.push(normalized);
    }
    return result;
  }

  async createFleetingNote(title: string, folder = this.settings.fleetingFolder): Promise<CreateNoteResult> {
    const normalizedFolder = normalizeVaultPath(folder) || DEFAULT_SETTINGS.fleetingFolder;
    await this.ensureFolder(normalizedFolder);

    const displayTitle = title.trim() || `Fleeting ${timestampForTitle(new Date())}`;
    const path = await this.nextAvailableNotePath(normalizedFolder, displayTitle);
    await this.app.vault.create(path, renderFleetingNote(displayTitle));
    return { path, title: displayTitle };
  }

  private registerNativeCliHandlers(): void {
    const plugin = this as CliCapablePlugin;
    if (!plugin.registerCliHandler) return;

    plugin.registerCliHandler(
      "para-zk:ping",
      "Check that the PARA-ZK native CLI handler is loaded",
      {
        format: { value: "<text|json>", description: "Output format (default: text)" }
      },
      async (args = {}) => this.renderCli(args, {
        ok: true,
        command: "para-zk:ping",
        pluginId: this.manifest.id,
        message: "pong"
      }, "pong")
    );

    plugin.registerCliHandler(
      "para-zk:init",
      "Initialize the PARA-ZK vault layout",
      {
        format: { value: "<text|json>", description: "Output format (default: text)" }
      },
      async (args = {}) => {
        const result = await this.initializeVaultLayout();
        return this.renderCli(args, {
          ok: true,
          command: "para-zk:init",
          ...result
        }, `layout ready: ${result.created.length} created, ${result.existing.length} existing`);
      }
    );

    plugin.registerCliHandler(
      "para-zk:create",
      "Create a fleeting Zettelkasten note",
      {
        title: { value: "<text>", description: "Note title. Defaults to a timestamped title." },
        folder: { value: "<path>", description: "Vault-relative destination folder." },
        format: { value: "<text|json>", description: "Output format (default: text)" }
      },
      async (args = {}) => {
        const result = await this.createFleetingNote(readCliString(args, "title") ?? "", readCliString(args, "folder") ?? this.settings.fleetingFolder);
        return this.renderCli(args, {
          ok: true,
          command: "para-zk:create",
          ...result
        }, result.path);
      }
    );
  }

  private renderCli(args: CliArgs, payload: Record<string, unknown>, text: string): string {
    return readCliString(args, "format") === "json" ? JSON.stringify(payload) : text;
  }

  private async ensureFolder(folder: string): Promise<boolean> {
    const parts = folder.split("/").filter(Boolean);
    let current = "";
    let created = false;

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) {
        throw new Error(`Cannot create folder because a file already exists at ${current}`);
      }
      await this.app.vault.createFolder(current);
      created = true;
    }

    return created;
  }

  private async nextAvailableNotePath(folder: string, title: string): Promise<string> {
    const base = sanitizeFileName(title) || `Fleeting ${timestampForTitle(new Date())}`;
    let candidate = `${folder}/${base}.md`;
    let suffix = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${folder}/${base} ${suffix}.md`;
      suffix += 1;
    }
    return candidate;
  }
}

class TitlePromptModal extends Modal {
  private input?: TextComponent;

  constructor(app: App, private readonly onSubmit: (title: string) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create fleeting note" });

    new Setting(contentEl)
      .setName("Title")
      .addText((text) => {
        this.input = text;
        text.setPlaceholder("Draft idea");
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void this.submit();
          }
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("Create")
          .setCta()
          .onClick(() => void this.submit());
      });

    this.input?.inputEl.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    const title = this.input?.getValue() ?? "";
    this.close();
    await this.onSubmit(title);
  }
}

class ParaZkSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ParaZkPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "PARA-ZK" });
    containerEl.createEl("p", {
      cls: "para-zk-setting-note",
      text: "Configure the folders used by the initial PARA-ZK layout and quick note creation."
    });

    new Setting(containerEl)
      .setName("Layout folders")
      .setDesc("One vault-relative folder per line.")
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.layoutFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.layoutFolders = value
              .split(/\r?\n/)
              .map(normalizeVaultPath)
              .filter((folder) => folder.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 8;
      });

    new Setting(containerEl)
      .setName("Fleeting note folder")
      .setDesc("Vault-relative destination for quick fleeting notes.")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.fleetingFolder)
          .onChange(async (value) => {
            this.plugin.settings.fleetingFolder = normalizeVaultPath(value) || DEFAULT_SETTINGS.fleetingFolder;
            await this.plugin.saveSettings();
          });
      });
  }
}

function readCliString(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeVaultPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function renderFleetingNote(title: string): string {
  const created = new Date().toISOString();
  return [
    "---",
    "type: zettel",
    "status: fleeting",
    `created: ${created}`,
    "tags:",
    "  - zettel/fleeting",
    "---",
    "",
    `# ${title}`,
    "",
    ""
  ].join("\n");
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

function timestampForTitle(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "")
    .replace("T", "-");
}
