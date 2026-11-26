// Cowdrey One's App Store screenshots: iPhone 6.9" (1320 x 2868), iPad 13" (2064 x 2752) and Mac (2880 x 1800), five
// of each, on the Cowdrey family template (design/app-store/store-frame.mjs in Cowdrey One's clay, THEMES.one; the
// standard is design/app-store/README.md).
//
// Each picture is the real app (web/, served here) in dark mode at the device's size, as the installed app shows it:
// its native side stood in for as in tests/e2e.cjs (the iPhone and iPad app, the Mac app), the Terms already agreed,
// Two Degrees on the iPhone and iPad (seen by its link, twodegrees://), Meridian and Two Degrees on the Mac, and
// GitHub's releases API answered here with each app's notes. Nothing goes to the network.
//
// Run (after npm ci and npx playwright install chromium):
//      npm run screens [-- --only=iphone,ipad,mac] [--shots=1,2] [--raw=dir] [--reuse]
//   -> docs/app-store/{iphone,ipad,mac}-N-<story>.png (RGB, no alpha, as App Store Connect wants them)
//   --raw=dir keeps each raw screen as dir/<device>-<story>.png; with --reuse it composes from those instead.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { compose, desktop, THEMES } from '../design/app-store/store-frame.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(root, 'web');
const OUT = path.join(root, 'docs/app-store');
const ARG = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ONLY = ARG.only ? String(ARG.only).split(',') : ['iphone', 'ipad', 'mac'];
const SHOTS = ARG.shots ? String(ARG.shots).split(',').map(Number) : null;
const RAW = ARG.raw ? path.resolve(String(ARG.raw)) : null;

/* ---------------- the devices ---------------- */
// Screens in points, and the safe areas of the real screens (iPhone 16 Pro Max and 13-inch iPad Pro), as Cowdrey.PDF's
// generator puts them in. The Mac app is captured as its whole window at its real width (1180, tauri.conf.json), and
// each picture sets the window's size for what it shows (macW, macH, or a height measured by fit), so each window
// ends at a clean break, never through a card or a row:
// - Discover is wider (1320), so its carousel shows three apps, and ends in the gap below the set-up card, above All
//   Apps (whose boxes of three apps are too tall for the window to end below them).
// - An app's page (Bearings) and Get Every App are in a narrower window (1044), where the sheet fills the whole
//   column beside the sidebar, so no dimmed words are cut by its edges. The app's page ends just below What's New's
//   first note; Get Every App ends below its last app and the note under them (fitSheet). Discover behind each is scrolled so the thin
//   strips above and below the sheet hold no words or pictures (toClearStrips).
// - The Library ends between its last card and Settings, Get on Your Phone between its last card and the words below
//   it (fitGap).
// The Mac pictures are the Mac App Store version (desktop/build.mjs STORE=appstore, window.COWDREY_STORE = 'appstore'),
// which, like the iPhone and iPad app, names and shows no other platform, browser or system (App Review guideline
// 2.3.10) and downloads or installs nothing (2.4.5, 2.5.2); capture() refuses a picture that shows any of it.
// The window lays its title bar over the top 28 points (titleBarStyle Overlay, hiddenTitle), so the template adds only the
// traffic lights there, and the window is shown on the family's MacBook desktop (desktop(), device 'macbook').
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
const DEVICES = {
  iphone: { w: 440, h: 956, scale: 3, touch: true, safe: { top: 62, bottom: 34 }, name: 'iPhone' },
  ipad: { w: 1032, h: 1376, scale: 2, touch: true, safe: { top: 24, bottom: 20 }, name: 'iPad' },
  mac: { w: 1180, h: 872, scale: 2, touch: false, safe: { top: 0, bottom: 0 }, name: 'Mac' },
};
// What's on each device: the iPhone and iPad app sees Two Degrees by its link; the Mac app sees Meridian on the Mac,
// and not yet Two Degrees, the app on the Mac App Store, so Get Every App shows the way to get it there.
const INSTALLED = {
  iphone: { twodegrees: true },
  ipad: { twodegrees: true },
  mac: { meridian: { version: '2.1.4' } },
};
// A Tuesday morning, for the date on Discover and "Checked 9:41 AM". The Mac's is the Wednesday morning that the
// family's MacBook desktop shows in its menu bar (MAC_CLOCK, the same for every app), so the two agree.
const NOW = { iphone: '2026-11-24T09:41:00-05:00', ipad: '2026-11-24T09:41:00-05:00', mac: '2026-11-25T09:41:00-05:00' };
const ZONE = 'America/New_York';

/* ---------------- each app's latest release on GitHub, with notes from its changelog ---------------- */
const RELEASES = {
  'cowdrey-pdf': { v: '1.0.0', at: '2026-11-18T17:20:00Z', notes: `**Cowdrey.PDF 1.0.** A full PDF viewer and editor, free, on your device, with nothing uploaded.

- **Edit text and pictures in place:** click a line and retype it in its own font, size and colour.
- **Sign and fill forms**, with a signature kept on your device for next time.
- **Organize pages**, OCR for scanned pages, redact, protect and compress.` },
  'cowdrey-md': { v: '2.0.2', at: '2026-11-19T15:05:00Z', notes: `Android and the Mac now work like the iPhone app.

- **Android shares like the iPhone.** Share Markdown, Word and web page open the Android share sheet, and Share PDF… makes a PDF and shares it in one step.
- **The Mac has a share menu:** File → Share… opens Mail, Messages, AirDrop and Notes.
- **The Mac picks up changes made elsewhere**, as on iPhone and Android. Your unsaved edits are never replaced.
- **Appearance on the Mac:** Match system, Light and Dark are in the View menu.` },
  meridian: { v: '2.1.4', at: '2026-11-13T18:30:00Z', notes: `- **Soft edges:** each city's photo fades gently into the background at the edge of its row, and every hour tile has a thin, softly blurred outline instead of a hard edge. In the panel and the widgets.
- **Widgets laid out like the panel:** compact text, slim hour tiles and the city photo showing between them.
- **Widgets show more:** whether each city is working, off hours or on a weekend, with off-hours tiles dimmed.` },
  'two-degrees': { v: '2.3.5', at: '2026-11-21T16:45:00Z', notes: `- **Two Degrees for Mac is on the Mac App Store.** The iPhone app's "Get Two Degrees for Mac" link now opens it.
- **Android widgets like the iPhone's:** the other unit beside the reading, and today's range in both units.` },
  bearings: { v: '2.4.0', at: '2026-11-22T14:10:00Z', notes: `- **Android map:** place names no longer show as white blocks.
- **Extra Large** shows bigger numbers in its summary row, on every platform.
- **Widgets:** cleaner sun and moon marks that stay clear of N, E, S and W.` },
};
function release(repo) {
  const r = RELEASES[repo];
  if (!r) return null;
  const dl = { 'cowdrey-pdf': 'Cowdrey.PDF.dmg', 'cowdrey-md': 'Cowdrey.MD.dmg', meridian: 'Meridian.dmg', 'two-degrees': 'TwoDegrees.dmg', bearings: 'Bearings.dmg' }[repo];
  // As GitHub has them: the notes, then the downloads, which What's New leaves out.
  return { tag_name: 'v' + r.v, name: 'v' + r.v, published_at: r.at, html_url: `https://github.com/bradleycowdrey/${repo}/releases/tag/v${r.v}`,
    body: `## What's new\n\n${r.notes}\n\n## Downloads\n\n| Mac | https://github.com/bradleycowdrey/${repo}/releases/download/v${r.v}/${dl} |` };
}

/* ---------------- the app, served here ---------------- */
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(WEB, path.normalize(p));
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// The app's native side, as tests/e2e.cjs stands in for it: what's installed, and nothing else to do.
function fakeNative(installed) {
  const answer = async (cmd, args) => {
    if (cmd === 'installed_apps') {   // the Mac app: what's in Applications
      const r = {};
      for (const a of args.apps) if (installed[a.id]) r[a.id] = { version: installed[a.id].version, appStore: !!installed[a.id].appStore, path: '/Applications/' + a.appName };
      return r;
    }
    if (cmd === 'plugin:installer|native' && args.method === 'canOpen') {   // the iPhone and iPad app: which links open
      const open = {};
      for (const sc of args.args.schemes) open[sc] = !!installed[sc];
      return { open };
    }
    return null;
  };
  window.__TAURI__ = { core: { invoke: answer }, event: { listen: async () => () => {} }, opener: { openUrl: async () => {} } };
}

// Each device has a browser of its own, with the screen's size and scale set when it starts: with the scale only
// emulated, Chromium draws the frosted glass (backdrop-filter blur, as on the tab bar and the cards' bars) clear.
let browser, server, base, termsVersion, css;
const devices = {};
async function app(kind, h = DEVICES[kind].h, w = DEVICES[kind].w) {
  const d = DEVICES[kind];
  devices[kind + w + 'x' + h] ||= await chromium.launch({ args: [`--force-device-scale-factor=${d.scale}`, `--window-size=${w},${h}`] });
  const ctx = await devices[kind + w + 'x' + h].newContext({
    viewport: null, hasTouch: d.touch, userAgent: UA[kind], colorScheme: 'dark', locale: 'en-US', timezoneId: ZONE,
  });
  await ctx.clock.setFixedTime(new Date(NOW[kind]));
  // The device's safe areas, which a browser doesn't have (env() is 0 there).
  let sheet = css;
  for (const [side, v] of Object.entries({ top: d.safe.top, bottom: d.safe.bottom })) sheet = sheet.split(`env(safe-area-inset-${side}, 0px)`).join(v + 'px');
  await ctx.route(base + 'app.css', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: sheet }));
  await ctx.route((url) => !url.href.startsWith(base), (r) => {
    const u = r.request().url();
    if (u.startsWith('https://api.github.com/repos/')) {
      const body = release(u.split('/repos/')[1].split('/')[1]);
      return r.fulfill({ status: body ? 200 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body || {}) });
    }
    return r.abort();
  });
  await ctx.addInitScript((v) => localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 })), termsVersion);
  await ctx.addInitScript(fakeNative, INSTALLED[kind]);
  if (kind === 'mac') await ctx.addInitScript(() => { window.COWDREY_STORE = 'appstore'; });   // the Mac App Store version
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  const screen = await p.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
  if (screen.join() !== [w, h, d.scale].join()) throw new Error(`${kind}: a ${screen.join(' x ')} screen, not ${w} x ${h} x ${d.scale}`);
  // It checks GitHub for new versions 1.2 seconds after it starts.
  await p.waitForFunction(() => !!localStorage.getItem('cowdrey-one.checkedAt'), null, { timeout: 10000 });
  await p.waitForTimeout(400);
  p.ctx = ctx;
  return p;
}
// A tap or click, as the app gets it (without scrolling the page to the button first).
const tap = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const wide = (p) => p.evaluate(() => innerWidth >= 900);
const tab = async (p, t) => tap(p, (await wide(p)) ? `.side-item[data-tab="${t}"]` : `.tab[data-tab="${t}"]`);
// For an app's page and Get Every App on the Mac: the sheet fills the column beside the sidebar and stops 30 points short of the
// window's top and bottom, so Discover shows, dimmed, in a strip above and below it. Discover is scrolled so that
// neither strip holds any words or pictures (only the cards' and boxes' plain backgrounds), the first such place.
const toClearStrips = async (p) => p.evaluate(() => {
  const main = document.querySelector('#view-discover');
  const boxes = [];
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 3) });
  for (let n; (n = walk.nextNode());) { const r = document.createRange(); r.selectNodeContents(n); boxes.push(...r.getClientRects()); }
  for (const e of main.querySelectorAll('img, svg')) boxes.push(e.getBoundingClientRect());
  const spans = boxes.filter((r) => r.width && r.height).map((r) => [r.top + scrollY, r.bottom + scrollY]);
  const clear = (a, b) => spans.every(([t, u]) => u <= a || t >= b);
  const max = document.documentElement.scrollHeight - innerHeight;
  for (let y = 0; y <= max; y++) if (clear(y, y + 30) && clear(y + innerHeight - 30, y + innerHeight)) return window.scrollTo(0, y), y;
  throw new Error('no scroll position leaves both strips beside the page clear');
});

// Window heights measured from the app itself (fit), so a window ends at a clean break whatever the words above:
// - fitGap(sel): the page ends in the middle of the gap between the last card and sel (the next words), never
//   through a card.
// - fitSheet: Get Every App's sheet ends just above its Done button, below every app and the note under them (a sheet
//   is 60 points shorter than the window, and at most 860 tall; all of it, Done too, is a point taller than that).
const fitGap = (sel) => async (p) => p.evaluate((s) => {
  const next = document.querySelector(s), top = next.getBoundingClientRect().top;
  const cards = [...document.querySelectorAll('main .view:not([hidden]) .group, main .view:not([hidden]) .qr-card')]
    .map((e) => e.getBoundingClientRect().bottom).filter((b) => b <= top);
  return Math.round((Math.max(...cards) + top) / 2 + scrollY);
}, sel);
const fitSheet = async (p) => p.evaluate(() => {
  const s = document.querySelector('.sheet'), sc = s.querySelector('.sheet-scroll');
  const done = sc.querySelector('[data-act="close"]').closest('p');
  const h = s.offsetHeight - sc.clientHeight + (done.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop) - 10;
  if (h > 860) throw new Error(`Get Every App is ${h} points tall, more than a sheet can be`);
  return h + 60;
});

/* ---------------- the stories ---------------- */
// One idea each, in the order of the App Store pictures (and of Cowdrey One's Google Play screenshots).
// Headlines are two lines, so the iPhone sits at the family's two-line height; the Mac joins them into one line
// (two lines and a sub-line don't fit above the MacBook), as Cowdrey.PDF does.
const STORIES = [
  { slug: 'discover', head: 'Every app,\none place.', sub: 'All of Bradley Cowdrey’s free apps.', macW: 1320, macH: 724,
    async shoot() {} },
  { slug: 'app-page', head: 'Know each app,\ninside and out.', sub: 'What it does, what’s new, where to get it.', macW: 1044, macH: 894,
    async shoot(p, kind) { if (kind === 'mac') await toClearStrips(p); await tap(p, `#all-apps [data-id="${kind === 'mac' ? 'bearings' : 'meridian'}"] .main`); } },
  { slug: 'get-every-app', macW: 1044, fit: fitSheet, head: 'Get them all,\nin one go.', sub: (kind) => (kind === 'mac' ? 'One click each, on the Mac App Store or the web.' : 'One tap for each app, or Get All.'),
    async shoot(p, kind) { if (kind === 'mac') await toClearStrips(p); await tap(p, '#setup-slot [data-act="setup"]'); } },
  { slug: 'library', head: (kind) => (kind === 'iphone' ? 'On this iPhone,\nready to open.' : `What’s on this\n${DEVICES[kind].name}.`), sub: 'Open what you have, get what you don’t.', fit: fitGap('#view-library .group-label'),
    async shoot(p) { await tab(p, 'library'); } },
  { slug: 'share', head: 'Share any app\nin a tap.', sub: (kind) => (kind === 'mac' ? 'A QR code for your iPhone.' : 'A QR code for any phone.'), fit: fitGap('#view-share .promise'),
    async shoot(p) { await tab(p, 'share'); } },
];
const text = (v, kind) => (typeof v === 'function' ? v(kind) : v);

const MAX_H = 920;   // the tallest window that fits on the MacBook's desktop, below its menu bar
async function macHeight(story) {
  if (story.fit) {
    const w = story.macW || DEVICES.mac.w;
    const p = await app('mac', MAX_H, w);
    await story.shoot(p, 'mac');
    await p.waitForTimeout(900);
    const h = Math.round(await story.fit(p));
    await p.ctx.close();
    if (h > MAX_H) throw new Error(`mac ${story.slug}: needs a ${h}-point window, taller than the desktop`);
    story.macH = h;
  }
  return story.macH || DEVICES.mac.h;
}
async function capture(kind, story) {
  const d = DEVICES[kind], h = (kind === 'mac' && story.macH) || d.h, w = (kind === 'mac' && story.macW) || d.w;
  const p = await app(kind, h, w);
  await story.shoot(p, kind);
  // Sheets slide up and views fade in; then every picture on the screen has loaded.
  await p.waitForTimeout(900);
  await p.waitForFunction(() => [...document.images].every((i) => {
    const r = i.getBoundingClientRect();
    return i.complete || !r.height || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth;
  }), null, { timeout: 10000 });
  if (kind === 'mac') await p.mouse.move(w - 4, h - 4);
  await p.waitForTimeout(300);
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  const ok = await p.evaluate(() => ({ native: window.CowdreyOne.native, dark: document.documentElement.dataset.theme,
    android: (document.body.innerText.match(/Android|Google Play|Chrome|\bEdge\b|Windows|Linux|\.dmg\b|\bDMG\b|\bAPK\b|Install All|Download All|Download \(|in Applications/) || [])[0]
      || (document.querySelector('use[href="#i-android"]') ? 'the Android icon' : '') }));
  // The App Store versions name no other platform, browser or system, and download or install nothing.
  if (ok.android) throw new Error(`${kind} ${story.slug}: shows ${ok.android}, which App Store pictures must not`);
  if (ok.native !== (kind === 'mac' ? 'mac' : 'ios') || ok.dark !== 'dark') throw new Error(`${kind} ${story.slug}: not the ${kind} app in dark mode (${JSON.stringify(ok)})`);
  if (p.errors.length) throw new Error(`${kind} ${story.slug}: ${p.errors.join('; ')}`);
  await p.ctx.close();
  return png;
}

// The MacBook's screen: Cowdrey One's window (its real size, centred below the menu bar) with its traffic lights
// over the app's own title-bar strip, the menu bar showing Cowdrey One, the Dock hidden.
const macDesktop = (png, w, h) => desktop(browser, {
  theme: THEMES.one, app: 'Cowdrey One', fonts: FONTS,
  windows: [{ png, w, h, chrome: 'none', lights: true }],
});

const b64 = (f) => fs.readFileSync(path.join(root, f)).toString('base64');
const FONTS = { fraunces: b64('web/fonts/fraunces.woff2'), instrument: b64('design/app-store/instrument-sans.woff2') };

(async () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(WEB, 'catalog.js'), 'utf8'), sandbox);
  termsVersion = sandbox.window.CATALOG.termsVersion;
  css = fs.readFileSync(path.join(WEB, 'app.css'), 'utf8');
  if (!css.includes('env(safe-area-inset-top, 0px)')) throw new Error('app.css no longer sets the safe areas as this expects');
  server = await serve();
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
  if (RAW) fs.mkdirSync(RAW, { recursive: true });
  try {
    for (const kind of ONLY) {
      const heads = STORIES.map((s) => (kind === 'mac' ? text(s.head, kind).replace(/\n/g, ' ') : text(s.head, kind)));
      // Every headline in a set has the same number of lines.
      const lines = new Set(heads.map((h) => h.split('\n').length));
      if (lines.size !== 1) throw new Error(`${kind}: headlines of different lengths`);
      for (const [k, story] of STORIES.entries()) {
        if (SHOTS && !SHOTS.includes(k + 1)) continue;
        const file = `${kind}-${k + 1}-${story.slug}.png`;
        const rawFile = RAW && path.join(RAW, `${kind}-${story.slug}.png`);
        if (kind === 'mac') await macHeight(story);
        const png = ARG.reuse && rawFile ? fs.readFileSync(rawFile) : await capture(kind, story);
        if (rawFile && !ARG.reuse) fs.writeFileSync(rawFile, png);
        const copy = { head: heads[k], sub: text(story.sub, kind), lines: [...lines][0], file };
        // The Mac: the app's window on the MacBook's desktop. The iPhone and iPad: the screen in its device.
        const out = kind === 'mac'
          ? await compose(browser, kind, { ...copy, device: 'macbook', png: await macDesktop(png, story.macW || DEVICES.mac.w, story.macH || DEVICES.mac.h) }, THEMES.one, FONTS)
          : await compose(browser, kind, { ...copy, png, title: 'Cowdrey One' }, THEMES.one, FONTS);
        fs.writeFileSync(path.join(OUT, file), out);
        console.log('wrote docs/app-store/' + file);
      }
    }
  } finally {
    await browser.close();
    for (const b of Object.values(devices)) await b.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
