# GAME.md

Gameplay rules and content for the hex strategy game.

## Game modes

The mode is chosen on the setup screen.

1. **Capture the map** — a player wins when they own all non-free villages; the game ends once that player's turn ends
   (i.e., after the whole round completes, not immediately upon the final capture). A player who captures the map within
   `10 + 5 × players` turns (Quick capture) gets a bonus of `players × 20` points.
2. **30 Turns** — the game ends at turn 30; the player with the highest score wins.

**Winner:** among active players, the winner is chosen by: highest total score → most kills → fewest units on the map →
alphabetical name.

## Multiplayer

A player can host a room (at least 2 human players, up to 7) with optional AI opponents, or join a room by code. Each
human player controls their own tribe; gameplay otherwise follows the single-player rules. A room starts once all
players have picked a tribe and are ready.

## Tribes

Tribes currently differ by color, a starting money bonus, or an opened starting skill.

| Tribe         | Color  | Start bonus      |
|---------------|--------|------------------|
| Cats          | pink   | Shields skill    |
| Villagers     | brown  | +8 money         |
| Warriors      | red    | Swordsman skill  |
| Barbarians    | gray   | Climbing skill   |
| Forest people | green  | Forestry skill   |
| Aqua people   | aqua   | Navigation skill |
| Sand people   | yellow | Riding skill     |

## Units

Units belong to a tribe's player. Spawned in owned villages (see Spawning). A unit can perform one action per turn; a
freshly spawned unit must wait until the next turn.

| Unit      | Move points | Attack | Attack range | HP | Spawn cost                 |
|-----------|-------------|--------|--------------|----|----------------------------|
| Warrior   | 10          | 2      | 1            | 5  | 4 money                    |
| Rider     | 40          | 2      | 1            | 4  | 6 money                    |
| Archer    | 10          | 2      | 2            | 4  | 6 money                    |
| Swordsman | 10          | 4      | 1            | 8  | 10 money + 2 ore           |
| Shield    | 10          | 0.7    | 1            | 8  | 8 money + 2 ore            |
| Catapult  | 10          | 5      | 4            | 3  | 15 money + 10 wood + 3 ore |
| Knight    | 30          | 4      | 1            | 6  | 14 money + 5 ore           |

- **Rider** additionally requires the *Riding* skill.
- **Knight** additionally requires the *Knights* skill. After killing an enemy it may attack again in the same turn;
  killing 3 units in one turn awards a 30-point **Combo kill** bonus.

- **Swordsman** additionally requires the *Swordsman* skill.
- **Shield** additionally requires the *Shields* skill.
- **Catapult** additionally requires the *Catapult* skill. It attacks at range 4 with a fixed attack value (no random
  damage roll), cannot attack in a turn in which it has already moved, and never moves onto a killed enemy's tile. A
  land catapult never counter-attacks when attacked (aboard a ship the crew still fights back with the ship's cannon).
  A catapult is the sole **siege** unit: it can also target enemy buildings within its range, using the same range/fog
  logic as enemy units. Attacking a village destroys its wall first, then (once unwalled) downgrades it one level
  (minimum 1); a village with a standing enemy unit is attacked as a normal unit instead. Mines, sawmills, ports,
  temples, forest temples and bridges are removed outright on a hit. A siege volley has the same miss chance as a
  regular attack and is never countered. AI catapults siege too: when no enemy unit is in range they shell the
  nearest reachable enemy village or production building.
- **Ships:** when a unit moves onto its own port it becomes a ship, but can't move or attack again until the next turn.
  Ships have 20/30/40 move points (levels 1/2/3) and traverse water; they can land only on coast tiles as the final
  step. A ship may always attack in the same turn it has moved (the shield/catapult "cannot attack after moving" limit
  does not apply once a unit is on a ship), but a ship can never move again in the turn it has attacked. A ship reveals
  the map with its own ship-level attack distance, regardless of the original unit type it carries. Ship attack: level
  1 = 1 at range 2, level 2 = 2 at range 2, level 3 = 3 at range 3. Upgrade costs: to level 2 = 8 money + 4 wood, to
  level 3 = 16 money + 8 wood + 2 ore; a ship can be upgraded only while standing on an owned cell. Landing on land
  converts the ship back into a normal unit and consumes the whole turn: the unit may neither move, attack, nor heal
  again until the next turn.
- **Pirates:** neutral units that belong to no tribe. From turn 7 onward, on every odd turn, there is a 15% chance a
  pirate spawns on an edge water cell. Pirates have 50 move points on sea only, have attack 3 at range 1 and 15 HP. If
  any pirate is on the map, they take their turn after all players, attacking the nearest player unit (ship or land) or
  moving toward it. A pirate adjacent to a ship tries to **capture** it with a 25% success chance: on success the ship
  becomes a pirate ship (keeping its HP and damage); on failure the pirate loses 2 HP and the ship loses 1 HP. Killing a
  pirate gives 30 points.
- **Bottles:** floating message-in-a-bottle treasures. Every third turn there is a 10% chance a bottle floats onto a
  random free (non-owned) water hex; several bottles can be on the map at once, and each lives 5 turns before
  disappearing. When a ship moves onto a bottle tile, the **Get bottle** action becomes available on the next turn
  (shown while selecting that water hex). Collecting consumes the ship's whole turn and randomly grants one effect:
  **+50 money**, a **random unopened skill**, or **+20 ship HP**. AI ships collect bottles automatically at the start of
  their turn.

## Unit actions

- **Move** — spend up to the unit's move points. Leaving a tile costs that tile's move points: land and water 10, forest
  14, mountain 20 (entering a tile is free — the cost is paid when the unit leaves it). A unit may always make a 1-tile
  move even without move points left. Mountains block movement until *Climbing* is learned, and water blocks movement
  (except for ships with *Navigation*). A rider that already attacked this turn can still move up to its full move
  points. Leaving the unit's own road tile, a road on its own territory, its own village linked to its road network, or
  a water-route tile of its own ports halves the tile's cost (rounded down), so road networks are the fast lanes.
  Movement stops at the first cell adjacent to an enemy: that cell can be entered, but cells beyond it along the path
  are not available (a unit next to an enemy can always move at least 1 cell).
- **Attack** — attack an enemy within attack range, once per turn. Combat uses a force-ratio formula with a scale
  constant of 1.5:
  `attackForce = attack × current hp / max hp`;
  `defenseForce = defense × current hp / max hp × defenseBonus`, where
  `defenseBonus = 1 + tile reduction / 10` (own village ×1.5, walled village ×1.8, temple protections ×2.0); damage to
  the target is
  `round(attackForce / (attackForce + defenseForce) × attack × 1.5)`. Each attack has a 10% chance to miss (5% if the
  attacker's owner has opened Science), dealing no damage (the attack still counts as used). If the target survives and
  is in range, it counter-attacks with
  `round(defenseForce / (attackForce + defenseForce) × defense × 1.5)`, except a land catapult never counter-attacks
  (aboard a ship the crew still fights back with the ship's cannon). A shield cannot attack in a turn in which it has
  already moved (as a ship this limit does not apply). On a kill, the attacker moves onto the target's tile (unless the
  attacker is an archer or a pirate, is a ship, or the target was a pirate or a ship).
- **Heal** — if the unit hasn't moved/attacked this turn, restore +2 HP (once per turn).
- **Capture village** — a unit standing on an enemy or free village marked capturable (red triangle) captures it.
- **Upgrade village** — costs 2 wood + 1 stone + 2 money at level 1, scaling by level (×2 wood, ×1 stone, ×2 money per
  level). Raises the village level, its claim radius, income and unit capacity.
- **Build road** — costs 5 wood + 2 stone + 10 money, requires the *Roads* skill. Connects a tile to an adjacent owned
  road, port, or village, increasing trade income. A road may only be placed on a tile that links, through the
  road/port/bridge network, back to one of the player's own villages: orphaned roads, ports, and bridges that are no
  longer connected to a village cannot be extended.
- **Build bridge** — costs 10 wood + 15 money + 5 stone, requires the *Bridges* skill. Built on a water tile between two
  land hexes: the tile becomes walkable land-with-road for units, still lets ships sail under it, and connects to
  neighbouring roads. Can't be built on a port, water temple, or occupied tile, and ports/water temples can't be built
  on a bridge.
- **Auto port connections** — a player's own ports are connected automatically, drawn as a light-blue route over the
  shortest path of own water tiles between them. Two ports connect only when a path over own water cells exists (each of
  a cluster's ports is reachable); otherwise they stay unconnected. Villages reached through a port's water route count
  as connected like roads. Water-route tiles halve the move-points cost for their owner. Connections are recomputed live
  as territory and ownership change (a captured village can dissolve or create them).

## Fog of war

Exploration is tracked separately for every player (including AI). Only tiles explored by the human player are visible
on screen; everything else shows as a gray hex that matches the height of the underlying terrain. At the start, each
player's own tiles are explored.

- When a unit moves, each cell it visits reveals all tiles within that unit's attack distance for its owner — at minimum
  the cells adjacent to the visited cell are always revealed — and revealed cells show a gray hex that flies up and
  fades away, uncovering the map underneath (animated for the human view).
- A village reveals the surrounding tiles for its owner in a circle of `territory radius + 1` hexes (level 1 → 2, level
  2–4 → 3, level 5+ → 4). This happens on game start for each owned village, when a village is upgraded, and when a
  village is captured.
- Units standing on unexplored cells are not visible; they appear only when they move onto an explored cell.

The camera follows enemy actions only when they happen on explored cells.

## Spawning

Units are spawned from an owned village by paying the unit's cost. Spawning is blocked when the village tile is occupied
or the village's unit capacity (1 + level) is full. A freshly spawned unit must wait until the next turn to act.

## Building

Factories, mines, and ports are built on owned tiles (see Buildings for requirements and costs).

## Scores

A player's total score = accumulated action score + current board score.

**Board score** (per owned tile):

- Explored tile (per player): 3
- Village on the board: 50
- Warrior / Rider / Archer on the board: 5 / 6 / 6
- Building on the board: 15 (temples give no building score)
- Bridge on the board: 5
- Each own water temple at game end: 10 / 15 / 20 / 25 by level

**Action score** (awarded immediately):

- Capture a village: 50
- Upgrade a village: 20
- Kill an enemy unit: 25
- Kill a pirate: 30
- Combo kill (a knight kills 3 units in one turn): 30
- Open a skill: 15
- Quick capture win: `players × 20`

A finished game is rated 1–3 stars by the winner's total score:

- **Capture** — 3★: score ≥ `500 + 200 × players` and finished within the quick-capture turns; 2★: score ≥
  `400 + 150 × players`; otherwise 1★.
- **30 Turns** — 3★: score ≥ `1000 + 800 × players`; 2★: score ≥ `800 + 600 × players`; otherwise 1★.

## Skills

The skill tree is shared by all players and unlocked by paying money. Cost = `3 × level + 2 × (number of already
opened skills)`. A level-2 skill requires its parent first. Skills are permanently revealed and stay active for the
whole game.

| Skill         | Level | Parent   | Effect                                                                                  |
|---------------|-------|----------|-----------------------------------------------------------------------------------------|
| Climbing      | 1     | —        | Units can move onto mountain tiles                                                      |
| Smithery      | 2     | Climbing | Allows building mines on owned mountain tiles                                           |
| Swordsman     | 2     | Climbing | Allows spawning swordsman units                                                         |
| Geology       | 2     | Science  | Mines produce +1 stone and +1 ore per round                                        |
| Water         | 1     | —        | Allows building ports on owned water tiles                                              |
| Navigation    | 2     | Water    | Naval abilities: units on ports become ships, ships can travel water and land on coasts |
| Water temples | 2     | Water    | Future water temple features                                                            |
| Forestry      | 1     | —        | Allows building factories on owned land near forests                                    |
| Forest temple | 2     | Forestry | Future forest temple features                                                           |
| Science       | 1     | —        | Allows advanced research; cuts the owner's attack miss chance to 5%                     |
| Catapult      | 2     | Science  | Allows spawning catapult units (15 money + 10 wood + 3 ore)                             |
| Roads         | 2     | Forestry | Allows building roads between villages                                                  |
| Shields       | 1     | —        | Allows spawning shield units                                                            |
| Defense       | 2     | Shields  | Unlocks the Build village walls action (coming soon)                                    |
| Riding        | 1     | —        | Allows spawning rider units                                                             |
| Bridges       | 2     | Riding   | Allows building bridges across water (10 wood + 15 money + 5 stone)                     |
| Knights       | 2     | Riding   | Allows spawning knight units (14 money + 5 ore)                                         |

## Buildings

Buildings are placed on owned tiles that have no settlement or building, and each requires its skill. No building
produces money. A building may only be placed on a tile claimed by one of your own villages, and each village can
support only as many buildings as its level allows: level 1 → 1, level 2 → 2, level 3 → 3, level 4+ → 4.

| Building | Cost                       | Skill        | Placement                                  | Production                                                                       |
|----------|----------------------------|--------------|--------------------------------------------|----------------------------------------------------------------------------------|
| Sawmill  | 10 money                   | Forestry     | land tile adjacent to a forest             | +1 wood per adjacent forest per level                                            |
| Mine     | 15 money                   | Smithery     | mountain tile                              | +1 stone and +1 ore per level (+1 stone and +1 ore with Geology)                  |
| Port     | 10 wood + 30 money + 2 ore | Water        | owned water tile adjacent to your own land | none; used to create and upgrade ships                                           |
| Temple   | 10 stone + 30 money        | Water temple | water tile                                 | none; grows +1 level every 2 turns (max 4); awards 10/15/20/25 score at game end |

## Resources

Four resources: **money**, **wood**, **stone**, **ore**. Starting amounts: 3 wood, 2 stone, 8 money, 0 ore.

Income is collected at the end of each round, after all players have taken their turns:

- **Money** — each owned village produces `max(0, 3 + level × 2 − upkeep)`, where upkeep is the maintenance of the units
  the village raised: warrior 1, archer/shield/rider 2, swordsman 3, knight 4, catapult 5 per turn; ships cost 2 / 3 / 4
  per turn by level. Income never goes below 0.
- **Wood** — from factories (see Buildings); also from the *Extract forest* action.
- **Stone** — from mines (+1 with Geology).
- **Ore** — from mines (+1 with Geology); used for swordsmen and ports.

## Map

- Hex grid. Radius depends on player count: 2 players → 8, 3 → 9, 4 → 10, 5 → 11, 6 → 12, 7 → 13.
- Terrain is generated from Perlin noise (height, temperature, rain) into 5 biomes: Grassland, Desert, Tundra, Taiga,
  Rainforest. Roughly 40% water, 10% mountains, the rest land and forest.
- Terrain types per biome: land, forest, mountain (plus water). Forests can be turned into land by the *Extract forest*
  action.
- Each player starts with a capital village (with a warrior) plus a nearby free (neutral) village. Villages are placed
  at least 3 hexes apart, and around every village there is at least one tile without a settlement.
- Free villages become capturable when an enemy unit stands on them (shown with a red triangle).

## Bonuses

- The map contains **player count + 1** bonus hexes (shown with a golden marker). They are placed on random land cells,
  at least 4 hexes from each other and from every starting village, and never inside a starting village area.
- When a unit moves onto a bonus hex, the claim becomes available on the **next turn**: the toolbar shows a **Get the
  bonus** button while one of your units stands on an eligible bonus at the start of your turn.
- Claiming exhausts the unit (it can no longer move, attack, or heal that turn). Each bonus is claimed once.
- Bonus types (random):
    - **+15 money**
    - **Resources**: +10 wood, +5 stone, +5 ore
    - **Free village upgrade**: upgrades your closest village to the bonus at no cost (falls back to +15 money if you
      own no village)
    - **Free skill**: opens one random skill you have not researched yet, of any level and without prerequisites (falls
      back to +15 money if every skill is researched)
    - **Explorer**: a semi-transparent warrior appears on the tile, makes up to 25 moves exploring the map by the
      regular rules (preferring unexplored cells, never re-stepping a cell it has already visited unless boxed in), then
      disappears
- AI players claim eligible bonuses automatically at the start of their turns and prefer to send their closest free unit
  toward unexplored bonus hexes. AI armies also stick together and gang up on single enemies.
