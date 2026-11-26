// Copies the web app (../web) into dist/, which Tauri bundles into the Mac, iPhone, iPad and Android apps.
// The service worker is left out: the apps load their files from inside the bundle, so they work offline anyway.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', 'web');
const dist = join(here, 'dist');

// One version everywhere: tauri.conf.json, Cargo.toml, package.json and the VERSION constant in web/app.js.
const conf = JSON.parse(readFileSync(join(here, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;
const cargo = readFileSync(join(here, 'src-tauri', 'Cargo.toml'), 'utf8').match(/^version = "([^"]+)"/m)[1];
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
const app = readFileSync(join(web, 'app.js'), 'utf8').match(/const VERSION = '([^']+)'/)[1];
const all = { 'tauri.conf.json': conf, 'Cargo.toml': cargo, 'package.json': pkg, 'web/app.js': app };
if (new Set(Object.values(all)).size !== 1) {
  console.error('Version numbers differ:', all);
  process.exit(1);
}

// STORE=play builds the Google Play version of the Android app: store.js tells the app it came from Google Play, so
// it gets each app from its Google Play page and never offers an APK (Play doesn't let an app install others).
// STORE=appstore builds the Mac App Store version of the Mac app: store.js tells the app it came from the Mac App
// Store, so, like the iPhone and iPad app, it names and shows no other platform (App Review guideline 2.3.10), and it
// never downloads or installs another app (2.4.5, 2.5.2): Get opens the Mac App Store, or the web. Build its app with
// `tauri build --features appstore --config src-tauri/tauri.appstore.conf.json`, which leaves the installer out.
// Every other build (the GitHub APK, the Mac .dmg, iPhone and iPad) is web/ as it is.
const STORE = process.env.STORE || '';
const STORES = {
  play: { name: 'Google Play', note: 'The Google Play version of Cowdrey One for Android' },
  appstore: { name: 'Mac App Store', note: 'The Mac App Store version of Cowdrey One for Mac' },
};
if (STORE && !STORES[STORE]) {
  console.error(`STORE=${STORE}: the store builds are ${Object.keys(STORES).map((s) => 'STORE=' + s).join(' and ')}`);
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(web, dist, { recursive: true, filter: (src) => !src.endsWith('sw.js') });
if (STORE) {
  writeFileSync(join(dist, 'store.js'), `// ${STORES[STORE].note} (desktop/build.mjs, STORE=${STORE}).\nwindow.COWDREY_STORE = '${STORE}';\n`);
  const index = join(dist, 'index.html');
  const html = readFileSync(index, 'utf8');
  const tag = '<script src="catalog.js"></script>';
  if (!html.includes(tag)) {
    console.error(`web/index.html has no ${tag} to put store.js before`);
    process.exit(1);
  }
  writeFileSync(index, html.replace(tag, '<script src="store.js"></script>\n' + tag));
}
console.log(`Cowdrey One ${conf}: copied web/ into desktop/dist${STORE ? ` (the ${STORES[STORE].name} version)` : ''}`);
