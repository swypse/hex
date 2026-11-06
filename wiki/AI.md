# AI

How computer players behave. Code: `src/game/ai/` (`planner/`, `strategy/`, `situation/`, `patterns/`, `config/`; folder map in its `README.md`). Game rules: [Game.md](Game.md).

Contents: [Turn flow](#turn-flow) · [Situation and stance](#situation-and-stance) · [Strategy and goals](#strategy-and-goals) ·
[Patterns](#patterns) · [Difficulty](#difficulty) · [Personalities](#personalities) · [Flags](#flags) · [Towers](#towers)

## Turn flow

Each AI turn: start-of-turn upkeep (veterans, bonuses, bottles, trade), then planning and executing actions until nothing
useful is left. The default *live* engine re-plans after every action on the fresh map; the *batch* engine plans the whole
turn at once.

1. **Situation** — reads the map: enemies, dangers, powers, free villages, naval threats.
2. **Strategy** — keeps a few long-lived goals and turns them into *directives* (front target, muster, spawn plan, money
   reserve, skill chain, pace).
3. **Patterns** — tactics tried in priority order (offense, defense, unit roles, raids, naval, growth); the first that
   yields actions wins the step.
4. **Candidates** — building, upgrade, road, bridge and skill options are scored and the best affordable one is taken
   (small random jitter breaks ties).

The AI opens a new game with a fixed build order in its first village: upgrade to level 2, sawmill, mine, farm, granary
(skipping stages the terrain does not allow). Every other own village (for example a captured free one) then gets its sawmill and mine before any other building; only urgent hunger lets a farm or granary jump the queue.

## Situation and stance

| Stance | When |
|---|---|
| **defend** | an enemy stands on an own village, or an own village/unit is in danger |
| **war** | Capture mode, an enemy village is known, 3+ units and own power ≥ enemy power × `warRatio` |
| **settle** | otherwise: expand, build, claim free villages |

Danger is judged over a *garrison horizon* of enemy turns (`guardWindow`). An empty own village an enemy can reach is a
priority to garrison. A visible naval enemy within `navalThreatRadius` triggers a naval response (ports, ships,
catapults).

## Strategy and goals

Goals are re-planned every `planIntervalTurns`; a running goal keeps a head start so the AI does not flip-flop. The
personality's weights multiply each goal's score.

| Goal | Effect |
|---|---|
| **economy** | slow pace, money reserve 12, economy skill chain (farms, mines, upgrades); dropped once enough production buildings stand (`economyCap`) |
| **army** | picks a target village (near, weakly held, high level, free villages favoured), musters units, then assaults when own power ≥ enemy power × `assaultRatio` |
| **defense** | reserve 0, defenders spawned at an empty village, units gather there |
| **naval** | naval skill chain (Water, Navigation, ports), ships |
| **score** | grabs free villages and score sources (30 Turns mode) |

An army goal moves through *muster* (gather near the target until `musterMinUnits × musterFactor` units are there or the
force is strong enough) and *assault*. Idle units form *squad operations*: gather at a rally hex 3-5 hexes from the
target, then strike together; called off when the squad is clearly weaker than the defenders.

## Patterns

Tried from highest priority down. Groups:

- **Offense** (500-110) — kills, focus fire, group attacks, captures, solo hunts, entering emptied villages.
- **Defense** (106-90) — emergency upgrade for a swordsman, securing free villages, garrisoning, healing, defender
  spawns, towers.
- **Units** (88-78) — role behaviour of special units (banner, trapper, stalker, builder, stormcaller, ...).
- **Raids** — go for enemy buildings (granary > university > farm > mine > sawmill): catapults siege, others burn
  farms/granaries.
- **Naval**, **anti-catapult**, **growth** (explore frontier, special-unit spawns, lightning, repairs, mines/sawmills).

## Difficulty

Chosen on the setup screen; independent of personality.

| | Easy | Normal | Hard |
|---|---|---|---|
| Random mistake chance | 25% | 0 | 0 |
| Guard window (enemy turns of warning) | 1 | 2 | 3 |
| War ratio (power needed) | 2.5 | 1.5 | 1.0 |
| Checks trade is favourable | no | yes | yes |
| Spawn money reserve | 8 | 4 | 0 |
| Naval threat radius | 6 | 10 | 14 |
| One-step safety review | no | no | yes |
| Plan interval (turns) | 6 | 4 | 2 |
| Muster factor / assault ratio | 0.6 / 1.8 | 1.0 / 1.3 | 1.5 / 1.0 |
| Production buildings before economy goal ends | 1 | 2 | 2 |

## Personalities

Every AI player has one play style, picked from a hash of its name (stable per name; the user cannot choose it). Same
tribe, different game: goal weights steer economy vs army, the rest tune spawns, spending, retreating and tech.

| | Aggressive | Balanced | Builder | Raider |
|---|---|---|---|---|
| Idea | attacks first, captures over building up | equal share, default everything | economy first, big ranged-supported push later | fast cheap units, small squads, hits buildings |
| Goal weights (eco / army / def / naval / score) | 0.6 / 2.0 / 0.9 / 0.4 / 1.0 | 1.0 / 1.0 / 1.0 / 0.7 / 1.0 | 2.0 / 0.6 / 1.1 / 1.2 / 1.0 | 0.8 / 1.6 / 0.8 / 0.6 / 1.0 |
| Muster size | 3 | 4 | 5 | 2 |
| Preferred offense units | knight, swordsman, warrior | default priority | catapult, archer, knight | rider, knight, catapult |
| Money reserve shift | −2 (spends sooner) | 0 | +4 (saves) | −2 |
| Retreats to heal at | 35% hp | 50% | 60% | 40% |
| Tech order | Climbing, Smithery, Swordsman, Riding, Knights, ... | default order | Agriculture, Science, Geology, Smithery, Roads, ... | Climbing, Riding, Smithery, Swordsman, Knights, Catapult |
| Trade price (× fair value) | 1.3 | 1.15 | 1.0 | 1.25 |

## Flags

Independently switchable behaviours (`config/flags.ts`); the benchmark flips them on alternate seats to measure each.
On by default: military skills early, berserker hold, stunner hunt, squad operations, march (idle units walk toward
the frontier), finishers, building raids, lookahead, attack plans, trade, army-first upgrades, kill chains,
network links, towers. Off by default: early farm (the opening builds sawmill and mine first, then farms), multiple special units, unit-composition counters, group siege,
garrison reserve (all benchmarked without gain or untested).

## Towers

With the `towers` flag, a village with 3+ visible enemy land units within 4 hexes gets a tower: on an own, buildable
cell within 2 hexes of the village, closer to the enemies' centre than the village is (nearest the enemies first, then
nearest the village). Skipped when an own tower already stands within 3 hexes. While a village is pressed, the AI opens
Shields → Defense → Tower step by step. All personalities do this alike. Any AI unit also attacks an enemy tower in reach when no enemy
unit is.
