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
  let installed = store.get('installed', {});            // "ios:bearings" → { v: '2.3.1', k: 'appstore', t: 1795… }
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

  /* ---------- Ways to get an app ---------- */
  const KIND = {
    appstore: { how: 'App Store', btn: 'Get', toast: (n) => `Opening ${n} on the App Store.` },
    testflight: { how: 'Beta on TestFlight', btn: 'Join', toast: (n) => `Opening the ${n} beta. TestFlight asks you to install it first if you don’t have it.` },
    macappstore: { how: 'Mac App Store', btn: 'Get', toast: (n) => `Opening ${n} on the Mac App Store.` },
    dmg: { how: 'Download (.dmg)', btn: 'Get', toast: (n) => `Downloading ${n}. Open the .dmg in Downloads and drag ${n} into Applications.` },
    apk: { how: 'Download (APK)', btn: 'Get', toast: (n) => `Downloading ${n}. Open it from Downloads and tap Install.` },
    web: { how: 'In your browser', btn: 'Open', toast: (n) => `Opening ${n}.` },
  };
  const options = (a, p) => (a.platforms[p] && a.platforms[p].get) || [];
  function best(a, p = plat()) {
    const o = options(a, p)[0];
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

  function state(a) {
    const o = best(a);
    if (!o) return { s: 'none' };
    const inst = mine(a);
    if (o.kind === 'web') return { s: 'open', o, inst };
    if (inst && inst.k !== 'web') {
      // The App Stores and TestFlight update their apps themselves; downloads (.dmg, APK) are shown here.
      if ((inst.k === 'apk' || inst.k === 'dmg') && cmpV(latest(a), inst.v) > 0) return { s: 'update', o, inst };
      return { s: 'done', o, inst };
    }
    return { s: 'get', o, inst };
  }
  const updates = () => APPS.filter((a) => state(a).s === 'update');
  const gotCount = () => APPS.filter((a) => mine(a)).length;

  /* ---------- Buttons ---------- */
  function pill(a, variant = '') {
    const st = state(a);
    if (st.s === 'none') return '';
    const n = esc(a.name);
    if (st.s === 'done') {
      return `<button class="pill done ${variant}" data-pill="${a.id}" data-act="open-app" data-id="${a.id}" aria-label="${n} is on ${esc(thisDevice())}. Details">${icon('check-circle')}</button>`;
    }
    const label = st.s === 'update' ? 'Update' : KIND[st.o.kind].btn;
    const cls = st.s === 'update' ? 'solid' : '';
    return `<a class="pill ${cls} ${variant}" data-pill="${a.id}" data-act="get" data-id="${a.id}" href="${esc(st.o.url)}"${linkTarget(st.o)} aria-label="${label} ${n}${st.o.fallback ? ', in your browser' : ''}">${label}</a>`;
  }
  const pillWrap = (a, variant = '') => {
    const st = state(a);
    const note = st.o && st.o.fallback ? 'Web app' : st.s === 'update' ? 'v' + esc(latest(a)) : '';
    return `<span class="pill-wrap">${pill(a, variant)}${note ? `<small>${note}</small>` : ''}</span>`;
  };
  // Downloads load in place (the page stays); stores and web apps open beside this one.
  const linkTarget = (o) => (o.kind === 'apk' || o.kind === 'dmg' ? '' : ' target="_blank" rel="noopener"');

  function openUrl(url, kind) {
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
    const byLink = e && el && el.tagName === 'A' && !isTauri;   // the link itself opens the store, download or web app
    if (!byLink) { if (e) e.preventDefault(); openUrl(o.url, o.kind); }
    const p = o.fallback ? plat() : o.p;
    const k = key(p, a.id);
    const before = installed[k];
    installed[k] = { v: latest(a), k: o.kind, t: Date.now() };
    store.set('installed', installed);
    if (el && el.classList.contains('pill')) {
      el.classList.add('busy');
      setTimeout(refresh, 900);
    } else refresh();
    let msg = KIND[o.kind].toast(a.name);
    if (o.kind === 'web' && (detected.p === 'ios' || detected.p === 'android') && p !== 'web') {
      msg = `Opening ${a.name}. To keep it, add it to your Home Screen from the browser’s ${detected.p === 'ios' ? 'Share' : '⋮'} menu.`;
    }
    toast(msg, o.kind === 'web' ? null : { label: 'Undo', run: () => { if (before) installed[k] = before; else delete installed[k]; store.set('installed', installed); refresh(); } });
  }
  function forget(a, p = plat()) {
    const k = key(p, a.id); const before = installed[k];
    delete installed[k]; store.set('installed', installed); refresh();
    toast(`${a.name} removed from your Library.`, { label: 'Undo', run: () => { installed[k] = before; store.set('installed', installed); refresh(); } });
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
  const dateLine = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const platIcons = (a) => `<span class="plats" aria-label="On ${ORDER.filter((p) => a.platforms[p]).map((p) => PLAT[p].name).join(', ')}">${ORDER.filter((p) => a.platforms[p]).map((p) => icon(PLAT[p].icon, p === plat() ? 'here' : '')).join('')}</span>`;
  const tag = (a) => (a.status ? `<span class="status-tag">${esc(a.status)}</span>` : '');

  function appRow(a, opts = {}) {
    const sub = opts.sub != null ? opts.sub : esc(a.subtitle);
    return `<div class="row app tap" data-act="open-app" data-id="${a.id}">
      ${opts.edit ? `<button class="del" data-act="forget" data-id="${a.id}" aria-label="Remove ${esc(a.name)} from your Library">${icon('minus')}</button>` : ''}
      ${appIcon(a)}
      <button class="main" data-act="open-app" data-id="${a.id}"><span class="title">${esc(a.name)}${tag(a)}</span><span class="sub clamp">${sub}</span>${opts.plats === false ? '' : platIcons(a)}</button>
      ${opts.edit ? '' : pillWrap(a)}</div>`;
  }

  function featureCard(a, i) {
    return `<div class="feature" style="${sky(a)}" data-act="open-app" data-id="${a.id}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${APPS.length}: ${esc(a.name)}">
      <div class="feature-top"><p class="eyebrow">${esc(a.status || a.category)}</p><h3>${esc(a.headline)}</h3></div>
      <div class="art">${art(a)}</div>
      <div class="feature-bar">${appIcon(a)}<button class="meta" data-act="open-app" data-id="${a.id}"><b>${esc(a.name)}</b><small>${esc(a.subtitle)}</small></button>${pill(a, 'light')}</div></div>`;
  }

  function setupCard() {
    const n = gotCount(), total = APPS.length, r = 27, len = 2 * Math.PI * r;
    const left = total - n;
    return `<div class="ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle class="track" cx="32" cy="32" r="${r}"/><circle class="bar" cx="32" cy="32" r="${r}" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${(len * (1 - n / total)).toFixed(1)}"/></svg><b>${n}/${total}</b></div>
      <div class="main"><h3>${left ? `Get every app on ${esc(thisDevice())}` : `Every app is on ${esc(thisDevice())}`}</h3><p>${left ? `${left} free ${left === 1 ? 'app' : 'apps'} to go, one tap each.` : 'New versions show up in your Library.'}</p></div>
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
      <header class="large-head"><div><p class="eyebrow">${esc(dateLine())}</p><h1 class="large-title" id="t-discover">Discover</h1></div></header>
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
  let editing = false, checking = false, checkFailed = false;
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
    const got = APPS.filter((a) => mine(a)), notYet = APPS.filter((a) => !mine(a)), ups = updates();
    const viaLine = (a) => {
      const i = mine(a), k = KIND[i.k];
      return i.k === 'web' ? `Opened ${fmtDay(i.t)} · web app` : `Version ${esc(i.v)} · ${esc(k.how)} · ${fmtDay(i.t)}`;
    };
    const platSelect = `<select data-act="platform" aria-label="Show downloads for">${[['auto', `Automatic (${detected.device})`]].concat(ORDER.map((p) => [p, PLAT[p].name])).map(([v, t]) => `<option value="${v}"${prefs.platform === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    $('#view-library').innerHTML = `
      <header class="large-head"><div><p class="eyebrow">On ${esc(thisDevice())}</p><h1 class="large-title" id="t-library">Library</h1></div>
        ${got.length ? `<button class="head-button" data-act="edit">${editing ? 'Done' : 'Edit'}</button>` : ''}</header>
      <div class="reading"><span class="big">${got.length}</span><span class="of">of ${APPS.length} apps</span></div>
      <p class="reading-sub">${ups.length ? `${ups.length} ${ups.length === 1 ? 'update' : 'updates'} available` : got.length ? 'Up to date' : 'Nothing here yet'} · ${checkedLine()}</p>
      ${ups.length ? `<div class="section-head"><h2>Updates</h2>${ups.length > 1 ? '<button data-act="update-all">Update All</button>' : ''}</div>
        <div class="group">${ups.map((a) => {
          const r = releases[a.id];
          return appRow(a, { sub: `Version ${esc(mine(a).v)} → ${esc(latest(a))}${r && r.notes ? ' · ' + esc(plain(r.notes).slice(0, 140)) : ''}`, clamp: true, plats: false });
        }).join('')}</div>` : ''}
      ${got.length ? `<div class="section-head"><h2>On ${esc(capital(thisDevice()))}</h2></div>
        <div class="group">${got.map((a) => appRow(a, { sub: viaLine(a), plats: false, edit: editing })).join('')}</div>`
        : `<div class="empty"><div class="stack">${APPS.slice(0, 3).map((a) => appIcon(a)).join('')}</div><h3>Your apps will show up here</h3>
          <p>Get an app and it’s kept here, with a note when a new version is out.</p><button class="button" data-act="setup">${icon('down')}Get Every App</button></div>`}
      ${got.length && notYet.length ? `<div class="section-head"><h2>Not Yet on ${esc(deviceName())}</h2></div><div class="group">${notYet.map((a) => appRow(a)).join('')}</div>` : ''}
      <p class="group-label">Settings</p>
      <div class="group">
        <div class="row pref"><span class="glyph">${icon('device')}</span><span class="main"><span class="title" style="font-weight:400">Show downloads for</span></span><span class="value">${esc(prefs.platform === 'auto' ? 'Automatic' : PLAT[prefs.platform].name)}</span>${icon('chevron', 'chev')}${platSelect}</div>
        <div class="row pref"><span class="glyph" style="background:#5B5FC7">${icon('moon')}</span><span class="main"><span class="title" style="font-weight:400">Appearance</span></span>
          <span class="segmented" role="group" aria-label="Appearance">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, t]) => `<button data-act="appearance" data-v="${v}" aria-pressed="${prefs.appearance === v}">${t}</button>`).join('')}</span></div>
        <div class="row pref"><span class="glyph" style="background:#2E8B57">${icon('refresh')}</span><span class="main"><span class="title" style="font-weight:400">Updates</span><span class="sub">${checkedLine()}</span></span><button class="pill" data-act="check" ${checking ? 'disabled' : ''}>Check</button></div>
        <button class="row pref tap" data-act="about"><span class="glyph" style="background:#6B6760">${icon('info')}</span><span class="main"><span class="title" style="font-weight:400">About Cowdrey One</span></span><span class="value">${VERSION}</span>${icon('chevron', 'chev')}</button>
      </div>
      <p class="group-foot">Cowdrey One can’t see what’s installed on your device, so it keeps a list of the apps you get here, in this browser only. New versions are checked on GitHub. The App Store keeps its own apps up to date.</p>
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
    const url = C.hubUrl, desk = !isPhone();
    const how = {
      ios: { t: 'iPhone and iPad', s: ['Open this page in Safari.', 'Tap Share (the square with an arrow), then Add to Home Screen.', 'Tap Add. Cowdrey One opens full screen, like any app.'],
        extra: C.hubDownloads.ios ? `<a class="link-button" href="${esc(C.hubDownloads.ios)}" target="_blank" rel="noopener">Or get the iPhone app</a>` : '' },
      android: { t: 'Android', s: ['Open this page in Chrome.', 'Tap ⋮, then Install app (or Add to Home screen).', 'Tap Install. It opens like any other app.'],
        extra: C.hubDownloads.android ? `<a class="link-button" href="${esc(C.hubDownloads.android)}">Or download the Android app</a>` : '' },
      mac: { t: 'Mac', s: ['In Safari, choose File › Add to Dock. In Chrome, click Install in the address bar.', 'Cowdrey One opens in its own window, with an icon in the Dock.'],
        extra: C.hubDownloads.mac ? `<a class="link-button" href="${esc(C.hubDownloads.mac)}">Or download the Mac app</a>` : '' },
      web: { t: 'Windows and other computers', s: ['In Chrome or Edge, click Install in the address bar.', 'Cowdrey One opens in its own window.'] },
    };
    const order = [detected.p].concat(ORDER.filter((p) => p !== detected.p));
    $('#view-share').innerHTML = `
      <header class="large-head"><div><p class="eyebrow">Cowdrey One</p><h1 class="large-title" id="t-share">${desk ? 'Get on Your Phone' : 'Share'}</h1></div></header>
      <section class="qr-card"><div class="qr">${qrSvg(url)}<img src="icon-192.png" alt=""></div>
        <div><h3>${desk ? 'Point your phone’s camera here' : 'Share every app'}</h3>
          <p>${desk ? 'Scan this with your iPhone or Android phone to open Cowdrey One there. Then each app is one tap away, with the right download for that phone.' : 'Show this code to a friend, or send the link. It opens every app with the right download for their phone or computer.'}</p>
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
    for (const p of ORDER) {
      const pl = a.platforms[p];
      if (!pl) {
        if (a.soon && a.soon[p]) rows.push(`<div class="row get-row"><span class="glyph">${icon(PLAT[p].icon)}</span><span class="main"><span class="title">${PLAT[p].name}</span><span class="sub">${esc(a.soon[p])}</span></span></div>`);
        continue;
      }
      pl.get.forEach((o, i) => {
        const here = p === plat() && i === 0;
        const got = installed[key(p, a.id)] && installed[key(p, a.id)].k === o.kind;
        const btn = got && o.kind !== 'web'
          ? `<button class="pill done" data-act="forget-opt" data-id="${a.id}" data-p="${p}" aria-label="On your Library. Remove">${icon('check-circle')}</button>`
          : `<a class="pill${here ? ' solid' : ''}" data-act="get-opt" data-id="${a.id}" data-p="${p}" data-i="${i}" href="${esc(o.url)}"${linkTarget(o)}>${KIND[o.kind].btn}</a>`;
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
    if (r && r.notes && plain(r.notes)) {
      return `${head}<div class="notes" id="notes">${mdLite(r.notes.slice(0, 1600))}</div>
        <p style="margin:8px 0 0"><a href="${esc(r.url || `https://github.com/${a.repo}/releases`)}" target="_blank" rel="noopener" data-act="ext">Release notes on GitHub</a></p>`;
    }
    const log = a.changelog || (a.repo ? `https://github.com/${a.repo}/blob/main/CHANGELOG.md` : '');
    return `${head}<p class="notes">${log ? `See every change <a href="${esc(log)}" target="_blank" rel="noopener" data-act="ext">on GitHub</a>.` : ''}</p>`;
  }
  function appPage(a) {
    const plats = ORDER.filter((p) => a.platforms[p]);
    const inLib = mine(a);
    return `<div class="hero" style="${sky(a)}"><div class="art">${art(a)}</div>
        <div class="hero-id">${appIcon(a)}<div><h2 id="sheet-title">${esc(a.name)}</h2><p>${esc(a.subtitle)}</p>
          <div class="hero-actions">${pill(a, 'light')}<button class="round" data-act="share-app" data-id="${a.id}" aria-label="Share ${esc(a.name)}">${icon('share')}</button></div></div></div></div>
      <div class="sheet-pad">
        <div class="facts">
          <div class="fact"><div class="k">Version</div><div class="v">${esc(latest(a))}</div><div class="c">${a.status ? esc(a.status) : 'Latest'}</div></div>
          <div class="fact"><div class="k">Price</div><div class="v">Free</div><div class="c">Forever</div></div>
          <div class="fact"><div class="k">Platforms</div><div class="v">${plats.length}</div><div class="c">${plats.map((p) => ({ ios: 'iOS', android: 'Android', mac: 'Mac', web: 'Web' })[p]).join(' · ')}</div></div>
          <div class="fact"><div class="k">Category</div><div class="v">${icon({ Weather: 'cloud', Navigation: 'compass', Productivity: 'clock', Writing: 'doc', Documents: 'doc' }[a.category] || 'stack')}</div><div class="c">${esc(a.category)}</div></div>
          <div class="fact"><div class="k">Privacy</div><div class="v">${icon('lock')}</div><div class="c">No tracking</div></div>
          <div class="fact"><div class="k">Developer</div><div class="v">${icon('person')}</div><div class="c">Bradley Cowdrey</div></div>
        </div>
        <div id="whats-new">${whatsNew(a)}</div>
        <div class="section-head"><h2>About</h2></div>
        <p class="prose">${esc(a.about)}</p>
        <ul class="bullets">${a.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <div class="section-head"><h2>Get It On</h2></div>
        <div class="group" id="get-rows">${getRows(a)}</div>
        <p class="group-foot">${a.platforms[plat()] ? '' : `${esc(a.name)} isn’t made for ${esc(PLAT[plat()].name)} yet. The web version works in any browser.`}</p>
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
        ${inLib ? `<p class="group-foot" style="text-align:center;margin-top:16px"><button class="link-button" data-act="forget" data-id="${a.id}" style="color:var(--red)">Remove from Library</button></p>` : ''}
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
    const p = plat(), n = gotCount();
    const tip = {
      ios: 'Each one opens the App Store: tap Get there, then come back here for the next.',
      android: 'Each one downloads an APK. The first time, Android asks you to allow your browser to install apps: allow it, then tap Install for each.',
      mac: 'Each one downloads a .dmg to Downloads. Open it and drag the app into Applications.',
      web: 'Each one opens in a new tab. On a phone, add each to your Home Screen.',
    }[p];
    return `<h2 class="sheet-title" id="sheet-title">Get Every App</h2><p class="sheet-lead">For ${esc(thisDevice())}. ${esc(tip)}</p>
      <div class="sheet-pad">
        <div class="reading" style="margin-top:18px"><span class="big" style="font-size:48px">${n}</span><span class="of" style="font-size:20px">of ${APPS.length} done</span></div>
        <div class="group" id="setup-rows">${APPS.map((a) => appRow(a, { plats: false })).join('')}</div>
        <p class="group-foot">Not on ${esc(PLAT[p].name)}? Apps without a ${esc(PLAT[p].name)} version open on the web instead.</p>
        <p style="margin-top:22px"><button class="button wide" data-act="close">Done</button></p></div>`;
  }

  /* ---------- About and first launch ---------- */
  function aboutPage() {
    return `<div class="welcome" style="padding-top:44px"><img src="bradley.jpg" alt="" style="border-radius:50%;width:84px;height:84px">
        <h2 id="sheet-title" style="margin-bottom:8px">Bradley Cowdrey</h2><p style="color:var(--ink-2);margin:0 0 4px">Founder. Operator. Always learning.</p>
        <p style="color:var(--ink-2);margin:0 0 22px;font-size:15px">Small, free, open-source apps for iPhone, iPad, Android, Mac and the web.</p></div>
      <div class="sheet-pad"><div class="group">
        <a class="row info tap" href="${C.developer.url}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">bradcowdrey.com</span><span class="v"></span>${icon('chevron', 'chev')}</a>
        <a class="row info tap" href="${C.developer.github}" target="_blank" rel="noopener" data-act="ext"><span class="k" style="color:var(--clay-text)">Every app on GitHub</span><span class="v"></span>${icon('chevron', 'chev')}</a>
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
        <div class="feat">${icon('refresh')}<div><b>New versions at a glance</b><span>Your Library shows when an app you got here has an update.</span></div></div>
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
      if (innerWidth >= 900 || s.dataset.locked || sc.scrollTop > 0 || e.target.closest('.carousel,.facts')) return;
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
    if (!quiet) {
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
      $$('[data-pill]', sheet).forEach((el) => { el.outerHTML = pill(pageApp, 'light'); });
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
      case 'forget': e.preventDefault(); forget(a); if (sheetKind === 'app') closeSheet(); break;
      case 'forget-opt': forget(a, t.dataset.p); break;
      case 'open-app': e.preventDefault(); openApp(t.dataset.id); break;
      case 'tab': closeSheet(); showTab(t.dataset.tab); break;
      case 'slide': { const car = $('.carousel'); car.scrollTo({ left: +t.dataset.i * (car.firstElementChild.offsetWidth + 14), behavior: 'smooth' }); break; }
      case 'setup': openSheet(setupPage(), { kind: 'setup' }); break;
      case 'about': openSheet(aboutPage(), { kind: 'about' }); break;
      case 'close': closeSheet(); break;
      case 'agree': store.set('terms', { v: C.termsVersion, at: Date.now() }); sheet && (sheet.dataset.locked = ''); closeSheet(); break;
      case 'edit': editing = !editing; renderLibrary(); break;
      case 'update-all': updates().forEach((x) => get(x, null, best(x))); break;
      case 'check': checkUpdates(false); break;
      case 'appearance': prefs.appearance = t.dataset.v; savePrefs(); applyTheme(); renderLibrary(); break;
      case 'share-hub': share('Cowdrey One', 'Every free app by Bradley Cowdrey, for iPhone, Android, Mac and the web.', C.hubUrl); break;
      case 'copy-hub': copy(C.hubUrl); break;
      case 'share-app': share(a.name, `${a.name}: ${a.subtitle}. Free, by Bradley Cowdrey.`, C.hubUrl + '?app=' + a.id); break;
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClocks(); });

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
  window.CowdreyOne = { VERSION, state: (id) => state(byId[id]), platform: plat, checkUpdates };
})();
