# Forest & Aqua Tribes + More Players

## Overview

Add two new playable tribes — **Forest people** (code `forest`) and **Aqua people**
(code `aqua`) — and raise the maximum player count from 4 to 6 in both single-player
and multiplayer.

Texture files for the new tribes already exist in `public/textures/` (`forest-*`,
`aqua-*`) but are untracked. No new art is required.

## Changes

### 1. Tribe data model (`src/game/tribes.ts`, `src/config.ts`)

- Append `Forest` and `Aqua` to the `Tribe` enum **after** the existing values. This
  keeps the numeric ids of the existing tribes unchanged, which matters because saved
  games and network messages serialize tribe ids as numbers.
- Add a `code: string` field to `TribeInfo` (used for texture/icon path derivation).
- Give the existing four tribes explicit codes matching their current lowercase names:
  `cats`, `villagers`, `warriors`, `barbarians`.
- Add to `TRIBES`:
  - `{ id: Tribe.Forest, name: 'Forest people', code: 'forest', color: 0x47b220 }`
  - `{ id: Tribe.Aqua, name: 'Aqua people', code: 'aqua', color: 0x4da2da }`
- `config.ts`: add `Forest: 0x47b220` and `Aqua: 0x4da2da` to `TRIBE_COLORS`.

### 2. Textures (`src/game/units.ts`)

- Add `[Tribe.Forest]` and `[Tribe.Aqua]` entries to `UNIT_IMAGE_FILES` mapping every
  playable unit type to `forest-<type>.png` / `aqua-<type>.png`.

### 3. Path derivation switches `name.toLowerCase()` → `code`

Icons and ship textures are currently derived from `tribe.name.toLowerCase()`. With the
"Forest people"/"Aqua people" display names this would produce broken paths, so switch
these sites to use `tribe.code`:

- `src/render/textureFactory.ts` — ship texture filenames (`${base}-ship.png`).
- `src/ui/screens/SetupScreen.ts` — tribe circle icon (`${...}-icon.png`).
- `src/ui/screens/LobbyScreen.ts` — tribe circle icons in host view and room view.

Ship textures and tribe icons for the new tribes then resolve automatically
(`forest-ship.png`, `aqua-icon.png`, etc.).

### 4. Player limits

- `src/game/players.ts`:
  - `buildPlayers`: accept `enemyCount` 1–5 (was 1–3), max 6 players.
  - `buildMultiplayerPlayers`: accept total 2–6 (was 2–4).
- `src/game/mapGen.ts` — `mapRadiusFor`: add `5 → 10`, `6 → 11`; throw for counts
  outside 2–6. (Final map radius including the water border: 5 → 11, 6 → 12.)
- `src/ui/screens/SetupScreen.ts` — `ENEMY_OPTIONS` becomes `[1, 2, 3, 4, 5]`.
- `src/ui/screens/LobbyScreen.ts`:
  - Human player options become `[2, 3, 4, 5, 6]`.
  - AI options range `0..(6 − humans)`, so max total players is 6.
  - The AI-count clamp (`7 − humans`) replaces `5 − humans`.

### 5. Documentation (`GAME.md`)

- Multiplayer section: "up to 4" → "up to 6".
- Tribes table: add **Forest people** (green) and **Aqua people** (aqua).
- Map section radius list: add `5 players → 11`, `6 players → 12`.

### 6. Tests

- `tests/units.test.ts`: extend the `UNIT_IMAGE_FILES` expectation with the two new
  tribes.
- `tests/players.test.ts`: update the invalid-count throw cases to the new limits
  (multiplayer total > 6 throws; single-player enemies > 5 throws) and add cases for
  6-player / 5-enemy builds.
- `tests/mapGen.test.ts`: update `mapRadiusFor` expectations (`5 → 10`, `6 → 11`,
  `7` throws).
- `tests/lobbyHost.test.ts`: update human/AI option button expectations for the new
  ranges.

## Out of scope

- No gameplay balance changes; new tribes share the existing unit stat table.
- No AI changes; the AI is player-index based and handles 5–6 players as-is.
- No new texture assets (all required files already exist).
