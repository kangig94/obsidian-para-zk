import { App, ButtonComponent, Modal, Setting, TextComponent } from "obsidian";
import { localePack } from "../i18n";
import type { Locale } from "../types";

export type SetupPromptOptions = {
  locale: Locale;
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

export type DistillPromptResult = { title: string; discard: boolean };

export function promptDistill(
  app: App,
  title: string,
  placeholder: string,
  initialValue: string,
  discardToggleLabel: string,
  confirmLabel: string,
  cancelLabel: string
): Promise<DistillPromptResult | null> {
  return new Promise((resolve) => {
    new DistillPromptModal(app, title, placeholder, initialValue, discardToggleLabel, confirmLabel, cancelLabel, resolve).open();
  });
}

export function confirmAction(
  app: App,
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, title, message, confirmLabel, cancelLabel, (value) => resolve(value === true)).open();
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
  private readonly resolve: (value: T | null) => void;
  private done = false;

  constructor(
    app: App,
    resolve: (value: T | null) => void
  ) {
    super(app);
    this.resolve = resolve;
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
  private readonly titleText: string;
  private readonly placeholder: string;
  private readonly initialValue: string;
  private readonly confirmLabel: string;
  private readonly cancelLabel: string;

  constructor(
    app: App,
    titleText: string,
    placeholder: string,
    initialValue: string,
    confirmLabel: string,
    cancelLabel: string,
    resolve: (value: string | null) => void
  ) {
    super(app, resolve);
    this.titleText = titleText;
    this.placeholder = placeholder;
    this.initialValue = initialValue;
    this.confirmLabel = confirmLabel;
    this.cancelLabel = cancelLabel;
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

class DistillPromptModal extends ResolvingModal<DistillPromptResult> {
  private readonly titleText: string;
  private readonly placeholder: string;
  private readonly initialValue: string;
  private readonly discardToggleLabel: string;
  private readonly confirmLabel: string;
  private readonly cancelLabel: string;
  private discard = false;

  constructor(
    app: App,
    titleText: string,
    placeholder: string,
    initialValue: string,
    discardToggleLabel: string,
    confirmLabel: string,
    cancelLabel: string,
    resolve: (value: DistillPromptResult | null) => void
  ) {
    super(app, resolve);
    this.titleText = titleText;
    this.placeholder = placeholder;
    this.initialValue = initialValue;
    this.discardToggleLabel = discardToggleLabel;
    this.confirmLabel = confirmLabel;
    this.cancelLabel = cancelLabel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.titleText });

    const input = new TextComponent(contentEl);
    input.inputEl.type = "text";
    input.inputEl.addClass("para-zk-prompt-input");
    input.setValue(this.initialValue).setPlaceholder(this.placeholder);
    input.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submit(input.getValue());
      }
    });
    input.inputEl.focus();
    input.inputEl.select();

    new Setting(contentEl)
      .setName(this.discardToggleLabel)
      .addToggle((toggle) => {
        toggle.setValue(this.discard).onChange((value) => {
          this.discard = value;
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(this.confirmLabel).setCta().onClick(() => this.submit(input.getValue()));
      })
      .addButton((button) => {
        button.setButtonText(this.cancelLabel).onClick(() => this.resolveAndClose(null));
      });
  }

  private submit(value: string): void {
    const title = value.trim();
    this.resolveAndClose(title ? { title, discard: this.discard } : null);
  }
}

class ConfirmModal extends ResolvingModal<boolean> {
  private readonly titleText: string;
  private readonly message: string;
  private readonly confirmLabel: string;
  private readonly cancelLabel: string;

  constructor(
    app: App,
    titleText: string,
    message: string,
    confirmLabel: string,
    cancelLabel: string,
    resolve: (value: boolean | null) => void
  ) {
    super(app, resolve);
    this.titleText = titleText;
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.cancelLabel = cancelLabel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.titleText });
    contentEl.createEl("p", { text: this.message });

    new Setting(contentEl)
      .addButton((button) => {
        markButtonDestructive(button.setButtonText(this.confirmLabel)).onClick(() => this.resolveAndClose(true));
      })
      .addButton((button) => {
        button.setButtonText(this.cancelLabel).onClick(() => this.resolveAndClose(false));
      });
  }
}

function markButtonDestructive(button: ButtonComponent): ButtonComponent {
  const destructive = (button as ButtonComponent & {
    setDestructive?: () => ButtonComponent;
  }).setDestructive;
  if (typeof destructive === "function") return destructive.call(button);
  button.buttonEl.addClass("mod-warning");
  return button;
}

class ChoiceModal extends ResolvingModal<string> {
  private readonly titleText: string;
  private readonly choices: Array<{ label: string; value: string }>;

  constructor(
    app: App,
    titleText: string,
    choices: Array<{ label: string; value: string }>,
    resolve: (value: string | null) => void
  ) {
    super(app, resolve);
    this.titleText = titleText;
    this.choices = choices;
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
