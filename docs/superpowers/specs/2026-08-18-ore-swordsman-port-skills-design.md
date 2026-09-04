# Design: Ore, Swordsman, Port & Skill Tree

Date: 2026-08-18

## Goal

Add a fourth resource (ore), a new unit (swordsman), a new building (port), and a skill tree that gates buildings, units, and movement. Skills are opened with money on a dedicated skill-tree scene; each opened skill grants +30 score.

## Design decisions (confirmed with user)

1. **Ore**: mines produce stone **and** ore; starting ore = 0.
2. **Skill cost**: money only, `3 × level` (level 1 = 3, level 2 = 6, ...).
3. **Swordsman**: movement 1, attack 4, attackDistance 1, maxHp 8, cost 15 money + 1 ore; drawn as a circle with a small triangle inside.
4. **Port**: built on an **owned water tile**; just a building for now (+15 score); cost 10 wood + 30 money + 2 ore; orange parallelogram.
5. **Mountains**: impassable without the **climbing** skill; passable with it (units can stand on them).
6. Skill tree scene is a full-screen React/SVG overlay (map hidden, Pixi stays alive); close button returns to the map.
7. AI players have a `skills` list too, but never open skills yet.

## Skill tree structure (`src/game/skills.ts`, new)

```
SkillId = 'climbing' | 'smithery' | 'swordsman' | 'geology' | 'water' | 'navigation' | 'waterTemples' | 'forestry' | 'forestTemple'
```

| Skill | Level | Parent | Cost | Effect |
|-------|-------|--------|------|--------|
| climbing | 1 | — | 3 | units can enter mountain tiles |
| smithery | 2 | climbing | 6 | can build mines |
| swordsman | 2 | climbing | 6 | can spawn swordsman |
| geology | 2 | climbing | 6 | mines +1 ore per mine |
| water | 1 | — | 3 | can build ports |
| navigation | 2 | water | 6 | none yet (future) |
| waterTemples | 2 | water | 6 | none yet (future) |
| forestry | 1 | — | 3 | can build factories |
| forestTemple | 2 | forestry | 6 | none yet (future) |

```ts
export function hasSkill(player: Player, id: SkillId): boolean
export function canOpenSkill(player: Player, id: SkillId): boolean // parent opened (or no parent), not already opened, money >= cost
export function openSkill(player: Player, id: SkillId): boolean // validate + pay + push, returns success
```

Note: `SKILL_SCORE = 30` lives in `score.ts` (with the other score constants); `skills.ts` is score-agnostic — the caller (`gameController.openSkill`) awards it.

## Data model

- `Resources` gains `ore: number`. `START_RESOURCES = { wood: 3, stone: 2, money: 5, ore: 0 }`; `UPGRADE_COST = { wood: 2, stone: 1, money: 2, ore: 0 }`; `canAfford`/`pay` compare/subtract ore.
- `Player` gains `skills: SkillId[]` (init `[]` in `buildPlayers`).

## Ore & building income (`src/game/buildings.ts`)

- `buildingIncome(map, player)` now returns `{ wood, stone, ore }` (takes the `Player` so it can read `skills`):
  - factory → `wood += level × (# adjacent forests)`.
  - mine → `stone += level`; `ore += level + (hasSkill(player, 'geology') ? 1 : 0)`.
  - port → no income.
- Building costs become per-kind `Resources`:
  - factory `{ money: 10 }`, mine `{ money: 15 }`, port `{ wood: 10, money: 30, ore: 2 }`.
- `canBuildFactory` (requires **forestry**), `canBuildMine` (requires **smithery**), new `canBuildPort` (owned **water** tile, requires **water**). All take the `Player` to read `skills`. `buildBuilding(map, tile, kind, player)` pays via `canAfford`/`pay`.

## Swordsman (`src/game/units.ts`, `src/game/spawn.ts`)

- `UnitType` gains `'swordsman'`; `UNIT_TYPES.swordsman = { movement: 1, attack: 4, attackDistance: 1, maxHp: 8, price: 15, priceOre: 1, shape: 'swordsman' }`.
- `UnitTypeInfo` gains `priceOre: number` (0 for existing units).
- `spawnUnit` requires `canAfford(player.resources, { money: price, ore: priceOre })` **and** `hasSkill(player, 'swordsman')`.
- `SpawnDialog` gates the swordsman row on the skill and shows the ore cost.

## Mountain movement (`src/game/selection.ts`)

- `reachableTargets(map, unit, range, canClimb = false)` and `pathBetween(map, from, to, canClimb = false)`: a tile is passable if not Water and not (Mountain and not `canClimb`).
- `gameController` passes `hasSkill(players[unit.owner], 'climbing')` at both call sites (reachability + unit move animation).

## Rendering (`src/render/textureFactory.ts`, `src/render/mapRenderer.ts`)

- New unit shape `'swordsman'`: a circle (existing) with a small triangle inside. `makeUnitTexture` draws it; `drawUnitShapeBorder` uses the circle border.
- New port texture: an orange parallelogram at the tile center (`makePortTexture`, ~0xe07830). `TextureSet` gains `portTexture`; `mapRenderer` draws it for `tile.building.kind === 'port'`.

## Skill tree scene (`src/screens/SkillTreeScreen.tsx`, new; store + HUD)

- Store gains `skillTreeOpen: boolean` + `setSkillTreeOpen`.
- A **Skills button** sits to the left of the top-right score circle (`#skills-btn`).
- `GameScreen` renders `<SkillTreeScreen />` full-screen (opaque background) when `skillTreeOpen` is true, hiding the map.
- `SkillTreeScreen` (React + SVG):
  - Root circle at center in the human's tribe color; name/cost label.
  - Level-1 skills (gray circles, name below) connected to the root with gray lines; level-2 skills around their parents.
  - Opened skill → orange circle border + orange connector line.
  - A level-2 skill is disabled until its parent is opened; circles show the money cost and are disabled when unaffordable.
  - Clicking an openable skill → `gameController.openSkill(id)` → `openSkill(players[0], id)`, `+SKILL_SCORE` awarded immediately, tree re-renders.
  - Close button → `setSkillTreeOpen(false)`.
- `gameController.openSkill(id)` validates + persists players.

## HUD

- `MoneyInfo` gains an ore counter (dark-gray square + "Ore: N").
- `ActionToolbar` build buttons reflect the skill gates via `canBuildFactory/Mine/Port`.

## Files touched

- `src/game/resources.ts` — ore field, START/UPGRADE costs, canAfford/pay.
- `src/game/players.ts` — `Player.skills`.
- `src/game/skills.ts` (new) — SkillId, SKILLS, hasSkill, canOpenSkill, openSkill, SKILL_SCORE.
- `src/game/units.ts` — swordsman, `priceOre`, shape union.
- `src/game/spawn.ts` — swordsman cost + skill gate.
- `src/game/buildings.ts` — port, skill gates, per-kind Resources costs, ore income.
- `src/game/selection.ts` — `canClimb` params.
- `src/game/score.ts` — add `SKILL_SCORE = 30` (BUILDING_SCORE already covers any building, including ports).
- `src/render/textureFactory.ts`, `src/render/mapRenderer.ts` — swordsman/port textures.
- `src/controller/gameController.ts` — canClimb wiring, ore income, openSkill.
- `src/store/gameStore.ts` — `skillTreeOpen`.
- `src/screens/SkillTreeScreen.tsx` (new), `src/screens/GameScreen.tsx`, `src/screens/hud/MoneyInfo.tsx`, `src/screens/hud/ActionToolbar.tsx`, `src/ui/SpawnDialog.tsx`, `index.html`.

## Testing

- `tests/skills.test.ts` (new): table structure, costs 3/6, prerequisites, open/pay/refund, +30 score.
- Updated: `tests/resources.test.ts` (ore), `tests/units.test.ts` (swordsman), `tests/spawn.test.ts` (ore cost + skill gate), `tests/buildings.test.ts` (port, skill gates, ore income), `tests/players.test.ts` (skills init), `tests/score.test.ts` (SKILL_SCORE).
- Existing suite (`npm test`), `npm run typecheck`, `npm run build` stay green.
- Manual via `npm run dev`: skill tree open/close, orange/disabled states, gates enforced (factory/mine/port/swordsman/mountains), ore income, +30 score on open.

## Out of scope

- AI opening skills.
- Effects for navigation / water temples / forest temple (future skills).
- Any port production beyond its building score.
