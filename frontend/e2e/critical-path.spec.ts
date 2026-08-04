import { expect, test } from "@playwright/test";
import {
  ADDRESS_1,
  ADDRESS_2,
  HOUSING_ADDRESS,
  RESOLVED_1,
  RESOLVED_2,
  RESOLVED_HOUSING,
  installApiMocks,
} from "./mocks";

const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

test.skip(
  !EMAIL || !PASSWORD,
  "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set — see README's \"Tests e2e\" section for one-time setup"
);

test("login, compute a shared zone, and test a candidate housing address", async ({ page }) => {
  await installApiMocks(page);

  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Mot de passe").fill(PASSWORD!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/app$/);

  await page.getByLabel("Lieu de travail 1").fill(ADDRESS_1);
  await page.getByLabel("Lieu de travail 2").fill(ADDRESS_2);
  await page.getByLabel("Temps de trajet max").fill("30");

  // handleWorkplaceSubmit sets work1/work2 (which enables HousingForm) BEFORE
  // it awaits the real Supabase `workplaces` upsert, and only sets
  // `intersection` (which buildHousingMarker's in-zone check depends on)
  // AFTER that upsert resolves. Waiting for the upsert's response here,
  // wrapped with the click to avoid missing it, is what makes the later
  // "Dans la zone" assertion deterministic instead of a race.
  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes("/rest/v1/workplaces")),
    page.getByRole("button", { name: "Calculer la zone" }).click(),
  ]);

  await expect(page.getByText(RESOLVED_1)).toBeVisible();
  await expect(page.getByText(RESOLVED_2)).toBeVisible();

  await page.getByLabel("Adresse d'un logement à tester").fill(HOUSING_ADDRESS);
  await page.getByRole("button", { name: "Tester ce logement" }).click();

  await expect(page.getByText(RESOLVED_HOUSING)).toBeVisible();
  await expect(page.getByText("Dans la zone")).toBeVisible();
  await expect(page.getByText("Lieu 1 : 12 min · Lieu 2 : 18 min")).toBeVisible();
});
