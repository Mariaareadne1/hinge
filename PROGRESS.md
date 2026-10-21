# Hinge — progress

- Repo: https://github.com/Mariaareadne1/hinge · branch `main`
- Local: ~/Developer/design-engineering-build-2026/hinge
- Live: https://mariaareadne1.github.io/hinge/ (GitHub Pages via .github/workflows/pages.yml)

## Milestones
- [x] H0 repo, architecture (DECISIONS.md), metadata
- [x] H1 stage + Card specimen: hover / press / drag / release, pointer capture, cancel, blur, keyboard
- [x] H2 closed-form spring, inspector, linked graph with draggable peak handle + measured trace, Lift/Snap/Magnet
- [x] H3 autosave, corrupt-data recovery, coalesced undo/redo, projects (new/duplicate/delete/rename/import)
- [x] H4 React/TSX export (copy, zip, config) + isolated fixture parity tests
- [x] H5 responsive (desktop lab / phone stack), a11y pass, README, screenshots, Pages deploy

Button and Token specimens are implemented and exported (Token is exercised by parity case B; Button by
the editor tests only).

## Test results (2026-10-21)
- `pnpm typecheck` ✓ · `pnpm lint` ✓ · `pnpm build` ✓
- `pnpm test` 30/30
- `pnpm test:e2e` editor 13/13 Chromium + 13/13 WebKit; export-parity 6/6 Chromium
  (full suite ×2 repeats: 64/64)

## Known gaps / unverified
- Real touch hardware, Firefox, iOS Safari, screen readers not tested.
- Export fixture builds against React 19.3 only; React 18.2 support is declared, not tested.
- Timing tests are tolerant to one frame of jitter; a heavily loaded machine produced one transient
  failure early on (before the timing-aware metric) — see DECISIONS D7.
- The graph handle cannot reach ζ ≥ 1 (minimum overshoot 0.1 %); use the Damping field for that.

## Next safe action
Polish candidates: A/B compare of two configs; per-state custom easing preview; React 18 fixture run.
