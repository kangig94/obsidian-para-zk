import { App, Modal, Setting } from "obsidian";

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

    const inputEl = contentEl.createEl("input", {
      cls: "para-zk-prompt-input",
      type: "text",
      value: this.initialValue
    });
    inputEl.placeholder = this.placeholder;

    inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submit(inputEl.value);
      }
    });
    inputEl.focus();
    inputEl.select();

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(() => this.submit(inputEl.value));
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
      const button = rows.createEl("button", {
        cls: "para-zk-choice-button",
        text: choice.label
      });
      button.addEventListener("click", () => this.submit(choice.value));
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
