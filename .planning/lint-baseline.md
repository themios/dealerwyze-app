# Lint Baseline — Phase 0

**Date:** 2026-04-28

## Before Auto-Fix

- Total problems: 266 (151 errors, 115 warnings)
- Auto-fixable: 9 errors + 3 warnings = 12

## After Auto-Fix

- Total problems: 254 (142 errors, 112 warnings)
- Auto-fixable remaining: 0
- Reduction: exactly 12 (as expected)

## Remaining by Rule (for Phase 3)

| Rule | Approx Count | Type |
|------|-------------|------|
| @typescript-eslint/no-unused-vars | ~99 | warning/error |
| @typescript-eslint/no-explicit-any | ~53 | error |
| react-hooks (setState-in-effect, purity) | ~47 | error |
| next/no-unescaped-entities | ~20 | error |
| react-hooks/exhaustive-deps | ~5 | warning |
| react-hooks/rules-of-hooks | ~3 | error |
| other | ~27 | mixed |

## Build Status

- `npx tsc --noEmit`: PASS (no output, exit 0)
- TypeScript check run after eslint --fix confirmed zero new errors introduced

## Notes

- The 254 remaining issues are intentionally left for Phase 3 correctness work.
- Auto-fix resolved: primarily unused-import removals and minor style corrections.
- Files affected by auto-fix were spread across app/, components/, and lib/ (60 files total).
