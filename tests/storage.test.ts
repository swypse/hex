import { describe, it, expect, beforeEach } from 'vitest';
import { createSaveRepository } from '../src/storage/saveGame';
import { type StorageService } from '../src/storage/storageService';
import { type GameStateSnapshot } from '../src/game/state';
import { TileType } from '../src/game/tileTypes';

class FakeStorage implements StorageService {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function sampleSnapshot(): GameStateSnapshot {
  return {
    map: {
      radius: 1,
      tiles: [{ q: 0, r: 0, terrain: TileType.GrasslandLand, settlement: null, unit: null, ownedBy: null, claimedByVillage: null, building: null, exploredBy: [0] }],
      spawns: [],
    },
    players: [{ index: 0, tribe: 0, isHuman: true, name: 'P', resources: { wood: 3, stone: 2, money: 5, ore: 0 }, score: 0, kills: 0, skills: [], isActive: true }],
    mode: 'capture',
    turn: 3,
    currentPlayerIndex: 0,
    gameOver: false,
    winnerIndex: null,
    expectedTurns: 15,
    bonusAwarded: false,
  };
}

describe('saveRepository', () => {
  let storage: FakeStorage;
  let repo: ReturnType<typeof createSaveRepository>;

  beforeEach(() => {
    storage = new FakeStorage();
    repo = createSaveRepository(storage);
  });

  it('round-trips a snapshot', () => {
    repo.save(sampleSnapshot());
    const loaded = repo.load();
    expect(loaded?.turn).toBe(3);
    expect(loaded?.players[0]!.name).toBe('P');
    expect(loaded?.map.tiles[0]!.q).toBe(0);
    expect(loaded?.mode).toBe('capture');
  });

  it('hasSave reflects save and clear', () => {
    expect(repo.hasSave()).toBe(false);
    repo.save(sampleSnapshot());
    expect(repo.hasSave()).toBe(true);
    repo.clear();
    expect(repo.hasSave()).toBe(false);
  });

  it('load returns null when nothing is saved', () => {
    expect(repo.load()).toBeNull();
  });

  it('load returns null on corrupt data', () => {
    storage.setItem('hex-save-v1', '{not json');
    expect(repo.load()).toBeNull();
  });
});
