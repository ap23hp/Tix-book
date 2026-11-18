import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "@/components/ui/Modal";

// jsdom has no real showModal(); jest.setup.ts adds a small stand-in.
// These tests check our wiring (open prop ↔ <dialog>), not the browser's focus trap.

const onCloseSpy = jest.fn();

// A parent that owns the open state, like a real page would
function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Edit event
      </button>
      <p>Parent thinks: {open ? "open" : "closed"}</p>
      <Modal
        open={open}
        onClose={() => {
          onCloseSpy();
          setOpen(false);
        }}
        title="Discard changes?"
      >
        <button type="button" onClick={() => setOpen(false)}>
          Keep editing
        </button>
      </Modal>
    </>
  );
}

function dialog() {
  return document.querySelector("dialog") as HTMLDialogElement;
}

beforeEach(() => jest.clearAllMocks());

describe("Modal", () => {
  it("is closed while open is false", () => {
    render(<Page />);
    expect(dialog().open).toBe(false);
  });

  it("opens when open becomes true, named by its title", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));

    expect(dialog().open).toBe(true);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Discard changes?");
  });

  it("closes with Escape, tells the parent, and can be opened again", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));
    expect(dialog().open).toBe(true);

    // Escape: the browser closes the dialog itself...
    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(dialog().open).toBe(false);
    // ...and the parent's state follows (dialog → prop)
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Parent thinks: closed")).toBeInTheDocument();

    // Opening again works, because both sides agree it was closed (prop → dialog)
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));
    expect(dialog().open).toBe(true);
    expect(screen.getByText("Parent thinks: open")).toBeInTheDocument();
  });

  it("closes with the × button", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog().open).toBe(false);
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it("closes when the parent sets open to false, without calling onClose", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Edit event" }));

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(dialog().open).toBe(false);
    // The parent closed it, so there's nothing to report back
    expect(onCloseSpy).not.toHaveBeenCalled();
  });
});
