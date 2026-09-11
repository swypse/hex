import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { ACHIEVEMENT_ATLAS_FRAMES, ACHIEVEMENT_ATLAS_CELL } from '../src/game/achievementAtlasData.gen';
import { ACHIEVEMENTS, type AchievementId } from '../src/game/achievements';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface AchievementIconsModule {
  ACHIEVEMENT_ICON_FILES: Partial<Record<AchievementId, string>>;
  makeAchievementIcon: (key: string, size: number, onReady?: () => void) => {
    width: number;
    height: number;
    destroy: () => void;
    texture: unknown;
  };
}

describe('makeAchievementIcon', () => {
  let icons: AchievementIconsModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    icons = await import('../src/ui/kit/achievementIcons');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every achievement id maps to an atlas frame', () => {
    for (const a of ACHIEVEMENTS) {
      const key = icons.ACHIEVEMENT_ICON_FILES[a.id as AchievementId];
      expect(key).not.toBeUndefined();
      expect(ACHIEVEMENT_ATLAS_FRAMES[key!]).not.toBeUndefined();
    }
  });

  it('loads the single packed atlas image', () => {
    const sprite = icons.makeAchievementIcon('achievement-explorer', 64);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/achievements-atlas.png`);
    expect(sprite.width).toBe(64);
    expect(sprite.height).toBe(64);
  });

  it('slices the achievement region out of the atlas once it loads', () => {
    const sprite = icons.makeAchievementIcon('achievement-great-connector', 64);
    const frame = ACHIEVEMENT_ATLAS_FRAMES['achievement-great-connector']!;
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(ACHIEVEMENT_ATLAS_CELL);
    expect(tex!.height).toBe(ACHIEVEMENT_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('does not touch the sprite when the image loads after the sprite was destroyed', () => {
    const sprite = icons.makeAchievementIcon('achievement-explorer', 64);
    sprite.destroy();
    const load = FakeImage.instances[0]!.onload!;
    expect(() => load.call(FakeImage.instances[0]!)).not.toThrow();
  });
});