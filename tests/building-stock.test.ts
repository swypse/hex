import { describe, expect, it } from 'vitest';
import { BuildingKind, GameMode } from '@enums';
import { buildingGains, buildingIncome, storeBuildingGains } from '../src/game/economy/buildings';
import { BUILDING_STOCK_CAPACITY } from '../src/game/economy/building-stock';
import { canAffordAt, networkStock, payAt, readStock, totalStock } from '../src/game/economy/stock';
import { type GameMap, type MapTile } from '../src/game/map/map-gen';
import { TileType } from '../src/game/map/tile-types';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt } from './helpers/test-map';

/** One village at (0,0) with a sawmill at (1,0) (forests next to it) and a mine at (-1,0). */
function scene(): { map: GameMap; village: MapTile; sawmill: MapTile; mine: MapTile; player: ReturnType<typeof buildPlayers>[number] } {
  const map = makeTestMap(4);
  const village = tileAt(map, 0, 0)!;
  village.settlement = { owner: 0, level: 1, captureReady: false, stock: { wood: 0, stone: 0, ore: 0, food: 0 } };
  village.ownedBy = 0;
  const sawmill = tileAt(map, 1, 0)!;
  sawmill.building = { kind: BuildingKind.SAWMILL, level: 1 };
  sawmill.ownedBy = 0;
  sawmill.claimedByVillage = { q: 0, r: 0 };
  tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
  tileAt(map, 1, 1)!.terrain = TileType.GrasslandForest;
  const mine = tileAt(map, -1, 0)!;
  mine.terrain = TileType.GrasslandMountain;
  mine.building = { kind: BuildingKind.MINE, level: 1 };
  mine.ownedBy = 0;
  mine.claimedByVillage = { q: 0, r: 0 };
  const player = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1))[0]!;
  player.resources = { money: 100 };
  return { map, village, sawmill, mine, player };
}

describe('building stock capacity', () => {
  it('a sawmill holds 20 wood, a mine 20 stone and 20 ore', () => {
    expect(BUILDING_STOCK_CAPACITY[BuildingKind.SAWMILL]).toEqual({ wood: 20 });
    expect(BUILDING_STOCK_CAPACITY[BuildingKind.MINE]).toEqual({ stone: 20, ore: 20 });
  });

  it('collects its yield each round and stops at the capacity', () => {
    const { map, sawmill, mine, player } = scene();
    sawmill.building!.wood = 19;
    mine.building!.stone = 19;
    mine.building!.ore = 20;
    const gains = buildingGains(map, player);
    const s = gains.find((g) => g.tile === sawmill)!;
    const m = gains.find((g) => g.tile === mine)!;
    expect(s.wood).toBe(1); // yield 2 (two forests), room 1
    expect(m.stone).toBe(1);
    expect(m.ore).toBe(0); // full
    storeBuildingGains(gains);
    expect(sawmill.building!.wood).toBe(20);
    expect(mine.building!.stone).toBe(20);
    expect(mine.building!.ore).toBe(20);
    // A full building collects nothing and the projected income says so.
    expect(buildingGains(map, player).every((g) => g.wood + g.stone + g.ore === 0)).toBe(true);
    expect(buildingIncome(map, player)).toEqual({ wood: 0, stone: 0, ore: 0 });
  });

  it('what buildings hold counts for the network and the player totals', () => {
    const { map, village, sawmill, mine } = scene();
    sawmill.building!.wood = 7;
    mine.building!.stone = 3;
    mine.building!.ore = 2;
    village.settlement!.stock = { wood: 5, stone: 0, ore: 0, food: 4 };
    expect(readStock(village)).toEqual({ wood: 5, stone: 0, ore: 0, food: 4 });
    expect(networkStock(map, village)).toEqual({ wood: 12, stone: 3, ore: 2, food: 4 });
    expect(totalStock(map, 0)).toEqual({ wood: 12, stone: 3, ore: 2, food: 4 });
  });

  it('payments draw from buildings first, then from the village', () => {
    const { map, village, sawmill, player } = scene();
    sawmill.building!.wood = 6;
    village.settlement!.stock = { wood: 10, stone: 0, ore: 0, food: 0 };
    const cost = { wood: 9, stone: 0, money: 0, ore: 0, food: 0 };
    expect(canAffordAt(map, player, village, cost)).toBe(true);
    expect(payAt(map, player, village, cost)).toBe(true);
    expect(sawmill.building!.wood).toBe(0);
    expect(readStock(village).wood).toBe(7);
    // The pool is 7 wood now: 8 is not affordable and changes nothing.
    expect(payAt(map, player, village, { ...cost, wood: 8 })).toBe(false);
    expect(readStock(village).wood).toBe(7);
  });

  it('a destroyed sawmill takes its stock with it; a building outside the network does not pay', () => {
    const { map, village, sawmill, player } = scene();
    sawmill.building!.wood = 15;
    expect(canAffordAt(map, player, village, { wood: 15, stone: 0, money: 0, ore: 0, food: 0 })).toBe(true);
    // Claimed by another village: not part of this network's pool.
    sawmill.claimedByVillage = { q: 3, r: 3 };
    expect(canAffordAt(map, player, village, { wood: 1, stone: 0, money: 0, ore: 0, food: 0 })).toBe(false);
    sawmill.claimedByVillage = { q: 0, r: 0 };
    sawmill.building = null;
    expect(networkStock(map, village).wood).toBe(0);
  });
});

describe('simulated round end', () => {
  it('keeps income events to what was actually stored', async () => {
    const { Simulator } = await import('../src/game/simulator');
    const { CommandType, GameEventType } = await import('@enums');
    const { map, sawmill } = scene();
    sawmill.building!.wood = 19;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.resources = { money: 100 };
    const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5, disablePirates: true });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: CommandType.END_TURN });
    const income = sim.drainEvents().filter((e) => e.type === GameEventType.INCOME && 'wood' in e && e.q === 1 && e.r === 0);
    expect(sawmill.building!.wood).toBe(20);
    expect(income).toHaveLength(1);
    expect((income[0] as { wood: number }).wood).toBe(1);
  });
});
