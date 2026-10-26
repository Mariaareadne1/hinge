# Hinge — the Motion Workshop

**An instrument for designing interface motion.** Tune how a component behaves — hover, press, drag and release — by handling it and shaping its spring, then export a working React + TypeScript component that moves exactly the way it did on the stage.

> What you feel in Hinge is what you ship.

![The Motion Workshop: a full-bleed stage, the state rail on the left, the spring instrument in the corner with the measured motion (citron dots) on the model curve](docs/media/hinge-hover.png)

**Live:** https://mariaareadne1.github.io/hinge/ · **Source:** this repository · MIT

## What it does

1. **Touch the object.** One specimen — a card, a button or a draggable token — sits on a full-bleed stage. Hover it, press it, drag it and throw it with a mouse, a finger or the keyboard (Tab to focus, Space/Enter to press, arrow keys to flick). *Object* and *Feel* (Lift, Snap, Magnet) sit in the stage's corner.
2. **Pick a state on the rail** — Rest · Hover · Press · Drag, poster-size on the stage's left edge (keys 2/3/4). The ink block is the state you are editing; the citron mark is the state the object is in right now. The two never get confused.
3. **Shape the spring in the instrument** (lower right, collapsible). Grab the peak of the response curve: left/right moves when it peaks, up/down sets how far it overshoots — the time axis holds still while you drag, so the peak stays under your pointer. Or scrub Stiffness, Damping and Mass: scrub tracks move relative to where you grab (no jump), Shift is 10× finer, and every value can be typed. *Pose* / *Drag* shows only the knobs for the selected state.
4. **See it measured.** The curve is the model; the citron dots are read from the specimen's actual on-screen transform each frame. Hover the graph for exact values at any time.
5. **Save, undo, branch.** Projects autosave locally; a whole scrub or handle drag is one undo step; the Library duplicates, imports and deletes projects.
6. **Export** opens the export bench, a separate dark mode with the real generated files. Copy any file or download a zip: `HingeCard.tsx`, its CSS, the runtime (`hinge/spring.ts`, `hinge/runtime.ts`, `hinge/useHinge.ts`), `hinge.config.json` and a README. The only dependency is React.

Three starting recipes feel physically different, not just numerically:

| Recipe | Character | Hover spring (k / c / m) | ζ |
| --- | --- | --- | --- |
| **Lift** | soft rise, gentle settle | 170 / 18 / 1.2 | 0.63 |
| **Snap** | fast, critically damped, no wobble | 900 / 60 / 1 | 1.00 |
| **Magnet** | short leash, bouncy return | 320 / 11 / 0.8 | 0.34 |

## How it works

```
             ┌────────────── src/runtime (shipped verbatim in every export) ──────────────┐
 pointer ─┐  │ runtime.ts   state machine: rest · hover · press · drag                    │
 touch  ──┼─▶│              capture, cancel, blur, release-outside, multi-pointer cancel  │──▶ element.style.transform
 keyboard ┘  │              per-channel springs (x, y, scale, rotate, lift)               │    --hinge-lift (shadow)
             │ spring.ts    closed-form damped oscillator  x(t), v(t)                     │
             └────────────────────────────────────────────────────────────────────────────┘
                     ▲                          │ same function                      ▲
      editor state (versioned schema,           ▼                                    │
      coalesced undo, autosave) ───────▶ SpringGraph (model curve + measured trace)   │
                     │                                                               │
                     └──────▶ export/generateReact ── specimen source + tuned BEHAVIOR ┘
```

- **One spring, solved exactly.** `spring.ts` solves `m·x″ + c·x′ + k·x = 0` in closed form for the under-, critically- and over-damped cases. There is no frame-by-frame integration, so frame rate can't change the motion, and the curve Hinge draws is literally the function the element follows. Unit tests check the closed form against an independent numerical integration, all corners of the parameter space for finite, converging output, and the graph handle's inverse mapping (peak time + overshoot → k, c) round-trip.
- **One runtime, everywhere.** The stage renders the specimen components in `src/specimens/`; an export is that same source with the behavior import replaced by the tuned values and the runtime files copied byte-for-byte. Nothing in an export imports Hinge.
- **Motion that stays continuous.** Changing state re-seeds each channel's spring from its current position *and velocity*; channels whose target doesn't change keep the spring already in flight (so a release gliding home isn't hijacked by a hover change). The frame loop runs only while something is moving.

## Layout

| | |
| --- | --- |
| ![Dragging the card: the held object rides above the instrument](docs/media/hinge-drag.png) | ![The export bench](docs/media/hinge-export.png) |
| ![Phone: stage, rail, collapsed instrument](docs/media/hinge-mobile.png) | ![Phone: the tuning sheet](docs/media/hinge-mobile-tune.png) |

Under 900 px the workshop restacks instead of shrinking: stage, then the rail as a row, with the instrument as a bottom sheet (safe-area padded, collapsible, never covering the masthead). Short screens scroll instead of clipping. Why this composition and not a console under the stage: [DECISIONS.md D8](DECISIONS.md); before/after captures in [docs/design-review/](docs/design-review/).

## Verification

See [PROGRESS.md](PROGRESS.md) for the latest dated results. Commands:

| Check | Command |
| --- | --- |
| Types, strict | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit — spring math, graph-handle reachability, schema, history, storage, codegen, zip | `pnpm test` |
| Editor + accessibility (axe, WCAG 2.2 AA rules) E2E — Chromium **and** WebKit | `pnpm test:e2e --grep-invert "parity|zip"` |
| Export parity + ZIP round trip — Chromium | `pnpm test:export` |

**ZIP round trip.** A separate test tunes a project, downloads the `.zip` through the export bench as a user would, unpacks it into a fresh Vite + React app outside the repository, type-checks, builds and serves it, and compares its hover and drag-release motion with the stage.

**Export parity, concretely.** The test generates two components from two different projects (a Lift card with a custom hover spring and pose; a Magnet token with custom drag and press springs), writes them into a fresh Vite + React app in a temporary directory *outside* this repository, installs only the declared dependencies, type-checks and builds it, and serves it. It then drives the editor stage and the exported component with identical input and records the element's computed transform every frame:

| Motion | Largest raw difference, editor vs export (2026-10-21 run) |
| --- | --- |
| A — hover rise (y) | 0.23 px |
| A — hover scale / rotate | 0.001 / 0.03° |
| A — press scale | 0.001 |
| A — drag release (x, from 100 px) | 0.07 px |
| B — keyboard flick (x, 900 px/s impulse) | 0.43 px |

Both are also checked against the analytic model, and the exported components are checked for touch tap, Enter/Space activation, a `type="submit"` button submitting its form by mouse, Enter and Space (drags never activate), `element.click()` activation as assistive tech uses it, ARIA roles, reduced motion (every frame is either the rest or the target pose, never in between) and for leaks: ten mount/unmount cycles mid-animation leave no `requestAnimationFrame` running and no window listeners behind.

*How the tolerances are defined:* a recorder samples on its own animation frame, so each value can be read up to a frame after it was written. Comparisons fit one latency offset (≤ 34 ms) and allow deviation of |slope| × 1/60 s per sample; the raw numbers above are with **no** such allowance. Tests that measure absolute time on a heavily loaded machine are the most sensitive — they passed on repeat, but this is a machine that is often busy.

**Not verified:** physical touch devices (touch is emulated), Firefox, Safari on iOS, screen readers beyond role/label checks, React 18 at runtime (declared `>=18.2`; only React 19.3 is built in the fixture).

## Accessibility

Specimens are focusable with `role="button"` (the Button is a real `<button>`); Enter/Space press and activate; keyboard focus — not click focus — stands in for hover; arrow keys give the draggable specimens a flick through the same release spring; every scrub track is a keyboard-operable `slider` (arrows, Shift ×10, Page, Home/End) with a typed numeric equivalent and validation; the graph handle is a keyboard-operable `slider`; the rail is a vertical tablist controlling the instrument; dialogs return focus to the control that opened them; routine saves are silent to screen readers while save failures are announced; reduced motion is honoured from the OS and can be previewed with a toggle (it removes the editor's decorative transitions too). axe runs against the workshop, the drag tuning, the library, the export bench and the phone sheet in both engines.

Exported specimens expose `--hinge-focus` and `--hinge-accent` so a host page can keep the focus ring visible on any background.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5401
pnpm test           # unit
pnpm test:e2e       # Playwright: editor + a11y in Chromium and WebKit; export parity + zip in Chromium
pnpm test:export    # export parity + zip round trip only
node scripts/capture.mjs <label>   # design-review captures: 4 viewports × 2 engines + recording
node scripts/screenshots.mjs   # regenerate docs/media (dev server running)
```

## Project layout

```
src/runtime/     spring.ts · runtime.ts · useHinge.ts — exported verbatim
src/specimens/   HingeCard / HingeButton / HingeToken + CSS — rendered on stage and exported
src/domain/      schema.ts (versioned model, recipes, validation) · history.ts (coalesced undo)
src/storage/     localStorage library with corrupt-data recovery
src/export/      generateReact.ts · createBundle.ts (zip) · sources.ts (?raw imports)
src/components/  Masthead, Stage, StageControls, BehaviorRail, Instrument, SpringGraph (+ graphMath),
                 ScrubField, Library, ExportDialog (export bench), RecoveryBanner
tests/unit/      vitest
tests/e2e/       editor.spec.ts · a11y.spec.ts · export-parity.spec.ts · export-zip.spec.ts · measure.ts
export-fixture-template/   the clean app exports are built in
```

See [DECISIONS.md](DECISIONS.md) for the architecture trade-offs and [PROGRESS.md](PROGRESS.md) for status.

## Credits

Built by [Maria Showalter](https://mariashowalter.com). Fonts: IBM Plex Sans and Mono (SIL Open Font License) via Fontsource. Zip: fflate (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
