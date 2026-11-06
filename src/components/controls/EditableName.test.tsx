import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditableName from "./EditableName";

afterEach(cleanup);

const baseProps = {
  entityId: "light.kitchen_ceiling",
  shown: "Kitchen ceiling",
  label: "Kitchen ceiling",
  raw: "Kitchen ceiling",
  canRename: true,
};

function renderName(overrides: Partial<ComponentProps<typeof EditableName>> = {}) {
  const onRename = vi.fn(async () => true);
  render(<EditableName {...baseProps} onRename={onRename} textClassName="label-x" {...overrides} />);
  return { onRename };
}

const pencil = () => screen.getByRole("button", { name: "Rename Kitchen ceiling" });
const input = () => screen.getByRole("textbox", { name: "Name for light.kitchen_ceiling" }) as HTMLInputElement;

describe("EditableName", () => {
  it("shows the name as text, with the raw name as tooltip when it differs", () => {
    renderName({ shown: "Cocina", raw: "Kitchen ceiling" });
    const text = screen.getByText("Cocina");
    expect(text.getAttribute("title")).toBe("Kitchen ceiling (light.kitchen_ceiling)");
    expect(text.className).toContain("label-x");
  });

  it("has no tooltip when the shown name is the raw name", () => {
    renderName();
    expect(screen.getByText("Kitchen ceiling").getAttribute("title")).toBeNull();
  });

  it("hides the pencil when renaming is not available", () => {
    renderName({ canRename: false });
    expect(screen.queryByRole("button", { name: "Rename Kitchen ceiling" })).toBeNull();
  });

  it("opens the editor with the shown name selected and saves on Enter", async () => {
    const { onRename } = renderName();
    fireEvent.click(pencil());
    expect(input().value).toBe("Kitchen ceiling");
    expect(document.activeElement).toBe(input());

    fireEvent.change(input(), { target: { value: "Cocina" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("Cocina");
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(document.activeElement).toBe(pencil());
  });

  it("cancels on Escape without saving", () => {
    const { onRename } = renderName();
    fireEvent.click(pencil());
    fireEvent.change(input(), { target: { value: "Nope" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cancels on blur without returning focus", () => {
    const { onRename } = renderName();
    fireEvent.click(pencil());
    fireEvent.blur(input());
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("ignores other keys", () => {
    const { onRename } = renderName();
    fireEvent.click(pencil());
    fireEvent.keyDown(input(), { key: "a" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("shows SENDING and locks the input while the save is pending, and ignores a second Enter", async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const onRename = vi.fn(() => new Promise<boolean>((ok) => (finish = ok)));
    render(<EditableName {...baseProps} onRename={onRename} />);
    fireEvent.click(pencil());

    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByText("SENDING")).toBeTruthy();
    expect(input().disabled).toBe(true);

    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.keyDown(input(), { key: "Escape" });
    fireEvent.blur(input());
    expect(onRename).toHaveBeenCalledOnce();

    await act(async () => finish(true));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("shows the edit hint while editing", () => {
    renderName();
    fireEvent.click(pencil());
    expect(screen.getByText("ENTER SAVE • ESC CANCEL • EMPTY RESETS")).toBeTruthy();
  });
});
