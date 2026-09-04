import { describe, expect, it } from 'vitest';
import { axialKey, hexDistance } from '../src/game/hex';
import { isLandType, isMountainType, isWaterType, TileType } from '../src/game/tileTypes';
import { tileAt } from '../src/game/selection';
import { upgradeVillage } from '../src/game/village';
import {
  TUTORIAL_CAPITAL, TUTORIAL_RADIUS, TUTORIAL_START_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_ENEMY_PLAYER, TUTORIAL_PORT_TILE,
  TUTORIAL_WATER_TILES, buildTutorialMap, buildTutorialPlayers,
} from '../src/game/tutorial/tutorialMap';

describe('tutorial map', () => {
  it('is a radius-5 disc of unique tiles', () => {
    const map = buildTutorialMap();
    expect(map.radius).toBe(TUTORIAL_RADIUS);
    const keys = new Set(map.tiles.map((t) => axialKey(t)));
    expect(keys.size).toBe(map.tiles.length);
    for (const t of map.tiles) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(TUTORIAL_RADIUS);
    }
  });

  it('puts an east sea with a water tile at distance <= 2 of the capital', () => {
    const map = buildTutorialMap();
    const waters = map.tiles.filter((t) => isWaterType(t.terrain));
    expect(waters.length).toBeGreaterThanOrEqual(TUTORIAL_WATER_TILES.length);
    for (const w of TUTORIAL_WATER_TILES) {
      expect(isWaterType(tileAt(map, w.q, w.r)!.terrain)).toBe(true);
    }
    expect(hexDistance(TUTORIAL_PORT_TILE, TUTORIAL_CAPITAL)).toBeLessThanOrEqual(2);
    expect(isWaterType(tileAt(map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!.terrain)).toBe(true);
  });

  it('stretches the sea to the map edge and several rows up and down', () => {
    const map = buildTutorialMap();
    const waters = map.tiles.filter((t) => isWaterType(t.terrain));
    // Touches the outermost ring (reaches the map edge).
    expect(waters.some((t) => hexDistance({ q: 0, r: 0 }, t) === TUTORIAL_RADIUS)).toBe(true);
    // Spreads across rows above and below the village row.
    const rows = new Set(waters.map((t) => t.r));
    expect(rows.has(-1)).toBe(true);
    expect(rows.has(1)).toBe(true);
    expect(rows.has(-2)).toBe(true);
    expect(rows.has(2)).toBe(true);
    expect(waters.length).toBeGreaterThanOrEqual(15);
  });

  it('keeps the capital, warrior, sawmill and mine tiles usable', () => {
    const map = buildTutorialMap();
    const cap = tileAt(map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    expect(cap.settlement?.owner).toBe(TUTORIAL_HUMAN);
    expect(cap.unit?.id).toBe(TUTORIAL_START_WARRIOR_ID);
    // Port tile is claimed by the human from level 1 (distance 1).
    expect(tileAt(map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r)!.ownedBy).toBe(TUTORIAL_HUMAN);
    // Sawmill land (0,1) stays land next to a forest (-1,1).
    const sawmill = tileAt(map, 0, 1)!;
    expect(isLandType(sawmill.terrain)).toBe(true);
    expect(map.tiles.some((t) => isForestTypeFor(t) && hexDistance(t, sawmill) === 1)).toBe(true);
    // Mine mountain (2,-2) becomes owned after the level-2 claim.
    const mine = tileAt(map, 2, -2)!;
    expect(isMountainType(mine.terrain)).toBe(true);
    upgradeVillage(map, cap);
    expect(tileAt(map, 2, -2)!.ownedBy).toBe(TUTORIAL_HUMAN);
  });

  it('builds one human (rich) and one inactive dummy player', () => {
    const players = buildTutorialPlayers();
    const human = players[0]!;
    const dummy = players[1]!;
    expect(human.isHuman).toBe(true);
    expect(human.isActive).toBe(true);
    expect(human.skills).toEqual([]);
    expect(human.resources).toEqual({ money: 250, wood: 60, stone: 60, ore: 30 });
    expect(dummy.isHuman).toBe(false);
    expect(dummy.isActive).toBe(false);
  });
});

function isForestTypeFor(t: { terrain: TileType }): boolean {
  return t.terrain === TileType.GrasslandForest
    || t.terrain === TileType.DesertForest
    || t.terrain === TileType.TundraForest
    || t.terrain === TileType.TaigaForest
    || t.terrain === TileType.RainforestForest;
}
