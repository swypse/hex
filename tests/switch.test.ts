import { describe, it, expect, vi } from 'vitest';
import { makeSwitch } from '../src/ui/kit/switch';

describe('makeSwitch', () => {
  it('flips on tap and reports the new value', () => {
    const onToggle = vi.fn();
    const sw = makeSwitch(false, onToggle);

    expect(sw.isOn()).toBe(false);
    sw.tap();
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(sw.isOn()).toBe(true);

    sw.tap();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(sw.isOn()).toBe(false);
  });

  it('setChecked forces the state without calling onToggle', () => {
    const onToggle = vi.fn();
    const sw = makeSwitch(false, onToggle);

    sw.setChecked(true);
    expect(sw.isOn()).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
    sw.setChecked(false);
    expect(sw.isOn()).toBe(false);
  });

  it('starts on when opened with checked=true', () => {
    expect(makeSwitch(true, () => {}).isOn()).toBe(true);
  });

  it('toggles when its label is clicked', () => {
    const onToggle = vi.fn();
    const sw = makeSwitch(false, onToggle, { label: "Don't show again" });
    const label = sw.el.children[1] as unknown as { emit: (event: string, x: never) => void };

    label.emit('pointertap', {} as never);
    expect(onToggle).toHaveBeenCalledWith(true);

    label.emit('pointertap', {} as never);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
