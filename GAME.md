# GAME.md

Gameplay rules and content for the hex strategy game.

## Game modes

The mode is chosen on the setup screen.

1. **Capture the map** — a player wins when they own all non-free villages; the game ends once that player's turn ends
   (i.e., after the whole round completes, not immediately upon the final capture). A player who captures the map within
   `players × 5 + 5` turns gets a fast-win bonus of `players × 10` points.
2. **30 Turns** — the game ends at turn 30; the player with the highest score wins.

**Winner:** among active players, the winner is chosen by: highest total score → most kills → fewest units on the map →
alphabetical name.

## Multiplayer

A player can host a room (at least 2 human players, up to 6) with optional AI opponents, or join a room by code. Each
human player controls their own tribe; gameplay otherwise follows the single-player rules. A room starts once all players
have picked a tribe and are ready.

## Tribes

Tribes currently differ only by color.

| Tribe         | Color   |
|---------------|---------|
| Cats          | pink    |
| Villagers     | brown   |
| Warriors      | red     |
| Barbarians    | gray    |
| Forest people | green   |
| Aqua people   | aqua    |

## Units

Units belong to a tribe's player. Spawned in owned villages (see Spawning). A unit can perform one action per turn; a
freshly spawned unit must wait until the next turn.

| Unit      | Movement | Attack | Attack range | HP | Spawn cost       |
|-----------|----------|--------|--------------|----|------------------|
| Warrior   | 1        | 2      | 1            | 5  | 4 money          |
| Rider     | 4        | 2      | 1            | 4  | 6 money          |
| Archer    | 1        | 2      | 2            | 3  | 6 money          |
| Swordsman | 1        | 4      | 1            | 8  | 15 money + 3 ore |
| Shield    | 1        | 1      | 1            | 10 | 10 money         |
| Catapult  | 1        | 5      | 4            | 3  | 30 money + 20 wood + 5 ore |
| Knight    | 3        | 5      | 1            | 5  | 20 money + 10 ore |

- **Rider** additionally requires the *Riding* skill.
- **Knight** additionally requires the *Knights* skill. After killing an enemy it may
  attack again in the same turn; killing 3 units in one turn awards a 30-point
  **Combo kill** bonus.

- **Swordsman** additionally requires the *Swordsman* skill.
- **Shield** additionally requires the *Shields* skill.
- **Catapult** additionally requires the *Catapult* skill. It deals 5–10 random damage per
  attack, cannot attack in a turn in which it has already moved, and never moves onto a
  killed enemy's tile.
- **Ships:** when a unit moves onto its own port it becomes a ship, but can't move or attack again until the next turn.
  Ships move 2/3/4 (levels 1/2/3) and traverse water; they can land only on coast tiles as the final step. A ship
  may always attack in the same turn it has moved (the shield/catapult "cannot attack after moving" limit does not
  apply once a unit is on a ship), but a ship can never move again in the turn it has attacked. A ship reveals the
  map with its own ship-level attack distance, regardless of the original unit type it carries. Ship attack: level 1
  = 1 at range 2, level 2 = 2 at range 2, level 3 = 3 at range 3. Upgrade costs: to level 2 = 8 money + 4 wood, to
  level 3 = 16 money + 8 wood + 2 ore; a ship can be upgraded only while standing on an owned cell. Landing on land
  converts the ship back into a normal unit and consumes the whole turn: the unit may neither move, attack, nor heal
  again until the next turn.
- **Pirates:** neutral units that belong to no tribe. From turn 7 onward, on every odd turn, there is a 15% chance a
  pirate spawns on an edge water cell. Pirates move 5 on sea only, have attack 3 at range 1 and 15 HP. If any pirate is on
  the map, they take their turn after all players, attacking the nearest player unit (ship or land) or moving toward it.
  A pirate adjacent to a ship tries to **capture** it with a 25% success chance: on success the ship becomes a pirate ship
  (keeping its HP and damage); on failure the pirate loses 2 HP and the ship loses 1 HP. Killing a pirate gives 30 points.

## Unit actions

- **Move** — move up to the unit's movement. Mountains block movement until *Climbing* is learned. Water blocks movement
  (except for ships with *Navigation*). A rider that already attacked this turn can still move up to its full movement. Movement
  stops at the first cell adjacent to an enemy: that cell can be entered, but cells beyond it along the path are not
  available (a unit next to an enemy can always move at least 1 cell).
- **Attack** — attack an enemy within attack range, once per turn. Damage = `round(attack × current hp / max hp)`. Each
  attack has a 10% chance to miss (5% if the attacker's owner has opened Science), dealing no damage (the attack still
  counts as used). If the target survives and is in
  range, it counter-attacks. A defending shield counters with `round(7 × current hp / max hp)`. A shield cannot attack in
  a turn in which it has already moved (as a ship this limit does not apply). On a kill, the attacker moves onto the
  target's tile (unless the attacker is an
  archer or a pirate, is a ship, or the target was a pirate or a ship).
- **Heal** — if the unit hasn't moved/attacked this turn, restore +2 HP (once per turn).
- **Capture village** — a unit standing on an enemy or free village marked capturable (red triangle) captures it.
- **Upgrade village** — costs 2 wood + 1 stone + 2 money at level 1, scaling by level (×2 wood, ×1 stone, ×2 money per
  level). Raises the village level, its claim radius, income and unit
  capacity.
- **Build road** — costs 5 wood + 2 stone + 10 money, requires the *Roads* skill. Connects a tile to an adjacent owned
  road, port, or village, increasing trade income.
- **Build bridge** — costs 10 wood + 15 money + 5 stone, requires the *Bridges* skill. Built on a water tile between two
  land hexes: the tile becomes walkable land-with-road for units, still lets ships sail under it, and connects to
  neighbouring roads. Can't be built on a port, water temple, or occupied tile, and ports/water temples can't be built
  on a bridge.

## Fog of war

Exploration is tracked separately for every player (including AI). Only tiles explored by the human player are visible on
screen; everything else shows as a gray hex that matches the height of the underlying terrain. At the start, each player's
own tiles are explored.

- When a unit moves, each cell it visits reveals all tiles within that unit's attack distance for its owner — revealed
  cells show a gray hex that flies up and fades away, uncovering the map underneath (animated for the human view).
- Upgrading a village explores the whole village's territory for its owner.
- Capturing a village explores all the village's tiles for the capturer.
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
- Fast capture-mode win: `players × 10`

## Skills

The skill tree is shared by all players and unlocked by paying money. Cost = `3 × level + 2 × (number of already
opened skills)`. A level-2 skill requires its parent first. Skills are permanently revealed and stay active for the
whole game.

| Skill         | Level | Parent   | Effect                                                                                  |
|---------------|-------|----------|-----------------------------------------------------------------------------------------|
| Climbing      | 1     | —        | Units can move onto mountain tiles                                                      |
| Smithery      | 2     | Climbing | Allows building mines on owned mountain tiles                                           |
| Swordsman     | 2     | Climbing | Allows spawning swordsman units                                                         |
| Geology       | 2     | Science  | Mines produce +1 ore per round                                                          |
| Water         | 1     | —        | Allows building ports on owned water tiles                                              |
| Navigation    | 2     | Water    | Naval abilities: units on ports become ships, ships can travel water and land on coasts |
| Water temples | 2     | Water    | Future water temple features                                                            |
| Forestry      | 1     | —        | Allows building factories on owned land near forests                                    |
| Forest temple | 2     | Forestry | Future forest temple features                                                           |
| Science       | 1     | —        | Allows advanced research; cuts the owner's attack miss chance to 5%                     |
| Catapult      | 2     | Science  | Allows spawning catapult units (30 money + 20 wood + 5 ore)                             |
| Roads         | 2     | Forestry | Allows building roads between villages                                                  |
| Shields       | 1     | —        | Allows spawning shield units                                                             |
| Defence       | 2     | Shields  | Unlocks the Build village walls action (coming soon)                                     |
| Riding        | 1     | —        | Allows spawning rider units                                                              |
| Bridges       | 2     | Riding  | Allows building bridges across water (10 wood + 15 money + 5 stone)                       |
| Knights       | 2     | Riding   | Allows spawning knight units (20 money + 10 ore)                                         |

## Buildings

Buildings are placed on owned tiles that have no settlement or building, and each requires its skill. No building
produces money. A building may only be placed on a tile claimed by one of your own villages, and each village can
support only as many buildings as its level allows: level 1 → 1, level 2 → 2, level 3 → 3, level 4+ → 4.

| Building | Cost                       | Skill         | Placement    | Production                                                           |
|----------|----------------------------|---------------|--------------|----------------------------------------------------------------------|
| Sawmill | 10 money                   | Forestry      | land tile adjacent to a forest | +1 wood per adjacent forest per level               |
| Mine     | 15 money                   | Smithery      | mountain tile                  | +1 stone and +1 ore per level (+1 ore with Geology) |
| Port     | 10 wood + 30 money + 2 ore | Water         | water tile                     | none; used to create and upgrade ships              |
| Temple   | 10 stone + 30 money        | Water temple  | water tile                     | none; grows +1 level every 2 turns (max 4); awards 10/15/20/25 score at game end |

## Resources

Four resources: **money**, **wood**, **stone**, **ore**. Starting amounts: 3 wood, 2 stone, 5 money, 0 ore.

Income is collected at the end of each round, after all players have taken their turns:

- **Money** — each owned village produces `max(0, 3 + level − overflow)`, where overflow is the number of village units
  above its capacity (capacity = 1 + level).
- **Wood** — from factories (see Buildings); also from the *Extract forest* action.
- **Stone** — from mines.
- **Ore** — from mines (+1 with Geology); used for swordsmen and ports.

## Map

- Hex grid. Radius depends on player count: 2 players → 8, 3 → 9, 4 → 10, 5 → 11, 6 → 12.
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
- When a unit moves onto a bonus hex, the claim becomes available on the **next turn**: the toolbar shows a
  **Get the bonus** button while one of your units stands on an eligible bonus at the start of your turn.
- Claiming exhausts the unit (it can no longer move, attack, or heal that turn). Each bonus is claimed once.
- Bonus types (random):
  - **+15 money**
  - **Resources**: +10 wood, +5 stone, +5 ore
  - **Free village upgrade**: upgrades your closest village to the bonus at no cost (falls back to +15 money if you own no village)
  - **Free skill**: opens one random skill you have not researched yet, of any level and without prerequisites (falls back to +15 money if every skill is researched)
  - **Explorer**: a semi-transparent warrior appears on the tile, makes up to 25 moves exploring the map by the regular rules (preferring unexplored cells, never re-stepping a cell it has already visited unless boxed in), then disappears
- AI players claim eligible bonuses automatically at the start of their turns and prefer to send their closest free
  unit toward unexplored bonus hexes. AI armies also stick together and gang up on single enemies.
