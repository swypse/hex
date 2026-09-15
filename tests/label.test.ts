import { describe, expect, it } from 'vitest';
import { BitmapText } from 'pixi.js';
import { makeLabel } from '../src/ui/kit/label';

describe('makeLabel', () => {
  it('returns a BitmapText', () => {
    expect(makeLabel('x')).toBeInstanceOf(BitmapText);
  });
  it('defaults to Roboto Regular', () => {
    expect(makeLabel('x').style.fontFamily).toBe('Roboto Regular');
  });
  it('uses Roboto Black for 700+', () => {
    expect(makeLabel('x', { fontWeight: '700' }).style.fontFamily).toBe('Roboto Black');
    expect(makeLabel('x', { fontWeight: '900' }).style.fontFamily).toBe('Roboto Black');
  });
  it('keeps Roboto Regular for 600', () => {
    expect(makeLabel('x', { fontWeight: '600' }).style.fontFamily).toBe('Roboto Regular');
  });
  it('applies fill', () => {
    expect(makeLabel('x', { fill: 0xff0000 }).style.fill).toBe(0xff0000);
  });
  it('applies word wrap width', () => {
    const label = makeLabel('long text', { wordWrap: true, wordWrapWidth: 50 });
    expect(label.style.wordWrap).toBe(true);
    expect(label.style.wordWrapWidth).toBe(50);
  });
});
