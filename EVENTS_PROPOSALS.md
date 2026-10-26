# Events proposals

Existing: storm, drought, earthquake, lightning (+ fire), seasons (winter ice). Proposals reuse the weather schedule
(`WEATHER_RULES`: centre + radius + lifetime, max 2 active) unless noted. Numbers are starting points for tuning.

## Weather

| Event | Where / duration | Effect | Counter / counterplay |
|-------|------------------|--------|-----------------------|
| **Blizzard** | Tundra/taiga land or any land in winter, 4 turns, r 2-3 | Units in scope move at 2× cost and can't attack at range > 1; farms give 0 | Mountain-adjacent tiles sheltered; Forest temple radius immune |
| **Flood** | Land next to water, 3 turns, r 2-3 | Roads/bridges in scope are unusable, farms halved, land units can't enter low (non-forest, non-mountain) tiles; ships may sail in | Port/bridge-adjacent tiles spared; Water temple radius immune |
| **Heat wave** | Desert/grassland, 4 turns, r 2-4 | Forests in scope ignite 10% per turn (fire system); units end turn with −5 HP unless next to water | Extinguish fire; Water temple radius immune |
| **Fog** | Anywhere, 4 turns, r 3 | Vision of everything in scope drops to 1 hex; stalkers/traps unaffected; no ranged attacks beyond 1 | Banner/watchtower ignores fog |
| **Hail** | Land, 2 turns, r 2 | Each unit −10 HP, each farm destroyed with 30% | Units on forest or in buildings spared |
| **Tornado** | Land, 5 turns, r 1, moves 1 tile/turn (50% toward nearest village) | Buildings in scope destroyed 40%, units in scope are pushed 1 hex in a random direction and take 15 | Walls block push; Forest temple radius immune |
| **Tsunami** | Spawns on water edge, 1 turn, r 2-4 along the coast | Ports/bridges destroyed 50%, ships −20 HP, coastal land units −10 HP | Water temple radius immune; Port level ≥ 2 halves chance |
| **Sandstorm** | Desert only, 4 turns, r 2-3 | Units in scope can't see past 1 hex, ranged attacks −50% dmg, mines/farms −1 output | Forest temple radius immune |
| **Aurora** | Tundra/taiga, 3 turns, r 3 | Positive: units in scope heal +5/turn, vision +1; draws everyone toward a neutral area | Contested objective |
| **Rainbow / fertile rain** | Land, 3 turns, r 2-4 | Positive: farms in scope +1 food, forests regrow burnt tiles → land becomes forest after the event with 30% | Pairs well with Drought as a swing |

## World events (non-weather)

| Event | Trigger | Effect |
|-------|---------|--------|
| **Plague** | Village level ≥ 3 with ≥ 6 units fed from it, every ~15 turns, 10% | Village's units −10 HP/turn for 3 turns; spreads 30% to adjacent villages (any owner); University cuts duration to 1 |
| **Wildfire spread** | Existing fire + heat wave/drought | Fire expansion chance 50% → 80%; forests burn 4 turns |
| **Volcano eruption** | Random mountain, once per game after turn 20, r 2 + lava trail 3 tiles | Lava tiles impassable 5 turns, buildings destroyed, units −40; afterwards fertile land (+1 farm yield) |
| **Meteor** | Any tile, 1 turn warning (marker), r 1 | Next turn: everything in scope destroyed/−50 HP, leaves a crater (mountain-like, ore +1 for a mine built on it) |
| **Pirate raid wave** | Every ~12 turns, 25% | 2-3 extra pirate ships spawn at map edge near the weakest port |
| **Merchant caravan** | Every ~10 turns, 20% | Neutral caravan walks between two villages; capturing/escorting it grants 20-40 money; attack kills it, 0 reward |
| **Bountiful harvest** | Autumn only, 30% per autumn | All farms +1 food for the season; granary capacity +5 |
| **Rebellion** | Village with starvation ≥ 3 rounds, 30%/round | Village flips to neutral, its units become unowned; recapture by walking in |
| **Eclipse** | Once per game, turn ≥ 30 | 3 turns: all vision −1, stalkers/traps invisible to everyone, stormcaller lightning free |
| **Wandering tribe** | Every ~20 turns, 15% | Neutral warband (3 units) spawns on a free land tile; kills give 15 money each; targets nearest village |

## Seasonal variants

- **Spring floods** — flood chance ×2 in spring on tiles next to thawed ice.
- **Summer heat wave / drought** — chance ×1.5 in summer.
- **Autumn storms** — storm chance ×1.5, radius +1.
- **Winter blizzard** — only in winter; replaces drought in the type pool.

## Implementation notes

- Add types to `WeatherType` and (if looping) `WeatherEffectKind`; tune in `WEATHER_RULES`; per-type pool filtered by season/biome.
- Immunity pattern already exists (water/forest temples); reuse for new events.
- World events go to a separate `WorldEvent` module (like `pirates`), delegated via `SimContext`, saved with game state.
- All events: HUD `Name N/M` entry, start/end notification (existing pipeline), AI avoidance in `planner` (don't park units in scope).

## Suggested first batch (cheap, distinct)

1. **Blizzard** — reuses the movement-cost hook from storm.
2. **Flood** — reuses road/bridge logic and gives water temples more value.
3. **Fog** — touches only vision; no balance risk.
4. **Plague** — new pressure on big armies, uses the food/home-village link.
5. **Tornado** — moving hazard; most visible/fun.
