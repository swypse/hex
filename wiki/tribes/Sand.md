# Sand people

The Sand people are the cavalry tribe: Riding is open from the start, which leads to bridges and knights, and their Stunner can lock down the strongest enemy unit for a turn.

## Overview

| Property      | Value |
|---------------|-------|
| Colour        | yellow |
| Start bonus   | the **Riding** skill is open from the start (riders, then Bridges and Knights) |
| Special unit  | [Stunner](#stunner) |

Otherwise the tribe plays by the common rules in [Game](../Game.md): the same units, skills, buildings and economy, the
same start (a capital with a warrior and a nearby free village). The special unit is spawnable only by this
tribe and needs no skill. It has its own artwork and spawn-popup icon; the tribe's other units use the tribe's own art.

## Stunner

Sand warrior that stuns with a precise shot. A ranged support unit that takes a key enemy out of the fight.

| Move | Attack | Defense | Range | HP | Spawn cost | Upkeep (money / food) | Board score |
|------|--------|---------|-------|----|------------|-----------------------|-------------|
| 8 | 20 | 10 | 2 | 40 | 7 money + 2 ore | 2 / 3 | 7 |

- **Range 2.** A range-2 target is always stunned.
- **Range 1.** A range-1 target lets you choose between a regular attack and a stun.
- **Stun.** A stun deals no damage; the target cannot act this turn (if it has not acted yet) or next turn (if it already has) and provokes no counter-attack.
- **Indicator.** Stunned units show a `stunned` tag on their HP text and cannot counter-attack while dazed.
