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
// Every other build (the GitHub APK, Mac, iPhone and iPad) is web/ as it is.
const STORE = process.env.STORE || '';
if (!['', 'play'].includes(STORE)) {
  console.error(`STORE=${STORE}: the only store build is STORE=play`);
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(web, dist, { recursive: true, filter: (src) => !src.endsWith('sw.js') });
if (STORE === 'play') {
  writeFileSync(join(dist, 'store.js'), "// The Google Play version of Cowdrey One for Android (desktop/build.mjs, STORE=play).\nwindow.COWDREY_STORE = 'play';\n");
  const index = join(dist, 'index.html');
  const html = readFileSync(index, 'utf8');
  const tag = '<script src="catalog.js"></script>';
  if (!html.includes(tag)) {
    console.error(`web/index.html has no ${tag} to put store.js before`);
    process.exit(1);
  }
  writeFileSync(index, html.replace(tag, '<script src="store.js"></script>\n' + tag));
}
console.log(`Cowdrey One ${conf}: copied web/ into desktop/dist${STORE ? ` (the ${STORE === 'play' ? 'Google Play' : STORE} version)` : ''}`);
