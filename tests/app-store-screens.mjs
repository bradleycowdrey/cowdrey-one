// Cowdrey One's App Store screenshots on the Cowdrey family standard (design/app-store/README.md): iPhone 6.9"
// (1320 x 2868), iPad 13" (2064 x 2752) and Mac (2880 x 1800), five of each, on Cowdrey One's clay sky.
//
// Two steps:
//  1. Capture: the real app (web/, served here) in dark mode at each device's screen size, as the installed app shows
//     it: its native side stood in for as in tests/e2e.cjs (the iPhone and iPad app, the Mac app), the Terms already
//     agreed, Two Degrees on the iPhone and iPad (seen by its link, twodegrees://), Meridian and Two Degrees on the
//     Mac, and GitHub's releases API answered here with each app's notes. Nothing goes to the network.
//     These are Chromium captures of the web app, not the native app in a simulator, so iOS's status bar is drawn
//     here: 9:41, full signal, Wi-Fi and a full battery, in the top safe area where iOS puts it.
//     -> design/app-store/captures/<device>-<id>.png (not kept in git)
//  2. Frame: design/app-store/store-frames.js with design/app-store/apps/cowdrey-one.json (the words), then
//     design/app-store/check-measure.js checks every frame's type and positions against the standard.
//     -> docs/app-store/<device>-<n>-<id>.png (opaque RGB, as App Store Connect wants them) and measure.json
//
// Run (after npm ci and npx playwright install chromium):
//      npm run screens [-- --only=iphone,ipad,mac] [--reuse] [--captures=dir] [--out=dir]
//   --reuse frames the captures already in the captures folder without capturing again.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(root, 'web');
const FRAMES = path.join(root, 'design/app-store');
const CONFIG = path.join(FRAMES, 'apps/cowdrey-one.json');
const ARG = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ONLY = ARG.only ? String(ARG.only).split(',') : ['iphone', 'ipad', 'mac'];
const CAPS = path.resolve(root, String(ARG.captures || path.join(FRAMES, 'captures')));
const OUT = path.resolve(root, String(ARG.out || path.join(root, 'docs/app-store')));

/* ---------------- the devices ---------------- */
// Screens in points, and the safe areas of the real screens (iPhone 16 Pro Max and 13-inch iPad Pro). The Mac app is
// captured as its window at its real width (1180, tauri.conf.json) and 16:10 (738 points tall), the shape of the
// standard's Mac window; the frame draws the title bar above it.
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
const DEVICES = {
  iphone: { w: 440, h: 956, scale: 3, touch: true, safe: { top: 62, bottom: 34 }, name: 'iPhone' },
  ipad: { w: 1032, h: 1376, scale: 2, touch: true, safe: { top: 24, bottom: 20 }, name: 'iPad' },
  mac: { w: 1180, h: 738, scale: 2, touch: false, safe: { top: 0, bottom: 0 }, name: 'Mac' },
};
// What's on each device: the iPhone and iPad app sees Two Degrees by its link; the Mac app sees what's in
// Applications (Meridian from its .dmg, Two Degrees from the Mac App Store).
const INSTALLED = {
  iphone: { twodegrees: true },
  ipad: { twodegrees: true },
  mac: { meridian: { version: '2.1.4' }, 'two-degrees': { version: '2.3.5', appStore: true } },
};
// A Tuesday morning at 9:41, for the date on Discover, "Checked 9:41 AM" and the status bar.
const NOW = '2026-11-24T09:41:00-05:00';
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
let server, base, termsVersion, css;
const devices = {};
async function app(kind, h = DEVICES[kind].h) {
  const d = DEVICES[kind];
  devices[kind + h] ||= await chromium.launch({ args: [`--force-device-scale-factor=${d.scale}`, `--window-size=${d.w},${h}`] });
  const ctx = await devices[kind + h].newContext({
    viewport: null, hasTouch: d.touch, userAgent: UA[kind], colorScheme: 'dark', locale: 'en-US', timezoneId: ZONE,
  });
  await ctx.clock.setFixedTime(new Date(NOW));
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
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  const screen = await p.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
  if (screen.join() !== [d.w, h, d.scale].join()) throw new Error(`${kind}: a ${screen.join(' x ')} screen, not ${d.w} x ${h} x ${d.scale}`);
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
/* ---------------- iOS's status bar ---------------- */
// What iOS draws over the top safe area, in white for dark mode: 9:41 on the left; signal, Wi-Fi and a full battery on
// the right (iPadOS: the time and date on the left). Drawn in points, so it is the same on every capture.
function statusBar(kind, inter) {
  const bar = (x) => `<svg width="${x.w}" height="${x.h}" viewBox="0 0 ${x.w} ${x.h}" style="display:block">${x.body}</svg>`;
  const signal = bar({ w: 18, h: 12, body: [0, 1, 2, 3].map((i) => `<rect x="${i * 5}" y="${9 - i * 3}" width="3" height="${3 + i * 3}" rx="1" fill="#fff"/>`).join('') });
  const wifi = bar({ w: 17, h: 12, body: `<path d="M8.5 2.2c2.6 0 5 1 6.8 2.7l1.2-1.3A11.4 11.4 0 0 0 8.5.4 11.4 11.4 0 0 0 .5 3.6l1.2 1.3A9.6 9.6 0 0 1 8.5 2.2Zm0 3.6c1.6 0 3.1.6 4.3 1.7l1.2-1.3a8 8 0 0 0-11 0l1.2 1.3c1.2-1.1 2.7-1.7 4.3-1.7Zm0 3.6c.7 0 1.3.3 1.8.7L8.5 12 6.7 10.1c.5-.4 1.1-.7 1.8-.7Z" fill="#fff"/>` });
  const battery = bar({ w: 27, h: 13, body: `<rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="#fff" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.5" fill="#fff"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="#fff" fill-opacity=".45"/>` });
  const phone = kind === 'iphone';
  return { phone, inter, html: phone
    ? `<div style="position:absolute;left:0;width:150px;top:0;height:59px;display:flex;align-items:center;justify-content:center;padding-left:14px;font:600 17px/1 'SB Inter';letter-spacing:-.01em">9:41</div>
       <div style="position:absolute;right:0;width:150px;top:0;height:59px;display:flex;align-items:center;justify-content:center;gap:6px;padding-right:12px">${signal}${wifi}${battery}</div>`
    : `<div style="position:absolute;left:22px;top:0;height:24px;display:flex;align-items:center;font:600 13px/1 'SB Inter'">9:41&nbsp;&nbsp;Tue Nov 24</div>
       <div style="position:absolute;right:20px;top:0;height:24px;display:flex;align-items:center;gap:6px">${wifi}${battery}</div>` };
}
const drawStatusBar = (p, kind) => p.evaluate(({ html, inter }) => {
  const f = new FontFace('SB Inter', `url(data:font/ttf;base64,${inter})`, { weight: '600' });
  document.fonts.add(f);
  const d = document.createElement('div');
  d.setAttribute('aria-hidden', 'true');
  d.style.cssText = 'position:fixed;inset:0 0 auto 0;height:0;z-index:2147483647;pointer-events:none;color:#fff;-webkit-font-smoothing:antialiased';
  d.innerHTML = html;
  document.body.appendChild(d);
  return f.load();
}, statusBar(kind, INTER));
const INTER = fs.readFileSync(path.join(FRAMES, 'fonts/Inter-SemiBold.ttf')).toString('base64');

/* ---------------- the screens ---------------- */
// One idea each, in the App Store order of apps/cowdrey-one.json (the words are there). Every screen is one the app
// shows as it is, from its top: Discover, an App Store app's page (Bearings), the Library, Meridian's page with its
// Get button (on the Mac, Get Every App with Install All) and Get on Your Phone.
// Discover's carousel starts on Bearings' card (one swipe, data-act="slide"), so frame 1 shows a whole featured
// card for an app on the App Store rather than the first card's screenshot cut off under its bar.
const SCREENS = {
  discover: async (p) => { await tap(p, '.dots [data-i="4"]'); },
  app: async (p) => { await tap(p, '#all-apps [data-id="bearings"] .main'); },
  library: async (p) => { await tab(p, 'library'); },
  get: async (p, kind) => { await tap(p, kind === 'mac' ? '#setup-slot [data-act="setup"]' : '#all-apps [data-id="meridian"] .main'); },
  share: async (p) => { await tab(p, 'share'); },
};

async function capture(kind, id) {
  const d = DEVICES[kind];
  const p = await app(kind);
  await SCREENS[id](p, kind);
  // Sheets slide up, the carousel glides and views fade in; then every picture on the screen has loaded.
  await p.waitForTimeout(1200);
  await p.waitForFunction(() => [...document.images].every((i) => {
    const r = i.getBoundingClientRect();
    return i.complete || !r.height || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth;
  }), null, { timeout: 10000 });
  if (kind === 'mac') await p.mouse.move(d.w - 4, d.h - 4);
  else await drawStatusBar(p, kind);
  await p.waitForTimeout(300);
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: d.w, height: d.h } });
  const ok = await p.evaluate(() => ({ native: window.CowdreyOne.native, dark: document.documentElement.dataset.theme }));
  if (ok.native !== (kind === 'mac' ? 'mac' : 'ios') || ok.dark !== 'dark') throw new Error(`${kind} ${id}: not the ${kind} app in dark mode (${JSON.stringify(ok)})`);
  if (p.errors.length) throw new Error(`${kind} ${id}: ${p.errors.join('; ')}`);
  await p.ctx.close();
  return png;
}

(async () => {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  if (!ARG.reuse) {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(WEB, 'catalog.js'), 'utf8'), sandbox);
    termsVersion = sandbox.window.CATALOG.termsVersion;
    css = fs.readFileSync(path.join(WEB, 'app.css'), 'utf8');
    if (!css.includes('env(safe-area-inset-top, 0px)')) throw new Error('app.css no longer sets the safe areas as this expects');
    server = await serve();
    base = `http://127.0.0.1:${server.address().port}/`;
    fs.mkdirSync(CAPS, { recursive: true });
    try {
      for (const kind of ONLY) for (const f of cfg[kind] || []) {
        const id = path.basename(f.capture, '.png').replace(kind + '-', '');
        fs.writeFileSync(path.join(CAPS, f.capture), await capture(kind, id));
        console.log('captured ' + path.relative(root, path.join(CAPS, f.capture)));
      }
    } finally {
      for (const b of Object.values(devices)) await b.close();
      server.close();
    }
  }
  // Frame them on the standard, then check what was drawn against it.
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^(iphone|ipad|mac)-\d+-.*\.png$/.test(f) && ONLY.includes(f.split('-')[0])) fs.rmSync(path.join(OUT, f));
  const node = (args) => execFileSync(process.execPath, args, { stdio: 'inherit', cwd: FRAMES });
  node(['store-frames.js', '--config', CONFIG, '--captures', CAPS, '--out', OUT, '--only', ONLY.join(',')]);
  node(['check-measure.js', path.join(OUT, 'measure.json')]);
})().catch((e) => { console.error(e); process.exit(1); });
