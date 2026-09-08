import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventPresenter, deferredExplorerKeys, type EventHost } from '../src/controller/eventPresenter';
import { useGameStore } from '../src/store/gameStore';
import { TileType } from '../src/game/tileTypes';
import type { MapTile } from '../src/game/mapGen';
import { axialKey } from '../src/game/hex';

describe('explorer visibility', () => {
  function tile(q: number, r: number): MapTile {
    return {
      q, r, terrain: TileType.GrasslandLand, settlement: null, building: null,
      roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0],
    };
  }

  function makeHost(tiles: MapTile[] = []) {
    const mapView = vi.fn(() => null);
    const textures = vi.fn(() => null);
    const host = {
      app: vi.fn(() => ({})),
      mapRoot: vi.fn(() => new Container()),
      mapView,
      textures,
      sim: vi.fn(() => ({ map: { tiles } })),
      hiddenUnitIds: vi.fn(() => new Set<string>()),
      camera: vi.fn(() => null),
      render: vi.fn(),
      syncKnownTribes: vi.fn(),
      enqueue: vi.fn(),
      bringCellIntoView: vi.fn(),
      exploredKeysFor: vi.fn(() => new Set<string>()),
      saveGame: vi.fn(),
    } as unknown as Record<string, unknown>;
    return { host: host as unknown as EventHost, mapView, textures };
  }

  it("does not present another player's explorer scout", async () => {
    useGameStore.setState({ localPlayerIndex: 0 });
    const { host, mapView, textures } = makeHost([tile(0, 0), tile(1, 0)]);
    const presenter = new EventPresenter(host);
    await presenter.present(
      [{ type: 'explorer', q: 0, r: 0, path: [{ q: 1, r: 0 }], playerIndex: 1 }],
      new Set(),
    );
    expect(mapView).not.toHaveBeenCalled();
    expect(textures).not.toHaveBeenCalled();
  });

  it('deferred explorer fog is restored for the owning player after presenting', async () => {
    useGameStore.setState({ localPlayerIndex: 0 });
    const tiles = [tile(0, 0), tile(1, 0)];
    const { host } = makeHost(tiles);
    const presenter = new EventPresenter(host);
    await presenter.present(
      [{ type: 'explorer', q: 0, r: 0, path: [{ q: 1, r: 0 }], playerIndex: 0 }],
      new Set(),
    );
    expect(tiles[0]!.exploredBy).toEqual([0]);
    expect(tiles[1]!.exploredBy).toEqual([0]);
  });
});

describe('deferredExplorerKeys', () => {
  it('defers every explorer cell the player had not explored before the bonus', () => {
    const pre = new Set<string>();
    expect(deferredExplorerKeys([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], pre))
      .toEqual(new Set(['0,0', '1,0', '2,0']));
  });

  it('does not defer explorer cells the player already explored', () => {
    const pre = new Set([axialKey({ q: 1, r: 0 }), axialKey({ q: 0, r: 0 })]);
    expect(deferredExplorerKeys([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], pre))
      .toEqual(new Set(['2,0']));
  });
});
