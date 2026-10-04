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

| Unit      | Move points | Attack | Defense | Attack range | HP | Spawn cost                 |
|-----------|-------------|--------|---------|--------------|----|----------------------------|
| Warrior   | 10          | 20     | 10      | 1            | 50 | 4 money                    |
| Rider     | 40          | 22     | 8       | 1            | 45 | 6 money                    |
| Archer    | 10          | 26     | 7       | 2            | 40 | 6 money                    |
| Swordsman | 10          | 40     | 16      | 1            | 80 | 10 money + 2 ore           |
| Shield    | 10          | 7      | 20      | 1            | 80 | 8 money + 2 ore            |
| Catapult  | 10          | 50     | 0       | 4            | 30 | 15 money + 10 wood + 3 ore |
| Knight    | 30          | 40     | 12      | 1            | 70 | 14 money + 5 ore           |

### Special units

Each tribe has one special unit it alone can spawn (no skill required; the tribe is the gate). Every special unit has
its own artwork and its own spawn-popup icon (`action-spawn-<type>`).

| Unit        | Tribe      | Move | Attack | Range | HP | Defense | Cost             |
|-------------|------------|------|--------|-------|----|---------|------------------|
| Stalker     | Cats       | 20   | 10     | 1     | 20 | 0       | 9 money + 2 ore  |
| Builder     | Villagers  | 8    | 10     | 1     | 40 | 0       | 15 money         |
| Banner      | Warriors   | 8    | 10     | 1     | 30 | 0       | 7 money + 2 ore  |
| Berserker   | Barbarians | 10   | 26     | 1     | 50 | 8       | 10 money + 2 ore |
| Trapper     | Forest     | 10   | 20     | 1     | 44 | 8       | 6 money + 2 ore  |
| Stormcaller | Aqua       | 20   | 20     | 1     | 44 | 8       | 6 money + 2 ore  |
| Stunner     | Sand       | 8    | 20     | 2     | 40 | 10      | 7 money + 2 ore  |

- **Stalker (stealth)** — Spawned visible. Its first move after spawning enables stealth: it becomes invisible to every
  other player before the walk starts (the owner still sees it, slightly dimmed). A visible stalker can use the
  "Enable stealth" action to hide in place, consuming its whole turn. Attacking from stealth ignores the target's
  defense and reveals the stalker. An enemy whose move would step onto a hidden stalker stops one cell short and reveals
  it; if the stalker was the very first cell of the path, the enemy keeps its move. Hidden stalkers are never shown as
  attackable, never block enemy pathing, and are invisible to the AI. Enemy villages spot a hidden stalker: moving to a
  cell adjacent to an enemy village asks for a confirm ("your stealth will be disabled"); confirming moves the stalker
  there and reveals it, and every player sees "Stalker in the {village}!". A stealthed stalker can never move onto an
  enemy village's cell (even an empty one), a stalker standing next to an enemy village can't enable stealth, and a
  stealthed stalker left beside a free village is revealed instantly if an enemy captures it.
- **Builder (building)** — Consumes its turn to build a sawmill, mine, port or bridge on its own or an adjacent owned
  cell — no building skill required, costs unchanged. Cannot build while aboard a ship.
- **Banner (war cry)** — Allies within 2 hexes (never the banner itself) gain +5 attack; bonuses from several banners
  do not stack, and the bonus disappears when the banner dies. Recipients show an `attack-16` icon with `+5` next to
  their HP bar.
- **Berserker (rage)** — At 35% HP or less it gains +10 attack and takes no counter-attack damage. Shows an
  `attack-16` icon with `+10` while raging.
- **Trapper (thorn trap)** — Consumes its turn to place a trap on a non-water cell it stands on or is adjacent to
  (radius 1), as long as that cell has no village/building, no unit standing on it, and no trap already there (cost 5
  money + 3 ore). Traps are visible only to the trapper's owner, last 10 turns, and vanish when triggered. An enemy
  unit that moves onto a trap stops there and takes ~45 damage (attack 30 at full HP vs. defense 0); the trap
  disappears. A melee unit that kills someone and advances onto their tile also trips a trap buried there.
- **Stormcaller (storm)** — While standing on an owned cell of its own village that has water tiles (including aboard a
  ship on an owned village water tile), the "Storm" action is available. It consumes the whole turn and strikes every
  enemy or pirate ship on that village's water tiles for ~90 damage each. Own ships are untouched.
- **Stunner (stun)** — A range-2 target is always stunned; a range-1 target lets you pick a regular attack or a stun. A
  stun deals no damage but the target cannot act this turn (if it has not acted yet) or next turn (if it already has);
  it provokes no counter-attack. Stunned units show a `stunned` tag on their HP text and cannot counter-attack while
  dazed.

- **Rider** additionally requires the *Riding* skill.
- **Knight** additionally requires the *Knights* skill. After killing an enemy it may attack again in the same turn;
  killing 3 units in one turn awards a 30-point **Combo kill** bonus.

- **Swordsman** additionally requires the *Swordsman* skill.
- **Shield** additionally requires the *Shields* skill.
- **Catapult** additionally requires the *Catapult* skill. It attacks at range 4 with a fixed attack value (no random
  damage roll), cannot attack in a turn in which it has already moved, and never moves onto a killed enemy's tile. A
  land catapult never counter-attacks when attacked (aboard a ship the crew still fights back with the ship's cannon). A
  catapult is the sole **siege** unit: it can also target enemy buildings within its range, using the same range/fog
  logic as enemy units. Attacking a village destroys its wall first, then (once unwalled) downgrades it one level
  (minimum 1); a village with a standing enemy unit is attacked as a normal unit instead. Mines, sawmills, ports,
  temples, forest temples and bridges are removed outright on a hit. A siege volley has the same miss chance as a
  regular attack and is never countered. AI catapults siege too: when no enemy unit is in range they shell the nearest
  reachable enemy village or production building.
- **Ships:** when a unit moves onto its own port it becomes a ship, but can't move or attack again until the next turn.
  Ships have 20/30/40 move points (levels 1/2/3) and traverse water; they can land only on coast tiles as the final
  step. A ship may always attack in the same turn it has moved (the shield/catapult "cannot attack after moving" limit
  does not apply once a unit is on a ship), but a ship can never move again in the turn it has attacked. A ship reveals
  the map with its own ship-level attack distance, regardless of the original unit type it carries. Ship attack: level
  1 = 10 at range 2, level 2 = 20 at range 2, level 3 = 30 at range 3. Upgrade costs: to level 2 = 8 money + 4 wood, to
  level 3 = 16 money + 8 wood + 2 ore; a ship can be upgraded only while standing on an owned cell. Landing on land
  converts the ship back into a normal unit and consumes the whole turn: the unit may neither move, attack, nor heal
  again until the next turn.
- **Pirates:** neutral units that belong to no tribe. From turn 7 onward, on every odd turn, there is a 15% chance a
  pirate spawns on an edge water cell. Pirates have 50 move points on sea only, attack 15 at range 3, defense 5 and 80
  HP. If any pirate is on the map, they take their turn after all players. Each pirate hunts one tribe at a time (the one
  with the nearest unit when it appears): it attacks that tribe's nearest unit (ship or land) or moves toward it. After
  **3 attacks** on the same tribe it picks another tribe and heads for that tribe's units. It remembers its last two
  target tribes and never picks from them, so it can come back to the first tribe only after two attack cycles; with two
  players it simply switches to the other tribe. A pirate also switches when its tribe has no units left or has a deal
  with it. A pirate adjacent to a ship tries to **capture** it with a 25% success chance: on success
  the ship becomes a pirate ship (keeping its HP and damage); on failure the pirate loses 2 HP and the ship loses 1 HP.
  Killing a pirate gives 30 points.
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
   `round(defenseForce / (attackForce + defenseForce) × defense × 1.5 × 2)`, except a land catapult never
   counter-attacks (aboard a ship the crew still fights back with the ship's cannon). Every counter-attack is doubled
   (`COUNTER_SCALE` = 2, so a counter is no longer dwarfed by the blow that provoked it); a **shield** keeps the same
   ×2 (`SHIELD_COUNTER_SCALE`), so its counter-attack is as strong as before and attacking a shield head-on still
   hurts: it is dangerous to strike one without killing it. A shield cannot
   attack in a turn in which it has
  already moved (as a ship this limit does not apply). On a kill, the attacker moves onto the target's tile (unless the
  attacker is an archer or a pirate, is a ship, or the target was a pirate or a ship).
- **Heal** — if the unit hasn't moved/attacked this turn, restore +15 HP (once per turn).
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
| Geology       | 2     | Science  | Mines produce +1 stone and +1 ore per round                                             |
| Water         | 1     | —        | Allows building ports on owned water tiles                                              |
| Navigation    | 2     | Water    | Naval abilities: units on ports become ships, ships can travel water and land on coasts |
| Water temples | 2     | Water    | Future water temple features                                                            |
| Forestry      | 1     | —        | Allows building factories on owned land near forests                                    |
| Forest temple | 2     | Forestry | Future forest temple features                                                           |
| Science       | 1     | —        | Allows advanced research; cuts the owner's attack miss chance to 5%; farms yield 3 food (0 in winter) |
| Catapult      | 2     | Science  | Allows spawning catapult units (15 money + 10 wood + 3 ore)                             |
| Roads         | 2     | Forestry | Allows building roads between villages                                                  |
| Shields       | 1     | —        | Allows spawning shield units                                                            |
| Defense       | 2     | Shields  | Unlocks the Build village walls action (coming soon)                                    |
| Riding        | 1     | —        | Allows spawning rider units                                                             |
| Bridges       | 2     | Riding   | Allows building bridges across water (10 wood + 15 money + 5 stone)                     |
| Knights       | 2     | Riding   | Allows spawning knight units (14 money + 5 ore)                                         |
| Agriculture   | 1     | —        | Allows building farms (15 money + 5 wood)                                              |
| Granary       | 2     | Agriculture | Allows building granaries next to farms (20 money + 10 wood + 10 stone)              |

## Buildings

Buildings are placed on owned tiles that have no settlement or building, and each requires its skill. No building
produces money. A building may only be placed on a tile claimed by one of your own villages, and each village can
support only as many buildings as its level allows: level 1 → 1, level 2 → 2, level 3 → 3, level 4+ → 4.

| Building | Cost                       | Skill        | Placement                                  | Production                                                                       |
|----------|----------------------------|--------------|--------------------------------------------|----------------------------------------------------------------------------------|
| Sawmill  | 10 money                   | Forestry     | land tile adjacent to a forest             | +1 wood per adjacent forest per level                                            |
| Mine     | 15 money                   | Smithery     | mountain tile                              | +1 stone and +1 ore per level (+1 stone and +1 ore with Geology)                 |
| Port     | 10 wood + 30 money + 2 ore | Water        | owned water tile adjacent to your own land | none; used to create and upgrade ships                                           |
| Temple   | 10 stone + 30 money        | Water temple | water tile                                 | none; grows +1 level every 2 turns (max 4); awards 10/15/20/25 score at game end |
| Farm     | 15 money + 5 wood | Agriculture | own empty land tile (no forest, mountain or water; a road is fine) with no enemy unit on it | +2 food per round (+3 with Science); 0 in winter |
| Granary  | 20 money + 10 wood + 10 stone | Granary    | own empty land tile next to one of your farms, no enemy unit on it | stores up to 50 food that adjacent farms did not need; starts at 0 |

## Resources

Five resources: **money**, **wood**, **stone**, **ore**, **food**. **Money belongs to the player.** Wood, stone, ore and
food are held by **villages**: each village keeps its own stock, and the villages of one road/port network (the same
network as food, below) pool their stock — anything built, spawned or upgraded can use what the whole network holds. A
village with no road or port connection can use only its own stock; there are no other transfers.

Starting amounts: 8 money for the player; the capital starts with 3 wood, 2 stone, 0 ore and 25 food. Every other
village starts with nothing.

Who pays for what: an action done in or on a village's territory (a building, repair, spawn, village upgrade, wall, port
or ship upgrade, bridge, road, trap) draws its wood, stone, ore and food from that village's network, taking from the
village itself first and then from the rest of the network (most developed first). On land no village claims, the
nearest own village pays. A road also draws on the networks it joins: the materials of every own village linked to
the new tile's neighbouring villages, roads and ports count, after the paying village's own network. Skills, disbanding and pirate deals cost money only. An action is available only if the money
and the network's materials cover it.

A **captured** village keeps its stock, so the captor gets it, and a captured village's granaries keep their food for
the captor. A village captured with nothing in stock (a free village, or an enemy one that ran dry) starts like a
capital: 3 wood, 2 stone, 0 ore and 25 food (no money).

Income is collected at the end of each round, after all players have taken their turns:

- **Money** — each owned village produces `max(0, 3 + level × 2 − upkeep)`, where upkeep is the maintenance of the units
  the village raised: warrior 1, archer/shield/rider 2, swordsman 3, knight 4, catapult 5 per turn; ships cost 2 / 3 / 4
  per turn by level. Income never goes below 0.
- **Wood** — from factories (see Buildings); also from the *Extract forest* action. Each building adds to the village
  claiming its tile.
- **Stone** — from mines (+1 with Geology).
- **Ore** — from mines (+1 with Geology); used for swordsmen and ports.
- **Food** — from farms (see Food below); eaten by units. The food a village itself holds (the capital starts with 25)
  is a reserve spent only when the network's farms and granaries cannot feed its units.

The resource bar always shows the player's money (and its income). Wood, stone, ore and food show the stock and income
of the **selected village's network** — select the village or any tile of its territory; with nothing of your villages
selected only money is shown. Food status is shown per village in the selected-cell panel.

### Food

Every unit raised by a village (its `spawnVillage`) eats food each round: warrior, archer, rider 1; shield 2; swordsman,
knight, catapult and every tribe special unit 3 (pirates and units with no home village eat nothing).

Villages joined by roads or port routes (the same connection that gives the +1 money bonus) form a **food network**
and share their food; a village with no connection is a network of its own. An enemy standing on a village does not
disable its farms or granaries (they change hands only when the village is captured).

At the end of each round (after income), for every player and every food network:

1. Units are fed village by village, the most developed village first (highest level, then by name), and inside a
   village unit by unit, the hungriest first (3-food units, then shields, then 1-food units; equal units in a fixed
   order). They eat from the network's farms (yield 2, 3 with Science; 0 in winter), farms **not** adjacent to a granary first, then
   farms adjacent to a granary.
2. Food left on a farm adjacent to a granary is stored in that granary (the emptiest adjacent one first). A granary
   holds at most **50**; overflow is lost. Food left on a farm with no adjacent granary is lost: farms never accumulate.
3. A unit still short of food eats from the network's granaries (fullest first), then from the food its villages hold
   (the capital's starting 25, and anything else a village holds; it only ever shrinks). Nothing is taken from other
   networks. Networks with the smaller shortage are served first.
4. A unit that still got less than it needs loses the missing share of **10 HP** (rounded, never below 1 HP): a 3-food
   unit that got 2 loses 3 HP, one that got nothing loses 10. Its home village is **starving** and the map shows a red
   "Starvation" label under the village name. The state clears the first round every unit of the village is fed.

A destroyed or burned granary discards its stored food; a captured one keeps it for the captor.

Farms and granaries are land improvements: they do not use a village's building slots. Catapults destroy them like other
buildings (2 hp), and an enemy unit standing on one can **burn** it (Burn farm / Burn granary): the building is
destroyed at once and the unit's whole turn is spent (it may move onto the tile first, but not attack or heal before).
An enemy unit standing on a road may also **destroy** it (Destroy road): the road (and a bridge carrying it) disappears
and the unit's whole turn is spent, so the action is unavailable once the unit has moved, attacked or healed that turn.
A farm or granary on the same tile has to be burned first. Catapults can target enemy roads too; on a tile that also
holds a destroyable building the building is hit first, the road last. Cutting roads splits food networks. The AI also destroys roads with a unit standing on one (without having moved that turn): a road that is the only link between two enemy villages is cut ahead of a normal attack, any other road only when the unit has nothing better to do.

The selected-cell panel shows the village's food balance, its granaries' stored food, and a red line while starving;
a selected farm shows its yield and a selected granary shows its stored food as N/50.

## Seasons

The game starts in spring. The seasons cycle Spring → Summer → Autumn → Winter and each lasts **6 turns** (turns 1-6
spring, 7-12 summer, 13-18 autumn, 19-24 winter, then spring again). The HUD shows the season and the turn within it
(e.g. "Spring 2/6"). Seasons change the terrain textures (a tile without a texture for the season keeps its spring one).

- **Winter — ice.** When winter begins every water tile next to land that holds no port or
  bridge freezes into **ice**. Ice is walkable like land (same move cost) but cannot hold roads, traps or buildings and
  never counts as shore for ports and bridges. A ship on a tile that freezes lands and becomes a normal land unit; a
  pirate ship on it disappears. Ships cannot sail through ice.
- **Winter — farms.** Farms produce **0 food** in winter. Granaries keep their stock, and the starting food reserve can
  still be used.
- **Spring — thaw.** When spring begins all ice melts back into water, and every unit still standing on ice is lost.

## Weather

From turn 9 on, every 3rd turn (9, 12, 15, …) a random weather event tries to appear with a **30%** chance, unless 2
events are already active. A random type is picked (storm, drought or earthquake) and it appears on a random valid tile;
a type with no valid tile (e.g. no mountain) just fails that attempt. Every event has a **center** and a **radius** (its
scope of action, in hexes), and a lifetime in turns. The HUD lists active events under the season text as
`Name N/M` (N = turns it has existed, M = its lifetime; just the name for the one-turn earthquake); tapping a line centers the map on the event's center tile and
plays the selected-hex bounce on it. Everyone is told when an event starts ("Storm in the
southeast": the direction is one of eight compass points from the middle of the map, or "in the center") and when it
ends ("Storm is over"); the one-turn earthquake has no end message. Selecting a tile shows what the active weather does to it (a storm on water, a drought on land, an earthquake on
anything in its scope). Weather is part of the saved game and of the
multiplayer state. Tuning values live in `WEATHER_RULES` (`src/game/weather.ts`).

- **Storm** — 6 turns, appears on a random water tile, radius 2-4. At the end of each turn every ship and pirate ship in
  scope takes **10 damage**, and every port in scope takes **1 damage** on every second turn of the storm. Leaving a
  water tile in scope costs **2x** move points. At the end of each turn the center drifts one tile onto another water
  tile with 50% chance, never onto a tile that was already a center of the same storm. Water in scope is covered with
  the storm texture (`terrain/storm.png`).
- **Drought** — 5 turns, appears on a random land tile, radius 2-4. Farms in scope produce half the food and mines half
  the stone and ore (rounded up, never below 1, so only a mine boosted by Geology actually loses output). Land tiles in
  scope are covered with the drought texture (`terrain/drought.png`); water is not marked.
- **Earthquake** — 1 turn, appears on a random mountain tile, radius 1-3. When it appears each building in scope takes
  1 damage with 60% probability and each unit in scope takes **20 damage** with 60% probability. Villages and walls are
  not affected. Before it strikes the map centers on its center tile (when the player has explored it); then the tiles in scope shake (up,
  down and back, 5 times, each tile starting after a random 0-100 ms delay).

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
