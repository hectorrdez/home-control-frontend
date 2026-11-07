import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Page from "./Page";

vi.mock("./Header", () => ({ default: () => null }));

afterEach(cleanup);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Page />}>
          <Route path="/" element={<p>home</p>} />
          <Route path="/telemetry" element={<p>telemetry</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByRole("main").parentElement as HTMLElement;
}

describe("Page", () => {
  it("fits the viewport on home so only the device list scrolls", () => {
    const shell = renderAt("/");
    expect(shell.className).toContain("h-dvh");
    expect(shell.className).toContain("overflow-hidden");
    expect(shell.className).not.toContain("min-h-screen");
    expect(screen.getByRole("main").className).toContain("min-h-0");
  });

  it("keeps normal page scroll on telemetry", () => {
    const shell = renderAt("/telemetry");
    expect(shell.className).toContain("min-h-screen");
    expect(shell.className).not.toContain("overflow-hidden");
    expect(shell.className).not.toContain("h-dvh");
    expect(screen.getByRole("main").className).not.toContain("min-h-0");
  });
});
