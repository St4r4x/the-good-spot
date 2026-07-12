"use client";

import { supabase } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";

type AccountMenuProps = {
  email: string;
};

export function AccountMenu({ email }: AccountMenuProps) {
  return (
    <button
      type="button"
      onClick={() => supabase?.auth.signOut()}
      className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
      aria-label={`Se déconnecter (${email})`}
    >
      <LogOut aria-hidden className="size-4" />
      <span className="hidden md:inline">{email}</span>
    </button>
  );
}
