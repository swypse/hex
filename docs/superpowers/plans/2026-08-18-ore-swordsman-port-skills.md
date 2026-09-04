# Ore, Swordsman, Port & Skill Tree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ore (a fourth resource), the swordsman unit, the port building, and a money-gated skill tree that unlocks buildings, the swordsman, and mountain movement — with a dedicated skill-tree scene.

**Architecture:** `Resources` gains `ore`; `Player` gains `skills: SkillId[]`. A pure `src/game/skills.ts` defines the tree, prerequisites, and costs (money `3 × level`); gates are enforced in the pure logic (`canBuild*`, `spawnUnit`, `reachableTargets`/`pathBetween`). A React/SVG `SkillTreeScreen` renders the tree as a full-screen overlay; opening a skill pays money and grants `SKILL_SCORE = 30`.

**Tech Stack:** TypeScript, PixiJS 8, React (skill tree + HUD), Zustand (store), Vitest.

## Global Constraints

- `Resources` = `{ wood, stone, money, ore }`; `START_RESOURCES = { wood: 3, stone: 2, money: 5, ore: 0 }`; `UPGRADE_COST = { wood: 2, stone: 1, money: 2, ore: 0 }`; `canAfford`/`pay` include ore.
- `Player.skills: SkillId[]`, init `[]`.
- Skill costs (money only): level 1 = 3, level 2 = 6 (`cost = 3 × level`).
- Swordsman: `{ movement: 1, attack: 4, attackDistance: 1, maxHp: 8, price: 15, priceOre: 1, shape: 'swordsman' }`; gated by the `swordsman` skill; `spawnUnit` requires 15 money + 1 ore.
- Port: built on an owned **water** tile, gated by the `water` skill, cost `{ wood: 10, money: 30, ore: 2 }`; no income (still +15 board score).
- Building costs: factory `{ money: 10 }`, mine `{ money: 15 }`, port `{ wood: 10, money: 30, ore: 2 }`.
- Skill gates: factory → `forestry`; mine → `smithery`; port → `water`; swordsman spawn → `swordsman`; mountains passable only with `climbing`.
- `buildingIncome(map, player)` returns `{ wood, stone, ore }`; mine → `stone += level`, `ore += level + (geology ? 1 : 0)`; factory → wood; port → none.
- Opening a skill adds `SKILL_SCORE = 30` (in `score.ts`) to the human's stored score, awarded immediately.
- AI has `skills` but never opens skills.
- Every task ends with `npm run typecheck` green and `npm test` green.

---

### Task 1: Ore resource

**Files:**
- Modify: `src/game/resources.ts`
- Modify: `src/screens/hud/MoneyInfo.tsx`
- Test: `tests/resources.test.ts`
- Modify test Player resources literals: `tests/buildings.test.ts`, `tests/score.test.ts`, `tests/spawn.test.ts`

**Interfaces:**
- Produces: `Resources` includes `ore`; `START_RESOURCES`, `UPGRADE_COST` with `ore`; `canAfford`/`pay` handle `ore`.

- [ ] **Step 1: Update the tests** — in `tests/resources.test.ts`:

Change the start/cost/pay assertions to include `ore`:

```ts
  it('starts with 3 wood, 2 stone, 5 money, 0 ore', () => {
    expect(START_RESOURCES).toEqual({ wood: 3, stone: 2, money: 5, ore: 0 });
  });

  it('upgrade cost is 2 wood, 1 stone, 2 money, 0 ore', () => {
    expect(UPGRADE_COST).toEqual({ wood: 2, stone: 1, money: 2, ore: 0 });
  });

  it('pay subtracts the cost', () => {
    expect(pay(START_RESOURCES, UPGRADE_COST)).toEqual({ wood: 1, stone: 1, money: 3, ore: 0 });
  });
```

Add an ore-aware `canAfford` case:

```ts
    expect(canAfford({ wood: 0, stone: 0, money: 5, ore: 0 }, { wood: 0, stone: 0, money: 0, ore: 1 })).toBe(false);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/resources.test.ts`
Expected: FAIL — `START_RESOURCES` has no `ore`.

- [ ] **Step 3: Update `src/game/resources.ts`**

```ts
export interface Resources {
  wood: number;
  stone: number;
  money: number;
  ore: number;
}

export const START_RESOURCES: Resources = { wood: 3, stone: 2, money: 5, ore: 0 };

export const UPGRADE_COST: Resources = { wood: 2, stone: 1, money: 2, ore: 0 };

export function canAfford(have: Resources, cost: Resources): boolean {
  return (
    have.wood >= cost.wood &&
    have.stone >= cost.stone &&
    have.money >= cost.money &&
    have.ore >= cost.ore
  );
}

export function pay(have: Resources, cost: Resources): Resources {
  return {
    wood: have.wood - cost.wood,
    stone: have.stone - cost.stone,
    money: have.money - cost.money,
    ore: have.ore - cost.ore,
  };
}
```

- [ ] **Step 4: Update `src/screens/hud/MoneyInfo.tsx`**

Add ore to the read values and render it. Change the `player` selector block to also read `ore`, and add a dark-gray square + ore span after the stone span:

```tsx
  const ore = player?.resources.ore ?? 0;
  const oreTick = useTickingValue(ore);
```

and after the stone span:

```tsx
      <span style={{ ...squareStyle, background: '#555' }}/>
      <span key={`ore-${oreTick.bounce}`}
            className={oreTick.bounce > 0 ? 'money-bounce' : ''}>Ore: {oreTick.value}</span>
```

- [ ] **Step 5: Add `ore: 0` to test Player resources literals**

- `tests/buildings.test.ts` — `player()` helper: `resources: { wood: 0, stone: 0, money },` → `resources: { wood: 0, stone: 0, money, ore: 0 },`
- `tests/score.test.ts` — `player()` helper: `resources: { wood: 0, stone: 0, money },` → add `, ore: 0` before the closing brace.
- `tests/spawn.test.ts` — `makePlayer` helper: `resources: { wood: 5, stone: 5, money },` → `resources: { wood: 5, stone: 5, money, ore: 0 },`

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/resources.ts src/screens/hud/MoneyInfo.tsx tests/resources.test.ts tests/buildings.test.ts tests/score.test.ts tests/spawn.test.ts
git commit -m "feat: add ore resource"
```

---

### Task 2: Skills model

**Files:**
- Create: `src/game/skills.ts`
- Modify: `src/game/players.ts` (`Player.skills`, init `[]`)
- Test: `tests/skills.test.ts` (new)
- Modify test Player literals (add `skills: []`): `tests/buildings.test.ts`, `tests/score.test.ts`, `tests/spawn.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–6):
  - `export type SkillId = 'climbing' | 'smithery' | 'swordsman' | 'geology' | 'water' | 'navigation' | 'waterTemples' | 'forestry' | 'forestTemple';`
  - `export interface SkillInfo { id: SkillId; name: string; level: number; parent: SkillId | null }`
  - `export const SKILLS: Record<SkillId, SkillInfo>`
  - `export function skillCost(id: SkillId): number`
  - `export function hasSkill(player: Player, id: SkillId): boolean`
  - `export function canOpenSkill(player: Player, id: SkillId): boolean`
  - `export function openSkill(player: Player, id: SkillId): boolean`
  - `Player.skills: SkillId[]`

- [ ] **Step 1: Write the failing tests** — create `tests/skills.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import {
  canOpenSkill,
  hasSkill,
  openSkill,
  skillCost,
  SKILLS,
  SkillId,
} from '../src/game/skills';

function player(money: number, skills: SkillId[] = []): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money, ore: 0 },
    isActive: true,
    score: 0,
    skills,
  };
}

describe('skills', () => {
  it('defines the nine skills with costs 3 and 6 and correct parents', () => {
    expect(Object.keys(SKILLS)).toHaveLength(9);
    expect(skillCost('climbing')).toBe(3);
    expect(skillCost('water')).toBe(3);
    expect(skillCost('forestry')).toBe(3);
    expect(skillCost('smithery')).toBe(6);
    expect(skillCost('swordsman')).toBe(6);
    expect(skillCost('geology')).toBe(6);
    expect(skillCost('navigation')).toBe(6);
    expect(skillCost('waterTemples')).toBe(6);
    expect(skillCost('forestTemple')).toBe(6);
    expect(SKILLS.smithery.parent).toBe('climbing');
    expect(SKILLS.swordsman.parent).toBe('climbing');
    expect(SKILLS.geology.parent).toBe('climbing');
    expect(SKILLS.navigation.parent).toBe('water');
    expect(SKILLS.waterTemples.parent).toBe('water');
    expect(SKILLS.forestTemple.parent).toBe('forestry');
    expect(SKILLS.climbing.parent).toBeNull();
    expect(SKILLS.water.parent).toBeNull();
    expect(SKILLS.forestry.parent).toBeNull();
  });

  it('canOpenSkill requires the parent and the money', () => {
    expect(canOpenSkill(player(100), 'climbing')).toBe(true);
    expect(canOpenSkill(player(100), 'smithery')).toBe(false);
    expect(canOpenSkill(player(100, ['climbing']), 'smithery')).toBe(true);
    expect(canOpenSkill(player(2), 'climbing')).toBe(false);
  });

  it('openSkill pays money, adds the skill, and rejects repeat/ungated opens', () => {
    const p = player(100);
    expect(openSkill(p, 'climbing')).toBe(true);
    expect(p.skills).toEqual(['climbing']);
    expect(p.resources.money).toBe(97);
    expect(openSkill(p, 'climbing')).toBe(false);
    expect(openSkill(p, 'water')).toBe(false);
    const broke = player(2);
    expect(openSkill(broke, 'forestry')).toBe(false);
    expect(broke.skills).toEqual([]);
  });

  it('hasSkill checks the list', () => {
    expect(hasSkill(player(0, ['forestry']), 'forestry')).toBe(true);
    expect(hasSkill(player(0), 'forestry')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL — `Cannot find module '../src/game/skills'`.

- [ ] **Step 3: Create `src/game/skills.ts`**

```ts
import type { Player } from './players';
import { canAfford, pay } from './resources';

export type SkillId =
  | 'climbing'
  | 'smithery'
  | 'swordsman'
  | 'geology'
  | 'water'
  | 'navigation'
  | 'waterTemples'
  | 'forestry'
  | 'forestTemple';

export interface SkillInfo {
  id: SkillId;
  name: string;
  level: number;
  parent: SkillId | null;
}

export const SKILLS: Record<SkillId, SkillInfo> = {
  climbing: { id: 'climbing', name: 'Climbing', level: 1, parent: null },
  smithery: { id: 'smithery', name: 'Smithery', level: 2, parent: 'climbing' },
  swordsman: { id: 'swordsman', name: 'Swordsman', level: 2, parent: 'climbing' },
  geology: { id: 'geology', name: 'Geology', level: 2, parent: 'climbing' },
  water: { id: 'water', name: 'Water', level: 1, parent: null },
  navigation: { id: 'navigation', name: 'Navigation', level: 2, parent: 'water' },
  waterTemples: { id: 'waterTemples', name: 'Water temples', level: 2, parent: 'water' },
  forestry: { id: 'forestry', name: 'Forestry', level: 1, parent: null },
  forestTemple: { id: 'forestTemple', name: 'Forest temple', level: 2, parent: 'forestry' },
};

export function skillCost(id: SkillId): number {
  return 3 * SKILLS[id].level;
}

export function hasSkill(player: Player, id: SkillId): boolean {
  return player.skills.includes(id);
}

export function canOpenSkill(player: Player, id: SkillId): boolean {
  if (hasSkill(player, id)) return false;
  const info = SKILLS[id];
  if (info.parent && !hasSkill(player, info.parent)) return false;
  return canAfford(player.resources, { wood: 0, stone: 0, money: skillCost(id), ore: 0 });
}

export function openSkill(player: Player, id: SkillId): boolean {
  if (!canOpenSkill(player, id)) return false;
  player.resources = pay(player.resources, { wood: 0, stone: 0, money: skillCost(id), ore: 0 });
  player.skills.push(id);
  return true;
}
```

- [ ] **Step 4: Add `skills` to `Player` in `src/game/players.ts`**

Add `import type { SkillId } from './skills';` and `skills: SkillId[];` to the interface; init `skills: [],` in both player objects in `buildPlayers`.

- [ ] **Step 5: Add `skills: []` to test Player literals**

- `tests/buildings.test.ts` — `player()`: add `skills: [],` (after `score: 0,`).
- `tests/score.test.ts` — `player()`: add `skills: [],` (after `score,`).
- `tests/spawn.test.ts` — `makePlayer` return: add `, skills: []` (after `score: 0`).

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/skills.ts src/game/players.ts tests/skills.test.ts tests/buildings.test.ts tests/score.test.ts tests/spawn.test.ts
git commit -m "feat: add skills model with prerequisites and money costs"
```

---

### Task 3: Swordsman unit

**Files:**
- Modify: `src/game/units.ts` (swordsman, `priceOre`, shape union)
- Modify: `src/game/spawn.ts` (ore cost + skill gate)
- Modify: `src/render/textureFactory.ts` (`makeUnitTexture` swordsman shape)
- Modify: `src/render/mapRenderer.ts` (`drawUnitShapeBorder` handles the new shape via its circle fallback)
- Modify: `src/ui/SpawnDialog.tsx` (gate + ore cost)
- Test: `tests/units.test.ts`, `tests/spawn.test.ts`

**Interfaces:**
- Consumes: `hasSkill(player, 'swordsman')` from `skills.ts`; `canAfford`/`pay` from `resources.ts`.
- Produces: `UNIT_TYPES.swordsman`; `UnitTypeInfo.priceOre: number`; `UnitType` includes `'swordsman'`; `shape` union includes `'swordsman'`.

- [ ] **Step 1: Update the tests**

In `tests/units.test.ts`, add the swordsman data assertion:

```ts
    expect(UNIT_TYPES.swordsman).toEqual({ movement: 1, attack: 4, attackDistance: 1, maxHp: 8, price: 15, priceOre: 1, shape: 'swordsman' });
```

and change the existing `UNIT_TYPES` assertions to include `priceOre`:

```ts
    expect(UNIT_TYPES.warrior).toEqual({ movement: 1, attack: 2, attackDistance: 1, maxHp: 5, price: 4, priceOre: 0, shape: 'circle' });
    expect(UNIT_TYPES.rider).toEqual({ movement: 3, attack: 1, attackDistance: 1, maxHp: 4, price: 6, priceOre: 0, shape: 'square' });
    expect(UNIT_TYPES.archer).toEqual({ movement: 1, attack: 1, attackDistance: 2, maxHp: 3, price: 6, priceOre: 0, shape: 'triangle' });
```

In `tests/spawn.test.ts`, add a test that the swordsman costs money + ore and is gated by the skill:

```ts
  it('swordsman requires the swordsman skill and 15 money + 1 ore', () => {
    const map = makeMap();
    const village = map.tiles[0];
    const noSkill = makePlayer(0, 20);
    noSkill.resources.ore = 1;
    expect(spawnUnit(map, village, 'swordsman', noSkill)).toBe(false);
    expect(village.unit).toBeNull();
    const skilled = makePlayer(0, 20);
    skilled.resources.ore = 1;
    skilled.skills = ['swordsman'];
    expect(spawnUnit(map, village, 'swordsman', skilled)).toBe(true);
    expect(skilled.resources.money).toBe(5);
    expect(skilled.resources.ore).toBe(0);
    expect(village.unit!.type).toBe('swordsman');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/units.test.ts tests/spawn.test.ts`
Expected: FAIL — `UNIT_TYPES.swordsman` undefined / swordman skill gate not enforced.

- [ ] **Step 3: Update `src/game/units.ts`**

```ts
export type UnitType = 'warrior' | 'rider' | 'archer' | 'swordsman';
```

Add `priceOre: number;` to `UnitTypeInfo`, add `priceOre: 0,` to warrior/rider/archer, and add the swordsman entry:

```ts
  swordsman: { movement: 1, attack: 4, attackDistance: 1, maxHp: 8, price: 15, priceOre: 1, shape: 'swordsman' },
```

Change the `shape` field type to `'circle' | 'square' | 'triangle' | 'swordsman'`. Add `swordsman: 'Swordsman',` to `UNIT_TYPE_NAMES`.

- [ ] **Step 4: Update `src/game/spawn.ts`**

Imports: `import { hasSkill } from './skills';` and `import { canAfford, pay } from './resources';`.

Replace the affordability check and deduction in `spawnUnit`:

```ts
  if (type === 'swordsman' && !hasSkill(player, 'swordsman')) return false;
  const cost = { wood: 0, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
  if (!canAfford(player.resources, cost)) return false;

  player.resources = pay(player.resources, cost);
```

- [ ] **Step 5: Update `makeUnitTexture` in `src/render/textureFactory.ts`**

Add a `'swordsman'` branch before the `else` circle branch:

```ts
  } else if (shape === 'swordsman') {
    g.circle(0, 0, r).fill(color).stroke({ width: 3, color: 0x000000 });
    const tr = r * 0.45;
    g.poly([0, -tr, tr, tr, -tr, tr]).fill(0xffffff).stroke({ width: 2, color: 0x000000 });
  } else {
```

(`drawUnitShapeBorder` in `mapRenderer.ts` already falls through to a circle for unknown shapes, so no change is needed there — the swordsman gets a circle selection border.)

- [ ] **Step 6: Update `src/ui/SpawnDialog.tsx`**

Import `hasSkill` from `../../game/skills` and `canAfford` from `../../game/resources`. Filter/disable the swordsman row:

```tsx
        {(Object.keys(UNIT_TYPES) as UnitType[]).map((type) => {
          const gated = type === 'swordsman' && !hasSkill(players[0], 'swordsman');
          const cost = { wood: 0, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
          const unaffordable = !canAfford(players[0].resources, cost);
          const oreText = UNIT_TYPES[type].priceOre > 0 ? ` + ${UNIT_TYPES[type].priceOre} ore` : '';
          return (
            <button
              key={type}
              disabled={gated || full || unaffordable}
              onClick={() => gameController.spawnSelectedVillage(type)}
            >
              {UNIT_TYPE_NAMES[type]} — {UNIT_TYPES[type].price}{oreText}{gated ? ' (need skill)' : ''}
            </button>
          );
        })}
```

(Replace the existing `{(Object.keys(UNIT_TYPES) as UnitType[]).map(...)}` block.)

- [ ] **Step 7: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/game/units.ts src/game/spawn.ts src/render/textureFactory.ts src/ui/SpawnDialog.tsx tests/units.test.ts tests/spawn.test.ts
git commit -m "feat: add swordsman unit with skill gate and ore cost"
```

---

### Task 4: Port building, skill gates, ore income, and score bonus

**Files:**
- Modify: `src/game/mapGen.ts` (`Building.kind` gains `'port'`)
- Modify: `src/game/buildings.ts` (per-kind costs, `Player` params, skill gates, port, ore income)
- Modify: `src/game/score.ts` (`SKILL_SCORE = 30`)
- Modify: `src/render/textureFactory.ts` (`portTexture`), `src/render/mapRenderer.ts` (port sprite)
- Modify: `src/controller/gameController.ts` (`buildingIncome` call passes `player`)
- Modify: `src/screens/hud/ActionToolbar.tsx` (pass player to canBuild*, add port button)
- Test: `tests/buildings.test.ts`, `tests/score.test.ts`

**Interfaces:**
- Consumes: `hasSkill`, `SkillId` from `skills.ts`; `canAfford`/`pay`/`Resources`.
- Produces:
  - `Building.kind: 'factory' | 'mine' | 'port'`
  - `canBuildFactory(map, tile, player: Player): boolean` (requires `forestry`)
  - `canBuildMine(map, tile, player: Player): boolean` (requires `smithery`)
  - `canBuildPort(map, tile, player: Player): boolean` (owned water tile, requires `water`)
  - `buildBuilding(map, tile, kind, player): boolean` (pays per-kind cost)
  - `buildingIncome(map, player): { wood, stone, ore }`
  - `SKILL_SCORE = 30` in `score.ts`

- [ ] **Step 1: Update the tests**

Rewrite `tests/buildings.test.ts` to:
- Change `canBuildFactory(map, tile, 0)` / `canBuildMine(map, tile, 0)` calls to pass a `player(...)` object (with `skills: []`).
- Add `canBuildPort` tests (owned water tile with `water` skill → true; without skill → false; land tile → false; unowned → false).
- Add skill-gate tests: factory requires `forestry`, mine requires `smithery`.
- Update `buildingIncome` calls to pass a `player` object and assert the new `{ wood, stone, ore }` shape. The mine tests change to `buildingIncome(map, p)` returning `{ wood: 0, stone: N, ore: N }`. Add a geology test (mine `level` ore + 1 with `geology` skill).
- The `buildBuilding` tests now need `player(skills)` — factory tests use `player` with `skills: ['forestry']` and money ≥ 10; mine tests use `skills: ['smithery']`.

Concretely, replace the helpers/imports and update each `it`:

```ts
import { hasSkill } from ... // not needed in tests
```

The `player` helper gains a `skills` parameter:

```ts
function player(money: number, skills: SkillId[] = []): import('../src/game/players').Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money, ore: 0 },
    isActive: true,
    score: 0,
    skills,
  };
}
```

(import `SkillId` from `../src/game/skills`). Then:

- `canBuildFactory` tests: pass `player(100, ['forestry'])`; the "requires forestry" case asserts `canBuildFactory(map, land, player(100)) === false` and `=== true` with `['forestry']`.
- `canBuildMine`: pass `player(100, ['smithery'])`; gate assertion without smithery.
- New `canBuildPort` describe: `canBuildPort(map, waterTile, player(100, ['water']))` true; without water → false; land tile → false; unowned → false.
- `buildBuilding` factory: `player(20, ['forestry'])`; mine: `player(20, ['smithery'])`; port: `player(100, ['water'])` with `resources.wood = 10, resources.ore = 2` → deducts and sets `{ kind: 'port', level: 1 }`.
- `buildingIncome`: factory/mine tests pass a player; mine test `expect(buildingIncome(map, p)).toEqual({ wood: 0, stone: 1, ore: 1 })` (level 1); the level-2 mine test `{ wood: 0, stone: 3, ore: 3 }`; add geology test: mine level 1 + `['geology']` → `{ wood: 0, stone: 1, ore: 2 }`.
- The "two factories near same forest", "factory level multiplies income", "income follows ownership", "ignores buildings on other players' tiles" tests pass `player` objects and keep their wood assertions (shape now `{ wood, stone, ore }`).

In `tests/score.test.ts`, add:

```ts
    expect(SKILL_SCORE).toBe(30);
```

(import `SKILL_SCORE`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/buildings.test.ts tests/score.test.ts`
Expected: FAIL — `Building` kind/`canBuildPort`/ore income not implemented.

- [ ] **Step 3: Update `src/game/mapGen.ts`**

Change the `Building` interface kind union to include `'port'`:

```ts
export interface Building {
  kind: 'factory' | 'mine' | 'port';
  level: number;
}
```

- [ ] **Step 4: Rewrite `src/game/buildings.ts`**

```ts
import { hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay, Resources } from './resources';
import { hasSkill } from './skills';
import { isForestType, isLandType, isMountainType, isWaterType } from './tileTypes';

export const FACTORY_COST = 10;
export const MINE_COST = 15;

export const BUILDING_COSTS: Record<'factory' | 'mine' | 'port', Resources> = {
  factory: { wood: 0, stone: 0, money: FACTORY_COST, ore: 0 },
  mine: { wood: 0, stone: 0, money: MINE_COST, ore: 0 },
  port: { wood: 10, stone: 0, money: 30, ore: 2 },
};

function neighborTile(map: GameMap, n: { q: number; r: number }): MapTile | undefined {
  return map.tiles.find((t) => t.q === n.q && t.r === n.r);
}

export function canBuildFactory(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'forestry')) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!isLandType(tile.terrain)) return false;
  return hexNeighbors(tile).some((n) => {
    const t = neighborTile(map, n);
    return t !== undefined && isForestType(t.terrain);
  });
}

export function canBuildMine(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'smithery')) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  return isMountainType(tile.terrain);
}

export function canBuildPort(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'water')) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  return isWaterType(tile.terrain);
}

export function buildBuilding(
  map: GameMap,
  tile: MapTile,
  kind: 'factory' | 'mine' | 'port',
  player: Player,
): boolean {
  const allowed =
    kind === 'factory'
      ? canBuildFactory(map, tile, player)
      : kind === 'mine'
        ? canBuildMine(map, tile, player)
        : canBuildPort(map, tile, player);
  if (!allowed) return false;
  const cost = BUILDING_COSTS[kind];
  if (!canAfford(player.resources, cost)) return false;
  player.resources = pay(player.resources, cost);
  tile.building = { kind, level: 1 };
  return true;
}

export function buildingIncome(map: GameMap, player: Player): { wood: number; stone: number; ore: number } {
  let wood = 0;
  let stone = 0;
  let ore = 0;
  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index || !tile.building) continue;
    if (tile.building.kind === 'mine') {
      stone += tile.building.level;
      ore += tile.building.level + (hasSkill(player, 'geology') ? 1 : 0);
      continue;
    }
    if (tile.building.kind === 'factory') {
      const forests = hexNeighbors(tile).filter((n) => {
        const t = neighborTile(map, n);
        return t !== undefined && isForestType(t.terrain);
      }).length;
      wood += tile.building.level * forests;
    }
  }
  return { wood, stone, ore };
}
```

- [ ] **Step 5: Add `SKILL_SCORE` to `src/game/score.ts`**

```ts
export const SKILL_SCORE = 30;
```

- [ ] **Step 6: Add the port texture**

In `src/render/textureFactory.ts`, add a `makePortTexture` function and include it in `TextureSet`/`createTextures`:

```ts
function makePortTexture(app: Application, hexSize: number): Texture {
  const g = new Graphics();
  const s = hexSize * 0.34;
  g.poly([-s, 0, 0, -s * 0.55, s, 0, 0, s * 0.55]).fill(0xe07830).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

Add `portTexture: Texture;` to `TextureSet`, build `const portTexture = makePortTexture(app, hexSize);`, and include it in the returned object.

- [ ] **Step 7: Draw the port in `src/render/mapRenderer.ts`**

In the tile-loop building block, use a lookup by kind:

```ts
    if (tile.building) {
      const buildingTexture =
        tile.building.kind === 'port'
          ? textures.portTexture
          : tile.building.kind === 'factory'
            ? textures.factoryTexture
            : textures.mineTexture;
      const buildingSprite = new Sprite(buildingTexture);
      buildingSprite.anchor.set(0.5);
      buildingSprite.scale.set(spriteScale);
      buildingSprite.position.set(p.x, y);
      container.addChild(buildingSprite);
    }
```

- [ ] **Step 8: Update `src/controller/gameController.ts`**

Change the turn-end income call in `runAiPhase`:

```ts
      const buildings = buildingIncome(this.map, player);
      player.resources.wood += buildings.wood;
      player.resources.stone += buildings.stone;
      player.resources.ore += buildings.ore;
```

- [ ] **Step 9: Update `src/screens/hud/ActionToolbar.tsx`**

Imports: `import { canBuildFactory, canBuildMine, canBuildPort, BUILDING_COSTS } from '../../game/buildings';` and `import { canAfford } from '../../game/resources';` (already imported as `canAfford`). Replace the build-button block with:

```tsx
  if (settlement === null) {
    const player = players[0];
    const canBuild = (kind: 'factory' | 'mine' | 'port', label: string): void => {
      const ok =
        kind === 'factory'
          ? canBuildFactory(map, tile, player)
          : kind === 'mine'
            ? canBuildMine(map, tile, player)
            : canBuildPort(map, tile, player);
      if (!ok) return;
      const disabled = !canAfford(player.resources, BUILDING_COSTS[kind]);
      buttons.push(
        <button key={kind} disabled={disabled}
                onClick={() => gameController.buildSelectedBuilding(kind)}>
          {label}
        </button>,
      );
    };
    canBuild('factory', 'Build factory (10)');
    canBuild('mine', 'Build mine (15)');
    canBuild('port', 'Build port (10w, 30, 2 ore)');
  }
```

- [ ] **Step 10: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/game/mapGen.ts src/game/buildings.ts src/game/score.ts src/render/textureFactory.ts src/render/mapRenderer.ts src/controller/gameController.ts src/screens/hud/ActionToolbar.tsx tests/buildings.test.ts tests/score.test.ts
git commit -m "feat: add port, skill-gated buildings, ore income"
```

---

### Task 5: Mountain movement requires climbing

**Files:**
- Modify: `src/game/selection.ts` (`canClimb` params)
- Modify: `src/controller/gameController.ts` (pass `hasSkill(..., 'climbing')`)
- Test: `tests/selection.test.ts`

**Interfaces:**
- Consumes: `hasSkill` from `skills.ts`.
- Produces:
  - `reachableTargets(map, unit, range = UNIT_MOVEMENT[unit.type], canClimb = false): MapTile[]`
  - `pathBetween(map, from, to, canClimb = false): Axial[]`

- [ ] **Step 1: Add failing tests** — in `tests/selection.test.ts`:

```ts
  it('mountains block movement unless climbing is opened', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.GrasslandMountain));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
    expect(reachableTargets(map, unit, undefined, true).map((t) => `${t.q},${t.r}`)).toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, true)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });
```

(`unit` is the warrior fixture already defined in that file; `reachableTargets(map, unit, undefined, true)` relies on the default `range`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/selection.test.ts`
Expected: FAIL — mountains are currently passable.

- [ ] **Step 3: Update `src/game/selection.ts`**

Import `isMountainType` from `./tileTypes`. Add a `passable` helper and thread `canClimb` through both functions:

```ts
export function reachableTargets(
  map: GameMap,
  unit: Unit,
  range = UNIT_MOVEMENT[unit.type],
  canClimb = false,
): MapTile[] {
  return map.tiles.filter((t) => {
    if (hexDistance({ q: unit.q, r: unit.r }, t) > range) return false;
    if (t.terrain === TileType.Water) return false;
    if (!canClimb && isMountainType(t.terrain)) return false;
    if (t.unit) return false;
    return true;
  });
}

export function pathBetween(
  map: GameMap,
  from: Axial,
  to: Axial,
  canClimb = false,
): Axial[] {
  ...
      if (tile.terrain === TileType.Water) continue;
      if (!canClimb && isMountainType(tile.terrain)) continue;
  ...
}
```

- [ ] **Step 4: Update `src/controller/gameController.ts`**

Import `hasSkill` from `../game/skills`.

In `render()` where `reachableTargets` is called, pass the climber flag:

```ts
      const player = store.players[unit.owner];
      const canClimb = hasSkill(player, 'climbing');
      if (unit.owner === 0 && canMove(unit)) {
        this.reachableKeys = new Set(reachableTargets(this.map, unit, moveRange(unit), canClimb).map((t) => axialKey(t)));
      }
```

In `animateUnitMove`, pass the flag to `pathBetween`:

```ts
    const canClimb = hasSkill(useGameStore.getState().players[unit.owner], 'climbing');
    const path = pathBetween(this.map, source, target, canClimb);
```

- [ ] **Step 5: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/selection.ts src/controller/gameController.ts tests/selection.test.ts
git commit -m "feat: mountains block movement until climbing is opened"
```

---

### Task 6: Skill tree screen + HUD

**Files:**
- Modify: `src/store/gameStore.ts` (`skillTreeOpen`)
- Create: `src/screens/SkillTreeScreen.tsx`
- Modify: `src/screens/GameScreen.tsx` (render overlay + Skills button)
- Modify: `src/controller/gameController.ts` (`openSkill`)
- Modify: `index.html` (`#skills-btn` CSS)
- No new pure tests (React scene; verify via typecheck/build/manual).

**Interfaces:**
- Consumes: `SKILLS`, `hasSkill`, `canOpenSkill`, `openSkill` from `skills.ts`; `SKILL_SCORE`, `awardScore` from `score.ts`; `TRIBES`.
- Produces: `useGameStore.skillTreeOpen: boolean`, `setSkillTreeOpen(open: boolean)`; `gameController.openSkill(id: SkillId): void`.

- [ ] **Step 1: Add `skillTreeOpen` to `src/store/gameStore.ts`**

Add to the interface and initial state:

```ts
  skillTreeOpen: boolean;
  setSkillTreeOpen: (open: boolean) => void;
```

```ts
  skillTreeOpen: false,
  setSkillTreeOpen: (open) => set({ skillTreeOpen: open }),
```

- [ ] **Step 2: Add `gameController.openSkill`**

Imports: add `openSkill as applySkill` to the `../game/skills` import; add `SKILL_SCORE` to the `../game/score` import.

```ts
  openSkill(id: SkillId): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    const player = store.players[0];
    if (applySkill(player, id)) {
      awardScore(player, SKILL_SCORE);
      store.setPlayers([...store.players]);
    }
  }
```

(import `SkillId` from `../game/skills`.)

- [ ] **Step 3: Create `src/screens/SkillTreeScreen.tsx`**

```tsx
import { gameController } from '../controller/gameController';
import { useGameStore } from '../store/gameStore';
import { TRIBES } from '../game/tribes';
import { SKILLS, hasSkill, canOpenSkill, SkillId, skillCost } from '../game/skills';

const POS: Record<SkillId, { x: number; y: number }> = {
  climbing: { x: 200, y: 140 },
  water: { x: 400, y: 70 },
  forestry: { x: 600, y: 140 },
  smithery: { x: 110, y: 300 },
  swordsman: { x: 200, y: 400 },
  geology: { x: 290, y: 300 },
  navigation: { x: 330, y: 170 },
  waterTemples: { x: 470, y: 170 },
  forestTemple: { x: 690, y: 300 },
};

const ROOT = { x: 400, y: 320 };

export function SkillTreeScreen(): React.ReactElement {
  const human = useGameStore((s) => s.players[0]);
  const setSkillTreeOpen = useGameStore((s) => s.setSkillTreeOpen);
  const tribe = TRIBES.find((t) => t.id === human.tribe)!;
  const rootColor = `#${tribe.color.toString(16).padStart(6, '0')}`;

  const skills = Object.keys(SKILLS) as SkillId[];
  const lines = skills
    .filter((id) => SKILLS[id].parent !== null)
    .map((id) => {
      const parent = SKILLS[id].parent!;
      const p = POS[parent];
      const c = POS[id];
      const opened = hasSkill(human, id);
      return (
        <line
          key={id}
          x1={p.x}
          y1={p.y}
          x2={c.x}
          y2={c.y}
          stroke={opened ? '#ff8c00' : '#555'}
          strokeWidth={opened ? 4 : 2}
        />
      );
    });

  const nodes = skills.map((id) => {
    const pos = POS[id];
    const opened = hasSkill(human, id);
    const openable = canOpenSkill(human, id);
    return (
      <g
        key={id}
        onClick={openable ? () => gameController.openSkill(id) : undefined}
        style={{ cursor: openable ? 'pointer' : 'default' }}
      >
        <circle
          cx={pos.x}
          cy={pos.y}
          r={28}
          fill={opened ? '#ff8c00' : '#555'}
          stroke={opened ? '#ff8c00' : '#333'}
          strokeWidth={opened ? 5 : 2}
        />
        <text x={pos.x} y={pos.y} textAnchor="middle" dy=".35em" fill="#fff" fontSize="11">
          {opened ? '✓' : `${skillCost(id)}`}
        </text>
        <text x={pos.x} y={pos.y + 50} textAnchor="middle" fill="#eee" fontSize="13">
          {SKILLS[id].name}
        </text>
      </g>
    );
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#1a1a2e',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <h2 style={{ color: '#fff' }}>Skill tree</h2>
      <svg width="800" height="620" viewBox="0 0 800 620">
        <line x1={ROOT.x} y1={ROOT.y} x2={POS.climbing.x} y2={POS.climbing.y}
              stroke={hasSkill(human, 'climbing') ? '#ff8c00' : '#555'} strokeWidth={hasSkill(human, 'climbing') ? 4 : 2} />
        <line x1={ROOT.x} y1={ROOT.y} x2={POS.water.x} y2={POS.water.y}
              stroke={hasSkill(human, 'water') ? '#ff8c00' : '#555'} strokeWidth={hasSkill(human, 'water') ? 4 : 2} />
        <line x1={ROOT.x} y1={ROOT.y} x2={POS.forestry.x} y2={POS.forestry.y}
              stroke={hasSkill(human, 'forestry') ? '#ff8c00' : '#555'} strokeWidth={hasSkill(human, 'forestry') ? 4 : 2} />
        {lines}
        <circle cx={ROOT.x} cy={ROOT.y} r={34} fill={rootColor} stroke="#fff" strokeWidth={3} />
        <text x={ROOT.x} y={ROOT.y} textAnchor="middle" dy=".35em" fill="#fff" fontSize="12">
          {tribe.name}
        </text>
        {nodes}
      </svg>
      <button onClick={() => setSkillTreeOpen(false)}>Close</button>
    </div>
  );
}
```

- [ ] **Step 4: Update `src/screens/GameScreen.tsx`**

Import `SkillTreeScreen` and `useGameStore`; read `skillTreeOpen`/`setSkillTreeOpen`; render the overlay and a Skills button:

```tsx
import { useGameStore } from '../store/gameStore';
import { SkillTreeScreen } from './SkillTreeScreen';
...
export function GameScreen(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const skillTreeOpen = useGameStore((s) => s.skillTreeOpen);
  const setSkillTreeOpen = useGameStore((s) => s.setSkillTreeOpen);
  ...
  return (
    <div className="screen">
      <div id="game-root" ref={containerRef} />
      {skillTreeOpen && <SkillTreeScreen />}
      <ScoreInfo />
      <button id="skills-btn" onClick={() => setSkillTreeOpen(true)}>Skills</button>
      <PlayersList />
      ...
    </div>
  );
}
```

- [ ] **Step 5: Add `#skills-btn` CSS to `index.html`**

```css
    #skills-btn { position: absolute; top: 22px; right: 84px; }
```

- [ ] **Step 6: Run typecheck, tests, and build**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 7: Manual browser verification**

Run: `npm run dev`. Verify:
- The Skills button (left of the score circle) opens the full-screen skill tree; Close returns to the map.
- Root circle is in the human's tribe color; level-1 skills gray with gray lines; opened skills get orange borders + orange lines; level-2 skills are disabled until their parent opens.
- Opening a skill deducts the money cost and the score circle increases by 30 (bounces) after closing.
- Gates enforced: factory (forestry), mine (smithery), port (water, owned water tile), swordsman spawn (skill + 15 money + 1 ore), mountains impassable until climbing.

- [ ] **Step 8: Commit**

```bash
git add src/store/gameStore.ts src/screens/SkillTreeScreen.tsx src/screens/GameScreen.tsx src/controller/gameController.ts index.html
git commit -m "feat: add skill tree screen with +30 score per skill"
```
