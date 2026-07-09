# Contribuer

## Cycle d'une feature

1. **Brainstorm** : clarifier le besoin avant de coder (approches, trade-offs,
   design validé avec les parties concernées).
2. **Isolation** : travailler sur une branche dédiée, idéalement dans un
   worktree git séparé (`git worktree add ../the-good-spot-<topic> -b
   feature/<topic>`) pour ne jamais mélanger deux features en cours dans le
   même checkout.
3. **Implémentation** en TDD : test qui échoue → code minimal qui le fait
   passer → refactor.
4. **Tests** : `pytest` (backend) et `npm run test` (frontend) doivent passer
   avant de proposer la PR (voir [Lancer les tests](#lancer-les-tests)).
5. **Simplification** : relire le diff, retirer toute abstraction ou
   complexité non justifiée par le besoin réel.
6. **Revue de sécurité** : relire le diff pour les vulnérabilités courantes
   (injection, secrets exposés, entrées non validées) — en particulier tout
   ce qui touche `backend/main.py` (clé API Geoapify) ou les entrées
   utilisateur (adresses, query params).
7. **Documentation** : mettre à jour `README.md` si le comportement ou l'API
   change, et ajouter une entrée dans `CHANGELOG.md` sous `## [Unreleased]`.
8. **Pull request** vers `main` — la CI (`.github/workflows/ci.yml`) doit
   être verte avant merge.
9. **Release** : après merge, tag semver (`vX.Y.Z`) et GitHub Release reprenant
   le contenu de `CHANGELOG.md`.

Si tu utilises Claude Code, le skill `.claude/skills/new-feature/SKILL.md`
automatise ce cycle de bout en bout.

## Lancer les tests

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
pip-audit -r requirements.txt
```

### Frontend

```bash
cd frontend
npm ci
npx tsc --noEmit
npm run lint
npm run test
npm audit --audit-level=high
```

## Conventions

- Commits en anglais, mode impératif (`add X`, pas `added X`).
- Préfixe conventional commits : `feat|fix|docs|chore|refactor|test|ci|style`.
- Branches : `feature/<topic>` → `main`.
- Ne jamais committer `.env` ou une clé API en dur.
