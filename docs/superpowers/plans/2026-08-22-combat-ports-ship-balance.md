# Combat, Ports, and Ship Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow land units to attack ships on water, prevent attackers from moving onto a killed ship's tile, forbid using enemy ports, and render ports in the owning tribe's color.

**Architecture:** Combat changes are pure logic in `src/game/combat.ts`; port gating adds a helper in `buildings.ts` used by `simulator.ts`; the port texture becomes per-tribe in `textureFactory.ts` consumed by `mapRenderer.ts`.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- No new dependencies.
- No `GameMap`/wire-payload changes.
- Existing suite passes after updating the two tests that assert old combat behavior.
- Ports always have an owner per `canBuildPort` (`ownedBy === player.index`); the gray fallback is defensive only.

---

### Task 1: Land units can attack ships on water + killed-ship move rule

**Files:**
- Modify: `src/game/combat.ts:21-29` (attackableTargets), `src/game/combat.ts:61-76` (performAttack move-on-kill)
- Test: `tests/combat.test.ts`

**Interfaces:**
- Consumes: `isShip` (already imported), `targetUnit` (already captured at top of `performAttack`).
- Produces: `attackableTargets` includes enemy units on water for land attackers; `performAttack` no longer moves the attacker onto a tile whose killed unit is a ship.

- [ ] **Step 1: Write the failing tests (TDD)**

In `tests/combat.test.ts`:

a. Update the existing "excludes friendly units and water" test to reflect the new rule. Change it so a land attacker CAN target the enemy unit on water:

```ts
  it('includes adjacent enemies and water targets, excludes friendly units', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const targets = attackableTargets(map, attacker);
    const keys = targets.map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('1,0');
    expect(keys).toContain('0,-1');
    expect(keys).not.toContain('0,0');
  });
```

b. Update the "land unit cannot target water units" test to the opposite:

```ts
  it('a land unit can target an enemy ship on water', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    expect(attackableTargets(map, attacker).some((t) => t.q === 0 && t.r === -1)).toBe(true);
  });
```

c. Add a test that killing a ship does not move a land attacker onto the ship's water tile:

```ts
  it('does not move a land attacker onto a killed ship tile', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const dyingShip: Unit = { id: 'ship', owner: 1, type: 'warrior', q: 0, r: -1, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 1, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1 };
    const shipTile = makeTile(0, -1, TileType.Water, dyingShip);
    map.tiles[2] = shipTile;
    performAttack(map, attacker, shipTile, noMiss);
    expect(map.tiles[0].unit).toBe(attacker);
    expect(map.tiles[2].unit).toBeNull();
    expect(attacker.q).toBe(0);
    expect(attacker.r).toBe(0);
  });
```

d. Add a test that killing a ship does not move a ship attacker either:

```ts
  it('does not move a ship attacker onto a killed ship tile', () => {
    const map = makeMap();
    const ship: Unit = { id: 'shipA', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1 };
    map.tiles[0].unit = ship;
    const dyingShip: Unit = { id: 'shipB', owner: 1, type: 'warrior', q: 0, r: -1, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 1, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1 };
    const shipTile = makeTile(0, -1, TileType.Water, dyingShip);
    map.tiles[2] = shipTile;
    performAttack(map, ship, shipTile, noMiss);
    expect(map.tiles[0].unit).toBe(ship);
    expect(map.tiles[2].unit).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/combat.test.ts`
Expected: the updated "includes adjacent enemies and water targets" test fails (water not in targets), "land unit can target an enemy ship on water" fails, and the two new killed-ship tests fail.

- [ ] **Step 3: Implement in `combat.ts`**

a. In `attackableTargets`, delete the water restriction:

```ts
export function attackableTargets(map: GameMap, unit: Unit): MapTile[] {
  return map.tiles.filter((t) => {
    if (!t.unit) return false;
    if (t.unit.owner === unit.owner) return false;
    if (hexDistance({ q: unit.q, r: unit.r }, t) > shipAttackDistance(unit)) return false;
    return true;
  });
}
```

b. In `performAttack`, change the move-on-kill guard to use the killed unit's ship status. The `targetUnit` const is already declared at the top of the function:

```ts
  if (targetDied) {
    target.unit = null;
    const attackerTile = map.tiles.find((t) => t.unit === attacker);
    if (attackerTile && attacker.type !== 'archer' && !isShip(attacker) && !isShip(targetUnit)) {
      attackerTile.unit = null;
      attacker.q = target.q;
      attacker.r = target.r;
      target.unit = attacker;
    }
  }
```

- [ ] **Step 4: Run the combat tests**

Run: `npx vitest run tests/combat.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: land units attack ships; attackers don't move onto sunk ships"
```

---

### Task 2: Enemy ports unusable

**Files:**
- Modify: `src/game/buildings.ts` (add `canUsePort`)
- Modify: `src/game/simulator.ts:177` (use it)
- Test: `tests/buildings.test.ts` (or `tests/ship.test.ts`)

**Interfaces:**
- Consumes: `MapTile`, `Player`, `hasSkill` (all imported in `buildings.ts`).
- Produces: `export function canUsePort(tile: MapTile, player: Player): boolean` — true only when `tile.building?.kind === 'port' && (tile.ownedBy === null || tile.ownedBy === player.index)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/buildings.test.ts` (or create `tests/port.test.ts` if no buildings test exists — check first; `tests/buildings.test.ts` exists):

```ts
import { canUsePort } from '../src/game/buildings';
import { MapTile, Settlement } from '../src/game/mapGen';
import { Player } from '../src/game/players';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';

function portTile(ownedBy: number | null): MapTile {
  return {
    q: 0, r: 0, terrain: TileType.Water, settlement: null,
    building: { kind: 'port', level: 1 }, unit: null,
    ownedBy, claimedByVillage: null,
  };
}

function player(index: number): Player {
  return {
    index, tribe: Tribe.Cats, isHuman: true, name: 'p',
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0, kills: 0, skills: ['navigation'], isActive: true,
  };
}

describe('canUsePort', () => {
  it('returns false for enemy-owned ports', () => {
    expect(canUsePort(portTile(1), player(0))).toBe(false);
  });
  it('returns true for player-owned ports', () => {
    expect(canUsePort(portTile(0), player(0))).toBe(true);
  });
  it('returns true for free ports', () => {
    expect(canUsePort(portTile(null), player(0))).toBe(true);
  });
  it('returns false for non-port buildings', () => {
    const t = portTile(0);
    t.building = { kind: 'mine', level: 1 };
    expect(canUsePort(t, player(0))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/buildings.test.ts`
Expected: FAIL — `canUsePort is not a function`.

- [ ] **Step 3: Implement**

In `src/game/buildings.ts`, add:

```ts
export function canUsePort(tile: MapTile, player: Player): boolean {
  return tile.building?.kind === 'port' && (tile.ownedBy === null || tile.ownedBy === player.index);
}
```

In `src/game/simulator.ts`:
- Add `canUsePort` to the `./buildings` import: `import { buildingIncome, buildBuilding, canUsePort } from './buildings';`
- Replace the port grant condition in `doMove`:

```ts
    if (canUsePort(target, player)) {
      gainShipAbility(unit);
    }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run typecheck && npx vitest run tests/buildings.test.ts tests/simulator.test.ts tests/simulatorTurn.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/buildings.ts src/game/simulator.ts tests/buildings.test.ts
git commit -m "feat: forbid using enemy ports"
```

---

### Task 3: Per-tribe port textures

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Consumes: `TRIBES` (imported), `Tribe` (imported).
- Produces: `TextureSet.portTextures: Record<Tribe, Texture>` and `TextureSet.freePortTexture: Texture`; `applyTile` picks the port texture by `tile.ownedBy`.

- [ ] **Step 1: Update `TextureSet` and `makePortTexture`**

In `src/render/textureFactory.ts`:

a. Change the interface:

```ts
  portTextures: Record<Tribe, Texture>;
  freePortTexture: Texture;
```

b. Change `makePortTexture` to accept a color:

```ts
function makePortTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  const s = hexSize * 0.34;
  g.poly([-s, 0, 0, -s * 0.55, s, 0, 0, s * 0.55]).fill(color).stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

c. In `createTextures`, replace the single `portTexture` with per-tribe plus free:

```ts
  const portTextures = {} as Record<Tribe, Texture>;
  for (const tribe of TRIBES) {
    portTextures[tribe.id] = makePortTexture(app, tribe.color, hexSize);
  }
  const freePortTexture = makePortTexture(app, 0x9a9a9a, hexSize);
```

d. Update the return object: `portTextures, freePortTexture` (remove `portTexture`).

- [ ] **Step 2: Update `mapRenderer.ts`**

In `applyTile`, change the building sprite selection for ports:

```ts
    this.syncSprite(tv, 'buildingSprite', tile.building
      ? tile.building.kind === 'port'
        ? tile.ownedBy === null
          ? this.textures.freePortTexture
          : this.textures.portTextures[players[tile.ownedBy].tribe]
        : tile.building.kind === 'factory'
          ? this.textures.factoryTexture
          : this.textures.mineTexture
      : null, p.x, y);
```

- [ ] **Step 3: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: render ports in the owning tribe's color"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a game with 4 players.
Check:
- A land unit adjacent to a ship on water shows it as an attackable target and can attack it.
- When any unit sinks a ship, the attacker stays on its own tile (no move onto water).
- A unit with the navigation skill cannot gain ship ability by stepping onto an enemy port; it can at its own or a free port.
- Ports render in the owning tribe's color.
