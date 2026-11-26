/* Cowdrey One: every app by Bradley Cowdrey, with the right download for the device it runs on.
   No account, no analytics. What a person gets here is remembered in this browser only (localStorage).
   The one network request the app makes itself is to GitHub's public releases API, to see new versions. */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const C = window.CATALOG;
  const APPS = C.apps;
  const byId = Object.fromEntries(APPS.map((a) => [a.id, a]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const appIcon = (a, size) => `<span class="icon"${size ? ` style="width:${size}px;height:${size}px"` : ''}><img src="apps/${a.id}.png" alt="" loading="lazy" decoding="async"></span>`;
  const sky = (a) => `--sky1:${a.sky[0]};--sky2:${a.sky[1]}`;
  let uid = 0;

  /* ---------- Storage: per browser, never sent anywhere ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cowdrey-one.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('cowdrey-one.' + k, JSON.stringify(v)); } catch (e) { /* private mode: keep it in memory */ } },
  };
  // The apps Cowdrey One has seen on this device itself ("mac:bearings" → { v: '2.4.0', k: 'dmg', t, real: true }).
  // Nothing counts as installed because it was got here: tapping Get doesn't mean the app was installed. Lists kept
  // by earlier versions, which did that, are dropped.
  let installed = store.get('installed', {});
  for (const k of Object.keys(installed)) if (!installed[k] || !installed[k].real) delete installed[k];
  store.set('installed', installed);
  let releases = store.get('releases', {});              // "bearings" → { v, date, notes, url }
  let checkedAt = store.get('checkedAt', 0);
  const prefs = Object.assign({ platform: 'auto', appearance: 'auto' }, store.get('prefs', {}));
  const savePrefs = () => store.set('prefs', prefs);

  /* ---------- Which device this is ---------- */
  const UA = navigator.userAgent;
  const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const standalone = isTauri || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const detected = (() => {
    if (/Android/i.test(UA)) return { p: 'android', device: /Mobile/i.test(UA) ? 'Android phone' : 'Android tablet' };
    if (/iPhone|iPod/.test(UA)) return { p: 'ios', device: 'iPhone' };
    if (/iPad/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)) return { p: 'ios', device: 'iPad' };
    if (/Macintosh|Mac OS X/.test(UA)) return { p: 'mac', device: 'Mac' };
    return { p: 'web', device: /Windows/.test(UA) ? 'PC' : 'computer' };
  })();
  const PLAT = {
    ios: { name: 'iPhone and iPad', icon: 'iphone', device: 'iPhone or iPad' },
    android: { name: 'Android', icon: 'android', device: 'Android phone' },
    mac: { name: 'Mac', icon: 'mac', device: 'Mac' },
    web: { name: 'Web', icon: 'globe', device: 'browser' },
  };
  const ORDER = ['ios', 'android', 'mac', 'web'];
  const plat = () => (prefs.platform === 'auto' ? detected.p : prefs.platform);
  const deviceName = () => (prefs.platform === 'auto' ? detected.device : PLAT[prefs.platform].device);
  const thisDevice = () => (prefs.platform === 'auto' ? 'this ' + detected.device : 'your ' + PLAT[prefs.platform].device);
  const isPhone = () => detected.p === 'ios' || detected.p === 'android';
  // The Mac app draws under the window's traffic lights, as the Mac App Store does.
  if (isTauri && detected.p === 'mac') document.documentElement.classList.add('mac-app');

  // In the Mac, iPhone and Android apps, Cowdrey One does what a browser can't (desktop/src-tauri):
  // on the Mac it installs apps itself; on Android it hands APKs to Android's installer; on iPhone it shows App Store
  // pages inside the app. Both the Mac and Android apps also see which apps are really installed.
  const NATIVE = isTauri ? detected.p : null;
  const tauri = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);
  const nativeCall = (method, args) => tauri('plugin:installer|native', { method, args: args || {} });
  // App Review turns down apps that name or show other platforms (guideline 2.3.10), so the apps from Apple's App
  // Stores leave Android out: its name, its icon and its steps. They are the iPhone and iPad app (only ever from the
  // App Store or TestFlight) and the Mac App Store version of the Mac app (desktop/build.mjs with STORE=appstore adds
  // store.js, which sets COWDREY_STORE). The Mac app from GitHub (.dmg) and the web keep every platform.
  const APPLE_STORE = NATIVE === 'ios' || (NATIVE === 'mac' && window.COWDREY_STORE === 'appstore');
  if (APPLE_STORE) document.documentElement.classList.add('apple-store');
  const SHOWN = APPLE_STORE ? ORDER.filter((p) => p !== 'android') : ORDER;
  // Words about the apps (their features, the About page), with Android taken out of a list of platforms in the App
  // Store versions: "Mac, iPhone, iPad and Android" becomes "Mac, iPhone and iPad".
  // Release notes in What's New also lose any line about another platform, a browser or a download file.
  const OTHER = /\b(?:Android|Google Play|Windows|Linux|Chrome|Edge|APK)\b|\.dmg\b|\bDMG\b/;
  // The Mac App Store version of the Mac app. An app from the Mac App Store may not download or install other apps
  // (App Review guidelines 2.4.5 and 2.5.2): there Get opens an app's page on the Mac App Store, or, for an app that
  // isn't on the Mac App Store, its web version, in the default browser. Never a .dmg, and nothing is installed here
  // (its build leaves the installer out: desktop/src-tauri, the appstore feature).
  const MAS = NATIVE === 'mac' && window.COWDREY_STORE === 'appstore';
  function apple(text) {
    if (!APPLE_STORE) return text;
    return String(text)
      .replace(/, Android(?: phones?| tablets?)?(?=,)/g, '')
      .replace(/((?:[\w.]+, )*[\w.]+),? (and|or) Android(?: phones?| tablets?)?\b/g, (m, list, conj) => {
        const items = list.split(', '), last = items.pop();
        return items.length ? `${items.join(', ')} ${conj} ${last}` : last;
      });
  }
  // The Android app from Google Play (desktop/build.mjs with STORE=play adds store.js, which sets COWDREY_STORE).
  // Google Play doesn't let an app install other apps or download APKs, so there every Android app comes from its
  // own Google Play page, and Play keeps it up to date. The Android app from GitHub installs APKs, as before.
  const PLAY = NATIVE === 'android' && window.COWDREY_STORE === 'play';
  // The web app opened from an App Store version's QR code or Share link (?store=apple): it offers no downloads
  // (.dmg, APK) and no beta, so what App Review sees behind the link is the same as in the app: App Store pages and
  // web apps. Kept for the visit, as a person moves between tabs and app pages.
  const NODL = !NATIVE && (() => {
    let on = new URLSearchParams(location.search).get('store') === 'apple';
    try { if (on) sessionStorage.setItem('cowdrey-one.store', 'apple'); else on = sessionStorage.getItem('cowdrey-one.store') === 'apple'; } catch (e) { /* no storage: the link's own ?store=apple still counts */ }
    return on;
  })();
  // Where the App Store versions send people: the QR code, Share and Copy Link. Cowdrey One's own App Store page once
  // it has one (catalog hubDownloads.appstore), else the web app with ?store=apple. Elsewhere, the web app as before.
  const hubLink = (app) => {
    if ((APPLE_STORE || NODL) && !app && C.hubDownloads.appstore) return C.hubDownloads.appstore;
    const q = [APPLE_STORE || NODL ? 'store=apple' : '', app ? 'app=' + app : ''].filter(Boolean).join('&');
    return C.hubUrl + (q ? '?' + q : '');
  };
  // Lines about TestFlight or a beta, left out of the App Store versions' words (guideline 2.2).
  const BETA = /TestFlight|\bbeta\b/i;
  const playUrl = (a) => 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(a.bundle);
  const playHere = () => PLAY && plat() === 'android';
  // The ways to get an app that this device's app can carry out itself.
  const canNative = (o) => !!o && !!NATIVE && o.p === NATIVE &&
    ((NATIVE === 'mac' && !MAS && o.kind === 'dmg') || (NATIVE === 'android' && !PLAY && o.kind === 'apk') || (NATIVE === 'ios' && o.kind === 'appstore'));
  const storeId = (url) => (String(url).match(/\/id(\d+)/) || [])[1];
  // Whether Cowdrey One can see if an app is on this device. The Mac and Android apps see every app they list. iOS
  // doesn't let one app see which others are installed: the iPhone app can only ask whether an app's own link (its
  // URL scheme, in catalog.js) opens. A browser can't see any.
  const sees = (a) => !!NATIVE && plat() === NATIVE && !!a.platforms[NATIVE] && (NATIVE === 'ios' ? !!a.scheme : !!a.bundle);

  /* ---------- Ways to get an app ---------- */
  const KIND = {
    appstore: { how: 'App Store', btn: 'Get', toast: (n) => `Opening ${n} on the App Store.` },
    testflight: { how: 'Beta on TestFlight', btn: 'Join', toast: (n) => `Opening the ${n} beta. TestFlight asks you to install it first if you don’t have it.` },
    macappstore: { how: 'Mac App Store', btn: 'Get', toast: (n) => `Opening ${n} on the Mac App Store.` },
    dmg: { how: 'Download (.dmg)', btn: 'Get', toast: (n) => `Downloading ${n}. Open the .dmg in Downloads and drag ${n} into Applications.` },
    apk: { how: 'Download (APK)', btn: 'Get', toast: (n) => `Downloading ${n}. Open it from Downloads and tap Install.` },
    play: { how: 'Google Play', btn: 'Get', toast: (n) => `Opening ${n} on Google Play.` },
    web: { how: 'In your browser', btn: 'Open', toast: (n) => `Opening ${n}.` },
  };
  // In the Google Play app, an app with an Android version is got from its Google Play page, never as an APK.
  // In the apps from Apple's App Stores, the Mac's only way is the Mac App Store: an app that isn't there has no Mac
  // option (its .dmg is never offered), so Get opens its web version.
  const options = (a, p) => {
    if (PLAY && p === 'android' && a.platforms.android && a.bundle) return [{ kind: 'play', url: playUrl(a) }];
    let list = (a.platforms[p] && a.platforms[p].get) || [];
    // No beta in the App Store versions (guideline 2.2), nor behind their link (NODL), which offers no download either.
    if (APPLE_STORE || NODL) list = list.filter((o) => o.kind !== 'testflight');
    if (NODL) list = list.filter((o) => o.kind !== 'dmg' && o.kind !== 'apk');
    return APPLE_STORE && p === 'mac' ? list.filter((o) => o.kind === 'macappstore') : list;
  };
  // The platforms an app is shown on: in the App Store versions, the Mac only when it's on the Mac App Store.
  const offered = (a, p) => !!a.platforms[p] && options(a, p).length > 0;
  function best(a, p = plat()) {
    const list = options(a, p);
    const o = (p === NATIVE && list.find((x) => canNative(Object.assign({ p }, x)))) || list[0];
    if (o) return Object.assign({ p }, o);
    const w = options(a, 'web')[0];
    return w ? Object.assign({ p: 'web', fallback: true }, w) : null;
  }

  /* ---------- Versions ---------- */
  const verOf = (s) => { const m = String(s || '').match(/\d+\.\d+(?:\.\d+)?/); return m ? m[0] : null; };
  function cmpV(a, b) {
    const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    return 0;
  }
  const latest = (a) => { const r = releases[a.id]; return r && r.v && cmpV(r.v, a.version) > 0 ? r.v : a.version; };
  const key = (p, id) => p + ':' + id;
  const mine = (a) => installed[key(plat(), a.id)];

  const busy = {};   // app id → what its install is doing: downloading, verifying, installing, waiting
  const STAGE = { downloading: 'Downloading', verifying: 'Checking', installing: 'Installing', waiting: 'App Store' };
  function state(a) {
    if (busy[a.id]) return { s: 'busy', stage: busy[a.id], o: best(a) };
    const o = best(a);
    if (!o) return { s: 'none' };
    const inst = mine(a);
    // The Mac App Store version opens an app it sees on this Mac, even one it would otherwise send to the web.
    if (o.kind === 'web' && !(MAS && inst && plat() === 'mac')) return { s: 'open', o, inst };
    if (inst && inst.k !== 'web') {
      // The App Stores and TestFlight update their apps themselves; downloads (.dmg, APK) are shown here. Not in the
      // Google Play app, which leaves updates to Google Play, nor in the Mac App Store version, which installs nothing.
      if (((inst.k === 'dmg' && !MAS) || (inst.k === 'apk' && !PLAY)) && cmpV(latest(a), inst.v) > 0) return { s: 'update', o, inst };
      return { s: 'done', o, inst };
    }
    return { s: 'get', o, inst };
  }
  const updates = () => APPS.filter((a) => state(a).s === 'update');
  // How many of the apps made for this device are on it: only where Cowdrey One can see every one of them (the Mac
  // and Android apps). Elsewhere there's no count, because it would be a guess.
  // The Mac App Store version counts nothing: most of the apps it lists open on the web there, so a count of what's
  // installed would never match the list.
  function tally() {
    if (MAS) return null;
    const list = APPS.filter((a) => { const o = best(a); return o && o.kind !== 'web'; });
    if (!list.length || !list.every(sees)) return null;
    return { n: list.filter((a) => mine(a)).length, total: list.length };
  }

  /* ---------- Buttons ---------- */
  // long: the label in full where there's room (an app's page), "Open on the web" rather than "Open".
  function pill(a, variant = '', long = false) {
    const st = state(a);
    if (st.s === 'none') return '';
    const n = esc(a.name);
    if (st.s === 'busy') return `<span class="pill busy ${variant}" data-pill="${a.id}" role="status" aria-label="${n}: ${STAGE[st.stage] || 'Working'}"></span>`;
    // Seen on this device: Open. There's no "got it" check: Cowdrey One only says an app is here when it has seen it.
    if (st.s === 'done') {
      return `<button class="pill ${variant}" data-pill="${a.id}" data-act="launch" data-id="${a.id}" aria-label="Open ${n}, on ${esc(thisDevice())}">Open</button>`;
    }
    const onWeb = MAS && st.o.fallback;
    const label = st.s === 'update' ? 'Update' : onWeb && long ? 'Open on the web' : KIND[st.o.kind].btn;
    const cls = st.s === 'update' ? 'solid' : '';
    return `<a class="pill ${cls} ${variant}" data-pill="${a.id}" data-act="get" data-id="${a.id}"${long ? ' data-long="1"' : ''} href="${esc(st.o.url)}"${linkTarget(st.o)} aria-label="${onWeb ? `Open ${n} on the web` : `${label} ${n}${st.o.fallback ? ', in your browser' : ''}`}">${label}</a>`;
  }
  const pillWrap = (a, variant = '') => {
    const st = state(a);
    const note = st.s === 'busy' ? (STAGE[st.stage] || '') : st.o && st.o.fallback && st.s !== 'done' ? (MAS ? 'On the web' : 'Web app') : st.s === 'update' ? 'v' + esc(latest(a)) : '';
    return `<span class="pill-wrap">${pill(a, variant)}${note ? `<small>${note}</small>` : ''}</span>`;
  };
  // Downloads load in place (the page stays); stores and web apps open beside this one.
  const linkTarget = (o) => (o.kind === 'apk' || o.kind === 'dmg' ? '' : ' target="_blank" rel="noopener"');

  // The Mac App Store version opens a Mac App Store page with its macappstore:// link, so it opens in the App Store
  // app itself (an https link to apps.apple.com would open the browser first).
  const masLink = (url) => { const id = storeId(url); return id ? `macappstore://apps.apple.com/app/id${id}` : url; };
  function openUrl(url, kind) {
    if (MAS && kind === 'macappstore') url = masLink(url);
    const T = window.__TAURI__;
    if (T && T.opener && T.opener.openUrl) return T.opener.openUrl(url);
    if (T && T.core && T.core.invoke) return T.core.invoke('plugin:opener|open_url', { url });
    const a = document.createElement('a');
    a.href = url;
    if (kind !== 'apk' && kind !== 'dmg') { a.target = '_blank'; a.rel = 'noopener'; }
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Get (or update, or open) an app. el is the button pressed; o a specific way to get it, or the best for this device.
  function get(a, el, o, e) {
    o = o || best(a);
    if (!o) return;
    if (canNative(o)) { if (e) e.preventDefault(); nativeGet(a, o); return; }
    const byLink = e && el && el.tagName === 'A' && !isTauri;   // the link itself opens the store, download or web app
    if (!byLink) { if (e) e.preventDefault(); openUrl(o.url, o.kind); }
    // Opening the store or starting a download doesn't install anything, so nothing is marked as installed here.
    const p = o.fallback ? plat() : o.p;
    let msg = MAS && o.kind === 'web' ? `Opening ${a.name} on the web.` : KIND[o.kind].toast(a.name);
    if (o.kind === 'web' && (detected.p === 'ios' || detected.p === 'android') && p !== 'web') {
      msg = `Opening ${a.name}. To keep it, add it to your Home Screen from the browser’s ${detected.p === 'ios' ? 'Share' : '⋮'} menu.`;
    }
    toast(msg);
  }
  // Installs (Mac, Android) or shows the App Store page (iPhone) for one app, in the native apps. True when done.
  async function nativeGet(a, o, quiet) {
    if (busy[a.id]) return false;
    if (NATIVE === 'android' && !(await androidReady())) return false;
    try {
      if (NATIVE === 'ios') {
        busy[a.id] = 'waiting'; refresh();
        // Closing the App Store page doesn't say whether the app was got; syncInstalled checks the apps it can see.
        await nativeCall('showStore', { id: storeId(o.url) });
        return true;
      }
      busy[a.id] = NATIVE === 'mac' ? 'downloading' : 'installing'; refresh();
      if (NATIVE === 'mac') {
        await tauri('install_app', { id: a.id, url: o.url, bundleId: a.bundle, appName: a.macApp });
        if (!quiet) toast(`${a.name} is in Applications.`);
      } else {
        const r = await nativeCall('install', { url: o.url, name: a.name, packageName: a.bundle || null });
        if (r && r.status === 'cancelled') { if (!quiet) toast(`${a.name} wasn’t installed.`); return false; }
        if (!quiet) toast(`${a.name} is installed.`);
      }
      return true;
    } catch (err) {
      toast(String((err && err.message) || err || `Couldn’t get ${a.name}.`));
      return false;
    } finally {
      delete busy[a.id];
      await syncInstalled();
      refresh();
    }
  }
  // Android asks once before an app may install others: Settings, Install unknown apps, Cowdrey One.
  async function androidReady() {
    try { const r = await nativeCall('canInstall'); if (!r || r.allowed) return true; } catch (e) { return true; }
    openSheet(allowPage(), { kind: 'allow', short: true });
    return false;
  }
  // What's really installed: every app in the Mac and Android apps; in the iPhone app, the apps with a URL scheme
  // (iOS answers only "can this link open?", and only for schemes listed in the app's Info.plist). A browser sees none.
  async function syncInstalled() {
    if (!NATIVE) return;
    const found = {};
    try {
      if (NATIVE === 'ios') {
        const list = APPS.filter((a) => a.scheme && a.platforms.ios);
        if (!list.length) return;
        const r = await nativeCall('canOpen', { schemes: list.map((a) => a.scheme) });
        const open = (r && r.open) || {};
        for (const a of list) if (open[a.scheme]) found[a.id] = { v: null, k: 'appstore' };
      } else if (NATIVE === 'mac') {
        const list = APPS.filter((a) => a.bundle && a.macApp && a.platforms.mac);
        const r = await tauri('installed_apps', { apps: list.map((a) => ({ id: a.id, bundleId: a.bundle, appName: a.macApp })) }) || {};
        for (const a of list) if (r[a.id]) found[a.id] = { v: r[a.id].version, k: r[a.id].appStore ? 'macappstore' : 'dmg' };
      } else {
        const list = APPS.filter((a) => a.bundle && a.platforms.android);
        const r = await nativeCall('installedVersions', { packages: list.map((a) => a.bundle) });
        const apps = (r && r.apps) || {};
        // An app installed from Google Play is signed with Google's key, so a GitHub APK can't update it: Play does.
        for (const a of list) if (apps[a.bundle]) found[a.id] = { v: apps[a.bundle].version, k: apps[a.bundle].installer === 'com.android.vending' ? 'play' : 'apk' };
      }
    } catch (e) { return; }
    for (const a of APPS) {
      if (!(NATIVE === 'ios' ? a.scheme : a.bundle)) continue;
      const k = key(NATIVE, a.id), f = found[a.id];
      // The iPhone app can't read another app's version: v stays empty there.
      if (f) installed[k] = { v: f.v ? verOf(f.v) || latest(a) : null, k: f.k, t: (installed[k] && installed[k].t) || Date.now(), real: true };
      else delete installed[k];
    }
    store.set('installed', installed);
    refresh();
  }
  // What one tap gets on this device. In the apps: every app they can install themselves. In a browser on a Mac or
  // Android phone: every download at once. On an iPhone in a browser, the App Store takes one app at a time.
  function bulkPlan() {
    const p = plat();
    // The Mac App Store version: each app on the Mac App Store, one page at a time (stepStore).
    if (MAS && p === 'mac') {
      return { kind: 'store', label: 'Get All',
        list: APPS.filter((a) => { const s = state(a); return s.s === 'get' && s.o.kind === 'macappstore'; }) };
    }
    // Google Play installs one app at a time, from its own page: the Google Play app has no Install All.
    if (PLAY && p === 'android') return { kind: 'none', list: [] };
    if (NATIVE && p === NATIVE) {
      return { kind: 'native', label: NATIVE === 'ios' ? 'Get All' : 'Install All',
        list: APPS.filter((a) => { const s = state(a); return (s.s === 'get' || s.s === 'update') && canNative(s.o); }) };
    }
    if (!NATIVE && (p === 'mac' || p === 'android')) {
      const kind = p === 'mac' ? 'dmg' : 'apk';
      return { kind: 'download', label: 'Download All', fileKind: kind,
        list: APPS.filter((a) => !mine(a) && options(a, p).some((o) => o.kind === kind)) };
    }
    return { kind: 'none', list: [] };
  }
  let bulkRunning = '';
  async function runNative(list, verb) {
    if (bulkRunning || !list.length) return;
    if (NATIVE === 'android' && !(await androidReady())) return;
    let done = 0;
    const failed = [];
    for (let i = 0; i < list.length; i++) {
      bulkRunning = `${verb} ${i + 1} of ${list.length}…`; refresh();
      if (await nativeGet(list[i], best(list[i]), true)) done++; else failed.push(list[i].name);
    }
    bulkRunning = ''; refresh();
    if (NATIVE === 'ios') toast(failed.length ? `Not opened: ${failed.join(', ')}.` : 'That’s every app on the App Store.');
    else toast(failed.length ? `${done} installed. Not installed: ${failed.join(', ')}.` : `${done} ${done === 1 ? 'app' : 'apps'} installed.`);
  }
  function downloadAll(plan) {
    const p = plat();
    plan.list.forEach((a, i) => {
      const o = options(a, p).find((x) => x.kind === plan.fileKind);
      setTimeout(() => openUrl(o.url, o.kind), i * 1500);   // one at a time, so each download starts before the next
    });
    toast(`Downloading ${plan.list.length} ${plan.list.length === 1 ? 'app' : 'apps'}. Your browser may ask to allow several downloads.`);
  }
  // The Mac App Store version's Get All steps through the apps' Mac App Store pages, as the iPhone app does: each
  // click opens the next one in the App Store (which can't be shown inside the app on a Mac).
  let storeSteps = null;   // { list, i }: the pages still to open
  function stepStore(plan) {
    if (!storeSteps) storeSteps = { list: plan.list.slice(), i: 0 };
    const a = storeSteps.list[storeSteps.i++];
    if (a) { const o = best(a); openUrl(o.url, o.kind); }
    const last = storeSteps.i >= storeSteps.list.length;
    if (last) storeSteps = null;
    toast(a ? `Opening ${a.name} on the Mac App Store.${last ? '' : ' Click Get there, then come back here for the next.'}` : 'Every app on the Mac App Store is on this Mac.');
    refresh();
  }
  function bulkLabel(plan) {
    if (storeSteps) { const s = storeSteps; return `Next: ${s.list[s.i].name} (${s.i + 1} of ${s.list.length})`; }
    if (plan.kind === 'store' && plan.list.length === 1) return `Get ${plan.list[0].name} on the Mac App Store`;
    return `${plan.label} (${plan.list.length})`;
  }
  function runBulk() {
    const plan = bulkPlan();
    if (plan.kind === 'store') stepStore(plan);
    else if (plan.kind === 'download') downloadAll(plan);
    else if (plan.kind === 'native') runNative(plan.list, NATIVE === 'ios' ? 'Opening' : 'Installing');
  }

  /* ---------- Art: a glimpse of each app ---------- */
  function compass() {
    let ticks = '';
    for (let i = 0; i < 72; i++) {
      const deg = i * 5, big = deg % 30 === 0, r1 = big ? 82 : 86, r2 = 93, rad = (deg - 90) * Math.PI / 180;
      ticks += `<line x1="${(100 + r1 * Math.cos(rad)).toFixed(1)}" y1="${(100 + r1 * Math.sin(rad)).toFixed(1)}" x2="${(100 + r2 * Math.cos(rad)).toFixed(1)}" y2="${(100 + r2 * Math.sin(rad)).toFixed(1)}" stroke="${deg === 0 ? '#E04A7A' : 'rgba(255,255,255,' + (big ? '.85' : '.45') + ')'}" stroke-width="${big ? 2 : 1.2}" stroke-linecap="round"/>`;
    }
    const letter = (t, x, y, c) => `<text x="${x}" y="${y}" fill="${c}" font-size="15" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,system-ui,sans-serif">${t}</text>`;
    return `<svg viewBox="0 0 200 200" width="196" height="196" aria-hidden="true"><circle cx="100" cy="100" r="96" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.18)"/>${ticks}
      ${letter('N', 100, 30, '#FF7AA2')}${letter('E', 170, 100, '#fff')}${letter('S', 100, 170, '#fff')}${letter('W', 30, 100, '#fff')}
      <g transform="rotate(-24 100 100)"><path d="M100 48 L108 100 L92 100 Z" fill="#E04A7A"/><path d="M100 152 L108 100 L92 100 Z" fill="#FBF9F5"/><circle cx="100" cy="100" r="5" fill="#14243B" stroke="#fff" stroke-width="2"/></g></svg>`;
  }
  function sunset() {
    const g = 'gh' + (++uid);
    return `<svg viewBox="0 0 260 170" width="260" height="170" aria-hidden="true"><defs>
      <linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE0A3"/><stop offset="1" stop-color="#F4A85C"/></linearGradient>
      <radialGradient id="${g}g" cx=".5" cy=".62" r=".5"><stop offset="0" stop-color="#FFC27A" stop-opacity=".55"/><stop offset="1" stop-color="#FFC27A" stop-opacity="0"/></radialGradient>
      <clipPath id="${g}c"><rect x="0" y="0" width="260" height="108"/></clipPath></defs>
      <rect x="0" y="0" width="260" height="170" fill="url(#${g}g)"/>
      <circle cx="130" cy="108" r="62" fill="url(#${g}s)" clip-path="url(#${g}c)"/>
      <rect x="40" y="104" width="180" height="8" rx="4" fill="#FBF0DE"/>
      <rect x="78" y="128" width="104" height="6" rx="3" fill="rgba(255,255,255,.45)"/>
      <rect x="102" y="146" width="56" height="6" rx="3" fill="rgba(255,255,255,.28)"/></svg>`;
  }
  const CITIES = [['America/New_York', 'New York'], ['Europe/London', 'London'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney']];
  function hereZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
  }
  function clockParts(tz) {
    const d = new Date();
    let s;
    try { s = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'short', hour12: true }).formatToParts(d); } catch (e) { return null; }
    const g = (t) => (s.find((x) => x.type === t) || {}).value;
    const h24 = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(d));
    const wd = g('weekday');
    const status = wd === 'Sat' || wd === 'Sun' ? 'Weekend' : h24 >= 9 && h24 < 17 ? 'Working' : 'Off hours';
    return { time: `${g('hour')}:${g('minute')}`, ap: g('dayPeriod'), status };
  }
  function clocks() {
    const here = hereZone();
    const zones = [[here, 'Here']].concat(CITIES.filter(([z]) => z !== here).slice(0, 2));
    return `<div class="art-clocks">${zones.map(([z, name]) => {
      const c = clockParts(z) || { time: '', ap: '', status: '' };
      return `<div class="city"><div><b>${esc(name)}</b><small data-tz-status="${esc(z)}">${c.status}</small></div><span class="time" data-tz="${esc(z)}">${c.time}<i>${c.ap}</i></span></div>`;
    }).join('')}</div>`;
  }
  function tickClocks() {
    $$('[data-tz]').forEach((el) => { const c = clockParts(el.dataset.tz); if (c) el.innerHTML = `${c.time}<i>${c.ap}</i>`; });
    $$('[data-tz-status]').forEach((el) => { const c = clockParts(el.dataset.tzStatus); if (c) el.textContent = c.status; });
  }
  function art(a) {
    switch (a.id) {
      case 'bearings': return compass();
      case 'two-degrees': return `<div class="art-reading" aria-hidden="true"><div class="t">48<sup>°F</sup><span>9°C</span></div><div class="c">Partly Cloudy · H:52° L:41°</div></div>`;
      case 'meridian': return clocks();
      case 'golden-hour': return sunset();
      case 'cowdrey-md': return `<div class="art-page" aria-hidden="true">
          <div class="paper" style="left:0;top:22px;width:124px;height:156px;background:rgba(12,22,70,.55);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.2),0 16px 40px rgba(0,0,0,.3)">
            <div class="md" style="left:12px;top:12px"># Hello<br><br>Some <i>**bold**</i><br>and <i>_italic_</i>.<br><br>- one<br>- two</div></div>
          <div class="paper" style="left:92px;top:0;width:122px;height:168px">
            <span class="h" style="top:16px">Hello</span>
            <span class="ln" style="top:50px;width:88px"></span><span class="ln" style="top:64px;width:70px"></span>
            <span class="ln" style="top:88px;width:12px;border-radius:50%"></span><span class="ln" style="top:88px;left:32px;width:54px"></span>
            <span class="ln" style="top:102px;width:12px;border-radius:50%"></span><span class="ln" style="top:102px;left:32px;width:44px"></span>
            <span class="ln" style="top:128px;width:90px"></span><span class="ln" style="top:142px;width:60px"></span></div></div>`;
      case 'cowdrey-pdf': return `<div class="art-page" aria-hidden="true" style="width:170px;height:206px">
          <div class="paper" style="left:10px;top:0;width:150px;height:200px">
            <span class="ln" style="top:20px;width:80px;height:9px;background:rgba(14,13,11,.5)"></span>
            <span class="ln" style="top:44px;width:118px"></span><span class="hl" style="top:55px;width:104px"></span><span class="ln" style="top:58px;width:96px"></span>
            <span class="ln" style="top:72px;width:110px"></span><span class="ln" style="top:86px;width:84px"></span><span class="ln" style="top:108px;width:116px"></span><span class="ln" style="top:122px;width:70px"></span>
            <svg viewBox="0 0 100 40" style="position:absolute;left:16px;top:146px;width:96px;height:38px"><path d="M4 28c8-14 14-22 18-18s-6 20 2 18 10-20 16-16-2 16 6 14 8-12 14-10 4 8 12 6 10-6 16-6" fill="none" stroke="#2546C7" stroke-width="2.6" stroke-linecap="round"/></svg>
            <span class="ln" style="top:188px;left:16px;width:100px;height:1.5px;background:rgba(14,13,11,.35)"></span></div>
          <div class="paper" style="left:122px;top:96px;width:44px;height:40px;background:#FFE27A;border-radius:4px;transform:rotate(6deg)"></div></div>`;
      default: return `<span class="icon" style="width:120px;height:120px"><img src="apps/${a.id}.png" alt=""></span>`;
    }
  }

  /* ---------- Discover ---------- */
  const brand = () => `<div class="brandbar"><img src="icon-192.png" alt=""><span>Cowdrey One</span></div>`;
  const dateLine = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const platIcons = (a) => `<span class="plats" aria-label="On ${SHOWN.filter((p) => offered(a, p)).map((p) => PLAT[p].name).join(', ')}">${SHOWN.filter((p) => offered(a, p)).map((p) => icon(PLAT[p].icon, p === plat() ? 'here' : '')).join('')}</span>`;
  // An app's label ("New", "Preview"). The App Store versions leave out "Preview", which reads as a beta there
  // (guideline 2.2).
  const statusOf = (a) => (APPLE_STORE && /^preview$/i.test(a.status || '') ? '' : a.status || '');
  const tag = (a) => (statusOf(a) ? `<span class="status-tag">${esc(statusOf(a))}</span>` : '');

  function appRow(a, opts = {}) {
    const sub = opts.sub != null ? opts.sub : esc(a.subtitle);
    return `<div class="row app tap" data-act="open-app" data-id="${a.id}">
      ${appIcon(a)}
      <button class="main" data-act="open-app" data-id="${a.id}"><span class="title">${esc(a.name)}${tag(a)}</span><span class="sub clamp">${sub}</span>${opts.plats === false ? '' : platIcons(a)}</button>
      ${pillWrap(a)}</div>`;
  }

  // An app's App Store screenshots (catalog shots), in the App Store's order.
  const shotUrl = (a, n) => `apps/shots/${a.id}-${n}.webp`;
  function featureCard(a, i) {
    // On the App Store: its first App Store screenshot, caption and all, as the App Store shows it. Otherwise the
    // app's headline and a drawn glimpse of it.
    const face = a.shots
      ? `<img class="feature-shot" src="${shotUrl(a, 1)}" alt="" ${i ? 'loading="lazy" ' : ''}decoding="async">`
      : `<div class="feature-top"><p class="eyebrow">${esc(statusOf(a) || a.category)}</p><h3>${esc(a.headline)}</h3></div>
      <div class="art">${art(a)}</div>`;
    return `<div class="feature${a.shots ? ' has-shot' : ''}" style="${sky(a)}" data-act="open-app" data-id="${a.id}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${APPS.length}: ${esc(a.name)}${a.shots ? '' : '. ' + esc(a.headline)}">
      ${face}
      <div class="feature-bar">${appIcon(a)}<button class="meta" data-act="open-app" data-id="${a.id}"><b>${esc(a.name)}</b><small>${esc(a.subtitle)}</small></button>${pill(a, 'light')}</div></div>`;
  }

  function setupCard() {
    const c = tally();
    if (!c) {
      // Cowdrey One can't see what's on this device, so no count: just the way to get them all. The Mac App Store
      // version says where they come from, since most open on the web there.
      return `<div class="setup-stack" aria-hidden="true">${APPS.slice(0, 3).map((a) => appIcon(a)).join('')}</div>
        <div class="main"><h3>${MAS && plat() === 'mac' ? 'Every app, on the Mac App Store or the web' : `Get every app on ${esc(thisDevice())}`}</h3><p>${APPS.length} free apps, one ${NATIVE === 'mac' ? 'click' : 'tap'} each.</p></div>
        <button class="pill solid" data-act="setup">Get All</button>`;
    }
    const { n, total } = c, r = 27, len = 2 * Math.PI * r;
    const left = total - n;
    return `<div class="ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${r}"/><circle class="bar" cx="32" cy="32" r="${r}" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${(len * (1 - n / total)).toFixed(1)}"/></svg><b>${n}/${total}</b></div>
      <div class="main"><h3>${left ? `Get every app on ${esc(thisDevice())}` : `Every app is on ${esc(thisDevice())}`}</h3><p>${left ? `${left} free ${left === 1 ? 'app' : 'apps'} to go, one tap each.` : playHere() ? 'Google Play keeps them up to date.' : 'New versions show up in your Library.'}</p></div>
      <button class="pill solid" data-act="setup">${left ? 'Get All' : 'See All'}</button>`;
  }

  let installEvent = null;
  function installBanner() {
    if (standalone || store.get('bannerDismissed', false) || !isPhone()) return '';
    const how = 'Keep every app one tap away.';
    return `<div class="banner"><img src="icon-192.png" alt=""><div class="main"><b>Add to Home Screen</b>${how}</div>
      ${installEvent ? `<button class="pill solid" data-act="install">Install</button>` : `<button class="pill" data-act="tab" data-tab="share">How</button>`}
      <button class="round" data-act="dismiss-banner" aria-label="Dismiss">${icon('x')}</button></div>`;
  }

  function renderDiscover() {
    const half = Math.ceil(APPS.length / 2);
    $('#view-discover').innerHTML = `
      ${brand()}<header class="large-head"><div><p class="eyebrow">${esc(dateLine())}</p><h1 class="large-title" id="t-discover">Discover</h1></div></header>
      <div class="carousel" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Featured apps">${APPS.map(featureCard).join('')}</div>
      <div class="dots" role="tablist" aria-label="Featured apps">${APPS.map((a, i) => `<button role="tab" aria-label="${esc(a.name)}" aria-current="${i === 0}" data-act="slide" data-i="${i}"></button>`).join('')}</div>
      <section class="setup" id="setup-slot">${setupCard()}</section>
      <div id="banner-slot">${installBanner()}</div>
      <div class="section-head"><h2>All Apps</h2><span class="note" id="for-note">For ${esc(thisDevice())}</span></div>
      <div class="apps-grid" id="all-apps"><div class="group">${APPS.slice(0, half).map((a) => appRow(a)).join('')}</div><div class="group">${APPS.slice(half).map((a) => appRow(a)).join('')}</div></div>
      <div class="section-head"><h2>Made the Same Way</h2></div>
      <div class="tiles">
        <div class="tile"><div class="k">${icon('gift')}Free</div><div class="v">$0</div><p>Every app, forever. No ads, no subscriptions.</p></div>
        <div class="tile"><div class="k">${icon('lock')}Private</div><div class="v">0</div><p>Trackers or accounts. What you do stays on your device.</p></div>
        <div class="tile"><div class="k">${icon('code')}Open source</div><div class="v">MIT</div><p>Every app here has its code on GitHub.</p></div>
      </div>
      ${promise()}`;
    const car = $('.carousel');
    car.addEventListener('scroll', () => {
      const i = Math.round(car.scrollLeft / (car.firstElementChild.offsetWidth + 14));
      $$('.dots button').forEach((d, j) => d.setAttribute('aria-current', String(j === i)));
    }, { passive: true });
  }
  const promise = () => `<p class="promise"><b>Free. Forever.</b>Made by <a href="${C.developer.url}" target="_blank" rel="noopener">Bradley Cowdrey · bradcowdrey.com</a><br>
    No ads, no account, no tracking. <a href="${C.termsUrl}" target="_blank" rel="noopener">Terms of Use and Privacy</a></p>`;

  /* ---------- Library ---------- */
  let checking = false, checkFailed = false;
  const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  function checkedLine() {
    if (checking) return 'Checking for updates…';
    if (checkFailed) return 'Couldn’t reach GitHub to check for updates.';
    if (!checkedAt) return 'Not checked yet';
    const today = new Date(checkedAt).toDateString() === new Date().toDateString();
    return `Checked ${today ? fmtTime(checkedAt) : fmtDay(checkedAt)}`;
  }
  function renderLibrary() {
    // Only apps Cowdrey One has seen on this device are listed as on it. Where it can see every app (the Mac and
    // Android apps) the rest are "not yet" on it; elsewhere it can't tell, so they're just the other apps.
    const got = APPS.filter((a) => mine(a)), rest = APPS.filter((a) => !mine(a)), ups = updates(), c = tally();
    // The Mac App Store version doesn't say where an app it sees came from unless it's the Mac App Store.
    const viaLine = (a) => { const i = mine(a); const how = MAS && i.k !== 'macappstore' ? 'On this Mac' : KIND[i.k].how; return `${i.v ? `Version ${esc(i.v)} · ` : ''}${esc(how)}`; };
    const seen = APPS.filter(sees), viaPlay = playHere();
    const foot = c
      ? viaPlay ? `Cowdrey One sees which apps are installed on ${esc(thisDevice())}. Google Play keeps them up to date.`
        : `Cowdrey One sees which apps are installed on ${esc(thisDevice())}, and checks GitHub for new versions.`
      : MAS && plat() === 'mac'
        ? `Cowdrey One sees which of these apps are on ${esc(thisDevice())}, and opens them. Get opens an app’s page on the Mac App Store, which keeps it up to date; an app that isn’t on the Mac App Store yet opens on the web.`
      : NATIVE === 'ios' && plat() === 'ios'
        ? `iOS doesn’t let one app see which others are installed. Cowdrey One can tell only for ${seen.length ? esc(seen.map((a) => a.name).join(' and ')) : 'apps that open from a link'}; for the rest, Get opens the App Store, which shows Open when the app is already on ${esc(thisDevice())}. The App Store keeps every app up to date.`
        : `A browser can’t see which apps are installed, so Get always brings the newest version. The App Store keeps its apps up to date.`;
    const platSelect = `<select data-act="platform" aria-label="${APPLE_STORE ? 'Show apps for' : 'Show downloads for'}">${[['auto', `Automatic (${detected.device})`]].concat(SHOWN.map((p) => [p, PLAT[p].name])).map(([v, t]) => `<option value="${v}"${prefs.platform === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    $('#view-library').innerHTML = `
      ${brand()}<header class="large-head"><div><p class="eyebrow">On ${esc(thisDevice())}</p><h1 class="large-title" id="t-library">Library</h1></div></header>
      ${c ? `<div class="reading"><span class="big">${c.n}</span><span class="of">of ${c.total} apps</span></div>
      <p class="reading-sub">${viaPlay ? (c.n ? 'Google Play keeps them up to date' : 'None installed yet')
        : `${ups.length ? `${ups.length} ${ups.length === 1 ? 'update' : 'updates'} available` : c.n ? 'Up to date' : 'None installed yet'} · ${checkedLine()}`}</p>` : ''}
      ${ups.length ? `<div class="section-head"><h2>Updates</h2>${ups.length > 1 ? '<button data-act="update-all">Update All</button>' : ''}</div>
        <div class="group">${ups.map((a) => {
          const r = releases[a.id];
          return appRow(a, { sub: `Version ${esc(mine(a).v)} → ${esc(latest(a))}${r && r.notes ? ' · ' + esc(plain(releaseText(r.notes)).slice(0, 140)) : ''}`, clamp: true, plats: false });
        }).join('')}</div>` : ''}
      ${got.length ? `<div class="section-head"><h2>On ${esc(capital(thisDevice()))}</h2></div>
        <div class="group">${got.map((a) => appRow(a, { sub: viaLine(a), plats: false })).join('')}</div>`
        : c ? `<div class="empty"><div class="stack">${APPS.slice(0, 3).map((a) => appIcon(a)).join('')}</div><h3>No apps on ${esc(thisDevice())} yet</h3>
          <p>${viaPlay ? 'Apps you install from Google Play show up here.' : 'Apps you install show up here, with a note when a new version is out.'}</p><button class="button" data-act="setup">${icon('down')}Get Every App</button></div>` : ''}
      ${rest.length ? `<div class="section-head"><h2>${c ? `Not Yet on ${esc(deviceName())}` : got.length ? 'More Apps' : 'Every App'}</h2></div><div class="group">${rest.map((a) => appRow(a)).join('')}</div>` : ''}
      <p class="group-label">Settings</p>
      <div class="group">
        <div class="row pref"><span class="glyph">${icon('device')}</span><span class="main"><span class="title" style="font-weight:400">${APPLE_STORE ? 'Show apps for' : 'Show downloads for'}</span></span><span class="value">${esc(prefs.platform === 'auto' ? 'Automatic' : PLAT[prefs.platform].name)}</span>${icon('chevron', 'chev')}${platSelect}</div>
        <div class="row pref"><span class="glyph" style="background:#5B5FC7">${icon('moon')}</span><span class="main"><span class="title" style="font-weight:400">Appearance</span></span>
          <span class="segmented" role="group" aria-label="Appearance">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, t]) => `<button data-act="appearance" data-v="${v}" aria-pressed="${prefs.appearance === v}">${t}</button>`).join('')}</span></div>
        ${PLAY || APPLE_STORE ? '' : `<div class="row pref"><span class="glyph" style="background:#2E8B57">${icon('refresh')}</span><span class="main"><span class="title" style="font-weight:400">Updates</span><span class="sub">${checkedLine()}</span></span><button class="pill" data-act="check" ${checking ? 'disabled' : ''}>Check</button></div>`}
        <button class="row pref tap" data-act="about"><span class="glyph" style="background:#6B6760">${icon('info')}</span><span class="main"><span class="title" style="font-weight:400">About Cowdrey One</span></span><span class="value">${VERSION}</span>${icon('chevron', 'chev')}</button>
      </div>
      <p class="group-foot">${foot}</p>
      ${promise()}`;
  }
  const capital = (s) => s.replace(/^this /, 'This ').replace(/^your /, 'Your ');

  /* ---------- Share and get on your phone ---------- */
  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '';
    const q = window.qrcode(0, 'H');
    q.addData(text); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${esc(text)}"><path d="${d}" fill="#0E0D0B"/></svg>`;
  }
  function renderShare() {
    const url = hubLink(), desk = !isPhone();
    const how = {
      ios: { t: 'iPhone and iPad', s: ['Open this page in Safari.', 'Tap Share (the square with an arrow), then Add to Home Screen.', 'Tap Add. Cowdrey One opens full screen, like any app.'],
        extra: C.hubDownloads.ios ? `<a class="link-button" href="${esc(C.hubDownloads.ios)}" target="_blank" rel="noopener">Or get the iPhone app</a>` : '' },
      android: { t: 'Android', s: ['Open this page in Chrome.', 'Tap ⋮, then Install app (or Add to Home screen).', 'Tap Install. It opens like any other app.'],
        extra: PLAY ? (C.hubDownloads.play ? `<a class="link-button" href="${esc(C.hubDownloads.play)}" target="_blank" rel="noopener" data-act="ext">Or get the Android app on Google Play</a>` : '')
          : C.hubDownloads.android ? `<a class="link-button" href="${esc(C.hubDownloads.android)}">Or download the Android app</a>` : '' },
      mac: { t: 'Mac', s: ['In Safari, choose File › Add to Dock. In Chrome, click Install in the address bar.', 'Cowdrey One opens in its own window, with an icon in the Dock.'],
        extra: C.hubDownloads.mac ? `<a class="link-button" href="${esc(C.hubDownloads.mac)}">Or download the Mac app</a>` : '' },
      web: { t: 'Windows and other computers', s: ['In Chrome or Edge, click Install in the address bar.', 'Cowdrey One opens in its own window.'] },
    };
    // The App Store versions name no other browser or system, and offer no download.
    // No TestFlight link (guideline 2.2): the iPhone app only from its App Store page, once it has one.
    if (APPLE_STORE) {
      how.ios.extra = C.hubDownloads.appstore ? `<a class="link-button" href="${esc(C.hubDownloads.appstore)}" target="_blank" rel="noopener" data-act="ext">Or get Cowdrey One on the App Store</a>` : '';
      how.mac = MAS
        ? { t: 'Mac', s: ['Cowdrey One is in your Applications folder.', 'To keep it in the Dock, Control-click its icon there, then choose Options › Keep in Dock.'] }
        : { t: 'Mac', s: ['Get Cowdrey One on the Mac App Store.', 'Then every app is a click away, on the Mac App Store or the web.'] };
      // The iPhone and iPad app is already here: its steps share it, rather than add a web page to the Home Screen.
      if (NATIVE === 'ios') how.ios.s = ['Tap Share above to send Cowdrey One to a friend, or let them scan the code.', 'It opens Cowdrey One on their iPhone or iPad, with every app one tap away.'];
      how.web = { t: 'Any browser', s: ['Open this page in your browser.', 'Bookmark it, to keep every app one click away.'] };
    }
    // Behind an App Store version's link: no download, and no beta.
    if (NODL) { how.ios.extra = C.hubDownloads.appstore ? `<a class="link-button" href="${esc(C.hubDownloads.appstore)}" target="_blank" rel="noopener">Or get the iPhone app</a>` : ''; how.android.extra = ''; how.mac.extra = ''; }
    const order = [detected.p].concat(SHOWN.filter((p) => p !== detected.p));
    $('#view-share').innerHTML = `
      ${brand()}<header class="large-head"><div><p class="eyebrow">Bradley Cowdrey’s apps</p><h1 class="large-title" id="t-share">${desk ? 'Get on Your Phone' : 'Share'}</h1></div></header>
      <section class="qr-card"><div class="qr">${qrSvg(url)}<img src="icon-192.png" alt=""></div>
        <div><h3>${desk ? 'Point your phone’s camera here' : 'Share every app'}</h3>
          <p>${APPLE_STORE ? (desk ? 'Scan this with your iPhone to open Cowdrey One there. Then each app is one tap away.' : 'Show this code to a friend, or send the link. It opens Cowdrey One, with every app one tap away.')
            : desk ? 'Scan this with your iPhone or Android phone to open Cowdrey One there. Then each app is one tap away, with the right download for that phone.' : 'Show this code to a friend, or send the link. It opens every app with the right download for their phone or computer.'}</p>
          <div class="actions"><button class="button" data-act="share-hub">${icon('share')}Share</button><button class="button quiet" data-act="copy-hub">${icon('link')}Copy Link</button></div>
          <div class="url">${esc(url)}</div></div></section>
      <p class="group-label">Keep Cowdrey One on your devices</p>
      <div class="group">${standalone && !isTauri ? `<div class="how"><h4>${icon('check-circle')}Cowdrey One is installed on ${esc(thisDevice())}</h4><p class="sub" style="color:var(--ink-2);font-size:15px;margin:6px 0 10px">Open it from your ${detected.p === 'mac' ? 'Dock' : 'Home Screen'} any time.</p></div>` : ''}
        ${order.map((p) => `<div class="how"><h4>${icon(PLAT[p].icon)}${how[p].t}${p === detected.p ? `<span class="here-tag">This ${esc(detected.device)}</span>` : ''}</h4>
          <ol class="steps">${how[p].s.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
          ${p === detected.p && installEvent ? `<p><button class="button" data-act="install">${icon('plus-square')}Install Cowdrey One</button></p>` : ''}${how[p].extra ? `<p>${how[p].extra}</p>` : ''}</div>`).join('')}</div>
      ${promise()}`;
  }

  /* ---------- App page ---------- */
  function plain(md) {
    return String(md).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  }
  // GitHub release notes also carry download tables, file links and checksums: What's New keeps the words about the
  // app, and stops at a Downloads or Install section.
  function releaseText(md) {
    const out = [];
    for (const raw of String(md || '').replace(/\r/g, '').split('\n')) {
      const l = raw.trim();
      if (/^#{1,6}\s*(downloads?|install|installation|assets|files|checksums?|sha-?256|verify)/i.test(l)) break;
      if (/^#{1,6}\s*what.?s new\b/i.test(l)) continue;   // the section is already called What's New
      if (APPLE_STORE && OTHER.test(l)) continue;   // a note about the Android app, which the App Store versions leave out
      if ((APPLE_STORE || NODL) && BETA.test(l)) continue;   // nor a beta, there or behind their link (guideline 2.2)
      if (/^\|/.test(l) || /^(sha-?256|sha1|md5)\b/i.test(l) || /^<?https?:\/\/\S+>?$/.test(l) || /^-{3,}$/.test(l) || /^!\[/.test(l)) continue;
      out.push(raw);
    }
    return out.join('\n');
  }
  function mdLite(md) {
    const lines = String(md).replace(/\r/g, '').split('\n');
    let out = '', inList = false;
    const inline = (s) => esc(s).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '$1');
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { if (inList) { out += '</ul>'; inList = false; } continue; }
      const li = l.match(/^[-*•]\s+(.*)/);
      if (li) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${inline(li[1])}</li>`; continue; }
      if (inList) { out += '</ul>'; inList = false; }
      const hd = l.match(/^#{1,6}\s+(.*)/);
      out += hd ? `<p><b>${inline(hd[1])}</b></p>` : `<p>${inline(l)}</p>`;
    }
    return out + (inList ? '</ul>' : '');
  }
  function getRows(a) {
    const rows = [];
    for (const p of SHOWN) {
      const pl = a.platforms[p];
      if (!pl) {
        if (a.soon && a.soon[p]) rows.push(`<div class="row get-row"><span class="glyph">${icon(PLAT[p].icon)}</span><span class="main"><span class="title">${PLAT[p].name}</span><span class="sub">${esc(a.soon[p])}</span></span></div>`);
        continue;
      }
      options(a, p).forEach((o, i) => {
        const here = p === plat() && i === 0;
        // Open only where Cowdrey One has seen the app on this device, got this way. On Android, a copy from Google
        // Play and one from an APK are the same app.
        const k = mine(a) && mine(a).k;
        const seenHere = p === plat() && !!k && (k === o.kind || (k === 'play' && o.kind === 'apk') || (k === 'apk' && o.kind === 'play'));
        const btn = seenHere
          ? `<button class="pill" data-act="launch" data-id="${a.id}" aria-label="Open ${esc(a.name)}, on ${esc(thisDevice())}">Open</button>`
          : `<a class="pill${here ? ' solid' : ''}" data-act="get-opt" data-id="${a.id}" data-p="${p}" data-i="${i}" href="${esc(o.url)}"${linkTarget(o)}>${MAS && o.kind === 'web' ? 'Open on the web' : KIND[o.kind].btn}</a>`;
        rows.push(`<div class="row get-row${here ? ' here' : ''}"><span class="glyph">${icon(o.kind === 'testflight' ? 'flask' : PLAT[p].icon)}</span>
          <span class="main"><span class="title">${o.kind === 'testflight' ? PLAT[p].name + ' beta' : PLAT[p].name}${here ? `<span class="here-tag">${prefs.platform === 'auto' && detected.p !== 'web' ? 'This ' + esc(detected.device) : 'For you'}</span>` : ''}</span>
          <span class="sub">${esc(KIND[o.kind].how)} · ${esc(pl.req)}</span></span>${btn}</div>`);
      });
    }
    return rows.join('');
  }
  function whatsNew(a) {
    const r = releases[a.id];
    const v = latest(a);
    const head = `<div class="section-head"><h2>What’s New</h2><span class="note">Version ${esc(v)}${r && r.date ? ' · ' + fmtDay(r.date) : ''}</span></div>`;
    const text = r && r.notes ? releaseText(r.notes) : '';
    const log = a.changelog || (a.repo ? `https://github.com/${a.repo}/blob/main/CHANGELOG.md` : '');
    // The App Store versions (and their link) point at the app's changelog, not its GitHub release, which lists the
    // .dmg and APK files (guidelines 2.4.5, 2.3.10). Elsewhere, the release, as before.
    const notesLink = APPLE_STORE || NODL
      ? (log ? `<p style="margin:8px 0 0"><a href="${esc(log)}" target="_blank" rel="noopener" data-act="ext">Every change, on GitHub</a></p>` : '')
      : `<p style="margin:8px 0 0"><a href="${esc((r && r.url) || `https://github.com/${a.repo}/releases`)}" target="_blank" rel="noopener" data-act="ext">Release notes on GitHub</a></p>`;
    if (plain(text)) {
      return `${head}<div class="notes" id="notes">${mdLite(text.slice(0, 1600))}</div>
        ${notesLink}`;
    }
    return `${head}<p class="notes">${log ? `See every change <a href="${esc(log)}" target="_blank" rel="noopener" data-act="ext">on GitHub</a>.` : ''}</p>`;
  }
  function appPage(a) {
    const plats = SHOWN.filter((p) => offered(a, p));
    // The top of the page: the app's App Store screenshots in a row you swipe, as on the App Store; or, for an app
    // that isn't there, the drawn glimpse.
    const top = a.shots
      ? `<div class="shots" role="list" aria-label="${esc(a.name)} screenshots">${Array.from({ length: a.shots }, (_, k) =>
          `<img role="listitem" src="${shotUrl(a, k + 1)}" alt="${esc(a.name)}, screenshot ${k + 1} of ${a.shots}" ${k > 1 ? 'loading="lazy" ' : ''}decoding="async">`).join('')}</div>`
      : `<div class="art">${art(a)}</div>`;
    return `<div class="hero${a.shots ? ' has-shots' : ''}" style="${sky(a)}">${top}
        <div class="hero-id">${appIcon(a)}<div><h2 id="sheet-title">${esc(a.name)}</h2><p>${esc(a.subtitle)}</p>
          <div class="hero-actions">${pill(a, 'light', true)}<button class="round" data-act="share-app" data-id="${a.id}" aria-label="Share ${esc(a.name)}">${icon('share')}</button></div></div></div></div>
      <div class="sheet-pad">
        <div class="facts">
          <div class="fact"><div class="k">Version</div><div class="v">${esc(latest(a))}</div><div class="c">${statusOf(a) ? esc(statusOf(a)) : 'Latest'}</div></div>
          <div class="fact"><div class="k">Price</div><div class="v">Free</div><div class="c">Forever</div></div>
          <div class="fact"><div class="k">Platforms</div><div class="v">${plats.length}</div><div class="c">${plats.filter((p) => SHOWN.includes(p)).map((p) => ({ ios: 'iOS', android: 'Android', mac: 'Mac', web: 'Web' })[p]).join(' · ')}</div></div>
          <div class="fact"><div class="k">Category</div><div class="v">${icon({ Weather: 'cloud', Navigation: 'compass', Productivity: 'clock', Writing: 'doc', Documents: 'doc' }[a.category] || 'stack')}</div><div class="c">${esc(a.category)}</div></div>
          <div class="fact"><div class="k">Privacy</div><div class="v">${icon('lock')}</div><div class="c">No tracking</div></div>
          <div class="fact"><div class="k">Developer</div><div class="v">${icon('person')}</div><div class="c">Bradley Cowdrey</div></div>
        </div>
        <div id="whats-new">${whatsNew(a)}</div>
        <div class="section-head"><h2>About</h2></div>
        <p class="prose">${esc(apple(a.about))}</p>
        <ul class="bullets">${a.features.map((f) => `<li>${esc(apple(f))}</li>`).join('')}</ul>
        <div class="section-head"><h2>Get It On</h2></div>
        <div class="group" id="get-rows">${getRows(a)}</div>
        <p class="group-foot">${offered(a, plat()) ? '' : (APPLE_STORE || NODL) && plat() === 'mac' && a.platforms.mac ? `${esc(a.name)} isn’t on the Mac App Store yet. Open it on the web, in any browser.`
          : NODL && a.platforms[plat()] ? `Here, ${esc(a.name)} opens on the web, in any browser.`
          : `${esc(a.name)} isn’t made for ${esc(PLAT[plat()].name)} yet. The web version works in any browser.`}</p>
        <div class="section-head"><h2>Information</h2></div>
        <div class="group">
          <div class="row info"><span class="k">Developer</span><span class="v">Bradley Cowdrey</span></div>
          <div class="row info"><span class="k">Category</span><span class="v">${esc(a.category)}</span></div>
          <div class="row info"><span class="k">Price</span><span class="v">Free</span></div>
          <div class="row info"><span class="k">Privacy</span><span class="v">No ads, no account, no tracking</span></div>
          ${a.page ? `<a class="row info tap" href="${esc(a.page)}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Product page</span><span class="v"></span>${icon('chevron', 'chev')}</a>` : ''}
          ${a.repo ? `<a class="row info tap" href="https://github.com/${esc(a.repo)}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Source code</span><span class="v" style="color:var(--ink-2)">GitHub</span>${icon('chevron', 'chev')}</a>
          <a class="row info tap" href="https://github.com/${esc(a.repo)}/issues" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Report an issue</span><span class="v"></span>${icon('chevron', 'chev')}</a>` : ''}
          <a class="row info tap" href="${C.termsUrl}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Terms of Use and Privacy</span><span class="v"></span>${icon('chevron', 'chev')}</a>
        </div>
      </div>`;
  }
  let pageApp = null;
  function openApp(id) {
    const a = byId[id];
    if (!a) return;
    pageApp = a;
    openSheet(appPage(a), { onSky: true });
    // Fresh release notes for this app, if the ones on hand are more than an hour old.
    const r = releases[a.id];
    if (a.repo && (!r || !r.at || Date.now() - r.at > 3600e3)) fetchRelease(a).then((x) => { if (x) { releases[a.id] = x; store.set('releases', releases); refresh(); } }).catch(() => {});
  }

  /* ---------- Get every app ---------- */
  function setupPage() {
    const p = plat(), c = tally(), plan = bulkPlan();
    const bulkTip = plan.kind === 'store' ? 'Each app’s Mac App Store page opens in turn: click Get there, then come back here for the next.'
      : plan.kind === 'native' ? {
      mac: 'Cowdrey One downloads each app, checks it’s signed by Bradley Cowdrey, and puts it in Applications.',
      android: 'Android asks “Install?” once for each app. On Android 12 and later, apps installed here update without asking.',
      ios: 'Each app’s App Store page opens here in turn: tap Get, then Done for the next.',
    }[NATIVE] : p === 'mac'
      ? 'Your browser may ask to allow several downloads. Then open each .dmg in Downloads and drag the app into Applications.'
      : 'Your browser may ask to allow several downloads. Then open each APK from Downloads and tap Install.';
    const bulk = plan.list.length || bulkRunning ? `<p style="margin:16px 0 0"><button class="button wide" data-act="bulk"${bulkRunning ? ' disabled' : ''}>${plan.kind === 'store' ? '' : icon('down')}${bulkRunning ? esc(bulkRunning) : esc(bulkLabel(plan))}</button></p>
        <p class="group-foot">${esc(bulkTip)}</p>` : '';
    const tip = {
      ios: NATIVE === 'ios' ? 'Tap Get All, or Get on any app.' : 'Each one opens the App Store: tap Get there, then come back here for the next.',
      android: NODL ? 'Each one opens in a new tab. To keep one, add it to your Home screen.' : PLAY ? 'Each one opens its Google Play page: tap Install there, then come back here for the next.'
        : NATIVE === 'android' ? 'Tap Install All, or Get on any app.' : 'Each one downloads an APK. The first time, Android asks you to allow your browser to install apps: allow it, then tap Install for each.',
      mac: MAS ? 'Get opens an app’s page on the Mac App Store.' : NODL ? 'Get opens an app’s page on the Mac App Store, or its web version.' : NATIVE === 'mac' ? 'Tap Install All, or Get on any app.' : 'Each one downloads a .dmg to Downloads. Open it and drag the app into Applications.',
      web: 'Each one opens in a new tab. On a phone, add each to your Home Screen.',
    }[p];
    return `<h2 class="sheet-title" id="sheet-title">Get Every App</h2><p class="sheet-lead">For ${esc(thisDevice())}. ${esc(tip)}</p>
      <div class="sheet-pad">
        ${c ? `<div class="reading" style="margin-top:18px"><span class="big" style="font-size:48px">${c.n}</span><span class="of" style="font-size:20px">of ${c.total} installed</span></div>` : ''}
        ${bulk}
        <div class="group" id="setup-rows" style="margin-top:18px">${APPS.map((a) => appRow(a, { plats: false })).join('')}</div>
        <p class="group-foot">${(MAS || NODL) && p === 'mac' ? 'Apps that aren’t on the Mac App Store yet open on the web instead.' : `Not on ${esc(PLAT[p].name)}? Apps without ${/^[aeiou]/i.test(PLAT[p].name) ? 'an' : 'a'} ${esc(PLAT[p].name)} version open on the web instead.`}</p>
        <p style="margin-top:22px"><button class="button wide" data-act="close">Done</button></p></div>`;
  }

  function allowPage() {
    return `<div class="welcome" style="padding-top:44px"><img src="icon-192.png" alt=""><h2 id="sheet-title">Allow Cowdrey One to install apps</h2>
        <p style="color:var(--ink-2);margin:-8px 0 20px">Android asks this once. Tap Open Settings, turn on <b>Allow from this source</b>, then come back and tap Install again.</p>
        <button class="button wide" data-act="allow-settings">Open Settings</button>
        <p style="margin:14px 0 18px"><button class="link-button" data-act="close">Not Now</button></p></div>`;
  }

  /* ---------- About and first launch ---------- */
  function aboutPage() {
    return `<div class="welcome" style="padding-top:44px"><img src="bradley.jpg" alt="" style="border-radius:50%;width:84px;height:84px">
        <h2 id="sheet-title" style="margin-bottom:8px">Bradley Cowdrey</h2><p style="color:var(--ink-2);margin:0 0 4px">Founder. Operator. Always learning.</p>
        <p style="color:var(--ink-2);margin:0 0 22px;font-size:15px">${apple('Small, free, open-source apps for iPhone, iPad, Android, Mac and the web.')}</p></div>
      <div class="sheet-pad"><div class="group">
        <a class="row info tap" href="${C.developer.url}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">bradcowdrey.com</span><span class="v"></span>${icon('chevron', 'chev')}</a>
        ${APPLE_STORE ? '' : `<a class="row info tap" href="${C.developer.github}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Every app on GitHub</span><span class="v"></span>${icon('chevron', 'chev')}</a>`}
        ${C.hubRepo ? `<a class="row info tap" href="https://github.com/${esc(C.hubRepo)}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Cowdrey One’s code</span><span class="v" style="color:var(--ink-2)">MIT License</span>${icon('chevron', 'chev')}</a>` : ''}
        <a class="row info tap" href="${C.termsUrl}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Terms of Use and Privacy</span><span class="v"></span>${icon('chevron', 'chev')}</a></div>
      <p class="group-label">Cowdrey One</p><div class="group">
        <div class="row info"><span class="k">Version</span><span class="v">${VERSION}</span></div>
        <div class="row info"><span class="k">Apps</span><span class="v">${APPS.length}</span></div>
        <div class="row info"><span class="k">Made by</span><span class="v">© ${new Date().getFullYear()} Bradley Cowdrey</span></div></div>
      ${promise()}</div>`;
  }
  function welcomePage() {
    return `<div class="welcome"><img src="icon-192.png" alt=""><h2 id="sheet-title">Welcome to Cowdrey One</h2>
        <div class="feat">${icon('stack')}<div><b>Every app in one place</b><span>Bradley Cowdrey’s free apps, each with the right download for ${esc(thisDevice())}.</span></div></div>
        <div class="feat">${icon('refresh')}<div><b>New versions at a glance</b><span>Each app’s page shows its newest version and what’s new in it.</span></div></div>
        <div class="feat">${icon('lock')}<div><b>Private by design</b><span>No ads, no account, no tracking. Your list stays on this device.</span></div></div>
        <p class="fine">By continuing, you agree to the <a href="${C.termsUrl}" target="_blank" rel="noopener" data-act="ext">Terms of Use and Privacy</a>.</p>
        <button class="button wide" data-act="agree">Continue</button>
        <p style="margin:14px 0 0"><a class="link-button" href="${C.termsUrl}" target="_blank" rel="noopener" data-act="ext">Read the Terms</a></p></div>`;
  }

  /* ---------- Sheets ---------- */
  // Back closes a sheet (Android's Back button, a browser's Back). Some embedded views refuse history changes: then
  // sheets still open and close, just without Back.
  const hist = (fn) => { try { fn(); return true; } catch (e) { return false; } };
  const host = $('.sheet-host'), scrim = $('.scrim');
  let sheet = null, sheetKind = null, ignorePop = false, lastFocus = null;
  function openSheet(html, { onSky = false, short = false, kind = 'app', locked = false } = {}) {
    const replacing = !!sheet;
    if (sheet) sheet.remove();
    else lastFocus = document.activeElement;
    const s = document.createElement('div');
    s.className = 'sheet' + (short ? ' short' : '');
    s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-labelledby', 'sheet-title'); s.tabIndex = -1;
    s.innerHTML = `<div class="grabber"></div>${locked ? '' : `<button class="sheet-close${onSky ? ' on-sky' : ''}" data-act="close" aria-label="Close">${icon('x')}</button>`}<div class="sheet-scroll">${html}</div>`;
    host.appendChild(s);
    sheet = s; sheetKind = kind; s.dataset.locked = locked ? '1' : '';
    scrim.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('on'); s.classList.add('on'); }));
    s.focus({ preventScroll: true });
    if (replacing) hist(() => history.replaceState({ sheet: 1 }, ''));
    else hist(() => history.pushState({ sheet: 1 }, ''));
    drag(s);
  }
  function closeSheet(fromPop) {
    if (!sheet || (sheet.dataset.locked && !fromPop)) return;
    const s = sheet; sheet = null; sheetKind = null; pageApp = null;
    s.classList.remove('on'); scrim.classList.remove('on');
    setTimeout(() => { s.remove(); if (!sheet) scrim.hidden = true; }, 420);
    document.documentElement.style.overflow = '';
    if (!fromPop && history.state && history.state.sheet) { ignorePop = true; if (!hist(() => history.back())) ignorePop = false; }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    if (sheet && sheet.dataset.locked) { hist(() => history.pushState({ sheet: 1 }, '')); return; }
    if (sheet) closeSheet(true);
  });
  scrim.addEventListener('click', () => closeSheet());
  document.addEventListener('keydown', (e) => {
    if (!sheet) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    if (e.key === 'Tab') {
      const f = $$('a[href],button:not([disabled]),select,[tabindex="0"]', sheet).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // Pull a sheet down to close it, on phones.
  function drag(s) {
    const sc = $('.sheet-scroll', s);
    let y0 = null, dy = 0, t0 = 0;
    s.addEventListener('touchstart', (e) => {
      if (innerWidth >= 900 || s.dataset.locked || sc.scrollTop > 0 || e.target.closest('.carousel,.facts,.shots')) return;
      y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    }, { passive: true });
    s.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) { dy = 0; s.classList.remove('dragging'); s.style.transform = ''; return; }
      if (sc.scrollTop > 0) { y0 = null; return; }
      e.preventDefault();
      s.classList.add('dragging'); s.style.transform = `translateY(${dy}px)`;
    }, { passive: false });
    s.addEventListener('touchend', () => {
      if (y0 == null) return;
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      s.classList.remove('dragging'); s.style.transform = '';
      if (dy > 140 || (fast && dy > 40)) closeSheet();
      y0 = null;
    });
  }

  /* ---------- Toast ---------- */
  const toastEl = $('.toast');
  let toastTimer = null;
  function toast(msg, action) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
    if (action) $('button', toastEl).onclick = () => { hideToast(); action.run(); };
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('on'));
    toastTimer = setTimeout(hideToast, action ? 6000 : 4000);
  }
  function hideToast() { toastEl.classList.remove('on'); setTimeout(() => { if (!toastEl.classList.contains('on')) toastEl.hidden = true; }, 300); }

  /* ---------- Updates from GitHub ---------- */
  async function fetchRelease(a) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 9000) : null;
    try {
      const r = await fetch(`https://api.github.com/repos/${a.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' });
      if (r.status === 404) return { v: null, at: Date.now() };          // no releases yet: the catalog's version stands
      if (!r.ok) throw new Error('GitHub ' + r.status);
      const d = await r.json();
      return { v: verOf(d.tag_name) || verOf(d.name), date: d.published_at, notes: String(d.body || '').slice(0, 4000), url: d.html_url, at: Date.now() };
    } finally { if (timer) clearTimeout(timer); }
  }
  async function checkUpdates(quiet) {
    if (checking) return;
    checking = true; checkFailed = false; refresh();
    const list = APPS.filter((a) => a.repo);
    const res = await Promise.allSettled(list.map((a) => fetchRelease(a)));
    let ok = 0;
    res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value) { ok++; releases[list[i].id] = r.value; } });
    checking = false;
    if (ok) { checkedAt = Date.now(); store.set('checkedAt', checkedAt); store.set('releases', releases); }
    else checkFailed = true;
    refresh();
    // The App Store versions leave updates to the App Store, and never say whether apps are up to date (2.4.5).
    if (!quiet && !APPLE_STORE) {
      const u = updates().length;
      toast(checkFailed ? 'Couldn’t check for updates. Are you online?' : u ? `${u} ${u === 1 ? 'update' : 'updates'} available.` : 'Every app is up to date.');
    }
  }

  /* ---------- Tabs, theme, refresh ---------- */
  let tab = 'discover';
  const titles = { discover: 'Discover', library: 'Library', share: 'Share' };
  function showTab(t) {
    if (!titles[t]) t = 'discover';
    tab = t;
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + t; });
    $$('.tab, .side-item').forEach((b) => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('.navbar-title').textContent = t === 'share' && !isPhone() ? 'Get on Your Phone' : titles[t];
    hist(() => history.replaceState(history.state, '', t === 'discover' ? location.pathname + location.search : '#' + t));
    window.scrollTo(0, 0);
    watchTitle();
  }
  let io = null;
  function watchTitle() {
    if (!('IntersectionObserver' in window)) return;
    if (io) io.disconnect();
    const title = $(`#view-${tab} .large-title`);
    if (!title) return;
    io = new IntersectionObserver(([e]) => $('.navbar').classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-50px 0px 0px 0px' });
    io.observe(title);
  }
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const dark = prefs.appearance === 'dark' || (prefs.appearance === 'auto' && darkQuery.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $$('meta[name="theme-color"]').forEach((m) => { m.removeAttribute('media'); m.content = dark ? '#121110' : '#F5F2EC'; });
  }
  darkQuery.addEventListener && darkQuery.addEventListener('change', applyTheme);

  function renderSidebar() {
    $('.side-apps').innerHTML = APPS.map((a) => `<button class="side-app" data-act="open-app" data-id="${a.id}">${appIcon(a)}<span>${esc(a.name)}</span>${state(a).s === 'update' ? '<i class="dot" aria-label="Update available"></i>' : ''}</button>`).join('');
  }
  function refresh() {
    // Discover keeps its scroll positions: only its buttons and the set-up card are redrawn.
    $$('#view-discover [data-pill]').forEach((el) => { el.outerHTML = pill(byId[el.dataset.pill], el.classList.contains('light') ? 'light' : ''); });
    $$('#all-apps .pill-wrap').forEach((el) => { const id = el.closest('[data-id]').dataset.id; el.outerHTML = pillWrap(byId[id]); });
    const sc = $('#setup-slot'); if (sc) sc.innerHTML = setupCard();
    const fn = $('#for-note'); if (fn) fn.textContent = 'For ' + thisDevice();
    const bs = $('#banner-slot'); if (bs) bs.innerHTML = installBanner();
    renderLibrary(); renderShare(); renderSidebar();
    const u = updates().length;
    $$('.badge').forEach((b) => { b.hidden = !u; b.textContent = u; });
    if (sheet && sheetKind === 'app' && pageApp) {
      $$('[data-pill]', sheet).forEach((el) => { el.outerHTML = pill(pageApp, 'light', !!el.dataset.long); });
      const gr = $('#get-rows', sheet); if (gr) gr.innerHTML = getRows(pageApp);
      const wn = $('#whats-new', sheet); if (wn) wn.innerHTML = whatsNew(pageApp);
    }
    if (sheet && sheetKind === 'setup') { const sc2 = $('.sheet-scroll', sheet); const top = sc2.scrollTop; sc2.innerHTML = setupPage(); sc2.scrollTop = top; }
  }

  /* ---------- Sharing ---------- */
  async function share(title, text, url) {
    if (navigator.share && !isTauri) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copy(url);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) { /* nothing more to try */ } t.remove();
    }
    toast('Link copied.');
  }

  /* ---------- One click handler for the whole app ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = byId[t.dataset.id];
    switch (t.dataset.act) {
      case 'get': get(a, t, null, e); break;
      case 'get-opt': { const p = t.dataset.p, o = Object.assign({ p }, options(a, p)[+t.dataset.i]); get(a, t, o, e); break; }
      case 'open-app': e.preventDefault(); openApp(t.dataset.id); break;
      case 'tab': closeSheet(); showTab(t.dataset.tab); break;
      case 'slide': { const car = $('.carousel'); car.scrollTo({ left: +t.dataset.i * (car.firstElementChild.offsetWidth + 14), behavior: 'smooth' }); break; }
      case 'setup': openSheet(setupPage(), { kind: 'setup' }); break;
      case 'about': openSheet(aboutPage(), { kind: 'about' }); break;
      case 'close': closeSheet(); break;
      case 'agree': store.set('terms', { v: C.termsVersion, at: Date.now() }); sheet && (sheet.dataset.locked = ''); closeSheet(); break;
      case 'update-all': if (NATIVE && plat() === NATIVE) runNative(updates(), 'Updating'); else updates().forEach((x) => get(x, null, best(x))); break;
      case 'bulk': runBulk(); break;
      case 'launch':
        if (NATIVE === 'mac') tauri('open_app', { bundleId: a.bundle }).catch((x) => toast(String(x)));
        else if (NATIVE === 'android') nativeCall('openApp', { packageName: a.bundle }).catch((x) => toast(String(x)));
        else if (NATIVE === 'ios') nativeCall('openApp', { scheme: a.scheme }).catch((x) => toast(String(x)));
        break;
      case 'allow-settings': nativeCall('openInstallSettings').catch(() => {}); closeSheet(); break;
      case 'check': checkUpdates(false); break;
      case 'appearance': prefs.appearance = t.dataset.v; savePrefs(); applyTheme(); renderLibrary(); break;
      case 'share-hub': share('Cowdrey One', apple('Every free app by Bradley Cowdrey, for iPhone, Android, Mac and the web.'), hubLink()); break;
      case 'copy-hub': copy(hubLink()); break;
      case 'share-app': share(a.name, `${a.name}: ${a.subtitle}. Free, by Bradley Cowdrey.`, hubLink(a.id)); break;
      case 'install': if (installEvent) { installEvent.prompt(); installEvent.userChoice.finally(() => { installEvent = null; refresh(); }); } break;
      case 'dismiss-banner': store.set('bannerDismissed', true); refresh(); break;
      case 'ext': if (isTauri) { e.preventDefault(); openUrl(t.href); } break;
      default: break;
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.act === 'platform') {
      prefs.platform = e.target.value; savePrefs();
      renderDiscover(); refresh();
      toast(`Showing downloads for ${prefs.platform === 'auto' ? detected.device : PLAT[prefs.platform].name}.`);
    }
  });
  // Rows are whole tap targets on touch screens; Enter and Space work on them too.
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('feature')) { e.preventDefault(); openApp(e.target.dataset.id); }
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; refresh(); });
  window.addEventListener('appinstalled', () => { installEvent = null; toast('Cowdrey One is installed.'); refresh(); });

  /* ---------- Start ---------- */
  applyTheme();
  renderDiscover();
  refresh();
  const startTab = (location.hash || '').slice(1);
  showTab(titles[startTab] ? startTab : 'discover');
  setInterval(tickClocks, 15000);
  // Opening Cowdrey One, or switching back to it, starts at the top of the screen (and of an open page), as a fresh
  // look at the apps. Phones resume an app where it was left, so this runs on every return, in the app and when it's
  // installed to the Home Screen; in a browser tab the page stays where it was. Never in the middle of an install.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function toTop() {
    if (bulkRunning || Object.keys(busy).length) return;
    window.scrollTo(0, 0);
    const sc = sheet && $('.sheet-scroll', sheet);
    if (sc) sc.scrollTop = 0;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    tickClocks(); syncInstalled();
    if (standalone) toTop();
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) toTop(); });
  syncInstalled();
  if (NATIVE === 'mac' && !MAS && window.__TAURI__.event) {
    window.__TAURI__.event.listen('install-progress', (ev) => {
      const p = ev.payload || {};
      if (busy[p.id] && p.stage !== 'done') { busy[p.id] = p.stage; refresh(); }
    });
  }

  const params = new URLSearchParams(location.search);
  const terms = store.get('terms', null);
  if (!terms || terms.v !== C.termsVersion) openSheet(welcomePage(), { kind: 'welcome', short: true, locked: true });
  else if (params.get('app') && byId[params.get('app')]) openApp(params.get('app'));

  // Check for new versions at most every 6 hours, quietly.
  if (Date.now() - checkedAt > 6 * 3600e3 && navigator.onLine !== false) setTimeout(() => checkUpdates(true), 1200);
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !isTauri) {
    try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not allowed here: it still works online */ }
  }

  // For the tests and for anyone curious in the console.
  window.CowdreyOne = { VERSION, state: (id) => state(byId[id]), platform: plat, native: NATIVE, checkUpdates };
})();
