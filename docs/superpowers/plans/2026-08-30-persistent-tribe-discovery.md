# Persistent Tribe Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tribe discovery persistent — once a player meets a tribe it stays discovered until game end (borders, stats, and the "You meet X!" announcement never revert or repeat).

**Architecture:** Persist discovered tribes per player in game state via a new optional `Player.knownTribes` array. The simulator unions currently-visible tribes into it at the end of every command (`Simulator.syncDiscoveries`), so entries are monotonic and sync across host/clients and save/load. The renderer, stats screen, and controller read this persisted set instead of deriving from current unit positions.

**Tech Stack:** TypeScript, PixiJS, React/Zustand, Vite, Vitest.

## Global Constraints

- `Player.knownTribes?: Tribe[]` is **optional** to avoid breaking the ~18 test files that construct `Player` literals; builders seed it and consumers defensively add the player's own tribe.
- Own tribe is always known: reads build the known set as `[local.tribe, ...(local.knownTribes ?? [])]`.
- `Simulator.syncDiscoveries()` unions `knownTribesFor(map, players, P)` into `players[P].knownTribes` for every player `P`; never removes entries. Called at the end of every `applyCommand`.
- No change to the discovery rule (units on explored tiles only, pirates excluded) or to the "You meet X!" text/chaining.
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: `Player.knownTribes` + seeding in builders

**Files:**
- Modify: `src/game/players.ts`
- Modify: `tests/players.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Player.knownTribes?: Tribe[]`; `buildPlayers`/`buildMultiplayerPlayers` set it to `[own tribe]`. Later tasks read this field.

- [ ] **Step 1: Write the failing test**

Add to `tests/players.test.ts` (inside `describe('buildPlayers')`):

```ts
  it('seeds every player with their own known tribe', () => {
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(42));
    for (const p of players) {
      expect(p.knownTribes).toEqual([p.tribe]);
    }
  });
```

Add to `tests/players.test.ts` (inside `describe('buildMultiplayerPlayers')`):

```ts
  it('seeds multiplayer players with their own known tribe', () => {
    const players = buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Cats }], 1, new SeededRandom(1));
    for (const p of players) {
      expect(p.knownTribes).toEqual([p.tribe]);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- players.test.ts`
Expected: FAIL (`p.knownTribes` is undefined).

- [ ] **Step 3: Write minimal implementation**

`src/game/players.ts` — add the optional field to the `Player` interface:

```ts
export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
  resources: Resources;
  score: number;
  kills: number;
  skills: SkillId[];
  isActive: boolean;
  knownTribes?: Tribe[];
}
```

In `buildPlayers`, the human literal gains `knownTribes: [humanTribe]` and the AI loop gains `knownTribes: [tribe]`. In `buildMultiplayerPlayers`, the humans `map` gains `knownTribes: [h.tribe]` and the AI loop gains `knownTribes: [aiTribes[i]]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- players.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/players.ts tests/players.test.ts
git commit -m "feat: persist discovered tribes on each player"
```

---

### Task 2: Simulator `syncDiscoveries`

**Files:**
- Modify: `src/game/simulator.ts`
- Modify: `tests/discovery.test.ts`

**Interfaces:**
- Consumes: `knownTribesFor` from `./discovery` (Task 1 of the earlier plan; already exists).
- Produces: `Simulator.syncDiscoveries()` (private), called at the end of `applyCommand`. Later tasks rely on `players[P].knownTribes` being populated and monotonic after any command.

- [ ] **Step 1: Write the failing test**

Append to `tests/discovery.test.ts` (imports for `Simulator`, `buildPlayers`, `SeededRandom`, `makeUnit` are already present from the earlier plan):

```ts
describe('simulator discovery persistence', () => {
  it('records a tribe whose unit stands on an explored tile', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const sync = (sim as unknown as { syncDiscoveries(): void }).syncDiscoveries;
    expect(players[0].knownTribes).toEqual([Tribe.Villagers]);
    sync();
    expect(players[0].knownTribes).toContain(players[1].tribe);
  });

  it('keeps a discovered tribe even after its unit leaves the explored tile', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyTile = tileAt(map, 1, 0)!;
    enemyTile.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const sync = (sim as unknown as { syncDiscoveries(): void }).syncDiscoveries;
    sync();
    enemyTile.unit = null;
    sync();
    expect(players[0].knownTribes).toContain(players[1].tribe);
  });

  it('runs syncDiscoveries on every applied command', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.applyCommand({ type: 'heal', unitId: 'does-not-exist' });
    expect(players[0].knownTribes).toContain(players[1].tribe);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- discovery.test.ts`
Expected: FAIL (`knownTribes` never gains the enemy tribe; `syncDiscoveries` is not a function).

- [ ] **Step 3: Write minimal implementation**

`src/game/simulator.ts` — add the import next to the existing `explore` import:

```ts
import { knownTribesFor } from './discovery';
```

Restructure `applyCommand` to call `syncDiscoveries()` after dispatch:

```ts
  applyCommand(cmd: Command): boolean {
    let ok = false;
    switch (cmd.type) {
      case 'move':
        ok = this.doMove(cmd.unitId, cmd.q, cmd.r);
        break;
      case 'attack':
        ok = this.doAttack(cmd.unitId, cmd.q, cmd.r);
        break;
      case 'capture':
        ok = this.doCapture(cmd.q, cmd.r, cmd.unitId);
        break;
      case 'spawn':
        ok = this.doSpawn(cmd.q, cmd.r, cmd.unitType);
        break;
      case 'build':
        ok = this.doBuild(cmd.q, cmd.r, cmd.kind);
        break;
      case 'buildRoad':
        ok = this.doBuildRoad(cmd.q, cmd.r);
        break;
      case 'upgradeVillage':
        ok = this.doUpgradeVillage(cmd.q, cmd.r);
        break;
      case 'upgradeShip':
        ok = this.doUpgradeShip(cmd.unitId);
        break;
      case 'openSkill':
        ok = this.doOpenSkill(cmd.skill);
        break;
      case 'heal':
        ok = this.doHeal(cmd.unitId);
        break;
      case 'shipLanding':
        ok = this.doShipLanding(cmd.unitId, cmd.q, cmd.r);
        break;
      case 'endTurn':
        this.doEndTurn();
        ok = true;
        break;
    }
    this.syncDiscoveries();
    return ok;
  }
```

Add the private method (near `drainEvents` or `applyCommand`):

```ts
  private syncDiscoveries(): void {
    for (const p of this.players) {
      const visible = knownTribesFor(this.map, this.players, p.index);
      const known = new Set(p.knownTribes ?? []);
      for (const tribe of visible) known.add(tribe);
      p.knownTribes = [...known];
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- discovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/simulator.ts tests/discovery.test.ts
git commit -m "feat: persist tribe discoveries in the simulator"
```

---

### Task 3: Renderer and stats read the persisted set

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Modify: `src/ui/overlays/GameStats.ts`
- Modify: `tests/gameStats.test.ts`

**Interfaces:**
- Consumes: `Player.knownTribes` from Task 1.
- Produces: `MapView` and `GameStats` compute the known set from `players[localPlayerIndex].knownTribes` (plus the own tribe) instead of deriving from the map.

- [ ] **Step 1: Write the failing test**

Update `tests/gameStats.test.ts` — the second test must seed `knownTribes` because unit position no longer drives the stats row. Replace the `shows the tribe name once its unit is on an explored tile` test:

```ts
  it('shows the tribe name once discovered', () => {
    const map = makeTestMap();
    const { enemyName } = mountWithKnown();
    expect(renderedTexts().some((s) => s.includes(enemyName))).toBe(true);
    expect(renderedTexts().some((s) => s.includes('Unknown tribe'))).toBe(false);
  });
```

And add a helper `mountWithKnown` alongside `mount` that seeds the discovery before mounting:

```ts
  const mountWithKnown = (): { enemyName: string } => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyName = TRIBES.find((t) => t.id === players[1].tribe)!.name;
    players[0].knownTribes = [Tribe.Villagers, players[1].tribe];
    const sim = new Simulator(makeTestMap(), players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    stats = new GameStats();
    stats.mount(makeHost(), root);
    return { enemyName };
  };
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gameStats.test.ts`
Expected: FAIL (the discovered test shows "Unknown tribe" because `GameStats` still derives from the map, and the enemy unit is no longer placed).

- [ ] **Step 3: Write minimal implementation**

`src/render/mapRenderer.ts` — replace the import line and the known-set computation in `update()`:

```ts
import { territoryColor } from '../game/discovery';
```

```ts
    const local = players[localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
    this.knownOwners = new Set(players.filter((p) => known.has(p.tribe)).map((p) => p.index));
```

`src/ui/overlays/GameStats.ts` — replace the import line and the known-set computation in `render()`:

```ts
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
```

```ts
    const local = s.players[s.localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
```

(Keep the `map` variable — it is still used for `totalScore`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/mapRenderer.ts src/ui/overlays/GameStats.ts tests/gameStats.test.ts
git commit -m "feat: render borders and stats from persisted tribe discoveries"
```

---

### Task 4: Controller notification reads the persisted set

**Files:**
- Modify: `src/controller/gameController.ts`
- Modify: `tests/discovery.test.ts`

**Interfaces:**
- Consumes: `Player.knownTribes` from Task 1.
- Produces: `deriveKnownTribes()` returns the persisted known set; `syncKnownTribes` unions instead of replacing so a tribe is announced once.

- [ ] **Step 1: Write the failing test**

Update the two `discovery notification` tests in `tests/discovery.test.ts` to seed the persisted set (the enemy unit placement is no longer needed). Replace both tests:

```ts
  it('announces a newly met tribe via the center message', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyTribeName = TRIBES.find((t) => t.id === players[1].tribe)!.name;
    players[0].knownTribes = [Tribe.Villagers, players[1].tribe];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- discovery.test.ts`
Expected: FAIL (the announce test's message is null because `deriveKnownTribes` still derives from unit positions, and no unit is placed).

- [ ] **Step 3: Write minimal implementation**

`src/controller/gameController.ts`:

- Remove the import `import { knownTribesFor } from '../game/discovery';` (no longer used).
- Replace `deriveKnownTribes`:

```ts
  private deriveKnownTribes(): Set<number> {
    const store = useGameStore.getState();
    const local = this.sim?.players[store.localPlayerIndex];
    if (!local) return new Set<number>();
    return new Set<number>([local.tribe, ...(local.knownTribes ?? [])]);
  }
```

- In `syncKnownTribes`, replace the assignment `this.knownTribeIds = current;` with a monotonic union:

```ts
    this.knownTribeIds = new Set<number>([...this.knownTribeIds, ...current]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- discovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/controller/gameController.ts tests/discovery.test.ts
git commit -m "feat: announce tribe discoveries once from persisted state"
```

---

### Task 5: Full verification

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
