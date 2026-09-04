# Design: Unit sprite fix, hex villages, AI action camera, wood/stone income

Date: 2026-08-17

## Goal

1. Fix the invisible unit sprite (units were rendered without `addChild`).
2. Render villages as hexagons, slightly bigger than the current circle.
3. When an AI action's target cell is off-screen, smoothly center the camera on it.
4. Collect wood (from owned forest tiles) and stone (from owned mountain tiles) each round, with the counters animating like money.

## Background

- `src/render/mapRenderer.ts` builds the map container. Commit `4aa5833` accidentally removed `container.addChild(unitSprite)` — the unit sprite is created, anchored, scaled, and positioned but never added to the container, so units are invisible (their HP bar is drawn and visible).
- `src/render/textureFactory.ts` draws villages as circles of radius `hexSize * 0.3` via `makeVillageTexture`.
- `src/controller/gameController.ts` `runAiPhase` performs each AI action with a 300 ms pause between actions, then collects `villageIncome` (money) per settlement at round end.
- Resources are `{ wood, stone, money }` (`src/game/resources.ts`). `src/screens/hud/MoneyInfo.tsx` already animates the money counter (+1 per `STEP_MS` with a bounce); wood and stone are shown statically.
- Terrain tile types: `ForestLand`, `ForestSand`, `ForestSnow` (the three forests), `Mountain` (`src/game/tileTypes.ts`). Player-owned tiles are `tile.ownedBy === playerIndex`.
- All `AiAction` variants carry a target `{ q, r }` (`src/game/ai.ts`).

## Design

### 1. Fix the invisible unit sprite

Restore `container.addChild(unitSprite);` in `renderMap` right after the unit sprite is positioned. All other sprites call `addChild`; this restores the missing call.

### 2. Hexagon villages

In `textureFactory.ts`, change `makeVillageTexture` to draw a hexagon via the existing `hexagonPoints()` helper with circumradius `hexSize * 0.45`, filled with the tribe/free-gray color and stroked black (width 2), instead of a circle of radius `hexSize * 0.3`. This applies to owned villages and the free village; a village hex is visibly bigger than the old circle.

### 3. Camera centers AI action cells

- Add pure helpers to `src/game/zoom.ts`:
  - `easeInOutCubic(t: number): number`
  - `cameraPanStep(pan: {x;y}, target: {x;y}, progress: number): {x;y}` — linear interpolation of `pan → target` using the eased, clamped progress.
- `gameController` gains a ticker-driven camera animation:
  - `animateCameraTo(target: {x;y}): Promise<void>` — animates `pan` from its current value to `target` over ~600 ms with `easeInOutCubic`, resolving when done. Starting it stops inertia and any running camera animation.
  - `stopCameraAnimation()` — removes the ticker callback.
  - `bringCellIntoView(q: number, r: number): Promise<void>` — computes the tile's screen position (`pan + hexToPixel(tile, HEX_SIZE) × scale`); if it lies outside the viewport plus a margin (≈ 2 tile widths), animates to center it (`screenCenter − worldPos × scale`); otherwise resolves immediately.
- User interaction cancels the animation: `pointerdown`, `wheel`, and `resetView` call `stopCameraAnimation()`.
- In `runAiPhase`, before performing each AI action, `await bringCellIntoView(action.q, action.r)`. The camera glides to the action's target cell, then the action runs. Zoom level is unchanged.

### 4. Wood/stone income and animated counters

- Add pure function `collectTerrainIncome(map: GameMap, playerIndex: number): { wood: number; stone: number }` to `src/game/capture.ts` (co-located with `villageIncome`):
  - for each tile with `tile.ownedBy === playerIndex`:
    - terrain `ForestLand`, `ForestSand`, or `ForestSnow` → `wood + 1`
    - terrain `Mountain` → `stone + 1`
- In `runAiPhase`, at round end, for each player:
  - `player.resources.money += villageIncome` per settlement (unchanged)
  - `player.resources.wood += terrain.wood`
  - `player.resources.stone += terrain.stone`
- In `MoneyInfo.tsx`, replicate the money ticking counter for wood and stone: each is displayed via a ticking state that steps +1 (or −1) every `STEP_MS` toward the target value with the `money-bounce` animation, so collection appears as "increase by 1 with a delay".

## Files touched

- `src/render/mapRenderer.ts` — restore unit `addChild`.
- `src/render/textureFactory.ts` — hexagon village texture.
- `src/game/zoom.ts` — `easeInOutCubic`, `cameraPanStep`.
- `src/controller/gameController.ts` — camera animation, `bringCellIntoView`, AI-phase integration, round-end wood/stone collection.
- `src/game/capture.ts` — `collectTerrainIncome`.
- `src/screens/hud/MoneyInfo.tsx` — wood/stone ticking counters.
- `tests/zoom.test.ts` — ease/pan-step tests.
- `tests/capture.test.ts` — `collectTerrainIncome` tests.

## Testing

- Unit tests: `collectTerrainIncome` (owned forest/mountain counts; other terrains and other owners ignored), `easeInOutCubic` (0→0, 1→1, midpoint 0.5), `cameraPanStep` (progress 0 returns start, progress 1 returns target, eases in between).
- Manual (`npm run dev`): units visible on the map; villages are hexagons and larger; during the AI turn the camera smoothly centers on each off-screen action target; at round end wood/stone counters tick up one-by-one with the money bounce.
