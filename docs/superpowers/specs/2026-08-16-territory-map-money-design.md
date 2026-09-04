# Design: Territory stealing, village spacing, map size, money block

Date: 2026-08-16

## Goal

- Free village territory can be stolen by player villages (except the free village's own tile), at map generation and on expansion.
- Minimum distance between any two villages is 2.
- Starting villages sit at distance ≥ 2 from the map edge; map radius grows accordingly.
- Move resources display into the top-center money block; remove the top-right panel.

## Map radius & edge rule (`src/game/mapGen.ts`)

- `mapRadiusFor`: 2 players → `6`, 3 players → `7` (old + 2), giving room for the edge constraint while preserving usable area.
- Starting village candidates restricted to tiles with `hexDistance(center, tile) <= radius - 2` (i.e., ≥ 2 from the map edge).
- Village spacing: settlement candidates exclude tiles within distance 1 of any already-placed village's neighbors (existing `reserved` mechanism) and require `hexDistance` ≥ 2 from all placed villages.

## Territory stealing from free villages

A player's village claim wins over a free village's claim, at map generation and on upgrade expansion, except it never steals the free village's own tile.

Shared claim rule (used by `mapGen` claim loop and `village.upgradeVillage`):
- Target unclaimed (`claimedByVillage === null`) → claim it; set `ownedBy` if the claiming settlement has an owner.
- Target claimed by a **free** village (`ownedBy === null`, `claimedByVillage` set) and target is **not** that free village's own settlement tile → steal: set `ownedBy` = claiming player, `claimedByVillage` = claiming village.
- Target claimed by another player's village → leave it (first-claim-wins between players).
- The free village's own tile is never stolen by claim/expansion (only via capture).

## Money block

- Expand the top-center money block (under `#turn-info`) to:
  `⭐ {money} [brown square] Wood: {wood} [gray square] Stone: {stone}`
- Brown square `#8b5a2b`, gray square `#9a9a9a` (inline spans).
- Remove the top-right `#resources-info` panel, its CSS, and the `ResourcesInfo` component.

## Tests

- `mapGen`: radius 6/7; starting villages ≥ 2 from edge; all villages pairwise distance ≥ 2; player village steals free territory (except the free village's own tile) at generation.
- `village`: upgrade expansion steals free territory (except the free village's own tile); does not steal other players' territory.
- Manual: free village borders shrink when a neighbor expands; money block shows `⭐ money`, wood, and stone with colored squares.
