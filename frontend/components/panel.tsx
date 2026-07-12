"use client";

import { AccountMenu } from "@/components/account-menu";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

type PanelProps = {
  accountEmail: string | null;
  children: React.ReactNode;
};

export function Panel({ accountEmail, children }: PanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70dvh] flex-col rounded-t-xl bg-card shadow-floating md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:max-h-[calc(100dvh-2rem)] md:w-[380px] md:rounded-xl">
      <div className="flex items-center justify-between gap-2 px-4 py-3 md:pb-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 cursor-pointer items-center justify-between gap-2 md:pointer-events-none"
        >
          <span className="text-left">
            <span className="block text-base font-semibold text-foreground">The Good Spot</span>
            <span className="block text-xs text-muted-foreground">
              où vivre à mi-chemin, en vrais temps de trajet
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none md:hidden",
              open ? "rotate-0" : "rotate-180"
            )}
          />
          <span className="sr-only">{open ? "Replier le panneau" : "Déplier le panneau"}</span>
        </button>
        <div className="md:pointer-events-auto">
          <AccountMenu email={accountEmail} />
        </div>
      </div>
      <div className={cn("overflow-y-auto", open ? "block" : "hidden", "md:block")}>
        {children}
      </div>
    </div>
  );
}
