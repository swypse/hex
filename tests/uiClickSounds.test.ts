import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { Button } from '../src/ui/kit/button';
import { IconButton } from '../src/ui/kit/iconButton';
import { makeCheckbox } from '../src/ui/kit/checkbox';
import { sfx } from '../src/sound/sfx';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

describe('UI click sounds', () => {
  let spy: { mockRestore: () => void };

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    spy = vi.spyOn(sfx, 'play');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('plays a click when a Button is tapped', () => {
    const onClick = vi.fn();
    const btn = new Button({ label: 'X', onClick });
    btn.emit('pointertap', {} as never);
    expect(onClick).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('click');
    btn.destroy({ children: true });
  });

  it('plays a click when a Button is triggered by keyboard', () => {
    const onClick = vi.fn();
    const btn = new Button({ label: 'X', onClick });
    btn.trigger();
    expect(onClick).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('click');
    btn.destroy({ children: true });
  });

  it('does not play a click for a disabled Button', () => {
    const btn = new Button({ label: 'X', onClick: () => {} });
    btn.disabled = true;
    btn.emit('pointertap', {} as never);
    expect(spy).not.toHaveBeenCalled();
    btn.destroy({ children: true });
  });

  it('plays a click when an IconButton is tapped', () => {
    const onClick = vi.fn();
    const btn = new IconButton({ icon: 'x.png', onClick });
    btn.emit('pointertap', {} as never);
    expect(onClick).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('click');
    btn.destroy({ children: true });
  });

  it('plays a click when a checkbox is flipped by the user', () => {
    const onToggle = vi.fn();
    const cb = makeCheckbox(false, onToggle);
    cb.el.emit('pointertap', {} as never);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(spy).toHaveBeenCalledWith('click');
    cb.el.destroy({ children: true });
  });
});
