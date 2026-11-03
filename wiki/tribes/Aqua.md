# Aqua people

The Aqua people are the sea tribe: Navigation is open from the start, so units on their ports become ships at once, and their Stormcaller lets a village strike the ships of its attackers.

## Overview

| Property      | Value |
|---------------|-------|
| Colour        | aqua |
| Start bonus   | the **Navigation** skill is open from the start (units on ports become ships and can land on coasts; ports themselves still need the Water skill) |
| Special unit  | [Stormcaller](#stormcaller) |

Otherwise the tribe plays by the common rules in [Game](../Game.md): the same units, skills, buildings and economy, the
same start (a capital with a warrior and a nearby free village). The special unit is spawnable only by this
tribe and needs no skill. It has its own artwork and spawn-popup icon; the tribe's other units use the tribe's own art.

## Stormcaller

Aqua weather mage that calls storms over home waters. Strong defensively against pirates and naval raids.

| Move | Attack | Defense | Range | HP | Spawn cost | Upkeep (money / food) | Board score |
|------|--------|---------|-------|----|------------|-----------------------|-------------|
| 20 | 20 | 8 | 1 | 44 | 6 money + 2 ore | 3 / 3 | 9 |

- **Storm.** On any cell of the map (owned or not, aboard a ship too) with at least one water tile within **5 hexes**, the "Storm" action is available.
- **Effect.** It consumes the whole turn and strikes **every enemy or pirate ship** on the water tiles within 5 hexes (whoever owns them) for **30-60 damage** each (no miss, no counter). Own ships are untouched. It then recharges for **3 turns** (shared by the whole tribe, like lightning).
- **Not weather.** It is an ability, separate from the random weather storm.
- **Call lightning.** A second action, available on any stormcaller: costs **15 money**, then recharges for **3 turns** (shared by the whole tribe, so a second stormcaller cannot cast sooner). Every village the player has explored **within 7 hexes** of the stormcaller is highlighted (any owner); tapping one strikes a random cell of its territory with a lightning bolt: forests catch fire (80%), buildings and bridges always do, a unit there takes 40-60 damage, same as a random strike. The stormcaller keeps its turn. The AI calls it on the explored enemy village with the most to burn or hit (enemy units, flammable buildings, forests) once recharged and with at least 25 money.
