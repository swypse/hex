import { beforeEach, describe, expect, it } from 'vitest';
import { Bounds, Container, Rectangle, Text } from 'pixi.js';
import { Button } from '../src/ui/kit/button';
import { ActionTooltip } from '../src/ui/kit/actionTooltip';

describe('ActionTooltip', () => {
  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    const fakeBounds = new Bounds();
    fakeBounds.addRect(new Rectangle(0, 0, 60, 14));
    Object.defineProperty(Text.prototype, 'bounds', {
      configurable: true,
      get: () => fakeBounds,
    });
  });

  it('shows hidden by default', () => {
    const parent = new Container();
    const target = new Button({ label: 'X', onClick: () => {} });
    parent.addChild(target);
    const tip = new ActionTooltip(parent, target, 'Capture village!');
    expect(tip.el.visible).toBe(false);
    tip.destroy();
    parent.destroy({ children: true });
  });

  it('appears above the button on hover and points at its center', () => {
    const parent = new Container();
    const target = new Button({ label: 'X', onClick: () => {} });
    target.position.set(120, 80);
    parent.addChild(target);
    const tip = new ActionTooltip(parent, target, 'Upgrade village (2w, 3s, 5m)');

    target.emit('pointerover', {} as never);
    expect(tip.el.visible).toBe(true);

    // The triangle tip (the container pivot) sits 10px above the button's top-center.
    expect(tip.el.position.x).toBeCloseTo(120 + target.width / 2, 3);
    expect(tip.el.position.y).toBeCloseTo(80 - 10, 3);

    target.emit('pointerout', {} as never);
    expect(tip.el.visible).toBe(false);

    tip.destroy();
    parent.destroy({ children: true });
  });
});
