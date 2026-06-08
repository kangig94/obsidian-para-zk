import { ButtonComponent, DropdownComponent } from "obsidian";

type BlockShellOptions = {
  kind: string;
  title?: string;
  summary?: string;
  renderActions?: (actions: HTMLElement) => void;
};

type BlockShell = {
  root: HTMLElement;
  toolbar?: HTMLElement;
  summaryEl?: HTMLElement;
  body: HTMLElement;
};

type ShellSelectOptions<TValue extends string> = {
  label: string;
  value: TValue;
  options: Array<{ value: TValue; label: string }>;
  onChange: (value: TValue) => void;
};

type ShellActionOptions = {
  label: string;
  icon?: string;
  cta?: boolean;
  variant?: string;
  onClick: (button: HTMLButtonElement, component: ButtonComponent) => void | Promise<void>;
};

export function renderBlockShell(el: HTMLElement, options: BlockShellOptions): BlockShell {
  applyBlockKind(el, options.kind);

  const titleText = options.title?.trim();
  const summaryText = options.summary?.trim();
  const hasLead = Boolean(titleText || summaryText);
  const hasActions = Boolean(options.renderActions);
  let toolbar: HTMLElement | undefined;
  let summaryEl: HTMLElement | undefined;

  if (hasLead || hasActions) {
    toolbar = el.createDiv({ cls: "para-zk-block__toolbar" });
    if (hasLead) {
      const lead = toolbar.createDiv({ cls: "para-zk-block__lead" });
      if (titleText) lead.createDiv({ cls: "para-zk-block__title", text: titleText });
      if (summaryText) {
        summaryEl = lead.createDiv({ cls: "para-zk-block__summary", text: summaryText });
      }
    }
    if (hasActions) {
      const actions = toolbar.createDiv({ cls: "para-zk-block__actions" });
      options.renderActions?.(actions);
    }
  }

  const body = el.createDiv({ cls: "para-zk-block__body" });
  return { root: el, toolbar, summaryEl, body };
}

export function renderShellSelect<TValue extends string>(
  actions: HTMLElement,
  options: ShellSelectOptions<TValue>
): HTMLElement {
  const wrap = actions.createDiv({ cls: "para-zk-block__select" });
  const dropdown = new DropdownComponent(wrap);
  dropdown.selectEl.setAttr("aria-label", options.label);
  dropdown.selectEl.setAttr("title", options.label);
  for (const item of options.options) {
    dropdown.addOption(item.value, item.label);
  }
  dropdown
    .setValue(options.value)
    .onChange((value) => options.onChange(value as TValue));
  return wrap;
}

export function renderShellAction(actions: HTMLElement, options: ShellActionOptions): ButtonComponent {
  const component = new ButtonComponent(actions);
  const button = component.buttonEl;
  button.addClass("para-zk-block__action");
  button.setAttr("aria-label", options.label);
  if (options.variant) button.addClass(`is-${options.variant}`);
  if (options.icon) component.setIcon(options.icon);
  component
    .setButtonText(options.label)
    .setTooltip(options.label);
  if (options.cta) {
    button.addClass("mod-cta");
    component.setCta();
  }
  component.onClick(() => {
    void options.onClick(button, component);
  });
  return component;
}

export function renderBlockEmpty(body: HTMLElement, text: string): HTMLElement {
  return body.createDiv({ cls: "para-zk-block__empty", text });
}

export function renderBlockNotice(el: HTMLElement, kind: string, text: string): HTMLElement {
  el.empty();
  applyBlockKind(el, kind);
  return el.createDiv({ cls: "para-zk-block__notice", text });
}

// Strip any stale --<kind> modifier before applying the new one (el is reused across re-renders).
export function applyBlockKind(el: HTMLElement, kind: string): void {
  el.addClass("para-zk-block");
  for (const className of Array.from(el.classList)) {
    if (className.startsWith("para-zk-block--")) el.removeClass(className);
  }

  const normalized = blockKindName(kind);
  if (normalized.startsWith("view-")) el.addClass("para-zk-block--view");
  el.addClass(`para-zk-block--${normalized}`);
}

function blockKindName(kind: string): string {
  const normalized = kind.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}
