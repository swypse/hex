# Catapult Unit and Catapult Skill

## Overview

Add a new siege unit **catapult** and a new **Catapult** skill (unlocked by Science). The
catapult is an expensive, long-range, low-HP unit that deals random 5–10 damage per attack,
cannot attack after moving, and does not advance onto a killed enemy's tile.

## Changes

### 1. Unit definition (`src/game/units.ts`)

- Add `'catapult'` to the `UnitType` union (so it is a playable, spawnable unit).
- Add `priceWood: number` to `UnitTypeInfo` (set `0` for every existing unit, `20` for
  catapult) so unit costs can include wood.
- `UNIT_TYPES.catapult`:
  `{ movement: 1, attack: 5, attackDistance: 4, maxHp: 3, price: 30, priceWood: 20, priceOre: 5, shape: 'square' }`
  (`attack: 5` is the base used for AI heuristics and the HP-scaled counter-attack; the
  catapult's own attack roll is random 5–10, see §2).
- `UNIT_IMAGE_FILES`: add `catapult: '<tribe-code>-catapult.png'` for all six tribes.
- `UNIT_MOVEMENT`, `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE`: catapult = `1`, `5`, `4`.
- `UNIT_TYPE_NAMES.catapult = 'Catapult'`.
- `canAttack`: a catapult that already moved this turn cannot attack
  (`!(unit.type === 'catapult' && unit.hasMoved)`), mirroring the shield rule.

### 2. Damage model (`src/game/combat.ts`)

- New exported `rollAttackDamage(attacker: Unit, rng: () => number): number`:
  - catapult → `5 + Math.floor(rng() * 6)` (uniform 5..10),
  - otherwise → `attackDamage(attacker)` (unchanged).
- `performAttack` computes `attackerDamage = max(0, rollAttackDamage(attacker, rng) - damageReduction(...))`
  (the random roll happens per attack; buff damage-reduction still applies).
- The kill-advance rule gains catapult: a catapult never moves onto a killed enemy's tile
  (added to the existing `archer`/`pirate`/ship exclusion in `performAttack`).

### 3. Catapult skill (`src/game/skills.ts`)

- Add `'catapult'` to `SkillId`.
- `SKILLS.catapult`: `{ id: 'catapult', name: 'Catapult', level: 1, parent: 'science', description: 'Allows spawning catapult units (30 money + 20 wood + 5 ore).' }`.
- Cost follows the existing `skillCost` formula; opened immediately after Science it costs 5.
- The skill tree (`SkillTree.ts`) lays out automatically from `SKILLS`.

### 4. Spawning

- `src/game/spawn.ts`: require `hasSkill(player, 'catapult')` for catapults (like swordsman/
  shield); build the cost from `priceWood` + `price` + `priceOre`:
  `{ wood: UNIT_TYPES[type].priceWood, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre }`.
- `src/game/ai.ts` and `src/game/aiPatterns.ts`: the spawn cost constructions include wood
  the same way; `bestSpawnableUnitType` skips catapult without the skill; catapult is added
  to the `SPAWN_ORDER` offense/defense lists (AI only picks it when it can afford it and has
  the skill).
- `src/ui/overlays/SpawnDialog.ts`: add `catapult: 'catapult.png'` to `SPAWN_ICONS`; in
  `reasons()` add a wood shortfall check and a `Requires the Catapult skill` reason; the
  price label shows wood when present (e.g. `30 + 20 wood + 5 ore`).

### 5. Assets and docs

- Commit the already-present `public/textures/<tribe-code>-catapult.png` files (all six
  tribes). `public/textures/catapult.png` (spawn button icon) is already tracked.
- Update `GAME.md`: add catapult to the Units table and its action rules, add the Catapult
  skill to the Skills table.

## Tests

- `tests/units.test.ts`: catapult stats (`UNIT_TYPES`, movement/attack/distance), `canAttack`
  false after moving, `canHeal` works.
- `tests/combat.test.ts`: `rollAttackDamage` returns 5..10 for catapult and scales with the
  seeded rng; `performAttack` catapult kill does not move onto the target's tile.
- `tests/spawn.test.ts`: catapult cannot spawn without the Catapult skill; with the skill it
  pays 30 money + 20 wood + 5 ore.
- `tests/skills.test.ts`: Catapult requires Science parent; `canOpenSkill` gating.
- `tests/ai.test.ts` (or existing AI tests): catapult appears in spawn candidates only with
  the skill.

## Out of scope

- No new buildings, ships, or other unit types.
- No change to the counter-attack model (catapult defends with its base attack, HP-scaled).
- No change to the score system or game-over screen.
