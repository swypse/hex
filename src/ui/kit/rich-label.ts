import { Container } from 'pixi.js';
import { makeIcon } from './icon';
import { makeLabel } from './label';

/** Inline resource tokens in rich text: `[money:15]` renders as "15" + the resource icon. */
const TOKEN = /\[(money|wood|stone|ore|food):(\d+)\]/;
const ICONS: Record<string, string> = { money: 'gold-32', wood: 'wood-32', stone: 'stone-32', ore: 'ore-32', food: 'food-32' };

/** Word-wrapped text with inline resource icons (see TOKEN). */
export function makeRichLabel(text: string, opts: { fontSize: number; fill: number; width: number }): Container {
  const root = new Container();
  const { fontSize, fill, width } = opts;
  const lineH = Math.round(fontSize * 1.5);
  const iconSize = Math.round(fontSize * 1.25);
  const space = Math.round(fontSize * 0.3);
  let x = 0;
  let line = 0;

  const place = (parts: Container[], w: number): void => {
    if (x > 0 && x + w > width) {
      x = 0;
      line++;
    }
    for (const p of parts) {
      p.x += x;
      p.y += line * lineH;
      root.addChild(p);
    }
    x += w + space;
  };

  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    // A word may glue punctuation to a token, e.g. "(15" "[money:15]," "+[stone:1]".
    const parts: Container[] = [];
    let w = 0;
    let rest = word;
    while (rest !== '') {
      const m = TOKEN.exec(rest);
      const plain = m ? rest.slice(0, m.index) : rest;
      if (plain !== '') {
        const label = makeLabel(plain, { fontSize, fill });
        label.position.set(w, (lineH - label.height) / 2);
        parts.push(label);
        w += label.width;
      }
      if (!m) break;
      const num = makeLabel(m[2]!, { fontSize, fill });
      num.position.set(w, (lineH - num.height) / 2);
      w += num.width + 2;
      const icon = makeIcon(ICONS[m[1]!]!, iconSize);
      icon.anchor.set(0, 0.5);
      icon.position.set(w, lineH / 2);
      w += iconSize;
      parts.push(num, icon);
      rest = rest.slice(m.index + m[0].length);
    }
    place(parts, w);
  }
  return root;
}
