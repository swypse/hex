# Design: More water, ships & navigation, skill-tree resources

Date: 2026-08-18

## Goal

Increase map water to ~20%, add a ship system (units become ships via ports + the navigation skill, with 3 upgradeable levels), and show the player's resources on the skill-tree screen.

## Design decisions (confirmed with user)

1. **Water**: water threshold percentile `0.15 → 0.20` (~20% water).
2. **Ship ability**: gained when a unit **moves onto a port cell** and its owner has the **navigation** skill opened → ship level 1.
3. **Ship upgrades** are like village upgrades: select the ship → "Upgrade ship" button; costs 8 money + 2 wood (1→2) and 12 money + 4 wood (2→3); the upgrade does **not** consume the unit's move/attack.
4. **Ship stats**: movement `{1:2, 2:3, 3:4}`; lvl 2 attack 2 at distance 3; lvl 3 attack 4 at distance 5; lvl 1 keeps the unit's base melee attack.
5. **Revert**: a ship moving onto a non-water tile asks for confirmation; on confirm the unit moves there and reverts to its normal unit (ship data deleted).
6. Ships render as a bottom-up triangle; lvl 3 adds a horizontal line above the triangle.
7. Skill-tree screen shows the player's resources (money/wood/stone/ore).

## Data model

- `Unit.shipLevel?: 1 | 2 | 3` (absent = not a ship). Added to the `Unit` interface; mapGen/spawn unit construction leave it unset.

## Ship module (`src/game/ship.ts`, new, pure)

```ts
export const SHIP_MOVEMENT: Record<1 | 2 | 3, number> = { 1: 2, 2: 3, 3: 4 };
export const SHIP_ATTACK: Record<2 | 3, number> = { 2: 2, 3: 4 };
export const SHIP_ATTACK_DISTANCE: Record<2 | 3, number> = { 2: 3, 3: 5 };
export const SHIP_UPGRADE_COST: Record<2 | 3, { money: number; wood: number }> = {
  2: { money: 8, wood: 2 },
  3: { money: 12, wood: 4 },
};

isShip(unit: Unit): boolean
shipMovement(unit: Unit): number                       // SHIP_MOVEMENT[shipLevel]
shipAttack(unit: Unit): number                         // lvl 1 → unit.attack; else SHIP_ATTACK[level]
shipAttackDistance(unit: Unit): number                 // lvl 1 → unit.attackDistance; else SHIP_ATTACK_DISTANCE[level]
canUpgradeShip(unit: Unit, player: Player): boolean    // ship, level < 3, canAfford cost
upgradeShip(unit: Unit, player: Player): boolean       // pay + level++ (does not set hasMoved/Attacked)
gainShipAbility(unit: Unit): void                      // unit.shipLevel = 1
revertShip(unit: Unit): void                           // delete shipLevel
```

## Movement & combat

- `moveRange(unit)` (units.ts): returns `shipMovement(unit)` for ships, else the normal rider-adjusted value.
- `reachableTargets` (selection.ts): **water is passable** when `isShip(unit)`; land stays reachable for ships (the revert move). Ships use the passed `range` (= `moveRange`).
- `pathBetween` (selection.ts): gains a `canSail = false` param; water passable when `canSail`. `animateUnitMove` passes `isShip(unit)`.
- `attackableTargets` / `attackDamage` (combat.ts): use `shipAttackDistance` / `shipAttack` for ships.

## Rendering (`textureFactory.ts`, `mapRenderer.ts`)

- New per-tribe ship textures: `shipTextures: Record<Tribe, { base: Texture; level3: Texture }>`.
  - `base`: bottom-up triangle (apex up) in the tribe color with a dark outline.
  - `level3`: same triangle with a horizontal line above it.
- `mapRenderer`: when `unit.shipLevel` is set, draw the ship texture (level 3 → `level3`, else `base`) instead of the unit-type texture. HP bars/labels unchanged.

## Controller / UI

- **Gain**: in `animateUnitMove`, after a move completes, if the destination tile has a port and `hasSkill(owner, 'navigation')` → `gainShipAbility(unit)` (before final render).
- **Landing confirm**: `handleMapClick` — a selected **ship** clicking a non-water reachable tile sets `store.pendingShipLanding = { q, r }` (instead of moving). A dialog asks "Land and become X again?" with Confirm/Cancel:
  - `confirmShipLanding()` → `animateUnitMove` to the tile, then `revertShip(unit)`; clear pending.
  - `cancelShipLanding()` → clear pending.
- **Upgrade**: `ActionToolbar` shows "Upgrade ship (8 money + 2 wood)" / "(12 money + 4 wood)" when a ship is selected, affordable, and below level 3; calls `gameController.upgradeSelectedShip()` which pays + `upgradeShip` + re-render.
- **Store**: `pendingShipLanding: { q: number; r: number } | null` + setter.
- **Skill tree**: `SkillTreeScreen` shows a resources panel (money, wood, stone, ore) at the top.

## Files touched

- `src/game/biomes.ts` (water 0.20), `tests/biomes.test.ts`, `tests/mapGen.test.ts` (water-ratio bounds).
- `src/game/units.ts` (`Unit.shipLevel?`, `moveRange`), `src/game/ship.ts` (new).
- `src/game/selection.ts` (ship water passability), `src/game/combat.ts` (ship attack).
- `src/render/textureFactory.ts`, `src/render/mapRenderer.ts` (ship textures).
- `src/controller/gameController.ts` (gain, landing confirm, upgrade), `src/store/gameStore.ts` (`pendingShipLanding`).
- `src/screens/hud/ActionToolbar.tsx` (Upgrade ship), `src/ui/ConfirmDialog.tsx` or a new landing dialog.
- `src/screens/SkillTreeScreen.tsx` (resources panel).
- `tests/ship.test.ts` (new), plus selection/combat/biomes/mapGen test updates.

## Testing

- `ship.test.ts`: movement/attack/distance per level, upgrade costs + no-action-block, gain/revert.
- `selection.test.ts`: ships move on water; land moves revert.
- `combat.test.ts`: lvl 2/3 ship ranged attacks.
- `biomes.test.ts` / `mapGen.test.ts`: ~20% water.
- Existing suite, `npm run typecheck`, `npm run build` stay green.
- Manual via `npm run dev`: port move grants a ship; upgrade works without blocking; landing asks confirmation and reverts; level 3 shows the line; skill-tree shows resources.

## Out of scope

- AI-specific ship strategy (AI benefits from ships only when it happens to move onto a port).
- Water combat balance tuning beyond the specified stats.
