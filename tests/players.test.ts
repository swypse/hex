import { describe, it, expect } from 'vitest';
import { TRIBES, Tribe } from '../src/game/tribes';
import { buildPlayers, buildMultiplayerPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';

describe('buildMultiplayerPlayers', () => {
  it('assigns humans indices 0..n-1 then AI, with unique tribes', () => {
    const rng = new SeededRandom(7);
    const players = buildMultiplayerPlayers(
      [
        { name: 'Host', tribe: Tribe.Villagers },
        { name: 'Guest', tribe: Tribe.Warriors },
      ],
      2,
      rng,
    );
    expect(players.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    expect(players[0]).toMatchObject({ isHuman: true, name: 'Host', tribe: Tribe.Villagers });
    expect(players[1]).toMatchObject({ isHuman: true, name: 'Guest', tribe: Tribe.Warriors });
    expect(players.slice(2).every((p) => p.isHuman === false)).toBe(true);
    const tribes = new Set(players.map((p) => p.tribe));
    expect(tribes.size).toBe(4);
  });

  it('applies each players tribe starting bonus to humans and AI alike', () => {
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    for (const p of players) {
      const info = TRIBES.find((t) => t.id === p.tribe)!;
      expect(p.resources.money).toBe(5 + (info.startMoneyBonus ?? 0));
      expect(p.skills).toEqual(info.startSkill ? [info.startSkill] : []);
      expect(p.isActive).toBe(true);
      expect(p.score).toBe(0);
    }
  });

  it('gives Villagers 15 starting money', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players[0]!.resources.money).toBe(15);
  });

  it('throws for invalid totals', () => {
    expect(() => buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Villagers }], 0, new SeededRandom(1))).toThrow();
    expect(() => buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Villagers }], 6, new SeededRandom(1))).toThrow();
  });

  it('supports up to 6 players total', () => {
    const players = buildMultiplayerPlayers(
      [
        { name: 'A', tribe: Tribe.Villagers },
        { name: 'B', tribe: Tribe.Warriors },
      ],
      4,
      new SeededRandom(3),
    );
    expect(players).toHaveLength(6);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(6);
  });

  it('seeds multiplayer players with their own known tribe', () => {
    const players = buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Cats }], 1, new SeededRandom(1));
    for (const p of players) {
      expect(p.knownTribes).toEqual([p.tribe]);
    }
  });
});

describe('buildPlayers', () => {
  it('creates a human player and 1 AI with a distinct tribe', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players).toHaveLength(2);
    expect(players[0]!).toMatchObject({ tribe: Tribe.Villagers, isHuman: true });
    expect(players[1]!.isHuman).toBe(false);
    expect(players[1]!.tribe).not.toBe(Tribe.Villagers);
  });

  it('creates 3 players with distinct tribes for 2 enemies', () => {
    const players = buildPlayers(Tribe.Warriors, 2, new SeededRandom(42));
    expect(players).toHaveLength(3);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(3);
  });

  it('creates 4 players with distinct tribes for 3 enemies', () => {
    const players = buildPlayers(Tribe.Warriors, 3, new SeededRandom(42));
    expect(players).toHaveLength(4);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(4);
    expect(players[0]!.isHuman).toBe(true);
    expect(players.slice(1).every((p) => p.isHuman === false)).toBe(true);
  });

  it('assigns unique names to every player', () => {
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(42));
    expect(players.every((p) => p.name.length > 0)).toBe(true);
    expect(new Set(players.map((p) => p.name)).size).toBe(3);
  });

  it('throws for invalid enemy counts', () => {
    expect(() => buildPlayers(Tribe.Villagers, 0, new SeededRandom(42))).toThrow();
    expect(() => buildPlayers(Tribe.Villagers, 6, new SeededRandom(42))).toThrow();
  });

  it('creates 6 players with distinct tribes for 5 enemies', () => {
    const players = buildPlayers(Tribe.Warriors, 5, new SeededRandom(42));
    expect(players).toHaveLength(6);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(6);
  });

  it('gives Villagers 15 starting money', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players[0]!.resources.money).toBe(15);
  });

  it('seeds every player with their own known tribe', () => {
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(42));
    for (const p of players) {
      expect(p.knownTribes).toEqual([p.tribe]);
    }
  });

  it('seeds every player with zeroed stats', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    for (const p of players) {
      expect(p.stats).toEqual({ killedUnits: 0, pirateKills: 0, villagesCaptured: 0, villageUpgrades: 0 });
    }
  });

  it('players start active', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players.every((p) => p.isActive)).toBe(true);
  });

  it('players start with 0 kills', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players.every((p) => p.kills === 0)).toBe(true);
  });
});

describe('AI difficulty on players', () => {
  it('stamps difficulty onto AI players in single player', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'hard');
    expect(players[0]!.difficulty).toBeUndefined();
    expect(players[1]!.difficulty).toBe('hard');
  });

  it('defaults to normal', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    expect(players[0]!.difficulty).toBeUndefined();
    expect(players[1]!.difficulty).toBe('normal');
  });

  it('stamps difficulty onto multiplayer AI players', () => {
    const players = buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Cats }], 1, new SeededRandom(1), 'easy');
    expect(players.find((p) => !p.isHuman)!.difficulty).toBe('easy');
  });
});
