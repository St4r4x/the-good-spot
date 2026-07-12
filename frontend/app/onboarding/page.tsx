"use client";

import { AuthLayout } from "@/components/auth-layout";
import { CompassIllustration } from "@/components/illustrations/compass";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user.id) {
        router.replace("/login");
        return;
      }
      setUserId(session.user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!userId) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <AuthLayout
      illustration={CompassIllustration}
      caption="Trois petites étapes pour personnaliser votre recherche."
    >
      <OnboardingWizard userId={userId} />
    </AuthLayout>
  );
}
