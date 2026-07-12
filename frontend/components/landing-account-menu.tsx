"use client";

import { AccountMenu } from "@/components/account-menu";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export function LandingAccountMenu() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user.email ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return <AccountMenu email={email} />;
}
