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
 * Client-only (needs useRef/useEffect/IntersectionObserver), split out of
 * app/page.tsx so the page itself can stay a Server Component and keep
 * exporting `metadata`.
 */
export const revealClasses =
  "opacity-0 translate-y-8 transition-all duration-700 ease-out data-[visible=true]:opacity-100 data-[visible=true]:translate-y-0 motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none";

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
      el.dataset.visible = "true";
      return;
    }
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
