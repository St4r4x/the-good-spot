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
   project's design system (`DESIGN.md`, `PRODUCT.md`).

2. **Isolate.** Invoke `superpowers:using-git-worktrees` to create a dedicated
   worktree on branch `feature/<topic>` before touching any file. Never
   implement a feature directly on `main` or in the primary checkout if
   another feature might be in flight there.

3. **Implement with TDD.** Invoke `superpowers:test-driven-development`.
   Write a failing test first (`backend/tests/` with pytest+respx for
   backend changes, `frontend/**/*.test.ts` with Vitest for frontend logic),
   then the minimal code to pass it, then refactor.

4. **Run the full test suite.** Both must pass before moving on:
   ```bash
   cd backend && source .venv/bin/activate && pytest
   cd frontend && npm run test && npx tsc --noEmit && npm run lint
   ```
   If anything fails, go back to step 3 — do not proceed with red tests.

5. **Simplify.** Run `/simplify` on the diff. Apply its suggestions unless
   they conflict with the approved design.

6. **Security review.** Run `/security-review` on the diff. Pay particular
   attention to `backend/main.py` (the only place `GEOAPIFY_API_KEY` is used —
   it must never leak to the client or logs) and any new user-supplied input
   (addresses, query params) reaching an external HTTP call.

7. **Update docs.**
   - Update `README.md` if behavior, endpoints, or setup steps changed.
   - Add an entry under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog
     format: `### Added` / `### Changed` / `### Fixed` / `### Removed`).

8. **Finish the branch.** Invoke `superpowers:finishing-a-development-branch`
   to open a PR from `feature/<topic>` into `main`. Wait for the CI workflow
   (`.github/workflows/ci.yml`) to go green before proposing merge — do not
   merge on red or pending CI.

9. **Release after merge.** Once the PR is merged into `main`:
   - Move the `## [Unreleased]` entries in `CHANGELOG.md` under a new
     `## [X.Y.Z] - YYYY-MM-DD` section (bump patch/minor/major per semver
     based on the change).
   - `git tag vX.Y.Z && git push origin vX.Y.Z`
   - `gh release create vX.Y.Z --notes-from-tag` or paste the changelog
     section as release notes.

## When to shorten this

For a one-line fix with no behavior change (typo, comment, doc-only), skip
straight to step 7 (docs) and step 8 (PR) — brainstorm/worktree/TDD add no
value there. Say explicitly which steps you're skipping and why.
