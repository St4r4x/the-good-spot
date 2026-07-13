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
  "data-[armed=true]:transition-all data-[armed=true]:duration-700 data-[armed=true]:ease-out data-[armed=true]:data-[visible=false]:opacity-0 data-[armed=true]:data-[visible=false]:translate-y-8 motion-reduce:transition-none";

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
    // Elements already in the viewport at mount (e.g. the Hero) must arm
    // straight into the visible state — arming them into "hidden" first
    // would fade/slide them out and back in before the async
    // IntersectionObserver callback ever fires. Compute the initial state
    // synchronously so there's no such frame.
    const rect = el.getBoundingClientRect();
    const alreadyVisible = rect.top < window.innerHeight && rect.bottom > 0;
    if (alreadyVisible) {
      el.dataset.visible = "true";
    }
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
