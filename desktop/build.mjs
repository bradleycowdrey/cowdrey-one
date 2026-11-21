// Copies the web app (../web) into dist/, which Tauri bundles into the Mac, iPhone, iPad and Android apps.
// The service worker is left out: the apps load their files from inside the bundle, so they work offline anyway.
import { cpSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
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

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(web, dist, { recursive: true, filter: (src) => !src.endsWith('sw.js') });
console.log(`Cowdrey One ${conf}: copied web/ into desktop/dist`);
