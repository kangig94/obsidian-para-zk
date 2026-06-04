import { App, ButtonComponent, Modal, Setting, TextComponent } from "obsidian";
import { localePack } from "../i18n";
import type { Locale } from "../types";

export type SetupPromptOptions = {
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

export function promptSetupOptions(
  app: App,
  initial: SetupPromptOptions
): Promise<SetupPromptOptions | null> {
  return new Promise((resolve) => {
    new SetupOptionsModal(app, initial, resolve).open();
  });
}

class ResolvingModal<T> extends Modal {
  private done = false;

  constructor(
    app: App,
    private readonly resolve: (value: T | null) => void
  ) {
    super(app);
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolveOnce(null);
  }

  protected resolveAndClose(value: T | null): void {
    if (!this.resolveOnce(value)) return;
    this.close();
  }

  private resolveOnce(value: T | null): boolean {
    if (this.done) return false;
    this.done = true;
    this.resolve(value);
    return true;
  }
}

class TextPromptModal extends ResolvingModal<string> {
  constructor(
    app: App,
    private readonly titleText: string,
    private readonly placeholder: string,
    private readonly initialValue: string,
    private readonly confirmLabel: string,
    private readonly cancelLabel: string,
    resolve: (value: string | null) => void
  ) {
    super(app, resolve);
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

  private submit(value: string): void {
    this.resolveAndClose(value.trim() || null);
  }

  private cancel(): void {
    this.resolveAndClose(null);
  }
}

class SetupOptionsModal extends ResolvingModal<SetupPromptOptions> {
  private value: SetupPromptOptions;

  constructor(
    app: App,
    initial: SetupPromptOptions,
    resolve: (value: SetupPromptOptions | null) => void
  ) {
    super(app, resolve);
    this.value = { ...initial };
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    const labels = localePack(this.value.locale).labels;
    contentEl.empty();
    contentEl.createEl("h2", { text: labels.setupCommandName });

    new Setting(contentEl)
      .setName(labels.locale)
      .setDesc(labels.setupLocaleDesc)
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
      .setName(labels.setupForce)
      .setDesc(labels.setupForceDesc)
      .addToggle((toggle) => {
        toggle
          .setValue(this.value.force)
          .onChange((value) => {
            this.value.force = value;
          });
      });

    new Setting(contentEl)
      .setName(labels.setupInstallDeps)
      .setDesc(labels.setupInstallDepsDesc)
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

  private submit(): void {
    this.resolveAndClose({ ...this.value });
  }

  private cancel(): void {
    this.resolveAndClose(null);
  }
}

class ChoiceModal extends ResolvingModal<string> {
  constructor(
    app: App,
    private readonly titleText: string,
    private readonly choices: Array<{ label: string; value: string }>,
    resolve: (value: string | null) => void
  ) {
    super(app, resolve);
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

  private submit(value: string): void {
    this.resolveAndClose(value);
  }
}
