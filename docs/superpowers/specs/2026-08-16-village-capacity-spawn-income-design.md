# Design: Village capacity, unit spawning, money income

Date: 2026-08-16

## Goal

Add village capacity (units in a village), unit spawning with new unit types (rider, archer), a bottom-center action toolbar, round-end money income for all players, an animated money indicator under the turn info, and a capacity indicator below village circles. AI can also spawn units.

## Unit types (`src/game/units.ts`)

- `UnitType = 'warrior' | 'rider' | 'archer'`.
- New `UNIT_TYPES` table:

```ts
interface UnitTypeInfo {
  movement: number;
  attack: number;
  attackDistance: number;
  maxHp: number;
  price: number;
  shape: 'circle' | 'square' | 'triangle';
}

warrior: { movement: 1, attack: 2, attackDistance: 1, maxHp: 5, price: 2, shape: 'circle' }
rider:   { movement: 3, attack: 1, attackDistance: 1, maxHp: 4, price: 3, shape: 'square' }
archer:  { movement: 1, attack: 1, attackDistance: 3, maxHp: 3, price: 3, shape: 'triangle' }
```

- `UNIT_MOVEMENT`, `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE`, `MAX_HP` are derived from `UNIT_TYPES` so existing imports (`UNIT_MOVEMENT[unit.type]`, `MAX_HP`, `attackDamage`) keep working. `MAX_HP` is the warrior's value (5) for backward compatibility, but new units use per-type `maxHp`.
- `attackDamage(unit)` uses `UNIT_TYPES[unit.type].maxHp` as the denominator (per-type HP scaling), not the global `MAX_HP`.
- `Unit` gains `spawnVillage: { q: number; r: number } | null` — the village that spawned it. Starting units link to their own village.
- `Unit` uses per-type `maxHp` at creation instead of a global `MAX_HP` (mapGen and spawn set `hp: UNIT_TYPES[type].maxHp`).
- `UNIT_TYPE_NAMES`: warrior → `Warrior`, rider → `Rider`, archer → `Archer`.

## Village capacity & spawning (`src/game/village.ts` + `src/game/spawn.ts`)

- `villageCapacity(level) = 1 + level`.
- `unitsInVillage(map, villageTile)`: count units whose `spawnVillage` matches this village (regardless of current tile).
- `spawnUnit(map, villageTile, type, playerIndex)` (in `spawn.ts`):
  - Guards: village owned by `playerIndex`, village tile empty of a unit, `unitsInVillage < capacity`, player can afford `UNIT_TYPES[type].price` money.
  - Deducts `price` money from the player's resources; sets `tile.unit` with `spawnVillage` set to the village's coords.
  - Returns boolean success.

## Round-end money income

- When the AI phase completes (after `turn++`), for every player: for each village owned by that player, add `3 + village.level` money. Applies to all players at the same time.
- Store `setPlayers` persists updated resources.

## Toolbar (`src/screens/hud/ActionToolbar.tsx`, new)

- Bottom-center toolbar; content depends on selection:
  - Village selected → **Spawn a unit** button (opens dialog) + **Upgrade village** button.
  - Spawn disabled when `unitsInVillage >= capacity` or the human can't afford any unit.
  - Upgrade reuses the existing upgrade logic (same as the SelectedInfo card).
- Other selections → toolbar empty.

## Spawn dialog (`src/ui/SpawnDialog.tsx`, new)

- Lists unit types with name + price (`⭐N`).
- Each row disabled when the human's money < price or the selected village is at capacity.
- Clicking a row calls `gameController.spawnSelectedVillage(type)`; on success money is deducted, unit placed on the village tile, popup, dialog closes.
- Store gains `spawnDialogOpen: boolean` + `setSpawnDialogOpen`.

## Money indicator (`src/screens/hud/MoneyInfo.tsx`, new)

- Below `#turn-info`, centered: `⭐ {currentPlayer.money}`.
- On money change: animate the displayed value counting up/down by 1 with a small delay (~80ms per step), with a CSS bounce animation on each tick.

## Capacity indicator (renderer)

- `mapRenderer` draws, below the village circle, a `Text` label `{unitsInVillage}/{capacity}` (uses map + spawn links).

## AI spawning (`src/game/ai.ts` + controller)

- For each owned village, with probability 0.5: if the village has an empty tile and `unitsInVillage < capacity`, spawn a random affordable unit.
- `AiAction` gains `{ type: 'spawn'; q; r; unitType: UnitType }`.
- Controller executes spawn actions via `spawnUnit` with the same 300ms pacing and a popup (`{name} spawns {UnitName}`).

## Rendering unit shapes

- `textureFactory.makeUnitTexture` draws by shape: circle (as now), square, triangle.
- `TextureSet.unitTextures` becomes `Record<Tribe, Record<UnitType, Texture>>`; renderer picks by owner tribe + unit type.

## Tests

- `units`: per-type data correct.
- `spawn`: capacity guards, empty-tile guard, money deduction, spawn link set.
- `ai`: spawn action emitted with probability 0.5 when affordable/capacity available; skipped otherwise.
- `village`: `villageCapacity`, `unitsInVillage`.
- Manual: spawn flow, capacity indicator, income, money animation, AI spawns.
