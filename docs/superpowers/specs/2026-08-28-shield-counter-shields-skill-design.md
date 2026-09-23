# Design: Shield counter-attack, Shields skill, Defence skill

Date: 2026-08-28

## Overview

Three changes to combat and the skill tree:

1. A shield unit's counter-attack (when it defends) deals `round(7 × hp / maxHp)`
   instead of the hp-scaled version of its base attack (1).
2. A new level-1 skill **Shields** (base cost 3) is required to spawn shield
   units.
3. A new level-2 skill **Defence** (child of Shields, base cost 6) is added to
   the tree; it will unlock a "Build village walls" action that is not
   implemented yet.

## 1. Shield counter-attack

### Behavior

- When a shield unit is the defender in combat (it survives the incoming attack
  and the attacker is within its range), the counter-attack damage is
  `round(7 × hp / maxHp)`.
- When a shield unit is the attacker, its damage is unchanged (hp-scaled from
  its base attack of 1).
- All other units' counter-attack damage is unchanged.

### Implementation

`src/game/combat.ts`:

- Add `counterAttackDamage(unit: Unit): number`:

```
base = unit.type === 'shield' ? 7 : shipAttack(unit)
return round(base * unit.hp / UNIT_TYPES[unit.type].maxHp)
```

- In `performAttack`, the defender's retaliation uses `counterAttackDamage`
  instead of `attackDamage` (currently the single line computing `targetDamage`).

`GAME.md`: add a note to the Attack action description that a defending shield
counters with `round(7 × hp / maxHp)`.

## 2. Shields skill

### Behavior

- New skill `shields`, level 1, parent `null`, base cost 3
  (`3 × level + 2 × opened`).
- Spawning a shield unit requires the Shields skill; without it the spawn is
  rejected and the Spawn dialog shows a "Requires the Shields skill" reason.

### Implementation

`src/game/skills.ts`: add `'shields'` to the `SkillId` union and a `SKILLS`
entry:

```
{ id: 'shields', name: 'Shields', level: 1, parent: null,
  description: 'Allows spawning shield units (10 money).' }
```

`src/game/spawn.ts`: extend `spawnUnit` with the same gate pattern used for
swordsman:

```
if (type === 'shield' && !hasSkill(player, 'shields')) return false;
```

`src/ui/overlays/SpawnDialog.ts`: in `reasons()`, add

```
if (type === 'shield' && !hasSkill(player, 'shields')) out.push('Requires the Shields skill');
```

`GAME.md`: mark the Shield unit as requiring the Shields skill.

## 3. Defence skill

### Behavior

- New skill `defence`, level 2, parent `shields`, base cost 6.
- It will unlock a "Build village walls" action that is not implemented yet; no
  action UI is added.

### Implementation

`src/game/skills.ts`: add `'defence'` to the `SkillId` union and a `SKILLS`
entry:

```
{ id: 'defence', name: 'Defence', level: 2, parent: 'shields',
  description: 'Unlocks the Build village walls action (coming soon).' }
```

`GAME.md`: add both skills to the Skills table.

## No other changes

- `SkillTree` renders skills from `SKILLS`, so the two new nodes appear
  automatically (the tree has no per-skill code).
- `ai.ts` iterates `SKILLS` for `openSkill` candidates and `spawnUnit` already
  gates shield spawns, so the AI behaves consistently without changes.

## Tests

- `tests/combat.test.ts`: `counterAttackDamage` for a shield scales with hp
  (`round(7 × hp / maxHp)`); non-shield units use the existing attack-based
  value. A `performAttack` case where a shield defends and survives applies the
  7-based counter damage.
- `tests/skills.test.ts`: skills count becomes 13; `shields` and `defence`
  entries have the expected level, parent, and base costs (3 and 6).
- `tests/spawn.test.ts`: shield spawn succeeds with the Shields skill and is
  rejected without it.

## Out of scope

- No "Build village walls" action or building.
- No changes to the shield's own attack damage.
