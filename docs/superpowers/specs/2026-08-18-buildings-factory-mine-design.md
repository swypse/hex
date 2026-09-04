# Design: Buildings — Factory & Mine replace tile income

Date: 2026-08-18

## Goal

Replace the current per-tile wood/stone income (automatic end-of-turn collection from owned forest/mountain tiles and the manual "Collect resources" unit action) with **buildings**: factories produce wood from adjacent forests, mines produce stone from the mountain they stand on. Both are built for money on the player's own territory and transfer ownership together with the village that owns their tile.

## Background (current behavior)

- `Player.resources = { wood, stone, money }` (start 3/2/5). `canAfford`/`pay` in `resources.ts`.
- Turn-end income in `gameController.runAiPhase`: money from villages (`villageIncome` = `max(0, 3 + level − overflow)`), plus wood/stone from `collectTerrainIncome` — every tile owned by the player with a forest/mountain yield gives +1, flagged via `tile.resourceCollected` (reset each turn).
- A unit can also manually "collect" a forest/mountain tile once per turn (`collectTileResource`, `canCollect`, `unit.hasCollected`, toolbar button).
- Costs today: upgrade village = 2 wood + 1 stone + 2 money; units cost money only.

## Design decisions (confirmed with user)

1. **Keep** money, wood, stone as the three resources.
2. **Remove both** tile-income paths: automatic end-of-turn per-tile income and the manual collect action.
3. **Buildings** (factory, mine) are the new wood/stone income source.
4. Factory: built on an **owned land tile adjacent to at least one forest tile**, cost **10 money**.
5. Mine: built on an **owned mountain tile**, cost **15 money**.
6. One building per tile; a tile with a settlement cannot host a building; units and buildings can coexist on the same tile.
7. Buildings have `level` (default 1) which **scales income now** (`level ×` base). No upgrade action yet.
8. **AI does not build** (deferred); income logic is generic per player.
9. Building income **follows tile ownership**: when a village is captured, `ownedBy` on its claimed tiles changes, so the new owner receives that building's income.

## Data model (`src/game/mapGen.ts`)

- `Building = { kind: 'factory' | 'mine'; level: number }` — defined in `mapGen.ts` next to `Settlement`.
- `MapTile` gains `building: Building | null` (initialized `null` in `generateMap`).
- **No `owner` on the building** — ownership is derived from `tile.ownedBy`, so capture transfers it automatically.

## Buildings module (`src/game/buildings.ts`, new, pure)

```ts
const FACTORY_COST = 10;
const MINE_COST = 15;

// Placement checks (tile must be owned by player, no settlement/building, terrain rule)
canBuildFactory(map: GameMap, tile: MapTile): boolean
canBuildMine(map: GameMap, tile: MapTile): boolean

// Validates + sets tile.building, deducts money; returns success
buildBuilding(map: GameMap, tile: MapTile, kind: 'factory' | 'mine', player: Player): boolean

// End-of-round income for one player
buildingIncome(map: GameMap, playerIndex: number): { wood: number; stone: number }
```

- Factory placement: `tile.ownedBy === playerIndex`, `isLandType(tile.terrain)`, `tile.settlement === null`, `tile.building === null`, and at least one neighbor (`hexNeighbors`) is a forest tile (`isForestType`).
- Mine placement: `tile.ownedBy === playerIndex`, `isMountainType(tile.terrain)`, `tile.settlement === null`, `tile.building === null`.
- `buildBuilding`: re-checks placement + `player.resources.money >= cost`; deducts money, sets `tile.building = { kind, level: 1 }`.
- `buildingIncome`: for tiles with `ownedBy === playerIndex`:
  - factory → `factory.level × (number of adjacent forest tiles, any owner)`.
  - mine → `mine.level`.
  A forest adjacent to two factories is counted twice (per-factory sum).

## Removals

- `capture.ts`: delete `tileResourceYield`, `collectTerrainIncome`, `collectTileResource`. Keep `villageIncome`, `setCaptureReady`, `captureVillage`.
- `units.ts`: delete `canCollect`. Remove `hasCollected` from the `Unit` interface and from `mapGen.ts`/`spawn.ts` unit construction.
- `mapGen.ts`: remove `t.resourceCollected` usage; `MapTile.resourceCollected` field deleted.
- `gameController.ts`: delete `collectSelectedUnitResources`; remove `hasCollected`/`resourceCollected` resets in `runAiPhase`; replace the terrain-income block with `buildingIncome`.
- `ActionToolbar.tsx`: remove the "Collect resources" button.

## Turn-end income (`gameController.runAiPhase`)

For each player: `money += Σ villageIncome(villageTiles)` (unchanged); `{ wood, stone } += buildingIncome(map, player.index)`.

## Rendering

- `textureFactory`: new textures in `TextureSet` — `factoryTexture`, `mineTexture`, each drawn as **two small squares** at the tile center (different colors per kind).
- `mapRenderer`: when `tile.building` is set, draw the building sprite at the tile center (anchor 0.5), on top of terrain, below the unit sprite.

## Toolbar & controller

- `gameController.buildSelectedBuilding(kind: 'factory' | 'mine')`: reads the selected tile, calls `buildBuilding` with the human player, on success shows a popup and re-renders.
- `ActionToolbar`: for the selected tile, show "Build factory (10)" when `canBuildFactory(map, tile)` for player 0, and "Build mine (15)" when `canBuildMine(map, tile)`; buttons disabled when money < cost. Clicking calls `buildSelectedBuilding`.

## Files touched

- `src/game/mapGen.ts` — `Building` type, `MapTile.building`, construction init, remove `resourceCollected`.
- `src/game/buildings.ts` — new pure module.
- `src/game/capture.ts` — remove tile-income functions.
- `src/game/units.ts` — remove `canCollect`, `hasCollected`.
- `src/game/spawn.ts` — drop `hasCollected` from constructed units.
- `src/controller/gameController.ts` — build action, income swap, removal of collect.
- `src/render/textureFactory.ts` — building textures.
- `src/render/mapRenderer.ts` — draw buildings.
- `src/screens/hud/ActionToolbar.tsx` — build buttons, remove collect button.
- `tests/buildings.test.ts` (new) — placement, build, income, transfer-on-capture.

## Testing

- Unit tests: factory placement (land+forest adjacency), mine placement (mountain), cost deduction, one-building-per-tile, no building on settlements, wood income double-counting for shared forests, stone income, level scaling, income follows tile ownership after capture.
- Existing suite (`npm test`, typecheck, `npm run build`) stays green.
- Manual via `npm run dev`: build factory/mine via toolbar, see end-of-round wood/stone, capture transfers income.

## Out of scope

- AI building placement.
- Building upgrade action (level is stored and scales income; upgrade is a future step).
- Building destruction beyond ownership transfer.
