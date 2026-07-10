"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function Panel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70dvh] flex-col rounded-t-xl bg-card shadow-[0_2px_12px_oklch(22%_0.01_220/0.12)] md:inset-x-auto md:top-4 md:bottom-auto md:left-4 md:max-h-[calc(100dvh-2rem)] md:w-[380px] md:rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 md:pointer-events-none md:pb-1"
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
      <div className={cn("overflow-y-auto", open ? "block" : "hidden", "md:block")}>
        {children}
      </div>
    </div>
  );
}
