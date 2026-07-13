"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import type { ElementType, HTMLAttributes } from "react";

/**
 * Scroll-reveal wrapper: flips `data-visible="true"` on itself the first
 * time it enters the viewport, then stops observing. Pure Web API, no
 * dependency — CSS (see `revealClasses`) does the actual animating and is
 * itself neutralized under `prefers-reduced-motion: reduce`.
 *
 * Progressive enhancement: content is visible by default in server-rendered
 * markup (no JS required to see it). Only after mount does JS opt the
 * element into the "armed" (hidden-until-scrolled-into-view) state, so the
 * animation is additive rather than gating content on JS executing at all.
 *
 * Client-only (needs useRef/useEffect/IntersectionObserver), split out of
 * app/page.tsx so the page itself can stay a Server Component and keep
 * exporting `metadata`.
 */
export const revealClasses =
  "transition-all duration-700 ease-out data-[armed=true]:data-[visible=false]:opacity-0 data-[armed=true]:data-[visible=false]:translate-y-8 motion-reduce:transition-none";

export function Reveal({
  as: As = "div",
  className,
  children,
  ...props
}: { as?: ElementType } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    // Arm the hidden state only once JS has actually mounted, then reveal
    // on scroll — content stays visible the whole time if this never runs.
    el.dataset.armed = "true";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.visible = "true";
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polymorphic ref target
    <As ref={ref as any} data-visible="false" className={cn(revealClasses, className)} {...props}>
      {children}
    </As>
  );
}
