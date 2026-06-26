// Props sits inside Obsidian's note header (`.mod-header`) so Reading view's virtual
// renderer accounts for its height in the header section when scrolling. The header is the
// only stable home: Reading view recycles its sections (header included) in and out of the
// DOM while scrolling, so when the header is gone the panel is detached and left waiting.
// Re-attaching it as a bare `.markdown-preview-sizer` child instead would place unaccounted
// height above the viewport that Obsidian strips and we re-add on every scroll tick.
export function placeReadingPropsPanel(container: HTMLElement, propsEl: HTMLElement): void {
  const header = container.querySelector<HTMLElement>(":scope > .mod-header");
  if (!header) {
    propsEl.remove();
    return;
  }
  if (header.lastElementChild !== propsEl) header.appendChild(propsEl);
}

// Managed sits at the bottom of the note: inside Obsidian's footer (`.mod-footer`) when it
// is rendered, otherwise as the last sizer child. Unlike props it must NOT be detached when
// the footer is recycled away; its Dataview views only populate while attached to live DOM.
export function placeReadingManagedPanel(container: HTMLElement, managedEl: HTMLElement): void {
  const footer = container.querySelector<HTMLElement>(":scope > .mod-footer");
  if (footer) {
    if (footer.firstElementChild !== managedEl) footer.prepend(managedEl);
    return;
  }
  if (container.lastElementChild !== managedEl) container.appendChild(managedEl);
}
