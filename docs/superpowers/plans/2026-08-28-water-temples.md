# Water Temples — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add buildable Water temples on owned water tiles that grow every 2 game turns (per-temple counter, bornTurn-based) up to level 4, award level-based end-game score (10/15/20/25), and expose a "Build water temple" toolbar action.

**Architecture:** Extend the building system with a `temple` kind (`buildings.ts`, `events.ts`, `mapGen.ts`). The simulator stamps `bornTurn` on build and grows temples at each round end. Rendering picks the `water-temple-N.png` texture by level (signature includes level). Scoring excludes temples from the generic building score and adds a level-based award before the winner is computed.

**Tech Stack:** TypeScript, PixiJS 8, Vitest.

## Global Constraints

- Temple build: own water tile, no settlement/building, requires `waterTemples` skill, cost `{ wood: 0, stone: 10, money: 30, ore: 0 }`.
- Growth: per-temple counter — grows when `(turn - bornTurn) >= 2` and `(turn - bornTurn) % 2 === 0`, capped at level 4.
- Temples give no income and no generic +15 building score; each own temple at game end awards `{1:10, 2:15, 3:20, 4:25}` by level.
- Textures: `water-temple-1.png` … `water-temple-4.png`.
- Run `npm test` and `npm run typecheck` after each task; output must be clean.

---

### Task 1: Temple building rules

**Files:**
- Modify: `src/game/events.ts` (`BuildingKind`)
- Modify: `src/game/mapGen.ts` (`Building`)
- Modify: `src/game/buildings.ts`
- Modify: `tests/buildings.test.ts`

**Interfaces:**
- Consumes: existing `hasSkill`, `isWaterType`, `canAfford`, `pay`, `Resources`.
- Produces: `BuildingKind` includes `'temple'`; `Building` includes `'temple'` kind and optional `bornTurn?: number`; `canBuildTemple(map, tile, player): boolean`; `BUILDING_COSTS.temple`; `BUILDING_NAMES.temple`; `buildBuilding` accepts `'temple'`.

- [ ] **Step 1: Write failing tests**

Add to `tests/buildings.test.ts` (import `canBuildTemple` and `BUILDING_COSTS` from `../src/game/buildings`):

```ts
describe('canBuildTemple', () => {
  it('requires the waterTemples skill and an owned water tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    expect(canBuildTemple(map, water, player(100))).toBe(false);
    expect(canBuildTemple(map, water, player(100, ['waterTemples']))).toBe(true);
    const land = tile(1, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildTemple(map, land, player(100, ['waterTemples']))).toBe(false);
    const unowned = tile(0, 1, TileType.Water, null);
    map.tiles.push(unowned);
    expect(canBuildTemple(map, unowned, player(100, ['waterTemples']))).toBe(false);
  });

  it('rejects tiles with a settlement or any building (port mutual exclusion)', () => {
    const withPort = tile(0, 0, TileType.Water, 0, null, { kind: 'port', level: 1 });
    const map: GameMap = { radius: 2, tiles: [withPort], spawns: [] };
    expect(canBuildTemple(map, withPort, player(100, ['waterTemples']))).toBe(false);
    expect(canBuildPort(map, withPort, player(100, ['water']))).toBe(false);
  });
});
```

Add a build case inside the `buildBuilding` describe:

```ts
it('builds a temple, deducts 10 stone + 30 money, sets level 1', () => {
  const map: GameMap = { radius: 2, tiles: [], spawns: [] };
  const water = tile(0, 0, TileType.Water, 0);
  map.tiles.push(water);
  const p = player(100, ['waterTemples']);
  p.resources.stone = 10;
  expect(buildBuilding(map, water, 'temple', p)).toBe(true);
  expect(p.resources.money).toBe(70);
  expect(p.resources.stone).toBe(0);
  expect(water.building).toEqual({ kind: 'temple', level: 1 });
});
```

Extend the `has a display name for every building kind` test:

```ts
    expect(BUILDING_NAMES.temple).toBe('Water temple');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/buildings.test.ts`
Expected: FAIL — `canBuildTemple is not a function`, `BUILDING_NAMES.temple` undefined.

- [ ] **Step 3: Implement**

In `src/game/events.ts`:

```ts
export type BuildingKind = 'factory' | 'mine' | 'port' | 'temple';
```

In `src/game/mapGen.ts`:

```ts
export interface Building {
  kind: 'factory' | 'mine' | 'port' | 'temple';
  level: number;
  bornTurn?: number;
}
```

In `src/game/buildings.ts`, add `import type { BuildingKind } from './events';` and change the two records plus add the builder:

```ts
export const BUILDING_NAMES: Record<BuildingKind, string> = {
  factory: 'Factory',
  mine: 'Mine',
  port: 'Port',
  temple: 'Water temple',
};

export const BUILDING_COSTS: Record<BuildingKind, Resources> = {
  factory: { wood: 0, stone: 0, money: FACTORY_COST, ore: 0 },
  mine: { wood: 0, stone: 0, money: MINE_COST, ore: 0 },
  port: { wood: 10, stone: 0, money: 30, ore: 2 },
  temple: { wood: 0, stone: 10, money: 30, ore: 0 },
};

export function canBuildTemple(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'waterTemples')) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  return isWaterType(tile.terrain);
}
```

Update the `buildBuilding` dispatch:

```ts
  const allowed =
    kind === 'factory'
      ? canBuildFactory(map, tile, player)
      : kind === 'mine'
        ? canBuildMine(map, tile, player)
        : kind === 'port'
          ? canBuildPort(map, tile, player)
          : canBuildTemple(map, tile, player);
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/buildings.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/events.ts src/game/mapGen.ts src/game/buildings.ts tests/buildings.test.ts
git commit -m "feat: add water temple building rules"
```

---

### Task 2: Temple growth in the simulator

**Files:**
- Modify: `src/game/events.ts` (`templeGrown` event)
- Modify: `src/game/simulator.ts`
- Modify: `tests/simulator.test.ts`

**Interfaces:**
- Consumes: `tile.building.bornTurn` from Task 1; `buildBuilding` from Task 1.
- Produces: `growTemples()` private method; `doBuild` stamps `bornTurn`; new `templeGrown { q, r, level, playerIndex }` event emitted at each growth.

- [ ] **Step 1: Write failing tests**

In `src/game/events.ts`, add the event:

```ts
  | { type: 'templeGrown'; q: number; r: number; level: number; playerIndex: number }
```

Add to `tests/simulator.test.ts` (uses `makeTestMap`, `tileAt`, `makeUnit`, `Simulator`, `buildPlayers`, `Tribe`, `SeededRandom`, `TileType` — all already imported):

```ts
it('builds a temple, stamps bornTurn, and grows it every 2 turns to level 4', () => {
  const map = makeTestMap(3);
  const water = tileAt(map, 1, 0)!;
  water.terrain = TileType.Water;
  water.ownedBy = 0;
  const players = buildPlayers(Tribe.Villagers, 0, new SeededRandom(1));
  players[0].skills = ['waterTemples'];
  players[0].resources = { wood: 0, stone: 10, money: 30, ore: 0 };
  const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  expect(sim.applyCommand({ type: 'build', q: 1, r: 0, kind: 'temple' })).toBe(true);
  expect(tileAt(map, 1, 0)!.building).toEqual({ kind: 'temple', level: 1, bornTurn: 1 });

  const grown: number[] = [];
  const endRound = (): void => {
    expect(sim.applyCommand({ type: 'endTurn' })).toBe(true);
    for (const e of sim.drainEvents()) {
      if (e.type === 'templeGrown') grown.push(e.level);
    }
  };
  endRound(); // turn 2
  expect(tileAt(map, 1, 0)!.building!.level).toBe(1);
  endRound(); // turn 3
  expect(tileAt(map, 1, 0)!.building!.level).toBe(2);
  endRound(); // turn 4
  expect(tileAt(map, 1, 0)!.building!.level).toBe(2);
  endRound(); // turn 5
  expect(tileAt(map, 1, 0)!.building!.level).toBe(3);
  endRound(); // turn 6
  endRound(); // turn 7
  expect(tileAt(map, 1, 0)!.building!.level).toBe(4);
  endRound(); // turn 8
  endRound(); // turn 9
  expect(tileAt(map, 1, 0)!.building!.level).toBe(4);
  expect(grown).toEqual([2, 3, 4]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/simulator.test.ts`
Expected: FAIL — the temple `building` has no `bornTurn`, and it never grows (level stays 1).

- [ ] **Step 3: Implement**

In `src/game/simulator.ts`, in `doBuild`, stamp `bornTurn` after a successful build:

```ts
  private doBuild(q: number, r: number, kind: BuildingKind): boolean {
    const tile = tileAt(this.map, q, r);
    if (!tile) return false;
    const player = this.currentPlayer;
    if (buildBuilding(this.map, tile, kind, player)) {
      if (tile.building?.kind === 'temple') tile.building.bornTurn = this.turn;
      this.emit({ type: 'built', kind, q, r, playerIndex: player.index });
      return true;
    }
    return false;
  }
```

In `doEndTurn`, after `this.turn += 1;`, add `this.growTemples();`.

Add the method (near `doBuild`):

```ts
  private growTemples(): void {
    for (const t of this.map.tiles) {
      const b = t.building;
      if (!b || b.kind !== 'temple' || b.level >= 4) continue;
      const born = b.bornTurn ?? this.turn;
      if (this.turn - born >= 2 && (this.turn - born) % 2 === 0) {
        b.level += 1;
        this.emit({ type: 'templeGrown', q: t.q, r: t.r, level: b.level, playerIndex: t.ownedBy ?? -1 });
      }
    }
  }
```

In `src/controller/gameController.ts`, `presentEvents`, add a case for the new event (no special presentation):

```ts
        case 'templeGrown':
          break;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/simulator.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/events.ts src/game/simulator.ts src/controller/gameController.ts tests/simulator.test.ts
git commit -m "feat: temples grow every 2 turns from build"
```

---

### Task 3: Temple rendering

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/tileSignature.ts`
- Modify: `src/render/mapRenderer.ts`
- Modify: `tests/mapRenderer.test.ts`
- Modify: `tests/moveAnimation.test.ts`

**Interfaces:**
- Consumes: `tile.building.kind === 'temple'` and `tile.building.level`.
- Produces: `TextureSet.templeTextures: Record<1 | 2 | 3 | 4, TileTexture>`; temple level included in `tileSignature`; `applyTile` renders the matching texture.

- [ ] **Step 1: Write failing test**

Add to `tests/mapRenderer.test.ts` (import `TileType` already present; uses existing `tex`/`tileTex` helpers and `buildTextures`):

```ts
it('renders the temple texture matching the temple level', () => {
  const t: MapTile = {
    q: 0, r: 0, terrain: TileType.Water, height: 0.1, settlement: null,
    building: { kind: 'temple', level: 3 }, roadOwner: null, unit: null,
    ownedBy: 0, claimedByVillage: null, exploredBy: [0],
  };
  const m: GameMap = { radius: 1, spawns: [], tiles: [t] };
  const v = new MapView(
    { screen: { width: 800, height: 600 }, ticker: { add: (): void => {}, remove: (): void => {} } } as unknown as Application,
    textures, HEX, SPRITE_SCALE, 2,
  );
  v.update(m, players, null, new Set(), new Set(), 0, new Set(), {
    x: 400, y: 300, scale: 1, width: 800, height: 600,
  });
  const tv = (v as unknown as { tileViews: Map<string, { buildingSprite: Sprite | null }> }).tileViews.get('0,0')!;
  expect(tv.buildingSprite?.texture).toBe(textures.templeTextures[3].texture);
  v.destroy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/mapRenderer.test.ts`
Expected: FAIL — `textures.templeTextures` is undefined in the mock `buildTextures`.

- [ ] **Step 3: Implement**

In `src/render/textureFactory.ts`, add the interface field, loaders, and return value:

```ts
export interface TextureSet {
  ...
  templeTextures: Record<1 | 2 | 3 | 4, TileTexture>;
  ...
}

const TEMPLE_IMAGE_FILES: Record<1 | 2 | 3 | 4, string> = {
  1: 'water-temple-1.png',
  2: 'water-temple-2.png',
  3: 'water-temple-3.png',
  4: 'water-temple-4.png',
};
```

In `createTextures`, before the return:

```ts
  const templeTextures = {} as Record<1 | 2 | 3 | 4, TileTexture>;
  for (const lvl of [1, 2, 3, 4] as const) {
    const img = await loadImageTexture(TEXTURE_BASE + TEMPLE_IMAGE_FILES[lvl]);
    templeTextures[lvl] =
      makeUnitImageTexture(app, img, hexSize) ??
      { texture: makeBuildingTexture(app, 0x3a6ea5, hexSize), anchorY: 0.5 };
  }
```

Add `templeTextures` to the returned object.

In `src/render/tileSignature.ts`, add the temple level after the port direction segment:

```ts
    tile.building?.kind === 'temple' ? String(tile.building.level) : '',
```

In `src/render/mapRenderer.ts`, `applyTile`, handle temples:

```ts
    const buildingIsPort = tile.building !== null && tile.building.kind === 'port';
    const buildingIsFactory = tile.building !== null && tile.building.kind === 'factory';
    const buildingIsTemple = tile.building !== null && tile.building.kind === 'temple';
    const buildingTileTex = buildingIsFactory
      ? this.textures.factoryTexture
      : buildingIsTemple
        ? this.textures.templeTextures[tile.building!.level as 1 | 2 | 3 | 4]
        : tile.building !== null && !buildingIsPort
          ? this.textures.mineTexture
          : null;
```

In `tests/mapRenderer.test.ts` and `tests/moveAnimation.test.ts`, add to the mock `buildTextures` return objects (next to `freePortTexture`):

```ts
    templeTextures: {
      1: tileTex(40, 40, 0.7),
      2: tileTex(40, 40, 0.7),
      3: tileTex(40, 40, 0.7),
      4: tileTex(40, 40, 0.7),
    },
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/mapRenderer.test.ts tests/moveAnimation.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/render/tileSignature.ts src/render/mapRenderer.ts tests/mapRenderer.test.ts tests/moveAnimation.test.ts
git commit -m "feat: render water temple textures by level"
```

---

### Task 4: Temple scoring

**Files:**
- Modify: `src/game/score.ts`
- Modify: `src/game/simulator.ts`
- Modify: `tests/score.test.ts`
- Modify: `GAME.md`

**Interfaces:**
- Consumes: `tile.building.kind`, `tile.ownedBy`.
- Produces: `TEMPLE_SCORES`; `awardTempleScores(map, players)`; `boardScore` skips temples for the generic building score; simulator calls `awardTempleScores` before ending the game.

- [ ] **Step 1: Write failing tests**

Add to `tests/score.test.ts`:

```ts
it('does not count temples in the generic building score', () => {
  const map: GameMap = { radius: 2, tiles: [], spawns: [] };
  map.tiles.push(
    tile(0, 0, 0, null, null, { kind: 'temple', level: 4 }),
    tile(1, 0, 0, null, null, { kind: 'factory', level: 1 }),
  );
  expect(boardScore(map, 0)).toBe(BUILDING_SCORE);
});

it('awardTempleScores grants 10/15/20/25 by temple level at game end', () => {
  const map: GameMap = { radius: 2, tiles: [], spawns: [] };
  map.tiles.push(
    tile(0, 0, 0, null, null, { kind: 'temple', level: 1 }),
    tile(1, 0, 0, null, null, { kind: 'temple', level: 2 }),
    tile(2, 0, 0, null, null, { kind: 'temple', level: 4 }),
    tile(3, 0, 1, null, null, { kind: 'temple', level: 4 }),
  );
  const p = player();
  awardTempleScores(map, [p, player()]);
  expect(p.score).toBe(10 + 15 + 25);
});
```

Update the import line in `tests/score.test.ts` to include `awardTempleScores`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/score.test.ts`
Expected: FAIL — `boardScore` returns `2 * BUILDING_SCORE` (temple counted), and `awardTempleScores` is undefined.

- [ ] **Step 3: Implement**

In `src/game/score.ts`:

```ts
export const TEMPLE_SCORES: Record<number, number> = { 1: 10, 2: 15, 3: 20, 4: 25 };
```

In `boardScore`, change the building line:

```ts
    if (tile.building && tile.building.kind !== 'temple') score += BUILDING_SCORE;
```

Add:

```ts
export function awardTempleScores(map: GameMap, players: Player[]): void {
  for (const tile of map.tiles) {
    if (!tile.building || tile.building.kind !== 'temple' || tile.ownedBy === null) continue;
    const player = players[tile.ownedBy];
    if (player) player.score += TEMPLE_SCORES[tile.building.level] ?? 0;
  }
}
```

In `src/game/simulator.ts`, in `checkEndConditions`, call `awardTempleScores` before ending:

```ts
  private checkEndConditions(): boolean {
    if (this.mode === 'turns30' && this.turn >= 30) {
      awardTempleScores(this.map, this.players);
      this.endGame(computeWinner(this.players, this.map));
      return true;
    }
    if (this.mode === 'capture') {
      const w = captureWinnerIndex(this.map);
      if (w !== null) {
        awardTempleScores(this.map, this.players);
        this.endGame(w);
        return true;
      }
    }
    return false;
  }
```

Add `awardTempleScores` to the `./score` import in `simulator.ts`.

Update `GAME.md`:
- Buildings table: add `| Temple | 10 stone + 30 money | Water temple | water tile | none; grows +1 level every 2 turns (max 4); awards 10/15/20/25 score at game end |`.
- Scores section: note the temple end-game score.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/score.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/score.ts src/game/simulator.ts tests/score.test.ts GAME.md
git commit -m "feat: temple end-game scores and no generic building score"
```

---

### Task 5: Build water temple action

**Files:**
- Modify: `src/ui/hud/toolbarSpecs.ts`
- Modify: `src/ui/hud/HudToolbar.ts`
- Modify: `src/game/ai.ts`
- Modify: `tests/toolbarSpecs.test.ts`

**Interfaces:**
- Consumes: `canBuildTemple`, `BUILDING_COSTS` from Task 1; `BuildingKind` from Task 1.
- Produces: toolbar action `temple` ("Build water temple (10s, 30)") using the `build.png` icon; AI temple build candidate.

- [ ] **Step 1: Write failing test**

Add to `tests/toolbarSpecs.test.ts`:

```ts
it('offers the build water temple action on an own water tile with the skill', () => {
  const tile = map.tiles.find((t) => t.unit === null)!;
  tile.terrain = TileType.Water;
  tile.ownedBy = 0;
  tile.settlement = null;
  const store = useGameStore.getState();
  store.setPlayers(store.players.map((p, i) => (i === 0 ? { ...p, skills: ['waterTemples'] } : p)));
  select(tile);
  expect(toolbarSpecs().some((a) => a.key === 'temple')).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/toolbarSpecs.test.ts`
Expected: FAIL — no `temple` action is offered.

- [ ] **Step 3: Implement**

In `src/ui/hud/toolbarSpecs.ts`, add the import and the action:

```ts
import { canBuildFactory, canBuildMine, canBuildPort, canBuildTemple, BUILDING_COSTS } from '../../game/buildings';
```

In the `settlement === null` block, extend `kinds` and dispatch:

```ts
    const kinds: Array<{ kind: 'factory' | 'mine' | 'port' | 'temple'; label: string }> = [
      { kind: 'factory', label: 'Build factory (10)' },
      { kind: 'mine', label: 'Build mine (15)' },
      { kind: 'port', label: 'Build port (10w, 30, 2 ore)' },
      { kind: 'temple', label: 'Build water temple (10s, 30)' },
    ];
    for (const { kind, label } of kinds) {
      const ok = kind === 'factory'
        ? canBuildFactory(map, tile, player)
        : kind === 'mine'
          ? canBuildMine(map, tile, player)
          : kind === 'port'
            ? canBuildPort(map, tile, player)
            : canBuildTemple(map, tile, player);
      if (!ok) continue;
      out.push({ key: kind, label, disabled: !canAfford(player.resources, BUILDING_COSTS[kind]), onClick: () => gameController.buildSelectedBuilding(kind) });
    }
```

In `src/ui/hud/HudToolbar.ts`, `ICON_ACTIONS`, add:

```ts
  temple: 'build.png',
```

In `src/game/ai.ts`, add a temple build candidate (next to the port candidate):

```ts
    if (canBuildTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.temple)) {
      candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'temple' } });
    }
```

Add the import in `ai.ts`: `canBuildTemple` from `./buildings`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/toolbarSpecs.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud/toolbarSpecs.ts src/ui/hud/HudToolbar.ts src/game/ai.ts tests/toolbarSpecs.test.ts
git commit -m "feat: add Build water temple toolbar action and AI candidate"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: Confirm spec coverage**

- Temple building rules, cost, skill, port↔temple exclusion: Task 1.
- Per-temple growth every 2 turns to level 4, `templeGrown` event: Task 2.
- Level-based texture rendering + signature re-render: Task 3.
- No generic +15 for temples; end-game 10/15/20/25 award: Task 4.
- "Build water temple" action with `build.png` + AI parity: Task 5.
