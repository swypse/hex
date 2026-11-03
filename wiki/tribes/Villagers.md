# Villagers

The Villagers are the builders' tribe: they start with extra money and have the Builder, which constructs sawmills, mines, ports, bridges and roads without learning the skills first.

## Overview

| Property      | Value |
|---------------|-------|
| Colour        | brown |
| Start bonus   | **+8 money** at the start (16 instead of 8) |
| Special unit  | [Builder](#builder) |

Otherwise the tribe plays by the common rules in [Game](../Game.md): the same units, skills, buildings and economy, the
same start (a capital with a warrior and a nearby free village). The special unit is spawnable only by this
tribe and needs no skill. It has its own artwork and spawn-popup icon; the tribe's other units use the tribe's own art.

## Builder

Villager that raises sawmills, mines, ports, bridges and roads without their skills. A slow, weak fighter; its value is the economy it unlocks early.

| Move | Attack | Defense | Range | HP | Spawn cost | Upkeep (money / food) | Board score |
|------|--------|---------|-------|----|------------|-----------------------|-------------|
| 8 | 10 | 0 | 1 | 40 | 15 money | 2 / 3 | 7 |

- **Building.** Consumes its turn to build a sawmill, mine, port, bridge or road on its own cell or an adjacent owned cell.
- **No skill needed.** No building skill is required (Forestry, Smithery, Water, Bridges, Roads); the usual building costs apply, and placement rules (terrain, the village's building slots, a road must join your road network or a village) are unchanged.
- **Not at sea.** It cannot build while aboard a ship.
- **Veteran bonus.** The AI gives a builder veteran the +10 HP bonus.
