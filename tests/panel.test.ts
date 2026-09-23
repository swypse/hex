import { describe, it, expect } from 'vitest';
import { makePanel } from '../src/ui/kit/panel';

interface PathLike {
  instructions: Array<{ action: string; data?: unknown }>;
}

function flattenActions(path: PathLike): string[] {
  const out: string[] = [];
  for (const inst of path.instructions) {
    out.push(inst.action);
    if (inst.action === 'addPath') {
      out.push(...flattenActions((inst.data as { 0?: PathLike })[0]!));
    }
  }
  return out;
}

function pathActions(panel: ReturnType<typeof makePanel>): string[] {
  const context = panel.context as unknown as {
    instructions: Array<{ action: string; data: { path: PathLike } }>;
  };
  const fill = context.instructions.find((i) => i.action === 'fill')!;
  return flattenActions(fill.data.path);
}

describe('makePanel', () => {
  it('rounds all corners by default', () => {
    const actions = pathActions(makePanel(100, 40));
    expect(actions).toContain('roundRect');
  });

  it('rounds only the bottom corners when bottomRadiusOnly is set', () => {
    const actions = pathActions(makePanel(100, 40, { bottomRadiusOnly: true }));
    expect(actions).not.toContain('roundRect');
    expect(actions).toContain('arcTo');
  });

  it('rounds only the right corners when rightRadiusOnly is set', () => {
    const actions = pathActions(makePanel(100, 40, { rightRadiusOnly: true }));
    expect(actions).not.toContain('roundRect');
    expect(actions).toContain('arcTo');
  });
});
