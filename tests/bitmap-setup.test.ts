import { describe, expect, it } from 'vitest';
import { BitmapText } from 'pixi.js';
import { FontSize } from '@enums';

describe('test bitmap font setup', () => {
  it('constructs BitmapText for both font families headlessly', () => {
    const regular = new BitmapText({
      text: 'hello 123 ✓',
      style: { fontFamily: 'Roboto Regular', fontSize: FontSize.NORMAL, fill: 0xffffff },
    });
    const black = new BitmapText({
      text: 'hello 123 ✓',
      style: { fontFamily: 'Roboto Black', fontSize: FontSize.NORMAL, fill: 0xff8c00 },
    });
    expect(regular.width).toBeGreaterThan(0);
    expect(black.width).toBeGreaterThan(0);
  });
});
