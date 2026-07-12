import type { IllustrationProps } from "./types";

export function JourneyIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="36" cy="150" r="7" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="204" cy="150" r="7" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M43 150C80 150 90 100 120 100C150 100 160 150 197 150"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 10"
      />
      <path
        d="M96 76L120 56L144 76V112C144 114.209 142.209 116 140 116H100C97.7909 116 96 114.209 96 112V76Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M113 116V96H127V116" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}
