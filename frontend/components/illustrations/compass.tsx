import type { IllustrationProps } from "./types";

export function CompassIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="120" cy="96" r="52" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="120" cy="96" r="3" fill="currentColor" />
      <path
        d="M138 78L128 88L102 114L112 104L138 78Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M120 34V44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M120 148V158" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M182 96H172" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M68 96H58" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
