# Hinge — progress

- Repo: https://github.com/Mariaareadne1/hinge · branch `main` (owner chose to work on `main` directly; every push to `main` deploys Pages)
- Local: ~/Developer/design-engineering-build-2026/hinge
- Live: https://mariaareadne1.github.io/hinge/ (GitHub Pages via .github/workflows/pages.yml — `build` job deploys; `e2e` runs Chromium in parallel)

---

## Redesign — "Hinge, the Motion Workshop" (started 2026-10-25)

Goal: replace the left-shelf / centre-stage / right-inspector layout with a stage-first instrument, keeping the
runtime, schema, storage and export engine untouched.

### H0 — audit (done)

**Before editing:** HEAD `010e4f4` = `origin/main`; last Pages deploy run 39554856012 succeeded on that commit.
Working tree clean. Toolchain: Node 22.21, pnpm 10.33.2, Playwright 1.64 (Chromium 156.0.8078.4, WebKit 27.2),
macOS 26.4.1, M2 Pro. 87 GB free.

**Baseline checks (2026-10-25)**

| Command | Result |
| --- | --- |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test` | 32 / 32 |
| `pnpm build` | pass (JS 322 kB / 102 kB gz, CSS 33 kB) |
| `pnpm test:e2e` | 40 / 40 (editor 16 Chromium + 16 WebKit, parity 8 Chromium) |
| `pnpm test:export` | **failed** — script pointed at a non-existent `scripts/export-parity.mjs`. Fixed: now runs `playwright test export-parity --project=chromium`. |

Baseline parity, raw max |editor − export|: A hover y 0.126 px · A rotate 0.016° · A release x 0.193 px · B flick x 0.444 px.

**Baseline artifacts:** `docs/design-review/baseline/` — 8 screenshots (Chromium + WebKit × 1440×900, 1280×800,
768×1024, 390×844), `recording-1280x800.webm` (hover, drag, throw, stiffness edit, export), `report.json`
(stage share of viewport, overflow, tab order). Regenerate with `node scripts/capture.mjs <label>`.

**Baseline observations**
- Stage is 39 % of a 1440×900 viewport (33 % at 1280×800); 240 px shelf + 340 px inspector take the rest.
- Classic template: shelf of chips/cards left, settings sidebar right, cobalt-on-beige.
- Tab order at desktop goes through 12 shelf controls before reaching the specimen.
- Phone: page is 2357 px tall; inspector and shelf are stacked below the stage (long scroll), behavior strip is a 2×2 grid.
- WebKit (macOS default) skips plain buttons on Tab; that is browser behaviour, not an app bug.
- No horizontal overflow at any size.

**Module / data-flow map (verified)**

```
src/runtime/        PROTECTED — copied byte-for-byte into exports
  spring.ts         closed-form damped oscillator: springAt, stepResponse, springFromPeak (graph inverse), limits
  runtime.ts        HingeRuntime: rest/hover/press/drag state machine, pointer capture, cancel, blur, keyboard flick
  useHinge.ts       React binding; usePrefersReducedMotion
src/specimens/      HingeCard/Button/Token + CSS — rendered on stage AND exported (behavior import replaced)
src/domain/         schema.ts (versioned model, RECIPES, limits, parse/validate) · history.ts (coalesced undo)
src/storage/        projects.ts — localStorage library, corrupt-data recovery
src/export/         generateReact.ts · createBundle.ts (fflate zip) · sources.ts (?raw imports)
src/state/          useStudio.ts (reducer: history + other projects, autosave, cross-tab pause) · traceStore.ts
src/components/     UI — the redesign surface: TopBar, Shelf, Stage, BehaviorStrip, Inspector, SpringGraph,
                    ScrubField, ExportDialog, RecoveryBanner
src/App.tsx         composes the above; owns selected state, live state, reduced-motion override, ⌘Z
src/styles/app.css  all editor styling

data flow: useStudio.project ──▶ Stage (specimen props.behavior) ──▶ useHinge ──▶ HingeRuntime ──▶ DOM transform
                                   │ onFrame(values,state) ──▶ live state + traceStore ──▶ SpringGraph dots
           Inspector/SpringGraph ──▶ actions.preview (gesture) / push (discrete) / commit (end gesture) ──▶ history
           ExportDialog ──▶ generateReact(project, BUNDLED_SOURCES) ──▶ copy / zip
```

**Protected (not to be edited by the redesign):** `src/runtime/*`, `src/domain/*`, `src/storage/*`, `src/export/*`,
`src/state/*` logic. Specimen TSX stays; specimen CSS may be restyled (it is the exported look) but sizes/structure
must keep parity tests meaningful.

### Next safe step
H1: two composition studies as dev-only routes (`?study=a`, `?study=b`), compare 1440 / 390 screenshots, pick one.

---

## History — original build (2026-10-21)

- [x] H0 repo, architecture (DECISIONS.md), metadata
- [x] H1 stage + Card specimen: hover / press / drag / release, pointer capture, cancel, blur, keyboard
- [x] H2 closed-form spring, inspector, linked graph with draggable peak handle + measured trace, Lift/Snap/Magnet
- [x] H3 autosave, corrupt-data recovery, coalesced undo/redo, projects (new/duplicate/delete/rename/import)
- [x] H4 React/TSX export (copy, zip, config) + isolated fixture parity tests
- [x] H5 responsive (desktop lab / phone stack), a11y pass, README, screenshots, Pages deploy

Independent review (2026-10-21) fixed: keyboard flick reset the hover pose; native click activation; safe codegen
for project names; unreadable saved projects written back untouched; no autosave until something changes;
cross-tab writes pause autosave; grabbing mid-glide no longer snaps; 'use client' in exports; bounded settleTime.

Known gaps carried forward: real touch hardware, Firefox, iOS Safari, screen readers not tested; React 18.2
declared but only 19.3 built; the graph handle cannot reach ζ ≥ 1 (use the Damping field).
