# Ship Wake Trace Design

Date: 2026-09-12

## Goal

When a sea unit (ship or pirate) moves over water, it leaves a short trace of
small light-blue squares scattered along the travel line, one burst per path
tile. Each burst fades out smoothly over 200 ms. Squares are drawn in world
space so they scale with the map like the ship sprite itself.

## Scope

- Applies to all ships (any `unitMoved` event carrying `shipLevel`) and to
  pirates (`unit.type === 'pirate'`), for any player — local, AI, pirates.
- Only on water tiles (`TileType.Water`), respecting existing fog filtering:
  enemy path steps that are unexplored are never animated, so they also produce
  no wake.
- The landing step (ship arrives on a coast land tile) produces no wake.

## Geometry and animation — new file `src/render/wake.ts`

Pure helpers, no Pixi types in the geometry function:

```ts
export interface WakePoint { x: number; y: number }

export function wakeSquarePositions(
  from: WakePoint,
  to: WakePoint,   // segment endpoints (world coordinates)
  count: number,   // squares to scatter
  rng: () => number = Math.random,
): WakePoint[]
```

Scatters `count` points uniformly along the from→to segment (parameter
`t`), with a small perpendicular jitter (≈8px) so the squares sit around the
travel line inside the tile.

```ts
export function spawnShipWake(
  app: Application,
  container: Container,   // mapView.container — scales with zoom automatically
  from: WakePoint,
  to: WakePoint,
): void
```

- Picks 10–20 squares per burst (uniform random).
- For each square creates a 2×2 px `Graphics` rect, colored light blue
  `0xaee8ff`, `zIndex = 5` (above water/territory, below units at 7), adds it
  to `container`.
- Fades `alpha` 1→0 over 200 ms via `app.ticker`, then removes and destroys the
  rect; tick cleanup mirrors the `spawnDeath`/`spawnFogReveal` pattern from
  `eventPresenter.ts`.
- Fire-and-forget: does not block the calling move animation.

## Trigger — `src/controller/eventPresenter.ts`

In `animateMoveEvent` (`eventPresenter.ts:654`), detect a sea unit:

```ts
const seaUnit = e.shipLevel !== undefined || unit.type === 'pirate';
```

For each path step, after the sprite tweens into that step (`tweenSpriteTo`
around `eventPresenter.ts:703`), if the step's tile and the previous tile are
both `TileType.Water`, spawn one burst along the segment from the previous
tile's hex-center world position to the step's hex-center world position.

- Segment endpoints use `hexToPixel(hex, HEX_SIZE)`; water tiles have zero
  elevation, so no Y adjustment is needed.
- The final landing step is skipped automatically because the destination tile
  is land.
- Coordinates are world-space, matching where the ship ghost sprite is added
  (`mapView.container` position set in world coordinates), so the wake scales
  with the camera like the ship.

## Tests

### `tests/wake.test.ts` (new)

- `wakeSquarePositions` returns exactly `count` points, all inside a bounding
  box around the segment, and points do not wander far from the segment line.
- `spawnShipWake` adds the right number of 2px rects to the passed container,
  fades them to 0 over ~200 ms of ticker time, and removes/destroys them at the
  end (fake `app.ticker` + fake `performance.now`, mirroring
  `tests/moveAnimation.test.ts` patterns).

### `tests/moveAnimation.test.ts`

- Extend the harness case: presenting a ship move over water adds wake rects to
  `mapView.container` on water path tiles (visible children with `zIndex` 5),
  removes them after the fade elapses, and a landing move produces no wake on
  the land destination tile.

## Out of scope

- No change to ship movement rules, `unitMoved` event shape, or fog logic.
- No new assets or sound.
- Trace is purely cosmetic; it has no gameplay effect.