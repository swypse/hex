import { describe, it, expect } from 'vitest';
import { RESOURCE_TOOLTIPS } from '../src/ui/hud/resourceTooltips';

describe('RESOURCE_TOOLTIPS', () => {
  it('defines a name and required-for text for every resource', () => {
    expect(RESOURCE_TOOLTIPS.money.name).toBe('Money');
    expect(RESOURCE_TOOLTIPS.wood.name).toBe('Wood');
    expect(RESOURCE_TOOLTIPS.stone.name).toBe('Stone');
    expect(RESOURCE_TOOLTIPS.ore.name).toBe('Ore');
    for (const key of ['money', 'wood', 'stone', 'ore'] as const) {
      expect(RESOURCE_TOOLTIPS[key].requiredFor.length).toBeGreaterThan(0);
    }
  });
});
