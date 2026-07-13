// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingWizard } from "./onboarding-wizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: () => Promise.resolve({ error: null }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

afterEach(cleanup);

describe("OnboardingWizard step 3 (points of interest)", () => {
  it("never disables PoiFilters, unlike the /app usage gated on a computed zone", async () => {
    render(<OnboardingWizard userId="u1" />);

    fireEvent.change(screen.getByLabelText("Prénom"), { target: { value: "Jamie" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Vos deux lieux de travail");

    fireEvent.change(screen.getByLabelText("Lieu de travail 1"), { target: { value: "1 rue A" } });
    fireEvent.change(screen.getByLabelText("Lieu de travail 2"), { target: { value: "2 rue B" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculer la zone" }));
    await screen.findByText("Vos centres d'intérêt");

    const poiButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.hasAttribute("aria-pressed"));
    expect(poiButtons.length).toBeGreaterThan(0);
    for (const button of poiButtons) {
      expect(button.hasAttribute("disabled")).toBe(false);
    }
  });
});
