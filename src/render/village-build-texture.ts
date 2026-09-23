import { Application, Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { Settlement, SettlementBuild, VillageBlockVariant } from '../game/map-gen';
import { villageColumnBlocks, VillageBuildSide } from '../game/village-build';
import {
  ensureVillageAquaAtlas,
  ensureVillageBarbariansAtlas,
  ensureVillageCatsAtlas,
  ensureVillageForestAtlas,
  ensureVillageSandAtlas,
  ensureVillageVillagersAtlas,
  ensureVillageWarriorsAtlas,
  villageAquaFrameTexture,
  villageBarbarianFrameTexture,
  villageCatsFrameTexture,
  villageForestFrameTexture,
  villageSandFrameTexture,
  villageVillagerFrameTexture,
  villageWarriorFrameTexture,
} from './village-build-atlas';
import type { TileTexture } from './texture-factory';

export const VILLAGE_BUILD_BLOCK_W = 90;
export const VILLAGE_BUILD_BLOCK_H = 90;
/** Vertical step between stacked blocks: an upper block overlaps the block
 *  below it by 62px (90 - 28). */
export const VILLAGE_BUILD_BLOCK_STEP = 28;
/** Composite width: leftmost column foot at x 0 and the rightmost at x 100
 *  (100 + a 90-wide block) → 190. */
export const VILLAGE_BUILD_WIDTH = 190;

export interface VillageBuildFrame {
  x: number;
  y: number;
  frameKey: string;
}

type BuildSide = VillageBuildSide;

interface ColumnLayout {
  /** Which `build` array holds this column's below-top variants. */
  side: BuildSide;
  /** Index into that array. */
  column: number;
  x: number;
  y: number;
}

/** Column anchors in draw order, back → front. `y` is the column's GROUND:
 *  the bottom of its lowest block always sits at `y + BLOCK_H`, so columns
 *  with more blocks rise higher while the ground line stays put. The village
 *  is a 3∶2 front staircase (left 1–3, right 1–2) with a back row (left 1–2,
 *  right 1) rendering behind it. Front-most column is left 3 (drawn last/on
 *  top); back-most is back-left 2 (drawn first) so it renders below the
 *  back-right column; within a column blocks emit bottom-first so the upper
 *  block covers the one below. */
const COLUMN_LAYOUT: ColumnLayout[] = [
  { side: 'lBack', column: 1, x: 50, y: -20 },
  { side: 'rBack', column: 0, x: 75, y: -10 },
  { side: 'r', column: 1, x: 100, y: 0 },
  { side: 'r', column: 0, x: 75, y: 10 },
  { side: 'lBack', column: 0, x: 25, y: -10 },
  { side: 'l', column: 0, x: 0, y: 0 },
  { side: 'l', column: 1, x: 25, y: 10 },
  { side: 'l', column: 2, x: 50, y: 20 },
];

function layoutExtent(): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = COLUMN_LAYOUT.map((c) => c.x);
  const ys = COLUMN_LAYOUT.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function villageBuildHeight(level: number): number {
  let top = Infinity;
  let bottom = -Infinity;
  for (const col of COLUMN_LAYOUT) {
    const blocks = villageColumnBlocks(col.side, col.column, level);
    // All columns rest on their own ground line col.y + BLOCK_H; the stack
    // grows upward, so only the top moves when a column gains blocks.
    top = Math.min(top, col.y - (blocks - 1) * VILLAGE_BUILD_BLOCK_STEP);
    bottom = Math.max(bottom, col.y + VILLAGE_BUILD_BLOCK_H);
  }
  return bottom - top;
}

function villageBuildWidth(): number {
  const { minX, maxX } = layoutExtent();
  return maxX + VILLAGE_BUILD_BLOCK_W - minX;
}

/** Resolves the below-top variant for a column block (j = 0 is the block
 *  directly under the top), falling back to 'm1' for missing data. */
function variantAt(build: SettlementBuild | undefined, side: BuildSide, column: number, j: number): VillageBlockVariant {
  return build?.[side]?.[column]?.[j] ?? 'm1';
}

/** Ordered list of every block texture in draw order plus the composite size.
 *  Pure: no Pixi, no side effects — fully unit-testable. The top block of a
 *  column is always `t1` and each below-top block is an `m1..m4` variant
 *  (falling back to `m1`); the tribe atlas is chosen by the composite service,
 *  so frame keys carry no tribe prefix. */
export function villageBuildFrames(
  level: number,
  build?: SettlementBuild,
): { frames: VillageBuildFrame[]; width: number; height: number } {
  const frames: VillageBuildFrame[] = [];
  for (const col of COLUMN_LAYOUT) {
    const blocks = villageColumnBlocks(col.side, col.column, level);
    // Emit the lowest block first so every upper block in the column renders
    // above it (the composite layers by array order, later = on top). The
    // ground line is col.y — the bottom block's top — and each block above
    // sits one STEP higher.
    for (let i = blocks - 1; i >= 0; i--) {
      const frameKey = i === 0 ? 't1' : variantAt(build, col.side, col.column, i - 1);
      frames.push({ x: col.x, y: col.y - (blocks - 1 - i) * VILLAGE_BUILD_BLOCK_STEP, frameKey });
    }
  }
  return { frames, width: villageBuildWidth(), height: villageBuildHeight(level) };
}

/** Cache key for a composite look: level + every column's variants. */
export function villageBuildSignature(level: number, build?: SettlementBuild): string {
  if (!build) return `${level}|-`;
  const colSig = (cols: VillageBlockVariant[][] | undefined): string =>
    (cols ?? []).map((c) => c.join('')).join(';');
  return `${level}|${colSig(build.l)}|${colSig(build.r)}|${colSig(build.lBack)}|${colSig(build.rBack)}`;
}

/** Fixed distance (art px) of the village ground line below the hex-center
 *  anchor, matching the level-1 centered look (height / 2). Holding the
 *  ground fixed means the bottom point of the village never moves relative
 *  to the hex as the village levels up — only the top rises. */
const VILLAGE_BUILD_GROUND_OFFSET = villageBuildHeight(1) / 2;

/** Vertical anchor for the baked composite. All columns rest on their own
 *  (level-independent) ground line, so the composite bottom is always the
 *  same art y; this anchor pins that bottom `VILLAGE_BUILD_GROUND_OFFSET`
 *  below the hex center for every level. */
export function villageBuildAnchorY(height: number): number {
  return 1 - VILLAGE_BUILD_GROUND_OFFSET / height;
}

/** A baked composite texture plus how many renderers currently display it.
 *  When the last holder releases, the texture is destroyed and evicted. */
export interface VillageBuildTextureCacheEntry {
  tile: TileTexture;
  refs: number;
}

/** Reference-counted cache for baked composite village textures, keyed by
 *  `villageBuildSignature`. Textures are shared: many settlements of the same
 *  tribe + level + variants render the same one. The count keeps a texture
 *  alive exactly as long as some tile view holds it, so a superseded texture
 *  (e.g. the previous level after an upgrade) is destroyed + evicted the moment
 *  the last tile stops using it — releasing its backing canvas/GPU memory ASAP. */
export class VillageBuildTextureCache {
  private readonly entries = new Map<string, VillageBuildTextureCacheEntry>();
  private readonly signatureByTexture = new Map<Texture, string>();

  get size(): number {
    return this.entries.size;
  }

  /** The cached texture for a signature, or null when not baked yet. */
  tileFor(signature: string): TileTexture | null {
    return this.entries.get(signature)?.tile ?? null;
  }

  /** Records a freshly baked texture and starts it at zero references. */
  register(signature: string, tile: TileTexture): void {
    this.entries.set(signature, { tile, refs: 0 });
    this.signatureByTexture.set(tile.texture, signature);
  }

  /** Marks one more holder of a texture this cache owns; no-op otherwise. */
  acquire(texture: Texture): void {
    const entry = this.entryFor(texture);
    if (entry) entry.refs++;
  }

  /** Marks one fewer holder; at zero the texture is destroyed and evicted. */
  release(texture: Texture): void {
    const signature = this.signatureByTexture.get(texture);
    if (!signature) return;
    const entry = this.entries.get(signature);
    if (!entry) return;
    if (--entry.refs > 0) return;
    this.entries.delete(signature);
    this.signatureByTexture.delete(texture);
    entry.tile.texture.destroy(true);
  }

  /** Destroys every cached texture (TextureSet teardown). */
  destroyAll(): void {
    for (const entry of this.entries.values()) entry.tile.texture.destroy(true);
    this.entries.clear();
    this.signatureByTexture.clear();
  }

  private entryFor(texture: Texture): VillageBuildTextureCacheEntry | undefined {
    const signature = this.signatureByTexture.get(texture);
    return signature ? this.entries.get(signature) : undefined;
  }
}

/** TEXTURE_OWNERS maps each baked texture back to the service that baked it,
 *  so the renderer can release/acquire a texture without knowing which tribe's
 *  service produced it (an owner tribe can change on capture). Weak so finished
 *  textures don't keep a dead service alive. */
const textureOwners = new WeakMap<Texture, { service: VillageBuildTextureService; signature: string }>();

/** Renders a texture that a tile view just adopted. No-op for textures this
 *  service did not bake (static village/free textures are owned elsewhere). */
export function acquireVillageBuildTexture(texture: Texture): void {
  const owner = textureOwners.get(texture);
  if (owner) owner.service.cache.acquire(texture);
}

/** Releases a texture a tile view stopped using (swapped or removed). The
 *  texture is destroyed when no tile view holds it. No-op for non-composite
 *  textures. */
export function releaseVillageBuildTexture(texture: Texture): void {
  const owner = textureOwners.get(texture);
  if (owner) owner.service.cache.release(texture);
}

/** Bakes and caches one composite village texture per distinct look. The map
 *  renderer keeps its single `villageSprite`; this only supplies the texture.
 *  Cached by `villageBuildSignature`, so a village re-bakes only when its
 *  level or recorded variants change. Baked textures are reference-counted
 *  (see `VillageBuildTextureCache`); every tile view that displays one must
 *  call `acquireVillageBuildTexture` and `releaseVillageBuildTexture`. */
export class VillageBuildTextureService {
  readonly cache = new VillageBuildTextureCache();
  private readonly frameTexture: (frameKey: string) => Texture | null;
  private readonly ensureLoadedPromise: Promise<void>;

  constructor(
    private readonly app: Application,
    private readonly hexSize: number,
    private readonly prefix: string = 'villagers',
  ) {
    if (prefix === 'warriors') {
      this.ensureLoadedPromise = ensureVillageWarriorsAtlas();
      this.frameTexture = villageWarriorFrameTexture;
    } else if (prefix === 'cats') {
      this.ensureLoadedPromise = ensureVillageCatsAtlas();
      this.frameTexture = villageCatsFrameTexture;
    } else if (prefix === 'aqua') {
      this.ensureLoadedPromise = ensureVillageAquaAtlas();
      this.frameTexture = villageAquaFrameTexture;
    } else if (prefix === 'forest') {
      this.ensureLoadedPromise = ensureVillageForestAtlas();
      this.frameTexture = villageForestFrameTexture;
    } else if (prefix === 'sand') {
      this.ensureLoadedPromise = ensureVillageSandAtlas();
      this.frameTexture = villageSandFrameTexture;
    } else if (prefix === 'barbarians') {
      this.ensureLoadedPromise = ensureVillageBarbariansAtlas();
      this.frameTexture = villageBarbarianFrameTexture;
    } else {
      this.ensureLoadedPromise = ensureVillageVillagersAtlas();
      this.frameTexture = villageVillagerFrameTexture;
    }
  }

  ensureLoaded(): Promise<void> {
    return this.ensureLoadedPromise;
  }

  tileTexture(settlement: Settlement): TileTexture | null {
    const level = settlement.level;
    const signature = villageBuildSignature(level, settlement.build);
    const cached = this.cache.tileFor(signature);
    if (cached) return cached;
    const { frames, width, height } = villageBuildFrames(level, settlement.build);
    if (frames.length === 0) return null;
    const blockTextures = frames.map((f) => this.frameTexture(f.frameKey));
    if (blockTextures.some((t) => t === null)) return null;
    // The composite is scaled so its art width equals the hex width; the
    // anchor pins the village ground a fixed offset below the hex center, so
    // the bottom never drifts as the village levels up.
    const scale = (Math.sqrt(3) * this.hexSize) / width;
    const container = new Container();
    container.sortableChildren = true;
    frames.forEach((frame, i) => {
      const sprite = new Sprite(blockTextures[i]!);
      sprite.anchor.set(0, 0);
      sprite.scale.set(scale);
      sprite.position.set(frame.x * scale, frame.y * scale);
      sprite.zIndex = i;
      container.addChild(sprite);
    });
    const texture = this.app.renderer.generateTexture({ target: container, resolution: 1 });
    container.destroy({ children: true });
    const tile: TileTexture = { texture, anchorY: villageBuildAnchorY(height) };
    this.cache.register(signature, tile);
    textureOwners.set(tile.texture, { service: this, signature });
    return tile;
  }

  /** Destroys every texture this service has baked (game teardown). */
  destroy(): void {
    this.cache.destroyAll();
  }
}
