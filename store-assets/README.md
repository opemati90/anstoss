# Anstoss store media

Ready-to-upload English store artwork built from the real seeded Anstoss UI.
The visual system uses restrained European football-editorial art direction:
bottle green, warm ivory, tactile photography, and clear product-led typography.

## Upload bundles

- `app-store-upload.zip` — six App Store screenshots plus the 1024 px icon
- `play-store-upload.zip` — six Play screenshots, the feature graphic, and the 512 px icon

The ZIP entries are byte-verified against the rendered files after generation.

## App Store

- `app-store/en-US/app-icon-1024.png` — 1024 × 1024 app icon
- `app-store/en-US/01-*.png` through `06-*.png` — 1290 × 2796 portrait screenshots

## Google Play

- `play-store/en-US/play-icon-512.png` — 512 × 512 high-resolution icon
- `play-store/en-US/feature-graphic-1024x500.png` — 1024 × 500 feature graphic
- `play-store/en-US/01-*.png` through `06-*.png` — 1080 × 1920 phone screenshots

## Regeneration

Run `node store-assets/generate-store-assets-v2.js` from the repository root. The
generator uses Sharp and the checked-in/source captures in `store-assets/source`.
It writes a contact sheet to `store-assets/shared/store-screenshot-preview.png`.

Marketing copy intentionally describes existing behavior only. It does not claim in-app dues processing or licensed live fixture data.
