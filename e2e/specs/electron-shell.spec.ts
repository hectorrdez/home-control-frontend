import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

// Smoke test for the desktop shell (feature 107): the real main process against the Vite mock server.
const MAIN = join(process.cwd(), "electron", "main.cjs");
const PANEL = "http://localhost:5174/?mock=default";

function launchOptions(panelUrl: string) {
  return {
    args: [MAIN],
    env: {
      ...process.env,
      HC_PANEL_URL: panelUrl,
      // Isolated userData so window state and the single-instance lock do not touch a real install.
      HC_DATA_DIR: mkdtempSync(join(tmpdir(), "hc-electron-")),
    },
  };
}

test.describe("electron shell", () => {
  test("opens the panel with Node not exposed to the page", async () => {
    const app = await electron.launch(launchOptions(PANEL));
    try {
      const win = await app.firstWindow();
      await expect(win).toHaveURL(/localhost:5174/);
      await expect(win.getByRole("banner")).toBeVisible();
      const exposed = await win.evaluate(() => ({
        require: typeof (globalThis as { require?: unknown }).require,
        process: typeof (globalThis as { process?: unknown }).process,
      }));
      expect(exposed).toEqual({ require: "undefined", process: "undefined" });
    } finally {
      await app.close();
    }
  });

  test("shows the offline page with retry when the panel is unreachable", async () => {
    const app = await electron.launch(launchOptions("http://127.0.0.1:9/"));
    try {
      const win = await app.firstWindow();
      await expect(win.getByRole("heading", { name: "Panel unreachable" })).toBeVisible();
      await expect(win.getByRole("button", { name: "Retry" })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
