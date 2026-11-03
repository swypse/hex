# Design: Village sprites over terrain

Date: 2026-08-16

## Goal

Make villages visible on the world map. A village is drawn as a black circle sprite on top of its terrain tile — the terrain stays visible underneath. Replaces the previous behavior where settlement tiles filled the whole hex with the tribe color (or gray for neutral).

## Model change (`MapTile`)

`MapTile` changes from `{ q, r, type: TileType, owner: number | null }` to:

```ts
{ q, r, terrain: TileType, settlement: { owner: number | null } | null }
```

- `terrain` — always a real terrain type (never `TileType.Settlement`).
- `settlement: null` — no village on this tile.
- `settlement: { owner: null }` — free/neutral village.
- `settlement: { owner: n }` — village owned by player `n`.

## mapGen changes

- Tiles are initialized with a terrain type for every tile. Settlement tiles get terrain from `TERRAIN_TYPES` (land-ish types only, so villages never sit on water/mountain); other reserved tiles also use `TERRAIN_TYPES`; unreserved tiles use `WEIGHTED_TERRAIN` as before.
- Placing a village attaches `settlement` to the tile instead of overwriting `type`.

## Renderer changes

- Every tile draws its terrain hex sprite.
- Settlement tiles additionally draw a black circle sprite at the same position (drawn on top).
- `TextureSet` drops `tribeTextures` and `neutralSettlementTexture`; adds a single `villageTexture` (black circle).
- `renderMap` signature drops the now-unused `players` parameter: `renderMap(app, map, textures, hexSize?)`.

## Tests

- mapGen tests switch from `t.type === TileType.Settlement` to `t.settlement !== null`.
- Owned/free assertions use `t.settlement.owner`.
- New assertion: every settlement tile keeps a real terrain type (in `TERRAIN_TYPES`).
- Settlement adjacency test checks neighbors' `settlement` is null.
