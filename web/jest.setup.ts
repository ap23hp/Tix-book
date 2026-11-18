// Adds matchers like toBeInTheDocument() to expect()
import "@testing-library/jest-dom";

// jsdom has <dialog> and its `open` property, but not showModal() or close(),
// and pressing Escape does nothing. This stand-in copies only the parts our
// Modal relies on: open/close, the "close" event, and Escape → "cancel" → close.
// It does NOT copy the focus trap or focus return; check those in a real browser.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };

  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const dialogs =
      document.querySelectorAll<HTMLDialogElement>("dialog[open]");
    const top = dialogs[dialogs.length - 1];
    if (!top) return;
    // Like the browser: "cancel" first (can be prevented), then close
    const cancel = new Event("cancel", { cancelable: true });
    if (top.dispatchEvent(cancel)) top.close();
  });
}
