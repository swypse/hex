import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { SKILL_ATLAS_FRAMES, SKILL_ATLAS_CELL } from '../src/game/skillAtlasData.gen';
import { SKILLS, type SkillId } from '../src/game/skills';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface SkillIconsModule {
  SKILL_ICON_FILES: Partial<Record<SkillId, string>>;
  makeSkillIcon: (key: string, size: number, onReady?: () => void) => { width: number; height: number; destroy: () => void; texture: unknown };
}

describe('makeSkillIcon', () => {
  let icons: SkillIconsModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    icons = await import('../src/ui/kit/skillIcons');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every skill id maps to an atlas frame', () => {
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const key = icons.SKILL_ICON_FILES[id];
      expect(key).not.toBeUndefined();
      expect(SKILL_ATLAS_FRAMES[key!]).not.toBeUndefined();
    }
  });

  it('loads the single packed atlas image', () => {
    const sprite = icons.makeSkillIcon('skill-climbing', 29);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/skills-atlas.png`);
    expect(sprite.width).toBe(29);
    expect(sprite.height).toBe(29);
  });

  it('slices the skill region out of the atlas once it loads', () => {
    const sprite = icons.makeSkillIcon('skill-water', 29);
    const frame = SKILL_ATLAS_FRAMES['skill-water']!;
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(SKILL_ATLAS_CELL);
    expect(tex!.height).toBe(SKILL_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('does not touch the sprite when the image loads after the sprite was destroyed', () => {
    const sprite = icons.makeSkillIcon('skill-climbing', 29);
    sprite.destroy();
    const load = FakeImage.instances[0]!.onload!;
    expect(() => load.call(FakeImage.instances[0]!)).not.toThrow();
  });
});