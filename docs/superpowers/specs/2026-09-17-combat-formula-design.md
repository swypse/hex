# Combat Formula Rework — Design

Date: 2026-09-17

## Summary

Replace the current flat damage model (`attack − defense − reduction` with a
10-point floor, a random catapult roll, and a 50-based shield counter) with the
Polytopia force-ratio combat formula, tuned to this game's stat scale.

## Formula (literal)

```
attackForce = attacker.attack * (attacker.hp / attacker.maxHp)
defenseForce = defender.defense * (defender.hp / defender.maxHp) * defenseBonus
totalDamage = attackForce + defenseForce
attackResult = round((attackForce / totalDamage) * attacker.attack * K)
defenseResult = round((defenseForce / totalDamage) * defender.defense * K)
```

- `K = 1.5` — computed from the game's own numbers: a full-HP warrior (atk 20)
  vs a same-armour warrior (def 10) ratio is `20/30 × 20 = 13.3`; to preserve
  today's warrior-trade damage of 20, `K = 20 / 13.3 = 1.5`.
- `defenseBonus = 1 + damageReduction(map, defender, tile) / 10`, where
  `damageReduction` is the existing metric from `src/game/buffs.ts`
  (own village +5 → ×1.5, + wall +3 → ×1.8, temple protections +10 → ×2.0,
  none → ×1.0).
- `round` = `Math.round`.

Counter is computed **literal** per `defenseResult` (defense-driven, not
attack-driven): a unit's counter damage scales with its own defense stat and the
incoming force ratio. Counter ordering is unchanged: target survives, is within
its attack distance, and `canCounterAttack` must all hold before the counter is
applied. Damage is applied to the defender first, then the counter to the
attacker.

## Unit stat changes (`src/game/units.ts`)

| Unit | change |
|---|---|
| warrior | defense 0 → **10** |
| rider | defense 5 → **10** |
| archer | defense 5 → **10** |
| swordsman | defense 10 → **20** |
| catapult | attack 40 → **50** (random 40–60 roll removed) |
| shield / knight / pirate | unchanged (20 / 10 / 5) |

## Code changes

### `src/game/combat.ts`

- Remove `MIN_DAMAGE`, the catapult random roll in `rollAttackDamage`, the
  shield counter base 50 in `counterAttackDamage`, and the flat
  `− defense − damageReduction` subtraction.
- Add `K = 1.5` constant.
- Add `defenseBonusFor(map, unit, tile)` returning `1 + damageReduction(map, unit, tile) / 10`.
- Add `resolveCombat(map, attacker, target)` returning
  `{ attackerDamage, defenseResult }` implementing the formula above
  (guarding division by zero → both 0 when total damage is 0).
- `attackDamage(attacker)` stays as the raw force
  `round(shipAttack(attacker) * hp / maxHp)` — UI and AI heuristics keep using it.
- Miss roll, counter range check, `canCounterAttack`, kill advancement, and
  capture-ready handling are unchanged.
- `counterAttackDamage` is removed; its replacement is `defenseResult` from
  `resolveCombat`.

### `src/game/aiPatterns.ts`

- Reimplement `counterDamageTo` (lines ~102-127) with the new formula so AI
  trade evaluation matches `performAttack`.
- Update imports: drop `MIN_DAMAGE`, `counterAttackDamage`; keep `attackDamage`
  for kill-checks and use `resolveCombat`/`counterDamageTo` where the true
  post-defense numbers matter.

### Unchanged

- `src/game/ship.ts`, `src/game/buffs.ts`, `src/game/bonus.ts` — `damageReduction`
  stays as the flat metric; `VILLAGE_DEFENSE = 5` stays.
- `src/ui/hud/HudSelected.ts` — displays `attackDamage(unit)` (the force);
  defense value display picks up the new stats automatically.
- Movement, heal, miss chance (10% / 5% Science), kill advancement, ship stats,
  purchasing — untouched.

## Edge cases

- `attackForce + defenseForce === 0` → attacker damage 0, counter 0 (guard).
- `unit.defense` missing → treated as 0 (`?? 0`).
- Zero-defense defender (land catapult): full `attack × K` on the target, no
  counter from the catapult (also `canCounterAttack` false on land).
- Counter order: defender takes damage first; counter only if it survives, in
  range, and may counter.

## Tests

- `tests/combat.test.ts` — rewrite damage expectations to the K=1.5 formula.
- `tests/units.test.ts` — catapult attack 50; new defense values.
- `tests/ai*.test.ts`, `tests/hudSelected.test.ts` — updated expectations.
- `tests/mapRenderer.test.ts` / `tests/helpers/testMap.ts` — stat fixtures
  updated where new catapult attack or defense values surface.

## Docs

- `GAME.md` — Attack section: formula, no 10-point floor, catapult 50 no random,
  defense-driven counters.
- `units.md` — "Defense rule (to implement)" section replaced with the
  force-ratio rule; catapult row reflects fixed 50.

## Verification

- `npm test`
- `npm run typecheck`
- `npm run build`