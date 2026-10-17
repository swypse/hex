import { BitmapText, Graphics, type TextStyleOptions } from 'pixi.js';
import { FONT_REGULAR, sizedFontFamily } from '../gfx/bitmap-fonts';

/** Reuses Graphics and BitmapText objects across overlay rebuilds. */
export class ObjectPool {
  private graphics: Graphics[] = [];
  private texts = new Map<string, BitmapText[]>();
  private keys = new WeakMap<BitmapText, string>();

  takeGraphics(): Graphics {
    return this.graphics.pop() ?? new Graphics();
  }

  releaseGraphics(g: Graphics): void {
    g.clear();
    g.position.set(0, 0);
    g.scale.set(1, 1);
    g.alpha = 1;
    g.visible = true;
    g.zIndex = 0;
    this.graphics.push(g);
  }

  /** A pooled text that already shows this exact text and style is handed back
   *  untouched (re-laying out a bitmap text is the expensive part of a rebuild);
   *  otherwise any pooled text is restyled, or a new one made. */
  takeText(text: string, style: TextStyleOptions): BitmapText {
    const sized: TextStyleOptions = {
      ...style,
      fontFamily: sizedFontFamily(String(style.fontFamily ?? FONT_REGULAR), Number(style.fontSize ?? 16)),
    };
    const key = `${text}|${sized.fontFamily}|${sized.fontSize}|${String(sized.fill)}`;
    const exact = this.texts.get(key)?.pop();
    if (exact) return exact;
    let t: BitmapText | undefined;
    for (const [k, list] of this.texts) {
      t = list.pop();
      if (list.length === 0) this.texts.delete(k);
      if (t) break;
    }
    if (!t) t = new BitmapText({ text: '', style: sized });
    t.text = text;
    t.style = sized;
    this.keys.set(t, key);
    return t;
  }

  releaseText(t: BitmapText): void {
    t.position.set(0, 0);
    t.scale.set(1, 1);
    t.alpha = 1;
    t.visible = true;
    t.zIndex = 0;
    const key = this.keys.get(t) ?? '';
    const list = this.texts.get(key);
    if (list) list.push(t);
    else this.texts.set(key, [t]);
  }

  clear(): void {
    this.graphics = [];
    this.texts = new Map();
  }
}
