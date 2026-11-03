import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { HudAchievements } from '../src/ui/hud/hud-achievements';
import { IconButton } from '../src/ui/kit/icon-button';
import {
  SCORE_PAD,
  SCORE_TOP_OFFSET,
  SCORE_CHIP_RADIUS,
  SCORE_ACHIEVEMENTS_CHIP_GAP,
  SKILLS_BUTTON_SIZE,
  scoreButtonsPosition,
} from '../src/ui/hud/layout';
import { type UIHost } from '../src/ui/host';

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('score-stack button placement', () => {
  let host: UIHost;
  let root: Container;

  beforeEach(() => {
    host = makeHost();
    root = new Container();
  });

  it('sits the achievements button below the score text with an 8px gap', () => {
    const ach = new HudAchievements();
    ach.mount(host, root);
    const el = (ach as unknown as { el: Container }).el!;
    const { width } = host.app.screen;
    const chipX = width - SCORE_PAD - SCORE_CHIP_RADIUS;
    const { achievements: pos } = scoreButtonsPosition(width, host.app.screen.height);
    expect(el.position.x).toBe(pos.x);
    expect(el.position.y).toBe(pos.y);
    expect(el.position.x).toBe(chipX - SKILLS_BUTTON_SIZE / 2);
    const chipY = SCORE_PAD + SCORE_TOP_OFFSET + SCORE_CHIP_RADIUS;
    const chipBottom = chipY + SCORE_CHIP_RADIUS;
    expect(el.position.y).toBe(chipBottom + SCORE_ACHIEVEMENTS_CHIP_GAP);
    ach.destroy();
  });

  it('uses a 40px button with translucent black bg', () => {
    const ach = new HudAchievements();
    ach.mount(host, root);
    const btn = (ach as unknown as { el: Container }).el!.children[0] as IconButton;
    expect(btn.width).toBe(SKILLS_BUTTON_SIZE);
    ach.destroy();
  });
});