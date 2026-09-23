# Village Upgrade Sparks Design

## Goal

Play a short celebratory particle burst over a village at the moment it is upgraded: animated
gold squares fly up out of the village, waving left-right, pulsing in scale (`1 → 2 → 1 → 2`),
and fading out while rising. Duration 800 ms, 50 squares.

## Background / current behavior

- The `villageUpgraded` event (`src/game/events.ts`) is presented in
  `src/controller/event-presenter.ts` (`case 'villageUpgraded'`): it plays the `upgrade` sfx
  for the local player, re-renders, and calls `MapView.bounceHex(q, r)` for any locally
  explored village (own or enemy).
- World-anchored overlay effects follow the `fire.ts` pattern (`FireEffects`): a `Container`
  of self-animating `Graphics` is pushed into `MapView.overlayItems` with a `world` anchor;
  the host repositions it every frame at `pan + world * scale`. `Graphics` come from a shared
  pool (`MapView.takeGraphics`/`releaseGraphics`) and are released when the next map
  `update()` rebuilds the overlay (`releaseOverlay`).
- Score-fly text and bonuses use gold `0xffd700`, the established reward color.

## Architecture

A dedicated one-shot effect module `src/render/upgrade-sparks.ts` mirroring `fire.ts`. The
pure per-particle motion lives in an exported, unit-testable `sparkPlacement` function; a
small `UpgradeSparks` class animates the 50 pooled squares on the app ticker for 800ms and
then cleans itself up (releases Graphics, removes its own overlay-item registration so a
stale item is never repositioned after completion).

## Changes

### 1. New file `src/render/upgrade-sparks.ts`

Constants:

- `UPGRADE_SPARK_COUNT = 50`
- `UPGRADE_SPARK_DURATION_MS = 800`
- `UPGRADE_SPARK_COLOR = 0xffd700`
- `UPGRADE_SPARK_WAVE_AMP = 4` (left-right sway, px)
- `UPGRADE_SPARK_RISE = 200` (total upward flight, px)
- `UPGRADE_SPARK_SPAWN_DELAY_MS = 20` (squares launch one-by-one, 20ms apart; particle
  `i` starts `i * 20ms` after the burst begins and flies its own 800ms, so the whole burst
  lasts `(count − 1) · 20 + 800` ms)

Pure placement function (unit-tested, no Pixi):

- `sparkPlacement(particle, t01)` returns `{ x, y, scale, alpha }` where `t01` is the
  particle's elapsed time in `[0, 1]`:
  - `y = -particle.rise * t01` — rises upward (screen: negative y), 200px total.
  - `x = particle.baseX + sin(t01 * 2π * particle.waves) * particle.waveAmp` — waves
    left-right by a fixed ±4px.
  - `scale = 1 + (1 - cos(t01 * 2π * particle.scaleCycles)) / 2` — oscillates smoothly
    `1 → 2 → 1 → 2 → 1` over the 800ms (`scaleCycles = 2`, cosine so it starts and ends at 1).
  - `alpha = 1 - t01` — fades out while moving.

`baseX` is uniform across the village's on-screen width (the caller passes
`spreadX = √3·hexSize/2 · cameraScale`, from the leftmost to the rightmost village point).
Square base `size` is ≈4–8px (drawn with the `scale` multiplier), `waves` is randomized, and
the launch is deterministic: particle `i` appears `i * 20ms` after the burst (staggered,
one-by-one). `t01 = clamp((elapsed − i·20) / 800, 0, 1)`.

Class `UpgradeSparks` (options `{ app, overlay, overlayItems, takeGraphics }`, mirroring
`FireEffectsOptions`):

- `burst(x, y)`: creates a `Container`, spawns `UPGRADE_SPARK_COUNT` squares via
  `takeGraphics()` (`rect(x, y, size, size)`), registers `{ el, world: { x, y } }` in
  `overlayItems`, and starts a 800ms ticker.
- The ticker advances each particle with `performance.now()` elapsed, applies
  `sparkPlacement`, and draws `position/set` + `scale.set` + `alpha`; when elapsed passes the
  duration it stops the ticker, removes its item from `overlayItems`, removes the container
  from the overlay, releases each `Graphics` back to the pool, and destroys the container.
- `clear()`/`destroy()` stop an in-flight burst immediately (used on map rebuild/destroy so a
  burst never outlives the pool it borrowed from).

### 2. `src/render/map-renderer.ts`

- Construct `upgradeSparks: UpgradeSparks` in `MapView`'s constructor (same options as
  `FireEffects` — `app`, `overlay`, `overlayItems`, `takeGraphics`).
- Add `burstVillageUpgrade(q: number, r: number)`: resolve the tile, compute the hex center
  world position (`hexToPixel` minus `tileElevation`, same anchor point as other tile
  sprites), and call `upgradeSparks.burst(x, y)`.
- `destroy()` calls `upgradeSparks.destroy()`.

### 3. `src/controller/event-presenter.ts`

In `case 'villageUpgraded'`, alongside the existing `bounceHex` call, add
`this.host.mapView()?.burstVillageUpgrade(e.q, e.r)` — same gating (any village the local
player has explored), so nearby enemy upgrades spark too, consistent with the existing
bounce feedback.

## Error handling

- If `MapView` is inactive the presenters' `?.` calls no-op.
- If a map update (`releaseOverlay`) rebuilds the overlay mid-burst, `UpgradeSparks` sees its
  container removed; the ticker's next frame checks the container's `destroyed` state and
  stops/cleans up without touching the removed Graphics.
- The burst always self-removes from `overlayItems` on completion so the per-frame host
  repositioning never references a destroyed object.

## Testing

- `sparkPlacement` (pure): y starts near 0 and decreases; x waves (non-monotonic); scale stays
  within `[1, 2]` and oscillates (returns to ~1 twice); alpha is `1 → 0` monotonic.
- `UPGRADE_SPARK_COUNT === 50` and `UPGRADE_SPARK_DURATION_MS === 800` constants.
- No new dependencies; existing suites (`event-presenter`, `map-renderer`) stay green; run
  `npm test` and `npm run typecheck`.