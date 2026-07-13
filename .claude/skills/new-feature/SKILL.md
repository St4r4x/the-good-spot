---
name: new-feature
description: Use when starting any new feature or non-trivial change on The Good Spot — orchestrates brainstorm, isolated worktree, TDD, simplification, security review, docs/changelog, PR, and release. Trigger phrases: "nouvelle feature", "ajoute une fonctionnalité", "implémente X" on this repo.
---

# New Feature (The Good Spot)

Orchestrates the full contribution cycle described in `CONTRIBUTING.md` for
this repo. Follow the steps in order; do not skip a step to save time — each
one catches a different class of mistake.

## Steps

1. **Brainstorm.** Invoke `superpowers:brainstorming` first. Do not write any
   code before a design is presented and approved. If the feature touches
   `frontend/components` or `frontend/app` (any visible UI), also invoke
   `ui-ux-pro-max` during the design phase to ground UI decisions in the
   project's design system (`DESIGN.md`, `PRODUCT.md`). If the brainstorm
   concludes the feature needs a fresh, opinionated visual take rather than
   incremental component work (e.g. "redesign this page", not "add a
   field") — call that out explicitly and invoke `frontend-design` instead
   of/alongside `ui-ux-pro-max` for that pass, on the user's explicit ask
   only, not by default (the two overlap in role; don't run both silently).

2. **Isolate.** Invoke `superpowers:using-git-worktrees` to create a dedicated
   worktree on branch `feature/<topic>` before touching any file. Never
   implement a feature directly on `main` or in the primary checkout if
   another feature might be in flight there.

3. **Assets (only if the brainstormed design needs new brand assets).**
   Logo, illustrations, icons, or a palette/token change — invoke `design`
   or `design-system` to generate them, grounded in `DESIGN.md`'s existing
   tokens (One Accent Rule, the illustration system) rather than inventing
   new ones. Skip this step entirely for features that don't touch visuals
   at this level (most features should skip it).

4. **Implement with TDD.** Invoke `superpowers:test-driven-development`.
   Write a failing test first (`backend/tests/` with pytest+respx for
   backend changes, `frontend/**/*.test.ts` with Vitest for frontend logic),
   then the minimal code to pass it, then refactor. When the diff touches
   visible UI, also invoke `ui-styling` while writing the actual
   components — it targets this project's exact stack (shadcn/ui +
   Tailwind v4) instead of generic markup.

5. **Run the full test suite.** Both must pass before moving on:
   ```bash
   cd backend && source .venv/bin/activate && pytest
   cd frontend && npm run test && npx tsc --noEmit && npm run lint
   ```
   If anything fails, go back to step 4 — do not proceed with red tests.

6. **Simplify.** Run `/simplify` on the diff. Apply its suggestions unless
   they conflict with the approved design.

7. **Security review.** Run `/security-review` on the diff. Pay particular
   attention to `backend/main.py` (the only place `GEOAPIFY_API_KEY` is used —
   it must never leak to the client or logs) and any new user-supplied input
   (addresses, query params) reaching an external HTTP call.

8. **Update docs and changelog — before opening the PR, not after.**
   - Update `README.md` if behavior, endpoints, or setup steps changed.
   - Add the changelog entry directly under a new `## [X.Y.Z] - YYYY-MM-DD`
     section in `CHANGELOG.md` (Keep a Changelog format: `### Added` /
     `### Changed` / `### Fixed` / `### Removed`). Do not park it under
     `## [Unreleased]` — decide the version now, in this PR, so there is no
     separate "bump changelog" PR after merge.
   - **Version bump rule (apply the highest that matches, no judgment call):**
     - **major** — any change that breaks an existing `/isochrone` or
       `/housing` request/response shape, or removes a documented behavior.
     - **minor** — a new user-facing capability (new endpoint, new query
       param, new UI control) or new internal tooling/process (CI job, test
       suite, skill) — additive, nothing existing breaks.
     - **patch** — bug fix, dependency bump, doc/process wording fix,
       refactor with no behavior change.
   - Commit these doc/changelog changes as part of the same feature branch,
     before running step 9.

9. **Finish the branch.** Invoke `superpowers:finishing-a-development-branch`
   to open a PR from `feature/<topic>` into `main`. Wait for all required
   checks in `.github/workflows/ci.yml` to go green before proposing merge —
   `secrets` (gitleaks scan), `backend`, `frontend`. Do not merge on red or
   pending CI.

10. **Release after merge.** Once the PR (which already carries the final
    `CHANGELOG.md` section from step 8) is merged into `main`:
    - `git checkout main && git pull`
    - `git tag vX.Y.Z && git push origin vX.Y.Z` (same X.Y.Z as the changelog
      section merged in step 8/9)
    - `gh release create vX.Y.Z --notes-from-tag` or paste the changelog
      section as release notes.

## When to shorten this

For a one-line fix with no behavior change (typo, comment, doc-only), skip
straight to step 8 (docs) and step 9 (PR) — brainstorm/worktree/TDD add no
value there. Say explicitly which steps you're skipping and why.
