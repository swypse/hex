# Design: Player resources, village levels & owned cells

Date: 2026-08-16

## Goal

Add player resources (wood/stone/money) with a top-right display, village levels shown in the village info card, an "Upgrade village" button with resource cost, and village-owned cells stored on tiles with a tribe-colored external border drawn around owned regions.

## Requirements (from discussion)

- Resources: wood 3, stone 2, money 5 at start. Displayed top right for the human player.
- Village has a level, shown in the info card on selection.
- "Upgrade village" button on the village card: costs 2 wood, 1 stone, 2 money. Disabled when resources are insufficient.
- Village owns cells: level 1 owns all cells at distance 1; level ≥ 2 owns all cells at distance 1 and 2. Neutral villages (owner null) own nothing.
- Ownership is stored on each tile (`MapTile.ownedBy`). First-claim-wins during generation/upgrade.
- Owned cells are drawn with a solid border on their external edges in the owner's tribe color.
- Upgrade is currently only exposed for the human's villages, but the logic is generic so AI can use it later.

## Resources (`src/game/resources.ts`, new)

```ts
interface Resources { wood: number; stone: number; money: number }
const START_RESOURCES: Resources = { wood: 3, stone: 2, money: 5 };
const UPGRADE_COST: Resources = { wood: 2, stone: 1, money: 2 };
function canAfford(have: Resources, cost: Resources): boolean
function pay(have: Resources, cost: Resources): Resources  // subtract; assumes affordable
```

- `Player` in `players.ts` gains `resources: Resources`, initialized to `START_RESOURCES` in `buildPlayers`.

## Village level & ownership

### mapGen.ts

- `Settlement` gains `level: number` (starts at 1).
- `MapTile` gains `ownedBy: number | null`.
- After settlement placement, claim owned cells in spawn order (first-claim-wins): for each owned settlement (owner !== null), mark all tiles within distance 1 that aren't already `ownedBy !== null`. Neutral settlements claim nothing.

### village.ts (new, pure & testable)

```ts
function claimRadius(level: number): number   // 1 for level 1, 2 for level >= 2
function ownedTilesFor(map: GameMap, tile: MapTile): MapTile[]
function upgradeVillage(map: GameMap, tile: MapTile): void
```

- `upgradeVillage`: if `tile.settlement` is owned → `level++`, then claim new tiles within `claimRadius(level)` not already owned by another player.

## HUD

- Top-right `#resources-info`: `Wood: 3 Stone: 2 Money: 5` for the human player, updated on render.
- Village card (`#selected-info`): add `Level: N` row when a village is selected. If owned by the human, show an "Upgrade village" button disabled when `!canAfford(human.resources, UPGRADE_COST)`. Clicking upgrades the village, subtracts the cost, and re-renders.

## Owned-cell border rendering

- `hex.ts`: add a helper for hex edge segments (the 6 edges of a tile as line segments in pixel space).
- `mapRenderer`: for every tile with `ownedBy !== null`, draw each of its 6 edges in the owner's tribe color only when the adjacent neighbor is NOT owned by the same player (or is off-map). Layer order: terrain → village → unit → owned-border → selection glow → move ghost.

## Tests

- resources: start values, `canAfford`, `pay`.
- players: `resources` initialized to start values.
- mapGen: level-1 owned villages claim their distance-1 ring, first-claim-wins; neutral villages claim nothing; `ownedBy` is null on unclaimed tiles.
- village: `upgradeVillage` increments level, claims unowned distance-2 tiles, skips tiles owned by others; `claimRadius` mapping.
