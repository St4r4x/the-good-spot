# Landing Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `frontend/app/page.tsx` (the landing page) a bold, energetic, animated visual identity, freed from the site-wide `DESIGN.md` constraints for this page only.

**Architecture:** Single-file rewrite of the landing page component. No new components, no new routes, no backend changes. The creative visual work is delegated to the `frontend-design` skill (invoked with a complete brief) rather than hand-authored, per the approved spec — two prior wireframe-mockup attempts at this redesign were rejected as unconvincing, so the real implementation happens directly in code with live-browser iteration instead of static mockups.

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript / Tailwind v4. No new npm dependencies unless native CSS/Tailwind genuinely cannot achieve the motion requirements (constraint from the spec — check before adding anything).

## Global Constraints

(Copied verbatim from `docs/superpowers/specs/2026-07-13-landing-visual-redesign-design.md`)

- Keep the section structure: Header → Hero → Récit → CTA final → Footer. No structural rewrite (no new/removed sections, no reordering).
- Reuse existing assets as-is: `public/logo-mark.png`, `public/app-preview.webp`. Do not regenerate or modify these files.
- `DESIGN.md` does NOT apply to this page for this redesign (no "one accent color" limit, gradients and shadows are allowed). The rest of the funnel (`/login`, `/reset-password`, `/onboarding`, `/app`) is untouched and keeps following `DESIGN.md` normally. Do not edit `DESIGN.md` itself.
- Dynamism requirement: BOTH an energetic layout (asymmetry, typographic scale contrast, less predictable arrangement) AND motion (scroll reveals, pronounced hover effects, transitions) — not one or the other.
- Non-negotiable regardless of creative freedom: WCAG AA text contrast, `prefers-reduced-motion` respected on every animation, visible keyboard focus on all interactive elements, no performance regression (no new unoptimized heavy assets), no new animation library if native CSS/Tailwind suffices.

---

### Task 1: Redesign the landing page via `frontend-design`

**Files:**
- Modify: `frontend/app/page.tsx` (full rewrite of the JSX/markup; the `export const metadata` block at the top can stay as-is unless the redesign changes page title/description needs)

**Interfaces:**
- Consumes: existing imports available in the codebase — `buttonVariants` from `@/components/ui/button`, `cn` from `@/lib/utils`, `Image` from `next/image`, `Link` from `next/link`. Existing static assets at `/logo-mark.png` and `/app-preview.webp` (served from `frontend/public/`).
- Produces: the default-exported `LandingPage` component, still `frontend/app/page.tsx`'s default export (no signature/props — Next.js page convention, takes no arguments).

- [ ] **Step 1: Invoke the `frontend-design` skill with this exact brief**

Use the Skill tool with `skill: "frontend-design"` and this `args` string:

```
Redesign frontend/app/page.tsx (the landing page for "The Good Spot", a
housing-search app for couples with two different work commutes) to be
bold, energetic, and animated. Read the current file first.

MUST KEEP:
- Section order: Header (logo + nav CTA) -> Hero (headline + subtext + CTA
  + app screenshot) -> Récit (narrative paragraph about a couple with two
  commutes + trust line) -> CTA final -> Footer. Do not add, remove, or
  reorder sections.
- Reuse these exact existing assets, do not regenerate them:
  - Logo: <Image src="/logo-mark.png" width={861} height={248}
    className="h-7 w-auto" alt="" /> (pair with the text "The Good Spot"
    as a wordmark, like the current header does)
  - App screenshot: <Image src="/app-preview.webp" width={1440}
    height={900} alt="..." /> (existing screenshot of the app's map view)
  - Reuse the existing copy verbatim unless the new visual direction
    genuinely requires different wording (this is a visual redesign, not
    a copy rewrite) — current headline "Un chez-vous qui convient à vous
    deux", CTA "Trouvez votre lieu", récit paragraph about "Léa" (9e
    arrondissement) and "Karim" (15e arrondissement), trust line "Vrais
    temps de trajet · Compte gratuit · Synchronisé partout", final CTA
    "Trouver notre zone commune".

FREED FROM THE SITE'S NORMAL DESIGN SYSTEM (DESIGN.md), FOR THIS PAGE ONLY:
- Not limited to one accent color — introduce a richer palette if it
  serves the design (the rest of the app stays teal-only, this page can
  diverge).
- Gradients, shadows, and decorative effects are allowed (the rest of the
  app is flat-by-default, this page is exempt).

DYNAMISM REQUIRED (both, not either/or):
- Energetic layout: asymmetry, strong typographic scale contrast between
  headline and body text, a less predictable/grid-locked arrangement than
  a standard centered-column marketing page.
- Motion: scroll-triggered reveals as sections enter the viewport,
  pronounced hover effects on interactive elements (CTA buttons, the
  screenshot), and smooth transitions. Implement motion with native CSS
  (Tailwind transition/animation utilities, CSS @keyframes, or the
  IntersectionObserver Web API for scroll reveals) — do NOT add a new npm
  dependency (no framer-motion, no GSAP, etc.) unless you can show native
  CSS/Web APIs genuinely cannot achieve the effect, in which case stop and
  explain why before adding one.

NON-NEGOTIABLE (accessibility/performance, apply regardless of the
creative freedom above):
- Every animation must be disabled/reduced under `prefers-reduced-motion:
  reduce` (Tailwind's `motion-reduce:` variant, or a matching media query
  if using raw CSS/JS).
- Text must maintain WCAG AA contrast (4.5:1 for body text, 3:1 for large
  text) against whatever background it sits on.
- Every interactive element (links, buttons) must have a visible keyboard
  focus state (Tailwind's `focus-visible:` utilities, matching the
  `focus-visible:ring-3 focus-visible:ring-ring/50` pattern already used
  elsewhere in this codebase, e.g. frontend/components/workplace-form.tsx).
- Do not introduce any new npm dependency without first checking that
  native CSS/Tailwind/Web APIs cannot do it.

The full current file is at frontend/app/page.tsx — read it for the exact
current copy and structure before rewriting.
```

- [ ] **Step 2: Review the diff against the global constraints**

Read the resulting `frontend/app/page.tsx` and check, one by one:
- Section order unchanged (Header, Hero, Récit, CTA final, Footer all present in that order)
- `logo-mark.png` and `app-preview.webp` both still referenced, with the same `width`/`height` props as before (861×248 and 1440×900 respectively) — no new image files created
- Run: `cd frontend && grep -c "framer-motion\|gsap\|aos\b" package.json`
  Expected: `0` (no new animation dependency was added)
- Run: `cd frontend && git diff --stat package.json package-lock.json`
  Expected: no output (these files are unchanged) — if there IS a diff, stop and confirm with the user before proceeding, since the brief required justifying any new dependency first

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run lint
```
Expected: both commands exit 0 with no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/missia03/Projects/the-good-spot/.claude/worktrees/landing-visual-redesign
git add frontend/app/page.tsx
git commit -m "feat: redesign landing page with bold, animated visual identity"
```

---

### Task 2: Verify accessibility and motion-safety requirements

**Files:**
- Read only: `frontend/app/page.tsx` (from Task 1)
- Modify (only if a gap is found): `frontend/app/page.tsx`

**Interfaces:**
- Consumes: the `LandingPage` component produced by Task 1.
- Produces: nothing new — this task only verifies and, if needed, patches Task 1's output. No new exports.

- [ ] **Step 1: Confirm every animation respects `prefers-reduced-motion`**

Run:
```bash
cd frontend && grep -n "animate\|transition\|@keyframes" app/page.tsx
```
For every match that is an actual animation (not a static `transition-colors` on a hover-only color change, which is already broadly accepted as fine without a guard elsewhere in this codebase, e.g. `frontend/app/page.tsx`'s existing footer link), confirm there is a paired `motion-reduce:` Tailwind variant (e.g. `motion-reduce:animate-none`, `motion-reduce:transition-none`) or, for any raw CSS `@keyframes`/JS-driven animation, a matching `@media (prefers-reduced-motion: reduce)` block or `window.matchMedia("(prefers-reduced-motion: reduce)")` check.

If any animation is missing the guard, add the appropriate `motion-reduce:` variant (for Tailwind-driven animations) or media query (for raw CSS) directly to `frontend/app/page.tsx`.

- [ ] **Step 2: Verify text contrast**

Start the dev server (see Task 3, Step 1, for the exact command — reuse the same running server if Task 3 already started it) and use the `preview_inspect` tool on every distinct text color/background pairing introduced by the redesign (headline, body copy, CTA button labels, footer links). For each, note the computed `color` and `background-color` (or the ancestor background if the text sits on a transparent background), and confirm the contrast ratio is at least 4.5:1 for text under 24px/18.7px-bold, or 3:1 for text at or above that size (use the standard WCAG relative luminance formula: `L = 0.2126*R + 0.7152*G + 0.0722*B` in linear RGB, contrast ratio `(L1+0.05)/(L2+0.05)` with L1 the lighter of the two).

If any pairing fails, darken the text color or lighten/darken the background until it passes, then re-check.

- [ ] **Step 3: Verify keyboard focus visibility**

In the running preview, use `preview_eval` to focus each interactive element in sequence:
```js
document.querySelectorAll('a, button').forEach((el, i) => { el.dataset.tabIndex = i })
```
Then use `preview_eval` with `document.querySelectorAll('a, button')[N].focus()` for each `N`, and `preview_screenshot` after each, to confirm a visible focus ring/outline appears (matching or exceeding the existing `focus-visible:ring-3 focus-visible:ring-ring/50` pattern used elsewhere in this codebase). If any interactive element has no visible focus state, add `focus-visible:ring-3 focus-visible:ring-ring/50` (or an equivalent visible treatment consistent with the new design) to it in `frontend/app/page.tsx`.

- [ ] **Step 4: Commit (only if Step 1 or Step 3 required changes)**

```bash
cd /home/missia03/Projects/the-good-spot/.claude/worktrees/landing-visual-redesign
git add frontend/app/page.tsx
git commit -m "fix: add missing prefers-reduced-motion/focus-visible guards on landing"
```

If no changes were needed in Steps 1-3, skip this commit and say so explicitly.

---

### Task 3: Live browser verification (desktop + mobile) and asset-weight sanity check

**Files:**
- Read only: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: the final `LandingPage` component from Tasks 1-2.
- Produces: nothing (verification-only task).

- [ ] **Step 1: Start the dev server and screenshot desktop**

```bash
cd frontend && npm run dev
```
(Or use `preview_start` with the project's existing `frontend-dev` launch config if running through the preview tooling.) Once ready, use `preview_screenshot` on `/` at the default desktop viewport. Confirm visually: headline and screenshot are both present, no layout overflow/clipping, hover/scroll motion is visible when interacted with (use `preview_eval` to scroll and re-screenshot the Récit and CTA sections to confirm scroll-reveal animations actually fire).

- [ ] **Step 2: Screenshot mobile**

Use `preview_resize` with `preset: "mobile"`, then `preview_screenshot` on `/` again. Confirm: no horizontal scroll, text remains legible at mobile widths, the energetic/asymmetric layout degrades sensibly (doesn't overlap or clip).

- [ ] **Step 3: Check for `prefers-reduced-motion` in practice**

Use `preview_resize` with `colorScheme` unrelated — instead use `preview_eval` to run:
```js
matchMedia('(prefers-reduced-motion: reduce)').matches
```
This confirms the media query is queryable in the test environment (sanity check only; the guards themselves were verified in Task 2). If the preview tooling supports emulating `prefers-reduced-motion`, enable it and re-screenshot to confirm animations are suppressed; otherwise rely on the code-level check from Task 2.

- [ ] **Step 4: Check asset weight**

Use `preview_network` filtered to `all` on `/`. Confirm no new image/font/script requests beyond what the page already loaded before this redesign (the two existing images, fonts, and JS bundles) — i.e., no newly introduced heavy assets. If the redesign added any new image, confirm it's reasonably sized (a decorative background image, if any, should be well under 200KB) — per the spec, no new assets were expected at all, so any new image request here is a signal to double check Task 1's output against the "reuse existing assets" constraint.

No commit for this task (verification only). If a problem is found, go back to Task 1/2 to fix it, then re-run this task.

---

### Task 4: Docs, changelog, and version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: nothing from prior tasks (docs-only).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the changelog entry**

Read `CHANGELOG.md`. Under the `## [Unreleased]` heading (or a new `## [1.1.1] - 2026-07-13` section directly below it, per this project's "decide the version now" convention — this is a visual-only change with no new user-facing capability, so it's a **patch** bump per the project's version bump rule), add:

```markdown
### Changed
- Landing page (`/`) redesign: bolder, more energetic visual identity
  with scroll/hover motion — this page is intentionally exempt from
  `DESIGN.md`'s one-accent-color and flat-by-default rules; the rest of
  the funnel (`/login`, `/reset-password`, `/onboarding`, `/app`) is
  unaffected and still follows `DESIGN.md`.
```

- [ ] **Step 2: Bump the frontend package version**

In `frontend/package.json`, change:
```json
  "version": "1.1.0",
```
to:
```json
  "version": "1.1.1",
```

- [ ] **Step 3: Commit**

```bash
cd /home/missia03/Projects/the-good-spot/.claude/worktrees/landing-visual-redesign
git add CHANGELOG.md frontend/package.json
git commit -m "docs: changelog entry and version bump for landing redesign"
```

---

## Self-Review

**Spec coverage:**
- Keep section structure → Task 1 brief + Task 1 Step 2 check. ✓
- Reuse logo/screenshot assets as-is → Task 1 brief (exact `Image` props specified) + Task 1 Step 2 check. ✓
- Free from `DESIGN.md` on this page only, rest of funnel untouched → Task 1 brief explicitly scopes the freedom to this file only; no other file is modified anywhere in this plan. ✓
- `DESIGN.md` itself not modified → no task touches it. ✓
- Dynamism (layout + motion, both) → Task 1 brief requires both explicitly. ✓
- No new animation dependency unless justified → Task 1 Step 2 checks `package.json`/`package-lock.json` diff. ✓
- WCAG AA contrast, `prefers-reduced-motion`, keyboard focus, no perf regression → Task 2 (contrast + motion + focus) and Task 3 Step 4 (asset weight). ✓
- Live browser verification desktop + mobile → Task 3. ✓
- No new unit tests needed (per spec) → no test-writing task included, consistent with the spec's own "Tests" section. ✓

**Placeholder scan:** No TBD/TODO. Task 1's "code" is a complete, concrete skill-invocation brief rather than hand-written JSX, which is intentional per the spec's approach (creative implementation is delegated to `frontend-design`, not pre-authored in the plan) — every other task has literal commands/code.

**Type consistency:** N/A — no new functions/types are introduced across tasks (single presentational component, no shared interfaces between tasks beyond "the file Task 1 produces is what Tasks 2-4 read/verify").
