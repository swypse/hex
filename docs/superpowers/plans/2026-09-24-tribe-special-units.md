# Tribe Special Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 tribe-gated special units (one per tribe) with unique abilities: stalker (stealth), builder (build), banner bearer (war-cry aura), berserker (rage), trapper (thorn traps), stormcaller (storm), stunner (stun).

**Architecture:** Flat expansion of the existing `UnitType` union + new commands/`do*` methods in `Simulator` + new `GameEvent`s presented by `EventPresenter`. Shared engine primitives live in a new `src/game/abilities.ts`; traps and storm get their own small modules (`traps.ts`, `storm.ts`) following the `bottles.ts`/`roads.ts` pattern. Tribe gating via a single `TRIBE_SPECIAL_UNIT` map, per-tribes textures reuse `<code>-warrior.png`, spawn icons reuse `action-spawn-warrior`.

**Tech Stack:** TypeScript, PixiJS 8, Zustand, Vite, Vitest. Run tests with `npm test` (or `npx vitest run <file>`) and typecheck with `npm run typecheck`.

## Global Constraints

- Every new `UnitType` MUST be added to: `UNIT_TYPES`, `UNIT_IMAGE_FILES` (all 7 tribes → `<tribe-code>-warrior.png`), `UNIT_MOVE_POINTS`, `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE`, `UNIT_MAINTENANCE`, `UNIT_TYPE_NAMES`, and i18n `unitType.*`, so no `undefined` texture/name lookups exist.
- Special units have **no skill requirement**; they are gated **only** by `TRIBE_SPECIAL_UNIT` + affordability. Villagers builder bypasses the building-kind skill; all other building rules (terrain, territory, village building-slot, cost) are unchanged.
- Stealthed units are invisible to all players except their owner; the owner sees their own stealthed stalker (slightly dimmed).
- Stalker is **visible at spawn**; auto-stealth happens only on the **first move after spawn**; re-hiding after a reveal requires the enable-stealth button (consumes all actions).
- Stunned targets: no HP damage from the stun, no counterattack provoked, `"stunned"` suffix on HP text.
- All new commands are added to `PREDICTABLE_COMMAND_TYPES` **except** `stun` (has a miss roll).
- Stat data (approved): stalker 12/30/0/60/0 @9m2w up3; builder 8/10/0/50/0 @7m up2; banner 8/20/1/60/8 @10m up3; berserker 10/50/1/70/12 @11m3o up4; trapper 10/20/1/50/8 @9m2w up3; stormcaller 20/20/1/50/8 @9m2o up4; stunner 8/40/2/40/10 @7m up2. Columns read: move / attack / range / HP / defense.
- Upkeep values from the spec data above; `UNIT_SCORE`: stalker 9, builder 7, banner 8, berserker 10, trapper 8, stormcaller 9, stunner 7.
- No new textures: unit sprites use the tribe's warrior texture; spawn button uses `action-spawn-warrior`; toolbar icons `action-stealth`, `action-stormcaller`, `action-build` and the `cannonbal-32` icon already exist.
- Combat damage for trap and storm: attacker atk 60, current hp = max hp, defense 0 → ≈90 damage, no miss roll, no counterattack.

---

### Task 1: Unit data model

**Files:**
- Modify: `src/game/units.ts`
- Test: `tests/units.test.ts`

**Interfaces:**
- Consumes: existing `UnitType`, `Unit`, `UNIT_TYPES`, `UNIT_IMAGE_FILES`, `UNIT_MOVE_POINTS`, `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE`, `UNIT_MAINTENANCE`, `UNIT_TYPE_NAMES`, `makeUnit`.
- Produces: 7 new `UnitType` members (`stalker`, `builder`, `banner`, `berserker`, `trapper`, `stormcaller`, `stunner`); new optional `Unit` fields `isStealthed?: boolean`, `firstMoveStealthDone?: boolean`, `stunTurns?: number`.

- [ ] **Step 1: Write the failing test**

Append to `tests/units.test.ts`:

```ts
import { UNIT_MAINTENANCE } from '../src/game/units'; // adjust existing import if present

describe('special units', () => {
  const cases: Array<[string, number, number, number, number, number, number, number, number]> = [
    ['stalker', 12, 30, 1, 60, 0, 9, 2, 0],
    ['builder', 8, 10, 1, 50, 0, 7, 0, 0],
    ['banner', 8, 20, 1, 60, 8, 10, 0, 0],
    ['berserker', 10, 50, 1, 70, 12, 11, 0, 3],
    ['trapper', 10, 20, 1, 50, 8, 9, 2, 0],
    ['stormcaller', 20, 20, 1, 50, 8, 9, 0, 2],
    ['stunner', 8, 40, 2, 40, 10, 7, 0, 0],
  ];
  for (const [type, move, atk, range, hp, def, price, wood, ore] of cases) {
    it(type, () => {
      const info = UNIT_TYPES[type];
      expect(info).toMatchObject({ movePoints: move, attack: atk, attackDistance: range, maxHp: hp, defense: def, price, priceWood: wood, priceOre: ore });
      expect(UNIT_TYPE_NAMES[type]).toBeTruthy();
    });
  }
  it('upkeep values', () => {
    expect(UNIT_MAINTENANCE.stalker).toBe(3);
    expect(UNIT_MAINTENANCE.builder).toBe(2);
    expect(UNIT_MAINTENANCE.banner).toBe(3);
    expect(UNIT_MAINTENANCE.berserker).toBe(4);
    expect(UNIT_MAINTENANCE.trapper).toBe(3);
    expect(UNIT_MAINTENANCE.stormcaller).toBe(4);
    expect(UNIT_MAINTENANCE.stunner).toBe(2);
  });
});
```

Also copy `makeUnit(...)` flags: `expect(makeUnit(0, 'stalker', 0, 0).isStealthed).toBeUndefined()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/units.test.ts -t special`
Expected: FAIL — `UNIT_TYPES[type]` is `undefined` for the new types.

- [ ] **Step 3: Implement**

In `src/game/units.ts`:

```ts
export type UnitType = 'warrior' | 'rider' | 'archer' | 'swordsman' | 'shield' | 'catapult' | 'knight' | 'pirate'
  | 'stalker' | 'builder' | 'banner' | 'berserker' | 'trapper' | 'stormcaller' | 'stunner';
```

Add to `UNIT_TYPES`:

```ts
  stalker: { movePoints: 12, attack: 30, attackDistance: 1, maxHp: 60, defense: 0, price: 9, priceWood: 2, priceOre: 0, shape: 'circle' },
  builder: { movePoints: 8, attack: 10, attackDistance: 1, maxHp: 50, defense: 0, price: 7, priceWood: 0, priceOre: 0, shape: 'circle' },
  banner: { movePoints: 8, attack: 20, attackDistance: 1, maxHp: 60, defense: 8, price: 10, priceWood: 0, priceOre: 0, shape: 'circle' },
  berserker: { movePoints: 10, attack: 50, attackDistance: 1, maxHp: 70, defense: 12, price: 11, priceWood: 0, priceOre: 3, shape: 'circle' },
  trapper: { movePoints: 10, attack: 20, attackDistance: 1, maxHp: 50, defense: 8, price: 9, priceWood: 2, priceOre: 0, shape: 'circle' },
  stormcaller: { movePoints: 20, attack: 20, attackDistance: 1, maxHp: 50, defense: 8, price: 9, priceWood: 0, priceOre: 2, shape: 'circle' },
  stunner: { movePoints: 8, attack: 40, attackDistance: 2, maxHp: 40, defense: 10, price: 7, priceWood: 0, priceOre: 0, shape: 'circle' },
```

`playable` in `UNIT_IMAGE_FILES`: for each tribe add entries mapping each new type to the tribe's warrior PNG. Because the record already has all 7 base types, replace every line's trailing `knight:` entry with spread-style additions. Add a helper to avoid repetition by appending after the record is declared:

```ts
const SPECIAL_UNIT_TYPES: UnitType[] = ['stalker', 'builder', 'banner', 'berserker', 'trapper', 'stormcaller', 'stunner'];
for (const [tribeCode] of Object.entries([...])) { /* not needed — do it inline instead */ }
```

> Don't do the loop; edit `UNIT_IMAGE_FILES` literally. For each of the 7 tribe lines, append the 7 new keys mapping to warrior PNGs:
> `stalker: 'cats-warrior.png', builder: 'cats-warrior.png', banner: 'cats-warrior.png', berserker: 'cats-warrior.png', trapper: 'cats-warrior.png', stormcaller: 'cats-warrior.png', stunner: 'cats-warrior.png'` (same for warriors/villagers/barbarians/forest/aqua/sand prefixes).

Add to `UNIT_MOVE_POINTS`, `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE` (mirror `UNIT_TYPES` values), `UNIT_MAINTENANCE` (3,2,3,4,3,4,2), `UNIT_TYPE_NAMES` (`t('unitType.stalker')`, etc.), and `makeUnit`'s returned object is unchanged (new fields are optional and default-undefined). `canMove`/`canAttack`/`canHeal` need no change this task (stun suppression comes in Task 5).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/units.ts tests/units.test.ts
git commit -m "feat: add 7 tribe special unit type data"
```

---

### Task 2: Tribe gating

**Files:**
- Modify: `src/game/tribes.ts`, `src/game/spawn.ts`, `src/game/ai-patterns.ts`
- Test: `tests/spawn.test.ts`, `tests/ai-patterns.test.ts` (or `tests/ai.test.ts` if the pattern-helper tests live there)

**Interfaces:**
- Consumes: `UnitType`, `Tribe`.
- Produces: `export const TRIBE_SPECIAL_UNIT: Record<Tribe, UnitType>` (cats→stalker, villagers→builder, warriors→banner, barbarians→berserker, forest→trapper, aqua→stormcaller, sand→stunner).

- [ ] **Step 1: Write the failing test**

Append to `tests/spawn.test.ts`:

```ts
import { Tribe } from '../src/game/tribes';
import { TRIBE_SPECIAL_UNIT } from '../src/game/tribes';
import { makeUnit, UNIT_TYPES } from '../src/game/units';

it('spawns a special unit only for its tribe', () => {
  // cats village owned by a cats player
  const cats = playerWithTribe(Tribe.Cats, 100, 100, 100, 100); // helper below
  // ... economic setup (resources set high) — reuse the file's existing helpers
  const village = /* a tile with a settlement owned by cats */;
  const ok = spawnUnit(map, village, 'stalker', cats);
  expect(ok).toBe(true);
  expect(village.unit?.type).toBe('stalker');
});
it('refuses a special unit for a foreign tribe', () => {
  const cats = playerWithTribe(Tribe.Cats, 100, 100, 100, 100);
  const ok = spawnUnit(map, village, 'banner', cats); // banner is warriors'
  expect(ok).toBe(false);
});
it('does not require a skill to spawn the special unit', () => {
  const cats = playerWithTribe(Tribe.Cats, 100, 100, 100, 100); // no skills opened
  const ok = spawnUnit(map, village, 'stalker', cats);
  expect(ok).toBe(true);
});
```

Add a small helper `playerWithTribe(tribe, wood, stone, money, ore)` that builds a `Player` (see `src/game/players.ts`) with full resources and no skills, and a `map`/settlement fixture like other tests in the file use.

Also in `tests/ai-patterns.test.ts`:

```ts
it('bestSpawnableUnitType respects the tribe gate', () => {
  const cats = /* a Player with Tribe.Cats, high resources, no skills */;
  const type = bestSpawnableUnitType(cats, 'offense');
  // stalker has no skill gate; it is in the feline list and affordable
  expect(TRIBE_SPECIAL_UNIT[Tribe.Cats]).toBe('stalker');
  expect(type).not.toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spawn.test.ts tests/ai-patterns.test.ts`
Expected: FAIL — `TRIBE_SPECIAL_UNIT` does not exist; `spawnUnit` spawns a stalker for a warriors player.

- [ ] **Step 3: Implement**

In `src/game/tribes.ts`:

```ts
import { UnitType } from './units';
/** The single tribe-gate: each tribe's special unit, spawnable only by it. */
export const TRIBE_SPECIAL_UNIT: Record<Tribe, UnitType> = {
  [Tribe.Villagers]: 'builder',
  [Tribe.Warriors]: 'banner',
  [Tribe.Barbarians]: 'berserker',
  [Tribe.Cats]: 'stalker',
  [Tribe.Forest]: 'trapper',
  [Tribe.Aqua]: 'stormcaller',
  [Tribe.Sand]: 'stunner',
};
export function specialUnitFor(tribe: Tribe): UnitType {
  return TRIBE_SPECIAL_UNIT[tribe];
}
```

In `src/game/spawn.ts` (import `TRIBE_SPECIAL_UNIT`):

```ts
  if (TRIBE_SPECIAL_UNIT[player.tribe] === type) {
    // tribe-gated: OK, no skill requirement
  } else if (Object.values(TRIBE_SPECIAL_UNIT).includes(type)) {
    return false; // a special unit for another tribe
  }
```

In `src/game/ai-patterns.ts` `bestSpawnableUnitType`, before the affordability loop add:

```ts
    const special = TRIBE_SPECIAL_UNIT[player.tribe];
    if (special) {
      const cost = { wood: UNIT_TYPES[special].priceWood, stone: 0, money: UNIT_TYPES[special].price, ore: UNIT_TYPES[special].priceOre };
      if (canAfford(player.resources, cost)) return special;
    }
```

(placed so a tribe's special unit becomes its preferred cheap pick where affordable), and keep the existing skill-gated list for the rest.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/spawn.test.ts tests/ai-patterns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/tribes.ts src/game/spawn.ts src/game/ai-patterns.ts tests/spawn.test.ts tests/ai-patterns.test.ts
git commit -m "feat: tribe-gate special unit spawning"
```

---

### Task 3: Data plumbing — balance, score, descriptions, i18n

**Files:**
- Modify: `src/game/balance.ts`, `src/game/balance-report.ts`, `src/game/baseline-data.ts`, `src/game/score.ts`, `src/game/unit-descriptions.ts`, `src/i18n/locales/en.ts`, `src/i18n/locales/ru.ts`
- Test: existing `tests/balance-report.test.ts` (regenerates the markdown), `tests/balance.test.ts`, `tests/unit-descriptions.test.ts`

**Interfaces:**
- Consumes: the `UnitType` union from Task 1.
- Produces: `PLAYABLE_UNITS` including the 7 new types; `CAPTION`/`BASELINE.units` entries so the balance report keeps regenerating without crashing.

- [ ] **Step 1: Write the failing test**

Append to `tests/balance.test.ts`:

```ts
it('PLAYABLE_UNITS covers every playable type incl. special units', () => {
  expect(PLAYABLE_UNITS).toContain('stalker');
  expect(PLAYABLE_UNITS).toContain('builder');
  expect(PLAYABLE_UNITS).toContain('banner');
  expect(PLAYABLE_UNITS).toContain('berserker');
  expect(PLAYABLE_UNITS).toContain('trapper');
  expect(PLAYABLE_UNITS).toContain('stormcaller');
  expect(PLAYABLE_UNITS).toContain('stunner');
});
```

Append to `tests/unit-descriptions.test.ts` a check that `LAND_KEYS`/`DESC_KEYS` include a key for each new type and each key resolves to a non-empty string (`t(key)` truthy).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/balance.test.ts tests/unit-descriptions.test.ts`
Expected: FAIL — `PLAYABLE_UNITS` lacks new types; `LAND_KEYS` is missing the new keys.

- [ ] **Step 3: Implement**

`src/game/balance.ts`:
```ts
export const PLAYABLE_UNITS: UnitType[] = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight', 'stalker', 'builder', 'banner', 'berserker', 'trapper', 'stormcaller', 'stunner'];
```
`UNIT_SKILL` stays unchanged (special units have no skill gate → omitted).

`src/game/balance-report.ts` `CAPTION`:
```ts
  stalker: 'Stalker', builder: 'Builder', banner: 'Banner', berserker: 'Berserker',
  trapper: 'Trapper', stormcaller: 'Stormcaller', stunner: 'Stunner',
```

`src/game/baseline-data.ts` `units`: add entries equal to the new live stats so `changesTable` does not crash and reports no diff:
```ts
    stalker: { attack: 30, defense: 0, maxHp: 60, price: 9, priceWood: 2, priceOre: 0 },
    builder: { attack: 10, defense: 0, maxHp: 50, price: 7, priceWood: 0, priceOre: 0 },
    banner: { attack: 20, defense: 8, maxHp: 60, price: 10, priceWood: 0, priceOre: 0 },
    berserker: { attack: 50, defense: 12, maxHp: 70, price: 11, priceWood: 0, priceOre: 3 },
    trapper: { attack: 20, defense: 8, maxHp: 50, price: 9, priceWood: 2, priceOre: 0 },
    stormcaller: { attack: 20, defense: 8, maxHp: 50, price: 9, priceWood: 0, priceOre: 2 },
    stunner: { attack: 40, defense: 10, maxHp: 40, price: 7, priceWood: 0, priceOre: 0 },
```
(`costs`/`stats`/`flags` values are optional; leave them for the regenerated report.)

`src/game/score.ts` `UNIT_SCORE`:
```ts
  stalker: 9, builder: 7, banner: 8, berserker: 10, trapper: 8, stormcaller: 9, stunner: 7,
```

`src/game/unit-descriptions.ts`: add bullet/detail keys per new type to `LAND_KEYS` and `DESC_KEYS` (e.g. `stalker: ['help.stalker.base', 'help.stalker.stealth']`, `desc: 'help.stalker.desc'`). Provide the same for all 7.

`src/i18n/locales/en.ts` (and `ru.ts`): add `unitType.stalker` … `unitType.stunner`; `help.<type>.desc` + the `help.<type>.*` bullets; `spawn.reasonTribe`: `'Belongs to {tribe}'` / RU equivalent; `action.enableStealth`: `'Enable stealth'`; `action.buildTrap`: `'Build thorn trap'`; `action.storm`: `'Storm'`; `action.pirateDealActive`-style stun strings (`ui.stunAttack`: `'Stun'`, `ui.regularAttack`: `'Attack'`, `hud.selected.stunned`: `'stunned'`, `common.trap}` help text etc.). Follow the existing dotted-key style.

- [ ] **Step 4: Run test to verify it passes + regenerate report**

Run: `npx vitest run tests/balance.test.ts tests/unit-descriptions.test.ts tests/balance-report.test.ts`
Expected: PASS. The balance-report test will regenerate `combat-balance.md`.

- [ ] **Step 5: Commit**

```bash
git add src/game/balance.ts src/game/balance-report.ts src/game/baseline-data.ts src/game/score.ts src/game/unit-descriptions.ts src/i18n/locales/en.ts src/i18n/locales/ru.ts tests/balance.test.ts tests/unit-descriptions.test.ts combat-balance.md
git commit -m "feat: balance/score/description/i18n data for special units"
```

---

### Task 4: Shared ability primitives

**Files:**
- Create: `src/game/abilities.ts`
- Test: `tests/abilities.test.ts`

**Interfaces:**
- Consumes: `Unit`, `GameMap`, `Tribe`, `banner` type.
- Produces:
  - `BANNER_BONUS = 10`, `RAGE_BONUS = 20`, `RAGE_THRESHOLD_PCT = 0.5`
  - `export function isStunned(unit: Unit): boolean`
  - `export function berserkerRage(unit: Unit): number`
  - `export function bannerAttackBonus(map: GameMap, unit: Unit): number`
  - `export function effectiveAttack(unit: Unit, map?: GameMap | null): number`
  - `export function attackBonus(unit: Unit, map: GameMap | null): number`

- [ ] **Step 1: Write the failing test**

Create `tests/abilities.test.ts`:

```ts
import { GameMap } from '../src/game/map-gen';
import { makeUnit, Unit } from '../src/game/units';
import { Tribe } from '../src/game/tribes';
import { bannerAttackBonus, berserkerRage, effectiveAttack, isStunned } from '../src/game/abilities';

function unit(owner: number, type: Unit['type'], hp?: number): Unit {
  return makeUnit(owner, type, 0, 0, hp !== undefined ? { hp } : undefined);
}
function mapWith(width = 5, height = 5): GameMap {
  const tiles = [];
  for (let q = -width; q <= width; q++)
    for (let r = -height; r <= height; r++)
      tiles.push({ q, r, terrain: 0, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null });
  return { radius: Math.max(width, height), tiles, spawns: [] };
}
```

Fill the `tiles` typed as `MapTile[]` with the required fields (`roadOwner`, `bridge`, `exploredBy`, `bonus`, `bottle` may be omitted but keep TS happy by casting the object literal as the tile type). Then tests:

```ts
describe('banner aura', () => {
  it('gives +10 to allies within 2 hexes, not self', () => {
    const map = mapWith();
    const bannerAt = { q: 0, r: 0 };
    const ally = makeUnit(0, 'warrior', 2, 0);
    map.tiles.find((t) => t.q === 2 && t.r === 0)!.unit = ally;
    map.tiles.find((t) => t.q === 0 && t.r === 0)!.unit = makeUnit(0, 'banner', 0, 0);
    expect(bannerAttackBonus(map, ally)).toBe(10);
    const bannerUnit = map.tiles.find((t) => t.q === 0 && t.r === 0)!.unit!;
    expect(bannerAttackBonus(map, bannerUnit)).toBe(0);
  });
  it('does not apply to enemy units', () => {
    const map = mapWith();
    map.tiles.find((t) => t.q === 0 && t.r === 0)!.unit = makeUnit(0, 'banner', 0, 0);
    const enemy = makeUnit(1, 'warrior', 2, 0);
    map.tiles.find((t) => t.q === 2 && t.r === 0)!.unit = enemy;
    expect(bannerAttackBonus(map, enemy)).toBe(0);
  });
});
describe('berserker rage', () => {
  it('gives +20 at or below 50% hp, else 0', () => {
    const bg = makeUnit(0, 'berserker', 0, 0);
    expect(berserkerRage(bg)).toBe(0);
    bg.hp = Math.ceil(bg.hp! / 2);
    expect(berserkerRage(bg)).toBe(20);
  });
});
describe('effectiveAttack', () => {
  it('combines base + banner + rage', () => {
    const map = mapWith();
    map.tiles.find((t) => t.q === 1 && t.r === 0)!.unit = makeUnit(0, 'banner', 1, 0);
    const berserker = makeUnit(0, 'berserker', 0, 0);
    map.tiles.find((t) => t.q === 0 && t.r === 0)!.unit = berserker;
    berserker.hp = 20; // <= 35 => raging
    expect(effectiveAttack(berserker, map)).toBe(50 + 20 + 10);
  });
  it('no map => no aura', () => {
    expect(effectiveAttack(makeUnit(0, 'warrior', 0, 0), null)).toBe(20);
  });
});
describe('stun', () => {
  it('isStunned is true while stunTurns >= 1', () => {
    const u = makeUnit(0, 'warrior', 0, 0);
    expect(isStunned(u)).toBe(false);
    u.stunTurns = 1;
    expect(isStunned(u)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/abilities.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/game/abilities.ts`:

```ts
import { hexDistance } from './hex';
import { GameMap } from './map-gen';
import { isShip, shipAttack } from './ship';
import { UNIT_TYPES, Unit } from './units';

export const BANNER_BONUS = 10;
export const RAGE_BONUS = 20;
export const RAGE_THRESHOLD_PCT = 0.5;

export function isStunned(unit: Unit): boolean {
  return (unit.stunTurns ?? 0) >= 1;
}

/** +20 atk while the unit has <= 50% max hp (berserker rage), else 0. */
export function berserkerRage(unit: Unit): number {
  if (unit.type !== 'berserker') return 0;
  return unit.hp <= UNIT_TYPES.berserker.maxHp * RAGE_THRESHOLD_PCT ? RAGE_BONUS : 0;
}

/** +10 atk for a unit within distance 2 of any friendly banner (never the
 *  banner itself, never ships). Non-stacking: always a flat +10. */
export function bannerAttackBonus(map: GameMap | null, unit: Unit): number {
  if (!map || isShip(unit)) return 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.type !== 'banner' || t.unit.owner !== unit.owner) continue;
    if (t.unit === unit) continue;
    if (hexDistance(unit, t) <= 2) return BANNER_BONUS;
  }
  return 0;
}

/** Base attack before any bonus: SHIP_ATTACK at sea, else the unit's type value. */
export function baseAttack(unit: Unit): number {
  return isShip(unit) ? shipAttack(unit) : UNIT_TYPES[unit.type].attack;
}

/** Any current atk bonus (banner +10 / rage +20); ships get none. Used for the
 *  hp-bar icon and HUD. */
export function attackBonus(unit: Unit, map: GameMap | null): number {
  if (isShip(unit)) return 0;
  return bannerAttackBonus(map, unit) + berserkerRage(unit);
}

export function effectiveAttack(unit: Unit, map: GameMap | null = null): number {
  return baseAttack(unit) + attackBonus(unit, map);
}
```

`combat.ts` already imports `isShip` from `src/game/ship.ts`, so `abilities.ts` importing `shipAttack` from the same module is consistent. No circular import: `abilities.ts` imports from `ship.ts` and `units.ts`; neither imports `abilities.ts`. (`combat.ts` will import from `abilities.ts`; `abilities.ts` does not import `combat.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/abilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/abilities.ts tests/abilities.test.ts
git commit -m "feat: shared ability primitives (aura, rage, stun, effective attack)"
```

---

### Task 5: Combat engine integration

**Files:**
- Modify: `src/game/combat.ts`, `src/game/units.ts` (`canMove`, `canAttack`, `canHeal`), `src/game/unit-actions.ts` (`unitCanAct`)
- Test: `tests/combat.test.ts`, `tests/units.test.ts`

**Interfaces:**
- Consumes: `effectiveAttack`, `berserkerRage`, `isStunned` from Task 4.
- Produces: combat behavior — aura/rage add to attack power; stealthed attackers ignore the defender's defense; a raging berserker provokes no counter; stunned units can't move/attack/heal.

- [ ] **Step 1: Write the failing test**

Append to `tests/combat.test.ts`:

```ts
it('a stealthed attacker ignores the target defense', () => {
  const attacker = makeUnit(0, 'stalker', 0, 0);
  attacker.isStealthed = true;
  const targetTile = fixtureTile(2, 1, makeUnit(1, 'swordsman', 2, 1)); // defense 16
  const attackerTile = fixtureTile(0, 0, attacker);
  mapTiles.push(attackerTile, targetTile);
  const withoutStealth = resolveCombat(map, attacker, { ...targetTile, unit: makeUnit(1, 'swordsman', 2, 1) });
  // With stealth the defender's defenseForce is 0 => attackerDamage = round(attack*1.5)
  const withStealth = resolveCombat(map, attacker, targetTile);
  expect(withStealth.attackerDamage).toBe(Math.round(30 * 1.5));
  expect(withStealth.attackerDamage).toBeGreaterThan(withoutStealth.attackerDamage);
});
it('a raging berserker never counter-attacks', () => {
  const berserker = makeUnit(0, 'berserker', 0, 0, { hp: 20 }); // <= 50%
  berserker.hp = 20;
  expect(canCounterAttack(berserker)).toBe(false);
});
it('a banner aura raises the attacker damage', () => {
  // banner at distance 1, warrior attacks
  const fighter = makeUnit(0, 'warrior', 0, 0);
  // put banner at (1,0)
  mapTiles.push(fixtureTile(1, 0, makeUnit(0, 'banner', 1, 0)), fixtureTile(0, 0, fighter));
  const r = resolveCombat(map, fighter, fixtureTile(2, 1, makeUnit(1, 'warrior', 2, 1)));
  expect(r.attackerDamage).toBeGreaterThanOrEqual(Math.round(((30 * 50) / 50) / ((30 * 50) / 50 + defenseForceOf(10, 50)) * 30 * 1.5));
});
```

Use the existing per-file fixture/build helpers (`makeUnit`, a shared `map`/tile builder) rather than the sketched `fixtureTile`/`mapTiles`. Append to `tests/units.test.ts`:

```ts
it('a stunned unit cannot move, attack or heal', () => {
  const u = makeUnit(0, 'warrior', 0, 0);
  u.stunTurns = 1;
  expect(canMove(u)).toBe(false);
  expect(canAttack(u)).toBe(false);
  expect(canHeal(u)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/combat.test.ts tests/units.test.ts`
Expected: FAIL — stealth defense-0, rage no-counter, aura damage, stun suppression all absent.

- [ ] **Step 3: Implement**

In `src/game/combat.ts`:

```ts
import { bannerAttackBonus, berserkerRage, effectiveAttack } from './abilities';
```

`attackDamage`:
```ts
export function attackDamage(attacker: Unit): number {
  return Math.round((effectiveAttack(attacker) * attacker.hp) / UNIT_TYPES[attacker.type].maxHp);
}
```

`resolveCombat` — replace the two force computations:
```ts
  const attack = effectiveAttack(attacker, map);
  const attackForce = (attack * attacker.hp) / UNIT_TYPES[attacker.type].maxHp;
  const def = attacker.isStealthed === true ? 0 : (defender.defense ?? 0);
  const defenseForce = (def * defender.hp) / UNIT_TYPES[defender.type].maxHp * defenseBonusFor(map, defender, target);
  ...
  const attackerDamage = Math.round((attackForce / total) * attack * COMBAT_SCALE);
  const counterDamage = Math.round((defenseForce / total) * def * COMBAT_SCALE);
```

`canCounterAttack`:
```ts
export function canCounterAttack(unit: Unit): boolean {
  if (berserkerRage(unit) > 0) return false;
  return !(unit.type === 'catapult' && !isShip(unit));
}
```

`attackableTargets`: skip stealthed enemies:
```ts
    if (t.unit.isStealthed === true) return false;
```
in the unit filter (before other checks).

In `src/game/units.ts` `canMove`, `canAttack`, `canHeal` — add `isStunned(unit)` at the start:

```ts
export function canMove(unit: Unit): boolean {
  if (isStunned(unit)) return false;
  ...
}
export function canAttack(unit: Unit): boolean {
  if (isStunned(unit)) return false;
  ...
}
export function canHeal(unit: Unit): boolean {
  if (isStunned(unit)) return false;
  ...
}
```
Import `isStunned` (careful: `abilities.ts` imports from `units.ts` → do NOT import abilities into units to avoid a cycle). Instead define stun as a tiny local check:
```ts
function isStunnedLocal(unit: Unit): boolean { return (unit.stunTurns ?? 0) >= 1; }
```
(keep `isStunned` in abilities too, implemented identically). Use `isStunnedLocal` inside `units.ts`.

In `src/game/unit-actions.ts` `unitCanAct` — first line: `if ((unit.stunTurns ?? 0) >= 1) return false;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/combat.test.ts tests/units.test.ts tests/player-actions.test.ts`
Expected: PASS (player-actions assertions unaffected or still green; fix any helper test relying on `attackDamage` of a warrior = 20 on a no-map call — it stays 20 since bonuses are 0).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts src/game/units.ts src/game/unit-actions.ts tests/combat.test.ts tests/units.test.ts
git commit -m "feat: combat hooks for aura, rage, stealth-defense-0 and stun suppression"
```

---

### Task 6: Movement — stealthed units don't block pathing

**Files:**
- Modify: `src/game/selection.ts`
- Test: `tests/selection.test.ts` (or add to `tests/units.test.ts`/`tests/explore.test.ts` if the movement tests live elsewhere — check `tests/` for the reachable-targets tests first)

**Interfaces:**
- Consumes: stealthed units from Task 1 (field), `isStealthed`.
- Produces: `isEnterable`/pathfinders treat a stealthed *enemy* unit's tile as empty for the moving player; `isAdjacentToEnemy` ignores stealthed units.

- [ ] **Step 1: Write the failing test**

In the file holding `reachableTargets` tests:

```ts
it('an enemy stealthed stalker does not block reachability or adjacency', () => {
  // player 0 warrior at (0,0); stealthed enemy stalker at (2,0); open land in between
  const u = makeUnit(0, 'warrior', 0, 0);
  (tileAt(map, 2, 0)!.unit) = makeUnit(1, 'stalker', 2, 0, { isStealthed: true } as any);
  const reach = reachableTargets(map, u, 20, false, false, 0);
  expect(reach.some((t) => t.q === 2 && t.r === 0)).toBe(true);
});
```

Adjust `makeUnit` if needed to accept `isStealthed` via options (Task 1 didn't add it to `UnitOptions` — extend `UnitOptions` with `isStealthed?: boolean` in `units.ts` and apply it in `makeUnit`; add that in this task).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/selection.test.ts`
Expected: FAIL — the stalker's tile is not reachable; adjacent-stalker blocks pathing past it.

- [ ] **Step 3: Implement**

In `src/game/units.ts` add `isStealthed?: boolean` to `UnitOptions` and return `isStealthed: opts.isStealthed` in `makeUnit`.

In `src/game/selection.ts` add a helper and use it in `isEnterable`, `pathBetweenSteps`, and `pathBetweenCost`:

```ts
/** A tile with no visible unit for `playerIndex`: a real empty tile, or an
 *  enemy stealthed stalker (invisible to everyone but its owner). */
function isEffectivelyEmpty(tile: MapTile, playerIndex: number): boolean {
  if (!tile.unit) return true;
  if (tile.unit.owner !== playerIndex && tile.unit.isStealthed === true) return true;
  return false;
}
```

`isEnterable`: replace `if (tile.unit) return false;` with `if (!isEffectivelyEmpty(tile, playerIndex)) return false;`.

`isAdjacentToEnemy`: `return t !== undefined && t.unit != null && t.unit.isStealthed !== true && t.unit.owner !== playerIndex;`

`pathBetweenSteps`: replace `if (tile.unit) continue;` with `if (!isEffectivelyEmpty(tile, playerIndex)) continue;`.

`pathBetweenCost`: replace `if (!isEnterable(...)) continue;` — already uses isEnterable, so nothing more; but it also has its own `tile.unit` check? It relies on isEnterable. Confirm by removing any duplicate `tile.unit && ... continue` guards that skip occupied tiles (there are none in the cost variant). If `pathBetweenSteps` is used for animations, note that the path may legally pass through the stalker — that's intended (the sim truncates at application time in Task 7).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/selection.test.ts tests/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/selection.ts src/game/units.ts tests/selection.test.ts
git commit -m "feat: stealthed units do not block enemy pathing"
```

---

### Task 7: Stalker — stealth sim

**Files:**
- Modify: `src/game/events.ts`, `src/game/simulator.ts`, `src/game/ai-situation.ts`, `src/game/ai-patterns.ts`
- Test: `tests/simulator.test.ts` (or a new `tests/stealth.test.ts`)

**Interfaces:**
- Consumes: `isStealthed`, `firstMoveStealthDone` (Task 1), `isEffectivelyEmpty` pathing (Task 6), `resolveCombat` stealth defense-0 (Task 5).
- Produces:
  - `Command` member `{ type: 'enableStealth'; unitId: string }`
  - `GameEvent` members `{ type: 'stealthEnabled'; unitId: string }`, `{ type: 'stealthRevealed'; unitId: string; q: number; r: number }`
  - `private doEnableStealth(unitId: string): boolean`
  - `private revealStalker(unit: Unit): void` (sets `isStealthed=false`, emits `stealthRevealed`)
  - `export function isStalkerBumped(map, mover): { previous: MapTile; bumped: Unit } | null` — used by `doMove` (return type may instead be decided inline; keep the logic in the simulator).

- [ ] **Step 1: Write the failing test**

Create `tests/stealth.test.ts`:

```ts
import { Simulator } from '../src/game/simulator';
import { makeUnit } from '../src/game/units';
import { tileAt } from '../src/game/selection';
// Use the same fixtures as tests/simulator-turn.test.ts (findMap/twoPlayers helpers).

it('first move after spawn enables stealth before the move', () => {
  const sim = freshSim(); // human cats at turn, one stalker on (0,0) with hasMoved=false
  const ok = sim.applyCommand({ type: 'move', unitId: 's', q: 0, r: 1 });
  expect(ok).toBe(true);
  const stalker = findUnit(sim, 's');
  expect(stalker.isStealthed).toBe(true);
  expect(stalker.firstMoveStealthDone).toBe(true);
});
it('enable stealth consumes all actions', () => {
  const ok = sim.applyCommand({ type: 'enableStealth', unitId: 's' });
  expect(ok).toBe(true);
  const stalker = findUnit(sim, 's');
  expect(stalker.isStealthed).toBe(true);
  expect(stalker.hasMoved && stalker.hasAttacked && stalker.hasHealed).toBe(true);
});
it('enable stealth is refused when already stealthed or has no actions', () => {
  // after first-move stealth, a second enable should return false
  expect(sim.applyCommand({ type: 'enableStealth', unitId: 's' })).toBe(false);
});
it('an enemy move path is cut at the cell before a stealthed stalker', () => {
  // enemy warrior at (0,0), stealthed stalker at (1,0); enemy tries to move to (2,0)
  const enemy = enemyAt(sim, 0, 0);
  const ok = sim.applyCommand({ type: 'move', unitId: enemy.id, q: 2, r: 0 });
  expect(ok).toBe(true);
  expect(enemy.q === 0 && enemy.r === 0); // first step blocked => not moved
  const stalker = findUnit(sim, 's');
  expect(stalker.isStealthed).toBe(false); // revealed
});
it('attacking from stealth reveals and reduces the target defense to 0', () => {
  // stealthed stalker attacks a swordsman; after attack isStealthed=false
  const deploy = sim.applyCommand({ type: 'attack', unitId: 's', q: 2, r: 0 });
  expect(deploy).toBe(true);
  expect(findUnit(sim, 's').isStealthed).toBe(false);
});
```

The exact fixture layout depends on the file's existing helpers — adapt coordinates and tile types (land) to what the map fixture uses. If the repo has no `tests/simulator-turn.test.ts` fixtures to reuse, construct a minimal map via the existing `map-gen` builders used by other sim tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stealth.test.ts`
Expected: FAIL — no `enableStealth` command, no auto-stealth, no bump cut, no reveal.

- [ ] **Step 3: Implement**

In `src/game/events.ts` add two event variants:
```ts
  | { type: 'stealthEnabled'; unitId: string }
  | { type: 'stealthRevealed'; unitId: string; q: number; r: number }
```

In `src/game/simulator.ts`:
- Add to the `Command` union: `| { type: 'enableStealth'; unitId: string }`.
- Add `'enableStealth'` to `PREDICTABLE_COMMAND_TYPES`.
- In `applyCommand`: `case 'enableStealth': ok = this.doEnableStealth(cmd.unitId); break;`

```ts
private doEnableStealth(unitId: string): boolean {
  const unit = this.findUnit(unitId);
  if (!unit || unit.owner !== this.currentPlayerIndex) return false;
  if (unit.type !== 'stalker') return false;
  if (unit.shipLevel !== undefined) return false; // no stealth aboard ships
  if (unit.isStealthed) return false;
  if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
  unit.isStealthed = true;
  unit.firstMoveStealthDone = true;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  unit.hasHealed = true;
  this.emit({ type: 'stealthEnabled', unitId });
  return true;
}
```

In `doMove`, before `moveUnit`, after computing `path`:

```ts
const steps = [...path];
let stoppedAt: { q: number; r: number } | null = null;
let trapTile: MapTile | null = null;
let bumped: Unit | null = null;
for (let i = 0; i < steps.length; i++) {
  const st = tileAt(this.map, steps[i]!.q, steps[i]!.r)!;
  const occ = st.unit;
  if (occ && occ.owner !== unit.owner && occ.isStealthed === true && occ.shipLevel === undefined && unit.shipLevel === undefined) {
    bumped = occ;
    if (i === 0) {
      // First step onto the stalker: the move does not happen at all; the
      // mover keeps its move action. Reveal the stalker.
      this.revealStalker(bumped);
      return true;
    }
    stoppedAt = steps[i - 1]!;
    break;
  }
  if (st.trap && st.trap.owner !== unit.owner) {
    trapTile = st;
    stoppedAt = st;
    break;
  }
}
```

(Implementation of `st.trap` handling is finished in Task 9; for now guard `st.trap` reads behind `if (st.trap)`. If `stoppedAt` is set, `target = tileAt(...stoppedAt)`, `path` is truncated to the steps before the blocked cell, and for a trap `hasMoved` stays true as a normal move.)

Then after the existing `if (canUsePort(...))` block, before emitting:

```ts
if (bumped) this.revealStalker(bumped);
```

Guard the port-dock block so a move that was truncated by a bump doesn't dock: only run `gainShipAbility` when `!stoppedAt`. Adjust the `emit({type:'unitMoved', ... to: {q,r}})` to use the truncated final position and path.

The stalker-first-move auto-stealth goes at the top of `doMove` after the reachable check:

```ts
if (unit.type === 'stalker' && !unit.isStealthed && !unit.firstMoveStealthDone && unit.shipLevel === undefined) {
  unit.isStealthed = true;
  unit.firstMoveStealthDone = true;
}
```

Add the helper:

```ts
private revealStalker(unit: Unit): void {
  if (!unit.isStealthed) return;
  unit.isStealthed = false;
  this.emit({ type: 'stealthRevealed', unitId: unit.id, q: unit.q, r: unit.r });
}
```

In `doAttack`, after `performAttack` returns, add:

```ts
if (attacker.isStealthed) this.revealStalker(attacker);
```

(resolveCombat already read `attacker.isStealthed === true` for the defense-0 effect.)

In `src/game/ai-situation.ts` and `src/game/ai-patterns.ts`, every place that scans enemy units for visibility/threat filters adds `t.unit.isStealthed !== true` to skip invisible stalkers (enemy list, `enemyPower`, `enemyCanReach`/`landEnemyCanReach`/`enemyCanAttackNext`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stealth.test.ts tests/simulator-turn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/events.ts src/game/simulator.ts src/game/ai-situation.ts src/game/ai-patterns.ts tests/stealth.test.ts
git commit -m "feat: stalker stealth sim (auto-stealth, enable button, bump reveal, attack reveal)"
```

---

### Task 8: Builder — building via a unit

**Files:**
- Modify: `src/game/events.ts`, `src/game/simulator.ts`, `src/game/buildings.ts`
- Test: `tests/builder.test.ts`

**Interfaces:**
- Consumes: `BUILDING_COSTS`, `canBuildSawmill/Mine/Port`, `buildBuilding` (which gates on skills), `canBuildBridgeHere`, `buildBridge`, `BuildingKind`.
- Produces:
  - `export type BuilderBuildKind = BuildingKind | 'bridge'` (`'bridge'` is not a `BuildingKind` — the builder exposes Four: sawmill, mine, port, bridge)
  - `export const BUILDER_KINDS: BuilderBuildKind[] = ['sawmill', 'mine', 'port', 'bridge']`
  - `export function builderBuildable(map, tile, kind: BuilderBuildKind, player): MapTile[]` — tiles the builder (selected unit on `tile`) may build `kind` on: the unit's tile + adjacent tiles, player-owned, passing the kind's terrain/placement rules **with skills ignored**.
  - `Command` member `{ type: 'build'; q: number; r: number; kind: BuildingKind | 'bridge'; unitId?: string }`
  - `private doBuildWithUnit(unitId, tile, kind, player): boolean` and a `Command` branch.

- [ ] **Step 1: Write the failing test**

Create `tests/builder.test.ts`:

```ts
import { Simulator } from '../src/game/simulator';
// same fixtures as tests/stealth.test.ts
it('builder can build a sawmill on an adjacent forest-adjacent tile without the Forestry skill', () => {
  // Villagers player, no skills; builder on (0,0); a player-owned grassland tile at (1,0)
  // adjacent to a forest tile; 100 resources each.
  const ok = sim.applyCommand({ type: 'build', unitId: 'b', q: 1, r: 0, kind: 'sawmill' });
  expect(ok).toBe(true);
  expect(tileAt(sim.map, 1, 0)!.building?.kind).toBe('sawmill');
  expect(findUnit(sim, 'b').hasMoved).toBe(true);
});
it('builder cannot build farther than one hex', () => {
  const ok = sim.applyCommand({ type: 'build', unitId: 'b', q: 4, r: 0, kind: 'sawmill' });
  expect(ok).toBe(false);
});
it('builder cannot build on a ship', () => {
  // convert builder to shipLevel 1
  const b = findUnit(sim, 'b');
  b.shipLevel = 1;
  const ok = sim.applyCommand({ type: 'build', unitId: 'b', q: 1, r: 0, kind: 'sawmill' });
  expect(ok).toBe(false);
});
it('non-builder build still requires its skill', () => {
  // player without forestry tries kind sawmill via regular (village/tile) path -> fails
});
```

Adapt to the fixtures available in `tests/simulator-turn.test.ts` or a new minimal sim.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/builder.test.ts`
Expected: FAIL — no `unitId` path in `doBuild`, builder helper doesn't exist.

- [ ] **Step 3: Implement**

In `src/game/events.ts`: `BuildingKind` already includes `temple`/`forestTemple`; the builder only builds `sawmill | mine | port | bridge`. No event change needed (reuse `built` / `bridgeBuilt`).

In `src/game/buildings.ts` add a skill-bypassing guard function used by the builder path:

```ts
export function canBuildKindIgnoringSkill(kind: 'sawmill' | 'mine' | 'port', map: GameMap, tile: MapTile, player: Player): boolean {
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  if (kind === 'mine' && !isMountainType(tile.terrain)) return false;
  if (kind === 'port') {
    if (tile.bridge !== null && tile.bridge !== undefined) return false;
    if (!isWaterType(tile.terrain)) return false;
    return hexNeighbors(tile).some((n) => {
      const t = neighborTile(map, n);
      return t !== undefined && t.ownedBy === player.index && !isWaterType(t.terrain);
    });
  }
  if (kind === 'sawmill') {
    if (!isLandType(tile.terrain)) return false;
    return hexNeighbors(tile).some((n) => {
      const t = neighborTile(map, n);
      return t !== undefined && isForestType(t.terrain);
    });
  }
  return false;
}
```

Add `export const BUILDER_KINDS: BuildingKind[] = ['sawmill', 'mine', 'port', 'bridge'];` and:

```ts
export function builderBuildable(map: GameMap, tile: MapTile, kind: BuilderBuildKind, player: Player): MapTile[] {
  const out: MapTile[] = [];
  const consider = (t: MapTile | undefined): void => {
    if (!t) return;
    const ok = kind === 'bridge'
      ? t.ownedBy === player.index && canBuildBridgeHere(map, t)
      : canBuildKindIgnoringSkill(kind as 'sawmill' | 'mine' | 'port', map, t, player);
    if (ok) out.push(t);
  };
  consider(tile);
  for (const n of hexNeighbors(tile)) consider(neighborTile(map, n));
  return out;
}
```

`canBuildBridgeHere` from `src/game/bridges.ts` is the skill-free water-stretch precondition (true for a water tile between two land shores). That's exactly what the builder needs, plus the owner check.

In `src/game/simulator.ts`:
- Extend `Command`: `| { type: 'build'; q: number; r: number; kind: BuildingKind; unitId?: string }`.
- Keep `'build'` in `PREDICTABLE_COMMAND_TYPES` (it already is).
- In `applyCommand`: `case 'build': ok = cmd.unitId ? this.doBuildWithUnit(cmd.unitId, cmd.q, cmd.r, cmd.kind) : this.doBuild(cmd.q, cmd.r, cmd.kind); break;`

```ts
private doBuildWithUnit(unitId: string, q: number, r: number, kind: BuilderBuildKind): boolean {
  const unit = this.findUnit(unitId);
  if (!unit || unit.owner !== this.currentPlayerIndex) return false;
  if (unit.type !== 'builder') return false;
  if (unit.shipLevel !== undefined) return false;
  if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
  const player = this.players[unit.owner]!;
  const tile = tileAt(this.map, unit.q, unit.r)!;
  if (!builderBuildable(this.map, tile, kind, player).some((t) => t.q === q && t.r === r)) return false;
  if (kind === 'bridge') {
    if (!buildBridge(this.map, tileAt(this.map, q, r)!, player)) return false;
    this.consumeUnitTurn(unit);
    this.emit({ type: 'bridgeBuilt', q, r, playerIndex: player.index });
    return true;
  }
  if (!buildBuilding(this.map, tileAt(this.map, q, r)!, kind, player)) return false;
  this.consumeUnitTurn(unit);
  this.emit({ type: 'built', kind, q, r, playerIndex: player.index });
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/builder.test.ts tests/simulator-turn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/buildings.ts src/game/simulator.ts tests/builder.test.ts
git commit -m "feat: builder unit builds without skill requirement"
```

---

### Task 9: Trapper — thorn traps

**Files:**
- Modify: `src/game/map-gen.ts`, `src/game/events.ts`, `src/game/simulator.ts`, `src/game/combat.ts` (only if needed — reuse `resolveCombat`-style damage inline instead)
- Create: `src/game/traps.ts`
- Test: `tests/traps.test.ts`

**Interfaces:**
- Consumes: `MapTile` (Task 1 flags), `Resources`, `TileType`.
- Produces:
  - `export interface TrapState { owner: number; placedTurn: number }`
  - `TRAP_COST: Resources = { wood: 0, stone: 0, money: 5, ore: 3 }`
  - `TRAP_TURNS = 5`, `TRAP_ATTACK = 60`
  - `trapCells(map, trapperTile, player): MapTile[]`
  - `canPlaceTrapOn(map, tile, trapperTile, player): boolean`
  - `trapDamage(): number` (≈90)
  - `Command` member `{ type: 'trap'; unitId: string; q: number; r: number }`
  - `GameEvent` members `{ type: 'trapPlaced'; q: number; r: number; playerIndex: number }`, `{ type: 'trapTriggered'; q: number; r: number; targetId: string; damage: number; attackerIndex: number }`

- [ ] **Step 1: Write the failing test**

Create `tests/traps.test.ts`:

```ts
it('trapper places a trap on an adjacent owned land tile', () => {
  const ok = sim.applyCommand({ type: 'trap', unitId: 't', q: 1, r: 0 });
  expect(ok).toBe(true);
  expect(tileAt(sim.map, 1, 0)!.trap).toMatchObject({ owner: 0, placedTurn: sim.turn });
  expect(findUnit(sim, 't').hasMoved).toBe(true);
});
it('trap is refused on water, on a settlement, or beyond one hex', () => { /* ... */ });
it('an enemy unit moving onto a trap stops there, takes ~90 damage, trap is consumed', () => {
  // enemy warrior at (0,0); trap at (1,0); enemy moves to (2,0)
  const enemy = enemyAt(sim, 0, 0);
  const ok = sim.applyCommand({ type: 'move', unitId: enemy.id, q: 2, r: 0 });
  expect(ok).toBe(true);
  const at = tileAt(sim.map, 1, 0);
  expect(at!.unit?.id).toBe(enemy.id);       // stopped on the trap
  expect(at!.unit!.hp).toBeLessThan(50);     // damaged
  expect(at!.trap).toBeUndefined();          // consumed
});
it('trap expires after 5 turns', () => {
  // sim.turn = 3; place a trap -> placedTurn 3; force turn to 8 via the turn
  // counter (sim.turn += 5) and call the sweep function under test directly,
  // or drive sim.applyCommand({type:'endTurn'}) 5 times when setup allows:
  const trapAt = tileAt(sim.map, 1, 0)!;
  expect(trapAt.trap).toBeTruthy();
  for (let i = 0; i < 5; i++) sim.turn += 1;
  sim['sweepTraps'](); // private, exercised via the turn flow in practice
  expect(tileAt(sim.map, 1, 0)!.trap).toBeNull();
});
it('a trap costs 5 money + 3 ore', () => {
  // check resources dropped by exactly that amount after placement
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/traps.test.ts`
Expected: FAIL — no `trap` command, no `trap` tile state.

- [ ] **Step 3: Implement**

`src/game/map-gen.ts` — add to `MapTile`:
```ts
  trap?: { owner: number; placedTurn: number } | null;
```

`src/game/traps.ts`:
```ts
import { hexNeighbors } from './hex';
import { GameMap, MapTile } from './map-gen';
import { Player } from './players';
import { isWaterType } from './tile-types';
import { Resources } from './resources';

export interface TrapState { owner: number; placedTurn: number }
export const TRAP_COST: Resources = { wood: 0, stone: 0, money: 5, ore: 3 };
export const TRAP_TURNS = 5;
export const TRAP_ATTACK = 60;

export function canPlaceTrapOn(map: GameMap, tile: MapTile, trapperTile: MapTile, player: Player): boolean {
  if (isWaterType(tile.terrain)) return false;
  if (tile.q === trapperTile.q && tile.r === trapperTile.r) { /* same tile ok */ }
  else if (!hexNeighbors(trapperTile).some((n) => n.q === tile.q && n.r === tile.r)) return false;
  if (tile.unit) return false;
  if (tile.settlement || tile.building) return false;
  if ((tile.bridge !== undefined && tile.bridge !== null)) return false;
  if (tile.trap) return false;
  if (tile.ownedBy !== player.index) return false;
  return true;
}

export function trapCells(map: GameMap, trapperTile: MapTile, player: Player): MapTile[] {
  const out: MapTile[] = [];
  const tryTile = (t: MapTile | undefined): void => {
    if (t && canPlaceTrapOn(map, t, trapperTile, player)) out.push(t);
  };
  tryTile(trapperTile);
  for (const n of hexNeighbors(trapperTile)) {
    const t = map.tiles.find((x) => x.q === n.q && x.r === n.r);
    tryTile(t);
  }
  return out;
}

/** Damage a trap deals: a hit from an attacker with 60 attack at full hp
 *  against defense 0 → round(1 * 60 * 1.5) = 90. */
export function trapDamage(): number {
  return Math.round(TRAP_ATTACK * 1.5);
}
```

`src/game/events.ts`:
```ts
  | { type: 'trapPlaced'; q: number; r: number; playerIndex: number }
  | { type: 'trapTriggered'; q: number; r: number; targetId: string; damage: number; attackerIndex: number }
```

`src/game/simulator.ts`:
- Add to `Command`: `| { type: 'trap'; unitId: string; q: number; r: number }`, and to `PREDICTABLE_COMMAND_TYPES` `'trap'`.
- In `applyCommand`: `case 'trap': ok = this.doBuildTrap(cmd.unitId, cmd.q, cmd.r); break;`

```ts
private doBuildTrap(unitId: string, q: number, r: number): boolean {
  const unit = this.findUnit(unitId);
  if (!unit || unit.owner !== this.currentPlayerIndex) return false;
  if (unit.type !== 'trapper') return false;
  if (unit.shipLevel !== undefined) return false;
  if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
  const player = this.players[unit.owner]!;
  const tile = tileAt(this.map, unit.q, unit.r)!;
  const target = tileAt(this.map, q, r);
  if (!target) return false;
  if (!canPlaceTrapOn(this.map, target, tile, player)) return false;
  if (!canAfford(player.resources, TRAP_COST)) return false;
  player.resources = pay(player.resources, TRAP_COST);
  target.trap = { owner: unit.owner, placedTurn: this.turn };
  this.consumeUnitTurn(unit);
  this.emit({ type: 'trapPlaced', q, r, playerIndex: player.index });
  return true;
}
```

`doMove` trap block (from Task 7 scaffolding): when `trapTile` is set, after moving the unit onto it, apply:

```ts
if (trapTile) {
  const damage = trapDamage();
  unit.hp = Math.max(0, unit.hp - damage);
  trapTile.trap = null;
  this.emit({ type: 'trapTriggered', q: trapTile.q, r: trapTile.r, targetId: unit.id, damage, attackerIndex: this.currentPlayerIndex });
  if (unit.hp <= 0) {
    const tt = tileAt(this.map, unit.q, unit.r)!;
    if (tt.unit === unit) tt.unit = null;
  }
}
```

(A trap hit never misses and never provokes a counter.)

Trap expiry — in `resetUnitFlags()` or a dedicated sweep called from `doEndTurn` on the wrap:

```ts
private sweepTraps(): void {
  for (const t of this.map.tiles) {
    if (t.trap && this.turn - t.trap.placedTurn >= TRAP_TURNS) t.trap = null;
  }
}
```
Call it in `doEndTurn` right after `resetUnitFlags()` (and, for mid-round correctness, at the start of each human turn).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/traps.test.ts tests/simulator-turn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/map-gen.ts src/game/traps.ts src/game/events.ts src/game/simulator.ts tests/traps.test.ts
git commit -m "feat: trapper thorn traps (placement, trigger, expiry)"
```

---

### Task 10: Stormcaller — storm

**Files:**
- Modify: `src/game/events.ts`, `src/game/simulator.ts`, `src/game/tile-types.ts` (re-export helper if needed)
- Create: `src/game/storm.ts`
- Test: `tests/storm.test.ts`

**Interfaces:**
- Consumes: `MapTile.claimedByVillage`, `isWaterType`, `unit.shipLevel`.
- Produces:
  - `STORM_ATTACK = 60`
  - `stormEligible(map, unit, playerIndex): boolean`
  - `stormTargetShips(map, unit): MapTile[]` — enemy/pirate ships on the village's water tiles
  - `stormDamage(): number` (≈90)
  - `Command` member `{ type: 'storm'; unitId: string }`
  - `GameEvent` member `{ type: 'storm'; unitId: string; q: number; r: number; targets: { q: number; r: number; damage: number }[] }`

- [ ] **Step 1: Write the failing test**

Create `tests/storm.test.ts`:

```ts
it('stormcaller on an owned cell of a water-having village can storm', () => {
  // stormcaller at (0,0) owned by Aqua player; the claiming village claims some water tiles
  const ok = sim.applyCommand({ type: 'storm', unitId: 'sc' });
  expect(ok).toBe(true);
});
it('storm damages enemy and pirate ships on the village water tiles only, not own ships', () => {
  // enemy ship at (2,0) water (claimed by the village), own ship at (3,0), a different village's water at (4,0)
  const ok = sim.applyCommand({ type: 'storm', unitId: 'sc' });
  expect(ok).toBe(true);
  expect(tileAt(sim.map, 2, 0)!.unit!.hp).toBe(shipMaxHp - stormDamage());
  expect(tileAt(sim.map, 3, 0)!.unit!.hp).toBe(shipMaxHp);   // untouched
  expect(tileAt(sim.map, 4, 0)!.unit!.hp).toBe(shipMaxHp);   // other village
});
it('storm consumes the whole turn', () => {
  const sc = findUnit(sim, 'sc');
  expect(sc.hasMoved && sc.hasAttacked && sc.hasHealed).toBe(true);
});
it('storm is refused when not on an owned village cell', () => { /* ... */ });
```

Adapt the fixtures (ship helper `maxHp`/`shipMaxHp` from `ship.ts` exports: `SHIP_ATTACK`/`SHIP_MAX_HP` values; find the actual exported constant — `ship.ts` exports `SHIP_MOVE_POINTS`, `SHIP_ATTACK`, `SHIP_ATTACK_DISTANCE` — use the unit type's max hp or `UNIT_TYPES[type].maxHp`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/storm.test.ts`
Expected: FAIL — no `storm` command, no `storm.ts`.

- [ ] **Step 3: Implement**

`src/game/storm.ts`:
```ts
import { GameMap, MapTile } from './map-gen';
import { isWaterType } from './tile-types';
import { Unit } from './units';

export const STORM_ATTACK = 60;

/** The village that claims `tile` (matching tile.claimedByVillage), or null. */
export function claimingVillage(map: GameMap, tile: MapTile): MapTile | null {
  const c = tile.claimedByVillage;
  if (!c) return null;
  return map.tiles.find((t) => t.q === c.q && t.r === c.r && t.settlement) ?? null;
}

/** Water tiles claimed by `village`. */
export function villageWaterTiles(map: GameMap, village: MapTile): MapTile[] {
  const vk = `${village.q},${village.r}`;
  return map.tiles.filter((t) => {
    if (!t.claimedByVillage) return false;
    if (`${t.claimedByVillage.q},${t.claimedByVillage.r}` !== vk) return false;
    return isWaterType(t.terrain);
  });
}

export function stormEligible(map: GameMap, unit: Unit): boolean {
  if (unit.type !== 'stormcaller') return false;
  const tile = map.tiles.find((t) => t.unit === unit);
  if (!tile || tile.ownedBy !== unit.owner) return false;
  const village = claimingVillage(map, tile);
  if (!village || village.settlement?.owner !== unit.owner) return false;
  return villageWaterTiles(map, village).length >= 1;
}

/** Ships (enemy or pirate) standing on this stormcaller's village water tiles. */
export function stormTargetShips(map: GameMap, unit: Unit): MapTile[] {
  const tile = map.tiles.find((t) => t.unit === unit);
  if (!tile) return [];
  const village = claimingVillage(map, tile);
  if (!village) return [];
  return villageWaterTiles(map, village).filter(
    (t) => t.unit !== null &&
      t.unit.shipLevel !== undefined &&
      t.unit.owner !== unit.owner,
  );
}

export function stormDamage(): number {
  return Math.round(STORM_ATTACK * 1.5);
}
```

`src/game/events.ts`:
```ts
  | { type: 'storm'; unitId: string; q: number; r: number; targets: { q: number; r: number; damage: number }[] }
```

`src/game/simulator.ts`:
- `Command`: add `| { type: 'storm'; unitId: string }`; add to `PREDICTABLE_COMMAND_TYPES`.
- `applyCommand`: `case 'storm': ok = this.doStorm(cmd.unitId); break;`

```ts
private doStorm(unitId: string): boolean {
  const unit = this.findUnit(unitId);
  if (!unit || unit.owner !== this.currentPlayerIndex) return false;
  if (unit.type !== 'stormcaller') return false;
  if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
  if (!stormEligible(this.map, unit)) return false;
  const damage = stormDamage();
  const targets = stormTargetShips(this.map, unit);
  const report: { q: number; r: number; damage: number }[] = [];
  for (const t of targets) {
    const ship = t.unit!;
    ship.hp = Math.max(0, ship.hp - damage);
    report.push({ q: t.q, r: t.r, damage });
    if (ship.hp <= 0) {
      const killer = this.players[unit.owner]!;
      killer.kills += 1;
      awardScore(killer, ship.owner < 0 ? PIRATE_KILL_SCORE : KILL_SCORE);
      const victim = ship.owner >= 0 ? this.players[ship.owner] : null;
      if (victim) this.statsOf(victim).killedUnits += 1;
      t.unit = null;
    }
  }
  this.consumeUnitTurn(unit);
  this.emit({ type: 'storm', unitId, q: unit.q, r: unit.r, targets: report });
  return true;
}
```

(The `report` sends `damage` per target so the presenter can animate kills.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/storm.test.ts tests/simulator-turn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/storm.ts src/game/events.ts src/game/simulator.ts tests/storm.test.ts
git commit -m "feat: stormcaller storm damages enemy/pirate ships on village waters"
```

---

### Task 11: Stunner — stun

**Files:**
- Modify: `src/game/events.ts`, `src/game/simulator.ts`
- Test: `tests/stun.test.ts`

**Interfaces:**
- Consumes: `isStunned` (Task 4), `missChanceFor`, `hexDistance`.
- Produces:
  - `Command` member `{ type: 'stun'; unitId: string; q: number; r: number }` (deliberately **not** in `PREDICTABLE_COMMAND_TYPES` — miss roll)
  - `GameEvent` member `{ type: 'stunShot'; attackerId: string; targetId: string; attackerTile: Axial; targetTile: Axial; missed: boolean; stunned: boolean }`
  - `private doStun(unitId, q, r): boolean`, `private applyStun(target: Unit, alreadyActed: boolean): void`

- [ ] **Step 1: Write the failing test**

Create `tests/stun.test.ts`:

```ts
it('a successful stun blocks a unit that has not acted this turn', () => {
  // stunner at (0,0), target warrior at (2,0) (range 2), target has not acted
  const ok = sim.applyCommand({ type: 'stun', unitId: 'st', q: 2, r: 0 });
  expect(ok).toBe(true);
  const target = findUnit(sim, 'w');
  expect(target.stunTurns).toBeGreaterThanOrEqual(1);
  expect(target.hp).toBe(50); // no damage
});
it('a stunned target cannot move/attack on its turn; stunTurns decrements at its turn start', () => {
  // run the target player's turn: canMove should be false while stunned
  // and the counter decrements toward 0 at the target owner's turn start
});
it('stun deals no counterattack damage and misses use the miss roll (rng=0 fails, rng=1 hits)', () => {
  const simMiss = new Simulator(map, players, mode, { rng: () => 0 }); // always miss
  const ok = simMiss.applyCommand({ type: 'stun', unitId: 'st', q: 2, r: 0 });
  expect(ok).toBe(true);
  expect(findUnit(simMiss, 'w').stunTurns).toBeUndefined();
});
it('a stunner cannot stun twice in a turn', () => {
  const ok = sim.applyCommand({ type: 'stun', unitId: 'st', q: 2, r: 0 });
  const again = sim.applyCommand({ type: 'stun', unitId: 'st', q: 2, r: 0 });
  expect(ok).toBe(true);
  expect(again).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stun.test.ts`
Expected: FAIL — no `stun` command.

- [ ] **Step 3: Implement**

`src/game/events.ts`:
```ts
  | { type: 'stunShot'; attackerId: string; targetId: string; attackerTile: Axial; targetTile: Axial; missed: boolean; stunned: boolean }
```

`src/game/simulator.ts`:
- `Command`: add `| { type: 'stun'; unitId: string; q: number; r: number }`. Do **not** add to `PREDICTABLE_COMMAND_TYPES`.
- `applyCommand`: `case 'stun': ok = this.doStun(cmd.unitId, cmd.q, cmd.r); break;`

```ts
private applyStun(target: Unit, alreadyActed: boolean): void {
  // Not acted yet this turn => skip this round's turn (=2, decremented to 1 at
  // that turn's start -> stunned through it). Already acted => skip next round.
  target.stunTurns = 2;
}

private doStun(unitId: string, q: number, r: number): boolean {
  const attacker = this.findUnit(unitId);
  if (!attacker || attacker.owner !== this.currentPlayerIndex) return false;
  if (attacker.type !== 'stunner') return false;
  if (!canAttack(attacker)) return false;
  const target = tileAt(this.map, q, r);
  if (!target) return false;
  if (!target.unit || target.unit.owner === attacker.owner) return false;
  const dist = hexDistance(attacker, target);
  if (dist > 2 || dist < 1) return false;
  const player = this.players[attacker.owner]!;
  const attackerTile = { q: attacker.q, r: attacker.r };
  const targetTile = { q: target.q, r: target.r };
  const targetUnit = target.unit;
  if (this.rng() < missChanceFor(player)) {
    attacker.hasAttacked = true;
    this.emit({ type: 'stunShot', attackerId: unitId, targetId: targetUnit.id, attackerTile, targetTile, missed: true, stunned: false });
    return true;
  }
  const alreadyActed = targetUnit.hasMoved || targetUnit.hasAttacked || targetUnit.hasHealed;
  const stunned = targetUnit.stunTurns === undefined || targetUnit.stunTurns < 1;
  this.applyStun(targetUnit, alreadyActed);
  attacker.hasAttacked = true;
  this.emit({ type: 'stunShot', attackerId: unitId, targetId: targetUnit.id, attackerTile, targetTile, missed: false, stunned });
  return true;
}
```

Stun decrement — in `doEndTurn`, before emitting `turnStarted` for a human (and at the top of `runAiTurn`), call:

```ts
private decrementStunsFor(playerIndex: number): void {
  for (const t of this.map.tiles) {
    const u = t.unit;
    if (u && u.owner === playerIndex && (u.stunTurns ?? 0) > 0) {
      u.stunTurns = (u.stunTurns ?? 0) - 1;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stun.test.ts tests/simulator-turn.test.ts` (the turn test may need the stunner/target set up so turning doesn't fail).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/events.ts src/game/simulator.ts tests/stun.test.ts
git commit -m "feat: stunner stun attack"
```

---

### Task 12: Spawn dialog + toolbar + controller wiring

**Files:**
- Modify: `src/ui/overlays/spawn-dialog.ts`, `src/ui/hud/toolbar-specs.ts`, `src/ui/hud/hud-toolbar.ts`, `src/controller/game-controller.ts`, `src/store/game-store.ts`, `src/ui/kit/action-button-icons.ts` (only to reference existing frames if not already present)
- Test: `tests/spawn-dialog.test.ts`, `tests/toolbar-specs.test.ts`

**Interfaces:**
- Consumes: `TRIBE_SPECIAL_UNIT`, `ACTION_BUTTON_ICON_FILES`, the new commands from Tasks 7–11.
- Produces:
  - spawn dialog shows base units + the player's tribe special (icon `action-spawn-warrior`), `reasons()` reporting a tribe-only gate
  - toolbar buttons: `stealth` (stalker), `build` (builder → opens a building-kind popup), `thorn-trap` (trapper), `storm` (stormcaller)
  - `gameController` methods: `enableStealthSelected()`, `buildAsBuilder(kind, q, r)`, `placeTrap()` (enters trap-placement mode) / `placeTrapOn(q, r)` (sends the trap command), `stormSelected()`, `stunTarget(q, r)`, `attackTarget(q, r)`
  - stunner attack prompt: range-2 target stuns automatically; range-1 target opens overlay `{ kind: 'stunChoice'; target }`
  - builder placement + trap placement use the map-click flow with a highlight set (reuse `reachableKeys`-style sets; simplest: reuse the existing `stores.setOverlay({kind:'place', cells})` pattern with the `moveAttack`/`shipLanding` precedent)

- [ ] **Step 1: Write the failing test**

Append to `tests/spawn-dialog.test.ts` (adjust the existing count assertion — the grid now holds 8 entries: 7 base + 1 tribe special):

```ts
it('lists the player tribe special unit', () => {
  // player is Cats; the dialog should include 'stalker'
  const types = /* spawn-dialog instance' types() via a public helper or by simulating the grid */ ;
  expect(types).toContain('stalker');
});
it('does not list other tribes special units', () => {
  expect(types).not.toContain('banner'); // warriors'
  expect(types).not.toContain('berserker');
});
```

`types()` is private; expose a small `export function spawnableTypesFor(player: Player): Exclude<UnitType,'pirate'>[]` in `spawn-dialog.ts` and unit-test that instead. Replace the existing "exactly 3 rows" assertions with 8-item logic.

Append to `tests/toolbar-specs.test.ts`:

```ts
it('shows stealth for a visible stalker with actions', () => {
  const specs = toolbarSpecs(); // select a stalker first
  expect(specs.some((s) => s.key === 'stealth')).toBe(true);
});
it('shows storm only when the stormcaller village has water', () => { /* ... */ });
it('shows build only for a builder', () => { /* ... */ });
it('shows thorn-trap only for a trapper', () => { /* ... */ });
```

Follow the existing toolbar-specs test fixtures (they select tiles via `store.setSelection` and snapshot `toolbarSpecs()`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spawn-dialog.test.ts tests/toolbar-specs.test.ts`
Expected: FAIL — dialog does not filter by tribe; no stealth/build/trap/storm specs.

- [ ] **Step 3: Implement**

`src/ui/overlays/spawn-dialog.ts`:
- Add `export function spawnableTypesFor(player: Player): Exclude<UnitType, 'pirate'>[]` — all 7 base types are always shown, the player's tribe special unit is appended:
```ts
const BASE_PLAYABLE: Exclude<UnitType, 'pirate'>[] = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight'];
export function spawnableTypesFor(player: Player): Exclude<UnitType, 'pirate'>[] {
  const special = TRIBE_SPECIAL_UNIT[player.tribe];
  return [...BASE_PLAYABLE, ...(BASE_PLAYABLE.includes(special) ? [] : [special])];
}
```
- `types()` calls `spawnableTypesFor(player)`.
- `reasons()` adds: `if (TRIBE_SPECIAL_UNIT[player.tribe] === type) { /* ok */ } else if ((Object.values(TRIBE_SPECIAL_UNIT) as UnitType[]).includes(type)) { out.push(t('spawn.reasonTribe', { tribe: t('tribe.' + tribeCodeFor(type)) })); }` — define a small `codeForSpecial(type)` map or just a generic message 'Available only to its tribe'.
- Icon: `makeActionButtonIcon(\`action-spawn-${isSpecial(type as UnitType) ? 'warrior' : type}\`, 56)` with helper `isSpecial`.

`src/ui/hud/toolbar-specs.ts` — add to the `unit && unit.owner === local` block:
```ts
    if (unit.type === 'stalker' && !unit.isStealthed && unit.shipLevel === undefined && !unit.hasMoved && !unit.hasAttacked && !unit.hasHealed) {
      out.push({ key: 'stealth', label: t('action.enableStealth'), disabled: false, onClick: () => gameController.enableStealthSelected() });
    }
    if (unit.type === 'builder' && unit.shipLevel === undefined) {
      out.push({ key: 'build', label: t('action.build'), disabled: unit.hasMoved || unit.hasAttacked || unit.hasHealed, onClick: () => useGameStore.getState().setOverlay({ kind: 'builderBuild' }) });
    }
    if (unit.type === 'trapper' && unit.shipLevel === undefined && trapCells(map, tile, player).length > 0) {
      out.push({ key: 'thorn-trap', label: t('action.buildTrap'), disabled: unit.hasMoved || unit.hasAttacked || unit.hasHealed || !canAfford(player.resources, TRAP_COST), onClick: () => gameController.placeTrap() });
    }
    if (unit.type === 'stormcaller' && stormEligible(map, unit)) {
      out.push({ key: 'storm', label: t('action.storm'), disabled: unit.hasMoved || unit.hasAttacked || unit.hasHealed, onClick: () => gameController.stormSelected() });
    }
```
(`tappCells` import from `traps.ts`; `stormEligible` from `storm.ts`; `isStunned` already curbs canMove/canAttack so all these buttons should additionally require `!isStunned(unit)` — add a local check.)

`src/ui/hud/hud-toolbar.ts` `ICON_ACTIONS`:
```ts
  stealth: 'stealth',
  build: 'build',
  'thorn-trap': 'thorn-trap',
  storm: 'stormcaller',
  'stun-attack': 'stun-attack',
```
(or map directly to the logical keys in `ACTION_BUTTON_ICON_FILES`; the kit maps `stealth`→`action-stealth`, `stormcaller`→`action-stormcaller`, `build`→`action-build` — extend `ACTION_BUTTON_ICON_FILES` in `action-button-icons.ts` if the logical keys don't exist).

`src/store/game-store.ts` `OverlayState` add:
```ts
  | { kind: 'builderBuild' }
  | { kind: 'thornTrap' }
  | { kind: 'stunChoice'; target: { q: number; r: number } }
```
(and the placeholder overlay union must be satisfied by the UI screen dispatcher).

`src/controller/game-controller.ts`: add public methods calling `sendCommand`:
```ts
  enableStealthSelected(): void { if (this.guard()) return; /* tile.unit => sendCommand({type:'enableStealth', unitId}) */ }
  buildAsBuilder(kind: BuilderBuildKind, q: number, r: number): void { /* selected builder => sendCommand({type:'build', unitId, q, r, kind}) */ }
  placeTrap(): void { /* set store.overlay {kind:'thornTrap'} with the trapper's trapCells marked */ }
  placeTrapOn(q: number, r: number): void { /* selected trapper => sendCommand({type:'trap', unitId, q, r}) */ }
  stormSelected(): void { /* selected stormcaller => sendCommand({type:'storm', unitId}) */ }
  stunTarget(q: number, r: number): void { store.setSelection(null); this.sendCommand({ type: 'stun', unitId, q, r }); }
  attackTarget(q: number, r: number): void { store.setOverlay(null); this.sendCommand({ type: 'attack', unitId, q, r }); }
```
Add a `guard()` helper matching the existing `aiActive/gameOver/paused/no-sim` checks used at the top of the other public methods. For builder placement, expose the highlighted set by reusing controller-owned marker sets: a transient `placementKeys: Set<string>` passed into `mapView.update(...)` (extend the `update()` call at game-controller.ts:1406 with `placementKeys` as an extra param) and drawn with the same highlight style as `reachableKeys` in `map-renderer.ts`.

In `handleMapClick`, when the selected unit is a stunner and the clicked tile is attackable (before the generic attack branch):

```ts
      if (unit && unit.type === 'stunner' && this.attackableKeys.has(axialKey(tile))) {
        const dist = hexDistance({ q: selection.q, r: selection.r }, tile);
        if (dist === 2) { store.setSelection(null); this.sendCommand({ type: 'stun', unitId: unit.id, q, r }); return; }
        if (dist === 1) { store.setOverlay({ kind: 'stunChoice', target: { q: tile.q, r: tile.r } }); return; }
      }
```

Also handle placement clicks at the top of `handleMapClick` while `store.overlay?.kind === 'builderBuild'` (open the building-kind popup first — the toolbar 'build' click opens a `builderBuild` overlay with 4 kind buttons; tapping one calls `gameController.buildAsBuilder(kind, q, r)` after a placement click) and `store.overlay?.kind === 'thornTrap'` (tapping an eligible cell calls `placeTrapOn(q, r)`; tapping any other cell calls `setOverlay(null)` to cancel).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/spawn-dialog.test.ts tests/toolbar-specs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlays/spawn-dialog.ts src/ui/hud/toolbar-specs.ts src/ui/hud/hud-toolbar.ts src/controller/game-controller.ts src/store/game-store.ts src/ui/kit/action-button-icons.ts tests/spawn-dialog.test.ts tests/toolbar-specs.test.ts
git commit -m "feat: special unit spawn dialog, toolbar buttons, controller wiring"
```

---

### Task 13: Renderer & presenters

**Files:**
- Modify: `src/render/map-renderer.ts`, `src/render/tile-signature.ts`, `src/render/texture-factory.ts`, `src/controller/event-presenter.ts`, `src/render/damage-badge.ts` (only if the attack-marker scheme needs to skip stealthed — the target filter already handles it), `src/ui/hud/hud-selected.ts`
- Test: (renderer is hard to unit-test; instead add/extend `tests/missing-unit-texture.test.ts`-style smoke tests and rely on `npm run typecheck` + `npm test`)

**Interfaces:**
- Consumes: `isStealthed`, `trap`, `attackBonus`, `isStunned`, the new `GameEvent`s.
- Produces: rendering of hidden stealthed enemies; owner-only trap circles; buff icons after HP bars; `"stunned"` HP text; presentation cases for `stealthEnabled`/`stealthRevealed`/`trapPlaced`/`trapTriggered`/`storm`/`stunShot`.

- [ ] **Step 1: Write the failing test**

Renderer behavior is not covered by a unit test in this repo. The meaningful automated checks here are:
- `tileSignature` includes stealthed-hidden (extend `tests/map-gen.test.ts` or a signature test if one exists) — assert `tileSignature` with a stealthed enemy unit differs from one with a visible unit, and matches the hidden case.
- `npx tsc --noEmit` succeeds after the changes.
- `npm test` stays green.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/map-gen.test.ts`
Expected: FAIL (signature not yet stealthed-aware) if such a test is asserted up front.

- [ ] **Step 3: Implement**

`src/render/tile-signature.ts`: treat a stealthed enemy unit as hidden in the signature:
```ts
  const hidden = u
    ? hiddenUnitIds.has(u.id) || (u.owner !== localPlayerIndex && u.isStealthed === true)
    : false;
```

`src/render/map-renderer.ts`:
- In `update()`: when building `hpBars`, add `const stealthedEnemy = unit.owner !== localPlayerIndex && unit.isStealthed === true;` and skip pushing hpBars/unit sprite work for them (they won't be drawn because `applyTile`/`tileSignature` already hide them). Also add trap markers:

```ts
    if (tile.trap && tile.trap.owner === localPlayerIndex && explored && !detailHidden) {
      const c = this.takeGraphics();
      c.circle(p.x, y, 8).fill(0xff0000);
      this.overlay.addChild(c);
      this.overlayItems.push({ el: c, world: { x: p.x, y } });
    }
```
- In `applyTile` unit sprite visibility, add `|| (tile.unit && tile.unit.owner !== localPlayerIndex && tile.unit.isStealthed === true)` next to the `hiddenUnitIds` visibility decision (`tv.unitSprite.visible = explored && !(tile.unit && hiddenUnitIds.has(tile.unit.id))`).
- In `addHpBar` add a `bonus: number` param computed in `update()`: `bonus: attackBonus(unit, map)`; render the icon + text after the label when `bonus > 0`:
```ts
    if (bonus > 0) {
      const icon = new Sprite(attack16TextureOrDefault()); // TextureSet.attack16Texture from Task 13 texture-factory
      icon.anchor.set(0.5, 1);
      icon.width = 16; icon.height = 16;
      icon.position.set(label.x + label.width / 2 + 10, label.y);
      const bonusText = this.takeText(`+${bonus}`, { fontSize: 13, fill: 0xffcc00, fontFamily: FONT_REGULAR });
      bonusText.anchor.set(0, 1);
      bonusText.position.set(label.x + label.width / 2 + 26, label.y);
      el.addChild(icon);
      el.addChild(bonusText);
    }
```
- Stunned text: in `addHpBar` build the label text as `` `${hp}/${maxHp}${isStunned(unit) ? ' stunned' : ''}` ``.
- `TextureSet`: add `attack16Texture` — in `src/render/texture-factory.ts`, slice the `attack-16` frame from the icons-16 atlas (load it the same way `CANNONBALL` textures load; see how `arrowTexture`/`cannonballTexture` are built around line 446 and mirror with `textures/icons-16-atlas.png` frame `attack-16`, 16×16) and expose it on `TextureSet`.

`src/controller/event-presenter.ts` — add `case`s in `present()`:
```ts
          case 'stealthEnabled':
          case 'stealthRevealed':
            this.host.render();
            break;
          case 'trapPlaced':
            this.host.render();
            break;
          case 'trapTriggered': {
            this.host.render();
            const t = tileAt(sim.map, e.q, e.r);
            if (t) this.spawnHpText(t, `-${e.damage}`, 0xff6666);
            break;
          }
          case 'storm': {
            for (const target of e.targets) {
              const t = tileAt(sim.map, target.q, target.r);
              if (t) this.spawnHpText(t, `-${target.damage}`, 0x88ccff);
            }
            this.host.render();
            break;
          }
          case 'stunShot': {
            // fly a cannonbal-32 projectile from attackerTile to targetTile
            const from = tileAt(sim.map, e.attackerTile.q, e.attackerTile.r);
            const to = tileAt(sim.map, e.targetTile.q, e.targetTile.r);
            if (from && to && this.host.textures()?.cannonbalTexture) {
              await this.spawnProjectileFromTo(from, to, this.host.textures()!.cannonbalTexture!);
            }
            if (!e.missed) this.host.render();
            break;
          }
```
- `TextureSet` also needs `cannonbalTexture` (slice `cannonbal-32` from `icons-32-atlas.png`, 32×32) — add to `texture-factory.ts` and reuse a generalized `spawnProjectileFromTo(fromTile, toTile, texture)` that wraps the existing `spawnCannonballFromTo` internals (`tweenSpriteTo`-based arc in `spawnProjectile`).
- In `animateMoveEvent`, skip animating a stealthed enemy's move for opponents:
```ts
    if (unit.owner !== local && unit.isStealthed) return; // opponents never see the stalker move
```

`src/ui/hud/hud-selected.ts`: the unit `pairs` hp value appends ` stunned` when `unit.stunTurns >= 1`; also show the buff attack value `attackBonus(map, unit)` in the attack pair when > 0 (e.g. `String(attackDamage(unit) + bonus)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/map-gen.test.ts && npm run typecheck`
Expected: PASS + typecheck clean. No renderer unit tests exist in the repo beyond these; run the full suite `npm test` to catch regressions.

- [ ] **Step 5: Commit**

```bash
git add src/render/map-renderer.ts src/render/tile-signature.ts src/render/texture-factory.ts src/controller/event-presenter.ts src/ui/hud/hud-selected.ts
git commit -m "feat: render stealth/traps/buff icons/stunned text and present new events"
```

---

### Task 14: AI support

**Files:**
- Modify: `src/game/ai-patterns.ts`, `src/game/ai-situation.ts`, `src/game/ai.ts`, `src/game/ai-types.ts`
- Test: existing AI tests (`tests/ai.test.ts`, `tests/ai-patterns.test.ts`, `tests/ai-situation.test.ts`)

**Interfaces:**
- Consumes: `TRIBE_SPECIAL_UNIT` (Task 2), `isStealthed`, `stormEligible`, `stormTargetShips`.
- Produces: `AiAction` gains `{ type: 'enableStealth'; unitId: string }`, `{ type: 'storm'; unitId: string }`; `runAiTurn` maps them; patterns for a stalking stealth-idle, storm-when-targets, and the rest benefit via combat hooks.

- [ ] **Step 1: Write the failing test**

Append to the versioned AI tests:

```ts
it('AI enables stealth on an idle visible stalker at the start of its turn', () => {
  // build a sim where the cats AI owns a visible stalker far from the enemy
  const sim = /* setup: AI cats player, stalker on map */;
  sim.applyCommand({ type: 'endTurn' });
  runAiTurn(sim, catsIndex); // or drive via endTurn
  expect(findUnit(sim, 'stalker-id').isStealthed).toBe(true);
});
it('AI storms when an enemy ship sits on village water', () => {
  // enemy ship on cats village water; AI storms and the ship takes ~90 dmg
});
```

The AI action execution goes through `runAiTurn`'s switch; add:
```ts
        case 'enableStealth':
          ok = this.doEnableStealth(a.unitId);
          break;
        case 'storm':
          ok = this.doStorm(a.unitId);
          break;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai.test.ts`
Expected: FAIL — no `enableStealth`/`storm` action types.

- [ ] **Step 3: Implement**

`src/game/ai-types.ts` `AiAction`: add `| { type: 'enableStealth'; unitId: string } | { type: 'storm'; unitId: string }`.

`src/game/simulator.ts` `runAiTurn`: add the two switch cases (Step 1 above).

`src/game/ai-patterns.ts`: add a low-priority pattern before the fallback:

```ts
function aiSpecialAbilities(ctx: AiPatternContext): AiAction[] | null {
  const out: AiAction[] = [];
  for (const t of ctx.map.tiles) {
    if (!t.unit || t.unit.owner !== ctx.player.index) continue;
    const u = t.unit;
    if (u.type === 'stalker' && !u.isStealthed && !u.hasMoved && !u.hasAttacked && !u.hasHealed) {
      out.push({ type: 'enableStealth', unitId: u.id });
    } else if (u.type === 'stormcaller' && stormTargetShips(ctx.map, u).length > 0) {
      out.push({ type: 'storm', unitId: u.id });
    }
  }
  return out.length ? out : null;
}
```
Register it in the `AI_PATTERNS` array (appropriate priority; near the fallback). The stunner's ranged stun and the berserker's rage already work through `doAttack`/combat hooks; the trapper/builder do nothing AI-wise (documented). `visibleEnemies`/`enemyPower` in `ai-situation.ts` and `enemyCanReach`/`landEnemyCanReach`/`enemyCanAttackNext` in `ai-patterns.ts` are already stealthed-aware from Task 7 (verify the `isStealthed` skip is present; add if the Task 7 edit was missed).

Also make AI attack selection stunner-aware: `chooseBestAttack` already scores by damage; stun at range 2 is strictly better than nothing, and `doAttack` is only called for reachable attackable targets. Add a rule in `bestAvailableAction` fallback: for a stunner with a range-2 target, emit `stun` instead of `attack`:

```ts
    // in bestAvailableAction, when the candidate unit is a stunner with an
    // attackable target farther than 1 hex, use { type: 'stun', unitId, q, r }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai.test.ts tests/ai-patterns.test.ts tests/ai-situation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai-types.ts src/game/ai-patterns.ts src/game/ai-situation.ts src/game/ai.ts src/game/simulator.ts tests/ai.test.ts
git commit -m "feat: AI uses special unit abilities"
```

---

### Task 15: Docs & report

**Files:**
- Modify: `GAME.md`, `combat-balance.md` (regenerated), `README.md` only if a unit list appears there.

**Interfaces:**
- Consumes: final `UNIT_TYPES` values and ability rules from all previous tasks.

- [ ] **Step 1: Implement (no test needed — documentation + generated report)**

- `GAME.md`: add the 7 special units to the Units table with a "Tribe" column note (or a following sub-table) and per-per-tribe availability; document each ability under "Unit actions" (stealth, building, war cry, rage, thorn trap, storm, stun).
  - Stalker: first-move auto-stealth, enable-stealth button, bump reveal, defense-0 stealth attack, invisible-to-others rules.
  - Builder: build sawmill/mine/port/bridge on own/adjacent cells, skills waived, can't build at sea, consume the turn.
  - Banner: +10 atk for allies within 2 (not self), non-stacking, dies → bonus gone; icon `attack-16 +10`.
  - Berserker: ≤50% hp → +20 atk and no counter; icon `attack-16 +20`.
  - Trapper: trap on own/adjacent land, 5 money + 3 ore, lasts 5 turns, trigger damage ≈90, stops movement, owner-only visibility.
  - Stormcaller: storm button when the claimed village has water; hits enemy/pirate ships on those water tiles ≈90; consumes the turn; allowed aboard a ship on an owned village water tile.
  - Stunner: range-2 → stun automatically; range-1 → choice; stun = no damage, blocks this/next turn, no counter; cannonball animation; `"stunned"` text.
- `combat-balance.md`: regenerate by running the balance-report test (`npx vitest run tests/balance-report.test.ts`) — the report auto-includes the 7 new units.
- Run the full suite and typecheck.

- [ ] **Step 2: Run verification**

Run: `npm test && npm run typecheck`
Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add GAME.md combat-balance.md
git commit -m "docs: special units and balance report"
```

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task: units data (1), tribe gating (2), data/i18n (3), engine primitives (4), combat (5), movement/stealth visibility (6), stalker (7), builder (8), trapper (9), stormcaller (10), stunner (11), spawn dialog + toolbar + controller (12), renderer/presenters (13), AI (14), docs/report (15). The spec's "attack marker excluded for invisible stalker" is satisfied by `attackableTargets` skipping stealthed units (Task 5) plus controller marker sets derived from it (Task 12). The spec's note "other players do not see traps" is the `trap.owner === localPlayerIndex` render gate (Task 13).
- **Placeholders:** no TBD steps; every step carries concrete code or a precise instruction reading from an existing file.
- **Type consistency:** `TRIBE_SPECIAL_UNIT: Record<Tribe, UnitType>` (Tasks 2, 12); `effectiveAttack(unit, map?)` and `attackBonus(unit, map)` (Tasks 4, 5, 13); `isStunned` lives in `abilities.ts` while `units.ts` keeps a local `stunTurns >= 1` check to avoid an import cycle (Task 5); stub counts are consistent with the 15 tasks above.