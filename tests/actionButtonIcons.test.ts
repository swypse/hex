import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { ACTION_BUTTON_ATLAS_FRAMES, ACTION_BUTTON_ATLAS_CELL } from '../src/game/actionButtonAtlasData.gen';
import { ACTION_BUTTON_ICON_FILES } from '../src/ui/kit/actionButtonIcons';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface ActionButtonIconsModule {
  ACTION_BUTTON_ICON_FILES: Record<string, string>;
  makeActionButtonIcon: (key: string, size: number, onReady?: () => void) => { width: number; height: number; destroy: () => void; texture: unknown };
  ensureActionButtonAtlas: () => Promise<void>;
  actionButtonFrameTexture: (key: string) => Texture | null;
}

describe('makeActionButtonIcon', () => {
  let icons: ActionButtonIconsModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    icons = await import('../src/ui/kit/actionButtonIcons');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every mapped key resolves to an atlas frame', () => {
    for (const key of Object.keys(ACTION_BUTTON_ICON_FILES)) {
      expect(ACTION_BUTTON_ATLAS_FRAMES[ACTION_BUTTON_ICON_FILES[key]!]).not.toBeUndefined();
    }
  });

  it('packs the per-unit spawn icons and the capture map marker', () => {
    for (const key of [
      'action-capture-map',
      'action-spawn-warrior',
      'action-spawn-shield',
      'action-spawn-rider',
      'action-spawn-swordsman',
      'action-spawn-catapult',
      'action-spawn-knight',
    ]) {
      expect(ACTION_BUTTON_ATLAS_FRAMES[key]).not.toBeUndefined();
    }
  });

  it('slices a frame from the shared atlas via the frame API', async () => {
    const loading = icons.ensureActionButtonAtlas();
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/action-buttons-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const frame = ACTION_BUTTON_ATLAS_FRAMES['action-capture-map']!;
    const tex = icons.actionButtonFrameTexture('action-capture-map');
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(ACTION_BUTTON_ATLAS_CELL);
    expect(tex!.height).toBe(ACTION_BUTTON_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('resolves a logical toolbelt key to its atlas frame', () => {
    // `upgrade-ship` is how HudToolbar passes the ship-upgrade action; the
    // slicer must translate it through ACTION_BUTTON_ICON_FILES.
    const sprite = icons.makeActionButtonIcon('upgrade-ship', 40);
    const frame = ACTION_BUTTON_ATLAS_FRAMES['action-ship-upgrade']!;
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('keeps the requested size when the atlas is already loaded', async () => {
    // Load the atlas once so the module's shared texture is set.
    const loading = icons.ensureActionButtonAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    // A new icon created from the already-loaded atlas must still honour its
    // requested size (regression: size was applied before the texture existed).
    const sprite = icons.makeActionButtonIcon('action-upgrade', 40);
    expect(sprite.width).toBe(40);
    expect(sprite.height).toBe(40);
    const frame = ACTION_BUTTON_ATLAS_FRAMES['action-upgrade']!;
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('loads the single packed action-buttons atlas image', () => {
    const sprite = icons.makeActionButtonIcon('action-upgrade', 40);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/action-buttons-atlas.png`);
    expect(sprite.width).toBe(40);
    expect(sprite.height).toBe(40);
  });

  it('slices the action region out of the atlas once it loads', () => {
    const sprite = icons.makeActionButtonIcon('action-upgrade', 40);
    const frame = ACTION_BUTTON_ATLAS_FRAMES['action-upgrade']!;
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(ACTION_BUTTON_ATLAS_CELL);
    expect(tex!.height).toBe(ACTION_BUTTON_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('does not touch the sprite when the image loads after the sprite was destroyed', () => {
    const sprite = icons.makeActionButtonIcon('action-upgrade', 40);
    sprite.destroy();
    const load = FakeImage.instances[0]!.onload!;
    expect(() => load.call(FakeImage.instances[0]!)).not.toThrow();
  });
});