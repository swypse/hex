import { describe, expect, it } from 'vitest';
import { Container, Graphics, Sprite } from 'pixi.js';
import { MapView } from '../src/render/map-renderer';

/** A tile view: a container whose first child is the terrain sprite at `y`. */
function tileView(y: number): Container {
  const el = new Container();
  const sprite = new Sprite();
  sprite.position.set(0, y);
  el.addChild(sprite);
  return el;
}

function reorder(container: Container, tileViews: Map<string, { el: Container }>, key: string): void {
  const fake = { container, tileViews };
  (MapView.prototype as unknown as { reorderSelectedTile(this: unknown, key: string): void })
    .reorderSelectedTile.call(fake, key);
}

describe('MapView.reorderSelectedTile', () => {
  it('moves the selected tile after the tiles that are not below it', () => {
    const container = new Container();
    const a = tileView(10);
    const b = tileView(20);
    const c = tileView(30);
    container.addChild(a, b, c);
    reorder(container, new Map([['a', { el: a }]]), 'a');
    // a (y=10) is already above b and c: nothing to skip over.
    expect(container.children).toEqual([a, b, c]);
    const low = tileView(40);
    container.addChildAt(low, 0);
    reorder(container, new Map([['low', { el: low }]]), 'low');
    expect(container.children[container.children.length - 1]).toBe(low);
  });

  it('does not walk into overlay graphics that have no children', () => {
    const container = new Container();
    const sel = tileView(50);
    const below = tileView(10);
    const overlay = new Graphics(); // e.g. the bottom half of another border
    container.addChild(sel, below, overlay);
    expect(() => reorder(container, new Map([['sel', { el: sel }]]), 'sel')).not.toThrow();
    // Placed after the tile it overlaps, but still below the overlay.
    expect(container.children).toEqual([below, sel, overlay]);
  });
});
