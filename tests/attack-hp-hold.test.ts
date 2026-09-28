import { describe, it, expect, vi } from 'vitest';
import { EventPresenter, type EventHost } from '../src/controller/event-presenter';
import type { GameEvent } from '../src/game/events';
import type { MapTile } from '../src/game/map-gen';
import { TileType } from '../src/game/tile-types';
import { useGameStore } from '../src/store/game-store';

function tile(q: number, r: number): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
    roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
  };
}

function missedAttack(attackerId: string, targetId: string, from: [number, number], to: [number, number], attackerHp: number, targetHp: number): GameEvent {
  return {
    type: 'attack',
    attackerId,
    targetId,
    attackerIndex: 1,
    targetIndex: 0,
    attackerTile: { q: from[0], r: from[1] },
    targetTile: { q: to[0], r: to[1] },
    attackerDamage: 0,
    targetDamage: 0,
    missed: true,
    attackerDied: false,
    targetDied: false,
    attackerPre: { type: 'warrior', owner: 1, hp: attackerHp },
    targetPre: { type: 'warrior', owner: 0, hp: targetHp },
  };
}

describe('attack hp holds', () => {
  it('keeps the pre-batch hp of a unit whose own attack has not played yet', async () => {
    const tiles = [tile(0, 0), tile(1, 0), tile(2, 0), tile(3, 0)];
    const holds = new Map<string, number>();
    const holdsAtLunge: Map<string, number>[] = [];
    const clearSpy = vi.fn(() => holds.clear());
    const mapView = {
      setHpOverride: (id: string, hp: number | null) => {
        if (hp === null) holds.delete(id);
        else holds.set(id, hp);
      },
      clearHpOverrides: clearSpy,
      setUnitOverrides: () => {},
      setUnitFacing: () => {},
      lungeUnit: async () => {
        holdsAtLunge.push(new Map(holds));
      },
    };
    const host = {
      app: () => ({}),
      sim: () => ({ map: { tiles } }),
      mapView: () => mapView,
      hiddenUnitIds: () => new Set<string>(),
      camera: () => ({ scale: 1 }),
      render: () => {},
      syncKnownTribes: () => {},
      bringCellIntoView: async () => {},
      exploredKeysFor: () => new Set<string>(),
    } as unknown as EventHost;
    useGameStore.setState({ localPlayerIndex: 0 });

    const presenter = new EventPresenter(host);
    vi.spyOn(presenter as never, 'spawnHpText').mockImplementation(() => {});
    vi.spyOn(presenter as never, 'spawnDeath').mockImplementation(() => {});

    // Attack 1 (a1 -> b) misses; attack 2 (c -> b) comes later in the same batch.
    // c is damaged in the final sim state, so its real hp differs from its pre hp.
    const events: GameEvent[] = [
      missedAttack('a1', 'b', [0, 0], [1, 0], 50, 50),
      missedAttack('c', 'b', [3, 0], [2, 0], 30, 50),
    ];
    await presenter.present(events, new Set());

    expect(holdsAtLunge).toHaveLength(2);
    // While attack 1 plays, both bars of attack 2 still show their pre hp.
    expect(holdsAtLunge[0]!.get('c')).toBe(30);
    expect(holdsAtLunge[0]!.get('b')).toBe(50);
    // ...and attack 1 finishing must not wipe attack 2's hold.
    expect(holdsAtLunge[1]!.get('c')).toBe(30);
    // The holds are never wiped mid-batch; only the final cleanup clears them.
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
