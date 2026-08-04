import { expect, test } from "@playwright/test";

test("the landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/The Good Spot/);
});
