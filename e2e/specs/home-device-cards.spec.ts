import { expect, test } from "@playwright/test";
import { HomePage } from "../pages/home";

test("device cards remain visible at mobile and desktop widths", async ({ page }) => {
  const home = new HomePage(page);
  await home.open();

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(home.deck.modules().first()).toBeVisible();
  }
});

test("reduced motion disables device card entrance", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const home = new HomePage(page);
  await home.open();

  await expect(home.deck.modules().first()).toBeVisible();
  await expect(home.deck.modules().first()).toHaveCSS("animation-name", "none");
});

test("entrance remains staggered past the sixth card", async ({ page }) => {
  const home = new HomePage(page);
  await home.open();

  await expect(home.deck.modules()).toHaveCount(26);
  const sixthDelay = await home.deck.modules().nth(5).evaluate((card) => parseFloat(getComputedStyle(card).animationDelay));
  const seventhDelay = await home.deck.modules().nth(6).evaluate((card) => parseFloat(getComputedStyle(card).animationDelay));
  expect(seventhDelay).toBeGreaterThan(sixthDelay);
});
