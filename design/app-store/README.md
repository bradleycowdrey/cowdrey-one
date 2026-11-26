# The Cowdrey family App Store screenshot standard

Every Cowdrey app's App Store screenshots are made with one template, [`store-frame.mjs`](store-frame.mjs), so every
set has the same type, the same sizes and the same device placement, and the apps look like one family side by side.
This is the master copy. Each app keeps a **word-for-word copy** of it; change it here, then copy it to every app.

## Type: Cowdrey One's

| | Font | Setting |
|---|---|---|
| Headline | **Fraunces** (variable; `web/fonts/fraunces.woff2`, SIL Open Font License) | weight 560, optical size 48, letter-spacing −0.012em, line-height 1.04, centred, balanced |
| Sub-line | **Instrument Sans** (variable; [`instrument-sans.woff2`](instrument-sans.woff2), SIL Open Font License: [licence](InstrumentSans-LICENSE.txt)) | weight 500, letter-spacing −0.005em, line-height 1.25, centred, balanced |
| Mac title bar | Instrument Sans | weight 600, 22 px (plain window); 13 pt on the desktop |
| Mac menu bar | Instrument Sans | 13.5 pt, weight 500 (the app's name 700), white on a 32 pt bar |

Fraunces at 560 / opsz 48 / −0.012em is exactly how Cowdrey One sets its titles.

## Sizes (output pixels)

| | Canvas | Headline | Sub-line | Gap | Side margin | Copy top | Device |
|---|---|---|---|---|---|---|---|
| **iPhone 6.9"** | 1320 × 2868 | 118 px | 54 px | 30 | 70 | hangs from the phone: the sub-line's baseline sits 96 px above it | top at 560 (460 for a set whose headlines are all one line); screen 440 × 956 pt at 2.28× in a graphite frame |
| **iPad 13"** | 2064 × 2752 | 128 px | 59 px | 32 | 150 | 150 | top at 620; screen 1032 × 1376 pt at 1.42× |
| **Mac** | 2880 × 1800 | 104 px | 48 px | 24 | 300 | 112 | a **MacBook** (14" MacBook Pro in silver) showing the app on a macOS desktop: lid top at 340, the base's front edge from x 300 to 2580 (bottom 1747), screen 2000 × 1299 px at (440, 371) showing a 1512 × 982 pt desktop at 2× (3024 × 1964 px) made by `desktop()`. (The older plain window, `device` left out: 2280 px wide, an app of 1180 × 700 pt, 28 pt title bar, top at 340.) |

## The rules

- **The real app, in dark mode.** Capture the actual app at the device's size (iPhone 1320 × 2868, iPad 2064 × 2752,
  Mac windows at 2× of their point size) with realistic, fictional content. No mock-ups and no personal data.
- **Copy.** A headline of one or two lines and one sub-line that wraps at most once. Every headline in a set has the
  same number of lines (pass `lines` for the set). The template refuses copy that runs into the device or off the top.
- **Colour.** Each app has its theme in `THEMES` (a dark ground in the app's own hue, its glow and floor, the ink and
  sub-line colours, and `desk`, its MacBook desktop's wallpaper). Nothing else changes between apps.
- **Output.** Opaque RGB PNGs (App Store Connect refuses an alpha channel) at the exact App Store sizes above.

| App | Theme | Its App Store screenshot generator |
|---|---|---|
| Cowdrey.PDF | `pdf` | `tests/app-store-screens.mjs` |
| Cowdrey.MD | `md` | `tests/app-store-screens.mjs` |
| Meridian | `meridian` | `scripts/appstore-shots.mjs` |
| Two Degrees | `twodegrees` | `scripts/app-store-screens.mjs` |
| Bearings | `bearings` | `scripts/store-frames.mjs` |
| Golden Hour | `goldenhour` | `tests/app-store-screens.mjs` (iPhone only; the app is iPhone-only) |
| Cowdrey One | `one` | `tests/app-store-screens.mjs` (`npm run screens`), using this master copy |

## Using it

```js
import { compose, THEMES } from './store-frame.mjs';
const fonts = { fraunces: <base64 of fraunces.woff2>, instrument: <base64 of instrument-sans.woff2> };
const png = await compose(browser, 'iphone', { head: 'Every time zone\nat a glance.', sub: 'Your cities, photos and hours side by side.',
  png: rawScreenPng, title: 'Meridian', lines: 2, file: 'iphone-1-main.png' }, THEMES.meridian, fonts);
```

`browser` is a Playwright Chromium browser; `\n` in a headline is a line break.

### The Mac: the app on a MacBook

Every app's Mac pictures show the app on a MacBook, on the same desktop. First draw the desktop (the MacBook's whole
screen) with `desktop()`, then frame it with `device: 'macbook'`:

```js
import { compose, desktop, THEMES } from './store-frame.mjs';
const screen = await desktop(browser, {
  theme: THEMES.twodegrees, app: 'Two Degrees', fonts,                 // no clock: every app shows MAC_CLOCK
  menuExtra: { text: '55° · 13°', icon: 'sun' },          // the app's menu-bar item, if it has one
  windows: [{ png: windowCapture, w: 800, h: 520, chrome: 'none', lights: true }],   // points; x, y left out = centred
  extras: [{ png: widgetPng, x: 60, y: 80, w: 344, h: 344 }],                      // widgets, under the windows
});
const png = await compose(browser, 'mac', { head: 'Every temperature in °F and °C', sub: 'Both units, side by side.',
  device: 'macbook', png: screen, file: 'mac-1.png' }, THEMES.twodegrees, fonts);
```

- `desktop(browser, { theme, app, windows, extras?, menuExtra?, dock?, fonts? })` returns a 3024 × 1964 RGB
  PNG: a 1512 × 982 pt screen at 2× with the app's wallpaper (`theme.desk`), a 32 pt macOS menu bar
  (Apple menu, the app's name in bold, File Edit View Window Help; the app's extra, Wi-Fi, a full battery, Control
  Center, the clock) and the windows. Everything is in points.
- `windows: [{ png, x?, y?, w, h, title?, chrome?, lights? }]`: the window's outer box. `chrome: 'window'` (default)
  adds a 28 pt dark title bar with the traffic lights and `title` (default: `app`) and puts `png` under it; `'none'`
  shows `png` as the whole window, for an app that draws its own title bar (`lights: true` adds the traffic lights).
  10 pt corners, a fine rim and macOS's shadow. Capture the window at 2× its point size.
- **Which chrome.** An app whose capture already contains its own toolbar or title (a unified/transparent title bar
  drawn by the app) uses `chrome: 'none', lights: true`. An app whose capture has no title bar uses
  `chrome: 'window'` with the app's name as the title (the default `title`). Never both, never neither.
- **Window size.** Windows are shown at their real point size: `w`, `h` are the window's points and the 2× capture
  is drawn at 0.5 (`scale` 1, the default). Only a window narrower than 600 pt may be enlarged so it reads:
  `windows[i].scale` from 1 up to 1.5 (the box becomes `w × scale` by `h × scale`, chrome included; `x`, `y` place the
  enlarged box). Any other `scale` (below 1, above 1.5, or above 1 on a window 600 pt or wider) is refused.
- **One clock.** The menu bar's clock is `MAC_CLOCK` (`'Wed Nov 25  9:41 AM'`), the default of `desktop()`, so every
  app's desktop shows the same time. Apps must not pass their own `clock`.
- **Wallpapers.** Each theme's `desk: [top, middle, bottom]` is its desktop: md indigo ink, pdf raspberry wine,
  meridian teal night, twodegrees sky blue to a peach dusk, bearings compass blue to ice, goldenhour amber gold,
  one clay terracotta. Each is lighter than its page's ground and differs from the others at thumbnail size. A
  custom theme without `desk` gets a wallpaper worked out from its ground's hue.
- `extras: [{ png, x, y, w, h, radius? }]`: widgets on the desktop (22 pt corners unless `radius`).
- `menuExtra: { text, icon? }`: `icon` is `'sun'`, an `<svg>` string drawn in white (`currentColor`) or a PNG Buffer.
- `dock`: left out or `false` (the Dock hidden, as many people keep it), or `{ icon: png }` for a Dock with the app's
  icon and its running dot.
- Keep the menu bar's middle (the notch, 190 pt) clear: nothing is drawn there.
- `MACBOOK` exports the geometry (the screen is 2000 × 1299 px at (440, 371) on the canvas).
- `node design/app-store/self-check.mjs [out-dir]` renders one MacBook and one plain-window Mac picture and checks
  their sizes and that they are RGB.
