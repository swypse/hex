import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application, Container, Text } from 'pixi.js';
import { Tooltip } from '../src/ui/kit/tooltip';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

function makeApp(stage: Container): Application {
  return { stage, screen: { width: 800 } } as unknown as Application;
}

describe('Tooltip', () => {
  let stage: Container;
  let parent: Container;
  let icon: Container;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 16 });
    stage = new Container();
    parent = new Container();
    icon = new Container();
    icon.position.set(100, 50);
    parent.addChild(icon);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows after the hover delay', () => {
    const tip = new Tooltip(makeApp(stage));
    parent.addChild(tip.el);
    tip.showForAfter(icon, 'Money', 'spawning units.', 500);
    expect(tip.el.visible).toBe(false);
    vi.advanceTimersByTime(500);
    expect(tip.el.visible).toBe(true);
    tip.destroy();
  });

  it('shows immediately on click', () => {
    const tip = new Tooltip(makeApp(stage));
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    expect(tip.el.visible).toBe(true);
    tip.destroy();
  });

  it('hides 500ms after pointerout', () => {
    const tip = new Tooltip(makeApp(stage));
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    tip.hideAfter(500);
    expect(tip.el.visible).toBe(true);
    vi.advanceTimersByTime(500);
    expect(tip.el.visible).toBe(false);
    tip.destroy();
  });

  it('re-showing cancels a pending hide', () => {
    const tip = new Tooltip(makeApp(stage));
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    tip.hideAfter(500);
    vi.advanceTimersByTime(250);
    tip.showFor(icon, 'Money', 'spawning units.');
    vi.advanceTimersByTime(500);
    expect(tip.el.visible).toBe(true);
    tip.destroy();
  });

  it('hides when clicking outside the icon and tooltip', () => {
    const tip = new Tooltip(makeApp(stage));
    parent.addChild(tip.el);
    tip.showFor(icon, 'Money', 'spawning units.');
    const other = new Container();
    stage.emit('pointerdown', { target: other } as never);
    expect(tip.el.visible).toBe(false);
    tip.destroy();
  });
});
