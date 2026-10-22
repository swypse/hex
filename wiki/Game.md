# Game

Gameplay rules for the hex strategy game. Tribe pages (special units, tribe overview) live in
[tribes/](tribes/): [Cats](tribes/Cats.md), [Villagers](tribes/Villagers.md), [Warriors](tribes/Warriors.md),
[Barbarians](tribes/Barbarians.md), [Forest](tribes/Forest.md), [Aqua](tribes/Aqua.md), [Sand](tribes/Sand.md).

Contents: [Modes](#game-modes) · [Multiplayer](#multiplayer) · [Tribes](#tribes) · [Map](#map) · [Units](#units) ·
[Unit actions](#unit-actions) · [Villages](#villages) · [Skills](#skills) · [Buildings](#buildings) ·
[Economy](#economy) · [Food](#food) · [Seasons](#seasons) · [Weather](#weather) · [Bonuses](#bonuses-and-bottles) ·
[Score](#score)

## Game modes

Chosen on the setup screen.

1. **Capture the map** — a player wins by owning all non-free villages; the game ends once that player's turn ends
   (the round completes, not at the final capture). Capturing the map within `20 + 10 × players` turns (quick capture)
   gives a `players × 20` point bonus.
2. **30 Turns** — the game ends at turn 30; the highest score wins.

**Winner** among active players: highest total score → most kills → fewest units on the map → alphabetical name.

## Multiplayer

A player hosts a room (2-7 human players, optional AI opponents) or joins by code. Each human controls their own tribe;
rules are the single-player ones. The room starts once everyone has picked a tribe and is ready.

## Tribes

Seven tribes. Every tribe plays by the same rules and differs by colour, one start bonus and one **special unit** that
only it can spawn (no skill needed — the tribe is the gate). Details on each tribe page.

| Tribe                          | Colour | Start bonus      | Special unit |
|--------------------------------|--------|------------------|--------------|
| [Cats](tribes/Cats.md)         | pink   | Shields skill    | Stalker      |
| [Villagers](tribes/Villagers.md) | brown | +8 money        | Builder      |
| [Warriors](tribes/Warriors.md) | red    | Swordsman skill  | Banner       |
| [Barbarians](tribes/Barbarians.md) | gray | Climbing skill | Berserker    |
| [Forest people](tribes/Forest.md) | green | Forestry skill  | Trapper      |
| [Aqua people](tribes/Aqua.md)  | aqua   | Navigation skill | Stormcaller  |
| [Sand people](tribes/Sand.md)  | yellow | Riding skill     | Stunner      |

## Map

- Hex grid. Playable radius by player count: 2 → 8, 3 → 9, 4 → 10, 5 → 11, 6 → 12, 7 → 13, plus a 2-hex water border.
- Perlin-noise terrain in 5 biomes (Grassland, Desert, Tundra, Taiga, Rainforest); terrain types land, forest, mountain
  and water (30% of the generated tiles, the border comes on top).
- Each player starts with a capital (with a warrior) and a nearby free (neutral) village. Villages are at least 3 hexes
  apart and every village has at least one free tile around it.
- A free village becomes capturable when an enemy unit stands on it (red triangle).
- Villages are named after animals with a city suffix (Foxburg, Wolftown, Sharkcity; Russian: Фокс-бург); no two villages of a
  game share an animal. A free village shows only "Free village" until it is captured.

**Fog of war** is tracked per player (AI included). Unexplored tiles are gray; units on them are invisible.

- A unit that moves reveals, for every cell it visits, all tiles within its attack distance (at least the neighbours).
- A village reveals `territory radius + 1` hexes at game start, on upgrade and on
  capture. Own tiles are explored at the start.
- The camera follows enemy actions only on explored cells.

## Units

Units belong to a player and are spawned in owned villages (see [Villages](#villages)). Every unit acts once per turn;
a fresh unit waits until the next turn. Each tribe's special unit (last seven rows; abilities on the
[tribe pages](#tribes)) needs no skill — only its tribe can spawn it.

| Unit | Move | Attack | Defense | Range | HP | Spawn cost | Skill | Upkeep (money / food) | Board score |
|------|------|--------|---------|-------|----|------------|-------|-----------------------|-------------|
| Warrior | 10 | 20 | 10 | 1 | 50 | 4 money | — | 1 / 1 | 5 |
| Rider | 40 | 22 | 8 | 1 | 45 | 6 money | Riding | 2 / 1 | 6 |
| Archer | 10 | 26 | 7 | 2 | 40 | 6 money | Archer | 2 / 1 | 6 |
| Swordsman | 10 | 40 | 16 | 1 | 80 | 10 money + 2 ore | Swordsman | 3 / 3 | 0 |
| Shield | 10 | 7 | 20 | 1 | 80 | 8 money + 2 ore | Shields | 2 / 2 | 0 |
| Catapult | 10 | 50 | 0 | 4 | 30 | 15 money + 10 wood + 3 ore | Catapult | 5 / 3 | 0 |
| Knight | 30 | 38 | 12 | 1 | 70 | 14 money + 5 ore | Knights | 4 / 3 | 0 |
| [Stalker](tribes/Cats.md#stalker) | 20 | 20 | 0 | 1 | 30 | 9 money + 2 ore | Cats | 3 / 3 | 9 |
| [Builder](tribes/Villagers.md#builder) | 8 | 10 | 0 | 1 | 40 | 15 money | Villagers | 2 / 3 | 7 |
| [Banner](tribes/Warriors.md#banner) | 8 | 10 | 0 | 1 | 30 | 7 money + 2 ore | Warriors | 1 / 1 | 8 |
| [Berserker](tribes/Barbarians.md#berserker) | 10 | 26 | 8 | 1 | 50 | 10 money + 2 ore | Barbarians | 3 / 3 | 10 |
| [Trapper](tribes/Forest.md#trapper) | 10 | 20 | 8 | 1 | 44 | 6 money + 2 ore | Forest people | 3 / 3 | 8 |
| [Stormcaller](tribes/Aqua.md#stormcaller) | 20 | 20 | 8 | 1 | 44 | 6 money + 2 ore | Aqua people | 3 / 3 | 9 |
| [Stunner](tribes/Sand.md#stunner) | 8 | 20 | 10 | 2 | 40 | 7 money + 2 ore | Sand people | 2 / 3 | 7 |

- **Rider** can still move its full move points after attacking in the same turn: the cell it attacks from does not stop it, only the cells next to an enemy that it walks into do (it ends its move on the first one).
- **Shield** cannot attack in a turn in which it has moved (not applicable aboard a ship). Its counter-attack uses a
  lower multiplier than other units (see [Attack](#unit-actions)), but attacking one head-on still hurts.
- **Knight** may attack again after a kill; killing 3 units in one turn gives a 30-point **Combo kill**.
- **Catapult** has fixed damage (no random roll), cannot attack after moving, never advances onto a killed enemy's tile
  and never counter-attacks on land (aboard a ship the crew fires the ship's cannon). It is the only **siege** unit: it
  can target enemy buildings, walls, villages and roads within range with the usual range/fog logic. A hit on a village
  destroys its wall first, then lowers its level by one (minimum 1); a village with an enemy unit standing in it is hit
  as a normal unit. Mines, sawmills, ports, temples, forest temples, bridges, farms and granaries (2 hp) are removed
  outright; a road is hit last on a tile with a building. Besides enemy structures, any road or bridge on a free (unowned) tile can be targeted, whoever built it (human players only; the AI never targets its own). A volley can miss like a regular attack and is never
  countered. The AI sieges too, going for enemy buildings in this order: granary, university, farm, mine, sawmill; its
  other units burn enemy farms and granaries.
- Pirates and units with no home village cost no upkeep.

### Ships

A unit that moves onto its own port becomes a **ship** and cannot move or attack again that turn.

- Move points 20 / 30 / 40 and attack 10 / 20 / 30 (range 2 / 2 / 3) for ship levels 1 / 2 / 3; ships sail water and may
  land only on a coast tile as their final step. The ship's own level sets the fog reveal distance.
- A ship may attack after moving but cannot move after attacking. Landing turns it back into a normal unit and ends the
  unit's turn (no move, attack or heal).
- Upgrade (only on an owned cell): level 2 = 8 money + 4 wood; level 3 = 16 money + 8 wood + 2 ore.
- Money upkeep per turn: 2 / 3 / 4 by level.

### Pirates

Neutral units that belong to no tribe (80 HP, 50 move points on sea only, attack 15 at range 3, defense 5).

- From turn 7, on every odd turn, a pirate appears with 15% chance on an edge water cell. Pirates act after all players.
- Each pirate hunts one tribe — the one with the nearest unit when it appears: it attacks that tribe's nearest unit
  (ship or land) or moves toward it. After **3 attacks** it picks another tribe. It remembers its last two target
  tribes and never picks from them (with two players it simply switches). It also switches when its tribe has no units
  or has a deal with it.
- A pirate that survives an attack from a tribe hunts that tribe for its next **3** turns.
- A pirate adjacent to a ship tries to **capture** it (25%): on success the ship becomes a pirate ship (keeping its HP
  and damage); on failure the pirate loses 2 HP and the ship 1 HP.
- A **deal** (50 money) stops a pirate from attacking your tribe; only possible while it is on water you own.
- Killing a pirate gives 30 points.

### Veterans

A unit's **3rd kill** (counter-attacks, storms and pirate kills count) makes it a **veteran**: it is fully healed, shows a
star (`★ N/M`) and its owner picks a permanent bonus in a dialog that cannot be dismissed: **+5 attack**, **+10 max HP**
(refilled) or **+10 move points** (not aboard a ship). A 3rd kill on an enemy's turn opens the dialog at the start of the
owner's turn. AI picks at once: shields, banners, builders and stalkers take HP, riders move points, others attack.
Pirates and tribe special units (builder, banner, berserker, stalker, trapper, stormcaller, stunner) never become veterans.

## Unit actions

- **Move** — spend up to the move points. Leaving a tile costs: land and water 10, forest 14 (10 in winter, except in
  the desert biome), mountain 20 (entering is free). A unit may always make a 1-tile move. Mountains need *Climbing*;
  water blocks land units (ships need *Navigation*). Leaving the unit's own road tile, a road on its own territory, its
  own village linked to its road network, or a tile of its own port water route **halves** the cost (rounded down).
  Movement stops at the first cell adjacent to an enemy (it can be entered, cells beyond cannot; a unit next to an
  enemy can always move 1 cell). Leaving a water tile inside a storm costs 2×.
- **Attack** — once per turn on an enemy within range. Force-ratio formula (`COMBAT_SCALE` 1.5):
  `attackForce = attack × hp / maxHp`; `defenseForce = defense × hp / maxHp × defenseBonus`;
  damage = `round(attackForce / (attackForce + defenseForce) × attack × 1.5)`.
  - `defenseBonus = 1 + reduction / 10`: own village +8 (×1.8), a wall adds +3 (×2.1); with 3+ own water temples ships
    get +10 (×2.0), with 3+ forest temples units on forest tiles get +10.
  - Each attack has a 10% miss chance (5% with *Science*); a miss still uses the attack.
  - A surviving target in range counter-attacks with
    `round(defenseForce / (attackForce + defenseForce) × defense × 1.5 × 2.25)` (`COUNTER_SCALE` 2.25; shields 2).
  - On a kill the attacker moves onto the target's tile, unless it is an archer, a pirate, a ship, or the target was a
    pirate or a ship.
  - Bonuses to attack: banner +5, berserker rage +15, veteran +5 (none for ships). A stealthed stalker's strike
    doubles its attack (sneak attack) and ignores the defense.
- **Heal** — if the unit has not moved/attacked, +15 HP (+10 more on a tile of a village with a university after
  *Medicine*), once per turn.
- **Capture village** — a unit on an enemy or free village marked capturable captures it. It takes the whole action: a unit that has healed this turn cannot capture.
- **Disband** — costs 3 × the unit's money upkeep; not after the unit has moved or attacked.
- **Burn / Destroy road / Extinguish** — see [Food](#food) and [Lightning and fire](#lightning-and-fire).
- Tribe special abilities: see the [tribe pages](#tribes).

## Villages

- **Spawning** — pay the unit's cost in an owned village; blocked if the village tile is occupied or the village's unit
  capacity (`1 + level`) is full.
- **Upgrade** — `2×k` wood + `k` stone + `2×k` money with `k = level × (1 + (level/9)³)`, rounded: near-linear at first, then steeply rising (level 1: 2 wood + 1 stone + 2 money; level 2: 4/2/4; level 5: 12/6/12; level 10: 47/24/47; level 15: 169/84/169; level 25: ~1122/561/1122, unreachable in a normal game). Raises income and
  capacity; works while an enemy unit stands on the village. Some upgrades let the player pick a bonus:
  - level 5 → 6: **expand territory** (+1 radius) or **+5 money** (territory stays);
  - level 9 → 10: **expand territory** or a **veteran swordsman**;
  - level 10 and up: **more income** (the usual raise) or a **veteran swordsman** (income stays where it was, so it can
    be below the village level).
- **Veteran swordsman** — raised on the village for free (no money, no resources, no *Swordsman* skill, capacity not
  checked); the owner picks its veteran bonus (the AI picks at once). A unit standing on the village (an enemy
  capturing it, say) is pushed to an adjacent free land cell, or lost when there is none, and an enemy pushed off loses
  its capture progress — a last chance to hold a village. The AI takes it when an enemy stands on or is about to reach
  the village.
- **Territory radius** — level 1 → 1, level 2 → 2, then +1 for each *expand territory* pick (levels 5→6 and 9→10).
  Old saves keep the radius their level gave (2-4 → 2, 5-9 → 3, 10+ → 4).
- **Building slots** — a village supports as many buildings as its level. Farms and granaries use no slot.
- **Wall** — 20 money + 15 stone + 5 ore, needs *Defense*; costs 1 money upkeep per turn. A walled village gives its units +3 defense and must be
  breached by siege before it can be downgraded.
- **Road** — 5 wood + 2 stone + 10 money, needs *Roads*. Connects a tile to an adjacent own road, port or village (a
  road must link back to an own village through the road/port/bridge network).
- **Bridge** — 10 wood + 15 money + 5 stone, needs *Bridges*. On a water tile between two land hexes: walkable by land
  units, ships still sail under it, connects roads. Not on a port or temple; ports and temples not on a bridge.
- **Port connections** — own ports of one stretch of own or free (unowned) water connect automatically (water owned by another player blocks the route) (light-blue route); villages
  reached through a port route count as road-connected and the route halves move cost for the owner. Connections are
  recomputed live.
- **Repair** — a damaged own building (buildings have 2 hp) is repaired for 2 wood + 2 stone + 2 ore + 3 money.
- **Demolish** — destroys an own building for 5 money and frees the slot (the AI uses this to make room for a granary).
- **Capture** — a captured village keeps its stock and granary food; one captured with nothing in stock starts like a
  capital (3 wood, 2 stone, 25 food).

## Skills

The skill tree is shared; skills are bought with money. Cost = `3 × level + 2 × opened skills`. A level-2 skill needs
its parent first. Opening a skill scores 15. Skills marked † also need an own university.

| Skill         | Lvl | Parent      | Effect                                                                            |
|---------------|-----|-------------|-----------------------------------------------------------------------------------|
| Climbing      | 1   | —           | Units can enter mountains                                                         |
| Smithery      | 2   | Climbing    | Mines on owned mountain tiles                                                     |
| Swordsman     | 2   | Climbing    | Spawn swordsmen                                                                   |
| Water         | 1   | —           | Ports on owned water tiles                                                        |
| Navigation    | 2   | Water       | Units on ports become ships; ships travel water and land on coasts                |
| Water temples | 2   | Water       | Water temples; own units/buildings near one are immune to storm damage (radius 1-3 by level) |
| Forestry      | 1   | —           | Sawmills on owned land near forests                                               |
| Forest temple | 2   | Forestry    | Forest temples; own units/buildings near one are spared by earthquakes (radius 1-3 by level) |
| Roads         | 2   | Forestry    | Build roads                                                                       |
| Science       | 1   | —           | Miss chance 5%; allows a university                                               |
| Geology †     | 2   | Science     | Mines give +1 stone and +1 ore                                                    |
| Engineering † | 2   | Science     | Buildings in a village with a university cost ~10% less wood and stone            |
| Medicine †    | 2   | Shields     | Units on the tiles of a village with a university heal +10 HP more                |
| Archer        | 1   | —           | Spawn archers                                                                     |
| Shields       | 1   | —           | Spawn shields                                                                     |
| Defense       | 2   | Shields     | Village walls                                                                     |
| Catapult      | 2   | Archer      | Spawn catapults                                                                   |
| Riding        | 1   | —           | Spawn riders                                                                      |
| Bridges       | 2   | Riding      | Build bridges                                                                     |
| Knights       | 2   | Riding      | Spawn knights                                                                     |
| Agriculture   | 1   | —           | Farms                                                                             |
| Granary       | 2   | Agriculture | Granaries next to farms                                                           |
| Agronomy †    | 2   | Agriculture | Farms in a village with a university give +1 food, and 1 food in winter           |

## Buildings

Placed on owned tiles claimed by one of your villages, with no settlement or building; each needs its skill and a free
village slot (farms and granaries need none). No building produces money. Buildings have 2 hp.

| Building      | Cost                          | Skill         | Placement                                                    | Effect                                                                        |
|---------------|-------------------------------|---------------|--------------------------------------------------------------|-------------------------------------------------------------------------------|
| Sawmill       | 10 money                      | Forestry      | land tile adjacent to a forest                               | +1 wood per adjacent forest per level; holds up to 20 wood                    |
| Mine          | 15 money                      | Smithery      | mountain tile                                                | +1 stone and +1 ore per level (+1 each with Geology); holds up to 20 of each  |
| Port          | 10 wood + 30 money + 2 ore    | Water         | owned water tile next to your own land                       | creates and upgrades ships                                                    |
| Temple        | 10 stone + 30 money           | Water temples | water tile                                                   | grows +1 level every 2 turns (max 4); 10/15/20/25 score at game end           |
| Forest temple | 10 stone + 30 money           | Forest temple | forest tile                                                  | same as temple; protects against earthquakes                                  |
| Farm          | 10 money + 3 wood             | Agriculture   | own empty land tile (no forest/mountain/water; road is fine), no enemy unit | +3 food per round; 0 in winter (on desert land: always 2, +1 with Agronomy) (see [Food](#food))             |
| Granary       | 20 money + 10 wood + 10 stone | Granary       | own empty land tile next to one of your farms, no enemy unit | stores unused food of adjacent farms, up to 15 per adjacent farm              |
| University    | 40 money + 10 stone + 5 ore   | Science       | own empty land tile (no forest/mountain/water) of a level 5+ village; one per village; uses a slot | unlocks Geology, Agronomy, Engineering, Medicine; 4 money upkeep |

A builder ([Villagers](tribes/Villagers.md)) can place a sawmill, mine, port, bridge or road without the skill.

## Economy

Five resources: **money**, **wood**, **stone**, **ore**, **food**. Money belongs to the player; the rest is held by
**villages**. Villages joined by roads or port routes form a **network** and pool their stock (the same network shares
food); an unconnected village uses only its own stock.

**Start:** 8 money for the player; the capital has 3 wood, 2 stone, 0 ore and 25 food; other villages start empty.

**Who pays:** an action on a village's territory (building, repair, spawn, upgrade, wall, port, ship upgrade, bridge,
road, trap) draws wood/stone/ore/food from that village's network — first what its sawmills and mines hold, then the
village itself, then the rest of the network (most developed first). On unclaimed land the nearest own village pays. A road also draws on the networks it joins.
Skills, disbanding, demolishing and pirate deals cost money only.

**Income** is collected at the end of each round, after all players have moved:

- **Money** — each village yields `max(0, 3 + 2 × level − upkeep) + 1` where the `+1` is a bonus for a village
  connected to another own village. Upkeep = money upkeep of the units it raised (see [Units](#units)) plus **1** for
  every road tile, wall, sawmill, farm, granary and mine it pays for (university 4; the claiming village pays, otherwise the
  nearest own one). An enemy unit standing on a village zeroes its income and stops its buildings' production.
- **Wood** — sawmills. **Stone** and **Ore** — mines. **Food** — farms (see below). Sawmills and mines **keep** what
  they collect: a sawmill holds up to **20 wood**, a mine up to **20 stone and 20 ore**, and a full building stops
  collecting that material (the surplus is lost). The map shows each one's stock under its tile (sawmill `N/20`, mine
  `<stone icon> N <ore icon> M`), like a granary's food. The stock of a village's sawmills and mines counts with the
  village's own stock for its network: builds, spawns, upgrades and roads draw on the buildings first (the fullest
  first), then on the villages. A destroyed or burned building loses its stock; a captured one keeps it.

At round end the income floats up from its tile: money from each village, wood from each sawmill, stone and ore
(one label) from each mine (what was actually stored), and the food a granary gained (`<icon> N`).

The resource bar always shows money and its income; wood, stone, ore and food show the stock and income of the
**selected village's network**. Food status is shown per village in the selected-cell panel.

## Food

Each village eats `floor(level / 2)` food a round (a level 1 village eats nothing). Each unit raised by a village (its home village) also eats: warrior,
archer, rider 1; shield 2; swordsman, knight, catapult and every special unit 3. Farms yield 3 (4 with Agronomy in a
village with a university; 0 in winter, 1 with Agronomy there; halved in a drought).

At the end of each round (after income), for every player and food network:

1. Villages are fed one by one, the most developed first (level, then name); each village eats first, then its units,
   hungriest first. They eat from the network's farms — those **not** adjacent to a granary first.
2. Food left on a farm adjacent to a granary is stored there (the emptiest first; a granary holds **15 per adjacent farm**; overflow lost; if an adjacent farm is destroyed the stored
   food stays, but nothing more is stored until it is below the new capacity).
   Other leftover farm food is lost.
3. Anything still short is taken from the network's granaries (fullest first), then from the food its villages hold
   (the capital's starting 25). Nothing crosses networks; networks with the smaller shortage are served first.
4. A village that stays short is **starving** (red "Starvation" label, no HP loss). A unit that stays short loses the
   missing share of **10 HP** (rounded, never below 1): a 3-food unit that got 2 loses 3. The state clears the first
   round everything is fed.

Farms and granaries are land improvements. Catapults destroy them; an enemy unit standing on one can **burn** it
(Burn farm / Burn granary: destroyed at once; it takes the unit's whole turn, so the unit must not have moved yet). An enemy on a road can **destroy** the road (a
bridge on it too; the unit's turn is spent; a farm or granary on the same tile must be burned first), cutting food
networks. A destroyed or burned granary loses its food. The AI also cuts roads that are the only link between two
enemy villages.

## Seasons

The game starts in spring; each season lasts **6 turns** (spring 1-6, summer 7-12, autumn 13-18, winter 19-24, then
again). The HUD shows e.g. "Spring 2/6". Seasons change terrain textures.

- **Winter — ice.** Water tiles next to land with no port or bridge freeze into **ice**: walkable like land, but no
  roads, traps or buildings, and not a shore for ports/bridges. A ship on a freezing tile lands as a normal unit; a
  pirate ship there disappears. Ships cannot cross ice.
- **Winter — farms** give nothing (Agronomy 1). Granaries keep their stock.
- **Spring — thaw.** Ice melts; units still standing on ice are lost.

## Weather

From turn 9, every 3rd turn (9, 12, 15, …) an attempt succeeds with **30%** unless 2 events are already active. A random
type (storm, drought, earthquake) appears on a random valid tile (none valid → the attempt fails). Each event has a
centre, a radius and a lifetime; the HUD lists them as `Name N/M`, and tapping one centres the map. Everyone is told
when an event starts and ends. Weather is part of saved games and multiplayer state. Tuning: `WEATHER_RULES`
(`src/game/weather/weather.ts`).

- **Storm** — 6 turns, a random water tile, radius 2-4. Every turn each ship and pirate ship in scope takes **10**
  damage and every port 1 damage on every second turn; leaving a water tile in scope costs 2×. Each turn the centre
  drifts to another water tile with 50%. Own ships and ports within an own water temple's radius are immune.
- **Drought** — 5 turns, a random land tile, radius 2-4. Farms and mines in scope produce half (rounded up, min 1).
- **Earthquake** — 1 turn, a random mountain tile, radius 1-3. Each building in scope is destroyed with 60% and each
  unit takes **20** damage with 60%. Villages and walls are unaffected; own buildings and units within an own forest
  temple's radius are spared.

### Lightning and fire

**Lightning** has its own schedule: from turn 9, every 2nd turn (9, 11, 13, …), **15%**, independent of the 2-event
limit. It lasts 1 turn and strikes one random tile (radius 0). Tuning: `WEATHER_RULES.lightning`, `FIRE_RULES`
(`src/game/weather/fire.ts`).

- A stormcaller can also **call lightning** onto a random cell of any village its owner sees (15 money, recharges
  3 turns for the whole tribe) with the same effects, on top of this schedule.
- A **forest** catches fire with 80%; a **unit** takes 40-60 damage; a **building** (sawmill, mine, port, farm,
  granary) or a **bridge** always catches fire (temples and universities are spared).

**Fire** acts at round end:

- A burning forest burns 3 rounds, then becomes land of its biome; a unit on it takes **10** per round.
- A burning building takes 1 damage per round (2 hp); a burning bridge is lost after 2 rounds.
- Every 2nd round of its burn, each forest next to a burning forest or building catches fire with 50% (so fire expands every 2 rounds, not every round).
- A unit on or next to a burning tile can **Extinguish fire** (spends its whole turn).

## Bonuses and bottles

**Bonus hexes** (red marker): `players + 1` on random land cells, at least 4 hexes apart and from starting villages. From then on, every **15th** turn (15, 30, …) one more appears on a random
free land cell outside every village's territory (no building, unit or bonus on it).

- A unit standing on a bonus at the start of the owner's turn can **Get the bonus**; that exhausts the unit for the
  turn. Each bonus is claimed once.
- Type (random): **+15 money**; **resources** (+10 wood, +5 stone, +5 ore to the nearest village); **free village
  upgrade** of the closest village (else +15 money); **free skill** (random unopened, ignoring the parent, never a
  university skill without one; else +15 money); **explorer** — a semi-transparent warrior makes up to 25 exploring
  moves, then disappears.
- The AI claims bonuses automatically and sends free units toward unexplored bonus hexes.

**Bottles** float onto a random free (not owned) water hex: every 2nd turn, 20% chance; several can exist, each lasts 5
turns. A ship on a bottle tile can **Get bottle** next turn (the ship's whole turn); one effect at random: **+50
money**, a **random unopened skill** (never one needing a university you lack) or **+20 ship HP**. The AI collects
bottles at the start of its turn.

## Score

Total score = accumulated action score + current board score. A game is rated 1-3 stars by the winner's score.

**Board score** (what you own right now): explored tile 3 · village 50 · building 15 (temples give none) · bridge 5 ·
units by type (see [Units](#units) and the tribe pages: warrior 5, rider 6, archer 6, specials 7-10).
At game end each own water or forest temple scores 10 / 15 / 20 / 25 by level.

**Action score** (immediate): capture a village 50 · upgrade a village 20 · kill a unit 25 · kill a pirate 30 ·
combo kill 30 · open a skill 15 · quick capture win `players × 20`.

**Stars:**

- **Capture** — 3★: score ≥ `500 + 200 × players` within the quick-capture turns; 2★: ≥ `400 + 150 × players`.
- **30 Turns** — 3★: score ≥ `1000 + 800 × players`; 2★: ≥ `800 + 600 × players`.
