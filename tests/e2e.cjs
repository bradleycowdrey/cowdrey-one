// Cowdrey One end-to-end tests: the catalog, then the app in Chromium as an iPhone, an Android phone and a Mac.
// GitHub's releases API and every other outside address are answered locally, so the tests run offline.
// Run: npm test (after npm ci and npx playwright install chromium).
const { chromium, devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB = path.join(__dirname, '..', 'web');
let failures = 0, passes = 0;
function check(ok, what) {
  if (ok) { passes++; console.log('  ✓ ' + what); }
  else { failures++; console.log('  ✗ ' + what); }
}

// ---------- The catalog ----------
function catalogTests() {
  console.log('Catalog');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(WEB, 'catalog.js'), 'utf8'), sandbox);
  const C = sandbox.window.CATALOG;
  check(C && Array.isArray(C.apps) && C.apps.length > 0, 'catalog.js defines window.CATALOG with apps');
  check(/^https:\/\//.test(C.hubUrl), 'hubUrl is https');
  const ids = new Set();
  const kinds = new Set(['appstore', 'testflight', 'macappstore', 'dmg', 'apk', 'web']);
  for (const a of C.apps) {
    const where = `${a.id}:`;
    check(!ids.has(a.id), `${where} id is unique`); ids.add(a.id);
    check(['name', 'subtitle', 'headline', 'category', 'about'].every((k) => typeof a[k] === 'string' && a[k].trim()), `${where} has name, subtitle, headline, category and about`);
    check(/^\d+\.\d+\.\d+$/.test(a.version), `${where} version ${a.version} is x.y.z`);
    check(Array.isArray(a.sky) && a.sky.length === 2 && a.sky.every((c) => /^#[0-9a-f]{6}$/i.test(c)), `${where} sky is two colours`);
    check(Array.isArray(a.features) && a.features.length >= 3, `${where} has features`);
    check(fs.existsSync(path.join(WEB, 'apps', a.id + '.png')), `${where} icon apps/${a.id}.png exists`);
    const plats = Object.keys(a.platforms || {});
    check(plats.length > 0 && plats.every((p) => ['ios', 'android', 'mac', 'web'].includes(p)), `${where} platforms are ios, android, mac or web`);
    check(!!a.platforms.web, `${where} has a web version (the fallback on every device)`);
    for (const p of plats) {
      const pl = a.platforms[p];
      check(typeof pl.req === 'string' && pl.get.length > 0 && pl.get.every((o) => kinds.has(o.kind) && /^https:\/\//.test(o.url)), `${where} ${p} ways to get it are valid https links`);
    }
  }
  return C;
}

// ---------- A static server for web/ ----------
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
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

const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
async function context(browser, base, opts, releases) {
  const ctx = await browser.newContext(opts);
  const seen = { api: 0 };
  await ctx.route((url) => !url.href.startsWith(base), (route) => {
    const u = route.request().url();
    if (u.startsWith('https://api.github.com/repos/')) {
      seen.api++;
      const repo = u.split('/repos/')[1].split('/')[1];
      const v = releases[repo];
      if (!v) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ tag_name: 'v' + v, name: 'v' + v, published_at: '2026-11-20T12:00:00Z', body: `- What changed in ${v}`, html_url: 'https://github.com/x' }) });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });   // stores, downloads, web apps
  });
  return { ctx, seen };
}
async function open(ctx, url, errors, name) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  return p;
}

(async () => {
  const C = catalogTests();
  const current = Object.fromEntries(C.apps.filter((a) => a.repo).map((a) => [a.repo.split('/')[1], a.version]));
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];

  // ---------- iPhone ----------
  console.log('iPhone');
  {
    const { ctx, seen } = await context(browser, base, { ...devices['iPhone 15 Pro'] }, current);
    const p = await open(ctx, base, errors, 'iphone');
    check(await p.isVisible('.sheet [data-act="agree"]'), 'first launch asks to agree to the Terms');
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check(await p.isVisible('.sheet [data-act="agree"]'), 'the Terms sheet stays until Continue');
    await p.click('[data-act="agree"]'); await p.waitForTimeout(600);
    check(!(await p.$('.sheet')), 'Continue closes it');
    check(await p.evaluate(() => JSON.parse(localStorage.getItem('cowdrey-one.terms')).v) === C.termsVersion, 'agreement is remembered with the terms version');
    check((await p.$$('.feature')).length === C.apps.length, `the featured carousel has all ${C.apps.length} apps`);
    check((await p.$$('#all-apps .row.app')).length === C.apps.length, 'All Apps lists every app');
    check(await p.evaluate(() => window.CowdreyOne.platform()) === 'ios', 'an iPhone is detected as iOS');
    const tdHref = await p.getAttribute('#all-apps [data-id="two-degrees"] a.pill', 'href');
    check(/apps\.apple\.com/.test(tdHref), 'Two Degrees offers the App Store on iPhone');
    check((await p.textContent('#all-apps [data-id="golden-hour"] .pill')).trim() === 'Open', 'a web-only app offers Open, in the browser');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), p.click('#all-apps [data-id="bearings"] a.pill')]);
    await popup.close();
    await p.waitForTimeout(1200);
    check(await p.evaluate(() => window.CowdreyOne.state('bearings').s) === 'done', 'Get marks Bearings as on this iPhone');
    check((await p.textContent('#setup-slot .ring b')).trim() === `1/${C.apps.length}`, 'the set-up ring counts it');
    check(await p.isVisible('.toast'), 'a note says where the App Store opened');
    await p.click('.toast button'); await p.waitForTimeout(300);
    check(await p.evaluate(() => window.CowdreyOne.state('bearings').s) === 'get', 'Undo takes it back off');
    await p.click('.tab[data-tab="share"]'); await p.waitForTimeout(300);
    check(await p.evaluate(() => (document.querySelector('.qr svg path') || {}).getAttribute && document.querySelector('.qr svg path').getAttribute('d').length > 500), 'Share shows a QR code');
    await p.click('.tab[data-tab="library"]'); await p.waitForTimeout(300);
    check(await p.isVisible('#view-library .empty'), 'an empty Library says what it is for');
    check(seen.api > 0, 'it checked GitHub for new versions');
    await ctx.close();
  }

  // ---------- Android, with an older download installed ----------
  console.log('Android');
  {
    const { ctx } = await context(browser, base, { ...devices['Pixel 7'] }, Object.assign({}, current, { bearings: '9.9.9' }));
    await ctx.addInitScript((v) => {
      localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 }));
      localStorage.setItem('cowdrey-one.installed', JSON.stringify({ 'android:bearings': { v: '1.0.0', k: 'apk', t: Date.now() } }));
    }, C.termsVersion);
    const p = await open(ctx, base + '#library', errors, 'android');
    await p.waitForTimeout(1500);
    check(await p.evaluate(() => window.CowdreyOne.platform()) === 'android', 'an Android phone is detected as Android');
    check(/\.apk$/.test(await p.getAttribute('#all-apps [data-id="two-degrees"] a.pill', 'href')), 'Two Degrees offers its APK on Android');
    check(await p.evaluate(() => window.CowdreyOne.state('bearings').s) === 'update', 'a newer release on GitHub shows as an update');
    check((await p.textContent('.tab .badge')).trim() === '1', 'the Library tab shows one update');
    check(await p.isVisible('#view-library [data-act="get"]'), 'the Library lists the update with its button');
    check((await p.textContent('#all-apps [data-id="cowdrey-pdf"] .pill')).trim() === 'Open', 'an app without an Android version falls back to the web');
    await ctx.close();
  }

  // ---------- Mac ----------
  console.log('Mac');
  {
    const { ctx } = await context(browser, base, { viewport: { width: 1440, height: 900 }, userAgent: UA.mac }, current);
    await ctx.addInitScript((v) => localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 })), C.termsVersion);
    const p = await open(ctx, base + '?app=meridian', errors, 'mac');
    check(await p.isVisible('.sidebar'), 'a wide window gets the sidebar');
    check(!(await p.isVisible('.tabbar')), '… and no tab bar');
    check((await p.textContent('.sheet #sheet-title')).trim() === 'Meridian', '?app=meridian opens its page');
    check(/Meridian\.dmg$/.test(await p.getAttribute('.sheet .get-row.here a.pill', 'href')), 'the Mac row is marked as this Mac, with the DMG');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    check(!(await p.$('.sheet')), 'Escape closes the page');
    await p.click('.side-item[data-tab="library"]'); await p.waitForTimeout(200);
    await p.selectOption('select[data-act="platform"]', 'android'); await p.waitForTimeout(300);
    check(/\.apk$/.test(await p.getAttribute('#all-apps [data-id="two-degrees"] a.pill', 'href')), 'choosing Android shows Android downloads');
    await p.click('[data-act="appearance"][data-v="dark"]');
    check(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Appearance: Dark switches the theme');
    await ctx.close();
  }

  await browser.close();
  server.close();
  for (const e of errors) { failures++; console.log('  ✗ page error: ' + e); }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
