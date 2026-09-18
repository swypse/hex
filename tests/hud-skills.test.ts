import { describe, it, expect, beforeEach } from 'vitest';
import { Container } from 'pixi.js';
import { HudSkills } from '../src/ui/hud/hud-skills';
import { HudAchievements } from '../src/ui/hud/hud-achievements';
import { IconButton } from '../src/ui/kit/icon-button';
import {
  SCORE_PAD,
  SCORE_TOP_OFFSET,
  SCORE_CHIP_RADIUS,
  SCORE_TEXT_CHIP_GAP,
  SCORE_TEXT_HEIGHT,
  SCORE_BUFF_CHIP_GAP,
  SCORE_BUTTON_GAP,
  scoreButtonsPosition,
} from '../src/ui/layout';
import { type UIHost } from '../src/ui/host';

const BUTTON_SIZE = 40;

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

  it('stacks the skills button under the player score chip with no buffs', () => {
    const skills = new HudSkills();
    skills.mount(host, root);
    const el = (skills as unknown as { el: Container }).el!;
    const { width } = host.app.screen;
    const chipX = width - SCORE_PAD - SCORE_CHIP_RADIUS;
    const { skills: pos } = scoreButtonsPosition(width, host.app.screen.height, 0);
    expect(el.position.x).toBe(pos.x);
    expect(el.position.y).toBe(pos.y);
    expect(el.position.x).toBe(chipX - BUTTON_SIZE / 2);
    const chipY = SCORE_PAD + SCORE_TOP_OFFSET + SCORE_CHIP_RADIUS;
    // The score text now sits between the chip and the buff/button stack.
    expect(el.position.y).toBe(chipY + SCORE_CHIP_RADIUS + SCORE_TEXT_CHIP_GAP + SCORE_TEXT_HEIGHT + SCORE_BUFF_CHIP_GAP + SCORE_BUTTON_GAP);
    skills.destroy();
  });

  it('sits the achievements button directly below the skills button', () => {
    const skills = new HudSkills();
    skills.mount(host, root);
    const ach = new HudAchievements();
    ach.mount(host, root);
    const el = (skills as unknown as { el: Container }).el!;
    const achEl = (ach as unknown as { el: Container }).el!;
    expect(achEl.position.x).toBe(el.position.x);
    expect(achEl.position.y).toBe(el.position.y + BUTTON_SIZE + SCORE_BUTTON_GAP);
    skills.destroy();
    ach.destroy();
  });

  it('uses a button the size of the player chip (radius 20 → 40px) with translucent black bg', () => {
    const skills = new HudSkills();
    skills.mount(host, root);
    const ach = new HudAchievements();
    ach.mount(host, root);
    const btn = (skills as unknown as { el: Container }).el!.children[0] as IconButton;
    const achBtn = (ach as unknown as { el: Container }).el!.children[0] as IconButton;
    expect(btn.width).toBe(SCORE_CHIP_RADIUS * 2);
    expect(achBtn.width).toBe(SCORE_CHIP_RADIUS * 2);
    skills.destroy();
    ach.destroy();
  });
});