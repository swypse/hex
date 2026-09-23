# Design: Village capturing system

Date: 2026-08-16

## Goal

Add village capturing: a unit parked on a foreign/empty village can capture it on the next turn. Captured villages transfer ownership + territory; the previous owner's units redistribute or die; losing the last village marks a player inactive (strikethrough names, skipped turns). AI captures and moves toward foreign/free villages. Also fix the HP-bar text (per-type max) and add a background behind it.

## Capture mechanic

- **Capture-ready state**: a foreign/empty village with an enemy/neutral unit parked on its tile becomes `captureReady` when that state survives into the player's next turn (set at the start of the player's turn; cleared when the parked unit moves/attacks/dies).
- **Capture action** (`src/game/capture.ts`, new):
  - Guards: village owner is not the capturer's owner, `captureReady === true`.
  - Village `owner` → capturer's owner; territory (`ownedBy`) cells → capturer's owner.
  - Capturing unit `spawnVillage` → captured village.
  - Previous owner's units linked to this village redistribute to their remaining villages (most-empty first). If the previous owner has no remaining villages → all their units die and the player is marked **inactive**.
  - Over-capacity after redistribution: no death; the village's income is reduced by the overflow (`max(0, units - capacity)`).

## Player inactive flag

- `Player` gains `isActive: boolean` (default true); set false when a player loses their last village.
- Every UI label showing a player's name (players list, turn info, selected info, popups) renders it **strikethrough** when inactive.
- Inactive players' turns are skipped in the turn order (no popups, no delay).

## Toolbar

- When the selected village is foreign/neutral, has a parked unit, and `captureReady`, the action toolbar shows **"Capture village!"** → `gameController.captureSelectedVillage()`.

## Income overflow

- Round-end income per village: `max(0, (3 + level) - overflow)`, where `overflow = max(0, unitsInVillage - capacity)`.

## AI

- Per unit, priority: **capture** (if parked on a capture-ready foreign/neutral village) → **attack** → **move toward the closest foreign/free village** (instead of closest enemy).
- New action type `{ type: 'capture'; q; r; unitId }`; controller executes via `captureVillage`.

## Combat kill-move (`src/game/combat.ts`)

- When an attack kills the target, the attacker moves onto the killed unit's tile — **except** archers, who keep their position.
- Terrain always matters (no landing on water), same as movement: if the killed tile is water, the attacker stays put.

## HP bar fixes (`src/render/mapRenderer.ts`)

- HP bar text uses the unit's per-type max: `hp/{UNIT_TYPES[type].maxHp}` (rider 4/4, archer 3/3, warrior 5/5) instead of the global `MAX_HP`.
- Add a black semi-transparent background rectangle behind the HP text so white text is always readable.

## Tests

- `capture.ts`: ownership + territory transfer, re-linking, redistribution (most-empty-first), last-village → inactive + units die, income overflow reduction, capture-ready gating.
- `players.ts`: `isActive` default and transition.
- `combat.ts`: kill-move on non-water tile; archer stays put; water tile → stays put.
- `ai.ts`: capture-before-attack; move targets closest foreign/free village.
- Manual: full capture flow via headless Chrome.
