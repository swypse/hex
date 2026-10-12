# Forest people

The Forest people have Forestry open from the start, which leads to roads and forest temples, and defend by ambush with the Trapper, who sows thorn traps.

## Overview

| Property      | Value |
|---------------|-------|
| Colour        | green |
| Start bonus   | the **Forestry** skill is open from the start (sawmills, then Forest temple and Roads) |
| Special unit  | [Trapper](#trapper) |

Otherwise the tribe plays by the common rules in [Game](../Game.md): the same units, skills, buildings and economy, the
same start (a capital with a warrior and a nearby free village). The special unit is spawnable only by this
tribe and needs no skill. It has its own artwork and spawn-popup icon; the tribe's other units use the tribe's own art.

## Trapper

Forest hunter who sows thorn traps. A solid defender that turns roads and chokepoints into minefields.

| Move | Attack | Defense | Range | HP | Spawn cost | Upkeep (money / food) | Board score |
|------|--------|---------|-------|----|------------|-----------------------|-------------|
| 10 | 20 | 8 | 1 | 44 | 6 money + 2 ore | 3 / 3 | 8 |

- **Thorn trap.** Consumes its turn to place a trap on a non-water cell it stands on or is adjacent to (radius 1), provided that cell has no village or building, no other unit and no trap already. Not on ice.
- **Cost.** 5 money + 3 ore, paid like other territory actions.
- **Hidden.** Traps are visible only to the trapper's owner.
- **Lifetime.** A trap lasts 10 turns and vanishes when triggered.
- **Trigger.** An enemy unit that moves onto a trap stops there and takes ~45 damage (attack 30 at full HP vs. defense 0, no miss, no counter); the trap disappears. A melee unit that kills someone and advances onto their tile also trips a trap buried there.
