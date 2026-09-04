# P2P Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the game be played by multiple human players on separate machines (plus AI) with no server, using a PeerJS WebRTC star topology where the host runs the authoritative simulation.

**Architecture:** Extract the whole simulation (map, players, combat RNG, AI turns, income, win checks) out of `GameController` into a synchronous `Simulator` that emits presentation events. The host owns the Simulator and broadcasts full-state snapshots + event batches to clients over PeerJS data channels; clients hold a `Simulator`-constructed mirror, render it, and send commands. Single player uses the exact same Simulator + presentation path.

**Tech Stack:** TypeScript, PixiJS, React, Zustand, Vite, Vitest, and `peerjs` (WebRTC with the free public signaling broker).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-p2p-multiplayer-design.md` — read it before starting.
- Verdict: `npm run typecheck` and `npm test` must pass after every task; `npm run build` must pass after tasks that touch controller/renderer.
- Do not change game-mechanics logic in `src/game/*` files other than `players.ts` (additive only): `combat`, `spawn`, `capture`, `skills`, `buildings`, `score`, `explore`, `ai`, `mapGen`, `hex`, `ship`, `village`, `resources`, `claim`, `tileTypes` stay untouched.
- The human player must remain player 0 in single-player mode (existing behavior). `localPlayerIndex` from the store replaces every hardcoded `players[0]` / `owner === 0` reference.
- Sync model: full-state snapshot after every command batch + a presentation-event list. Clients never re-implement mutation logic.
- New deps allowed: `peerjs` only.
- UI text style: existing screens use inline styles and `className="screen"`; match the surrounding code (no new CSS framework).

---

### Task 1: Event & snapshot types, install peerjs

**Files:**
- Create: `src/game/events.ts`
- Create: `src/game/state.ts`
- Test: `tests/events.test.ts`
- Modify: `package.json` (via `npm install peerjs`)

**Interfaces:**
- Produces: `GameEvent` union, `GameStateSnapshot` interface (used by every later task).

- [ ] **Step 1: Install peerjs**

Run: `npm install peerjs`
Expected: `peerjs` appears in `package.json` dependencies.

- [ ] **Step 2: Write `src/game/events.ts`**

```ts
import { SkillId } from './skills';
import { UnitType } from './units';

export type BuildingKind = 'factory' | 'mine' | 'port';

export interface Axial {
  q: number;
  r: number;
}

export type GameEvent =
  | { type: 'unitMoved'; unitId: string; from: Axial; path: Axial[]; to: Axial }
  | { type: 'attack'; attackerId: string; targetId: string; attackerDamage: number; targetDamage: number; missed: boolean; attackerDied: boolean; targetDied: boolean }
  | { type: 'spawned'; unitType: UnitType; q: number; r: number; playerIndex: number }
  | { type: 'captured'; q: number; r: number; oldOwner: number | null; newOwner: number; ownerDied: boolean }
  | { type: 'villageUpgraded'; q: number; r: number; level: number; playerIndex: number }
  | { type: 'built'; kind: BuildingKind; q: number; r: number; playerIndex: number }
  | { type: 'skillOpened'; playerIndex: number; skill: SkillId }
  | { type: 'healed'; unitId: string; playerIndex: number }
  | { type: 'extracted'; q: number; r: number; playerIndex: number }
  | { type: 'shipUpgraded'; unitId: string; level: 1 | 2 | 3; playerIndex: number }
  | { type: 'shipReverted'; unitId: string }
  | { type: 'scoreFly'; playerIndex: number; amount: number; q: number; r: number }
  | { type: 'turnStarted'; playerIndex: number; turn: number }
  | { type: 'aiTurn'; playerIndex: number }
  | { type: 'gameOver'; winnerIndex: number; bonus: number };
```

- [ ] **Step 3: Write `src/game/state.ts`**

```ts
import { GameMode } from './gameMode';
import { GameMap } from './mapGen';
import { Player } from './players';

export interface GameStateSnapshot {
  map: GameMap;
  players: Player[];
  mode: GameMode;
  turn: number;
  currentPlayerIndex: number;
  gameOver: boolean;
  winnerIndex: number | null;
  expectedTurns: number;
  bonusAwarded: boolean;
}
```

- [ ] **Step 4: Write the failing test `tests/events.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { GameEvent } from '../src/game/events';
import { GameStateSnapshot } from '../src/game/state';
import { GameMap } from '../src/game/mapGen';
import { Player } from '../src/game/players';

describe('game events & state', () => {
  it('GameEvent objects survive JSON round-trip', () => {
    const e: GameEvent = { type: 'unitMoved', unitId: 'u1', from: { q: 0, r: 0 }, path: [{ q: 0, r: 1 }], to: { q: 0, r: 1 } };
    const copy = JSON.parse(JSON.stringify(e)) as GameEvent;
    expect(copy).toEqual(e);
  });

  it('GameStateSnapshot survives JSON round-trip', () => {
    const map: GameMap = { radius: 1, tiles: [], spawns: [] };
    const players: Player[] = [
      { index: 0, tribe: 1, isHuman: true, name: 'p0', resources: { wood: 3, stone: 2, money: 5, ore: 0 }, score: 0, kills: 0, skills: [], isActive: true },
    ];
    const snap: GameStateSnapshot = { map, players, mode: 'capture', turn: 1, currentPlayerIndex: 0, gameOver: false, winnerIndex: null, expectedTurns: 15, bonusAwarded: false };
    const copy = JSON.parse(JSON.stringify(snap)) as GameStateSnapshot;
    expect(copy).toEqual(snap);
  });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/events.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/game/events.ts src/game/state.ts tests/events.test.ts package.json package-lock.json
git commit -m "feat: add game event and state snapshot types, install peerjs"
```

---

### Task 2: Multiplayer player builder

**Files:**
- Modify: `src/game/players.ts` (append function)
- Test: `tests/players.test.ts`

**Interfaces:**
- Consumes: `TRIBES`, `generatePlayerNames`, `START_RESOURCES` (already imported in `players.ts`).
- Produces: `buildMultiplayerPlayers(humans: { name: string; tribe: Tribe }[], aiCount: number, rng: SeededRandom): Player[]` — host first (index 0), then clients in join order, AI last; AI take the remaining tribes in `TRIBES` order and names from `generatePlayerNames(aiCount, rng)`.

- [ ] **Step 1: Write the failing test (append to `tests/players.test.ts`)**

```ts
import { buildMultiplayerPlayers } from '../src/game/players';
import { TRIBES } from '../src/game/tribes';

describe('buildMultiplayerPlayers', () => {
  it('assigns humans indices 0..n-1 then AI, with unique tribes', () => {
    const rng = new SeededRandom(7);
    const players = buildMultiplayerPlayers(
      [
        { name: 'Host', tribe: TRIBES[0].id },
        { name: 'Guest', tribe: TRIBES[1].id },
      ],
      2,
      rng,
    );
    expect(players.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    expect(players[0]).toMatchObject({ isHuman: true, name: 'Host', tribe: TRIBES[0].id });
    expect(players[1]).toMatchObject({ isHuman: true, name: 'Guest', tribe: TRIBES[1].id });
    expect(players.slice(2).every((p) => p.isHuman === false)).toBe(true);
    const tribes = new Set(players.map((p) => p.tribe));
    expect(tribes.size).toBe(4);
  });

  it('starts all players with START_RESOURCES and no skills', () => {
    const players = buildMultiplayerPlayers([{ name: 'A', tribe: TRIBES[0].id }], 1, new SeededRandom(1));
    for (const p of players) {
      expect(p.resources).toEqual({ wood: 3, stone: 2, money: 5, ore: 0 });
      expect(p.skills).toEqual([]);
      expect(p.isActive).toBe(true);
      expect(p.score).toBe(0);
    }
  });
});
```

The test file already imports `SeededRandom` from `../src/util/random` — check the existing imports at the top of `tests/players.test.ts` and add it if missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/players.test.ts`
Expected: FAIL — `buildMultiplayerPlayers is not a function`.

- [ ] **Step 3: Implement `buildMultiplayerPlayers` (append to `src/game/players.ts`)**

```ts
export function buildMultiplayerPlayers(
  humans: { name: string; tribe: Tribe }[],
  aiCount: number,
  rng: SeededRandom,
): Player[] {
  const total = humans.length + aiCount;
  if (total < 2 || total > 4) {
    throw new Error(`Player total must be between 2 and 4, got ${total}`);
  }
  const usedTribes = new Set(humans.map((h) => h.tribe));
  const aiTribes = TRIBES.filter((t) => !usedTribes.has(t.id))
    .map((t) => t.id)
    .slice(0, aiCount);
  const aiNames = generatePlayerNames(aiCount, rng);
  const players: Player[] = humans.map((h, i) => ({
    index: i,
    tribe: h.tribe,
    isHuman: true,
    name: h.name,
    resources: { ...START_RESOURCES },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
  }));
  for (let i = 0; i < aiCount; i++) {
    players.push({
      index: players.length,
      tribe: aiTribes[i],
      isHuman: false,
      name: aiNames[i],
      resources: { ...START_RESOURCES },
      score: 0,
      kills: 0,
      skills: [],
      isActive: true,
    });
  }
  return players;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/game/players.ts tests/players.test.ts
git commit -m "feat: add multiplayer player builder"
```

---

### Task 3: Simulator scaffolding + core commands

**Files:**
- Create: `src/game/simulator.ts`
- Create: `tests/helpers/testMap.ts`
- Test: `tests/simulator.test.ts`

**Interfaces:**
- Consumes: `GameEvent` from `events.ts`, `GameStateSnapshot` from `state.ts`, and the existing pure functions in `src/game/*`.
- Produces (used by all later tasks):
  - `type Command` union (see below).
  - `class Simulator` with fields `map: GameMap`, `players: Player[]`, `mode: GameMode`, `turn: number`, `currentPlayerIndex: number`, `gameOver: boolean`, `winnerIndex: number | null`, `expectedTurns: number`, `bonusAwarded: boolean`.
  - `constructor(map: GameMap, players: Player[], mode: GameMode, opts?: { rng?: () => number; aiRng?: () => SeededRandom })`
  - `static fromSnapshot(snap: GameStateSnapshot): Simulator`
  - `snapshot(): GameStateSnapshot` (deep-clones via `structuredClone`)
  - `drainEvents(): GameEvent[]`
  - `startGame(): void`
  - `applyCommand(cmd: Command): boolean`
  - `get currentPlayer(): Player`

- [ ] **Step 1: Write the test helper `tests/helpers/testMap.ts`**

```ts
import { allTiles } from '../../src/game/hex';
import { Biome } from '../../src/game/biomes';
import { GameMap, MapTile } from '../../src/game/mapGen';
import { TileType } from '../../src/game/tileTypes';
import { Unit, UNIT_TYPES, UNIT_ATTACK, UNIT_ATTACK_DISTANCE, UnitType } from '../../src/game/units';

export function makeTestMap(radius = 2): GameMap {
  const tiles: MapTile[] = allTiles(radius).map((t) => ({
    q: t.q,
    r: t.r,
    terrain: TileType.GrasslandLand,
    biome: Biome.Grassland,
    settlement: null,
    building: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    exploredBy: [],
  }));
  return { radius, tiles, spawns: [] };
}

export function tileAt(map: GameMap, q: number, r: number): MapTile | undefined {
  return map.tiles.find((t) => t.q === q && t.r === r);
}

export function makeUnit(id: string, owner: number, type: UnitType, q: number, r: number): Unit {
  return {
    id,
    owner,
    type,
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: UNIT_TYPES[type].maxHp,
    attack: UNIT_ATTACK[type].attack,
    attackDistance: UNIT_ATTACK_DISTANCE[type].attackDistance,
    spawnVillage: null,
  };
}
```

- [ ] **Step 2: Write the failing test `tests/simulator.test.ts` (part 1 — move/attack/spawn/capture)**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';

describe('Simulator commands', () => {
  it('move moves a unit, marks moved, emits unitMoved', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const ok = sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 1 });
    expect(ok).toBe(true);
    expect(tileAt(map, 0, 1)!.unit?.id).toBe('u1');
    expect(tileAt(map, 0, 0)!.unit).toBeNull();
    expect(tileAt(map, 0, 1)!.unit!.hasMoved).toBe(true);
    const events = sim.drainEvents();
    expect(events[0]).toMatchObject({ type: 'unitMoved', unitId: 'u1', to: { q: 0, r: 1 } });
  });

  it('rejects a move to an unreachable tile', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const ok = sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 }); // warrior range 1
    expect(ok).toBe(false);
  });

  it('attack applies damage, awards kill score, emits attack', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('att', 0, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.unit = makeUnit('def', 1, 'warrior', 0, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const ok = sim.applyCommand({ type: 'attack', unitId: 'att', q: 0, r: 1 });
    expect(ok).toBe(true);
    const events = sim.drainEvents();
    const attack = events.find((e) => e.type === 'attack');
    expect(attack).toBeDefined();
    expect((attack as { attackerDamage: number }).attackerDamage).toBeGreaterThan(0);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBeLessThan(5);
  });

  it('spawn creates a unit owned by the current player and emits spawned', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0].resources.money = 20;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const ok = sim.applyCommand({ type: 'spawn', q: 0, r: 0, unitType: 'warrior' });
    expect(ok).toBe(true);
    expect(tileAt(map, 0, 0)!.unit?.owner).toBe(0);
    expect(players[0].resources.money).toBe(16);
    expect(sim.drainEvents()).toEqual([
      expect.objectContaining({ type: 'spawned', unitType: 'warrior', q: 0, r: 0, playerIndex: 0 }),
    ]);
  });

  it('capture changes village ownership and emits captured', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 1)!.settlement = { owner: 1, level: 1, captureReady: true };
    tileAt(map, 0, 1)!.ownedBy = 1;
    const cap = makeUnit('cap', 0, 'warrior', 0, 1);
    tileAt(map, 0, 1)!.unit = cap;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const ok = sim.applyCommand({ type: 'capture', q: 0, r: 1, unitId: 'cap' });
    expect(ok).toBe(true);
    expect(tileAt(map, 0, 1)!.settlement!.owner).toBe(0);
    expect(sim.drainEvents()).toEqual([
      expect.objectContaining({ type: 'captured', q: 0, r: 1, oldOwner: 1, newOwner: 0, ownerDied: false }),
      expect.objectContaining({ type: 'scoreFly', playerIndex: 0, amount: 50 }),
    ]);
  });
});
```

Note: `Tribe` must be imported (`import { Tribe } from '../src/game/tribes'`) — the example uses `Tribe.Villagers`; add that import or use `TRIBES[0].id`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/simulator.test.ts`
Expected: FAIL — module `simulator.ts` not found.

- [ ] **Step 4: Implement `src/game/simulator.ts` (part 1 — scaffolding + core commands)**

```ts
import { planAiActions } from './ai';
import { buildingIncome, buildBuilding } from './buildings';
import { captureVillage, setCaptureReady, villageIncomeTotal } from './capture';
import { attackableTargets, performAttack } from './combat';
import { GameEvent } from './events';
import { extractForest } from './extract';
import { bonusScoreFor, captureWinnerIndex, computeWinner, GameMode, expectedTurnsFor } from './gameMode';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay, UPGRADE_COST } from './resources';
import { awardScore, CAPTURE_SCORE, KILL_SCORE, SKILL_SCORE, UPGRADE_SCORE } from './score';
import { hasSkill, openSkill as applySkill, SkillId } from './skills';
import { gainShipAbility, revertShip, upgradeShip } from './ship';
import { moveRange, canHeal, healUnit, Unit, UnitType, HEAL_AMOUNT } from './units';
import { reachableTargets, moveUnit, pathBetween, tileAt } from './selection';
import { spawnUnit } from './spawn';
import { exploreUnitPath } from './explore';
import { TileType } from './tileTypes';
import { upgradeVillage } from './village';
import { SeededRandom } from '../util/random';
import { GameStateSnapshot } from './state';
import { BuildingKind } from './events';

export type Command =
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number }
  | { type: 'capture'; q: number; r: number; unitId: string }
  | { type: 'spawn'; q: number; r: number; unitType: UnitType }
  | { type: 'build'; q: number; r: number; kind: BuildingKind }
  | { type: 'upgradeVillage'; q: number; r: number }
  | { type: 'upgradeShip'; unitId: string }
  | { type: 'openSkill'; skill: SkillId }
  | { type: 'heal'; unitId: string }
  | { type: 'extractForest'; unitId: string }
  | { type: 'shipLanding'; unitId: string; q: number; r: number }
  | { type: 'endTurn' };

export class Simulator {
  readonly map: GameMap;
  players: Player[];
  mode: GameMode;
  turn: number;
  currentPlayerIndex: number;
  gameOver: boolean;
  winnerIndex: number | null;
  expectedTurns: number;
  bonusAwarded: boolean;

  private rng: () => number;
  private aiRng: () => SeededRandom;
  private events: GameEvent[] = [];

  constructor(
    map: GameMap,
    players: Player[],
    mode: GameMode,
    opts: { rng?: () => number; aiRng?: () => SeededRandom } = {},
  ) {
    this.map = map;
    this.players = players;
    this.mode = mode;
    this.rng = opts.rng ?? Math.random;
    this.aiRng = opts.aiRng ?? (() => new SeededRandom(Math.floor(Math.random() * 100000)));
    this.turn = 1;
    this.currentPlayerIndex = 0;
    this.gameOver = false;
    this.winnerIndex = null;
    this.expectedTurns = expectedTurnsFor(players.length);
    this.bonusAwarded = false;
  }

  static fromSnapshot(snap: GameStateSnapshot): Simulator {
    const sim = new Simulator(snap.map, snap.players, snap.mode);
    sim.turn = snap.turn;
    sim.currentPlayerIndex = snap.currentPlayerIndex;
    sim.gameOver = snap.gameOver;
    sim.winnerIndex = snap.winnerIndex;
    sim.expectedTurns = snap.expectedTurns;
    sim.bonusAwarded = snap.bonusAwarded;
    return sim;
  }

  snapshot(): GameStateSnapshot {
    return structuredClone({
      map: this.map,
      players: this.players,
      mode: this.mode,
      turn: this.turn,
      currentPlayerIndex: this.currentPlayerIndex,
      gameOver: this.gameOver,
      winnerIndex: this.winnerIndex,
      expectedTurns: this.expectedTurns,
      bonusAwarded: this.bonusAwarded,
    });
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  get currentPlayer(): Player {
    return this.players[this.currentPlayerIndex];
  }

  startGame(): void {
    this.markCaptureReadyFor(0);
    this.emit({ type: 'turnStarted', playerIndex: 0, turn: this.turn });
  }

  applyCommand(cmd: Command): boolean {
    switch (cmd.type) {
      case 'move':
        return this.doMove(cmd.unitId, cmd.q, cmd.r);
      case 'attack':
        return this.doAttack(cmd.unitId, cmd.q, cmd.r);
      case 'capture':
        return this.doCapture(cmd.q, cmd.r, cmd.unitId);
      case 'spawn':
        return this.doSpawn(cmd.q, cmd.r, cmd.unitType);
      case 'build':
        return this.doBuild(cmd.q, cmd.r, cmd.kind);
      case 'upgradeVillage':
        return this.doUpgradeVillage(cmd.q, cmd.r);
      case 'upgradeShip':
        return this.doUpgradeShip(cmd.unitId);
      case 'openSkill':
        return this.doOpenSkill(cmd.skill);
      case 'heal':
        return this.doHeal(cmd.unitId);
      case 'extractForest':
        return this.doExtractForest(cmd.unitId);
      case 'shipLanding':
        return this.doShipLanding(cmd.unitId, cmd.q, cmd.r);
      case 'endTurn':
        this.doEndTurn();
        return true;
    }
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private emitScoreFly(playerIndex: number, amount: number, tile: MapTile): void {
    this.emit({ type: 'scoreFly', playerIndex, amount, q: tile.q, r: tile.r });
  }

  private findUnit(unitId: string): Unit | undefined {
    return this.map.tiles.find((t) => t.unit?.id === unitId)?.unit;
  }

  private markCaptureReadyFor(playerIndex: number): void {
    for (const t of this.map.tiles) {
      if (t.settlement && t.settlement.owner !== playerIndex && t.unit && t.unit.owner === playerIndex) {
        t.settlement.captureReady = true;
      }
    }
  }

  private doMove(unitId: string, q: number, r: number): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    const player = this.players[unit.owner];
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    const target = tileAt(this.map, q, r);
    if (!target) return false;
    if (unit.shipLevel !== undefined && target.terrain !== TileType.Water) return false;
    const reachable = reachableTargets(this.map, unit, moveRange(unit), canClimb, canDock);
    if (!reachable.some((t) => t.q === q && t.r === r)) return false;
    const from = { q: unit.q, r: unit.r };
    const path = pathBetween(this.map, from, { q, r }, canClimb, unit.shipLevel !== undefined, canDock);
    moveUnit(this.map, unit, target);
    exploreUnitPath(this.map, path, unit, unit.owner);
    if (target.building?.kind === 'port' && hasSkill(player, 'navigation')) {
      gainShipAbility(unit);
    }
    this.emit({ type: 'unitMoved', unitId, from, path, to: { q, r } });
    return true;
  }

  private doAttack(unitId: string, q: number, r: number): boolean {
    const attacker = this.findUnit(unitId);
    if (!attacker || attacker.owner !== this.currentPlayerIndex) return false;
    const target = tileAt(this.map, q, r);
    if (!target?.unit) return false;
    if (target.unit.owner === attacker.owner) return false;
    if (!attackableTargets(this.map, attacker).some((t) => t.q === q && t.r === r)) return false;
    const attackerPlayer = this.players[attacker.owner];
    const targetPlayer = this.players[target.unit.owner];
    const targetId = target.unit.id;
    const result = performAttack(this.map, attacker, target, this.rng);
    if (result.targetDied) {
      attackerPlayer.kills += 1;
      awardScore(attackerPlayer, KILL_SCORE);
      this.emitScoreFly(attackerPlayer.index, KILL_SCORE, target);
    }
    if (result.attackerDied) {
      targetPlayer.kills += 1;
      awardScore(targetPlayer, KILL_SCORE);
      const attackerTile = tileAt(this.map, attacker.q, attacker.r);
      if (attackerTile) this.emitScoreFly(targetPlayer.index, KILL_SCORE, attackerTile);
    }
    if (target.unit === attacker) {
      exploreUnitPath(this.map, [{ q: attacker.q, r: attacker.r }], attacker, attacker.owner);
    }
    this.emit({
      type: 'attack',
      attackerId: unitId,
      targetId,
      attackerDamage: result.attackerDamage,
      targetDamage: result.targetDamage,
      missed: result.missed,
      attackerDied: result.attackerDied,
      targetDied: result.targetDied,
    });
    return true;
  }

  private doCapture(q: number, r: number, unitId: string): boolean {
    const village = tileAt(this.map, q, r);
    if (!village?.settlement) return false;
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    if (village.unit !== unit) return false;
    if (village.settlement.owner === unit.owner || !village.settlement.captureReady) return false;
    const oldOwner = village.settlement.owner;
    const result = captureVillage(this.map, village, unit);
    const capturer = this.players[unit.owner];
    awardScore(capturer, CAPTURE_SCORE);
    this.emitScoreFly(capturer.index, CAPTURE_SCORE, village);
    if (result.ownerDied) {
      for (const p of this.players) {
        const owned = this.map.tiles.filter((t) => t.settlement && t.settlement.owner === p.index);
        if (owned.length === 0) p.isActive = false;
      }
    }
    this.emit({ type: 'captured', q, r, oldOwner, newOwner: unit.owner, ownerDied: result.ownerDied });
    return true;
  }

  private doSpawn(q: number, r: number, unitType: UnitType): boolean {
    const village = tileAt(this.map, q, r);
    if (!village || village.settlement?.owner !== this.currentPlayerIndex) return false;
    const player = this.currentPlayer;
    if (spawnUnit(this.map, village, unitType, player)) {
      this.emit({ type: 'spawned', unitType, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doBuild(q: number, r: number, kind: BuildingKind): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildBuilding(this.map, tile, kind, player)) {
      this.emit({ type: 'built', kind, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doUpgradeVillage(q: number, r: number): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile?.settlement || tile.settlement.owner !== this.currentPlayerIndex) return false;
    const player = this.currentPlayer;
    if (!canAfford(player.resources, UPGRADE_COST)) return false;
    player.resources = pay(player.resources, UPGRADE_COST);
    upgradeVillage(this.map, tile);
    awardScore(player, UPGRADE_SCORE);
    this.emit({ type: 'villageUpgraded', q, r, level: tile.settlement.level, playerIndex: player.index });
    this.emitScoreFly(player.index, UPGRADE_SCORE, tile);
    return true;
  }

  private doUpgradeShip(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    const tile = tileAt(this.map, unit.q, unit.r)!;
    const player = this.currentPlayer;
    if (upgradeShip(unit, tile, player)) {
      exploreUnitPath(this.map, [{ q: unit.q, r: unit.r }], unit, unit.owner);
      this.emit({ type: 'shipUpgraded', unitId, level: unit.shipLevel!, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doOpenSkill(skill: SkillId): boolean {
    const player = this.currentPlayer;
    if (applySkill(player, skill)) {
      awardScore(player, SKILL_SCORE);
      this.emit({ type: 'skillOpened', playerIndex: player.index, skill });
      this.emitScoreFly(player.index, SKILL_SCORE, tileAt(this.map, 0, 0)!);
      return true;
    }
    return false;
  }

  private doHeal(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex || !canHeal(unit)) return false;
    healUnit(unit);
    this.emit({ type: 'healed', unitId, playerIndex: unit.owner });
    return true;
  }

  private doExtractForest(unitId: string): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.owner !== this.currentPlayerIndex) return false;
    const tile = tileAt(this.map, unit.q, unit.r)!;
    const player = this.currentPlayer;
    if (extractForest(this.map, tile, unit, player)) {
      this.emit({ type: 'extracted', q: tile.q, r: tile.r, playerIndex: player.index });
      return true;
    }
    return false;
  }

  private doShipLanding(unitId: string, q: number, r: number): boolean {
    const unit = this.findUnit(unitId);
    if (!unit || unit.shipLevel === undefined || unit.owner !== this.currentPlayerIndex) return false;
    const target = tileAt(this.map, q, r);
    if (!target || target.terrain === TileType.Water) return false;
    const player = this.players[unit.owner];
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    const reachable = reachableTargets(this.map, unit, moveRange(unit), canClimb, canDock);
    if (!reachable.some((t) => t.q === q && t.r === r)) return false;
    const from = { q: unit.q, r: unit.r };
    const path = pathBetween(this.map, from, { q, r }, canClimb, true, canDock);
    moveUnit(this.map, unit, target);
    exploreUnitPath(this.map, path, unit, unit.owner);
    revertShip(unit);
    unit.hasMoved = false;
    unit.hasAttacked = false;
    unit.hasHealed = false;
    this.emit({ type: 'unitMoved', unitId, from, path, to: { q, r } });
    this.emit({ type: 'shipReverted', unitId });
    return true;
  }
}
```

Leave `doEndTurn` and the turn engine for Task 5 — but the `applyCommand` switch already calls `this.doEndTurn()`, so add a placeholder method in this task to keep it compiling:

```ts
  private doEndTurn(): void {
    // implemented in Task 5 (turn engine)
    this.emit({ type: 'turnStarted', playerIndex: this.currentPlayerIndex, turn: this.turn });
  }
```

Note: `doOpenSkill` uses `tileAt(this.map, 0, 0)!` for the scoreFly tile — this is a placeholder location; acceptable for the flyer position. If the test map always has a tile at (0,0) this works (makeTestMap radius ≥ 1 includes (0,0)).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/simulator.test.ts`
Expected: PASS. (Note: `buildPlayers(Tribe.Villagers, ...)` requires the `Tribe` import in the test; fix imports as needed.)

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add src/game/simulator.ts tests/simulator.test.ts tests/helpers/testMap.ts
git commit -m "feat: add simulator core commands"
```

---

### Task 4: Simulator turn engine

**Files:**
- Modify: `src/game/simulator.ts`
- Test: `tests/simulatorTurn.test.ts`

**Interfaces:**
- Consumes: `Simulator` from Task 3 (`applyCommand`, `drainEvents`, `currentPlayerIndex`, `players`, `turn`).
- Produces: `doEndTurn()` implementation — advances through AI turns synchronously, applies income at round wrap, checks win conditions. Events emitted: `aiTurn`, `turnStarted`, `gameOver`.

- [ ] **Step 1: Write the failing test `tests/simulatorTurn.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt } from './helpers/testMap';
import { Simulator } from '../src/game/simulator';
import { buildPlayers, buildMultiplayerPlayers } from '../src/game/players';
import { TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';

function villageFor(map: ReturnType<typeof makeTestMap>, q: number, r: number, owner: number): void {
  tileAt(map, q, r)!.settlement = { owner, level: 1, captureReady: false };
  tileAt(map, q, r)!.ownedBy = owner;
}

describe('Simulator turn engine', () => {
  it('single player: endTurn runs AI players, applies income, returns to human with turn+1', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    villageFor(map, 0, 3, 2);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(sim.currentPlayerIndex).toBe(0);
    expect(sim.turn).toBe(2);
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: 'turnStarted', playerIndex: 0, turn: 2 });
    // income applied: player 0 owns a level-1 village -> +4 money
    expect(players[0].resources.money).toBe(5 + 4);
  });

  it('two humans: endTurn stops at the other human before income', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    const players = buildMultiplayerPlayers(
      [{ name: 'A', tribe: TRIBES[0].id }, { name: 'B', tribe: TRIBES[1].id }],
      0,
      new SeededRandom(1),
    );
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.currentPlayerIndex).toBe(1);
    expect(sim.turn).toBe(1);
    expect(players[0].resources.money).toBe(5); // no income yet
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.currentPlayerIndex).toBe(0);
    expect(sim.turn).toBe(2);
    expect(players[0].resources.money).toBe(9);
  });

  it('capture win triggers gameOver at round end', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0); // only player 0 owns a village
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).toBe(0);
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
  });

  it('turns30 win triggers gameOver once turn reaches 30', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.turn = 29;
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.gameOver).toBe(true);
    expect(sim.turn).toBe(30);
  });
});
```

Add the `Tribe` import to the test file as needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/simulatorTurn.test.ts`
Expected: FAIL — income/turn/gameOver assertions fail (placeholder `doEndTurn`).

- [ ] **Step 3: Implement the turn engine in `src/game/simulator.ts`**

Replace the placeholder `doEndTurn` and add the private helpers:

```ts
  private doEndTurn(): void {
    if (this.gameOver) return;
    let guard = 0;
    for (;;) {
      if (guard++ > 64) break;
      const next = (this.currentPlayerIndex + 1) % this.players.length;
      if (next === 0) {
        this.applyIncome();
        this.turn += 1;
        this.resetUnitFlags();
        if (this.checkEndConditions()) return;
      }
      this.currentPlayerIndex = next;
      if (!this.players[next].isActive) continue;
      if (!this.players[next].isHuman) {
        this.runAiTurn(next);
        continue;
      }
      this.markCaptureReadyFor(next);
      this.emit({ type: 'turnStarted', playerIndex: next, turn: this.turn });
      return;
    }
  }

  private runAiTurn(playerIndex: number): void {
    const ai = this.players[playerIndex];
    this.markCaptureReadyFor(playerIndex);
    this.emit({ type: 'aiTurn', playerIndex });
    const actions = planAiActions(this.map, ai, this.aiRng());
    for (const a of actions) {
      switch (a.type) {
        case 'upgrade':
          this.doUpgradeVillage(a.q, a.r);
          break;
        case 'move':
          this.doMove(a.unitId, a.q, a.r);
          break;
        case 'attack':
          this.doAttack(a.unitId, a.q, a.r);
          break;
        case 'spawn':
          this.doSpawn(a.q, a.r, a.unitType);
          break;
        case 'capture':
          this.doCapture(a.q, a.r, a.unitId);
          break;
        case 'heal':
          this.doHeal(a.unitId);
          break;
        case 'build':
          this.doBuild(a.q, a.r, a.kind);
          break;
        case 'openSkill':
          this.doOpenSkill(a.skill);
          break;
      }
    }
  }

  private applyIncome(): void {
    for (const player of this.players) {
      player.resources.money += villageIncomeTotal(this.map, player.index);
      const b = buildingIncome(this.map, player);
      player.resources.wood += b.wood;
      player.resources.stone += b.stone;
      player.resources.ore += b.ore;
    }
  }

  private resetUnitFlags(): void {
    for (const t of this.map.tiles) {
      if (t.unit) {
        t.unit.hasMoved = false;
        t.unit.hasAttacked = false;
        t.unit.hasHealed = false;
      }
    }
  }

  private checkEndConditions(): boolean {
    if (this.mode === 'turns30' && this.turn >= 30) {
      this.endGame(computeWinner(this.players, this.map));
      return true;
    }
    if (this.mode === 'capture') {
      const w = captureWinnerIndex(this.map);
      if (w !== null) {
        this.endGame(w);
        return true;
      }
    }
    return false;
  }

  private endGame(winnerIndex: number): void {
    const winner = this.players[winnerIndex];
    const bonus =
      this.mode === 'capture' && this.turn <= this.expectedTurns
        ? bonusScoreFor(this.players.length)
        : 0;
    if (bonus > 0) {
      awardScore(winner, bonus);
      this.bonusAwarded = true;
    }
    this.winnerIndex = winnerIndex;
    this.gameOver = true;
    this.emit({ type: 'gameOver', winnerIndex, bonus });
  }
```

Also add imports for `computeWinner` and `bonusScoreFor`, `expectedTurnsFor` already in the imports list from Task 3 (verify `computeWinner` and `bonusScoreFor` are imported).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/simulatorTurn.test.ts`
Expected: PASS.

- [ ] **Step 5: Run all tests, typecheck, commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add src/game/simulator.ts tests/simulatorTurn.test.ts
git commit -m "feat: simulator turn engine with AI, income, and win checks"
```

---

### Task 5: Store additions for multiplayer

**Files:**
- Modify: `src/store/gameStore.ts`
- Modify: `tests/gameStore.test.ts`

**Interfaces:**
- Produces (used by later tasks): `Screen` union now includes `'lobby'`; new fields `localPlayerIndex: number`, `netMode: 'single' | 'host' | 'client'`, `lobby: LobbyState | null`, `connection: 'idle' | 'connecting' | 'connected' | 'error'`, `pendingSnapshot: GameStateSnapshot | null`, and their setters. `LobbyPlayer` and `LobbyState` exported types.

- [ ] **Step 1: Modify `src/store/gameStore.ts`**

Add to the imports:

```ts
import { GameStateSnapshot } from '../game/state';
import { GameMode } from '../game/gameMode';
import { Tribe } from '../game/tribes';
```

Change the `Screen` type:

```ts
export type Screen = 'start' | 'setup' | 'lobby' | 'game';
```

Add exported lobby types above the interface:

```ts
export interface LobbyPlayer {
  peerId: string;
  name: string;
  tribeId: Tribe | null;
  isHost: boolean;
}

export interface LobbyState {
  role: 'host' | 'client';
  code: string;
  mode: GameMode;
  totalPlayers: number;
  aiCount: number;
  players: LobbyPlayer[];
}
```

Add fields to `GameStore` interface and the store object:

```ts
  localPlayerIndex: number;
  netMode: 'single' | 'host' | 'client';
  lobby: LobbyState | null;
  connection: 'idle' | 'connecting' | 'connected' | 'error';
  pendingSnapshot: GameStateSnapshot | null;

  setLocalPlayerIndex: (index: number) => void;
  setNetMode: (mode: 'single' | 'host' | 'client') => void;
  setLobby: (lobby: LobbyState | null) => void;
  setConnection: (connection: 'idle' | 'connecting' | 'connected' | 'error') => void;
  setPendingSnapshot: (snapshot: GameStateSnapshot | null) => void;
```

Initial values:

```ts
  localPlayerIndex: 0,
  netMode: 'single',
  lobby: null,
  connection: 'idle',
  pendingSnapshot: null,
```

Setters:

```ts
  setLocalPlayerIndex: (index) => set({ localPlayerIndex: index }),
  setNetMode: (netMode) => set({ netMode }),
  setLobby: (lobby) => set({ lobby }),
  setConnection: (connection) => set({ connection }),
  setPendingSnapshot: (pendingSnapshot) => set({ pendingSnapshot }),
```

- [ ] **Step 2: Update `tests/gameStore.test.ts`** — the `beforeEach` already resets state via `useGameStore.setState`. Add the new fields to that reset and add one test:

```ts
  it('setLocalPlayerIndex updates localPlayerIndex', () => {
    useGameStore.getState().setLocalPlayerIndex(2);
    expect(useGameStore.getState().localPlayerIndex).toBe(2);
  });
```

- [ ] **Step 3: Run tests, typecheck, commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add src/store/gameStore.ts tests/gameStore.test.ts
git commit -m "feat: add multiplayer state to the store"
```

---

### Task 6: Renderer takes local player index

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Modify: `src/controller/gameController.ts` (call site only)

**Interfaces:**
- Produces: `renderMap(..., localPlayerIndex: number)` — adds one required parameter used for fog (`isExploredFor(tile, localPlayerIndex)`), the acting-unit red dot (`unit.owner === localPlayerIndex`), and territory drawing.

- [ ] **Step 1: Modify `renderMap` in `src/render/mapRenderer.ts`**

Read the current signature around line 130 (`renderMap(app, map, textures, players, selection, reachableKeys, attackableKeys, hexSize, spriteScale, textResolution)`) and the body. Replace `const humanIndex = players.findIndex((p) => p.isHuman);` with a new parameter:

```ts
export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  players: Player[],
  selection: Selection | null,
  reachableKeys: Set<string>,
  attackableKeys: Set<string>,
  localPlayerIndex: number,
  hexSize = 40,
  spriteScale = 1,
  textResolution = 1,
): RenderedMap {
```

Then:
- Replace every use of `humanIndex` inside `renderMap` with `localPlayerIndex`.
- Replace the red-dot check at line 87 (`if (canAct && unit.owner === 0)`) with `if (canAct && unit.owner === localPlayerIndex)`.
- Verify there are no other `players.findIndex((p) => p.isHuman)` usages in this file; if any remain, replace them with `localPlayerIndex`.

- [ ] **Step 2: Update the call site in `src/controller/gameController.ts`**

The `render()` method calls `renderMap(this.app, this.map, ...)`. It will change shape again in Task 7 (the controller gains a `Simulator`), so for now just add `0` as the `localPlayerIndex` argument so the project compiles:

```ts
const rendered = renderMap(this.app, this.map, this.textures, store.players, selection, this.reachableKeys, this.attackableKeys, 0, HEX_SIZE, 1 / this.qualityFactor, this.qualityFactor);
```

- [ ] **Step 3: Verify build, typecheck, commit**

Run: `npm run typecheck && npm run build`
Expected: PASS.

```bash
git add src/render/mapRenderer.ts src/controller/gameController.ts
git commit -m "refactor: renderer uses explicit local player index"
```

---

### Task 7: Refactor GameController to use the Simulator (single player)

This is the largest task. The controller keeps all rendering, input, camera, dialogs, and popups, but every action becomes: build a `Command`, run it on `this.sim`, sync the store, then present the drained events. The old inline logic (popups, floats, score flies, AI phase) moves into a `presentEvents` method.

**Files:**
- Modify: `src/controller/gameController.ts`
- Modify: `src/screens/hud/EndTurnButton.tsx` (minor, if aiActive semantics change — see below)

**Interfaces:**
- Consumes: `Simulator`, `Command` from `simulator.ts`; `GameEvent` from `events.ts`.
- Produces (used by later tasks):
  - `getSim(): Simulator | null`
  - `async runCommand(cmd: Command): Promise<void>` — applies to `this.sim`, syncs store, drains events, presents, renders.
  - `async presentEvents(events: GameEvent[], preExplored: Set<string>): Promise<void>`
  - `adoptSnapshot(snap: GameStateSnapshot): void` — replaces `this.sim` with `Simulator.fromSnapshot(snap)` (used by the client).
  - `exploredKeysFor(playerIndex: number): Set<string>`

- [ ] **Step 1: Replace the controller's map/player fields with a Simulator**

- Replace `private map: GameMap | null = null;` with `private sim: Simulator | null = null;`.
- Add field `private pendingClientEvents: GameEvent[] = [];` (used for client-side events arriving before init).
- Replace `getMap(): GameMap | null { return this.map; }` with:

```ts
  getMap(): GameMap | null {
    return this.sim?.map ?? null;
  }

  getSim(): Simulator | null {
    return this.sim;
  }
```

- In `init()`, replace `if (this.map) { const map = this.map; ... }` with `if (this.sim) { const sim = this.sim; ... this.render(); this.presentPendingClientEvents(); }`.
- In `destroy()`, add `this.sim = null;`.

- [ ] **Step 2: Add store-sync, explored-keys, and runCommand helpers**

Add these methods (place them near `getMap`):

```ts
  private syncStore(): void {
    const store = useGameStore.getState();
    if (!this.sim) return;
    store.setPlayers([...this.sim.players]);
    store.setTurn(this.sim.turn);
    store.setCurrentPlayerIndex(this.sim.currentPlayerIndex);
    store.setGameOver(this.sim.gameOver);
    store.setWinnerIndex(this.sim.winnerIndex);
    store.setExpectedTurns(this.sim.expectedTurns);
    store.setBonusAwarded(this.sim.bonusAwarded);
  }

  exploredKeysFor(playerIndex: number): Set<string> {
    const keys = new Set<string>();
    if (!this.sim) return keys;
    for (const t of this.sim.map.tiles) {
      if (isExploredFor(t, playerIndex)) keys.add(axialKey(t));
    }
    return keys;
  }

  async runCommand(cmd: Command): Promise<void> {
    if (!this.sim || this.sim.gameOver) return;
    const store = useGameStore.getState();
    if (store.aiActive && cmd.type !== 'endTurn') return;
    const preExplored = this.exploredKeysFor(store.localPlayerIndex);
    const ok = this.sim.applyCommand(cmd);
    this.syncStore();
    if (!ok && cmd.type !== 'endTurn') return;
    const events = this.sim.drainEvents();
    await this.presentEvents(events, preExplored);
    this.render();
  }
```

- [ ] **Step 3: Implement `adoptSnapshot` and pending-event buffering**

```ts
  adoptSnapshot(snap: GameStateSnapshot): void {
    this.sim = Simulator.fromSnapshot(snap);
    this.syncStore();
    if (this.app) this.render();
  }

  private presentPendingClientEvents(): void {
    if (!this.app) return;
    const events = this.pendingClientEvents;
    this.pendingClientEvents = [];
    if (events.length > 0) {
      void this.presentEvents(events, new Set());
    }
  }
```

- [ ] **Step 4: Rewrite `startGame` (single player)**

```ts
  startGame(tribe: Tribe, enemyCount: number, mode: GameMode): void {
    const store = useGameStore.getState();
    const players = buildPlayers(tribe, enemyCount, new SeededRandom(Math.floor(Math.random() * 100000)));
    const map = generateMap(players.length, Math.floor(Math.random() * 100000));
    for (const p of players) initialExplorationFor(map, p.index);
    this.sim = new Simulator(map, players, mode);
    this.sim.startGame();
    store.setPlayers(players);
    store.setMode(mode);
    store.setExpectedTurns(this.sim.expectedTurns);
    store.setGameOver(false);
    store.setWinnerIndex(null);
    store.setBonusAwarded(false);
    store.setLocalPlayerIndex(0);
    store.setNetMode('single');
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setScreen('game');
    if (this.app) {
      this.applyFitToScreen();
      this.textures = createTextures(this.app, map, HEX_SIZE * this.qualityFactor);
    }
    this.render();
    const human = players[0];
    showPopup(`${human.name}'s turn!`, { background: tribeBackground(human) });
    this.applyFitToScreen();
  }
```

(Imports needed: `Simulator` from `../game/simulator`, `GameStateSnapshot` from `../game/state`, `Command` from `../game/simulator`, `GameEvent` from `../game/events`.)

- [ ] **Step 5: Rewrite the action methods to use `runCommand`**

Replace the bodies of these methods so they build a command and call `await this.runCommand(cmd)`:

- `captureSelectedVillage()` → `void this.runCommand({ type: 'capture', q: selection.q, r: selection.r, unitId: tile.unit.id })` — keep the early-return guards (`store.aiActive`, missing selection, wrong owner) that are cheap, but the real validation now happens in the sim. Example:

```ts
  captureSelectedVillage(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection) return;
    const tile = tileAt(this.sim!.map, selection.q, selection.r);
    if (!tile?.unit || !tile.settlement || tile.settlement.owner === tile.unit.owner || !tile.settlement.captureReady) return;
    store.setSelection(null);
    void this.runCommand({ type: 'capture', q: selection.q, r: selection.r, unitId: tile.unit.id });
  }
```

- `confirmAttack()` → read `pendingAttack` + `selection`; `void this.runCommand({ type: 'attack', unitId: attacker.id, q: pending.q, r: pending.r })`; then `store.setPendingAttack(null)`.
- `spawnSelectedVillage(type)` → `void this.runCommand({ type: 'spawn', q: selection.q, r: selection.r, unitType: type })`; close the spawn dialog.
- `healSelectedUnit()` → `void this.runCommand({ type: 'heal', unitId: unit.id })`.
- `upgradeSelectedVillage()` → `void this.runCommand({ type: 'upgradeVillage', q: selection.q, r: selection.r })`.
- `buildSelectedBuilding(kind)` → `void this.runCommand({ type: 'build', q: selection.q, r: selection.r, kind })`.
- `openSkill(id)` → `void this.runCommand({ type: 'openSkill', skill: id })` (keep the skill tree closing behavior: the SkillTreeScreen currently re-renders from `players`; closing is handled elsewhere).
- `upgradeSelectedShip()` → `void this.runCommand({ type: 'upgradeShip', unitId: unit.id })`.
- `extractSelectedForest()` → `void this.runCommand({ type: 'extractForest', unitId: unit.id })`.
- `confirmShipLanding()` → `void this.runCommand({ type: 'shipLanding', unitId: unit.id, q: pending.q, r: pending.r })`; `store.setPendingShipLanding(null)`.
- `handleMapClick(q, r)` — the move branch becomes `await this.runCommand({ type: 'move', unitId: unit.id, q, r })`, then re-select the moved unit and render. The `pendingAttack`/`pendingShipLanding` branches stay (they set local dialog state). Remove the direct `animateUnitMove` call.
- `endTurn()` → `void this.runCommand({ type: 'endTurn' })`.

Delete the old private `runAiPhase()` entirely and the `spawnScoreFly`-based score awarding inline (score now comes from sim + `scoreFly` events).

- [ ] **Step 6: Implement `presentEvents`**

This method replaces all the inline popup/float/score-fly/camera logic. It is called on both host and client with the same code. Keep the existing helpers (`animateUnitMove`, `bringCellIntoView`, `spawnHpText`, `spawnFloatText`, `spawnScoreFly`, `spawnFogReveal`) but adapt them to read from `this.sim.map` instead of `this.map`, and to use `localPlayerIndex` instead of `0`/`players.find(isHuman)`:

```ts
  private async presentEvents(events: GameEvent[], preExplored: Set<string>): Promise<void> {
    if (!this.app || !this.sim) return;
    const store = useGameStore.getState();
    this.revealNewlyExplored(preExplored);
    for (const e of events) {
      const player = this.sim.players[e.type === 'turnStarted' || e.type === 'aiTurn' || e.type === 'gameOver' ? (e as { playerIndex?: number }).playerIndex ?? 0 : 'playerIndex' in e ? (e as { playerIndex: number }).playerIndex : 0];
      switch (e.type) {
        case 'unitMoved':
          await this.presentUnitMoved(e);
          break;
        case 'attack': {
          const attacker = this.findUnitById(e.attackerId);
          const target = this.findUnitById(e.targetId);
          if (attacker && target) {
            const attackerPlayer = this.sim.players[attacker.owner];
            const targetPlayer = this.sim.players[target.owner];
            if (e.missed) {
              this.spawnHpText(tileAt(this.sim.map, target.q, target.r)!, 'Miss', 0xffa500);
              showPopup(`${attackerPlayer.name} misses ${targetPlayer.name}!`, { background: tribeBackground(attackerPlayer) });
            } else {
              if (e.attackerDamage > 0) this.spawnHpText(tileAt(this.sim.map, target.q, target.r)!, `-${e.attackerDamage}`, 0xff4444);
              if (e.targetDamage > 0) this.spawnHpText(tileAt(this.sim.map, attacker.q, attacker.r)!, `-${e.targetDamage}`, 0xff4444);
              showPopup(`${attackerPlayer.name} attacks ${targetPlayer.name}: -${e.attackerDamage} hp`, { background: tribeBackground(attackerPlayer) });
              if (e.targetDied) {
                showPopup(`${targetPlayer.name}'s unit dies`, { background: tribeBackground(targetPlayer) });
              } else {
                showPopup(`${targetPlayer.name} attacks ${attackerPlayer.name}: -${e.targetDamage} hp`, { background: tribeBackground(targetPlayer) });
                if (e.attackerDied) showPopup(`${attackerPlayer.name}'s unit dies`, { background: tribeBackground(attackerPlayer) });
              }
            }
          }
          break;
        }
        case 'spawned':
          showPopup(`${this.sim.players[e.playerIndex].name} spawns ${UNIT_TYPE_NAMES[e.unitType]}`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          break;
        case 'captured':
          this.presentCaptured(e);
          break;
        case 'villageUpgraded':
          showPopup(`${this.sim.players[e.playerIndex].name}'s village upgraded to level ${e.level}`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          break;
        case 'built':
          showPopup(`${this.sim.players[e.playerIndex].name} builds a ${e.kind}`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          break;
        case 'skillOpened':
          showPopup(`${this.sim.players[e.playerIndex].name} learns ${SKILLS[e.skill].name}`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          break;
        case 'healed': {
          const unit = this.findUnitById(e.unitId);
          if (unit) {
            const t = tileAt(this.sim.map, unit.q, unit.r);
            if (t) this.spawnHpText(t, `+${HEAL_AMOUNT}`, 0x44ff44);
            showPopup(`${this.sim.players[e.playerIndex].name} heals a unit`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          }
          break;
        }
        case 'extracted':
          showPopup(`${this.sim.players[e.playerIndex].name} extracts the forest (+4 wood)`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          break;
        case 'shipUpgraded':
          showPopup(`${this.sim.players[e.playerIndex].name} upgrades a ship to level ${e.level}`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          break;
        case 'shipReverted':
          break;
        case 'scoreFly': {
          const tile = tileAt(this.sim.map, e.q, e.r);
          if (tile) this.spawnScoreFly(tile, e.playerIndex, e.amount);
          break;
        }
        case 'turnStarted':
          this.presentTurnStarted(e.playerIndex, e.turn);
          break;
        case 'aiTurn':
          showPopup(`${this.sim.players[e.playerIndex].name}'s turn!`, { background: tribeBackground(this.sim.players[e.playerIndex]) });
          break;
        case 'gameOver':
          this.presentGameOver(e.winnerIndex, e.bonus);
          break;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
```

(Note: the `player` const at the top of the loop is unnecessary and should be removed — it is not used. Write the switch without it.)

The `playerIndex` field extraction: events with `playerIndex` are `spawned`, `villageUpgraded`, `built`, `skillOpened`, `healed`, `extracted`, `shipUpgraded`, `scoreFly`, `turnStarted`, `aiTurn`. TypeScript narrowing on a discriminated union works fine with `switch (e.type)` — write the cases directly using `e.playerIndex`; no extra casting is needed.

- [ ] **Step 7: Implement the presentation helpers**

```ts
  private findUnitById(unitId: string): Unit | undefined {
    if (!this.sim) return undefined;
    return this.sim.map.tiles.find((t) => t.unit?.id === unitId)?.unit;
  }

  private revealNewlyExplored(preExplored: Set<string>): void {
    const store = useGameStore.getState();
    const post = this.exploredKeysFor(store.localPlayerIndex);
    const newly: { q: number; r: number }[] = [];
    for (const t of this.sim!.map.tiles) {
      if (post.has(axialKey(t)) && !preExplored.has(axialKey(t))) newly.push({ q: t.q, r: t.r });
    }
    const FOG_REVEAL_DELAY = 40;
    newly.forEach((c, i) => setTimeout(() => this.spawnFogRevealAt(c.q, c.r), i * FOG_REVEAL_DELAY));
  }

  private spawnFogRevealAt(q: number, r: number): void {
    const tile = this.sim?.map.tiles.find((t) => t.q === q && t.r === r);
    if (tile) this.spawnFogReveal(tile);
  }

  private async presentUnitMoved(e: Extract<GameEvent, { type: 'unitMoved' }>): Promise<void> {
    if (!this.app || !this.sim) return;
    const unit = this.findUnitById(e.unitId);
    if (!unit) return;
    const human = useGameStore.getState().localPlayerIndex;
    if (unit.owner !== human) {
      await this.bringCellIntoView(e.to.q, e.to.r);
    }
    await this.animateMoveEvent(unit, e);
  }

  private async animateMoveEvent(unit: Unit, e: { type: 'unitMoved'; unitId: string; from: { q: number; r: number }; path: { q: number; r: number }[]; to: { q: number; r: number } }): Promise<void> {
    if (!this.app || !this.mapContainer || !this.textures) return;
    const dest = tileAt(this.sim!.map, e.to.q, e.to.r);
    if (!dest) return;
    const store = useGameStore.getState();
    const texture = this.textures.unitTextures[store.players[unit.owner].tribe][unit.type];
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.scale.set(this.spriteScale);
    const from = tileAt(this.sim!.map, e.from.q, e.from.r);
    const startPos = hexToPixel(e.from, HEX_SIZE);
    sprite.position.set(startPos.x, startPos.y - (from ? tileElevation(from, HEX_SIZE) : 0));
    this.mapContainer.addChild(sprite);
    const realUnit = dest.unit;
    dest.unit = null;
    this.render();
    for (const step of [...e.path]) {
      const to = hexToPixel(step, HEX_SIZE);
      const targetTile = tileAt(this.sim!.map, step.q, step.r);
      const y = targetTile ? to.y - tileElevation(targetTile, HEX_SIZE) : to.y;
      await this.tweenSpriteTo(sprite, { x: to.x, y }, 140);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    dest.unit = realUnit;
    this.mapContainer.removeChild(sprite);
    sprite.destroy();
  }

  private presentCaptured(e: Extract<GameEvent, { type: 'captured' }>): void {
    if (!this.sim) return;
    const capturer = this.sim.players[e.newOwner];
    const village = tileAt(this.sim.map, e.q, e.r);
    if (e.oldOwner !== null && village) {
      const tribe = TRIBES.find((t) => t.id === capturer.tribe)!;
      useGameStore.getState().setCenterMessage(`${village.settlement!.name ?? 'Settlement'} is captured by ${tribe.name}!`);
    }
    showPopup(`${capturer.name} captures the village`, { background: tribeBackground(capturer) });
  }

  private presentTurnStarted(playerIndex: number, turn: number): void {
    const store = useGameStore.getState();
    const player = store.players[playerIndex];
    if (!player) return;
    store.setCurrentPlayerIndex(playerIndex);
    store.setTurn(turn);
    store.setSelection(null);
    store.setAiActive(playerIndex !== store.localPlayerIndex);
    showPopup(`${player.name}'s turn!`, { background: tribeBackground(player) });
  }

  private presentGameOver(winnerIndex: number, bonus: number): void {
    const store = useGameStore.getState();
    store.setWinnerIndex(winnerIndex);
    store.setGameOver(true);
    store.setAiActive(false);
    store.setSelection(null);
    const winner = store.players[winnerIndex];
    if (winner) showPopup(`${winner.name} wins!`, { background: tribeBackground(winner) });
  }
```

Adapt `animateUnitMove`'s old helper: the old `animateUnitMove(unit, target)` (used by ship-landing) is no longer needed — remove it or keep it only as a thin wrapper around `animateMoveEvent` if any code still references it (it should not after Step 5).

Change `spawnHpText` and `exploreUnitMove` to use `localPlayerIndex` instead of `players.find((p) => p.isHuman)` / `unit.owner !== 0`:

```ts
  private spawnHpText(tile: MapTile, text: string, color: number): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (!isExploredFor(tile, local)) return;
    this.spawnFloatText(tile, text, color);
  }
```

Remove the old `exploreUnitMove` method (the sim handles exploration; `revealNewlyExplored` handles the reveal animation).

Update `spawnScoreFly` so it **does not** award score (the sim already did): delete the `awardScore` call inside the ticker's completion branch. Keep the visual flyer.

- [ ] **Step 8: Update `render()` and input gating**

In `render()`, replace `this.map` with `this.sim.map`, and pass the local player index:

```ts
    const store = useGameStore.getState();
    const rendered = renderMap(this.app, this.sim.map, this.textures, store.players, selection, this.reachableKeys, this.attackableKeys, store.localPlayerIndex, HEX_SIZE, 1 / this.qualityFactor, this.qualityFactor);
```

Replace `if (unit.owner === 0 && canMove(unit))` and `if (unit.owner === 0 && canAttack(unit))` with `unit.owner === store.localPlayerIndex`.

`handleMapClick` already checks `store.aiActive || store.gameOver` — keep it.

The `endTurn()` method:

```ts
  endTurn(): void {
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    store.setAiActive(true);
    store.setSelection(null);
    void this.runCommand({ type: 'endTurn' });
  }
```

Note: `presentTurnStarted` sets `setAiActive(playerIndex !== localPlayerIndex)`; in single player the last `turnStarted` for player 0 sets aiActive false. This replaces the old `runAiPhase` sequencing.

- [ ] **Step 9: Verify single-player behavior**

Run: `npm run typecheck && npm run build && npm test`
Expected: PASS.

Then start the dev server (`npm run dev`), start a single-player game, and verify manually:
- Unit moves animate; fog lifts on newly explored cells.
- Attacks show HP floats, popups, kill score flies.
- End turn runs AI turns with popups/camera; income populates; the turn counter increments; "Your turn" popup returns.
- Capture mode win and 30-turn win end the game.

- [ ] **Step 10: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "refactor: drive single-player through the simulator and event presenter"
```

---

### Task 8: Peer session (network layer)

**Files:**
- Create: `src/net/peerSession.ts`
- Test: `tests/peerSession.test.ts`

**Interfaces:**
- Consumes: `Command` from `../game/simulator`, `GameEvent` from `../game/events`, `GameStateSnapshot` from `../game/state`, `Tribe` from `../game/tribes`.
- Produces (used by Tasks 9–11):
  - `type ClientMessage`, `type HostMessage`, `interface LobbyPlayer`
  - `generateRoomCode(): string`
  - `hostPeerId(code: string): string`
  - `class HostSession` with `open(code)`, `close()`, `broadcast(msg)`, `sendTo(peerId, msg)`
  - `class ClientSession` with `join(code, name)`, `send(msg)`, `close()`

- [ ] **Step 1: Write the failing test `tests/peerSession.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { generateRoomCode, hostPeerId, ClientMessage, HostMessage } from '../src/net/peerSession';

describe('peerSession protocol', () => {
  it('generateRoomCode returns 6 chars from the safe alphabet', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(900);
  });

  it('hostPeerId prefixes the code', () => {
    expect(hostPeerId('ABC123')).toBe('hex-ABC123');
  });

  it('ClientMessage and HostMessage survive JSON round-trip', () => {
    const cmd: ClientMessage = { type: 'command', cmd: { type: 'endTurn' } };
    expect(JSON.parse(JSON.stringify(cmd))).toEqual(cmd);
    const msg: HostMessage = { type: 'error', message: 'x' };
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/peerSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/net/peerSession.ts`**

```ts
import Peer, { DataConnection } from 'peerjs';
import { GameEvent } from '../game/events';
import { GameStateSnapshot } from '../game/state';
import { Command } from '../game/simulator';
import { Tribe } from '../game/tribes';

export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'pickTribe'; tribeId: Tribe }
  | { type: 'command'; cmd: Command };

export type HostMessage =
  | { type: 'lobbyUpdate'; joined: LobbyPlayer[] }
  | { type: 'state'; state: GameStateSnapshot; playerIndex: number }
  | { type: 'events'; events: GameEvent[] }
  | { type: 'error'; message: string };

export interface LobbyPlayer {
  peerId: string;
  name: string;
  tribeId: Tribe | null;
  isHost: boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOST_PREFIX = 'hex-';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function hostPeerId(code: string): string {
  return HOST_PREFIX + code;
}

export interface HostSessionEvents {
  onOpen: (peerId: string, conn: DataConnection) => void;
  onData: (peerId: string, msg: ClientMessage) => void;
  onClose: (peerId: string) => void;
}

export class HostSession {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();

  constructor(private events: HostSessionEvents) {}

  open(code: string): void {
    this.peer = new Peer(hostPeerId(code), { debug: 1 });
    this.peer.on('connection', (conn) => this.attach(conn));
  }

  private attach(conn: DataConnection): void {
    const peerId = conn.peer;
    conn.on('open', () => {
      this.conns.set(peerId, conn);
      this.events.onOpen(peerId, conn);
    });
    conn.on('data', (data) => {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        this.events.onData(peerId, data as ClientMessage);
      }
    });
    conn.on('close', () => {
      this.conns.delete(peerId);
      this.events.onClose(peerId);
    });
  }

  sendTo(peerId: string, msg: HostMessage): void {
    const conn = this.conns.get(peerId);
    if (conn && conn.open) conn.send(msg);
  }

  broadcast(msg: HostMessage): void {
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send(msg);
    }
  }

  close(): void {
    for (const conn of this.conns.values()) conn.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export interface ClientSessionEvents {
  onOpen: () => void;
  onData: (msg: HostMessage) => void;
  onClose: () => void;
  onError: (err: Error) => void;
}

export class ClientSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;

  constructor(private events: ClientSessionEvents) {}

  join(code: string, name: string): void {
    this.peer = new Peer({ debug: 1 });
    this.peer.on('open', () => {
      if (!this.peer) return;
      const conn = this.peer.connect(hostPeerId(code), { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        conn.send({ type: 'join', name } satisfies ClientMessage);
        this.events.onOpen();
      });
      conn.on('data', (data) => {
        if (typeof data === 'object' && data !== null && 'type' in data) {
          this.events.onData(data as HostMessage);
        }
      });
      conn.on('close', () => this.events.onClose());
    });
    this.peer.on('error', (err) => this.events.onError(err));
  }

  send(msg: ClientMessage): void {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close(): void {
    this.conn?.close();
    this.conn = null;
    this.peer?.destroy();
    this.peer = null;
  }
}
```

- [ ] **Step 4: Run test, typecheck, commit**

Run: `npm test -- tests/peerSession.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/net/peerSession.ts tests/peerSession.test.ts
git commit -m "feat: add PeerJS host/client sessions and protocol types"
```

---

### Task 9: Host multiplayer flow

The host wires `HostSession` events to the controller's `runCommand`, and broadcasts `state` + `events` after every command. Lobby logic (join order, tribe assignment, start) lives on the controller.

**Files:**
- Modify: `src/controller/gameController.ts`
- Modify: `src/store/gameStore.ts` (no — Task 5 done; if `setScreen('lobby')` handling needed here, use existing setter)

**Interfaces:**
- Consumes: `HostSession`, `LobbyPlayer` from `peerSession.ts`; store `lobby`/`netMode`/`localPlayerIndex`.
- Produces (used by Task 11 and Task 12):
  - `hostGame(opts: { mode: GameMode; totalPlayers: number; aiCount: number; name: string; tribe: Tribe }): string` (returns room code)
  - `pickHostTribe(tribe: Tribe): void`
  - `startHostGame(): void`
  - `private onHostData(peerId, msg: ClientMessage): void`
  - `private broadcastBatch(): void`

- [ ] **Step 1: Add host state fields to the controller**

```ts
  private hostSession: HostSession | null = null;
  private hostPlayers: { peerId: string; name: string; tribeId: Tribe | null }[] = [];
  private hostName = '';
  private hostTribe: Tribe | null = null;
  private hostConfig: { mode: GameMode; totalPlayers: number; aiCount: number } | null = null;
```

- [ ] **Step 2: Implement host lobby + start**

```ts
  hostGame(opts: { mode: GameMode; totalPlayers: number; aiCount: number; name: string; tribe: Tribe }): string {
    const code = generateRoomCode();
    this.hostConfig = { mode: opts.mode, totalPlayers: opts.totalPlayers, aiCount: opts.aiCount };
    this.hostName = opts.name;
    this.hostTribe = opts.tribe;
    this.hostPlayers = [];
    this.hostSession = new HostSession({
      onOpen: (peerId) => {
        this.hostPlayers.push({ peerId, name: '', tribeId: null });
        this.broadcastLobby();
      },
      onData: (peerId, msg) => this.onHostData(peerId, msg),
      onClose: (peerId) => {
        this.hostPlayers = this.hostPlayers.filter((p) => p.peerId !== peerId);
        this.broadcastLobby();
      },
    });
    this.hostSession.open(code);
    const store = useGameStore.getState();
    store.setNetMode('host');
    store.setLocalPlayerIndex(0);
    store.setLobby({
      role: 'host',
      code,
      mode: opts.mode,
      totalPlayers: opts.totalPlayers,
      aiCount: opts.aiCount,
      players: [{ peerId: 'host', name: opts.name, tribeId: opts.tribe, isHost: true }],
    });
    store.setScreen('lobby');
    return code;
  }

  pickHostTribe(tribe: Tribe): void {
    this.hostTribe = tribe;
    const store = useGameStore.getState();
    const lobby = store.lobby;
    if (!lobby) return;
    store.setLobby({ ...lobby, players: lobby.players.map((p) => (p.isHost ? { ...p, tribeId: tribe } : p)) });
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    if (!this.hostSession) return;
    const joined: LobbyPlayer[] = [
      { peerId: 'host', name: this.hostName, tribeId: this.hostTribe, isHost: true },
      ...this.hostPlayers,
    ];
    useGameStore.getState().setLobby({
      role: 'host',
      code: this.hostConfig ? this.hostSession ? useGameStore.getState().lobby?.code ?? '' : '' : '',
      mode: this.hostConfig?.mode ?? 'capture',
      totalPlayers: this.hostConfig?.totalPlayers ?? 0,
      aiCount: this.hostConfig?.aiCount ?? 0,
      players: joined,
    });
    this.hostSession.broadcast({ type: 'lobbyUpdate', joined });
  }

  private onHostData(peerId: string, msg: ClientMessage): void {
    switch (msg.type) {
      case 'join': {
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.name = msg.name;
        this.broadcastLobby();
        break;
      }
      case 'pickTribe': {
        const entry = this.hostPlayers.find((p) => p.peerId === peerId);
        if (entry) entry.tribeId = msg.tribeId;
        this.broadcastLobby();
        break;
      }
      case 'command': {
        this.handleClientCommand(peerId, msg.cmd);
        break;
      }
    }
  }

  private handleClientCommand(peerId: string, cmd: Command): void {
    const store = useGameStore.getState();
    if (!this.sim || this.sim.gameOver) return;
    const entry = this.hostPlayers.find((p) => p.peerId === peerId);
    if (!entry) return;
    const playerIndex = this.sim.players.findIndex((p) => p.name === entry.name);
    if (playerIndex < 0) return;
    if (this.sim.currentPlayerIndex !== playerIndex) return;
    if (this.sim.players[playerIndex].isHuman !== true) return;
    const preExplored = this.exploredKeysFor(playerIndex);
    this.sim.applyCommand(cmd);
    this.syncStore();
    const events = this.sim.drainEvents();
    this.broadcastBatch(events);
    void this.presentEvents(events, preExplored).then(() => this.render());
  }

  private broadcastBatch(events: GameEvent[]): void {
    if (!this.hostSession || !this.sim) return;
    const snap = this.sim.snapshot();
    for (const entry of this.hostPlayers) {
      const playerIndex = this.sim.players.findIndex((p) => p.name === entry.name);
      if (playerIndex < 0) continue;
      this.hostSession.sendTo(entry.peerId, { type: 'state', state: snap, playerIndex });
    }
    if (events.length > 0) this.hostSession.broadcast({ type: 'events', events });
  }

  startHostGame(): void {
    const store = useGameStore.getState();
    if (!this.hostConfig || !this.hostTribe) return;
    const lobby = store.lobby;
    if (!lobby) return;
    const humans = [
      { name: this.hostName, tribe: this.hostTribe },
      ...this.hostPlayers.filter((p) => p.name && p.tribeId !== null).map((p) => ({ name: p.name, tribe: p.tribeId! })),
    ];
    const players = buildMultiplayerPlayers(humans, this.hostConfig.aiCount, new SeededRandom(Math.floor(Math.random() * 100000)));
    const map = generateMap(players.length, Math.floor(Math.random() * 100000));
    for (const p of players) initialExplorationFor(map, p.index);
    this.sim = new Simulator(map, players, this.hostConfig.mode);
    this.sim.startGame();
    store.setPlayers(players);
    store.setMode(this.hostConfig.mode);
    store.setExpectedTurns(this.sim.expectedTurns);
    store.setGameOver(false);
    store.setWinnerIndex(null);
    store.setBonusAwarded(false);
    store.setLocalPlayerIndex(0);
    store.setNetMode('host');
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setScreen('game');
    if (this.app) {
      this.applyFitToScreen();
      this.textures = createTextures(this.app, map, HEX_SIZE * this.qualityFactor);
    }
    this.render();
    const hostPlayer = players[0];
    showPopup(`${hostPlayer.name}'s turn!`, { background: tribeBackground(hostPlayer) });
    this.broadcastBatch(this.sim.drainEvents());
  }
```

Note: `broadcastBatch` must not be called twice for the same events — in `startHostGame` the `sim.drainEvents()` call at the end returns the `turnStarted` event, which is also consumed by the local popup above. Take care to drain once. Adjust: drain into a variable, present locally from it, then broadcast it.

Also note `broadcastBatch(events)` takes an explicit events array so the caller controls the drain. When `runCommand` is used by the host's own actions (Task 10 below), the host's local actions should also broadcast. See Task 10 step 1.

- [ ] **Step 3: Wire the host's own actions to broadcast**

Modify `runCommand` so that when `netMode === 'host'` it broadcasts after applying:

```ts
  async runCommand(cmd: Command): Promise<void> {
    if (!this.sim || this.sim.gameOver) return;
    const store = useGameStore.getState();
    if (store.aiActive && cmd.type !== 'endTurn') return;
    const preExplored = this.exploredKeysFor(store.localPlayerIndex);
    const ok = this.sim.applyCommand(cmd);
    this.syncStore();
    if (!ok && cmd.type !== 'endTurn') return;
    const events = this.sim.drainEvents();
    if (store.netMode === 'host') this.broadcastBatch(events);
    await this.presentEvents(events, preExplored);
    this.render();
  }
```

- [ ] **Step 4: Typecheck, build, commit**

Run: `npm run typecheck && npm run build`
Expected: PASS. (Client flow is Task 10 — `startHostGame`/`handleClientCommand` compile against `ClientMessage`/`Command` types.)

```bash
git add src/controller/gameController.ts
git commit -m "feat: host multiplayer lobby, command validation, and state broadcast"
```

---

### Task 10: Client multiplayer flow

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `ClientSession` from `peerSession.ts`; `runCommand`, `adoptSnapshot`, `presentEvents`, `pendingClientEvents` from prior tasks.
- Produces:
  - `joinGame(code: string, name: string): void`
  - `pickClientTribe(tribe: Tribe): void`
  - `private onHostMessage(msg: HostMessage): void`
  - Client input handlers route through `sendCommand` (see below).

- [ ] **Step 1: Add client state fields and `sendCommand`**

```ts
  private clientSession: ClientSession | null = null;
  private clientName = '';

  private sendCommand(cmd: Command): void {
    const store = useGameStore.getState();
    if (store.netMode === 'client') {
      this.clientSession?.send({ type: 'command', cmd });
    } else {
      void this.runCommand(cmd);
    }
  }
```

- [ ] **Step 2: Implement join + host-message handling**

```ts
  joinGame(code: string, name: string): void {
    this.clientName = name;
    const store = useGameStore.getState();
    store.setNetMode('client');
    store.setConnection('connecting');
    this.clientSession = new ClientSession({
      onOpen: () => store.setConnection('connected'),
      onData: (msg) => this.onHostMessage(msg),
      onClose: () => {
        store.setConnection('error');
      },
      onError: () => store.setConnection('error'),
    });
    this.clientSession.join(code, name);
  }

  pickClientTribe(tribe: Tribe): void {
    this.clientSession?.send({ type: 'pickTribe', tribeId: tribe });
  }

  private onHostMessage(msg: HostMessage): void {
    const store = useGameStore.getState();
    switch (msg.type) {
      case 'lobbyUpdate':
        store.setLobby({
          role: 'client',
          code: store.lobby?.code ?? '',
          mode: store.lobby?.mode ?? 'capture',
          totalPlayers: store.lobby?.totalPlayers ?? 0,
          aiCount: store.lobby?.aiCount ?? 0,
          players: msg.joined,
        });
        break;
      case 'state': {
        store.setLocalPlayerIndex(msg.playerIndex);
        store.setPendingSnapshot(msg.state);
        store.setPlayers(msg.state.players);
        store.setMode(msg.state.mode);
        store.setTurn(msg.state.turn);
        store.setCurrentPlayerIndex(msg.state.currentPlayerIndex);
        store.setGameOver(msg.state.gameOver);
        store.setWinnerIndex(msg.state.winnerIndex);
        store.setExpectedTurns(msg.state.expectedTurns);
        store.setBonusAwarded(msg.state.bonusAwarded);
        store.setAiActive(msg.state.currentPlayerIndex !== msg.playerIndex);
        store.setSelection(null);
        store.setScreen('game');
        this.adoptSnapshot(msg.state);
        break;
      }
      case 'events':
        if (this.app) {
          void this.presentEvents(msg.events, new Set());
        } else {
          this.pendingClientEvents.push(...msg.events);
        }
        break;
      case 'error':
        store.setConnection('error');
        showPopup(msg.message, { background: '#c0392b' });
        break;
    }
  }
```

- [ ] **Step 3: Route client input through `sendCommand`**

In the action methods from Task 7, replace `void this.runCommand(cmd)` with `this.sendCommand(cmd)` (capture, attack, spawn, heal, upgradeVillage, build, openSkill, upgradeShip, extractForest, shipLanding, move in `handleMapClick`, and `endTurn`). `handleMapClick` and `endTurn` should call `this.sendCommand(...)`.

- [ ] **Step 4: Typecheck, build, commit**

Run: `npm run typecheck && npm run build`
Expected: PASS.

```bash
git add src/controller/gameController.ts
git commit -m "feat: client multiplayer join and host-message handling"
```

---

### Task 11: Lobby screen and routing

**Files:**
- Create: `src/screens/LobbyScreen.tsx`
- Modify: `src/screens/StartScreen.tsx`
- Modify: `src/screens/SetupScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `gameController.hostGame`, `pickHostTribe`, `pickClientTribe`, `startHostGame`, `joinGame`; store `lobby`, `connection`, `netMode`, `setScreen`.
- Produces: `LobbyScreen` rendered when `screen === 'lobby'`.

- [ ] **Step 1: Modify `src/screens/StartScreen.tsx`** — two buttons:

```tsx
import { useGameStore } from '../store/gameStore';

export function StartScreen(): React.ReactElement {
  const setScreen = useGameStore((s) => s.setScreen);
  return (
    <div className="screen">
      <h1>Hex</h1>
      <button onClick={() => setScreen('setup')}>Single player</button>
      <button onClick={() => setScreen('lobby')}>Multiplayer</button>
    </div>
  );
}
```

- [ ] **Step 2: Modify `src/App.tsx`** — route `'lobby'` to `LobbyScreen`:

```tsx
import { LobbyScreen } from './screens/LobbyScreen';

export function App(): React.ReactElement {
  const screen = useGameStore((s) => s.screen);
  if (screen === 'start') return <StartScreen />;
  if (screen === 'setup') return <SetupScreen />;
  if (screen === 'lobby') return <LobbyScreen />;
  return <GameScreen />;
}
```

- [ ] **Step 3: Create `src/screens/LobbyScreen.tsx`**

A single screen with three sub-views (menu → host → room, menu → join → room), tracked with local React state:

```tsx
import { useState } from 'react';
import { gameController } from '../controller/gameController';
import { useGameStore } from '../store/gameStore';
import { TRIBES, Tribe } from '../game/tribes';
import { GAME_MODE_NAMES, GameMode } from '../game/gameMode';

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function LobbyScreen(): React.ReactElement {
  const lobby = useGameStore((s) => s.lobby);
  const connection = useGameStore((s) => s.connection);
  const setScreen = useGameStore((s) => s.setScreen);
  const [view, setView] = useState<'menu' | 'host' | 'join'>('menu');
  const [mode, setMode] = useState<GameMode>('capture');
  const [totalPlayers, setTotalPlayers] = useState(3);
  const [aiCount, setAiCount] = useState(1);
  const [name, setName] = useState('Player');
  const [code, setCode] = useState('');

  const humanSlots = totalPlayers - aiCount;
  const filled = lobby?.players.filter((p) => p.tribeId !== null).length ?? 0;
  const ready = lobby !== null && filled >= humanSlots;

  if (view === 'menu') {
    return (
      <div className="screen">
        <h2>Multiplayer</h2>
        <button onClick={() => setView('host')}>Host game</button>
        <button onClick={() => setView('join')}>Join game</button>
        <button onClick={() => setScreen('start')}>Back</button>
      </div>
    );
  }

  if (view === 'host' && !lobby) {
    return (
      <div className="screen">
        <h2>Host game</h2>
        <div>
          Name: <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          {TRIBES.map((t) => (
            <button
              key={t.id}
              style={{ background: colorCss(t.color) }}
              onClick={() => gameController.hostGame({ mode, totalPlayers, aiCount, name, tribe: t.id })}
            >
              Host as {t.name}
            </button>
          ))}
        </div>
        <h3>Players</h3>
        <div>{[2, 3, 4].map((n) => (
          <button key={n} className={totalPlayers === n ? 'selected' : ''} onClick={() => setTotalPlayers(n)}>{n}</button>
        ))}</div>
        <h3>AI</h3>
        <div>{Array.from({ length: Math.max(1, totalPlayers - 1) }, (_, i) => i).map((n) => (
          <button key={n} className={aiCount === n ? 'selected' : ''} onClick={() => setAiCount(n)}>{n}</button>
        ))}</div>
        <h3>Mode</h3>
        <div>{(['capture', 'turns30'] as GameMode[]).map((m) => (
          <button key={m} className={mode === m ? 'selected' : ''} onClick={() => setMode(m)}>{GAME_MODE_NAMES[m]}</button>
        ))}</div>
      </div>
    );
  }

  if (view === 'join' && !lobby) {
    return (
      <div className="screen">
        <h2>Join game</h2>
        <div>Code: <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
        <div>Name: <input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button disabled={code.length !== 6} onClick={() => gameController.joinGame(code, name)}>Join</button>
        <div>{connection === 'connecting' && 'Connecting...'}</div>
        <button onClick={() => setView('menu')}>Back</button>
      </div>
    );
  }

  // Room view (host or client)
  const isHost = lobby?.role === 'host';
  const isClient = lobby?.role === 'client';
  const myTribe = lobby?.players.find((p) => p.isHost)?.tribeId;
  const taken = new Set((lobby?.players ?? []).map((p) => p.tribeId).filter((t): t is Tribe => t !== null));

  return (
    <div className="screen">
      <h2>{isHost ? 'Your room' : 'Room'}</h2>
      <div>Code: <strong>{lobby?.code}</strong></div>
      <h3>Players</h3>
      <ul>
        {(lobby?.players ?? []).map((p) => (
          <li key={p.peerId}>
            {p.name || '...'} {p.tribeId !== null && TRIBES.find((t) => t.id === p.tribeId)?.name}
          </li>
        ))}
      </ul>
      {isHost && (
        <>
          <h3>Your tribe</h3>
          <div>
            {TRIBES.filter((t) => !taken.has(t.id) || t.id === myTribe).map((t) => (
              <button key={t.id} className={myTribe === t.id ? 'selected' : ''} style={{ background: colorCss(t.color) }} onClick={() => gameController.pickHostTribe(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <button disabled={!ready} onClick={() => gameController.startHostGame()}>Start game</button>
        </>
      )}
      {isClient && (
        <>
          <h3>Your tribe</h3>
          <div>
            {TRIBES.filter((t) => !taken.has(t.id)).map((t) => (
              <button key={t.id} style={{ background: colorCss(t.color) }} onClick={() => gameController.pickClientTribe(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck, build, manual smoke test**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Manual (two browser tabs against one `npm run dev`): open tab A → Multiplayer → Host game (pick tribe, 3 players, 1 AI) → note code. Open tab B → Multiplayer → Join → enter code + name → pick a tribe. Verify both lobbies update. Host clicks Start. Verify both reach the game screen and the same map renders. On the client's turn, move a unit; verify the host sees the move animate.

- [ ] **Step 5: Commit**

```bash
git add src/screens/LobbyScreen.tsx src/screens/StartScreen.tsx src/App.tsx
git commit -m "feat: lobby screen for hosting and joining P2P games"
```

---

### Task 12: Client receives and presents the initial snapshot correctly

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `pendingSnapshot` from the store; `Simulator.fromSnapshot`.
- Produces: `init()` adopts a pending snapshot before rendering (covers the client path where the snapshot arrives before `GameScreen` mounts).

- [ ] **Step 1: In `init()`, adopt a pending snapshot**

Add at the top of `init()` (after the early return and before `app.init`):

```ts
    const pending = useGameStore.getState().pendingSnapshot;
    if (pending && !this.sim) {
      this.sim = Simulator.fromSnapshot(pending);
      this.sim.drainEvents();
      useGameStore.getState().setPendingSnapshot(null);
    }
```

The existing `if (this.sim)` block inside the `.then()` already renders once init completes.

- [ ] **Step 2: Ensure `presentPendingClientEvents` is called after first render**

Inside the `.then()` block in `init()`, after `this.render()`, add `this.presentPendingClientEvents();`.

- [ ] **Step 3: Typecheck, build, manual test**

Run: `npm run typecheck && npm run build`
Expected: PASS.

Manual: join a game from a second tab (or a fresh reload) and confirm the map appears and client input works on the client's turn.

- [ ] **Step 4: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "fix: adopt pending client snapshot during renderer init"
```

---

### Task 13: End-to-end verification and cleanup

**Files:**
- Modify: `GAME.md` (optional — document multiplayer; the user asked for elaboration, not docs; skip unless asked)
- Run full suite.

- [ ] **Step 1: Run the full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 2: Manual end-to-end test (two browser tabs/devices)**

Scenario A — host is not eliminated and AI participates:
1. Tab A: Multiplayer → Host as Cats, 3 players, 1 AI, mode Capture.
2. Tab B: Multiplayer → Join, code, name, pick a tribe.
3. Both see the lobby; host starts.
4. Host takes a turn (move a unit, attack a village, end turn).
5. Client's turn: client moves/attacks/spawns; host sees it.
6. AI turn: both see AI actions and popups.
7. Income applies; turn counter increments; fog renders per player (each sees only their own explored area).
8. Play until capture win or 30-turn win; verify both show the same winner.

Scenario B — client disconnects mid-game:
9. Close tab B; verify tab A does not crash (the game continues with the client's player skipped via `isActive` only if eliminated — otherwise the turn stops at a missing player; confirm the host does not hang and, at minimum, shows no error popup spam).

Note any issues found and fix them (this may mean editing `gameController.ts`, `peerSession.ts`, or `LobbyScreen.tsx`).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end multiplayer issues"
```

- [ ] **Step 4: Report**

Summarize for the user: how to host and join a game, the topology (host authority, PeerJS signaling), what runs where, and known limitations (host must stay online; no resync/reconnect; full-state sync leaks map info to all peers).
