// Checks a measure.json written by store-frames.js against the family standard (README.md, sections 2 and 3):
// every frame's type sizes, weights, colours and positions, and where its device starts. Exits 1 on any difference.
//
// Usage: node check-measure.js <measure.json>
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('Usage: node check-measure.js <measure.json>'); process.exit(2); }
const STANDARD = {
  //        sizes (eyebrow, headline, subhead)  eyebrow baseline, headline top, device top, headline lines
  iphone: { eyebrow: 39, headline: 108, subhead: 51, baseline: 184, headTop: 213, deviceTop: 640, lines: 2, subBottom: 531 },
  ipad: { eyebrow: 52, headline: 144, subhead: 68, baseline: 204, headTop: 244, deviceTop: 600, lines: 1, subBottom: 513 },
  mac: { eyebrow: 39, headline: 108, subhead: 51, baseline: 144, headTop: 173, deviceTop: 470, lines: 1, subBottom: 374 },
};
const frames = JSON.parse(fs.readFileSync(file, 'utf8'));
let bad = 0;
const check = (ok, what) => { if (!ok) { bad++; console.log('  x ' + what); } };
for (const f of frames) {
  const s = STANDARD[f.kind];
  const where = f.file + ':';
  check(f.eyebrow.fontFamily === 'Inter Store' && f.eyebrow.fontSize === s.eyebrow && f.eyebrow.fontWeight === '600', `${where} eyebrow is Inter 600 at ${s.eyebrow} px (${f.eyebrow.fontFamily} ${f.eyebrow.fontWeight} ${f.eyebrow.fontSize})`);
  check(f.headline.fontFamily === 'Fraunces' && f.headline.fontSize === s.headline && f.headline.fontWeight === '560', `${where} headline is Fraunces 560 at ${s.headline} px (${f.headline.fontFamily} ${f.headline.fontWeight} ${f.headline.fontSize})`);
  check(f.subhead.fontFamily === 'Inter Store' && f.subhead.fontSize === s.subhead && f.subhead.fontWeight === '600', `${where} subhead is Inter 600 at ${s.subhead} px (${f.subhead.fontFamily} ${f.subhead.fontWeight} ${f.subhead.fontSize})`);
  check(f.eyebrow.color === 'rgba(255, 255, 255, 0.78)' && f.headline.color === 'rgb(255, 255, 255)' && f.subhead.color === 'rgba(255, 255, 255, 0.92)', `${where} colours are the standard's`);
  check(f.eyebrowBaseline === s.baseline, `${where} eyebrow baseline ${f.eyebrowBaseline}, not ${s.baseline}`);
  check(f.headline.top === s.headTop, `${where} headline top ${f.headline.top}, not ${s.headTop}`);
  check(f.headline.lines === s.lines, `${where} headline has ${f.headline.lines} lines, not ${s.lines}`);
  check(f.subhead.bottom === s.subBottom, `${where} subhead bottom ${f.subhead.bottom}, not ${s.subBottom}`);
  check(f.deviceTop === s.deviceTop, `${where} device top ${f.deviceTop}, not ${s.deviceTop}`);
}
console.log(bad ? `${bad} difference(s) from the standard in ${frames.length} frames` : `All ${frames.length} frames match the standard`);
process.exit(bad ? 1 : 0);
