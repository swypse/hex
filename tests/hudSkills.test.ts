import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { HudSkills } from '../src/ui/hud/HudSkills';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from '../src/ui/layout';
import { type UIHost } from '../src/ui/host';

const BUTTON_SIZE = 48;
const TURN_BAR_GAP = 6;
const TOOLBAR_SIDE_PADDING = 12;

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudSkills placement', () => {
  let host: UIHost;
  let root: Container;

  beforeEach(() => {
    host = makeHost();
    root = new Container();
  });

  it('sits bottom-right, centered under the end turn button and 6px above the turn bar', () => {
    const skills = new HudSkills();
    skills.mount(host, root);
    const el = (skills as unknown as { el: Container }).el!;
    const { width, height } = host.app.screen;
    expect(el.position.x).toBe(width - TOOLBAR_SIDE_PADDING - BUTTON_SIZE);
    expect(el.position.y).toBe(height - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT - TURN_BAR_GAP - BUTTON_SIZE);
    skills.destroy();
  });
});
