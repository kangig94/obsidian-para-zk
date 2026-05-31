import { App, ButtonComponent, Modal, Setting, TextComponent } from "obsidian";
import { localePack } from "../i18n";
import type { Locale } from "../types";

export type InitPromptOptions = {
  locale: Locale;
  force: boolean;
  installDeps: boolean;
};

export function promptText(
  app: App,
  title: string,
  placeholder: string,
  initialValue: string,
  confirmLabel: string,
  cancelLabel: string
): Promise<string | null> {
  return new Promise((resolve) => {
    new TextPromptModal(app, title, placeholder, initialValue, confirmLabel, cancelLabel, resolve).open();
  });
}

export function chooseValue(app: App, title: string, choices: Array<{ label: string; value: string }>): Promise<string | null> {
  return new Promise((resolve) => {
    new ChoiceModal(app, title, choices, resolve).open();
  });
}

export function promptInitOptions(
  app: App,
  initial: InitPromptOptions
): Promise<InitPromptOptions | null> {
  return new Promise((resolve) => {
    new InitOptionsModal(app, initial, resolve).open();
  });
}

class TextPromptModal extends Modal {
  private done = false;

  constructor(
    app: App,
    private readonly titleText: string,
    private readonly placeholder: string,
    private readonly initialValue: string,
    private readonly confirmLabel: string,
    private readonly cancelLabel: string,
    private readonly resolve: (value: string | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.titleText });

    const input = new TextComponent(contentEl);
    input.inputEl.type = "text";
    input.inputEl.addClass("para-zk-prompt-input");
    input
      .setValue(this.initialValue)
      .setPlaceholder(this.placeholder);

    input.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submit(input.getValue());
      }
    });
    input.inputEl.focus();
    input.inputEl.select();

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(() => this.submit(input.getValue()));
      })
      .addButton((button) => {
        button
          .setButtonText(this.cancelLabel)
          .onClick(() => this.cancel());
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.done) {
      this.done = true;
      this.resolve(null);
    }
  }

  private submit(value: string): void {
    if (this.done) return;
    this.done = true;
    this.resolve(value.trim() || null);
    this.close();
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.resolve(null);
    this.close();
  }
}

class InitOptionsModal extends Modal {
  private done = false;
  private value: InitPromptOptions;

  constructor(
    app: App,
    initial: InitPromptOptions,
    private readonly resolve: (value: InitPromptOptions | null) => void
  ) {
    super(app);
    this.value = { ...initial };
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    const labels = localePack(this.value.locale).labels;
    contentEl.empty();
    contentEl.createEl("h2", { text: labels.initCommandName });

    new Setting(contentEl)
      .setName(labels.locale)
      .setDesc(labels.initLocaleDesc)
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ko", "ko")
          .addOption("en", "en")
          .setValue(this.value.locale)
          .onChange((value) => {
            this.value.locale = value === "en" ? "en" : "ko";
            this.render();
          });
      });

    new Setting(contentEl)
      .setName(labels.initForce)
      .setDesc(labels.initForceDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.value.force)
          .onChange((value) => {
            this.value.force = value;
          });
      });

    new Setting(contentEl)
      .setName(labels.initInstallDeps)
      .setDesc(labels.initInstallDepsDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.value.installDeps)
          .onChange((value) => {
            this.value.installDeps = value;
          });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(labels.confirm)
          .setCta()
          .onClick(() => this.submit());
      })
      .addButton((button) => {
        button
          .setButtonText(labels.cancel)
          .onClick(() => this.cancel());
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.done) {
      this.done = true;
      this.resolve(null);
    }
  }

  private submit(): void {
    if (this.done) return;
    this.done = true;
    this.resolve({ ...this.value });
    this.close();
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.resolve(null);
    this.close();
  }
}

class ChoiceModal extends Modal {
  private done = false;

  constructor(
    app: App,
    private readonly titleText: string,
    private readonly choices: Array<{ label: string; value: string }>,
    private readonly resolve: (value: string | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.titleText });
    const rows = contentEl.createDiv({ cls: "para-zk-choice-list" });

    for (const choice of this.choices) {
      const button = new ButtonComponent(rows);
      button.buttonEl.addClass("para-zk-choice-button");
      button
        .setButtonText(choice.label)
        .onClick(() => this.submit(choice.value));
    }
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.done) {
      this.done = true;
      this.resolve(null);
    }
  }

  private submit(value: string): void {
    if (this.done) return;
    this.done = true;
    this.resolve(value);
    this.close();
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.resolve(null);
    this.close();
  }
}
