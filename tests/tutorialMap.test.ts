import { describe, expect, it } from 'vitest';
import { axialKey, hexDistance } from '../src/game/hex';
import { isForestType, isLandType, isMountainType, isWaterType } from '../src/game/tileTypes';
import { tileAt } from '../src/game/selection';
import { upgradeVillage } from '../src/game/village';
import {
  TUTORIAL_CAPITAL, TUTORIAL_RADIUS, TUTORIAL_START_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_ENEMY_PLAYER, buildTutorialMap, buildTutorialPlayers,
} from '../src/game/tutorial/tutorialMap';

describe('tutorial map', () => {
  it('is a radius-4 land disc with no water and unique tiles', () => {
    const map = buildTutorialMap();
    expect(map.radius).toBe(TUTORIAL_RADIUS);
    const keys = new Set(map.tiles.map((t) => axialKey(t)));
    expect(keys.size).toBe(map.tiles.length);
    for (const t of map.tiles) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(TUTORIAL_RADIUS);
      expect(isWaterType(t.terrain)).toBe(false);
    }
  });

  it('places an owned level-1 capital village with a warrior on it', () => {
    const map = buildTutorialMap();
    const cap = tileAt(map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    expect(cap.settlement?.owner).toBe(TUTORIAL_HUMAN);
    expect(cap.settlement?.level).toBe(1);
    expect(cap.settlement?.capital).toBe(true);
    expect(cap.ownedBy).toBe(TUTORIAL_HUMAN);
    expect(cap.unit?.id).toBe(TUTORIAL_START_WARRIOR_ID);
    expect(cap.unit?.owner).toBe(TUTORIAL_HUMAN);
    expect(cap.unit?.type).toBe('warrior');
  });

  it('claims the level-1 radius so the sawmill tile is owned land next to a forest', () => {
    const map = buildTutorialMap();
    const radius1 = map.tiles.filter((t) => hexDistance(t, TUTORIAL_CAPITAL) <= 1);
    expect(radius1.length).toBe(7);
    for (const t of radius1) expect(t.ownedBy).toBe(TUTORIAL_HUMAN);
    const sawmillTile = tileAt(map, 0, 1)!;
    expect(sawmillTile.ownedBy).toBe(TUTORIAL_HUMAN);
    expect(isLandType(sawmillTile.terrain)).toBe(true);
    expect(sawmillTile.settlement).toBeNull();
    const adjacentForest = map.tiles.some(
      (t) => isForestType(t.terrain) && hexDistance(t, sawmillTile) === 1,
    );
    expect(adjacentForest).toBe(true);
  });

  it('places one grassland mountain at the future mine tile, inside claim radius 2', () => {
    const map = buildTutorialMap();
    const mine = tileAt(map, 2, -2)!;
    expect(isMountainType(mine.terrain)).toBe(true);
    expect(hexDistance(mine, TUTORIAL_CAPITAL)).toBe(2);
    // After upgrading to level 2 the claim pass must own it.
    upgradeVillage(map, tileAt(map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!);
    expect(tileAt(map, 2, -2)!.ownedBy).toBe(TUTORIAL_HUMAN);
  });

  it('builds one human (rich, no skills) and one inactive dummy player', () => {
    const players = buildTutorialPlayers();
    const human = players[0]!;
    const dummy = players[1]!;
    expect(human.index).toBe(TUTORIAL_HUMAN);
    expect(human.isHuman).toBe(true);
    expect(human.isActive).toBe(true);
    expect(human.skills).toEqual([]);
    expect(human.resources).toEqual({ money: 70, wood: 20, stone: 20, ore: 5 });
    expect(dummy.index).toBe(TUTORIAL_ENEMY_PLAYER);
    expect(dummy.isHuman).toBe(false);
    expect(dummy.isActive).toBe(false);
  });
});
