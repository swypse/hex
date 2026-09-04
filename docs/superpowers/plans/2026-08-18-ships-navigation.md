# Ships & Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise map water to ~20%, add ships (units become ships by moving onto a port with the navigation skill, upgradeable to level 3), ship rendering, and a resources panel on the skill tree.

**Architecture:** `Unit.shipLevel?: 1|2|3`. A pure `src/game/ship.ts` holds ship stats, upgrade costs, gain/revert. Movement (`reachableTargets`/`pathBetween`) makes water passable for ships and for tiles holding a port; combat uses ship attack stats. The controller grants/upgrades/reverts ships and confirms landings; the HUD adds an upgrade button, a landing dialog, and skill-tree resources.

**Tech Stack:** TypeScript, PixiJS 8, React, Zustand, Vitest.

## Global Constraints

- **Ports are on owned water tiles; water tiles that hold a port are enterable by any unit** (a dock). Moving onto a port tile grants the ship ability only when the owner has the **navigation** skill opened.
- `Unit.shipLevel?: 1 | 2 | 3`; absent = not a ship.
- Ship stats: movement `{1:2, 2:3, 3:4}`; attack `{2:2, 3:4}`; attackDistance `{2:3, 3:5}`; level 1 keeps the unit's base melee attack/range.
- Upgrade costs: 1→2 `{ money: 8, wood: 2 }`, 2→3 `{ money: 12, wood: 4 }`; upgrading does **not** set `hasMoved`/`hasAttacked`.
- A ship moving onto a **non-water** tile asks for confirmation; on confirm it moves and reverts to its normal unit (ship data deleted).
- Ships render as a bottom-up triangle; level 3 adds a horizontal line above it.
- Water: threshold percentile `0.15 → 0.20`.
- Every task ends with `npm run typecheck` green and `npm test` green.

---

### Task 1: More water (+5%)

**Files:**
- Modify: `src/game/biomes.ts`
- Test: `tests/biomes.test.ts`, `tests/mapGen.test.ts`

- [ ] **Step 1: Update the tests to expect ~20% water**

In `tests/biomes.test.ts`, change the water bounds in `'produces roughly 15% water and 10% mountains on a large map'`:

```ts
    expect(water).toBeGreaterThan(0.15);
    expect(water).toBeLessThan(0.25);
```

In `tests/mapGen.test.ts`, change the wild-water bounds in `'produces roughly 15% water and 10% mountains away from villages'`:

```ts
    expect(water).toBeGreaterThan(0.15);
    expect(water).toBeLessThan(0.25);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/biomes.test.ts tests/mapGen.test.ts`
Expected: FAIL — water ratio is ~15%, below 0.15.

- [ ] **Step 3: Change the water threshold in `src/game/biomes.ts`**

```ts
  const waterThreshold = percentile(heights, 0.2);
```

- [ ] **Step 4: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/biomes.ts tests/biomes.test.ts tests/mapGen.test.ts
git commit -m "feat: increase map water to about 20 percent"
```

---

### Task 2: Ship module + `Unit.shipLevel`

**Files:**
- Create: `src/game/ship.ts`
- Modify: `src/game/units.ts` (`Unit.shipLevel?`, `moveRange`)
- Test: `tests/ship.test.ts` (new)

**Interfaces:**
- Produces:
  - `export const SHIP_MOVEMENT: Record<1 | 2 | 3, number>`
  - `export const SHIP_ATTACK: Record<2 | 3, number>`
  - `export const SHIP_ATTACK_DISTANCE: Record<2 | 3, number>`
  - `export const SHIP_UPGRADE_COST: Record<2 | 3, { money: number; wood: number }>`
  - `isShip(unit: Unit): boolean`
  - `shipMovement(unit: Unit): number`
  - `shipAttack(unit: Unit): number`
  - `shipAttackDistance(unit: Unit): number`
  - `canUpgradeShip(unit: Unit, player: Player): boolean`
  - `upgradeShip(unit: Unit, player: Player): boolean`
  - `gainShipAbility(unit: Unit): void`
  - `revertShip(unit: Unit): void`
  - `Unit.shipLevel?: 1 | 2 | 3`

- [ ] **Step 1: Write the failing tests** — create `tests/ship.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import {
  canUpgradeShip,
  gainShipAbility,
  isShip,
  revertShip,
  SHIP_ATTACK,
  SHIP_ATTACK_DISTANCE,
  SHIP_MOVEMENT,
  SHIP_UPGRADE_COST,
  shipAttack,
  shipAttackDistance,
  shipMovement,
  upgradeShip,
} from '../src/game/ship';

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    ...overrides,
  };
}

function player(money: number, wood: number): Player {
  return {
    index: 0, tribe: Tribe.Villagers, isHuman: true, name: 'p',
    resources: { wood, stone: 0, money, ore: 0 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

describe('ship', () => {
  it('has the specified stats per level', () => {
    expect(SHIP_MOVEMENT).toEqual({ 1: 2, 2: 3, 3: 4 });
    expect(SHIP_ATTACK).toEqual({ 2: 2, 3: 4 });
    expect(SHIP_ATTACK_DISTANCE).toEqual({ 2: 3, 3: 5 });
    expect(SHIP_UPGRADE_COST).toEqual({
      2: { money: 8, wood: 2 },
      3: { money: 12, wood: 4 },
    });
  });

  it('gainShipAbility and revertShip toggle the flag', () => {
    const u = unit();
    expect(isShip(u)).toBe(false);
    gainShipAbility(u);
    expect(u.shipLevel).toBe(1);
    expect(isShip(u)).toBe(true);
    revertShip(u);
    expect(u.shipLevel).toBeUndefined();
    expect(isShip(u)).toBe(false);
  });

  it('shipMovement returns the ship range', () => {
    expect(shipMovement(unit({ shipLevel: 1 }))).toBe(2);
    expect(shipMovement(unit({ shipLevel: 3 }))).toBe(4);
  });

  it('shipAttack uses the base attack for level 1 and fixed values for 2/3', () => {
    expect(shipAttack(unit({ attack: 2, shipLevel: 1 }))).toBe(2);
    expect(shipAttack(unit({ attack: 2, shipLevel: 2 }))).toBe(2);
    expect(shipAttack(unit({ attack: 2, shipLevel: 3 }))).toBe(4);
  });

  it('shipAttackDistance uses base distance for level 1 and fixed values for 2/3', () => {
    expect(shipAttackDistance(unit({ attackDistance: 1, shipLevel: 1 }))).toBe(1);
    expect(shipAttackDistance(unit({ attackDistance: 1, shipLevel: 2 }))).toBe(3);
    expect(shipAttackDistance(unit({ attackDistance: 1, shipLevel: 3 }))).toBe(5);
  });

  it('canUpgradeShip requires a ship below level 3 with the cost', () => {
    expect(canUpgradeShip(unit(), player(100, 10))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 3 }), player(100, 10))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 1 }), player(7, 2))).toBe(false);
    expect(canUpgradeShip(unit({ shipLevel: 1 }), player(8, 2))).toBe(true);
    expect(canUpgradeShip(unit({ shipLevel: 2 }), player(12, 4))).toBe(true);
  });

  it('upgradeShip pays and levels up without blocking actions', () => {
    const u = unit({ shipLevel: 1, hasMoved: false, hasAttacked: false });
    const p = player(10, 3);
    expect(upgradeShip(u, p)).toBe(true);
    expect(u.shipLevel).toBe(2);
    expect(p.resources.money).toBe(2);
    expect(p.resources.wood).toBe(1);
    expect(u.hasMoved).toBe(false);
    expect(u.hasAttacked).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ship.test.ts`
Expected: FAIL — `Cannot find module '../src/game/ship'`.

- [ ] **Step 3: Create `src/game/ship.ts`**

```ts
import type { Player } from './players';
import { canAfford, pay } from './resources';
import type { Unit } from './units';

export const SHIP_MOVEMENT: Record<1 | 2 | 3, number> = { 1: 2, 2: 3, 3: 4 };
export const SHIP_ATTACK: Record<2 | 3, number> = { 2: 2, 3: 4 };
export const SHIP_ATTACK_DISTANCE: Record<2 | 3, number> = { 2: 3, 3: 5 };
export const SHIP_UPGRADE_COST: Record<2 | 3, { money: number; wood: number }> = {
  2: { money: 8, wood: 2 },
  3: { money: 12, wood: 4 },
};

export function isShip(unit: Unit): boolean {
  return unit.shipLevel !== undefined;
}

export function shipMovement(unit: Unit): number {
  return SHIP_MOVEMENT[unit.shipLevel!];
}

export function shipAttack(unit: Unit): number {
  if (unit.shipLevel === undefined || unit.shipLevel === 1) return unit.attack;
  return SHIP_ATTACK[unit.shipLevel];
}

export function shipAttackDistance(unit: Unit): number {
  if (unit.shipLevel === undefined || unit.shipLevel === 1) return unit.attackDistance;
  return SHIP_ATTACK_DISTANCE[unit.shipLevel];
}

export function canUpgradeShip(unit: Unit, player: Player): boolean {
  if (unit.shipLevel === undefined || unit.shipLevel >= 3) return false;
  const cost = SHIP_UPGRADE_COST[(unit.shipLevel + 1) as 2 | 3];
  return canAfford(player.resources, { wood: cost.wood, stone: 0, money: cost.money, ore: 0 });
}

export function upgradeShip(unit: Unit, player: Player): boolean {
  if (!canUpgradeShip(unit, player)) return false;
  const cost = SHIP_UPGRADE_COST[(unit.shipLevel! + 1) as 2 | 3];
  player.resources = pay(player.resources, { wood: cost.wood, stone: 0, money: cost.money, ore: 0 });
  unit.shipLevel = (unit.shipLevel! + 1) as 1 | 2 | 3;
  return true;
}

export function gainShipAbility(unit: Unit): void {
  unit.shipLevel = 1;
}

export function revertShip(unit: Unit): void {
  delete unit.shipLevel;
}
```

- [ ] **Step 4: Add `shipLevel` to `Unit` and update `moveRange` in `src/game/units.ts`**

Add `shipLevel?: 1 | 2 | 3;` to the `Unit` interface. Add `import { shipMovement } from './ship';` and change `moveRange`:

```ts
export function moveRange(unit: Unit): number {
  if (unit.shipLevel !== undefined) return shipMovement(unit);
  return unit.hasAttacked && unit.type === 'rider' ? 1 : UNIT_MOVEMENT[unit.type];
}
```

- [ ] **Step 5: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/ship.ts src/game/units.ts tests/ship.test.ts
git commit -m "feat: add ship ability module and unit ship level"
```

---

### Task 3: Movement & combat integration

**Files:**
- Modify: `src/game/selection.ts` (ship water passability, `pathBetween` `canSail`)
- Modify: `src/game/combat.ts` (ship attack stats)
- Modify: `src/controller/gameController.ts` (`pathBetween` call passes `canSail`)
- Test: `tests/selection.test.ts`, `tests/combat.test.ts`

**Interfaces:**
- Consumes: `isShip`, `shipAttack`, `shipAttackDistance` from `ship.ts`.
- Produces:
  - `pathBetween(map, from, to, canClimb = false, canSail = false): Axial[]`
  - Water is passable in `reachableTargets` when `isShip(unit)` or the tile has a port building.
  - `attackableTargets`/`attackDamage` use ship attack stats; water targets attackable by ships.

- [ ] **Step 1: Add failing tests**

In `tests/selection.test.ts`, add:

```ts
  it('ships can move on water', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
      shipLevel: 1,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.Water));
    const reached = reachableTargets(map, unit).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 }, false, true)).toEqual([{ q: 1, r: 0 }]);
  });

  it('a non-ship can step onto a port water tile', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const port = makeTile(1, 0, TileType.Water);
    port.building = { kind: 'port', level: 1 };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit), port);
    expect(reachableTargets(map, unit).some((t) => t.q === 1 && t.r === 0)).toBe(true);
  });
```

Note: `makeTile(q, r, terrain, ...)` in `tests/selection.test.ts` takes a `terrain` third parameter — verify its signature and pass terrain accordingly.

In `tests/combat.test.ts`, add:

```ts
  it('a level-3 ship attacks at distance 5 with damage 4', () => {
    const ship: Unit = {
      id: 's', owner: 0, type: 'archer', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 3, attack: 1, attackDistance: 2, spawnVillage: null,
      shipLevel: 3,
    };
    const targetTile = makeTile(0, 5, null, { id: 'e', owner: 1, type: 'warrior', q: 0, r: 5, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: null });
    expect(attackableTargets(mapWith(ship, targetTile), ship).some((t) => t.q === 0 && t.r === 5)).toBe(true);
    expect(attackDamage(ship)).toBe(4);
  });
```

(Add the needed `makeTile`/`mapWith` helpers to `tests/combat.test.ts` matching that file's existing conventions.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/selection.test.ts tests/combat.test.ts`
Expected: FAIL — water still blocks ships / base attack stats used.

- [ ] **Step 3: Update `src/game/selection.ts`**

Import `isShip` from `./ship`. In `reachableTargets`, replace `if (t.terrain === TileType.Water) return false;` with:

```ts
    if (t.terrain === TileType.Water && !isShip(unit) && !(t.building && t.building.kind === 'port')) return false;
```

Change `pathBetween` signature to `(map, from, to, canClimb = false, canSail = false)` and replace `if (tile.terrain === TileType.Water) continue;` with:

```ts
      if (tile.terrain === TileType.Water && !canSail && !(tile.building && tile.building.kind === 'port')) continue;
```

- [ ] **Step 4: Update `src/game/combat.ts`**

Import `isShip, shipAttack, shipAttackDistance` from `./ship`.

```ts
export function attackDamage(attacker: Unit): number {
  return Math.round((shipAttack(attacker) * attacker.hp) / UNIT_TYPES[attacker.type].maxHp);
}

export function attackableTargets(map: GameMap, unit: Unit): MapTile[] {
  return map.tiles.filter((t) => {
    if (!t.unit) return false;
    if (t.unit.owner === unit.owner) return false;
    if (hexDistance({ q: unit.q, r: unit.r }, t) > shipAttackDistance(unit)) return false;
    if (t.terrain === TileType.Water && !isShip(unit)) return false;
    return true;
  });
}
```

- [ ] **Step 5: Update `animateUnitMove` in `src/controller/gameController.ts`**

The `pathBetween` call becomes:

```ts
    const path = pathBetween(this.map, source, target, canClimb, unit.shipLevel !== undefined);
```

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/selection.ts src/game/combat.ts src/controller/gameController.ts tests/selection.test.ts tests/combat.test.ts
git commit -m "feat: ships sail on water and use ship attack stats"
```

---

### Task 4: Ship textures

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `TextureSet.shipTextures: Record<Tribe, { base: Texture; level3: Texture }>`.

- [ ] **Step 1: Add the ship textures to `src/render/textureFactory.ts`**

Add a factory function and extend `TextureSet`/`createTextures`:

```ts
function makeShipTexture(app: Application, color: number, hexSize: number, level3: boolean): Texture {
  const g = new Graphics();
  const r = hexSize * 0.2;
  g.poly([0, -r, r, r, -r, r]).fill(color).stroke({ width: 3, color: 0x000000 });
  if (level3) {
    g.rect(-r * 0.9, -r - 7, r * 1.8, 3).fill(0x000000);
  }
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

Add to `TextureSet`:

```ts
  shipTextures: Record<Tribe, { base: Texture; level3: Texture }>;
```

In `createTextures`, build and return it:

```ts
  const shipTextures = {} as Record<Tribe, { base: Texture; level3: Texture }>;
  for (const tribe of TRIBES) {
    shipTextures[tribe.id] = {
      base: makeShipTexture(app, tribe.color, hexSize, false),
      level3: makeShipTexture(app, tribe.color, hexSize, true),
    };
  }
  ...
  return { ..., shipTextures };
```

- [ ] **Step 2: Draw ships in `src/render/mapRenderer.ts`**

In the unit sprite block, pick the ship texture for ships:

```ts
    if (tile.unit) {
      const unit = tile.unit;
      const unitTexture =
        unit.shipLevel !== undefined
          ? unit.shipLevel === 3
            ? textures.shipTextures[players[unit.owner].tribe].level3
            : textures.shipTextures[players[unit.owner].tribe].base
          : textures.unitTextures[players[unit.owner].tribe][unit.type];
      const unitSprite = new Sprite(unitTexture);
      unitSprite.anchor.set(0.5);
      unitSprite.scale.set(spriteScale);
      unitSprite.position.set(p.x, y);
      container.addChild(unitSprite);
      const canAct = unitCanAct(map, tile, unit, players[unit.owner]);
      hpBars.push({ unit, position: { x: p.x, y }, canAct });
    }
```

- [ ] **Step 3: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 4: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: render ships as tribe triangles with a level-3 line"
```

---

### Task 5: Controller & store — gain, landing confirm, upgrade

**Files:**
- Modify: `src/store/gameStore.ts` (`pendingShipLanding`)
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `gainShipAbility`, `revertShip`, `upgradeShip` from `ship.ts`; `hasSkill` from `skills.ts`.
- Produces:
  - Store: `pendingShipLanding: { q: number; r: number } | null`, `setPendingShipLanding(v)`.
  - `gameController.upgradeSelectedShip(): void`, `confirmShipLanding(): void`, `cancelShipLanding(): void`.

- [ ] **Step 1: Add `pendingShipLanding` to `src/store/gameStore.ts`**

Add to interface/initial state/setters (like `pendingAttack`):

```ts
  pendingShipLanding: { q: number; r: number } | null;
  setPendingShipLanding: (pending: { q: number; r: number } | null) => void;
```

```ts
  pendingShipLanding: null,
  setPendingShipLanding: (pending) => set({ pendingShipLanding: pending }),
```

- [ ] **Step 2: Update `handleMapClick` for ship landings**

When a selected ship clicks a non-water reachable tile, open the landing dialog instead of moving:

```ts
      if (this.reachableKeys.has(axialKey(tile))) {
        const unit = tileAt(this.map, selection.q, selection.r)!.unit!;
        if (unit.shipLevel !== undefined && tile.terrain !== TileType.Water) {
          store.setPendingShipLanding({ q: tile.q, r: tile.r });
          return;
        }
        await this.animateUnitMove(unit, tile);
        store.setSelection({ kind: 'unit', q: tile.q, r: tile.r });
        this.render();
        return;
      }
```

(import `TileType` from `../game/tileTypes`.)

- [ ] **Step 3: Add `upgradeSelectedShip`, `confirmShipLanding`, `cancelShipLanding`**

Imports: add `gainShipAbility, revertShip, upgradeShip` to a `../game/ship` import.

Add after `buildSelectedBuilding`:

```ts
  upgradeSelectedShip(): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    if (store.aiActive || store.gameOver) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit') return;
    const tile = tileAt(this.map, selection.q, selection.r)!;
    const unit = tile.unit;
    const player = store.players[0];
    if (unit && upgradeShip(unit, player)) {
      store.setPlayers([...store.players]);
      this.render();
    }
  }

  confirmShipLanding(): void {
    const store = useGameStore.getState();
    const pending = store.pendingShipLanding;
    store.setPendingShipLanding(null);
    if (!this.map || !pending) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit') return;
    const unit = tileAt(this.map, selection.q, selection.r)!.unit;
    if (!unit || unit.shipLevel === undefined) return;
    const target = tileAt(this.map, pending.q, pending.r)!;
    void this.animateUnitMove(unit, target).then(() => {
      revertShip(unit);
      this.render();
    });
  }

  cancelShipLanding(): void {
    useGameStore.getState().setPendingShipLanding(null);
  }
```

- [ ] **Step 4: Grant the ship ability when a move lands on a port**

In `animateUnitMove`, after `moveUnit(this.map, unit, target);` add:

```ts
    const store = useGameStore.getState();
    const dest = tileAt(this.map, target.q, target.r);
    if (dest && dest.building && dest.building.kind === 'port' && hasSkill(store.players[unit.owner], 'navigation')) {
      gainShipAbility(unit);
    }
```

(Note: `animateUnitMove` already reads `store` for players earlier; reuse or re-read as needed.)

- [ ] **Step 5: Run typecheck and full test suite**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 6: Commit**

```bash
git add src/store/gameStore.ts src/controller/gameController.ts
git commit -m "feat: grant, upgrade and land ships"
```

---

### Task 6: UI — upgrade button, landing dialog, skill-tree resources

**Files:**
- Modify: `src/screens/hud/ActionToolbar.tsx` (Upgrade ship)
- Create: `src/ui/ShipLandingDialog.tsx`
- Modify: `src/screens/GameScreen.tsx` (mount dialog)
- Modify: `src/screens/SkillTreeScreen.tsx` (resources panel)
- Modify: `index.html` (dialog styles not needed; it uses inline styles)

**Interfaces:**
- Consumes: `SHIP_UPGRADE_COST`, `canUpgradeShip` from `ship.ts`; store `pendingShipLanding`.

- [ ] **Step 1: Add the Upgrade ship button to `src/screens/hud/ActionToolbar.tsx`**

Imports: `SHIP_UPGRADE_COST` from `../../game/ship`. Inside the unit block, add:

```tsx
  if (unit && unit.owner === 0 && unit.shipLevel !== undefined && unit.shipLevel < 3) {
    const cost = SHIP_UPGRADE_COST[(unit.shipLevel + 1) as 2 | 3];
    const affordable = canAfford(players[0].resources, { wood: cost.wood, stone: 0, money: cost.money, ore: 0 });
    buttons.push(
      <button key="upgrade-ship" disabled={!affordable}
              onClick={() => gameController.upgradeSelectedShip()}>
        Upgrade ship ({cost.money} money + {cost.wood} wood)
      </button>,
    );
  }
```

- [ ] **Step 2: Create `src/ui/ShipLandingDialog.tsx`**

```tsx
import { gameController } from '../controller/gameController';
import { useGameStore } from '../store/gameStore';
import { UNIT_TYPE_NAMES } from '../game/units';
import { tileAt } from '../game/selection';

export function ShipLandingDialog(): React.ReactElement {
  const pending = useGameStore((s) => s.pendingShipLanding);
  const selection = useGameStore((s) => s.selection);
  if (!pending || !selection) return <></>;
  const map = gameController.getMap();
  if (!map) return <></>;
  const tile = tileAt(map, selection.q, selection.r);
  if (!tile || !tile.unit) return <></>;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 21,
      }}
    >
      <div style={{ background: '#000', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>Move to land and become a {UNIT_TYPE_NAMES[tile.unit.type]} again?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => gameController.confirmShipLanding()}>Confirm</button>
          <button onClick={() => gameController.cancelShipLanding()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount the dialog in `src/screens/GameScreen.tsx`**

Import `ShipLandingDialog` from `../ui/ShipLandingDialog` and render it (after `ConfirmDialog`).

- [ ] **Step 4: Add the resources panel to `src/screens/SkillTreeScreen.tsx`**

Read the human's resources and render a panel at the top:

```tsx
  const human = useGameStore((s) => s.players[0]);
  ...
  <h2 style={{ color: '#fff' }}>Skill tree</h2>
  <div style={{ color: '#ffd700' }}>
    Money: {human.resources.money} &nbsp; Wood: {human.resources.wood} &nbsp; Stone: {human.resources.stone} &nbsp; Ore: {human.resources.ore}
  </div>
```

- [ ] **Step 5: Run typecheck, tests, and build**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all pass.
Run: `npm run build` — Expected: builds successfully.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`. Verify:
- Water covers ~20% of the map.
- A unit with the navigation skill moving onto a port becomes a ship (triangle); upgrades cost money+wood and don't block actions; level 3 shows the line.
- Ships sail on water; clicking a land tile opens the landing dialog; confirming moves and reverts.
- The skill tree shows money/wood/stone/ore.

- [ ] **Step 7: Commit**

```bash
git add src/screens/hud/ActionToolbar.tsx src/ui/ShipLandingDialog.tsx src/screens/GameScreen.tsx src/screens/SkillTreeScreen.tsx
git commit -m "feat: ship upgrade button, landing dialog and skill-tree resources"
```
