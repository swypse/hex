# AI Naval Response Design

Date: 2026-09-09

## Problem

Pirates (neutral naval units that spawn from turn 7 and roam the sea, attacking
the nearest player unit) and enemy-player ships attack the AI near its coast.
The AI has no reaction:

- It owns no ships and no catapults, so it cannot reach or hurt a pirate that
  fights from water; land units can never step onto the sea.
- It wastes time and resources: ground units march along the coast toward a
  pirate they cannot engage (and get shot at / captured), and it spends wood,
  stone, and money on bridges that do not help.
- Its static skill order (`AI_SKILL_ORDER`) schedules `navigation` and
  `catapult` far too late (ranks 11 and 12) to be a meaningful defense when a
  naval threat appears mid-game.

No stat, resource, balance, or rules change. This is decision logic only.

## Goals

1. When a naval enemy (pirate or enemy ship) is near the AI's territory, the AI
   builds the means to fight back: it prioritises `Water → Navigation` (ships)
   and `Catapult` (shore artillery) over unrelated expansion.
2. The AI defends its coast: ships chase pirates off the open water, catapults
   shell pirates from the shore, and land melee units stop being farmed on the
   beach.
3. The AI does not waste resources on pointless bridges while threatened.
4. The behaviour auto-stands-down once no naval enemy is near, so the AI reverts
   to its normal economy/expansion/war priorities.
5. Difficulty only changes *how early* the AI reacts, not whether it reacts.

## Scope decisions (from design dialogue)

- **Trigger:** distance-based. Visible pirates **and** enemy-owned ships count as
  naval enemies. A naval enemy within `NAVAL_THREAT_RADIUS` (hex distance, exact
  radius is a difficulty knob) of any AI unit / settlement / port / ship is a
  threat.
- **Response:** both parallel branches — catapults defend the shore immediately;
  a navy (port + ships) chases pirates that catapults (range 4) cannot reach.
  Ships are upgraded toward level 2/3 while threatened and affordable.
- **Stand-down:** when the threat clears, naval patterns stop firing. Existing
  ships/catapults/skills remain.
- **Also fixed:** coastal-farming of land units and pointless bridge building
  (both during a threat and, for bridges, generally).

## Approach

Add threat-aware behaviour on top of the existing planner without rearchitecting
it:

1. **Situation analysis** (`aiSituation.ts`) computes the naval threat once per
   AI turn (pure, testable).
2. **New gated `AI_PATTERNS`** (`aiPatterns.ts`) only fire while the threat is
   active: open the skill chain, build a port, board a ship, sail/hunt,
   upgrade ships, position catapults.
3. **Targeted rules** in the generic move scorer (`ai.ts`) and the chase
   patterns stop coastal farming and pointless bridges.

## Section 1 — Naval threat detection

`analyzeSituation` gains naval analysis. New pure helpers in `aiSituation.ts`:

- `isNavalEnemy(unit)` — true when the unit is `type === 'pirate'` (owner
  `-1`, including captured pirate ships) **or** an enemy-owned unit with
  `shipLevel !== undefined`. Disembarked land units are never naval enemies.
- `navalEnemiesVisible(map, playerIndex)` — visible (explored) naval enemies of
  other owners.
- `coastExposedTile(map, tile, navalEnemies)` — true when `tile` is a **land
  tile bordering water** and some naval enemy is within that enemy's *attack
  range* of it (pirates 3, ships by level 2/2/3). Coast tiles only — inland
  movement is never restricted. Catapult and ship units are exempt when they
  are the ones responding (a catapult must stand within 4 of a pirate to fire,
  so exposure never blocks it).

`AiSituation` gains:

- `navalThreat: boolean`
- `navalEnemies: EnemyUnit[]` — nearest-first
- `nearestNaval: { tile: MapTile; distance: number } | null`

`navalThreat` = at least one naval enemy whose hex distance to the nearest AI
unit, settlement, port, or ship is `<= profile.navalThreatRadius`.

Threat checks use plain hex distance (cheap, consistent with existing
`enemyCanReach`/`enemyCanAttackNext`). Pirates on a far-away inland lake within
the radius still register; accepted as a simplification.

## Section 2 — Skill & economic build-up while threatened

New pattern `naval-open-skills` (inserted into `AI_PATTERNS` between
`hunt-idle-enemy` and `explore-frontier` — patterns fire in array order, so
combat/defense patterns still run first and exploration/economy run after).
While `navalThreat` and the chain is not yet complete, it opens the next skill
in dependency order as soon as affordable:

1. no `Water` → open `Water`
2. has `Water`, no `Navigation` → open `Navigation`
3. no `Science` → open `Science`
4. has `Science`, no `Catapult` → open `Catapult`

This makes the AI spend on the response chain *during* the threat even at the
expense of normal expansion (the danger is immediate; stand-down stops the
bleeding once it clears). No extra money reserve is introduced for these skills.

New pattern `naval-build-port` (same priority band). When the AI has `Water`,
`navalThreat` is active, and no port can serve the threat, build a port on the
**own coastal water tile closest to the naval enemy** (subject to existing
`canBuildPort` rules: owned, water, adjacent own land, free building slot,
affordable). While `navalThreat`, port construction **bypasses the
`reserveLastSlotForMine` guard** (ai.ts) so a full village with an unmined
mountain still builds a port instead of stone-locking.

## Section 3 — Navy: boarding, sailing, hunting, upgrading

While `navalThreat` and the AI has `Navigation`:

1. **Board a ship** (`naval-board-ship`). When the AI has no ship (or too few
   to matter, e.g. ships currently engaged elsewhere), walk a **spare land
   unit onto an owned port** — the simulator converts it to a level-1 ship and
   ends its turn. Boarding candidates never include a unit needed for a
   same-turn attack, nor the last defender of an endangered own village
   (consistent with `reinforce-endangered-village` / `defend-hurt-unit`). Port
   chosen: nearest to the naval enemy.

2. **Sail & hunt** (`naval-hunt`). An idle ship moves over water toward a firing
   position from which it can attack the nearest naval enemy within the ship's
   attack distance (2/2/3 for levels 1/2/3). Ships may `move`+`attack` in one
   turn. Ships **never stop on a hex adjacent (distance 1) to a pirate** — that
   invites the 25% capture attempt.

3. **Ship upgrades.** While threatened and affordable, an idle ship standing on
   an owned tile is upgraded toward level 2 then 3 (costs 8 money + 4 wood,
   then 16 money + 8 wood + 2 ore). Low priority so it never interrupts an
   attack/hunt.

## Section 4 — Catapult use (parallel land-based fire)

Once `Catapult` is open and `navalThreat` is active:

1. **Spawn catapults** toward the threatened coast: when a coastal village near
   the naval enemy has a free spawn slot and the AI can afford it, prefer a
   catapult over the normal spawn list. (Overrides the stance spawn preference
   only while the threat is active.)

2. **Position idle catapults.** An idle catapult not yet in firing range of the
   nearest naval enemy gets a `move` toward the closest land tile that:
   - is within its range 4 of the naval enemy (it can shell from there next
     turn), and
   - is **not exposed** — a tile the pirate can hit back (pirate range 3).
   Once in range, firing is left to the existing generic attack/hunt logic.
   Because a land catapult cannot attack after moving, the AI never plans a
   same-turn `move`+`attack` for one.

3. **No land chase of naval enemies.** Land melee/ranged units never treat
   pirates/ships as pursuit or attack targets they cannot actually hit from
   land. `hunt-idle-enemy` and the melee chase logic skip naval enemies that a
   land unit cannot strike. (Ships in range of a land unit's counter-attack
   still counter normally; this only stops *initiating* impossible chases.)

## Section 5 — Defensive positioning & bridge waste

1. **Coast-exposure rule for land units.** In the generic move scorer
   (`bestAvailableAction`), any destination tile that is `coastExposedTile` to
   a naval enemy gets a hard penalty (≈ −400, stronger than the existing −200
   `inThreat`), unless the moving unit could strike a naval enemy from that
   tile this turn, or the tile is its own village/port it must garrison or
   board from. Combined with Section 4.3 this ends the "march along the coast
   and get farmed" behaviour. Exploration/capture moves that legitimately pass
   through or target valuable coastal tiles remain possible (penalty, not a
   hard block).

2. **Bridge waste.**
   - While `navalThreat`: bridge candidates are skipped entirely — resources
     go to the naval response.
   - Normally (no threat): the bridge gate in `ai.ts` only accepts a bridge
     whose crossing gains something — one land shore is the AI's own, **and**
     the far shore leads to an AI tile/road worth connecting, a foreign/free
     settlement, or unexplored land (mirroring the existing `pushesForward`
     idea used for roads). Pointless "bridges to nowhere" disappear outside
     threats too.

## Section 6 — Stand-down & difficulty scaling

`navalThreat` is recomputed every AI turn from `analyzeSituation`. All naval
patterns gate on it, so when no naval enemy is within the radius the AI stops
boarding ships, positioning/spawning catapults, and opening further naval
skills, and resumes its normal economy/expansion/war priorities. Existing ships,
catapults, and skills stay (skills are permanent; no "re-land idle ships" step).

Difficulty scaling via a new `navalThreatRadius` knob on
`AiDifficultyProfile`:

| Profile | `navalThreatRadius` | Effect |
|---|---|---|
| easy | ~6 | reacts late; may not get a navy up in time |
| normal | ~10 | reacts in time |
| hard | ~14 | reacts early and decisively |

The existing `mistakeChance` still lets easy occasionally fumble the response.

## Section 7 — Implementation surface & tests

Files touched (all `src/game/`):

- `aiSituation.ts` — naval detection, `navalThreat`/`navalEnemies`/
  `nearestNaval` fields, `isNavalEnemy`, `coastExposedTile`.
- `aiPatterns.ts` — gated patterns: `naval-open-skills`, `naval-build-port`,
  `naval-board-ship`, `naval-hunt`, `naval-upgrade-ship`,
  `naval-position-catapult`; melee no-pirate-chase rule in `hunt-idle-enemy`;
  exposure filtering in chase/explore destinations where cheap.
- `ai.ts` — expose situation fields to the generic move scorer; exposure
  penalty; bridge-worth gate; port bypass of `reserveLastSlotForMine`.
- `aiDifficulty.ts` — `navalThreatRadius` knob per profile.
- `aiTypes.ts` — add the `upgradeShip` AiAction (`{ type: 'upgradeShip';
  unitId: string }`); `ai.ts` `markUsed` treats it as an acted unit; the
  simulator's `runAiTurn` executes it via the existing `doUpgradeShip`.
- No new `AiAction` types beyond `upgradeShip`: existing `move`/`attack`/
  `spawn`/`build`/`openSkill` cover the rest. `GAME.md` unchanged (no rules
  change).

Tests — new `tests/aiNaval.test.ts` with targeted scenario maps (water + coast +
settlements; helpers similar to `tests/ai.test.ts` but with water tiles):

1. `navalThreat` is true when a pirate or enemy ship is within the radius of AI
   territory and false when far away; `isNavalEnemy` classifies correctly.
2. Under threat the AI opens `Water → Navigation` and `Science → Catapult`
   before unrelated skills; without a threat it does not.
3. A port is built on the threatened coast when threatened and missing one; the
   `reserveLastSlotForMine` guard is bypassed.
4. A spare unit moves onto the port to become a ship when threatened and
   ship-less; the last defender of an endangered village is never chosen.
5. A ship sails to a firing tile and attacks the pirate; it never stops adjacent
   to a pirate.
6. Ships get upgraded to level 2 (then 3) when threatened and affordable.
7. Idle catapults are positioned within range 4 of the pirate on a non-exposed
   tile; no same-turn `move`+`attack` is planned for a land catapult.
8. A land melee unit does not chase a pirate and avoids idling on an exposed
   coast tile.
9. Bridges are not built while threatened; pointless bridges are filtered even
   without a threat.
10. When the pirate leaves the radius the naval patterns stop firing
    (stand-down); skills already opened stay.

All existing tests stay green under the `'normal'` default.

Manual/QA acceptance checklist:

1. AI vs human on a map with water: when pirates reach the AI coast, the AI
   opens `Water/Navigation` + `Catapult`, builds a port, puts a ship to sea, and
   catapults shell from the shore.
2. During that phase the AI does not march melee units along the beach to be
   shot, and does not build bridges.
3. After the pirates are gone (or out of range), the AI resumes normal
   expansion and stops over-building naval assets.
