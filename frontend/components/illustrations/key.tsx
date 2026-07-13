import type { IllustrationProps } from "./types";

export function KeyIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="130" y="46" width="60" height="118" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <path d="M130 78H112" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M130 132H112" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="66" cy="105" r="20" stroke="currentColor" strokeWidth="2.5" />
      <path d="M86 105H124" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M110 105V117" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M124 105V113" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
