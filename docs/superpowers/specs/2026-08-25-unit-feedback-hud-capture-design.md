# Unit Feedback, HUD Cleanup, and Capture Marker Design

Date: 2026-08-25

## Problem

Four visual/UX issues in the game screen:

1. Unit HP bars float above the unit instead of sitting at the center of its
   texture.
2. The top-left players list duplicates info now available on the Stats screen.
3. Selection and combat feel static — no feedback when a unit is selected or
   attacks.
4. The capturable-village marker is a hand-drawn red triangle; the user has
   provided a proper texture (`public/textures/capture.png`) to use instead.

## Section 1 — HP bar centered on the unit's texture

`src/render/mapRenderer.ts`:

- Replace the `unitSpriteTop()` world offset with a **center** offset:
  `centerOffset = (0.5 − anchorY) × (texture.height × spriteScale)`, using the
  unit's actual texture (`unitTextures[tribe][type]`, ships use `anchorY = 0.5`).
  Position the HP bar at `y + centerOffset`.
- Rework `addHpBar` so the **bar** is centered on that point (bar spans
  `−barHeight/2 … +barHeight/2`), with the HP label (`3/5`) still anchored above
  the bar. Drop the now-unused `HP_BAR_GAP` constant.

Behavior: bar + label hover at the vertical center of the unit's texture and
track it on zoom (same world-space anchoring as before).

## Section 2 — Remove the top-left players list

- Delete `src/ui/hud/HudPlayers.ts`.
- Remove `HudPlayers` from `GameScreen.ts`'s widget list. Player standings remain
  available on the Stats screen.

## Section 3 — Selected-unit bounce (own units only)

`src/render/mapRenderer.ts`:

- In `update()`, when `selection` is a unit **owned by the local player** and its
  sprite is visible, run a ticker that oscillates that sprite's `position.y`
  around its base: `baseY + sin(phase) × amp`, with `amp = hexSize × 0.15` and
  period ≈ 700ms.
- If the selection changes, the selected unit changes, or the sprite is destroyed
  or repositioned, stop the previous bounce and (if still applicable) start fresh
  on the new sprite.
- Enemy selections do **not** bounce.
- Stops cleanly on `destroy()`.

## Section 4 — Attack lunge animation

- `src/render/mapRenderer.ts`: add `lungeUnit(fromKey, toKey, worldOffset)` —
  tweens the attacker tile's `unitSprite` from its base position to
  `base + direction × worldOffset` and back over ≈160ms, where `direction` is the
  normalized world vector from attacker to target.
- `src/controller/gameController.ts` `presentAttack`: if the attacker tile is
  visible, compute `worldOffset = 10 / (baseScale × zoom)` (a fixed **10 screen
  px** lunge) and call `mapView.lungeUnit(...)`. Applies to all attack types
  (melee, ranged, ships). Guard against a destroyed sprite.

## Section 5 — Capture mark uses `capture.png`

- `src/render/textureFactory.ts`: load `public/textures/capture.png` into the
  `TextureSet` as `captureTexture: Texture | null` (async, like
  `villageConnectedTexture`).
- `src/render/mapRenderer.ts`: in the capture-marker block, replace the red
  triangle `Graphics` with a `Sprite` using `captureTexture`, sized
  `hexSize × 0.7` wide (aspect preserved), anchored center, keeping the existing
  bob animation.

## Files touched

- Modify: `src/render/mapRenderer.ts`, `src/render/textureFactory.ts`,
  `src/controller/gameController.ts`, `src/ui/screens/GameScreen.ts`.
- Delete: `src/ui/hud/HudPlayers.ts`.

## Testing

- `npm run typecheck` and `npm test` must pass (no game-logic changes).
- Manual (`npm run dev`):
  1. HP bar sits at the vertical center of each unit's texture, label above,
     tracks on zoom.
  2. No players list top-left; Stats screen still lists players.
  3. Selecting your own unit bounces its sprite; selecting an enemy unit does not.
  4. Attacks lunge the attacker 10px toward the target and back.
  5. Capturable villages show the `capture.png` marker (bobbing) instead of the
     red triangle.
