# Biome differences: proposals

Rule: each biome has one thing better and one thing worse than the others. No super-good and no super-bad biome.

Current state: biomes are cosmetic, except forest costs 14 to leave in all seasons except winter (10), and desert has no winter discount.

Available levers: farm food, sawmill and mine output, road/move cost, defense, building cost, season/fire/storm effects.

## Variant A: one economic plus, one economic minus (simplest)

| Biome | Better | Worse |
|---|---|---|
| Grassland | Farms +1 food (4/round) | Mines −1 stone (level 1 mine yields ore only) |
| Desert | Roads and bridges cost 30% less; land move cost 8 instead of 10 | Farms −1 food; no forest discount in winter |
| Tundra | Mountains give +1 ore per mine | Farms produce 0 in autumn too (winter is already 0) |
| Taiga | Sawmills +1 wood per level; forest move cost 10 | Roads cost +30% |
| Rainforest | Forests burn out in 2 rounds instead of 3; sawmills hold 30 | Storms and lightning more frequent |

Easy to implement: every effect is a number or multiplier. Risk: Grassland (+food) is the safest pick, so its minus has to hurt.

## Variant B: economy against war (role-based)

Each biome pushes a playstyle; every plus is paid for in a different area.

- **Grassland, growth:** village income +1 per level at levels 1–5; units on land get −2 defense (open ground).
- **Desert, mobility:** all units +10 move; upkeep food +1 per unit (scarce food).
- **Tundra, fortress:** village defense bonus +2 (×1.8 instead of ×1.6); building costs +20% stone and wood.
- **Taiga, ambush:** units on forest +3 defense; mountain move cost 30 instead of 20.
- **Rainforest, production:** farms +1 and sawmills +1; heal −5 HP per turn and fire spreads faster.

More distinct identities and ties into tribe starts (Taiga = Warriors, Tundra = Barbarians). Harder to balance because effects sit in different systems; needs `tools/ai-bench.ts`.

## Variant C: resource trade-off (the stone/road example, taken literally)

The biome shifts one resource up and one down. Mines and sawmills ±1, farms ±1 food, roads ±30% cost.

| Biome | Up | Down |
|---|---|---|
| Grassland | Food | Stone |
| Desert | Ore | Wood |
| Tundra | Stone | Food |
| Taiga | Wood | Ore |
| Rainforest | Food and wood | Road cost +50% |

Most legible: the tile tooltip says "+1 stone, farms −1". Each resource is up once and down once, so it balances on paper. Rainforest breaks the pattern and is the weak spot.

## Recommendation

Use A as the base and take 1–2 identity effects from B (Tundra fortress, Desert mobility). Verify with the bench. It resolves only about 4-point effects, so keep each effect small.

## Open questions

1. Does the biome apply per tile (a mine on desert mountain differs from one on tundra mountain) or only at the village/capital? Suggested: per tile.
2. Should the AI weigh biome when choosing where to expand? Suggested: yes, lightly.
