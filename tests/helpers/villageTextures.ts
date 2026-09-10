import { Tribe } from '../../src/game/tribes';
import { type TileTexture } from '../../src/render/textureFactory';

/** Builds a per-tribe village texture record where every tribe shares the
 *  given level-1 and level-2 textures. */
export function villageTexturesForTest(
  level1: TileTexture,
  level2: TileTexture,
): Record<Tribe, { level1: TileTexture; level2: TileTexture }> {
  const out = {} as Record<Tribe, { level1: TileTexture; level2: TileTexture }>;
  for (const tribe of [Tribe.Villagers, Tribe.Warriors, Tribe.Barbarians, Tribe.Cats, Tribe.Forest, Tribe.Aqua]) {
    out[tribe] = { level1, level2 };
  }
  return out;
}