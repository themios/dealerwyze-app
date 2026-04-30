# Lint Baseline — Phase 0 / Phase 3 Entry

**Refreshed:** 2026-04-29

## Historical Baseline (2026-04-28)

- Before auto-fix: 266 problems (151 errors, 115 warnings)
- After auto-fix: 254 problems (142 errors, 112 warnings)
- Auto-fix reduction: 12 total

## Current Baseline (HEAD at Phase 3 prep)

Command used:

```bash
npx eslint app components hooks lib remotion next.config.ts proxy.ts --max-warnings=0
```

Machine-readable summary (`-f json`):

- Total problems: 0
- Errors: 0
- Warnings: 0

## Top Rules (Current)

No source lint problems were found on the current baseline run.

## Phase 3 Entry Criteria

- `npm run build`: passing
- `npm test`: passing (4 test files, 38 tests)
- Source lint: passing with zero problems

## Workstream Order

1. React correctness blockers
   - `react-hooks/rules-of-hooks`
   - `react-hooks/set-state-in-effect`
   - `react-hooks/purity`
2. Sensitive type-safety cleanup
   - `@typescript-eslint/no-explicit-any` in payment, auth, webhook, and public ingestion code
3. Framework correctness
   - `@next/next/no-html-link-for-pages`
   - `@next/next/no-img-element`
4. Hygiene reduction
   - `@typescript-eslint/no-unused-vars`
   - `react/no-unescaped-entities`

## Notes

- This file is now the canonical Phase 3 baseline.
- Any future numeric references in planning docs should use this refreshed baseline, not the 2026-04-28 post-autofix snapshot.
