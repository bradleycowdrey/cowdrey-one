// A self-check of the family template: renders one Mac picture on the MacBook (a desktop from desktop() with
// Cowdrey One's Discover as its window) and one in the default window, and checks both are opaque 2880 x 1800 RGB
// PNGs and the desktop is a 3024 x 1964 RGB PNG.
//   node design/app-store/self-check.mjs [out-dir]   (after npm ci and npx playwright install chromium)
// With out-dir, the three pictures are written there.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { compose, desktop, THEMES, MACBOOK } from './store-frame.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : null;
const fonts = {
  fraunces: fs.readFileSync(path.join(root, 'web/fonts/fraunces.woff2')).toString('base64'),
  instrument: fs.readFileSync(path.join(here, 'instrument-sans.woff2')).toString('base64'),
};
const capture = fs.readFileSync(path.join(root, 'docs/mac-discover.png'));   // a 1440 x 900 capture of the Mac app
const size = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20), rgb: b[25] === 2 && b[24] === 8 });
const expect = (name, b, w, h) => {
  const s = size(b);
  if (s.w !== w || s.h !== h || !s.rgb) throw new Error(`${name}: ${s.w}x${s.h} rgb=${s.rgb}, wanted ${w}x${h} RGB`);
  console.log(`ok  ${name}: ${w}x${h} RGB`);
  if (out) fs.writeFileSync(path.join(out, name), b);
};

const browser = await chromium.launch();
try {
  const theme = THEMES.one;
  const screen = await desktop(browser, {
    theme, app: 'Cowdrey One', fonts,
    windows: [{ png: capture, w: 1216, h: 760, chrome: 'none', lights: true }],
  });
  expect('desktop.png', screen, MACBOOK.desktop[0] * 2, MACBOOK.desktop[1] * 2);
  const story = { head: 'Every Cowdrey app in one place', sub: 'Discover, get and update them all from one window.', title: 'Cowdrey One' };
  expect('mac-macbook.png', await compose(browser, 'mac', { ...story, device: 'macbook', png: screen, file: 'mac-macbook.png' }, theme, fonts), 2880, 1800);
  expect('mac-window.png', await compose(browser, 'mac', { ...story, png: capture, screen: [1440, 900], file: 'mac-window.png' }, theme, fonts), 2880, 1800);
} finally {
  await browser.close();
}
