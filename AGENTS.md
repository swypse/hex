# AGENTS.md

Base project information for AI agents.

## Overview

2D turn-based strategy on a hex map, singleplayer or multiplayer. The gameplay rules and content are documented in
`GAME.md`.

## Tech stack

- TypeScript
- PixiJS 8 (map rendering)
- React (UI / HUD)
- Zustand (state store)
- Vite (dev/build: `npm run dev`, `npm run build`)
- Vitest (tests: `npm test`), `npm run typecheck`

## Codestyle

- Private member names of typescript classes starts with _
- Files and dirs naming convention: kebab-case
