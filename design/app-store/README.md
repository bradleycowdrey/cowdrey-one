# The Cowdrey family App Store screenshot standard

Every Cowdrey app's App Store screenshots are made with one template, [`store-frame.mjs`](store-frame.mjs), so every
set has the same type, the same sizes and the same device placement, and the apps look like one family side by side.
This is the master copy. Each app keeps a **word-for-word copy** of it; change it here, then copy it to every app.

## Type: Cowdrey One's

| | Font | Setting |
|---|---|---|
| Headline | **Fraunces** (variable; `web/fonts/fraunces.woff2`, SIL Open Font License) | weight 560, optical size 48, letter-spacing −0.012em, line-height 1.04, centred, balanced |
| Sub-line | **Instrument Sans** (variable; [`instrument-sans.woff2`](instrument-sans.woff2), SIL Open Font License) | weight 500, letter-spacing −0.005em, line-height 1.25, centred, balanced |
| Mac title bar | Instrument Sans | weight 600, 22 px |

Fraunces at 560 / opsz 48 / −0.012em is exactly how Cowdrey One sets its titles.

## Sizes (output pixels)

| | Canvas | Headline | Sub-line | Gap | Side margin | Copy top | Device |
|---|---|---|---|---|---|---|---|
| **iPhone 6.9"** | 1320 × 2868 | 118 px | 54 px | 30 | 70 | hangs from the phone: the sub-line's baseline sits 96 px above it | top at 560 (460 for a set whose headlines are all one line); screen 440 × 956 pt at 2.28× in a graphite frame |
| **iPad 13"** | 2064 × 2752 | 128 px | 59 px | 32 | 150 | 150 | top at 620; screen 1032 × 1376 pt at 1.42× |
| **Mac** | 2880 × 1800 | 104 px | 48 px | 24 | 300 | 112 | a 2280 px wide window (an app of 1180 × 700 pt) with a 28 pt macOS title bar, top at 340 |

## The rules

- **The real app, in dark mode.** Capture the actual app at the device's size (iPhone 1320 × 2868, iPad 2064 × 2752,
  Mac 1180 × 700 pt at 2×) with realistic, fictional content. No mock-ups and no personal data.
- **Copy.** A headline of one or two lines and one sub-line that wraps at most once. Every headline in a set has the
  same number of lines (pass `lines` for the set). The template refuses copy that runs into the device or off the top.
- **Colour.** Each app has its theme in `THEMES` (a dark ground in the app's own hue, its glow and floor, the ink and
  sub-line colours). Nothing else changes between apps.
- **Output.** Opaque RGB PNGs (App Store Connect refuses an alpha channel) at the exact App Store sizes above.

| App | Theme | Its App Store screenshot generator |
|---|---|---|
| Cowdrey.PDF | `pdf` | `tests/app-store-screens.mjs` |
| Cowdrey.MD | `md` | `tests/app-store-screens.mjs` |
| Meridian | `meridian` | |
| Two Degrees | `twodegrees` | |
| Bearings | `bearings` | |
| Golden Hour | `goldenhour` | |
| Cowdrey One | `one` | |

## Using it

```js
import { compose, THEMES } from './store-frame.mjs';
const fonts = { fraunces: <base64 of fraunces.woff2>, instrument: <base64 of instrument-sans.woff2> };
const png = await compose(browser, 'iphone', { head: 'Every time zone\nat a glance.', sub: 'Your cities, photos and hours side by side.',
  png: rawScreenPng, title: 'Meridian', lines: 2, file: 'iphone-1-main.png' }, THEMES.meridian, fonts);
```

`browser` is a Playwright Chromium browser; `\n` in a headline is a line break.
