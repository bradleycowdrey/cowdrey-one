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
    if (a.shots) check(Array.from({ length: a.shots }, (_, k) => path.join(WEB, 'apps', 'shots', `${a.id}-${k + 1}.webp`)).every((f) => fs.existsSync(f)), `${where} has its ${a.shots} App Store screenshots in apps/shots`);
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
        body: JSON.stringify({ tag_name: 'v' + v, name: 'v' + v, published_at: '2026-11-20T12:00:00Z', html_url: 'https://github.com/x',
          body: `## What's new\n\n- What changed in ${v}\n\n## Downloads\n\n| Mac | https://github.com/bradleycowdrey/${repo}/releases/download/v${v}/A-very-long-file-name-${v}-universal.dmg |\n\nSHA-256: 3f1c9a0b7d2e4f6a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c` }) });
    }
    if (/\.(dmg|apk)$/.test(u)) {   // a download, as GitHub sends it: the page stays where it is
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'x', headers: { 'content-disposition': 'attachment; filename=app' } });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });   // stores and web apps
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
    check((await p.textContent('#view-discover .brandbar')).trim() === 'Cowdrey One', 'the Cowdrey One label is at the top of the screen');
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
    check(await p.evaluate(() => window.CowdreyOne.state('bearings').s) === 'get', 'tapping Get doesn’t mark Bearings as on this iPhone (a browser can’t see that)');
    check((await p.textContent('#all-apps [data-id="bearings"] .pill')).trim() === 'Get', '… so it still says Get');
    check((await p.$$('.pill.done, use[href="#i-check-circle"]')).length === 0, 'no app shows a check');
    check(!(await p.$('#setup-slot .ring')), 'no count of apps on this iPhone, which a browser can’t know');
    check(await p.isVisible('.toast'), 'a note says where the App Store opened');
    const withShots = C.apps.filter((a) => a.shots);
    check((await p.$$('.feature .feature-shot')).length === withShots.length, `each App Store app’s card shows its first App Store screenshot (${withShots.length})`);
    check((await p.getAttribute('.feature[data-id="bearings"] .feature-shot', 'src')) === 'apps/shots/bearings-1.webp', '… Bearings’ card shows Bearings’ first one');
    check(!(await p.$('.feature[data-id="golden-hour"] .feature-shot')) && !!(await p.$('.feature[data-id="golden-hour"] .art')), 'an app not on the App Store keeps its drawn card');
    await p.click('#all-apps [data-id="bearings"] .main'); await p.waitForTimeout(1500);
    check((await p.$$('.sheet .hero .shots img')).length === C.apps.find((a) => a.id === 'bearings').shots, 'its page shows every App Store screenshot, in a row, as the App Store does');
    const notes = await p.textContent('.sheet #notes');
    check(/What changed in/.test(notes) && !/\||SHA-256|https?:/.test(notes), 'What’s New keeps the words and leaves out download tables, links and checksums');
    const wide = await p.evaluate(() => { const sc = document.querySelector('.sheet .sheet-scroll'); sc.scrollLeft = 200; return { w: sc.scrollWidth - sc.clientWidth, left: sc.scrollLeft }; });
    check(wide.w === 0 && wide.left === 0, `the page is never wider than the screen, so it can’t slide sideways (${JSON.stringify(wide)})`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('.tab[data-tab="share"]'); await p.waitForTimeout(300);
    check(await p.evaluate(() => (document.querySelector('.qr svg path') || {}).getAttribute && document.querySelector('.qr svg path').getAttribute('d').length > 500), 'Share shows a QR code');
    await p.click('.tab[data-tab="library"]'); await p.waitForTimeout(300);
    check(!(await p.$('#view-library .reading')), 'the Library doesn’t claim a number of apps on this iPhone');
    check((await p.$$('#view-library .row.app')).length === C.apps.length, 'it lists every app, each with Get or Open');
    check(/can’t see which apps are installed/.test(await p.textContent('#view-library .group-foot')), 'and says a browser can’t see what’s installed');
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
    check(await p.evaluate(() => window.CowdreyOne.state('bearings').s) === 'get', 'a list kept by an earlier version doesn’t count Bearings as installed');
    check(await p.evaluate(() => localStorage.getItem('cowdrey-one.installed')) === '{}', '… and that list is dropped');
    check(await p.isHidden('.tab .badge'), 'no update is claimed for an app a browser can’t see');
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

  // ---------- Mac in a browser: Download All ----------
  console.log('Mac, in a browser');
  {
    const { ctx } = await context(browser, base, { viewport: { width: 1440, height: 900 }, userAgent: UA.mac }, current);
    await ctx.addInitScript((v) => localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 })), C.termsVersion);
    const p = await open(ctx, base, errors, 'mac-web');
    const downloads = [];
    p.on('download', (d) => downloads.push(d.url()));
    check(!(await p.isVisible('#view-discover .brandbar')), 'the Mac shows the name in the sidebar, not above the title');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(500);
    const label = (await p.textContent('.sheet [data-act="bulk"]')).trim();
    check(label === 'Download All (5)', `Get Every App offers Download All for the five Mac apps (${label})`);
    await p.click('.sheet [data-act="bulk"]');
    await p.waitForTimeout(7500);
    check(downloads.length === 5 && downloads.every((u) => u.endsWith('.dmg')), `it downloads every .dmg (${downloads.length})`);
    check(await p.evaluate(() => ['cowdrey-pdf', 'cowdrey-md', 'meridian', 'two-degrees', 'bearings'].every((id) => window.CowdreyOne.state(id).s === 'get')), 'downloading isn’t installing: none is marked as on this Mac');
    await ctx.close();
  }

  // ---------- The web, as before, and behind an App Store version's link (?store=apple) ----------
  console.log('iPhone, in a browser: as before');
  {
    const { ctx } = await context(browser, base, { ...devices['iPhone 15 Pro'] }, current);
    await ctx.addInitScript((v) => localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 })), C.termsVersion);
    const p = await open(ctx, base + '?app=bearings', errors, 'iphone-web');
    await p.waitForTimeout(1500);
    check(/Beta on TestFlight/.test(await p.textContent('.sheet #get-rows')), 'the web still offers the TestFlight beta');
    check((await p.getAttribute('.sheet #whats-new a', 'href')) === 'https://github.com/x' && /Release notes on GitHub/.test(await p.textContent('.sheet #whats-new')), '… and Release notes on GitHub, to the release');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.click('.tab[data-tab="share"]'); await p.waitForTimeout(300);
    check(!!(await p.$(`#view-share a[href="${C.hubDownloads.ios}"]`)) && (await p.textContent('#view-share .url')).trim() === C.hubUrl, '… and Share’s “Or get the iPhone app” and QR code as before');
    check(/Open this page in Safari\..*Add to Home Screen/.test(await p.textContent('#view-share .how')), '… and its Add to Home Screen steps');
    await p.click('.tab[data-tab="library"]'); await p.waitForTimeout(300);
    check(!!(await p.$('#view-library [data-act="check"]')), '… and Updates · Check');
    await p.click('#view-library [data-act="check"]'); await p.waitForTimeout(800);
    check(/Every app is up to date\.|update/.test(await p.textContent('.toast')), '… which still says what it found');
    await p.click('.tab[data-tab="discover"]'); await p.waitForTimeout(300);
    check(/Preview/.test(await p.textContent('#all-apps [data-id="golden-hour"] .status-tag')) && /Preview/.test(await p.textContent('.feature[data-id="golden-hour"] .eyebrow')), '… and Golden Hour’s “Preview” label');
    await ctx.close();
  }
  // Release notes with a line about a beta: the web keeps it, the web behind an App Store version's link leaves it out.
  console.log('Release notes with a beta line');
  for (const [name, url, kept] of [['the web', '', true], ['behind ?store=apple', '?store=apple', false]]) {
    const { ctx } = await context(browser, base, { viewport: { width: 1440, height: 900 }, userAgent: UA.mac }, current);
    await ctx.route('https://api.github.com/repos/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ tag_name: 'v9.9.9', name: 'v9.9.9', published_at: '2026-11-20T12:00:00Z', html_url: 'https://github.com/x',
        body: '## What’s new\n\n- A clearer map.\n- Join the beta on TestFlight to try widgets first.\n- Public beta of the new compass.' }) }));
    await ctx.addInitScript((v) => localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 })), C.termsVersion);
    const p = await open(ctx, base + url, errors, 'beta-notes-' + name);
    await p.evaluate(() => window.CowdreyOne.checkUpdates(true)); await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelector('#all-apps [data-id="bearings"] .main').click()); await p.waitForTimeout(600);
    const notes = await p.textContent('.sheet #whats-new');
    check(/A clearer map/.test(notes) && (kept ? /TestFlight/.test(notes) && /Public beta/.test(notes) : !/TestFlight|\bbeta\b/i.test(notes)),
      `${name}: What’s New ${kept ? 'keeps' : 'leaves out'} the release notes’ beta lines`);
    await ctx.close();
  }

  console.log('The web app behind an App Store version’s link');
  for (const [name, opts] of [['Mac', { viewport: { width: 1440, height: 900 }, userAgent: UA.mac }], ['iPhone', { ...devices['iPhone 15 Pro'] }], ['Android', { ...devices['Pixel 7'] }]]) {
    const { ctx } = await context(browser, base, opts, current);
    await ctx.addInitScript((v) => localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 })), C.termsVersion);
    const p = await open(ctx, base + '?store=apple', errors, 'store-link-' + name);
    await p.waitForTimeout(1500);
    const go = (t) => p.evaluate((t) => document.querySelector(`.side-item[data-tab="${t}"], .tab[data-tab="${t}"]`).click(), t);
    const bad = [];
    const look = async (what) => {
      const hrefs = await p.evaluate(() => [...document.querySelectorAll('[href]')].map((e) => e.getAttribute('href')));
      const h = hrefs.find((x) => /\.(?:dmg|apk)(?:$|[?#])|testflight\.apple\.com|\/releases(?:$|[/?#])/i.test(x));
      const t = (await p.textContent('body')).match(/TestFlight|\bbeta\b|Download All|Download \(/i);
      if (h || t) bad.push(`${what}: ${h || t[0]}`);
    };
    for (const t of ['discover', 'library', 'share']) { await go(t); await p.waitForTimeout(250); await look(t); }
    await go('discover'); await p.waitForTimeout(250);
    for (const a of C.apps) {
      await p.evaluate((id) => document.querySelector(`#all-apps [data-id="${id}"] .main`).click(), a.id); await p.waitForTimeout(450);
      await look(a.name);
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    }
    await p.evaluate(() => document.querySelector('#setup-slot [data-act="setup"]').click()); await p.waitForTimeout(400);
    await look('Get Every App');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    check(!bad.length, `${name}: it offers no .dmg, APK, beta or GitHub release anywhere${bad.length ? ` (it does on ${bad.join(', ')})` : ''}`);
    await go('share'); await p.waitForTimeout(250);
    check((await p.textContent('#view-share .url')).trim() === C.hubUrl + '?store=apple', `${name}: its own QR code and link keep ?store=apple`);
    await p.goto(base + '#library'); await p.waitForTimeout(800);
    check(await p.evaluate(() => !document.querySelector('[href$=".dmg"], [href$=".apk"], [href*="testflight"]')), `${name}: it remembers ?store=apple for the visit`);
    if (name === 'Mac') {
      await p.evaluate(() => document.querySelector('.side-item[data-tab="discover"]').click()); await p.waitForTimeout(250);
      const mas = C.apps.find((a) => a.id === 'two-degrees').platforms.mac.get.find((o) => o.kind === 'macappstore').url;
      check((await p.getAttribute('#all-apps [data-id="two-degrees"] a.pill', 'href')) === mas, 'Mac: Two Degrees opens the Mac App Store');
      check((await p.getAttribute('#all-apps [data-id="bearings"] a.pill', 'href')) === C.apps.find((a) => a.id === 'bearings').platforms.web.get[0].url, 'Mac: Bearings opens on the web');
    }
    await ctx.close();
  }

  // ---------- The native apps, with their native side stood in for ----------
  function fakeNative(cfg) {
    window.__calls = [];
    const now = Object.assign({}, cfg.installed);
    const answer = async (cmd, args) => {
      window.__calls.push(cmd === 'plugin:installer|native' ? args.method : cmd);
      if (cmd === 'installed_apps') {
        const r = {};
        for (const a of args.apps) if (now[a.id]) r[a.id] = { version: now[a.id], appStore: false, path: '/Applications/' + a.appName };
        return r;
      }
      if (cmd === 'install_app') { now[args.id] = '9.9.9'; return { version: '9.9.9', appStore: false }; }
      if (cmd === 'plugin:installer|native') {
        const x = args.args || {};
        if (args.method === 'canInstall') return { allowed: true };
        if (args.method === 'installedVersions') { const apps = {}; for (const k of x.packages) if (now[k]) apps[k] = { version: now[k], installer: (cfg.installers || {})[k] || '' }; return { apps }; }
        if (args.method === 'install') { now[x.packageName] = '9.9.9'; return { status: 'installed' }; }
        if (args.method === 'showStore') { window.__calls.push('store:' + x.id); return null; }
        if (args.method === 'canOpen') { const open = {}; for (const sc of x.schemes) open[sc] = !!now[sc]; return { open }; }
        if (args.method === 'openApp') { window.__calls.push('open:' + (x.scheme || x.packageName)); return null; }
      }
      return null;
    };
    window.__TAURI__ = { core: { invoke: answer }, event: { listen: async () => () => {} }, opener: { openUrl: async (u) => { window.__calls.push('url:' + u); } } };
  }
  // store: 'play' is the Google Play version of the Android app (desktop/build.mjs, STORE=play, adds store.js).
  async function nativeApp(name, opts, installedNow, installers, store) {
    const { ctx } = await context(browser, base, opts, current);
    await ctx.addInitScript((v) => localStorage.setItem('cowdrey-one.terms', JSON.stringify({ v, at: 1 })), C.termsVersion);
    if (store) await ctx.addInitScript((s) => { window.COWDREY_STORE = s; }, store);
    await ctx.addInitScript(fakeNative, { installed: installedNow, installers });
    const p = await open(ctx, base, errors, name);
    await p.waitForTimeout(400);
    return { ctx, p };
  }
  const calls = (p) => p.evaluate(() => window.__calls);

  console.log('Mac app');
  {
    const { ctx, p } = await nativeApp('mac-app', { viewport: { width: 1440, height: 900 }, userAgent: UA.mac }, { meridian: '2.1.4' });
    check(await p.evaluate(() => window.CowdreyOne.native) === 'mac', 'it knows it is the Mac app');
    check(await p.evaluate(() => window.CowdreyOne.state('meridian').s) === 'done', 'it sees Meridian in Applications');
    check((await p.textContent('#all-apps [data-id="meridian"] .pill')).trim() === 'Open', '… and offers Open');
    check((await p.textContent('#setup-slot .ring b')).trim() === '1/5', 'the ring counts what is really in Applications (1 of the 5 Mac apps)');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    check((await p.textContent('.sheet [data-act="bulk"]')).trim() === 'Install All (4)', 'Install All covers the four Mac apps not installed');
    await p.click('.sheet [data-act="bulk"]'); await p.waitForTimeout(1500);
    const c = await calls(p);
    check(c.filter((x) => x === 'install_app').length === 4, 'it installs each one itself');
    check(await p.evaluate(() => ['cowdrey-pdf', 'cowdrey-md', 'two-degrees', 'bearings'].every((id) => window.CowdreyOne.state(id).s === 'done')), 'then every app shows as installed');
    await p.click('.sheet [data-act="close"]'); await p.waitForTimeout(400);
    await p.click('#all-apps [data-id="meridian"] [data-act="launch"]'); await p.waitForTimeout(200);
    check((await calls(p)).includes('open_app'), 'Open opens the app');
    await ctx.close();
  }

  // The Mac App Store version (desktop/build.mjs, STORE=appstore) and the iPhone and iPad app name and show no other
  // platform (App Review guideline 2.3.10): no Android anywhere, in words or icons, on any screen or app page; no other
  // browser or system (Chrome, Edge, Windows); and nothing about downloading or installing apps (guidelines 2.4.5 and
  // 2.5.2): no .dmg or APK, in words or links, no Install All, no "puts it in Applications".
  const OTHER = /Android|Google Play|Chrome|\bEdge\b|Windows|Linux|\.dmg\b|\bDMG\b|\bAPK\b|Install All|Download All|Download \(|in Applications/;
  // Nor a beta or TestFlight (guideline 2.2), in words or links, nor a link to GitHub releases, which list the .dmg and
  // APK files (2.4.5).
  const BETA = /TestFlight|\b[Bb]eta\b/;
  const BAD_LINK = /testflight\.apple\.com|github\.com\/[^/]+\/[^/]+\/releases/i;
  const noAndroid = async (p, where) => {
    const seen = [];
    const look = async (what) => {
      const t = await p.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' '));
      const files = await p.evaluate(() => [...document.querySelectorAll('[href]')].map((e) => e.getAttribute('href')).filter((h) => /\.(?:dmg|apk|zip)(?:$|[?#])/i.test(h)));
      const bad = await p.evaluate((re) => [...document.querySelectorAll('[href]')].map((e) => e.getAttribute('href')).filter((h) => new RegExp(re, 'i').test(h)), BAD_LINK.source);
      const m = t.match(OTHER) || t.match(BETA);
      if (m || files.length || bad.length || (await p.$$('use[href="#i-android"]')).length) seen.push(`${what}: ${m ? m[0] : files[0] || bad[0] || 'the Android icon'}`);
    };
    const go = (t) => p.evaluate((t) => document.querySelector(`.side-item[data-tab="${t}"], .tab[data-tab="${t}"]`).click(), t);
    for (const t of ['discover', 'library', 'share']) { await go(t); await p.waitForTimeout(250); await look(t); }
    await go('discover'); await p.waitForTimeout(250);
    for (const a of C.apps) {
      await p.evaluate((id) => document.querySelector(`#all-apps [data-id="${id}"] .main`).click(), a.id); await p.waitForTimeout(350);
      await look(a.name);
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    }
    await go('library'); await p.waitForTimeout(250);
    await p.evaluate(() => document.querySelector('#view-library [data-act="about"]').click()); await p.waitForTimeout(350);
    await look('About');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await go('discover'); await p.waitForTimeout(250);
    await p.evaluate(() => document.querySelector('#setup-slot [data-act="setup"]').click()); await p.waitForTimeout(400);
    await look('Get Every App');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    check(!seen.length, `${where} shows no Android, other browser or system, download, beta or GitHub release anywhere${seen.length ? ` (it does on ${seen.join(', ')})` : ''}`);
  };

  // The App Store versions' links: What's New points at the app's changelog, About at the developer's site (not every
  // app on GitHub), Source code and Report an issue at the repository, and the QR code and Share link at a page that
  // offers no downloads (Cowdrey One's App Store page once it has one, else the web app with ?store=apple).
  const appStoreLinks = async (p, where) => {
    const go = (t) => p.evaluate((t) => document.querySelector(`.side-item[data-tab="${t}"], .tab[data-tab="${t}"]`).click(), t);
    await go('discover'); await p.waitForTimeout(250);
    await p.evaluate(() => document.querySelector('#all-apps [data-id="bearings"] .main').click()); await p.waitForTimeout(500);
    const wn = await p.$eval('.sheet #whats-new', (e) => [...e.querySelectorAll('a')].map((x) => [x.textContent, x.getAttribute('href')]));
    check(wn.length === 1 && wn[0][1] === 'https://github.com/bradleycowdrey/bearings/blob/main/CHANGELOG.md' && !/Release notes/.test(wn[0][0]),
      `${where}: What’s New links to Bearings’ CHANGELOG.md, not its releases (${JSON.stringify(wn)})`);
    const info = await p.$$eval('.sheet a.row.info', (els) => els.map((e) => [e.querySelector('.k').textContent, e.getAttribute('href')]));
    const src = info.find((x) => x[0] === 'Source code'), issue = info.find((x) => x[0] === 'Report an issue');
    check(src && src[1] === 'https://github.com/bradleycowdrey/bearings' && issue && issue[1] === 'https://github.com/bradleycowdrey/bearings/issues', `${where}: Source code and Report an issue go to the repository`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await go('library'); await p.waitForTimeout(250);
    await p.evaluate(() => document.querySelector('#view-library [data-act="about"]').click()); await p.waitForTimeout(350);
    const about = await p.textContent('.sheet');
    check(!/Every app on GitHub/.test(about) && !!(await p.$('.sheet a[href="https://bradcowdrey.com"]')), `${where}: About has no “Every app on GitHub”, and links to bradcowdrey.com`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await go('share'); await p.waitForTimeout(250);
    const hub = C.hubDownloads.appstore || C.hubUrl + '?store=apple';
    check((await p.textContent('#view-share .url')).trim() === hub && (await p.getAttribute('#view-share .qr svg', 'aria-label')) === 'QR code for ' + hub, `${where}: the QR code and link open ${hub}`);
    check(!/Or get the iPhone app/.test(await p.textContent('#view-share')) && !(await p.$('#view-share a[href*="testflight"]')), `${where}: Share offers no TestFlight link`);
    await go('discover'); await p.waitForTimeout(250);
  };

  // The iPhone and iPad app: no update check of its own (2.4.5(vii)), no "Preview" label (2.2), and Share's steps
  // share the app rather than add a web page to the Home Screen; its Mac steps are the Mac App Store's.
  const iosStoreBehaviour = async (p, where) => {
    const go = (t) => p.evaluate((t) => document.querySelector(`.side-item[data-tab="${t}"], .tab[data-tab="${t}"]`).click(), t);
    await go('library'); await p.waitForTimeout(250);
    check(!(await p.$('#view-library [data-act="check"]')) && !/Updates|Checked|Not checked/.test(await p.textContent('#view-library')), `${where}: the Library has no Updates · Check row`);
    await p.evaluate(() => window.CowdreyOne.checkUpdates(false)); await p.waitForTimeout(400);
    check(!/up to date|update available|updates available/.test(await p.evaluate(() => (document.querySelector('.toast') || {}).textContent || '')), `${where}: checking never says “Every app is up to date.”`);
    await go('discover'); await p.waitForTimeout(250);
    check(!/Preview/.test(await p.textContent('#all-apps [data-id="golden-hour"]')) && !(await p.$('#all-apps [data-id="golden-hour"] .status-tag')), `${where}: Golden Hour’s row has no “Preview” tag`);
    check(!/Preview/.test(await p.textContent('.feature[data-id="golden-hour"]')), `${where}: … nor its card’s eyebrow`);
    await p.evaluate(() => document.querySelector('#all-apps [data-id="golden-hour"] .main').click()); await p.waitForTimeout(500);
    check(!/Preview/.test(await p.textContent('.sheet .facts')) && /Latest/.test(await p.textContent('.sheet .facts .fact')), `${where}: … nor its page’s Version fact (Latest)`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await go('share'); await p.waitForTimeout(250);
    const steps = await p.$$eval('#view-share .how', (els) => els.map((e) => [e.querySelector('h4').textContent, e.querySelector('.steps').textContent]));
    const ios = steps.find((x) => /iPhone and iPad/.test(x[0])), mac = steps.find((x) => /^Mac/.test(x[0]));
    check(ios && !/Safari|Add to Home Screen|Open this page/.test(ios[1]) && /Share/.test(ios[1]), `${where}: Share’s iPhone and iPad steps share the app (${ios && ios[1]})`);
    check(mac && /Get Cowdrey One on the Mac App Store/.test(mac[1]) && !/Safari|Add to Dock/.test(mac[1]), `${where}: … and its Mac steps get it on the Mac App Store (${mac && mac[1]})`);
    await go('discover'); await p.waitForTimeout(250);
  };

  console.log('Mac app from the Mac App Store');
  {
    const { ctx, p } = await nativeApp('mac-app-store', { viewport: { width: 1440, height: 900 }, userAgent: UA.mac }, { meridian: '2.1.4' }, null, 'appstore');
    check(await p.evaluate(() => window.CowdreyOne.native) === 'mac', 'it knows it is the Mac app');
    await noAndroid(p, 'the Mac App Store version');
    await appStoreLinks(p, 'the Mac App Store version');
    // Nothing is downloaded or installed: Get opens the Mac App Store, or the web.
    const mas = C.apps.find((a) => a.id === 'two-degrees').platforms.mac.get.find((o) => o.kind === 'macappstore').url;
    const webOf = (id) => C.apps.find((a) => a.id === id).platforms.web.get[0].url;
    check(!(await p.$('#setup-slot .ring')) && /6 free apps/.test(await p.textContent('#setup-slot')), 'no count, just the six apps it lists');
    check((await p.getAttribute('#all-apps [data-id="two-degrees"] a.pill', 'href')) === mas && /^https:\/\/apps\.apple\.com\/app\/id\d+/.test(mas), `Two Degrees’ Get goes to its Mac App Store page (${mas})`);
    const masApp = 'macappstore://apps.apple.com/app/id' + mas.match(/\/id(\d+)/)[1];
    await p.click('#all-apps [data-id="two-degrees"] a.pill'); await p.waitForTimeout(300);
    check((await calls(p)).includes('url:' + masApp) && !(await calls(p)).includes('url:' + mas) && /Mac App Store/.test(await p.textContent('.toast')), `… which it opens in the App Store app (${masApp}), not the browser`);
    for (const id of ['cowdrey-pdf', 'cowdrey-md', 'bearings', 'golden-hour']) {
      const sel = `#all-apps [data-id="${id}"]`;
      check((await p.getAttribute(sel + ' a.pill', 'href')) === webOf(id) && /On the web/.test(await p.textContent(sel + ' .pill-wrap'))
        && /on the web/.test(await p.getAttribute(sel + ' a.pill', 'aria-label')), `${id}, not on the Mac App Store, opens on the web`);
    }
    await p.click('#all-apps [data-id="bearings"] a.pill'); await p.waitForTimeout(300);
    check((await calls(p)).includes('url:' + webOf('bearings')) && /on the web/.test(await p.textContent('.toast')), '… in the default browser');
    check((await p.textContent('#all-apps [data-id="meridian"] .pill-wrap')).trim() === 'Open', 'Meridian, seen on this Mac, offers Open (not on the web)');
    await p.click('#all-apps [data-id="meridian"] [data-act="launch"]'); await p.waitForTimeout(200);
    check((await calls(p)).includes('open_app'), '… which opens it');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    const sheet = await p.textContent('.sheet');
    check(await p.evaluate(() => Math.round(document.querySelector('.sheet').getBoundingClientRect().top)) === 0, 'its sheets hang from the top of the window, as a Mac sheet does');
    check(!/installed|Install/.test(sheet) && !(await p.$('.sheet .reading')), 'Get Every App has no count and no Install All');
    check((await p.$$('.sheet #setup-rows .row')).length === C.apps.length, '… and lists every app');
    check((await p.textContent('.sheet [data-act="bulk"]')).trim() === 'Get Two Degrees on the Mac App Store', 'its button opens the one app on the Mac App Store');
    const before = (await calls(p)).length;
    await p.click('.sheet [data-act="bulk"]'); await p.waitForTimeout(400);
    check((await calls(p)).slice(before).join() === 'url:' + masApp, '… in the Mac App Store app, and nothing else');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#all-apps [data-id="bearings"] .main'); await p.waitForTimeout(600);
    check((await p.textContent('.sheet .hero-actions .pill')).trim() === 'Open on the web', 'an app’s page says Open on the web for an app not on the Mac App Store');
    check(!(await p.$('.sheet .get-row use[href="#i-mac"]')) && /isn’t on the Mac App Store yet/.test(await p.textContent('.sheet')), '… with no Mac download, just a note');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#all-apps [data-id="two-degrees"] .main'); await p.waitForTimeout(600);
    check(/Mac App Store/.test(await p.textContent('.sheet .get-row.here')) && (await p.getAttribute('.sheet .get-row.here a.pill', 'href')) === mas, 'Two Degrees’ page offers the Mac App Store');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('.side-item[data-tab="library"]'); await p.waitForTimeout(300);
    check(!(await p.$('#view-library .reading')) && /Version 2\.1\.4 · On this Mac/.test(await p.textContent('#view-library')), 'the Library lists Meridian as on this Mac, with no count');
    check(!(await calls(p)).some((x) => x === 'install_app' || x === 'plugin:installer|native' || ['install', 'canInstall', 'showStore'].includes(x)), 'it never calls the installer');
    // Guideline 2.4.5(vii): no update check of its own. The Mac App Store updates apps.
    check(!(await p.$('#view-library [data-act="check"]')) && !/Updates/.test(await p.textContent('#view-library')), 'the Library has no Updates · Check row');
    await p.evaluate(() => window.CowdreyOne.checkUpdates(false)); await p.waitForTimeout(400);
    check(!/up to date|update available|updates available/.test(await p.evaluate(() => (document.querySelector('.toast') || {}).textContent || '')), '… and checking never says “Every app is up to date.”');
    check(/Every app, on the Mac App Store or the web/.test(await p.textContent('#setup-slot')), 'the set-up card says where the apps come from');
    check(!/Preview/.test(await p.textContent('#all-apps [data-id="golden-hour"]')) && !/Preview/.test(await p.textContent('.feature[data-id="golden-hour"]')), 'Golden Hour has no “Preview” label');
    await ctx.close();
  }
  console.log('Mac app from GitHub');
  {
    const { ctx, p } = await nativeApp('mac-app-dmg', { viewport: { width: 1440, height: 900 }, userAgent: UA.mac }, {});
    check((await p.$$('#all-apps use[href="#i-android"]')).length > 0, 'the .dmg version still shows which apps are on Android');
    check((await p.textContent('#setup-slot .ring b')).trim() === '0/5', '… still counts the five Mac apps');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    check((await p.textContent('.sheet [data-act="bulk"]')).trim() === 'Install All (5)' && /puts it in Applications/.test(await p.textContent('.sheet')), '… still installs them itself (Install All)');
    check(await p.evaluate(() => Math.round(document.querySelector('.sheet').getBoundingClientRect().top)) === 30, '… in a sheet centred in the window, as before');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#all-apps [data-id="bearings"] .main'); await p.waitForTimeout(600);
    check(/Download \(\.dmg\)/.test(await p.textContent('.sheet .get-row.here')), '… and still offers each .dmg');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('.side-item[data-tab="share"]'); await p.waitForTimeout(300);
    check(/Chrome/.test(await p.textContent('#view-share')) && /Windows/.test(await p.textContent('#view-share')), '… and its Share screen still has every browser’s steps');
    check((await p.textContent('#view-share .url')).trim() === C.hubUrl, '… and its QR code still opens the web app as before');
    await p.click('.side-item[data-tab="library"]'); await p.waitForTimeout(300);
    check(!!(await p.$('#view-library [data-act="check"]')), '… still has Updates · Check');
    await p.click('#view-library [data-act="check"]'); await p.waitForTimeout(800);
    check(/Every app is up to date\.|update/.test(await p.textContent('.toast')), '… which still says what it found');
    await p.click('#view-library [data-act="about"]'); await p.waitForTimeout(400);
    check(/Every app on GitHub/.test(await p.textContent('.sheet')), '… and About still links every app on GitHub');
    await ctx.close();
  }

  console.log('Android app');
  {
    const { ctx, p } = await nativeApp('android-app', { ...devices['Pixel 7'] }, { 'com.bradcowdrey.twodegrees': '1.0.0' });
    check(await p.evaluate(() => window.CowdreyOne.state('two-degrees').s) === 'update', 'an older Two Degrees on the phone shows as an update');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    check((await p.textContent('.sheet [data-act="bulk"]')).trim() === 'Install All (4)', 'Install All covers the four Android apps');
    await p.click('.sheet [data-act="bulk"]'); await p.waitForTimeout(1500);
    const c = await calls(p);
    check(c.includes('canInstall') && c.filter((x) => x === 'install').length === 4, 'it checks the install permission, then hands each APK to Android');
    check(await p.evaluate(() => ['cowdrey-md', 'meridian', 'two-degrees', 'bearings'].every((id) => window.CowdreyOne.state(id).s === 'done')), 'then every app shows as installed');
    await ctx.close();
  }

  console.log('Android app, with Meridian from Google Play');
  {
    const { ctx, p } = await nativeApp('android-play', { ...devices['Pixel 7'] }, { 'com.bradcowdrey.meridian': '1.0.0' }, { 'com.bradcowdrey.meridian': 'com.android.vending' });
    check(await p.evaluate(() => window.CowdreyOne.state('meridian').s) === 'done', 'an app installed from Google Play shows as installed, with no GitHub update (Play signs it differently)');
    check((await p.textContent('#all-apps [data-id="meridian"] .pill')).trim() === 'Open', '… and offers Open');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    check((await p.textContent('.sheet [data-act="bulk"]')).trim() === 'Install All (3)', 'Install All leaves it out, so its APK never meets the Play copy');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('.tab[data-tab="library"]'); await p.waitForTimeout(300);
    check(/Google Play/.test(await p.textContent('#view-library')), 'the Library says it came from Google Play');
    await ctx.close();
  }

  console.log('Android app from Google Play');
  {
    const play = (id) => 'https://play.google.com/store/apps/details?id=' + id;
    const { ctx, p } = await nativeApp('android-google-play', { ...devices['Pixel 7'] },
      { 'com.bradcowdrey.meridian': '2.1.4', 'com.bradcowdrey.twodegrees': '1.0.0' }, { 'com.bradcowdrey.meridian': 'com.android.vending' }, 'play');
    const apkLinks = () => p.evaluate(() => [...document.querySelectorAll('[href]')].map((e) => e.getAttribute('href')).filter((h) => /\.apk(?:$|[?#])/i.test(h)));
    check(await p.evaluate(() => window.CowdreyOne.native) === 'android', 'it knows it is the Android app');
    const href = await p.getAttribute('#all-apps [data-id="bearings"] a.pill', 'href');
    check(href === play('com.bradcowdrey.bearings') && (await p.textContent('#all-apps [data-id="bearings"] .pill')).trim() === 'Get', `an Android app’s Get goes to its Google Play page (${href})`);
    await p.click('#all-apps [data-id="bearings"] a.pill'); await p.waitForTimeout(300);
    check((await calls(p)).includes('url:' + play('com.bradcowdrey.bearings')), 'Get opens Bearings’ Google Play page with the system, which hands it to the Play Store');
    check(/Google Play/.test(await p.textContent('.toast')), '… and says so');
    check(!(await calls(p)).some((x) => x === 'install' || x === 'canInstall'), 'Cowdrey One never downloads or installs an app itself');
    check(!(await p.$('.sheet')), 'no “Allow Cowdrey One to install apps” sheet');
    check(await p.evaluate(() => window.CowdreyOne.state('bearings').s) === 'get', 'opening Google Play doesn’t mark Bearings as installed');
    check((await p.textContent('#all-apps [data-id="meridian"] .pill')).trim() === 'Open', 'Meridian, installed from Google Play, shows Open');
    check(await p.evaluate(() => window.CowdreyOne.state('two-degrees').s) === 'done' && (await p.textContent('#all-apps [data-id="two-degrees"] .pill')).trim() === 'Open', 'an older Two Degrees shows Open, not Update: Google Play keeps apps up to date');
    check(await p.isHidden('.tab .badge'), '… so there’s no update badge');
    await p.click('#all-apps [data-id="meridian"] [data-act="launch"]'); await p.waitForTimeout(200);
    check((await calls(p)).includes('open:com.bradcowdrey.meridian'), 'Open opens Meridian');
    check((await p.textContent('#setup-slot .ring b')).trim() === '2/4', 'the ring counts the Android apps on the phone (2 of 4)');
    const pdf = await p.getAttribute('#all-apps [data-id="cowdrey-pdf"] a.pill', 'href');
    check(pdf === C.apps.find((a) => a.id === 'cowdrey-pdf').platforms.web.get[0].url && (await p.textContent('#all-apps [data-id="cowdrey-pdf"] .pill')).trim() === 'Open', 'an app without an Android version falls back to the web');
    await p.click('#all-apps [data-id="cowdrey-pdf"] a.pill'); await p.waitForTimeout(200);
    check((await calls(p)).includes('url:' + pdf), '… and Open opens its web version');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    check(!(await p.$('.sheet [data-act="bulk"]')) && !/Install All/.test(await p.textContent('.sheet')), 'Get Every App has no Install All');
    const gets = await p.$$eval('.sheet #setup-rows a.pill', (els) => els.map((e) => e.getAttribute('href')));
    check(['cowdrey-md', 'bearings'].every((id) => gets.includes(play(C.apps.find((a) => a.id === id).bundle))), '… just Get on each app, to its Google Play page');
    check(/Google Play/.test(await p.textContent('.sheet .sheet-lead')), '… and says how Google Play works');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('#all-apps [data-id="bearings"] .main'); await p.waitForTimeout(600);
    const row = await p.textContent('.sheet .get-row.here');
    check(/Google Play/.test(row) && (await p.getAttribute('.sheet .get-row.here a.pill', 'href')) === play('com.bradcowdrey.bearings'), 'the app’s page offers Android from Google Play');
    check((await p.$$('.sheet .hero .shots img')).length === C.apps.find((a) => a.id === 'bearings').shots, '… with its App Store screenshots in a row');
    check((await apkLinks()).length === 0, '… and no APK');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('.tab[data-tab="library"]'); await p.waitForTimeout(300);
    check(/Google Play keeps them up to date/.test(await p.textContent('#view-library')) && !(await p.$('#view-library [data-act="check"]')), 'the Library leaves updates to Google Play');
    await p.click('.tab[data-tab="share"]'); await p.waitForTimeout(300);
    check(!!(await p.$(`#view-share a[href="${C.hubDownloads.play}"]`)), 'Share offers Cowdrey One on Google Play, not its APK');
    check((await apkLinks()).length === 0 && !/Install All|Download All/.test(await p.textContent('body')), 'no link to an APK anywhere, and no Install All');
    await ctx.close();
  }

  console.log('iPhone app');
  {
    const { ctx, p } = await nativeApp('iphone-app', { ...devices['iPhone 15 Pro'] }, {});
    check((await p.$$('#all-apps use[href="#i-android"]')).length === 0, 'the iPhone app doesn’t show Android');
    await noAndroid(p, 'the iPhone app');
    await appStoreLinks(p, 'the iPhone app');
    await iosStoreBehaviour(p, 'the iPhone app');
    await p.evaluate(() => document.querySelector('#all-apps [data-id="bearings"] .main').click()); await p.waitForTimeout(500);
    check(!/beta|TestFlight/i.test(await p.textContent('.sheet #get-rows')) && (await p.$$('.sheet #get-rows .get-row')).length === 2, 'Bearings’ page offers the App Store and the web, and no TestFlight beta');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    const onStore = C.apps.filter((a) => a.platforms.ios && a.platforms.ios.get[0].kind === 'appstore').length;
    check((await p.textContent('.sheet [data-act="bulk"]')).trim() === `Get All (${onStore})`, `Get All covers the ${onStore} apps on the App Store`);
    await p.click('.sheet [data-act="bulk"]'); await p.waitForTimeout(1500);
    const ids = (await calls(p)).filter((x) => String(x).startsWith('store:')).map((x) => x.slice(6));
    const want = C.apps.map((a) => a.platforms.ios && a.platforms.ios.get[0].kind === 'appstore' ? a.platforms.ios.get[0].url.match(/id(\d+)/)[1] : null).filter(Boolean);
    check(JSON.stringify(ids) === JSON.stringify(want), `it shows each App Store page in turn, in order (${ids.join(', ')})`);
    check(await p.evaluate(() => ['cowdrey-md', 'meridian', 'two-degrees', 'bearings'].every((id) => window.CowdreyOne.state(id).s === 'get')), 'closing the App Store pages doesn’t mark any app as on this iPhone');
    check((await p.$$('.pill.done, use[href="#i-check-circle"]')).length === 0, 'no app shows a check');
    check(!(await p.$('#setup-slot .ring')), 'no count, since iOS doesn’t let Cowdrey One see most apps');
    // Leaving the app and coming back (opening it from the Home Screen, or switching to it) starts at the top.
    const comeBack = () => p.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.evaluate(() => { document.querySelector('.sheet .sheet-scroll').scrollTop = 400; });
    check(await p.evaluate(() => document.querySelector('.sheet .sheet-scroll').scrollTop) > 0, '(the open page is scrolled down)');
    await comeBack(); await p.waitForTimeout(100);
    check(await p.evaluate(() => document.querySelector('.sheet .sheet-scroll').scrollTop) === 0, 'coming back to the app scrolls an open page to the top');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.evaluate(() => window.scrollTo(0, 900));
    check(await p.evaluate(() => window.scrollY) > 0, '(the list is scrolled down)');
    await comeBack(); await p.waitForTimeout(100);
    check(await p.evaluate(() => window.scrollY) === 0, 'opening or switching back to the app starts at the top of the screen');
    await ctx.close();
  }

  console.log('iPad app');
  {
    const { ctx, p } = await nativeApp('ipad-app', { ...devices['iPad Pro 11'] }, {});
    check(await p.evaluate(() => window.CowdreyOne.native) === 'ios', 'it knows it is the iPad app');
    await noAndroid(p, 'the iPad app');
    await appStoreLinks(p, 'the iPad app');
    await iosStoreBehaviour(p, 'the iPad app');
    const cut = await p.evaluate(() => [...document.querySelectorAll('.feature-bar small, #all-apps .sub.clamp')].filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
    check(!cut.length, `every card and app line shows its subtitle in full on the iPad${cut.length ? ` (cut: ${cut.join('; ')})` : ''}`);
    await ctx.close();
  }

  console.log('iPhone app, with Two Degrees installed');
  {
    const { ctx, p } = await nativeApp('iphone-app-2', { ...devices['iPhone 15 Pro'] }, { twodegrees: true });
    check((await calls(p)).includes('canOpen'), 'it asks iOS which apps’ links open');
    check(await p.evaluate(() => window.CowdreyOne.state('two-degrees').s) === 'done', 'it sees Two Degrees, by its link');
    check((await p.textContent('#all-apps [data-id="two-degrees"] .pill')).trim() === 'Open', '… and offers Open');
    check((await p.textContent('#all-apps [data-id="bearings"] .pill')).trim() === 'Get', 'an app it can’t see still says Get');
    await p.click('#all-apps [data-id="two-degrees"] [data-act="launch"]'); await p.waitForTimeout(200);
    check((await calls(p)).includes('open:twodegrees'), 'Open opens Two Degrees');
    await p.click('#setup-slot [data-act="setup"]'); await p.waitForTimeout(400);
    const onStore2 = C.apps.filter((a) => a.platforms.ios && a.platforms.ios.get[0].kind === 'appstore').length;
    check((await p.textContent('.sheet [data-act="bulk"]')).trim() === `Get All (${onStore2 - 1})`, 'Get All leaves out Two Degrees, which is already here');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.click('.tab[data-tab="library"]'); await p.waitForTimeout(300);
    check((await p.textContent('#view-library .section-head h2')).trim() === 'On This iPhone', 'the Library lists Two Degrees as on this iPhone');
    check((await p.$$('#view-library .group')).length >= 2 && /More Apps/.test(await p.textContent('#view-library')), '… and the rest as More Apps, not “not on this iPhone”');
    await ctx.close();
  }

  await browser.close();
  server.close();
  for (const e of errors) { failures++; console.log('  ✗ page error: ' + e); }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
