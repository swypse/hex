// Browser global stubs (navigator, window, Image, document) live in
// browserGlobals.ts so they run before pixi.js is imported here — ESM imports
// are hoisted, and pixi reads `navigator` at module scope on Node 20 where it
// does not exist.
import { BitmapFont } from 'pixi.js';

function range(from: number, to: number): string {
  let out = '';
  for (let c = from; c <= to; c++) out += String.fromCharCode(c);
  return out;
}

const TEST_FONT_CHARS =
  range(0x20, 0x7e) +
  range(0x00a0, 0x00ff) +
  '\u0401' + range(0x0410, 0x044f) + '\u0451' + '\u2116' +
  '\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026' +
  range(0x2190, 0x2193) +
  '\u2212\u2713';

BitmapFont.install({ name: 'Roboto Regular', style: { fontSize: 16, fill: 0xffffff }, chars: TEST_FONT_CHARS });
BitmapFont.install({ name: 'Roboto Black', style: { fontSize: 16, fill: 0xffffff }, chars: TEST_FONT_CHARS });