import { BitmapText, Graphics, type TextStyleOptions } from 'pixi.js';
import { FONT_REGULAR, sizedFontFamily } from '../gfx/bitmap-fonts';

/** Reuses Graphics and BitmapText objects across overlay rebuilds. */
export class ObjectPool {
  private graphics: Graphics[] = [];
  private texts: BitmapText[] = [];

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

  takeText(text: string, style: TextStyleOptions): BitmapText {
    const sized: TextStyleOptions = {
      ...style,
      fontFamily: sizedFontFamily(String(style.fontFamily ?? FONT_REGULAR), Number(style.fontSize ?? 16)),
    };
    const t = this.texts.pop() ?? new BitmapText({ text: '', style: sized });
    t.text = text;
    t.style = sized;
    return t;
  }

  releaseText(t: BitmapText): void {
    t.position.set(0, 0);
    t.scale.set(1, 1);
    t.alpha = 1;
    t.visible = true;
    t.zIndex = 0;
    this.texts.push(t);
  }

  clear(): void {
    this.graphics = [];
    this.texts = [];
  }
}
