# Village Capacity, Unit Spawning, Money Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add village capacity with a units/capacity indicator, unit spawning (warrior/rider/archer with prices and shapes), a bottom-center action toolbar with a spawn dialog, round-end money income for all players, an animated money indicator under the turn info, and AI spawning.

**Architecture:** Unit data moves into a `UNIT_TYPES` table (movement/attack/range/hp/price/shape). `Unit` gains `spawnVillage`; capacity = `1 + level`, counted by spawn links. New `spawn.ts` handles spawning; `ai.ts` plans spawns; `gameController` executes and grants round-end income; new React `ActionToolbar` + `SpawnDialog` + `MoneyInfo`; renderer draws shapes and the capacity label.

**Tech Stack:** TypeScript, React 18, zustand, PixiJS 8, Vitest.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `UnitType = 'warrior' | 'rider' | 'archer'`.
- `UNIT_TYPES` values exactly:
  - warrior: movement 1, attack 2, attackDistance 1, maxHp 5, price 2, shape `circle`
  - rider: movement 3, attack 1, attackDistance 1, maxHp 4, price 3, shape `square`
  - archer: movement 1, attack 1, attackDistance 3, maxHp 3, price 3, shape `triangle`
- `Unit` gains `spawnVillage: { q: number; r: number } | null`.
- `villageCapacity(level) = 1 + level`; `unitsInVillage` counts units by `spawnVillage` match.
- `attackDamage` uses `UNIT_TYPES[unit.type].maxHp` as denominator.
- Income: on round advance (after `turn++`), every player gains `3 + village.level` money per owned village.
- Toolbar bottom-center; village selection shows Spawn + Upgrade.
- Spawn dialog lists unit types with `⭐{price}`; disabled when unaffordable or at capacity.
- Money indicator below `#turn-info`: `⭐ {money}`, animated (count ±1, ~80ms per step, bounce on tick).
- Capacity label under village circle: `{unitsInVillage}/{capacity}`.
- AI spawns with probability 0.5 per owned village when affordable and has capacity + empty tile.
- Tests: `npm test`; typecheck `npm run typecheck`.
- Commit after each task with the exact message shown.

---

### Task 1: Unit type table + spawnVillage + per-type HP

**Files:**
- Modify: `src/game/units.ts`
- Modify: `src/game/mapGen.ts`
- Modify: `src/game/combat.ts`
- Modify: `tests/combat.test.ts`, `tests/selection.test.ts`, `tests/ai.test.ts`, `tests/mapGen.test.ts` (unit literals gain `spawnVillage`)
- Test: `tests/units.test.ts` (new)

**Interfaces:**
- Consumes: `units.ts` types.
- Produces (used by Tasks 2-5):
  - `UnitType`, `UNIT_TYPES: Record<UnitType, UnitTypeInfo>`, derived `UNIT_MOVEMENT`, `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE`, `MAX_HP`, `UNIT_TYPE_NAMES`.
  - `Unit.spawnVillage: { q: number; r: number } | null`.
  - `attackDamage` per-type maxHp.

- [ ] **Step 1: Write the failing test**

Create `tests/units.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UNIT_TYPES, UnitType } from '../src/game/units';

describe('UNIT_TYPES', () => {
  it('defines warrior, rider, archer', () => {
    expect(UNIT_TYPES.warrior).toEqual({ movement: 1, attack: 2, attackDistance: 1, maxHp: 5, price: 2, shape: 'circle' });
    expect(UNIT_TYPES.rider).toEqual({ movement: 3, attack: 1, attackDistance: 1, maxHp: 4, price: 3, shape: 'square' });
    expect(UNIT_TYPES.archer).toEqual({ movement: 1, attack: 1, attackDistance: 3, maxHp: 3, price: 3, shape: 'triangle' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `UNIT_TYPES` not exported.

- [ ] **Step 3: Rewrite `src/game/units.ts`**

Replace the entire file contents:

```ts
export type UnitType = 'warrior' | 'rider' | 'archer';

export interface UnitTypeInfo {
  movement: number;
  attack: number;
  attackDistance: number;
  maxHp: number;
  price: number;
  shape: 'circle' | 'square' | 'triangle';
}

export const UNIT_TYPES: Record<UnitType, UnitTypeInfo> = {
  warrior: { movement: 1, attack: 2, attackDistance: 1, maxHp: 5, price: 2, shape: 'circle' },
  rider: { movement: 3, attack: 1, attackDistance: 1, maxHp: 4, price: 3, shape: 'square' },
  archer: { movement: 1, attack: 1, attackDistance: 3, maxHp: 3, price: 3, shape: 'triangle' },
};

export interface Unit {
  id: string;
  owner: number;
  type: UnitType;
  q: number;
  r: number;
  hasMoved: boolean;
  hp: number;
  attack: number;
  attackDistance: number;
  spawnVillage: { q: number; r: number } | null;
}

export const UNIT_MOVEMENT: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.movement,
  rider: UNIT_TYPES.rider.movement,
  archer: UNIT_TYPES.archer.movement,
};

export const UNIT_ATTACK: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.attack,
  rider: UNIT_TYPES.rider.attack,
  archer: UNIT_TYPES.archer.attack,
};

export const UNIT_ATTACK_DISTANCE: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.attackDistance,
  rider: UNIT_TYPES.rider.attackDistance,
  archer: UNIT_TYPES.archer.attackDistance,
};

export const MAX_HP = UNIT_TYPES.warrior.maxHp;

export const UNIT_TYPE_NAMES: Record<UnitType, string> = {
  warrior: 'Warrior',
  rider: 'Rider',
  archer: 'Archer',
};
```

- [ ] **Step 4: Update `src/game/mapGen.ts`**

Add `spawnVillage` to the starting-unit placement (link to the unit's own tile):

```ts
      tile.unit = {
        id: `w${unitId}`,
        owner: tile.settlement.owner,
        type: 'warrior',
        q: tile.q,
        r: tile.r,
        hasMoved: false,
        hp: UNIT_TYPES.warrior.maxHp,
        attack: UNIT_ATTACK.warrior,
        attackDistance: UNIT_ATTACK_DISTANCE.warrior,
        spawnVillage: { q: tile.q, r: tile.r },
      };
```

Update the import line:

```ts
import { MAX_HP, Unit, UNIT_ATTACK, UNIT_ATTACK_DISTANCE, UNIT_TYPES } from './units';
```

(Remove the now-unused `MAX_HP` import if tsc flags it — `hp` uses `UNIT_TYPES.warrior.maxHp`.)

- [ ] **Step 5: Update `src/game/combat.ts`**

Change `attackDamage` to use per-type maxHp. Update the import:

```ts
import { UNIT_TYPES, Unit } from './units';
```

```ts
export function attackDamage(attacker: Unit): number {
  return Math.round((attacker.attack * attacker.hp) / UNIT_TYPES[attacker.type].maxHp);
}
```

- [ ] **Step 6: Update unit literals in existing tests**

Add `spawnVillage: null` to every `Unit` literal in `tests/selection.test.ts` (two literals), `tests/ai.test.ts` (`makeWarrior`), and `tests/combat.test.ts` (`makeWarrior`).

In `tests/combat.test.ts`, update `makeWarrior` and the import:

```ts
import { Unit, UNIT_TYPES } from '../src/game/units';
```

```ts
function makeWarrior(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hp, attack: 2, attackDistance: 1, spawnVillage: null };
}
```

Note: the `attackDamage` tests use hp values 5/3/1 — with per-type maxHp=5 for warrior, results stay 2/1/0, so no assertion changes.

In `tests/ai.test.ts`, update `makeWarrior`:

```ts
function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: null };
}
```

In `tests/selection.test.ts`, add `spawnVillage: null` to both literals.

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/game/units.ts src/game/mapGen.ts src/game/combat.ts tests/units.test.ts tests/combat.test.ts tests/selection.test.ts tests/ai.test.ts tests/mapGen.test.ts
git commit -m "feat: add unit type table with per-type stats"
```

---

### Task 2: Village capacity + spawn logic

**Files:**
- Create: `src/game/spawn.ts`
- Modify: `src/game/village.ts`
- Test: `tests/spawn.test.ts` (new)

**Interfaces:**
- Consumes: `units.ts` (`UnitType`, `UNIT_TYPES`), `mapGen.ts` (`GameMap`, `MapTile`), `players.ts` (`Player`).
- Produces (used by Tasks 3-5):
  - `villageCapacity(level: number): number`
  - `unitsInVillage(map: GameMap, villageTile: MapTile): number`
  - `spawnUnit(map: GameMap, villageTile: MapTile, type: UnitType, player: Player): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/spawn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { Player } from '../src/game/players';
import { UNIT_TYPES } from '../src/game/units';
import { TileType } from '../src/game/tileTypes';
import { villageCapacity, unitsInVillage } from '../src/game/village';
import { spawnUnit } from '../src/game/spawn';

function makeTile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: MapTile['unit'] = null,
): MapTile {
  return { q, r, terrain: TileType.Land, settlement, unit, ownedBy: settlement ? settlement.owner : null };
}

function makeVillageTile(q: number, r: number, owner: number, level: number): MapTile {
  return makeTile(q, r, { owner, level });
}

function makePlayer(index: number, money: number): Player {
  return { index, tribe: 0, isHuman: index === 0, name: `p${index}`, resources: { wood: 5, stone: 5, money } };
}

function makeMap(): GameMap {
  return { radius: 4, tiles: [makeVillageTile(0, 0, 0, 1)], spawns: [] };
}

describe('villageCapacity', () => {
  it('is 1 + level', () => {
    expect(villageCapacity(1)).toBe(2);
    expect(villageCapacity(2)).toBe(3);
  });
});

describe('unitsInVillage', () => {
  it('counts units by spawn village', () => {
    const map = makeMap();
    const village = map.tiles[0];
    village.unit = { id: 'u1', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const away = makeTile(1, 0);
    away.unit = { id: 'u2', owner: 0, type: 'warrior', q: 1, r: 0, hasMoved: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away);
    expect(unitsInVillage(map, village)).toBe(2);
  });
});

describe('spawnUnit', () => {
  it('spawns on an empty village tile and deducts money', () => {
    const map = makeMap();
    const village = map.tiles[0];
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(true);
    expect(village.unit).not.toBeNull();
    expect(village.unit!.spawnVillage).toEqual({ q: 0, r: 0 });
    expect(player.resources.money).toBe(8);
  });

  it('rejects when the tile is occupied', () => {
    const map = makeMap();
    const village = map.tiles[0];
    village.unit = { id: 'x', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(false);
  });

  it('rejects when at capacity', () => {
    const map = makeMap();
    const village = map.tiles[0];
    village.unit = { id: 'a', owner: 0, type: 'warrior', q: 0, r: 0, hasMoved: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    const away = makeTile(1, 0);
    away.unit = { id: 'b', owner: 0, type: 'warrior', q: 1, r: 0, hasMoved: false, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(away);
    const player = makePlayer(0, 10);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(false);
  });

  it('rejects when money is insufficient', () => {
    const map = makeMap();
    const village = map.tiles[0];
    const player = makePlayer(0, 1);
    expect(spawnUnit(map, village, 'warrior', player)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `spawn.ts` not found; `villageCapacity`/`unitsInVillage` not exported.

- [ ] **Step 3: Add `villageCapacity` and `unitsInVillage` to `src/game/village.ts`**

Append to `src/game/village.ts`:

```ts
export function villageCapacity(level: number): number {
  return 1 + level;
}

export function unitsInVillage(map: GameMap, villageTile: MapTile): number {
  const villageKey = `${villageTile.q},${villageTile.r}`;
  let count = 0;
  for (const t of map.tiles) {
    if (!t.unit) continue;
    const sv = t.unit.spawnVillage;
    if (sv && `${sv.q},${sv.r}` === villageKey) count++;
  }
  return count;
}
```

- [ ] **Step 4: Create `src/game/spawn.ts`**

```ts
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { UNIT_TYPES, UnitType } from './units';
import { villageCapacity, unitsInVillage } from './village';

export function spawnUnit(
  map: GameMap,
  villageTile: MapTile,
  type: UnitType,
  player: Player,
): boolean {
  const settlement = villageTile.settlement;
  if (!settlement || settlement.owner !== player.index) return false;
  if (villageTile.unit) return false;
  if (unitsInVillage(map, villageTile) >= villageCapacity(settlement.level)) return false;
  const price = UNIT_TYPES[type].price;
  if (player.resources.money < price) return false;

  player.resources.money -= price;
  villageTile.unit = {
    id: `spawn-${Date.now()}`,
    owner: player.index,
    type,
    q: villageTile.q,
    r: villageTile.r,
    hasMoved: false,
    hp: UNIT_TYPES[type].maxHp,
    attack: UNIT_TYPES[type].attack,
    attackDistance: UNIT_TYPES[type].attackDistance,
    spawnVillage: { q: villageTile.q, r: villageTile.r },
  };
  return true;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/spawn.ts src/game/village.ts tests/spawn.test.ts
git commit -m "feat: add village capacity and unit spawning"
```

---

### Task 3: Unit shapes + capacity label rendering

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts`
- Test: typecheck + tests + manual screenshot.

**Interfaces:**
- Consumes: `units.ts` (`UnitType`, `UNIT_TYPES`), `village.ts` (`villageCapacity`, `unitsInVillage`).
- Produces: `TextureSet.unitTextures: Record<Tribe, Record<UnitType, Texture>>`; renderer draws shapes and capacity labels.

- [ ] **Step 1: Update `src/render/textureFactory.ts`**

Replace `makeUnitTexture` with a shape-aware version:

```ts
import { UnitType, UNIT_TYPES } from '../game/units';
```

```ts
export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  villageTextures: Record<Tribe, Texture>;
  freeVillageTexture: Texture;
  unitTextures: Record<Tribe, Record<UnitType, Texture>>;
  glowTextures: GlowTextures;
}
```

```ts
function makeUnitTexture(
  app: Application,
  color: number,
  shape: 'circle' | 'square' | 'triangle',
  hexSize: number,
): Texture {
  const g = new Graphics();
  const r = hexSize * 0.2;
  if (shape === 'square') {
    g.rect(-r, -r, r * 2, r * 2).fill(color).stroke({ width: 3, color: 0x000000 });
  } else if (shape === 'triangle') {
    g.poly([0, -r, r, r, -r, r]).fill(color).stroke({ width: 3, color: 0x000000 });
  } else {
    g.circle(0, 0, r).fill(color).stroke({ width: 3, color: 0x000000 });
  }
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

Update `createTextures`:

```ts
  const unitTextures = {} as Record<Tribe, Record<UnitType, Texture>>;
  for (const tribe of TRIBES) {
    unitTextures[tribe.id] = {} as Record<UnitType, Texture>;
    for (const type of Object.keys(UNIT_TYPES) as UnitType[]) {
      unitTextures[tribe.id][type] = makeUnitTexture(app, tribe.color, UNIT_TYPES[type].shape, hexSize);
    }
  }
```

- [ ] **Step 2: Update `src/render/mapRenderer.ts`**

Add imports:

```ts
import { UNIT_TYPES, Unit } from '../game/units';
import { villageCapacity, unitsInVillage } from '../game/village';
```

Update the unit-sprite block to use the nested texture lookup, and draw the capacity label below the village circle:

```ts
    if (tile.unit) {
      const unitSprite = new Sprite(textures.unitTextures[players[tile.unit.owner].tribe][tile.unit.type]);
      unitSprite.anchor.set(0.5);
      unitSprite.position.set(p.x, p.y);
      container.addChild(unitSprite);
      addHpBar(container, tile.unit, p, hexSize);
    }
```

Add the capacity label after the village-sprite block (below the circle):

```ts
    if (tile.settlement && tile.settlement.owner !== null) {
      const capacity = villageCapacity(tile.settlement.level);
      const count = unitsInVillage(map, tile);
      const label = new Text({
        text: `${count}/${capacity}`,
        style: { fontSize: 10, fill: 0xffffff },
      });
      label.anchor.set(0.5, 0);
      label.position.set(p.x, p.y + hexSize * 0.35);
      container.addChild(label);
    }
```

Update the ghost sprite lookup (in the reachable ghost block) to the nested texture using the selected unit's type. Replace the ghost block with:

```ts
    if (reachableKeys.has(key) && selection && selection.kind === 'unit') {
      const selectedTile = tileAt(map, selection.q, selection.r)!;
      const selectedUnit = selectedTile.unit!;
      const ownerTribe = players[selectedUnit.owner].tribe;
      const ghost = new Sprite(textures.unitTextures[ownerTribe][selectedUnit.type]);
      ghost.anchor.set(0.5);
      ghost.alpha = 0.5;
      ghost.position.set(p.x, p.y);
      container.addChild(ghost);
    }
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual screenshot**

Run the dev server + Chrome; confirm unit shapes (circle warrior, square rider, triangle archer after spawning in later tasks) and the `count/capacity` label under villages. Kill the server.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: render unit shapes and village capacity label"
```

---

### Task 4: Toolbar + spawn dialog + controller spawn + store

**Files:**
- Create: `src/screens/hud/ActionToolbar.tsx`, `src/ui/SpawnDialog.tsx`
- Modify: `src/store/gameStore.ts`, `src/screens/GameScreen.tsx`, `src/controller/gameController.ts`
- Test: `tests/gameStore.test.ts` (spawnDialogOpen), manual.

**Interfaces:**
- Consumes: `spawn.ts` (`spawnUnit`), `village.ts` (`villageCapacity`, `unitsInVillage`), `units.ts` (`UNIT_TYPES`, `UNIT_TYPE_NAMES`), store.
- Produces: `store.spawnDialogOpen`, `store.setSpawnDialogOpen`; `gameController.spawnSelectedVillage(type)`; toolbar + dialog UI.

- [ ] **Step 1: Add `spawnDialogOpen` to the store + test**

Add to `tests/gameStore.test.ts`:

```ts
  it('setSpawnDialogOpen updates spawnDialogOpen', () => {
    useGameStore.getState().setSpawnDialogOpen(true);
    expect(useGameStore.getState().spawnDialogOpen).toBe(true);
    useGameStore.getState().setSpawnDialogOpen(false);
    expect(useGameStore.getState().spawnDialogOpen).toBe(false);
  });
```

Add `spawnDialogOpen: false` to the `beforeEach` reset and to the store state.

Add to the `GameStore` interface:

```ts
  spawnDialogOpen: boolean;
  setSpawnDialogOpen: (open: boolean) => void;
```

and implementation `setSpawnDialogOpen: (open) => set({ spawnDialogOpen: open })`.

- [ ] **Step 2: Add controller spawn + upgrade methods**

Add imports to `gameController.ts`:

```ts
import { spawnUnit } from '../game/spawn';
import { villageCapacity, unitsInVillage } from '../game/village';
import { UNIT_TYPES, UnitType, UNIT_TYPE_NAMES } from '../game/units';
```

Add methods (after `upgradeSelectedVillage`):

```ts
  spawnSelectedVillage(type: UnitType): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'village') return;
    const village = tileAt(this.map, selection.q, selection.r)!;
    const players = store.players;
    const player = players[0];
    if (village.settlement?.owner !== 0) return;
    if (spawnUnit(this.map, village, type, player)) {
      store.setPlayers([...players]);
      store.setSpawnDialogOpen(false);
      showPopup(`${player.name} spawns ${UNIT_TYPE_NAMES[type]}`, { background: tribeBackground(player) });
      this.render();
    }
  }

  upgradeSelectedVillageFromToolbar(): void {
    this.upgradeSelectedVillage();
  }
```

- [ ] **Step 3: Create `src/screens/hud/ActionToolbar.tsx`**

```tsx
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { villageCapacity, unitsInVillage } from '../../game/village';
import { tileAt } from '../../game/selection';
import { canAfford, UPGRADE_COST } from '../../game/resources';
import { UNIT_TYPES } from '../../game/units';

export function ActionToolbar(): React.ReactElement {
  const selection = useGameStore((s) => s.selection);
  const players = useGameStore((s) => s.players);
  const setSpawnDialogOpen = useGameStore((s) => s.setSpawnDialogOpen);

  if (!selection || selection.kind !== 'village') return <div id="action-toolbar" />;
  const map = gameController.getMap();
  if (!map) return <div id="action-toolbar" />;
  const village = tileAt(map, selection.q, selection.r);
  if (!village || !village.settlement || village.settlement.owner !== 0) {
    return <div id="action-toolbar" />;
  }

  const capacity = villageCapacity(village.settlement.level);
  const count = unitsInVillage(map, village);
  const minPrice = Math.min(...Object.values(UNIT_TYPES).map((t) => t.price));
  const spawnDisabled = count >= capacity || players[0].resources.money < minPrice;
  const upgradeDisabled = !canAfford(players[0].resources, UPGRADE_COST);

  return (
    <div id="action-toolbar">
      <button disabled={spawnDisabled} onClick={() => setSpawnDialogOpen(true)}>
        Spawn a unit
      </button>
      <button disabled={upgradeDisabled} onClick={() => gameController.upgradeSelectedVillageFromToolbar()}>
        Upgrade village
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/ui/SpawnDialog.tsx`**

```tsx
import { gameController } from '../controller/gameController';
import { useGameStore } from '../store/gameStore';
import { villageCapacity, unitsInVillage } from '../game/village';
import { tileAt } from '../game/selection';
import { UNIT_TYPES, UNIT_TYPE_NAMES, UnitType } from '../game/units';

export function SpawnDialog(): React.ReactElement {
  const open = useGameStore((s) => s.spawnDialogOpen);
  const setOpen = useGameStore((s) => s.setSpawnDialogOpen);
  const players = useGameStore((s) => s.players);
  const selection = useGameStore((s) => s.selection);

  if (!open) return <></>;
  const map = gameController.getMap();
  if (!map || !selection || selection.kind !== 'village') return <></>;
  const village = tileAt(map, selection.q, selection.r);
  if (!village || !village.settlement) return <></>;

  const capacity = villageCapacity(village.settlement.level);
  const count = unitsInVillage(map, village);
  const full = count >= capacity;
  const money = players[0].resources.money;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 30,
      }}
    >
      <div style={{ background: '#000', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>Spawn a unit ({count}/{capacity})</div>
        {(Object.keys(UNIT_TYPES) as UnitType[]).map((type) => (
          <button
            key={type}
            disabled={full || money < UNIT_TYPES[type].price}
            onClick={() => gameController.spawnSelectedVillage(type)}
          >
            {UNIT_TYPE_NAMES[type]} — {UNIT_TYPES[type].price}
          </button>
        ))}
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Render toolbar + dialog in `GameScreen.tsx`**

Add imports and elements:

```tsx
import { ActionToolbar } from './hud/ActionToolbar';
import { SpawnDialog } from '../ui/SpawnDialog';
```

```tsx
      <EndTurnButton />
      <ActionToolbar />
      <PopupStack />
      <ConfirmDialog />
      <SpawnDialog />
```

- [ ] **Step 6: Add CSS for `#action-toolbar` in `index.html`**

Add after the `#end-turn-btn` rule:

```css
    #action-toolbar { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
```

- [ ] **Step 7: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Manual verification**

Run the dev server + Chrome. Start a game; select the human's village; verify the toolbar shows Spawn + Upgrade; spawn a warrior (money decreases, unit appears on village, popup); open spawn dialog with insufficient money → disabled; verify capacity label updates. Kill the server.

- [ ] **Step 9: Commit**

```bash
git add src/screens/hud/ActionToolbar.tsx src/ui/SpawnDialog.tsx src/store/gameStore.ts src/screens/GameScreen.tsx src/controller/gameController.ts tests/gameStore.test.ts index.html
git commit -m "feat: add action toolbar and unit spawn dialog"
```

---

### Task 5: Round-end income + animated money indicator

**Files:**
- Create: `src/screens/hud/MoneyInfo.tsx`
- Modify: `src/controller/gameController.ts`, `src/screens/GameScreen.tsx`
- Test: manual.

**Interfaces:**
- Consumes: store `players`, `turn`, `currentPlayerIndex`.
- Produces: `applyRoundIncome(players, map): Player[]`; `MoneyInfo` animated display.

- [ ] **Step 1: Add round-end income to `gameController.runAiPhase`**

At the end of `runAiPhase`, after `store.setTurn(store.turn + 1)`, apply income to all players. Replace the block:

```ts
    store.setCurrentPlayerIndex(0);
    store.setTurn(store.turn + 1);
    for (const t of this.map.tiles) {
      if (t.unit) t.unit.hasMoved = false;
    }
    store.setAiActive(false);
```

with:

```ts
    store.setCurrentPlayerIndex(0);
    store.setTurn(store.turn + 1);
    for (const t of this.map.tiles) {
      if (t.unit) t.unit.hasMoved = false;
    }
    for (const player of players) {
      let income = 0;
      for (const t of this.map.tiles) {
        if (t.settlement && t.settlement.owner === player.index) {
          income += 3 + t.settlement.level;
        }
      }
      player.resources.money += income;
    }
    store.setPlayers([...players]);
    store.setAiActive(false);
```

- [ ] **Step 2: Create `src/screens/hud/MoneyInfo.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';

const STEP_MS = 80;

export function MoneyInfo(): React.ReactElement {
  const money = useGameStore((s) => s.players[s.currentPlayerIndex]?.resources.money ?? 0);
  const [display, setDisplay] = useState(money);
  const [bounce, setBounce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let current = display;
    const step = (): void => {
      if (cancelled) return;
      if (current < money) {
        current += 1;
        setDisplay(current);
        setBounce((b) => b + 1);
        setTimeout(step, STEP_MS);
      } else if (current > money) {
        current -= 1;
        setDisplay(current);
        setBounce((b) => b + 1);
        setTimeout(step, STEP_MS);
      }
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [money]);

  return (
    <div id="money-info">
      <span className={bounce > 0 ? 'money-bounce' : ''}>⭐ {display}</span>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS in `index.html`**

After the `#turn-info` rule:

```css
    #money-info { position: absolute; top: 44px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); padding: 4px 12px; border-radius: 4px; }
    .money-bounce { display: inline-block; animation: moneyPop 0.3s ease; }
    @keyframes moneyPop { 0% { transform: scale(1); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
```

Note: `#turn-info` is at `top: 8px`; `#money-info` at `top: 44px` sits directly below it.

- [ ] **Step 4: Render `MoneyInfo` in `GameScreen.tsx`**

```tsx
import { MoneyInfo } from './hud/MoneyInfo';
```

```tsx
      <TurnInfo />
      <MoneyInfo />
```

- [ ] **Step 5: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run the dev server + Chrome. Start a game; verify `⭐ {money}` shows under the turn info; click End turn; after the AI phase the money increases by `3 + level` per owned village and the counter animates up. Kill the server.

- [ ] **Step 7: Commit**

```bash
git add src/screens/hud/MoneyInfo.tsx src/controller/gameController.ts src/screens/GameScreen.tsx index.html
git commit -m "feat: add round income and animated money indicator"
```

---

### Task 6: AI spawning

**Files:**
- Modify: `src/game/ai.ts`
- Modify: `src/controller/gameController.ts`
- Test: `tests/ai.test.ts` (add tests)

**Interfaces:**
- Consumes: `spawn.ts` (`spawnUnit`), `village.ts` (`villageCapacity`, `unitsInVillage`), `units.ts` (`UNIT_TYPES`), `resources.ts` (`pay`).
- Produces: `AiAction` gains `{ type: 'spawn'; q; r; unitType: UnitType }`; controller executes spawns.

- [ ] **Step 1: Add failing tests to `tests/ai.test.ts`**

```ts
  it('plans a spawn when affordable, has capacity, and an empty tile', () => {
    const map = makeAiMap();
    const actions = planAiActions(map, 1, new SeededRandom(1));
    const spawn = actions.find((a) => a.type === 'spawn');
    expect(spawn).toBeDefined();
  });

  it('does not plan a spawn when the village tile is occupied and no spare capacity', () => {
    const map = makeAiMap();
    // warrior sits on (0,0); capacity 2 at level 1; spawn one more linked unit to fill it
    map.tiles[0].unit!.spawnVillage = { q: 0, r: 0 };
    const away = makeTile(1, 0, null, null, makeWarrior('w2', 1, 1, 0));
    away.unit!.spawnVillage = { q: 0, r: 0 };
    map.tiles.push(away);
    const actions = planAiActions(map, 1, new SeededRandom(999));
    const spawn = actions.find((a) => a.type === 'spawn');
    expect(spawn).toBeUndefined();
  });
```

Note: `planAiActions` needs access to player money to decide spawn affordability. Since the map doesn't hold players, the plan must accept the AI player's money. Adjust the test to pass a money amount: the plan signature gains `aiMoney: number` (see Step 3). Update the existing `planAiActions` call sites in `tests/ai.test.ts` and `gameController.ts` to pass the player's money.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no `spawn` action; signature mismatch.

- [ ] **Step 3: Update `src/game/ai.ts`**

Add `aiMoney: number` to `planAiActions(map, playerIndex, aiMoney, rng)`. Import `spawnUnit`? No — the planner only *plans*; it checks capacity/affordability but does not mutate. Add the spawn planning in the villages loop:

```ts
import { villageCapacity, unitsInVillage } from './village';
import { UNIT_TYPES, UnitType } from './units';
```

```ts
export type AiAction =
  | { type: 'upgrade'; q: number; r: number }
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number }
  | { type: 'spawn'; q: number; r: number; unitType: UnitType };

export function planAiActions(
  map: GameMap,
  playerIndex: number,
  aiMoney: number,
  rng: SeededRandom,
): AiAction[] {
  const actions: AiAction[] = [];

  const villages = map.tiles.filter(
    (t) => t.settlement && t.settlement.owner === playerIndex,
  );

  for (const tile of villages) {
    if (rng.next() > 0.8) continue;
    actions.push({ type: 'upgrade', q: tile.q, r: tile.r });
    if (rng.next() <= 0.5 && !tile.unit && unitsInVillage(map, tile) < villageCapacity(tile.settlement!.level)) {
      const affordable = Object.keys(UNIT_TYPES).filter(
        (k) => UNIT_TYPES[k as UnitType].price <= aiMoney,
      ) as UnitType[];
      if (affordable.length > 0) {
        const unitType = affordable[Math.floor(rng.next() * affordable.length)];
        actions.push({ type: 'spawn', q: tile.q, r: tile.r, unitType });
      }
    }
  }

  const units = map.tiles
    .map((t) => t.unit)
    .filter((u): u is Unit => u !== null && u.owner === playerIndex && !u.hasMoved);

  for (const unit of units) {
    const attacks = attackableTargets(map, unit);
    if (attacks.length > 0) {
      const target = attacks[Math.floor(rng.next() * attacks.length)];
      actions.push({ type: 'attack', unitId: unit.id, q: target.q, r: target.r });
      continue;
    }
    if (rng.next() > 0.9) continue;
    const target = greedyMoveTarget(map, unit);
    if (target) {
      actions.push({ type: 'move', unitId: unit.id, q: target.q, r: target.r });
    }
  }

  return actions;
}
```

- [ ] **Step 4: Update call sites for the new `aiMoney` parameter**

In `tests/ai.test.ts`, add `100` as the money argument to every `planAiActions(...)` call (e.g. `planAiActions(map, 1, 100, new SeededRandom(1))`).

In `gameController.ts` `runAiPhase`, change the plan call:

```ts
      const actions = planAiActions(this.map, ai.index, ai.resources.money, new SeededRandom(Math.floor(Math.random() * 100000)));
```

- [ ] **Step 5: Execute spawn actions in `gameController.runAiPhase`**

Add a spawn branch to the action loop:

```ts
        } else if (action.type === 'spawn') {
          const village = tileAt(this.map, action.q, action.r)!;
          if (spawnUnit(this.map, village, action.unitType, ai)) {
            showPopup(`${ai.name} spawns ${UNIT_TYPE_NAMES[action.unitType]}`, { background: tribeBackground(ai) });
          }
        }
```

Add the `spawnUnit`/`UNIT_TYPE_NAMES` imports to `gameController.ts` if not already present.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run the dev server + Chrome; start a game with 1 enemy; watch the AI phase — the AI may spawn a unit (square/triangle shape appears) when affordable and it has capacity + empty tile.

- [ ] **Step 8: Commit**

```bash
git add src/game/ai.ts src/controller/gameController.ts tests/ai.test.ts
git commit -m "feat: ai spawns units when affordable"
```

---

## Self-Review Notes

- **Spec coverage:** per-type stats + spawnVillage + per-type HP — Task 1; capacity + spawn — Task 2; shapes + capacity label — Task 3; toolbar + dialog + controller spawn — Task 4; income + animated money — Task 5; AI spawn — Task 6. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `spawnVillage`, `villageCapacity`, `unitsInVillage`, `spawnUnit`, `spawnDialogOpen`, `spawnSelectedVillage`, `AiAction.spawn`, `UNIT_TYPES` names consistent across tasks. `planAiActions` signature change coordinated between Task 6 and existing call sites.
- **Coordinated changes:** Task 3's `TextureSet.unitTextures` nested shape (call sites updated in Task 4's renderer block and Task 1's ghost fix); Task 6's `planAiActions` signature change touches `tests/ai.test.ts` and `gameController.ts`. Typecheck is verified green at the end of each task.
- **Known edge:** `spawnUnit` uses `Date.now()` for unit ids, so two spawns in the same millisecond could collide — acceptable for this version (noted, not fixed).
- **Signature change:** Task 6 adds `aiMoney` to `planAiActions(map, playerIndex, aiMoney, rng)` — all existing call sites (tests + controller) are updated in the same task.
