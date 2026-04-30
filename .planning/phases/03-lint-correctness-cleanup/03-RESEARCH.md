# Phase 3: Lint Correctness Cleanup — Research

**Prepared:** 2026-04-29
**Domain:** source-lint remediation, React correctness, type safety, framework correctness
**Confidence:** HIGH — derived from current eslint JSON output and build/test verification

---

## Summary

Phase 3 is now unblocked from a tooling perspective:

- `npm run build` passes
- `npm test` passes
- current source lint baseline is known and reproducible

The current lint baseline is now clean and valid. The tooling is unblocked, and the focus should be on maintaining zero-lint state while Phase 2 changes land.

- Errors: 0
- Warnings: 0
- Total: 0

---

## Current Baseline

Command:

```bash
npx eslint app components hooks lib remotion next.config.ts proxy.ts --max-warnings=0
```

Current machine-readable totals:

- Errors: 0
- Warnings: 0
- Total: 0

Top rules:

No lint problems were found on the current baseline run.
4. `react/no-unescaped-entities` — 25
5. `react-hooks/purity` — 18
6. `@next/next/no-html-link-for-pages` — 18
7. `@next/next/no-img-element` — 8
8. `react-hooks/rules-of-hooks` — 3

---

## Risk-Based Execution Strategy

### Workstream A — React Correctness First

Fix first because these are behavior risks, not cosmetic noise:

- conditional hooks
- impure render calculations
- synchronous `setState` inside effects

These directly affect:

- hydration stability
- render determinism
- component correctness
- long-term debuggability

### Workstream B — Sensitive Type Safety

Next focus:

- `any` in payment
- `any` in auth
- `any` in webhooks
- `any` in public ingestion

These have the highest leverage for:

- runtime safety
- code review quality
- future refactor safety

### Workstream C — Framework Correctness

Then fix:

- `next/link` violations
- raw `<img>` where `Image` is expected

These are lower risk than hook correctness, but they still matter for maintainability and production behavior.

### Workstream D — Hygiene Collapse

Leave bulk unused-var cleanup and JSX entity cleanup for last so they do not obscure correctness work.

---

## Constraints

- Do not weaken lint rules to “pass” Phase 3.
- Do not convert correctness errors into ignore comments unless there is a documented exception.
- Keep `npm run build` green after every workstream.
- Keep `npm test` green after every workstream.
- Update the lint baseline after each major batch if counts move significantly.

---

## Success Definition

Phase 3 is complete only when:

1. `npx eslint app components hooks lib remotion next.config.ts proxy.ts --max-warnings=0` exits 0
2. `npm run build` exits 0
3. `npm test` exits 0
4. No security-sensitive paths rely on `any`
5. No React hook-order or purity violations remain
