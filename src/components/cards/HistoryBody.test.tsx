import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryState } from "@/features/telemetry/useHistory";
import HistoryBody from "./HistoryBody";

afterEach(cleanup);

const renderBody = (state: HistoryState, empty = false, retry = vi.fn()) =>
  render(
    <HistoryBody state={state} retry={retry} empty={empty}>
      <p>CHART</p>
    </HistoryBody>,
  );

describe("HistoryBody", () => {
  it("shows a loading status while history is fetched", () => {
    renderBody({ status: "loading" });
    expect(screen.getByRole("status").textContent).toBe("LOADING HISTORY");
  });

  it("explains when the backend does not offer history", () => {
    renderBody({ status: "unavailable" });
    expect(screen.getByRole("status").textContent).toBe("HISTORY NOT AVAILABLE");
  });

  it("offers a retry on error", () => {
    const retry = vi.fn();
    renderBody({ status: "error" }, false, retry);
    expect(screen.getByRole("alert").textContent).toContain("HISTORY ERROR");
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows an empty message when the range has no points", () => {
    renderBody({ status: "ready", series: [] }, true);
    expect(screen.getByText("NO HISTORY IN RANGE")).toBeTruthy();
    expect(screen.queryByText("CHART")).toBeNull();
  });

  it("renders the children when ready with data", () => {
    renderBody({ status: "ready", series: [] });
    expect(screen.getByText("CHART")).toBeTruthy();
  });
});
