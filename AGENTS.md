# AGENTS.md

Base project information for AI agents.

Core rules:
- be as brief and specific as possible
- prefer enums
- prefer extracting funtions/classes/enums to a single file

## Overview

2D turn-based strategy on a hex map, singleplayer or multiplayer. The gameplay rules and content are documented in
`GAME.md`.

## Tech stack

- TypeScript
- PixiJS 8 (map rendering, ui)
- Zustand (state store)
- Vite (dev/build: `npm run dev`, `npm run build`)
- Vitest (tests: `npm test`), `npm run typecheck`

## Codestyle and rules

See [pixijs-typescript-game-development-rules.md](docs/pixijs-typescript-game-development-rules.md)

## Code organization

- `src/game/` — rules engine, no UI imports. Core files at the root (`simulator`, `events`, `players`, `skills`, `score`, …) plus `ai/` (planner, `patterns/`), `map/`, `economy/`, `units/`, `weather/`, `balance/` (tuning tools). The simulator delegates to `pirates`, `bonuses`, `environment` through `SimContext`.
- `src/controller/` — glue between sim, store and views: `GameController` (+ `cheats`, `actions`), `NetworkController`, `EventPresenter` (+ `EventEffects`), `CameraController`.
- `src/render/` — `MapView` and its layers (`hp-bar-layer`, `edge-marker-layer`, `damage-badge`), texture baking, atlas loaders.
- `src/gfx/` — shared graphics infrastructure used by both `render` and `ui` (atlas, icons, bitmap fonts, theme, tooltip, render gate).
- `src/ui/` — screens, overlays (`PopupDialog` base), HUD, `kit/` widgets. `render` and `gfx` never import `ui`.
- `src/atlas-data/` — generated atlas manifests (`npm run pack:*`); do not edit by hand.
- Keep `game/` free of import cycles; put shared types in their own module instead of importing back up.
- `verbatimModuleSyntax` is on: use `import type` for type-only imports.
