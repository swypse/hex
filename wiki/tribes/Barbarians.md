# Barbarians

The Barbarians are the mountain tribe: Climbing is open from the start, which leads to mines (Smithery) and swordsmen, and their Berserker is the toughest special fighter.

## Overview

| Property      | Value |
|---------------|-------|
| Colour        | gray |
| Start bonus   | the **Climbing** skill is open from the start (mountains, then Smithery and Swordsman) |
| Special unit  | [Berserker](#berserker) |

Otherwise the tribe plays by the common rules in [Game](../Game.md): the same units, skills, buildings and economy, the
same start (a capital with a warrior and a nearby free village). The special unit is spawnable only by this
tribe and needs no skill. It has its own artwork and spawn-popup icon; the tribe's other units use the tribe's own art.

## Berserker

Barbarian that rages as it is wounded. The best raw fighter among the special units; it gets more dangerous the closer it is to death.

| Move | Attack | Defense | Range | HP | Spawn cost | Upkeep (money / food) | Board score |
|------|--------|---------|-------|----|------------|-----------------------|-------------|
| 10 | 26 | 8 | 1 | 50 | 10 money + 2 ore | 4 / 3 | 10 |

- **Rage.** At **35% HP or less** (of its max HP) it gains **+10 attack** and takes **no counter-attack damage**.
- **Indicator.** While raging it shows an attack icon with `+10`.
- **Stacks with other bonuses.** Rage adds to banner and veteran bonuses.
