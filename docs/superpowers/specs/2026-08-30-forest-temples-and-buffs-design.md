# Forest Temples + Temple Buffs

## Overview

Add **Forest temples** (a new building kind built on forest cells, costing and growing like
water temples) and two player buffs earned by owning temples: **Water Protection** (3 water
temples) reduces damage to the player's ship units by 1; **Forest Protection** (3 forest
temples) reduces damage to the player's units standing on any forest cell by 1. Buffs are
shown as small square icons below the score circle, each with a tooltip.

## Changes

### 1. Forest temple building (`'forestTemple'` kind)

- `BuildingKind` gains `'forestTemple'` (`src/game/events.ts`, the `Building` interface in
  `src/game/mapGen.ts`, and the AI build action union in `src/game/aiTypes.ts`).
- `src/game/buildings.ts`:
  - `BUILDING_NAMES.forestTemple = 'Forest temple'`.
  - `BUILDING_COSTS.forestTemple = { wood: 0, stone: 10, money: 30, ore: 0 }` (same as water
    temple).
  - `canBuildForestTemple(map, tile, player)`: requires the `forestTemple` skill, an owned
    tile, no settlement/building, and `isForestType(tile.terrain)`.
  - `buildBuilding` dispatches the new kind.
- `src/game/ai.ts`: add a forest-temple build candidate (same scoring as the water temple).
- `src/game/score.ts`: `boardScore` excludes both temple kinds from `BUILDING_SCORE`;
  `awardTempleScores` awards `TEMPLE_SCORES` for both kinds.
- `src/game/simulator.ts`: `growTemples` grows both kinds to max level 4; `doBuild` sets
  `bornTurn` for both kinds.
- `src/render/tileSignature.ts`: include the temple level in the signature for both kinds.
- `src/render/textureFactory.ts`: add `forestTempleTextures: Record<1|2|3|4, TileTexture>`
  loading `forest-temple-1.png` .. `forest-temple-4.png`.
- `src/render/mapRenderer.ts`: pick the temple texture by kind (water → `templeTextures`,
  forest → `forestTempleTextures`).
- `src/ui/hud/toolbarSpecs.ts` + `src/ui/hud/HudToolbar.ts`: add a "Build forest temple
  (10s, 30)" toolbar option and its icon mapping.

### 2. Buffs (`src/game/buffs.ts`, new)

- `type BuffId = 'waterProtection' | 'forestProtection'`.
- `BUFF_INFO: Record<BuffId, { name: string; icon: string; tooltip: string }>`:
  - waterProtection: icon `water-protection.png`, tooltip `Water Protection: -1 dmg for ships`.
  - forestProtection: icon `forest-protection.png`, tooltip `Forest Protection: -1 dmg for units in forest`.
- `activeBuffs(map, playerIndex): BuffId[]` — `>= 3` owned `temple` buildings →
  `waterProtection`; `>= 3` owned `forestTemple` buildings → `forestProtection`.
- `damageReduction(map, unit, tile): number` — returns `0`, `1`, or `2`:
  +1 when `waterProtection` is active and the unit `isShip(unit)`; +1 when
  `forestProtection` is active and `isForestType(tile.terrain)`.

### 3. Combat damage reduction (`src/game/combat.ts`)

- `performAttack`: the damage the target unit receives is reduced by
  `damageReduction(map, targetUnit, target)`; the counter-attack damage the attacker
  receives is reduced by `damageReduction(map, attacker, attackerTile)` (computed from the
  attacker's current tile). Both reductions floor at 0. Applies to **all** damage received,
  including pirate attacks (the target's buffs apply normally; pirates have no player so
  their reduction is 0).

### 4. Buff display (`src/ui/hud/HudScore.ts`, `src/ui/kit/tooltip.ts`)

- `HudScore` renders a row of **square icons (plain texture, no background/border)** for
  each active buff of the local player, placed directly below the score circle. Each icon
  is interactive and shows the buff tooltip on hover (after a delay) and on click.
- `Tooltip` kit: remove the hardcoded `Required for ` prefix from `setContent` so callers
  provide the full secondary line. `HudMoney` updates its calls to pass
  `` `Required for ${info.requiredFor}` `` itself. Buff tooltips pass their exact text.

### 5. Tests

- `tests/buildings.test.ts`: `canBuildForestTemple` placement rules and `buildBuilding`
  cost/level for `forestTemple`.
- `tests/buffs.test.ts` (new): `activeBuffs` thresholds (0/2/3 temples) and
  `damageReduction` (ship + water, forest unit + forest, no buff → 0).
- `tests/combat.test.ts`: attack damage and counter damage reduced for protected units.
- `tests/score.test.ts`: forest temples give no building score and award temple end-score.
- `tests/simulator.test.ts`: forest temples grow to max level 4.
- `tests/mapRenderer.test.ts`: `buildTextures` includes `forestTempleTextures`.

## Out of scope

- No new skills (the existing `forestTemple` skill unlocks the building).
- No change to water-temple behavior or costs.
- Buffs apply to AI players too (they are per-player effects derived from map ownership).
