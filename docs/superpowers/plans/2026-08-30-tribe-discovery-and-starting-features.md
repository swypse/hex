# Tribe Discovery + Starting Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enemy tribes start unknown and are revealed when the first unit of that tribe appears on a tile the local player has explored; add per-tribe starting bonuses.

**Architecture:** Known tribes are derived (no new synced state) via `knownTribesFor(map, players, playerIndex)` in a new `src/game/discovery.ts`, computed from units on tiles explored by the local player plus the player's own tribe. The renderer and stats screen use it directly for gray-vs-tribe-color rendering; the controller tracks the set privately to fire "You meet X!" notifications on transitions. Tribe starting bonuses live on `TribeInfo` and are applied in `players.ts`.

**Tech Stack:** TypeScript, PixiJS, React/Zustand, Vite, Vitest.

## Global Constraints

- Unknown-tribe color is `0x888888` (gray). Both the territory border and the village name pill use it.
- A tribe is known once any of its units (owner `>= 0`, i.e. not a pirate) stands on a tile explored by the local player; the local player's own tribe is always known.
- Discovery notification text is exactly `You meet {TribeName}!`; multiple discoveries in one batch are chained sequentially (~1100 ms apart).
- Starting features: Villagers `+10` money (start `15`); Barbarians start skill `climbing`; Cats `shields`; Warriors `swordsman`; Forest people `forestry`; Aqua people `navigation`. Exactly the listed skill is opened — parents stay unopened — and no +15 action score is awarded. Bonuses apply to human and AI players alike.
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: `src/game/discovery.ts` — known-tribes derivation

**Files:**
- Create: `src/game/discovery.ts`
- Create: `tests/discovery.test.ts`

**Interfaces:**
- Consumes: `isExploredFor` from `./explore`, `Player` from `./players`, `Tribe`/`TribeInfo` from `./tribes`, `GameMap` from `./mapGen`.
- Produces:
  - `knownTribesFor(map: GameMap, players: Player[], playerIndex: number): Set<Tribe>`
  - `UNKNOWN_TRIBE_COLOR = 0x888888`
  - `territoryColor(tribe: TribeInfo, known: boolean): number`
  Later tasks (renderer, stats, controller) consume these.

- [ ] **Step 1: Write the failing test**

Create `tests/discovery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { knownTribesFor, territoryColor, UNKNOWN_TRIBE_COLOR } from '../src/game/discovery';
import { TRIBES, Tribe } from '../src/game/tribes';
import { START_RESOURCES } from '../src/game/resources';
import { Player } from '../src/game/players';

function player(index: number, tribe: Tribe): Player {
  return { index, tribe, isHuman: index === 0, name: `p${index}`, resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true };
}

describe('knownTribesFor', () => {
  it('always knows the local player own tribe', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Warriors)];
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
  });

  it('discovers a tribe whose unit stands on an explored tile', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Warriors)];
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers, Tribe.Warriors]));
  });

  it('ignores units on tiles the local player has not explored', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Warriors)];
    const tile = tileAt(map, 1, 0)!;
    tile.exploredBy = [1];
    tile.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
  });

  it('ignores pirates (owner -1)', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers)];
    tileAt(map, 1, 0)!.unit = makeUnit('pirate', -1, 'pirate', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
  });

  it('does not count another player exploration', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Cats), player(2, Tribe.Aqua)];
    const tile = tileAt(map, 1, 0)!;
    tile.exploredBy = [2];
    tile.unit = makeUnit('u1', 2, 'warrior', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
    expect(knownTribesFor(map, players, 2)).toEqual(new Set([Tribe.Villagers, Tribe.Aqua]));
  });
});

describe('territoryColor', () => {
  it('returns the tribe color when known and gray when unknown', () => {
    const forest = TRIBES.find((t) => t.id === Tribe.Forest)!;
    expect(territoryColor(forest, true)).toBe(forest.color);
    expect(territoryColor(forest, false)).toBe(UNKNOWN_TRIBE_COLOR);
    expect(UNKNOWN_TRIBE_COLOR).toBe(0x888888);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- discovery.test.ts`
Expected: FAIL (module `../src/game/discovery` not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/game/discovery.ts`:

```ts
import { isExploredFor } from './explore';
import { GameMap } from './mapGen';
import { Player } from './players';
import { Tribe, TribeInfo } from './tribes';

export const UNKNOWN_TRIBE_COLOR = 0x888888;

export function knownTribesFor(map: GameMap, players: Player[], playerIndex: number): Set<Tribe> {
  const known = new Set<Tribe>();
  const local = players[playerIndex];
  if (local) known.add(local.tribe);
  for (const tile of map.tiles) {
    const unit = tile.unit;
    if (!unit || unit.owner < 0) continue;
    if (!isExploredFor(tile, playerIndex)) continue;
    const owner = players[unit.owner];
    if (owner) known.add(owner.tribe);
  }
  return known;
}

export function territoryColor(tribe: TribeInfo, known: boolean): number {
  return known ? tribe.color : UNKNOWN_TRIBE_COLOR;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- discovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/discovery.ts tests/discovery.test.ts
git commit -m "feat: derive known tribes from explored units"
```

---

### Task 2: Tribe starting features

**Files:**
- Modify: `src/game/tribes.ts`
- Modify: `src/game/players.ts`
- Modify: `tests/tribes.test.ts`
- Modify: `tests/players.test.ts`
- Modify: `tests/simulatorTurn.test.ts:29`

**Interfaces:**
- Consumes: `SkillId` type from `./skills`.
- Produces: `TribeInfo.startMoneyBonus?: number` and `TribeInfo.startSkill?: SkillId`; `buildPlayers`/`buildMultiplayerPlayers` apply them. Later tasks only rely on `TribeInfo` being unchanged otherwise.

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe('TRIBES')` block in `tests/tribes.test.ts` (`TRIBES` is already imported there):

```ts
  it('declares the tribe starting bonuses', () => {
    const byCode = new Map(TRIBES.map((t) => [t.code, t]));
    expect(byCode.get('villagers')!.startMoneyBonus).toBe(10);
    expect(byCode.get('barbarians')!.startSkill).toBe('climbing');
    expect(byCode.get('cats')!.startSkill).toBe('shields');
    expect(byCode.get('warriors')!.startSkill).toBe('swordsman');
    expect(byCode.get('forest')!.startSkill).toBe('forestry');
    expect(byCode.get('aqua')!.startSkill).toBe('navigation');
  });
```

Update `tests/players.test.ts` — replace the `starts all players with START_RESOURCES and no skills` test (lines 25-33) with a tribe-aware version, and replace the `initializes resources to start values` test (lines 94-99):

```ts
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
    expect(players[0].resources.money).toBe(15);
  });
```

Add the `TRIBES` import to `tests/players.test.ts` (`import { TRIBES, Tribe } from '../src/game/tribes';`).

Update `tests/simulatorTurn.test.ts:29`:

```ts
    expect(players[0].resources.money).toBe(15 + 4);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- players.test.ts tribes.test.ts simulatorTurn.test.ts`
Expected: FAIL (Villagers money still 5; starting skills not applied; type errors on `startMoneyBonus`/`startSkill`).

- [ ] **Step 3: Write minimal implementation**

`src/game/tribes.ts` — add the `SkillId` import and the two optional fields, then extend the tribe entries:

```ts
import { TRIBE_COLORS } from '../config';
import { SkillId } from './skills';

export interface TribeInfo {
  id: Tribe;
  name: string;
  code: string;
  color: number;
  startMoneyBonus?: number;
  startSkill?: SkillId;
}
```

In the `TRIBES` array add the fields:

```ts
  { id: Tribe.Villagers, name: 'Villagers', code: 'villagers', color: TRIBE_COLORS.Villagers, startMoneyBonus: 10 },
  { id: Tribe.Warriors, name: 'Warriors', code: 'warriors', color: TRIBE_COLORS.Warriors, startSkill: 'swordsman' },
  { id: Tribe.Barbarians, name: 'Barbarians', code: 'barbarians', color: TRIBE_COLORS.Barbarians, startSkill: 'climbing' },
  { id: Tribe.Cats, name: 'Cats', code: 'cats', color: TRIBE_COLORS.Cats, startSkill: 'shields' },
  { id: Tribe.Forest, name: 'Forest people', code: 'forest', color: TRIBE_COLORS.Forest, startSkill: 'forestry' },
  { id: Tribe.Aqua, name: 'Aqua people', code: 'aqua', color: TRIBE_COLORS.Aqua, startSkill: 'navigation' },
```

`src/game/players.ts` — add two helpers and use them in both builders:

```ts
function startingResourcesFor(tribe: Tribe): Resources {
  const info = TRIBES.find((t) => t.id === tribe)!;
  return { ...START_RESOURCES, money: START_RESOURCES.money + (info.startMoneyBonus ?? 0) };
}

function startingSkillsFor(tribe: Tribe): SkillId[] {
  const info = TRIBES.find((t) => t.id === tribe)!;
  return info.startSkill ? [info.startSkill] : [];
}
```

In `buildPlayers`, replace the player literal construction (`resources: { ...START_RESOURCES }, ... skills: []`) for the human and the AI loop:

```ts
  const players: Player[] = [
    { index: 0, tribe: humanTribe, isHuman: true, name: names[0], resources: startingResourcesFor(humanTribe), score: 0, kills: 0, skills: startingSkillsFor(humanTribe), isActive: true },
  ];
  for (const tribe of enemyTribes) {
    players.push({
      index: players.length,
      tribe,
      isHuman: false,
      name: names[players.length],
      resources: startingResourcesFor(tribe),
      score: 0,
      kills: 0,
      skills: startingSkillsFor(tribe),
      isActive: true,
    });
  }
```

In `buildMultiplayerPlayers`, replace both the humans `map` and the AI loop to use `startingResourcesFor(h.tribe)` / `startingSkillsFor(h.tribe)` and `startingResourcesFor(aiTribes[i])` / `startingSkillsFor(aiTribes[i])`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- players.test.ts tribes.test.ts simulatorTurn.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite to catch any other test that assumed the old starting state**

Run: `npm test`
Expected: all pass. If any test that builds players via `buildPlayers`/`buildMultiplayerPlayers` asserts `money: 5` or `skills: []` for a tribe with a bonus, update it to the tribe-aware form shown above (look up `TRIBES` for the player's tribe).

- [ ] **Step 6: Commit**

```bash
git add src/game/tribes.ts src/game/players.ts tests/tribes.test.ts tests/players.test.ts tests/simulatorTurn.test.ts
git commit -m "feat: tribe starting money and skill bonuses"
```

---

### Task 3: Render unknown-tribe borders gray, tribe color when known

**Files:**
- Modify: `src/render/tileSignature.ts`
- Modify: `src/render/mapRenderer.ts`
- Modify: `tests/tileSignature.test.ts`

**Interfaces:**
- Consumes: `knownTribesFor`, `territoryColor` from `./game/discovery`.
- Produces: `tileSignature(tile, map, localPlayerIndex, hiddenUnitIds, knownOwners?: Set<number>)` gains a 5th optional param; `MapRenderer` renders unknown-owner territory/labels gray.

- [ ] **Step 1: Write the failing test**

Append to `tests/tileSignature.test.ts` inside the `describe('tileSignature')` block:

```ts
  it('changes when the owner tribe becomes known', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0];
    t.ownedBy = 1;
    const a = tileSignature(t, map, 0, new Set());
    const b = tileSignature(t, map, 0, new Set(), new Set([1]));
    expect(a).not.toBe(b);
  });

  it('keeps an unknown-owner signature stable across calls', () => {
    const map = generateMap(2, 42);
    const t = map.tiles[0];
    t.ownedBy = 1;
    expect(tileSignature(t, map, 0, new Set())).toBe(tileSignature(t, map, 0, new Set()));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tileSignature.test.ts`
Expected: FAIL (adding `knownOwners` does not change the signature; the 5th argument is ignored).

- [ ] **Step 3: Write minimal implementation**

`src/render/tileSignature.ts` — add the parameter and a signature component:

```ts
export function tileSignature(
  tile: MapTile,
  map: GameMap,
  localPlayerIndex: number,
  hiddenUnitIds: Set<string>,
  knownOwners?: Set<number>,
): string {
  // ... existing body unchanged ...
  const ownerKnown = tile.ownedBy === null ? '-' : (knownOwners?.has(tile.ownedBy) ? 'k' : 'u');
  return [
    // ... existing entries ...
    neighborRoads,
    ownerKnown,
  ].join('|');
}
```

(`knownOwners` is the set of player indices whose tribe is known to the local player.)

`src/render/mapRenderer.ts`:

- Add imports: `import { knownTribesFor, territoryColor } from '../game/discovery';`
- Add a private field next to the other fields (near `private map: GameMap | null`):

```ts
  private knownOwners = new Set<number>();
```

- In `update(...)`, right after `this.map = map;`, compute the set:

```ts
    const known = knownTribesFor(map, players, localPlayerIndex);
    this.knownOwners = new Set(players.filter((p) => known.has(p.tribe)).map((p) => p.index));
```

- Pass it to the signature computation (line ~132):

```ts
      const sig = tileSignature(tile, map, localPlayerIndex, hiddenUnitIds, this.knownOwners);
```

- In `drawTileTerritory` (line ~399), replace `.fill(tribe.color)` with:

```ts
      g.poly([ax, ay, bx, by, bxIn, byIn, axIn, ayIn]).fill(territoryColor(tribe, this.knownOwners.has(owner)));
```

- In `addVillageLabel` (line ~814), replace `.fill(tribe.color)` with:

```ts
      .fill(territoryColor(tribe, this.knownOwners.has(owner)));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tileSignature.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/tileSignature.ts src/render/mapRenderer.ts tests/tileSignature.test.ts
git commit -m "feat: gray borders and labels for unknown tribes"
```

---

### Task 4: Stats screen shows "Unknown tribe"

**Files:**
- Modify: `src/ui/overlays/GameStats.ts`
- Create: `tests/gameStats.test.ts`

**Interfaces:**
- Consumes: `knownTribesFor`, `UNKNOWN_TRIBE_COLOR` from `./game/discovery`, `gameController.getMap()`.
- Produces: GameStats rows show `Unknown tribe` in gray for undiscovered tribes.

- [ ] **Step 1: Write the failing test**

Create `tests/gameStats.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { GameStats } from '../src/ui/overlays/GameStats';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { TRIBES, Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('GameStats unknown tribes', () => {
  let stats: GameStats;
  let root: Container;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  afterEach(() => {
    stats.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  const mount = (map: ReturnType<typeof makeTestMap>): { enemyName: string } => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyName = TRIBES.find((t) => t.id === players[1].tribe)!.name;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    stats = new GameStats();
    stats.mount(makeHost(), root);
    return { enemyName };
  };

  const renderedTexts = (): string[] =>
    root.children
      .filter((c) => c instanceof Text)
      .map((t) => String((t as Text).text));

  it('shows "Unknown tribe" while the enemy tribe is undiscovered', () => {
    const map = makeTestMap();
    const tile = tileAt(map, 1, 0)!;
    tile.exploredBy = [1];
    tile.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    mount(map);
    expect(renderedTexts().some((s) => s.includes('Unknown tribe'))).toBe(true);
  });

  it('shows the tribe name once its unit is on an explored tile', () => {
    const map = makeTestMap();
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const { enemyName } = mount(map);
    expect(renderedTexts().some((s) => s.includes(enemyName))).toBe(true);
    expect(renderedTexts().some((s) => s.includes('Unknown tribe'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gameStats.test.ts`
Expected: FAIL (both rows show the real tribe name; no "Unknown tribe" text).

- [ ] **Step 3: Write minimal implementation**

`src/ui/overlays/GameStats.ts` — add imports and update the row rendering:

```ts
import { knownTribesFor, UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
```

In `render()`, replace the per-row tribe/color computation (line ~74-76):

```ts
    const known = map ? knownTribesFor(map, s.players, s.localPlayerIndex) : new Set<number>();
    ranked.forEach(({ p, score }, i) => {
      const tribe = TRIBES.find((t) => t.id === p.tribe)!;
      const knownTribe = known.has(p.tribe);
      const role = p.index === s.localPlayerIndex ? ' (you)' : p.isHuman ? '' : ' (AI)';
      const t = makeLabel(`${p.name} (${knownTribe ? tribe.name : 'Unknown tribe'})${role}: ${score} pts (kills: ${p.kills})`, {
        fontSize: 18,
        fill: knownTribe ? tribe.color : UNKNOWN_TRIBE_COLOR,
      });
      t.position.set(0, i * lineH);
      this.rows!.addChild(t);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlays/GameStats.ts tests/gameStats.test.ts
git commit -m "feat: stats screen shows Unknown tribe until discovered"
```

---

### Task 5: "You meet X!" discovery notification

**Files:**
- Modify: `src/controller/gameController.ts`
- Modify: `tests/discovery.test.ts`

**Interfaces:**
- Consumes: `knownTribesFor` from `./game/discovery`, `TRIBES` (already imported).
- Produces: `GameController` private fields/methods `knownTribeIds: Set<number>` and `syncKnownTribes(notify: boolean): void`; called with `true` at the end of `presentEvents` and with `false` (silent init) in `startGame`, `startHostGame`, `adoptSnapshot`, `resumeGame`.

- [ ] **Step 1: Write the failing test**

Append to `tests/discovery.test.ts` (add the imports below the existing ones):

```ts
import { vi } from 'vitest';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { SeededRandom } from '../src/util/random';
```

Append this describe block:

```ts
describe('discovery notification', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces a newly met tribe via the center message', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    const enemyTribeName = TRIBES.find((t) => t.id === players[1].tribe)!.name;
    useGameStore.setState({ localPlayerIndex: 0, centerMessage: null });
    const gc = gameController as unknown as { knownTribeIds: Set<number>; syncKnownTribes(notify: boolean): void };
    gc.knownTribeIds = new Set([Tribe.Villagers]);
    vi.useFakeTimers();
    gc.syncKnownTribes(true);
    vi.advanceTimersByTime(0);
    expect(useGameStore.getState().centerMessage).toBe(`You meet ${enemyTribeName}!`);
  });

  it('does not announce an already-known tribe', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({ localPlayerIndex: 0, centerMessage: null });
    const gc = gameController as unknown as { knownTribeIds: Set<number>; syncKnownTribes(notify: boolean): void };
    gc.knownTribeIds = new Set([Tribe.Villagers]);
    gc.syncKnownTribes(true);
    expect(useGameStore.getState().centerMessage).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- discovery.test.ts`
Expected: FAIL (no `syncKnownTribes` method on the controller).

- [ ] **Step 3: Write minimal implementation**

`src/controller/gameController.ts`:

- Add import: `import { knownTribesFor } from '../game/discovery';`
- Add a field near the other private fields (e.g. after `private hiddenUnitIds`):

```ts
  private knownTribeIds = new Set<number>();
```

- Add these two methods (near `exploredKeysFor`):

```ts
  private deriveKnownTribes(): Set<number> {
    if (!this.sim) return new Set<number>();
    return new Set<number>(knownTribesFor(this.sim.map, this.sim.players, useGameStore.getState().localPlayerIndex));
  }

  private syncKnownTribes(notify: boolean): void {
    if (!this.sim) return;
    const current = this.deriveKnownTribes();
    if (notify) {
      const newly = [...current].filter((id) => !this.knownTribeIds.has(id));
      newly.forEach((tribeId, i) => {
        const tribe = TRIBES.find((t) => t.id === tribeId);
        if (!tribe) return;
        setTimeout(() => useGameStore.getState().setCenterMessage(`You meet ${tribe.name}!`), i * 1100);
      });
    }
    this.knownTribeIds = current;
  }
```

- In `presentEvents`, right before the closing block that reveals moved units (before `for (const id of movedIds) this.hiddenUnitIds.delete(id);`):

```ts
    this.syncKnownTribes(true);
```

- Add silent initialization `this.syncKnownTribes(false);` in each of these four places (after the store fields are set and `this.sim` is non-null):
  - `startGame` (after `store.setWelcomeOpen(true);`)
  - `startHostGame` (after `store.setWelcomeOpen(true);`)
  - `adoptSnapshot` (after `this.syncStore();`)
  - `resumeGame` (after `store.setScreen('game');`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- discovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/controller/gameController.ts tests/discovery.test.ts
git commit -m "feat: announce newly met tribes with a You meet message"
```

---

### Task 6: Full verification

**Files:**
- None.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Confirm nothing stray was left uncommitted**

Run: `git status`
Expected: no modified tracked files.
