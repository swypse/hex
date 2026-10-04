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
