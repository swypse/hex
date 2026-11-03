# Warriors

The Warriors are the army tribe: they start with Swordsman, the strongest early infantry, and field the Banner, a standard bearer that makes the units around it hit harder.

## Overview

| Property      | Value |
|---------------|-------|
| Colour        | red |
| Start bonus   | the **Swordsman** skill is open from the start |
| Special unit  | [Banner](#banner) |

Otherwise the tribe plays by the common rules in [Game](../Game.md): the same units, skills, buildings and economy, the
same start (a capital with a warrior and a nearby free village). The special unit is spawnable only by this
tribe and needs no skill. It has its own artwork and spawn-popup icon; the tribe's other units use the tribe's own art.

## Banner

Standard bearer: a weak fighter whose value is the aura it carries. Keep it behind the front line.

| Move | Attack | Defense | Range | HP | Spawn cost | Upkeep (money / food) | Board score |
|------|--------|---------|-------|----|------------|-----------------------|-------------|
| 8 | 10 | 0 | 1 | 30 | 7 money + 2 ore | 1 / 1 | 8 |

- **War cry aura.** Allied units within 2 hexes gain **+5 attack** (never the banner itself, and never ships).
- **No stacking.** Several banners do not add up: the bonus is always a flat +5.
- **Dies, aura ends.** The bonus disappears at once when the banner dies.
- **Indicator.** Recipients show an attack icon with `+5` next to their HP bar.
- **Veteran bonus.** The AI gives a banner veteran the +10 HP bonus.
