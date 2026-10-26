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
Working tree clean. Owner chose to stay on `main`. Toolchain: Node 22.21, pnpm 10.33.2, Playwright 1.64 (Chromium 156.0.8078.4, WebKit 27.2),
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

### H1 — composition studies (done, `e2c82f2`)
Studies A (stage over a console) and B (full-bleed stage, vertical rail, corner instrument) built as dev-only
routes on the real components; B chosen (DECISIONS D8). Screenshots in `docs/design-review/h1-studies/`.
The study code was removed in H2 (it lives in history at `e2c82f2`).

### H2–H4 — workshop, instrument, export bench, responsive, a11y (done)
- **New components:** `Masthead` (wordmark + live-state datum notch, name, save status, undo/redo, Library,
  Export), `StageControls` (Object / Feel), `BehaviorRail` (vertical tablist; ink = edited, citron = live),
  `Instrument` (ink panel: graph + Spring / Pose|Drag, collapsible, remembered per viewer), `Library` (projects
  dialog), `ExportDialog` rebuilt as the full-screen export bench, `graphMath.ts` (reachable peaks).
  Removed: TopBar, Shelf, BehaviorStrip, Inspector, studies.
- **ScrubField** is a custom relative `role=slider` (no jump on first contact, Shift fine, Shift change rebases,
  Home/End/Page keys); **SpringGraph** freezes its time axis while the handle is held, grabs relative to the
  pointer, clamps to reachable peaks without changing ζ, shows a hover probe with exact model values.
- **Held object above overlays**; specimen optically centred in the free area between rail and instrument.
- **Phone / <900 px:** stage → rail row → bottom sheet (62dvh max, safe-area padded); short screens scroll.
- **Specimen CSS** restyled to ink / bone / citron, card 300 px with `max-width: 100%`, `--hinge-focus` /
  `--hinge-accent` hooks (D12).
- **Independent review** (react-reviewer agent) found 10 defects + 5 minor; all fixed: peak handle drift at the
  stiffness/damping limits, keyboard nudge rewriting ζ ≥ 1 springs, Shift jump in scrubs, focus lost when dialogs
  close (now returned by id — also covers WebKit), clipped narrow/landscape layout, touch scroll blocked in the
  sheet, exported focus ring/width, over-chatty live regions (rail + routine saves now silent; save failures
  announced), long save error overflowing, graph rendering while hidden, modifier keys swallowed, skip-link
  target not focusable, non-tab inside the tablist, focus lost after deleting a project.
- `test:export` now runs export parity **and** the new ZIP round trip.

### Verification (2026-10-26, macOS 26.4.1, M2 Pro — machine shared with other sessions, load avg 18–32)

| Command | Result |
| --- | --- |
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | pass (JS 329 kB / 105 kB gz, CSS 41 kB) |
| `pnpm test` | 35 / 35 (adds graph-handle reachability) |
| `pnpm test:e2e` full run | 63 passed, 6 failed under load avg 32 (4 of them timed out after 8–17 min) |
| re-run of those 6 | all pass except WebKit "grabbing mid-glide" |
| WebKit "grabbing mid-glide" ×5 | 3/5 — **same 3/5 on the pre-redesign commit `010e4f4`** in the same conditions: pre-existing timing flake, runtime unchanged |
| a11y (axe WCAG 2.2 AA rules, both engines) | 6 / 6 after fixes (it caught nested-interactive on the graph, label-in-name on the bench close, a mid-transition contrast hit, focus return) |
| Export parity (Chromium) | 8 / 8 — raw max editor vs export: A hover y 0.211 px, A rotate 0.026°, A release x 0.129 px, B flick x 0.434 px |
| ZIP round trip (Chromium) | pass — downloaded via the bench, built standalone: hover y raw 0.214 px, release x raw 0.423 px |

Two test-infrastructure bugs found and fixed on the way: the ZIP test's fixed port (5411) was served by another
local project ("Edition") — it now asks the OS for a free port and checks the page title; the old baseline
`test:export` script pointed at a missing file.

**After captures:** `docs/design-review/after/` (same 8 viewports + recording + report.json). Stage share of
viewport: 0.39 → 0.93 at 1440×900, 0.33 → 0.92 at 1280×800; phone page height 2357 px → 844 px (no scroll);
the specimen is the 5th tab stop (was beyond the 14th).

### Known limitations / unverified
- Physical touch devices, iOS Safari, Firefox, real screen readers: not tested (touch emulated; axe + role checks only).
- Timing-measured tests are sensitive to machine load; WebKit mid-glide flakes before and after the redesign.
- Export parity port 5409 is still fixed (it has not collided yet); the ZIP test's approach could be applied to it.
- The graph handle cannot produce ζ ≥ 1 (by construction: no peak); use Damping.

### H5 — launch (done)
Pushed `307d0a4` to `main` (`git ls-remote` confirmed). Actions run 40276004070: build ✓, e2e (Chromium, Ubuntu,
includes parity + ZIP round trip) ✓, deploy ✓. Live check of https://mariaareadne1.github.io/hinge/ in Chromium and
WebKit: new title and `/hinge/` asset paths served, specimen renders, hover reports `live=hover` with 46 measured
trace dots, export bench shows generated code, no page errors or failed requests.

### Next safe step
Candidates: A/B compare of two configs on one stage; React 18.2 fixture run; free-port the parity fixture too;
real-device touch pass (iPhone Safari) and a VoiceOver walkthrough.
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
