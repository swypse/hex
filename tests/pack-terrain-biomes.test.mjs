import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finalizeAtlas, atlasPngsMatch } from '../tools/packSkills.mjs';
import {
  TERRAIN_BIOMES,
  biomeOrder,
  biomeAtlasUrl,
  generateBiomeAtlas,
} from '../tools/packTerrainBiomes.mjs';

describe('terrain biome atlas generation', () => {
  for (const biome of TERRAIN_BIOMES) {
    describe(biome, () => {
      it('packs every source PNG exactly once, all spring variants present', () => {
        const order = biomeOrder(biome);
        const { frames } = generateBiomeAtlas(biome);
        expect(Object.keys(frames).sort()).toEqual(order);
        for (const kind of ['land', 'forest', 'mountain']) {
          expect(frames[`${biome}-${kind}-spring`]).not.toBeUndefined();
        }
      });

      it('is deterministic', () => {
        const a = generateBiomeAtlas(biome);
        const b = generateBiomeAtlas(biome);
        expect(Buffer.compare(a.png, b.png)).toBe(0);
      });

      it('keeps the committed atlas PNG in sync with the packer output', async () => {
        const committed = readFileSync(fileURLToPath(biomeAtlasUrl(biome)));
        const final = await finalizeAtlas(generateBiomeAtlas(biome).png);
        expect(atlasPngsMatch(committed, final)).toBe(true);
      });
    });
  }
});
