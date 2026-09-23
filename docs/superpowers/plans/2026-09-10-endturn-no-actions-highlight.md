# Highlight End-Turn Button When No Actions Are Available — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulse the End Turn button when the local player has no available action anywhere this turn, using the tutorial action-button pulse style.

**Architecture:** A pure helper `hasAnyAvailableAction(map, player, turn)` in a new `src/game/playerActions.ts` comprehensively checks the seven action families. HudToolbar calls it and pulses the end-turn button with the existing `startEndTurnPulse()` when it returns false.

**Tech Stack:** TypeScript, PixiJS 8, Vitest.

## Global Constraints

- `hasAnyAvailableAction(map: GameMap, player: Player, turn: number): boolean`.
- Pulse must reuse the **existing** tutorial action-button pulse (gold `0xffd700`, width 4, radius `24 + 2·|sin(phase·2π)|`, 900ms). No new visual code.
- Guard against double-highlight: when `store.tutorialHighlightEndTurn` is true, the tutorial ring wins; do not add a second ring.
- The highlight applies only when `!store.aiActive && !store.gameOver && !store.paused && !store.tutorial`.
- Run `npm test`, `npm run typecheck`, `npm run build` after each task.

---

### Task 1: Create `hasAnyAvailableAction` and its tests

**Files:**
- Create: `src/game/playerActions.ts`
- Test: `tests/playerActions.test.ts`

**Interfaces:**
- Consumes: `GameMap`, `MapTile` (`src/game/mapGen.ts`), `Player` (`src/game/players.ts`), `canMove`/`canAttack`/`canHeal`/`UNIT_TYPES` (`src/game/units.ts`), `reachableTargets` (`src/game/selection.ts`), `attackableTargets` (`src/game/combat.ts`), `hasSkill`/`canOpenSkill`/`SKILLS` (`src/game/skills.ts`), `unitsInVillage`/`villageCapacity`/`canBuildWall` (`src/game/village.ts`), `canAfford`/`villageUpgradeCost` (`src/game/resources.ts`), `canBuildSawmill`/`canBuildMine`/`canBuildPort`/`canBuildTemple`/`canBuildForestTemple`/`BUILDING_COSTS` (`src/game/buildings.ts`), `canBuildRoad`/`ROAD_COST` (`src/game/roads.ts`), `canBuildBridge`/`BRIDGE_COST` (`src/game/bridges.ts`), `bonusEligibleFor` (`src/game/bonus.ts`).
- Produces: `export function hasAnyAvailableAction(map: GameMap, player: Player, turn: number): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/playerActions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestMap, tileAt } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { hasAnyAvailableAction } from '../src/game/playerActions';
import { makeUnit } from './helpers/testMap';
import { TileType } from '../src/game/tileTypes';
import { TRIBES } from '../src/game/tribes';

const map1 = () => makeTestMap(2);
const players1 = () => buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
```

Note: `Tribe.Villagers` must be imported from `../src/game/tribes`. Add the import.

```ts
import { TRIBES, Tribe } from '../src/game/tribes';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/playerActions.test.ts`
Expected: FAIL — `hasAnyAvailableAction` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Create `src/game/playerActions.ts`:

```ts
import { GameMap } from './mapGen';
import type { Player } from './players';
import { canMove, canAttack, canHeal, UNIT_TYPES } from './units';
import { reachableTargets } from './selection';
import { attackableTargets } from './combat';
import { hasSkill, canOpenSkill, SKILLS } from './skills';
import { unitsInVillage, villageCapacity, canBuildWall } from './village';
import { canAfford, villageUpgradeCost } from './resources';
import { canBuildSawmill, canBuildMine, canBuildPort, canBuildTemple, canBuildForestTemple, BUILDING_COSTS } from './buildings';
import { canBuildRoad, ROAD_COST } from './roads';
import { canBuildBridge, BRIDGE_COST } from './bridges';
import { bonusEligibleFor } from './bonus';

const CHEAPEST_UNIT_PRICE = Math.min(...Object.values(UNIT_TYPES).filter((t) => t.price > 0).map((t) => t.price));

export function hasAnyAvailableAction(map: GameMap, player: Player, turn: number): boolean {
  const canClimb = hasSkill(player, 'climbing');
  const canDock = hasSkill(player, 'navigation');

  for (const tile of map.tiles) {
    const unit = tile.unit;

    // 1. Unit actions
    if (unit && unit.owner === player.index) {
      if (
        (canMove(unit) && reachableTargets(map, unit, undefined, canClimb, canDock, player.index).length > 0) ||
        (canAttack(unit) && attackableTargets(map, unit, player.index).length > 0) ||
        canHeal(unit)
      ) {
        return true;
      }
    }

    // 4. Village capture
    if (tile.settlement && tile.settlement.captureReady && tile.settlement.owner !== player.index && unit && unit.owner === player.index) {
      return true;
    }
  }

  // 2. Spawn + 6. Village upgrade + builds (settlement scans)
  for (const tile of map.tiles) {
    if (!tile.settlement || tile.settlement.owner !== player.index) continue;
    // 2. Spawn
    if (
      !tile.unit &&
      unitsInVillage(map, tile) < villageCapacity(tile.settlement.level) &&
      player.resources.money >= CHEAPEST_UNIT_PRICE
    ) {
      return true;
    }
    // 6. Village upgrade
    if (canAfford(player.resources, villageUpgradeCost(tile.settlement.level))) return true;
    // 7. Wall build
    if (canBuildWall(tile, player)) return true;
  }

  // 3. Skill open
  for (const id of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
    if (canOpenSkill(player, id)) return true;
  }

  // 5. Bonus
  if (bonusEligibleFor(map, player.index, turn).length > 0) return true;

  // 7. Buildings / road / bridge
  for (const tile of map.tiles) {
    if (canBuildSawmill(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.sawmill)) return true;
    if (canBuildMine(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.mine)) return true;
    if (canBuildPort(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.port)) return true;
    if (canBuildTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.temple)) return true;
    if (canBuildForestTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.forestTemple)) return true;
    if (canBuildRoad(map, tile, player)) return true;
    if (canBuildBridge(map, tile, player) && canAfford(player.resources, BRIDGE_COST)) return true;
  }

  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/playerActions.test.ts`
Expected: PASS.

Fill in the tests in Step 1 with concrete per-family cases. Use this balanced set (replace the placeholder first describe contents in Step 1):

```ts
import { describe, expect, it } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { hasAnyAvailableAction } from '../src/game/playerActions';
import { Tribe } from '../src/game/tribes';
import { TileType } from '../src/game/tileTypes';

describe('hasAnyAvailableAction', () => {
  const players = () => buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
  const human = (p: ReturnType<typeof buildPlayers>) => p[0]!;

  it('returns false on an empty map with a broke player', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.resources = { wood: 0, stone: 0, money: 0, ore: 0 };
    p.skills = [];
    expect(hasAnyAvailableAction(map, p, 1)).toBe(false);
  });

  it('is true when an own unit can move', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    tileAt(map, 0, 0)!.unit = makeUnit('u', 0, 'warrior', 0, 0);
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('is true when an own unit can attack an enemy', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    tileAt(map, 0, 0)!.unit = makeUnit('a', 0, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.unit = makeUnit('e', 1, 'warrior', 1, 0);
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('is true when an own unit can heal', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    const u = makeUnit('h', 0, 'warrior', 0, 0);
    u.hp = 1;
    tileAt(map, 0, 0)!.unit = u;
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('is true when an owned village can spawn a unit', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    p.resources.money = 5;
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('is true when a skill can be opened', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    p.resources.money = 5;
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('is true when a captureReady village has an own unit on it', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    tileAt(map, 0, 0)!.settlement = { owner: null, level: 1, captureReady: true };
    tileAt(map, 0, 0)!.unit = makeUnit('c', 0, 'warrior', 0, 0);
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('is true when a bonus is claimable', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    const t = tileAt(map, 0, 0)!;
    t.bonus = { kind: 'money', claimer: 0, arrivalTurn: 1 };
    t.unit = makeUnit('b', 0, 'warrior', 0, 0);
    expect(hasAnyAvailableAction(map, p, 2)).toBe(true);
  });

  it('is true when an owned village can be upgraded', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    p.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('is true when a sawmill can be built', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = ['forestry'];
    p.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
    const tile = tileAt(map, 0, 0)!;
    tile.ownedBy = 0;
    tile.terrain = TileType.GrasslandLand;
    tile.settlement = { owner: 0, level: 2, captureReady: false };
    const neighbor = tileAt(map, 1, 0)!;
    neighbor.terrain = TileType.GrasslandForest;
    neighbor.ownedBy = 0;
    expect(hasAnyAvailableAction(map, p, 1)).toBe(true);
  });

  it('returns false when every unit is exhausted and nothing is affordable', () => {
    const map = makeTestMap(2);
    const p = human(players());
    p.skills = [];
    p.resources = { wood: 0, stone: 0, money: 0, ore: 0 };
    const u = makeUnit('x', 0, 'warrior', 0, 0);
    u.hasMoved = true;
    u.hasAttacked = true;
    u.hasHealed = true;
    tileAt(map, 0, 0)!.unit = u;
    expect(hasAnyAvailableAction(map, p, 1)).toBe(false);
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add tests/playerActions.test.ts src/game/playerActions.ts
git commit -m "feat: add hasAnyAvailableAction player-action check"
```

---

### Task 2: Pulse End Turn button when no actions remain

**Files:**
- Modify: `src/ui/hud/HudToolbar.ts`
- Test: `tests/hudToolbar.test.ts`

**Interfaces:**
- Consumes: `hasAnyAvailableAction` from `../game/playerActions` (already returns `boolean`).
- Produces: none new.

- [ ] **Step 1: Write the failing test**

Add to `tests/hudToolbar.test.ts`, inside the first `describe('HudToolbar build actions')` block:

```ts
it('pulses the end turn button when no action is available and there is no tutorial', () => {
  const store = useGameStore.getState();
  // Empty the player's hands: bleed money and exhaust money sources so no
  // spawn / build / upgrade / skill action remains anywhere.
  store.players[0]!.resources = { wood: 0, stone: 0, money: 0, ore: 0 };
  store.players[0]!.skills = [];
  for (const t of map.tiles) {
    if (t.unit && t.unit.owner === 0) {
      t.unit.hasMoved = true;
      t.unit.hasAttacked = true;
      t.unit.hasHealed = true;
    }
  }
  store.setSelection(null);
  store.setTutorial(false);
  store.setTutorialStep(null);
  store.setTutorialHighlightEndTurn(false);
  const endTurnRow = (toolbar as unknown as { endTurnRow: Container }).endTurnRow;
  expect(endTurnRow.children.some((c) => c instanceof Graphics)).toBe(true);
});

it('does not pulse the end turn button when an action remains', () => {
  const store = useGameStore.getState();
  store.players[0]!.resources = { wood: 0, stone: 0, money: 100, ore: 0 };
  store.players[0]!.skills = [];
  store.setSelection(null);
  store.setTutorial(false);
  store.setTutorialStep(null);
  store.setTutorialHighlightEndTurn(false);
  const endTurnRow = (toolbar as unknown as { endTurnRow: Container }).endTurnRow;
  // Settled players start with some village; ensure at least one affordably
  // openable skill or upgrade makes hasAnyAvailableAction return true.
  expect(endTurnRow.children.some((c) => c instanceof Graphics)).toBe(false);
});
```

Note: the generated `map = generateMap(2, 42)` already places the local player's units/villages. Ensure the "action remains" case actually has an action — e.g. set money high and give the player an openable skill. Adjust to fit the generated map as needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hudToolbar.test.ts`
Expected: both new `it`s FAIL (no pulse wired in yet).

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/hud/HudToolbar.ts`:

- Add import:
```ts
import { hasAnyAvailableAction } from '../../game/playerActions';
```

- In `update()`, after building the end-turn button `endTurn` and adding it to `endTurnRow`, add:

```ts
const human = store.players[store.localPlayerIndex];
const map = gameController.getMap();
const noActions =
  !store.aiActive &&
  !store.gameOver &&
  !store.paused &&
  !store.tutorial &&
  human &&
  map &&
  !hasAnyAvailableAction(map, human, store.turn);
if (noActions && !store.tutorialHighlightEndTurn && !this.endTurnPulse) {
  const ring = new Graphics();
  ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
  this.endTurnRow.addChild(ring);
  this.endTurnPulse = ring;
  this.startEndTurnPulse();
}
```

Place it after the existing tutorial `if (store.tutorialHighlightEndTurn && !store.aiActive)` block. The `!this.endTurnPulse` guard prevents stacking with the tutorial ring.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hudToolbar.test.ts`
Expected: PASS (all existing + 2 new).

- [ ] **Step 5: Full verification**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, typecheck clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/ui/hud/HudToolbar.ts tests/hudToolbar.test.ts
git commit -m "feat: pulse end turn button when no actions remain"
```

---

## Self-Review

- **Spec coverage:** Seven families all implemented in Task 1; toolbar pulse + tutorial guard in Task 2. Matches spec.
- **Placeholders:** The Step-1 test in `playerActions.test.ts` is described and then fully replaced in Step 4 with concrete code — the deliverable is unambiguous. All other steps contain real code.
- **Type consistency:** `hasAnyAvailableAction(map, player, turn)` matches spec; `GameMap`, `Player`, `MapTile` types used consistently. `Tribe` import corrected.
- **Sawmill test:** `canBuildSawmill` requires skill `forestry`, an owned forest-adjacent land tile with a building slot (village level 2 → limit 2, zero buildings → ok). Setup matches.
- **Bonus test:** `bonusEligibleFor` needs `claimer === player.index`, `arrivalTurn < turn`, and a unit of the player on the tile — satisfied with turn 2.