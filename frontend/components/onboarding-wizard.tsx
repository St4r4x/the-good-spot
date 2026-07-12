"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PoiFilters } from "@/components/poi-filters";
import { WorkplaceForm } from "@/components/workplace-form";
import type { PoiGroup, TravelMode } from "@/lib/api";
import { profileToUpsert } from "@/lib/profile";
import { supabase } from "@/lib/supabase/client";
import { savedToWorkplacesUpsert } from "@/lib/sync";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type OnboardingWizardProps = {
  userId: string;
};

const TOTAL_STEPS = 3;

export function OnboardingWizard({ userId }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [poiGroups, setPoiGroups] = useState<PoiGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return;
    setError(null);
    setIsSaving(true);
    const { error } = await supabase!
      .from("profiles")
      .upsert(profileToUpsert({ firstName: firstName.trim(), lastName: lastName.trim() || null }, userId));
    setIsSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep(2);
  }

  async function handleWorkplacesSubmit(
    address1: string,
    address2: string,
    minutes: number,
    modes: TravelMode[]
  ) {
    setError(null);
    setIsSaving(true);
    const { error } = await supabase!
      .from("workplaces")
      .upsert(savedToWorkplacesUpsert({ address1, address2, minutes: String(minutes), modes }, userId));
    setIsSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep(3);
  }

  async function finish(groups: PoiGroup[]) {
    setError(null);
    setIsSaving(true);
    const { error } = await supabase!
      .from("workplaces")
      .update({ default_poi_groups: groups })
      .eq("user_id", userId);
    setIsSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/app");
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            aria-label="Étape précédente"
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
          </button>
        )}
        <span className="text-xs font-medium text-muted-foreground">
          Étape {step}/{TOTAL_STEPS}
        </span>
      </div>

      {step === 1 && (
        <form onSubmit={handleProfileSubmit} className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold text-foreground">Comment vous appelez-vous ?</h1>
          <p className="text-sm text-muted-foreground">
            On personnalise votre espace dès maintenant.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="first-name">Prénom</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last-name">Nom (optionnel)</Label>
            <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={isSaving || !firstName.trim()}>
            {isSaving ? "…" : "Continuer"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold text-foreground">Vos deux lieux de travail</h1>
          <p className="text-sm text-muted-foreground">
            On calculera votre zone commune une fois sur la carte.
          </p>
          <WorkplaceForm
            onSubmit={handleWorkplacesSubmit}
            isLoading={isSaving}
            resolved1={null}
            resolved2={null}
            error={error}
          />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold text-foreground">Vos centres d&apos;intérêt</h1>
          <p className="text-sm text-muted-foreground">
            Pour repérer d&apos;un coup d&apos;œil ce qui compte pour vous près d&apos;un logement.
          </p>
          <PoiFilters selected={poiGroups} onChange={setPoiGroups} disabled={false} error={error} />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isSaving}
              onClick={() => finish([])}
            >
              Passer, je choisirai plus tard
            </Button>
            <Button type="button" className="flex-1" disabled={isSaving} onClick={() => finish(poiGroups)}>
              {isSaving ? "…" : "Terminer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
