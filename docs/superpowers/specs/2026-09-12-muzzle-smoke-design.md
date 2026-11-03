# Muzzle Smoke for Ship/Pirate Attacks Design

Date: 2026-09-12

## Goal

When a ship or pirate attacks (or counter-attacks), a brief puff of rising smoke
appears above the shooting unit at the moment the shot begins — a cannon-smoke
effect that mirrors the existing death-animation particle pattern.

## Scope

- Ships (any `unitMoved`/`attack` with `shipLevel` set) and pirates
  (`type === 'pirate'`) only. Archers and catapults do not smoke.
- Attack moment: when the attacker fires its projectile.
- Counter-attack moment: when a surviving ship/pirate defender fires back.
- Smoke only renders when the firing unit's tile is visible to the local player
  (consistent with projectile spawn conditions).

## Smoke parameters (from death animation, adjusted)

| Param    | Death (`spawnDeath`)        | Smoke                     |
| -------- | --------------------------- | ------------------------- |
| count    | 10                          | 10                        |
| shape    | `Graphics.rect`             | `Graphics.circle`         |
| color    | `0xffffff`                  | random `0x222222..0xffffff` |
| alpha    | 0.3–0.8                     | 0.2–0.5                   |
| start sz | fixed 4–16px                | 2–4px                     |
| end sz   | fixed (no growth)           | 6–10px                    |
| duration | 3000 ms (+ 700 ms stagger)  | 600 ms                    |
| motion   | rise + sine swing           | rise + sine swing (gentle) |

Each particle: radius grows `start + (end - start) * t` over its local time
`t = (age - delay) / 600`, drifts by a sine swing like death, rises gently
upward, alpha fades `opacity * (1 - t)`, then the container is removed and
destroyed.

## Changes

### New file `src/render/smoke.ts`

```ts
export const MUZZLE_MS = 600;

export function spawnMuzzleSmoke(
  app: Application,
  mapRoot: Container,
  x: number,
  y: number,
): void
```

- `x`, `y` are the tile's **screen** position; the caller computes it (see
  "Type for smoke positions" below) so `smoke.ts` stays decoupled from the
  camera/tile math.
- Creates a `Container` at `zIndex = 10` on `mapRoot` holding 10 circle
  `Graphics` with the smoke parameters above, animated on `app.ticker`, removed
  after `MUZZLE_MS + maxDelay` (≈ 750 ms).
- Fire-and-forget; does not block the caller.

### `src/controller/eventPresenter.ts` — triggers

1. **Attack begins**: in `presentAttack`, where the ship/pirate cannonball is
   spawned (~line 361), when
   `(e.attackerPre?.shipLevel !== undefined || e.attackerPre?.type === 'pirate') &&
   attackerVisible`, compute the attacker tile's screen point and call
   `spawnMuzzleSmoke(app, mapRoot, x, y)` right next to the
   `spawnCannonballFromTo` call.

2. **Counter begins**: in `presentStagedAttack`, in the counter branch (~line
   549), when the countering defender is a ship or pirate
   (`targetPre.shipLevel !== undefined || targetPre.type === 'pirate'`), compute
   the target tile's screen point and call `spawnMuzzleSmoke(app, mapRoot, x, y)`
   before the return shot fires. Catapult counters (`targetPre.type ===
   'catapult'`) do not smoke.

### Type for smoke positions

The module needs the camera/tile → screen-position math. To keep `smoke.ts`
decoupled, it takes the already-resolved screen point instead of the
camera/tile/hexSize: `spawnMuzzleSmoke(app, mapRoot, x, y)` where `x`, `y` are
screen coordinates (like `spawnDeath`'s computed `el.position`). The caller
computes the point using the existing `hexToPixel` + `camera.pan`/`scale` +
`tileElevation` pattern already present in `eventPresenter.ts`.

## Tests

### `tests/smoke.test.ts` (new)

- `spawnMuzzleSmoke` adds exactly 10 circle `Graphics` to the given `mapRoot`,
  each `alpha` in `[0.2, 0.5]`, color within `0x222222..0xffffff`, radius ≤ 5px
  at spawn and > start radius after growth.
- Advancing the fake ticker past `MUZZLE_MS + stagger` removes the container
  (`mapRoot.children` empty) and calls `destroy`.
- Uses the fake `app.ticker` + fake `performance.now` harness pattern from
  `tests/wake.test.ts` / the death-animation test in `tests/combatAnimation.test.ts`.

### `tests/combatAnimation.test.ts`

- Extend the existing pure-pirate attack/counter tests (or add) to assert smoke
  appears on the attacker's / target's screen position when a ship/pirate
  shoots (circle `Graphics` count on `mapRoot` increases at the shot moment).
- A melee-only fight (warrior vs warrior) produces no smoke.

## Out of scope

- No change to death, wake, projectile, sound, or damage presentation.
- No change to catapult/archer visuals.
- The smoke is purely cosmetic (no gameplay effect).