# Third-party notices

Runtime dependencies bundled into the Hinge web app:

| Package | License | Use |
| --- | --- | --- |
| react, react-dom | MIT | UI |
| fflate | MIT | zip export |
| @fontsource/ibm-plex-sans, -mono | OFL-1.1 (fonts), MIT (package) | typography |

No third-party source is copied into this repository. Exported components contain only Hinge's own
runtime (MIT, additionally MIT-0 for exports) and depend only on React.

Development-only: Vite, TypeScript, Vitest, Playwright, ESLint (MIT / Apache-2.0), @axe-core/playwright (MPL-2.0, test-only, not bundled).

Design references studied for interaction quality (no code or layouts copied): rauno.me/craft, emilkowal.ski, matthewyu.dev, joshwcomeau.com/animation.
