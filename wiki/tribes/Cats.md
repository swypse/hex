# Cats

The Cats are the stealthy tribe: they start with Shields open, which leads to Defense (village walls) and Catapult, and they field the Stalker, a fragile scout that vanishes after its first move and strikes unseen.

## Overview

| Property      | Value |
|---------------|-------|
| Colour        | pink |
| Start bonus   | the **Shields** skill is open from the start (shields, then Defense and Catapult) |
| Special unit  | [Stalker](#stalker) |

Otherwise the tribe plays by the common rules in [Game](../Game.md): the same units, skills, buildings and economy, the
same start (a capital with a warrior and a nearby free village). The special unit is spawnable only by this
tribe and needs no skill. It has its own artwork and spawn-popup icon; the tribe's other units use the tribe's own art.

## Stalker

Scout that vanishes after its first move and strikes unseen. Very fragile (20 HP, 0 defense), so it is a harassment and scouting unit rather than a fighter.

| Move | Attack | Defense | Range | HP | Spawn cost | Upkeep (money / food) | Board score |
|------|--------|---------|-------|----|------------|-----------------------|-------------|
| 20 | 10 | 0 | 1 | 20 | 9 money + 2 ore | 3 / 3 | 9 |

- **Stealth on the first move.** The stalker spawns visible. Its first move after spawning enables stealth: it becomes invisible to every other player before the walk starts (the owner still sees it, slightly dimmed).
- **Enable stealth.** A visible stalker can hide in place with the "Enable stealth" action, which uses its whole turn.
- **Stealth attack.** Attacking from stealth ignores the target's defense and reveals the stalker.
- **Bumping.** An enemy whose move would step onto a hidden stalker stops one cell short and reveals it; if the stalker was the first cell of the path, the enemy keeps its move.
- **Hidden from enemies.** A hidden stalker is never shown as attackable, never blocks enemy pathing and is invisible to the AI.
- **Villages spot it.** Moving next to an enemy village asks for a confirm ("your stealth will be disabled"); confirming moves the stalker there and reveals it, and every player sees "Stalker in the {village}!". A stealthed stalker can never move onto an enemy village cell (even an empty one), a stalker standing next to an enemy village cannot enable stealth, and a stealthed stalker left beside a free village is revealed instantly if an enemy captures it.
