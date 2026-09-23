import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { makeCheckbox } from '../src/ui/kit/checkbox';

describe('makeCheckbox', () => {
  it('reflects a click on its own visual state and reports the new value', () => {
    const onToggle = vi.fn();
    const checkbox = makeCheckbox(false, onToggle);
    const mark = checkbox.el.children[1] as unknown as { visible: boolean };

    expect(mark.visible).toBe(false);
    checkbox.tap();
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(mark.visible).toBe(true);

    checkbox.tap();
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(mark.visible).toBe(false);
  });

  it('setChecked forces the visual state without calling onToggle', () => {
    const onToggle = vi.fn();
    const checkbox = makeCheckbox(false, onToggle);
    const mark = checkbox.el.children[1] as unknown as { visible: boolean };

    checkbox.setChecked(true);
    expect(mark.visible).toBe(true);
    expect(onToggle).not.toHaveBeenCalled();
    checkbox.setChecked(false);
    expect(mark.visible).toBe(false);
  });

  it('starts checked when opened with checked=true', () => {
    const checkbox = makeCheckbox(true, () => {});
    const mark = checkbox.el.children[1] as unknown as { visible: boolean };
    expect(mark.visible).toBe(true);
  });
});