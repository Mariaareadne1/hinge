# Decisions

## D1 — An authored closed-form spring instead of Motion's animator
Motion (motiondivision/motion, MIT) was the brief's suggested runtime. Hinge's core promise is that the
curve it draws, the stage and the exported component are the same motion. With Motion, the curve would be
a second implementation (or sampled from an animation), and exports would depend on Motion's internals
across versions. A closed-form damped oscillator is ~60 lines, has no frame-rate dependence, gives exact
velocity for re-seeding on interruption, and can be copied into exports so they depend on React only.
Trade-off: no Motion layout animations, gestures library or variants; Hinge only animates transforms and
one CSS variable. Units match Motion/React Spring conventions so values transfer.

## D2 — Exports reuse the specimen source, not a template
`src/specimens/*.tsx` are real components the stage renders. Generation replaces one marked import block
with the tuned `BEHAVIOR` constant and rewrites two import paths. A unit test fails if the markers go
missing; another proves no export imports anything outside its folder. This removes the usual drift
between "preview" and "generated" code.

## D3 — Imperative DOM writes inside a React hook
The runtime writes `transform` and `--hinge-lift` directly and only runs requestAnimationFrame while a
channel is unsettled. React renders only when state labels change. The measured graph trace is held in a
tiny external store (`useSyncExternalStore`) so only the graph re-renders per frame — the first version put
it in App state and caused dropped frames on the stage (found by the parity test).

## D4 — Only re-seed channels whose target changes
Found by export parity: a pointerleave during a drag release (browsers re-hit-test a stationary pointer
after layout changes) switched x/y to the hover spring mid-flight. Now a transition leaves a channel alone
if its target is unchanged.

## D5 — Keyboard focus, not click focus, stands in for hover
Clicking a focusable card focused it, which then kept it "hovered" after the pointer left; tapping on
touch did the same. The runtime now checks `:focus-visible`.

## D6 — localStorage, versioned, never silently overwritten
Projects are small JSON; IndexedDB would add complexity without benefit. Each project is validated and
clamped on load; damaged projects are skipped with a notice; an unreadable library pauses autosave and
offers a raw backup download before anything is replaced. A `pagehide` flush prevents losing an edit made
inside the 350 ms autosave delay.

## D7 — Measurement tolerances are timing-aware
Frame-sampled recordings jitter by up to a frame. Comparisons fit one latency (≤ 34 ms) and allow
|slope| × 1/60 s per sample; raw differences are printed alongside. A pixel threshold that ignores slope
reported 6 px "errors" on a 1300 px/s release that matched the model to 0.04 px once timing was accounted for.
