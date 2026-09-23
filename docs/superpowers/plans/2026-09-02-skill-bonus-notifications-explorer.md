# Skill Bonus, Private Bonus Notifications & Smarter Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "free skill" map bonus, stop showing bonus notifications to players who did not claim them, and make the Explorer bonus unit prefer unexplored cells.

**Architecture:** Game logic lives in the simulator/game modules and is broadcast to the UI via `GameEvent`s; the Pixi presenter turns events into animations/notifications. So the skill bonus is resolved in `src/game` + emitted through the `bonusClaimed` event, while notification filtering and copy live in the event presenter. Explorer pathing is a pure function in `bonus.ts` whose player-aware preference is decided by fog-of-war state.

**Tech Stack:** TypeScript, PixiJS presenter, Vitest. Tests: `npm test` (vitest run) / `npm run typecheck`.

## Global Constraints

- `BonusKind` literal union in `src/game/bonus.ts` gains `'skill'`.
- The free-skill bonus may open any skill (level 1 or 2) whose parent is not researched; cost is never paid.
- Notification text for the new bonus is exactly `Skill {name} opened!` (no `Bonus: ` prefix).
- Skill-bonus fallback when every skill is already open: `+15 money`.
- `explorerPath(map, start, rng)` becomes `explorerPath(map, start, rng, playerIndex)` (default `0`).
- The Explorer prefers a land/empty neighbour the claiming player has not explored; it steps onto an explored neighbour only when no unexplored neighbour is adjacent.
- `bonusClaimed` notifications appear only to the claiming player; the gold burst only on tiles explored by the local player.
- No user-visible rules beyond the above change; `GAME.md` bonus list is updated.

---

### Task 1: `randomUnopenedSkill` helper in skills module

**Files:**
- Modify: `src/game/skills.ts`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Consumes: `Player` type from `src/game/players` (already imported type-only).
- Produces: `randomUnopenedSkill(player: Player, rng: () => number): SkillId | null` — returns a uniformly random `SkillId` from `SKILLS` the player does not have, ignoring parent/level/cost; returns `null` when all skills are open.

- [ ] **Step 1: Write the failing test**

Append inside `describe('skills', ...)` in `tests/skills.test.ts`:

```ts
  it('randomUnopenedSkill returns an unopened skill of any level', () => {
    const p = player(0, ['climbing', 'water', 'forestry', 'science', 'shields']);
    for (let i = 0; i < 50; i++) {
      const id = randomUnopenedSkill(p, Math.random);
      expect(id).not.toBeNull();
      expect(p.skills).not.toContain(id);
    }
    expect(randomUnopenedSkill(p, () => 0)).toBe('smithery');
    expect(randomUnopenedSkill(p, () => 0.9999)).toBeDefined();
  });

  it('randomUnopenedSkill returns null when every skill is open', () => {
    const p = player(0, Object.keys(SKILLS) as SkillId[]);
    expect(randomUnopenedSkill(p, () => 0.5)).toBeNull();
  });
```

Add `randomUnopenedSkill` to the existing import list in `tests/skills.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL — `randomUnopenedSkill is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/game/skills.ts`, append:

```ts
export function randomUnopenedSkill(player: Player, rng: () => number): SkillId | null {
  const opened = new Set(player.skills);
  const unopened = (Object.keys(SKILLS) as SkillId[]).filter((id) => !opened.has(id));
  if (unopened.length === 0) return null;
  return unopened[Math.floor(rng() * unopened.length)]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/skills.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/game/skills.ts tests/skills.test.ts
git commit -m "feat: add randomUnopenedSkill bonus helper"
```

---

### Task 2: Add `'skill'` to `BonusKind`

**Files:**
- Modify: `src/game/bonus.ts`
- Test: `tests/bonus.test.ts`

**Interfaces:**
- Produces: `BonusKind` union now `'money' | 'resources' | 'villageUpgrade' | 'explorer' | 'skill'`; `randomBonusKind` can return `'skill'`.

- [ ] **Step 1: Write the failing test**

Update the `randomBonusKind returns a known kind` test in `tests/bonus.test.ts` so its expected list includes `'skill'`:

```ts
    expect([...kinds].sort()).toEqual(['explorer', 'money', 'resources', 'skill', 'villageUpgrade']);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bonus.test.ts`
Expected: FAIL on the randomBonusKind expectation (or TS error on the union literal if not yet widened).

- [ ] **Step 3: Implement**

In `src/game/bonus.ts`:

```ts
export type BonusKind = 'money' | 'resources' | 'villageUpgrade' | 'explorer' | 'skill';
```

and

```ts
  const kinds: BonusKind[] = ['money', 'resources', 'villageUpgrade', 'explorer', 'skill'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bonus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/bonus.ts tests/bonus.test.ts
git commit -m "feat: add skill bonus kind"
```

---

### Task 3: Explorer prefers unexplored cells

**Files:**
- Modify: `src/game/bonus.ts`
- Test: `tests/bonus.test.ts`

**Interfaces:**
- Produces: `explorerPath(map: GameMap, start: MapTile, rng: () => number, playerIndex = 0): { q: number; r: number }[]` that prefers unexplored neighbours. The existing simulator call site (3 args) keeps working via the default.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('bonus helpers', ...)` in `tests/bonus.test.ts`:

```ts
  it('explorerPath first steps onto an unexplored cell when one is adjacent', () => {
    const map = makeTestMap(3);
    for (const t of map.tiles) t.exploredBy = [];
    tileAt(map, 0, 0)!.exploredBy = [0];
    // Only (1,0) is unexplored; (0,1) and the rest are explored land.
    tileAt(map, 0, 1)!.exploredBy = [0];
    for (let i = 0; i < 20; i++) {
      const path = explorerPath(map, tileAt(map, 0, 0)!, () => Math.random(), 0);
      expect(path[0]).toEqual({ q: 1, r: 0 });
    }
  });

  it('explorerPath steps onto an explored cell only when no unexplored neighbour exists', () => {
    const map = makeTestMap(3);
    for (const t of map.tiles) t.exploredBy = [0];
    const path = explorerPath(map, tileAt(map, 0, 0)!, () => 0.9, 0);
    expect(path.length).toBeGreaterThan(0);
    expect(isExploredFor(tileAt(map, path[0]!.q, path[0]!.r)!, 0)).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bonus.test.ts`
Expected: FAIL — first test fails because the path does not prefer `(1,0)`.

- [ ] **Step 3: Implement the preference**

In `src/game/bonus.ts`, add `isExploredFor` to the `./explore` import and replace `explorerPath` with:

```ts
export function explorerPath(
  map: GameMap,
  start: MapTile,
  rng: () => number,
  playerIndex = 0,
): { q: number; r: number }[] {
  const path: { q: number; r: number }[] = [];
  let pos = { q: start.q, r: start.r };
  const DIRS = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  for (let i = 0; i < EXPLORER_MOVES; i++) {
    const reachable: MapTile[] = [];
    for (const d of DIRS) {
      const next = tileAt(map, pos.q + d.q, pos.r + d.r);
      if (!next || isWaterType(next.terrain) || next.unit) continue;
      reachable.push(next);
    }
    if (reachable.length === 0) break;
    const unexplored = reachable.filter((t) => !isExploredFor(t, playerIndex));
    const pool = unexplored.length > 0 ? unexplored : reachable;
    const pick = pool[Math.floor(rng() * pool.length)]!;
    pos = { q: pick.q, r: pick.r };
    path.push(pos);
  }
  return path;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bonus.test.ts`
Expected: PASS (including the existing "returns only land moves, at most 25" test).

- [ ] **Step 5: Commit**

```bash
git add src/game/bonus.ts tests/bonus.test.ts
git commit -m "feat: explorer prefers unexplored cells"
```

---

### Task 4: Claiming a `skill` bonus in the simulator + event carries the opened skill

**Files:**
- Modify: `src/game/events.ts`, `src/game/simulator.ts`
- Test: `tests/bonus.test.ts`

**Interfaces:**
- Consumes: `randomUnopenedSkill` (Task 1), `BonusKind` with `'skill'` (Task 2), 4-arg `explorerPath` (Task 3).
- Produces: `applyBonus` returns `{ kind: BonusKind; skill?: SkillId }`; `bonusClaimed` event gains optional `skill?: SkillId`; `doClaimBonus` emits `kind` = effective kind and `skill` when one was opened; the explorer call passes `player.index`.

- [ ] **Step 1: Write the failing tests**

In `tests/bonus.test.ts`, widen the `bonusMap` / `makeSim` kind type unions to include `'skill'`, then add:

```ts
  it('skill bonus opens a random unopened skill for the claimer', () => {
    const { map, target, players, sim } = makeSim('skill', 0); // rng 0 -> first unopened = climbing
    sim.applyCommand({ type: 'endTurn' });
    expect(players[0]!.skills).not.toContain('climbing');
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    expect(players[0]!.skills).toContain('climbing');
    expect(target.bonus).toBeNull();
    const events = sim.drainEvents();
    const claim = events.find((e) => e.type === 'bonusClaimed');
    expect(claim).toMatchObject({ type: 'bonusClaimed', kind: 'skill', skill: 'climbing', playerIndex: 0 });
  });

  it('skill bonus falls back to +15 money when all skills are open', () => {
    const map = makeTestMap(3);
    for (const t of map.tiles) t.exploredBy = [];
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    tileAt(map, 0, 0)!.exploredBy = [0];
    const target = tileAt(map, 0, 1)!;
    target.exploredBy = [0];
    target.bonus = { kind: 'skill', claimer: null, arrivalTurn: 0 };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = Object.keys(SKILLS) as SkillId[];
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 1 });
    sim.applyCommand({ type: 'endTurn' });
    const moneyBefore = players[0]!.resources.money;
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    expect(players[0]!.resources.money).toBe(moneyBefore + 15);
    const events = sim.drainEvents();
    expect(events.find((e) => e.type === 'bonusClaimed')).toMatchObject({ kind: 'money', playerIndex: 0 });
  });
```

Add `SKILLS` to the `src/game/skills` import and `SkillId` to the type import in `tests/bonus.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bonus.test.ts`
Expected: FAIL — no `skill` case in `applyBonus`; no `skill` field on the event.

- [ ] **Step 3: Widen the `bonusClaimed` event**

In `src/game/events.ts`, change the `bonusClaimed` member to:

```ts
  | { type: 'bonusClaimed'; q: number; r: number; kind: BonusKind; playerIndex: number; skill?: SkillId }
```

(`SkillId` is already imported in `events.ts`.)

- [ ] **Step 4: Implement `applyBonus` returning the effective kind**

In `src/game/simulator.ts`, change `applyBonus` to return `{ kind: BonusKind; skill?: SkillId }` and pass `player.index` to `explorerPath`:

```ts
  private applyBonus(tile: MapTile, kind: BonusKind, player: Player): { kind: BonusKind; skill?: SkillId } {
    switch (kind) {
      case 'money':
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: 'money' };
      case 'resources':
        player.resources.wood += 10;
        player.resources.stone += 5;
        player.resources.ore += 5;
        return { kind: 'resources' };
      case 'villageUpgrade': {
        const village = findClosestVillage(this.map, tile, player.index);
        if (village) {
          upgradeVillage(this.map, village);
          this.statsOf(player).villageUpgrades += 1;
          this.emit({
            type: 'villageUpgraded',
            q: village.q,
            r: village.r,
            level: village.settlement!.level,
            playerIndex: player.index,
          });
          return { kind: 'villageUpgrade' };
        }
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: 'money' };
      }
      case 'skill': {
        const skill = randomUnopenedSkill(player, this.rng);
        if (skill) {
          player.skills.push(skill);
          return { kind: 'skill', skill };
        }
        player.resources.money += 15;
        this.emitScoreFly(player.index, 15, tile);
        return { kind: 'money' };
      }
      case 'explorer': {
        const path = explorerPath(this.map, tile, this.rng, player.index);
        revealExplorerPath(this.map, tile, path, player.index);
        this.emit({ type: 'explorer', q: tile.q, r: tile.r, path, playerIndex: player.index });
        return { kind: 'explorer' };
      }
    }
  }
```

Update `doClaimBonus` to use the result:

```ts
      const result = this.applyBonus(t, kind, player);
      this.emit({
        type: 'bonusClaimed',
        q: t.q,
        r: t.r,
        kind: result.kind,
        playerIndex: player.index,
        skill: result.skill,
      });
```

Add `randomUnopenedSkill` to the `./skills` import and `SkillId` to the type imports in `src/game/simulator.ts`.

Note: emitting the *effective* kind (instead of the literal tile kind) also fixes the pre-existing `villageUpgrade`-fallback notification (it now reports `+15 money` rather than `Village upgraded for free`). No test depends on the old behaviour.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/bonus.test.ts tests/skills.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/events.ts src/game/simulator.ts tests/bonus.test.ts
git commit -m "feat: skill bonus opens a random unopened skill"
```

---

### Task 5: Private + skill bonus notifications in the presenter

**Files:**
- Modify: `src/controller/eventPresenter.ts`
- Test: `tests/bonusNotification.test.ts` (new)

**Interfaces:**
- Consumes: `bonusClaimed` event with optional `skill` (Task 4), `SKILLS` map, `isExploredFor` (already imported).
- Produces: Local-only notifications; `Skill {name} opened!` copy; gold burst only on locally-explored tiles.

- [ ] **Step 1: Write the failing tests**

Create `tests/bonusNotification.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Application, Container, Graphics, ImageSource, Text, Texture } from 'pixi.js';
import { gameController } from '../src/controller/gameController';
import { Simulator } from '../src/game/simulator';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { UNIT_TYPES, type Unit } from '../src/game/units';
import { axialKey } from '../src/game/hex';
import { type GameEvent } from '../src/game/events';
import { MapView } from '../src/render/mapRenderer';
import { useGameStore } from '../src/store/gameStore';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';
import { installCamera } from './helpers/testMap';

function tex(w: number, h: number): Texture {
  return new Texture({ source: new ImageSource({ width: w, height: h }) });
}
function tileTex(w: number, h: number, anchorY = 0.5): TileTexture {
  return { texture: tex(w, h), anchorY };
}
function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(100, 100, 0.7);
  const tribes: Tribe[] = [Tribe.Cats, Tribe.Warriors, Tribe.Barbarians, Tribe.Villagers, Tribe.Forest, Tribe.Aqua];
  const unitTextures = Object.fromEntries(
    tribes.map((t) => [t, { warrior: unitTex, rider: unitTex, archer: unitTex, swordsman: unitTex, shield: unitTex }]),
  ) as TextureSet['unitTextures'];
  const shipTextures = Object.fromEntries(
    tribes.map((t) => [t, { 1: unitTex, 2: unitTex, 3: unitTex }]),
  ) as TextureSet['shipTextures'];
  return {
    tileTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTopTexture: tileTex(50, 50),
    villageTextures: { level1: tileTex(40, 40, 0.7), level2: tileTex(40, 40, 0.7) },
    freeVillageTexture: tileTex(40, 40),
    unitTextures,
    pirateTexture: unitTex,
    sawmillTexture: tileTex(50, 50),
    mineTexture: tileTex(50, 50),
    portTextures: { e: unitTex, ne: unitTex, nw: unitTex, w: unitTex, sw: unitTex, se: unitTex },
    freePortTexture: tex(40, 40),
    templeTextures: { 1: unitTex, 2: unitTex, 3: unitTex, 4: unitTex },
    forestTempleTextures: { 1: unitTex, 2: unitTex, 3: unitTex, 4: unitTex },
    shipTextures,
    bonusTexture: tileTex(50, 50),
    villageConnectedTexture: null,
    captureTexture: null,
  };
}

function tile(q: number, r: number): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
    roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0, 1],
  };
}

describe('bonus claim notifications', () => {
  let gc: Record<string, unknown>;
  let mapView: MapView;
  let realRaf: typeof requestAnimationFrame | undefined;

  beforeEach(() => {
    const tiles: MapTile[] = [];
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) tiles.push(tile(q, r));
    const map: GameMap = { radius: 2, tiles, spawns: [] };
    const players: Player[] = [
      { index: 0, tribe: Tribe.Warriors, isHuman: true, name: 'H', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
      { index: 1, tribe: Tribe.Cats, isHuman: true, name: 'C', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
    ];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    const app = { screen: { width: 800, height: 600 }, ticker: { add: (): void => {}, remove: (): void => {} } } as unknown as Application;
    const textures = buildTextures(map);
    mapView = new MapView(app, textures, 40, 0.5, 2);

    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    useGameStore.setState({ localPlayerIndex: 1, netMode: 'client', players, centerMessage: null, centerMessageQueue: [] });

    gc = gameController as unknown as Record<string, unknown>;
    (gc as { app: unknown }).app = app;
    (gc as { sim: unknown }).sim = sim;
    (gc as { mapView: unknown }).mapView = mapView;
    (gc as { mapRoot: unknown }).mapRoot = new Container();
    (gc as { textures: unknown }).textures = textures;
    (gc as { hiddenUnitIds: Set<string> }).hiddenUnitIds.clear();
    installCamera(gc, app, map.radius);

    realRaf = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame!;
    (globalThis as { performance: Performance }).performance.now = () => 0;
    (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: (t: number) => void) => setTimeout(() => cb(0), 0)) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    if (realRaf) (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = realRaf;
    mapView.destroy();
  });

  it('does not notify the local player about another player claiming a bonus', async () => {
    const ev: GameEvent = { type: 'bonusClaimed', q: 1, r: 0, kind: 'money', playerIndex: 0 };
    await (gc as { presentEvents: (e: GameEvent[], pre: Set<string>) => Promise<void> }).presentEvents([ev], new Set());
    expect(useGameStore.getState().centerMessage).toBeNull();
  });

  it('notifies the local player with Skill {name} opened! for a skill bonus', async () => {
    const ev: GameEvent = { type: 'bonusClaimed', q: 1, r: 0, kind: 'skill', playerIndex: 1, skill: 'navigation' };
    await (gc as { presentEvents: (e: GameEvent[], pre: Set<string>) => Promise<void> }).presentEvents([ev], new Set());
    expect(useGameStore.getState().centerMessage).toBe('Skill Navigation opened!');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bonusNotification.test.ts`
Expected: FAIL — first test sees `Bonus: +15 money`; second test has no skill message.

- [ ] **Step 3: Implement presenter changes**

In `src/controller/eventPresenter.ts`:

- Add `SKILLS` to a `src/game/skills` import:

```ts
import { SKILLS } from '../game/skills';
```

- Replace `presentBonusClaimed` with:

```ts
  private presentBonusClaimed(e: Extract<GameEvent, { type: 'bonusClaimed' }>): void {
    const store = useGameStore.getState();
    const local = store.localPlayerIndex;
    const sim = this.host.sim();
    const mapView = this.host.mapView();
    if (sim && mapView) {
      const tile = tileAt(sim.map, e.q, e.r);
      if (tile && isExploredFor(tile, local)) {
        const p = hexToPixel({ q: e.q, r: e.r }, HEX_SIZE);
        mapView.spawnBonusClaim(p.x, p.y - tileElevation(tile, HEX_SIZE));
      }
    }
    if (e.playerIndex !== local) return;
    if (e.kind === 'skill') {
      if (e.skill) store.setCenterMessage(`Skill ${SKILLS[e.skill].name} opened!`);
      return;
    }
    const messages: Record<Exclude<BonusKind, 'skill'>, string> = {
      money: '+15 money',
      resources: '+10 wood, +5 stone, +5 ore',
      villageUpgrade: 'Village upgraded for free',
      explorer: 'An explorer is scouting the land',
    };
    store.setCenterMessage(`Bonus: ${messages[e.kind]}`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bonusNotification.test.ts tests/moveAnimation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controller/eventPresenter.ts tests/bonusNotification.test.ts
git commit -m "feat: keep bonus notifications private and report opened skills"
```

---

### Task 6: Docs + full verification

**Files:**
- Modify: `GAME.md`

- [ ] **Step 1: Update `GAME.md` bonus list**

In `GAME.md`, in the "Bonuses" section, change the "Bonus types (random)" list to add the free-skill bonus and note the Explorer preference:

```md
- Bonus types (random):
  - **+15 money**
  - **Resources**: +10 wood, +5 stone, +5 ore
  - **Free village upgrade**: upgrades your closest village to the bonus at no cost (falls back to +15 money if you own no village)
  - **Free skill**: opens one random skill you have not researched yet, of any level and without prerequisites (falls back to +15 money if every skill is researched)
  - **Explorer**: a semi-transparent warrior appears on the tile, makes up to 25 moves exploring the map by the regular rules (preferring unexplored cells), then disappears
```

- [ ] **Step 2: Run the full suite, typecheck, and build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add GAME.md
git commit -m "docs: skill bonus, private notifications, explorer movement"
```
