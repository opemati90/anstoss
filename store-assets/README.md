# Anstoss store media

The bundles were recaptured and independently reviewed on **7 November 2026**.
They show the current adult-launch app using fictional simulator data. The
developer overlay is disabled, and the generator preserves complete screens
instead of applying the retired layout's fixed crops. `review.json` binds the
review to the source captures, outputs, ZIPs and source revision.

English store artwork built from the current Anstoss UI. Fictional club/chat
content remains German, as user-authored content does in the app.
The visual system uses restrained European football-editorial art direction:
bottle green, warm ivory, tactile photography, and clear product-led typography.

## Upload bundles

- `app-store-upload.zip` — six App Store screenshots plus the 1024 px icon
- `play-store-upload.zip` — six Play screenshots, the feature graphic, and the 512 px icon

The readiness check compares each ZIP's entry names and bytes with the reviewed
rendered files; it does not establish that the artwork itself is accurate.

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

Capture procedure: load the current Anstoss simulator bundle, disable the Expo
floating tools button, and run `apps/mobile/.maestro/store-capture.yaml` with
`CAPTURE_DIR` set to a dedicated output directory. Review all six captures
before copying them into `source`. The flow restores the app language to German.
These are iOS simulator screen captures; they are not proof of Android device
behavior or physical-device push delivery.

Marketing copy intentionally describes existing behavior only. It does not claim in-app dues processing or licensed live fixture data.
