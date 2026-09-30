# Combat balance report

> **Auto-generated** on every test run by `tests/balance-report.test.ts` from the live
> `UNIT_TYPES` table in `src/game/units.ts`. Do not edit by hand; edit the sim in
> `src/game/balance.ts` / the report template in `src/game/balance-report.ts` instead.

## Method

Unit-vs-unit duels on open terrain (no defensive bonus), driven by the real combat formula
(`resolveCombat` + `COMBAT_SCALE` 1.5 + 10% miss). Each pair fights twice (both attack
orders) and the two directed results are averaged so first-strike bias cancels out. A unit
out of range closes `movePoints / 10` hexes per turn before attacking; ranged units (archer,
catapult) therefore get free volleys while closing. Monte-Carlo: 2000 seeded trials per
directed pair, seed 12345. Also modelled: berserker rage (+attack, a raging berserker does not
counter, as in `canCounterAttack`), stalker first strike (ignores defense) and catapults that
cannot fire in a turn they moved. Not modelled in duels (only in the skirmish section): banner
aura and the knight's extra attack. Never modelled: stun, traps, storm, building, terrain, healing.

Effective cost = money + 1×wood + 2×ore + one-time skill-gate cost (skill price `3 × level + 2 × opened`, summed over the skill's prerequisite chain).

## Units (live stats)

- Warrior: attack 20, defense 10, HP 50, range 1, move 10 — spawn cost **4 money**
- Rider: attack 22, defense 8, HP 45, range 1, move 40, skill riding — spawn cost **6 money**
- Archer: attack 26, defense 7, HP 40, range 2, move 10 — spawn cost **6 money**
- Swordsman: attack 40, defense 16, HP 80, range 1, move 10, skill swordsman — spawn cost **10 money + 2 ore**
- Shield: attack 7, defense 20, HP 80, range 1, move 10, skill shields — spawn cost **8 money + 2 ore**
- Catapult: attack 50, defense 0, HP 30, range 4, move 10, skill catapult — spawn cost **15 money + 10 wood + 3 ore**
- Knight: attack 40, defense 12, HP 70, range 1, move 30, skill knights — spawn cost **14 money + 5 ore**
- Stalker: attack 10, defense 0, HP 20, range 1, move 20 — spawn cost **9 money + 2 ore**
- Builder: attack 10, defense 0, HP 40, range 1, move 8 — spawn cost **15 money**
- Banner: attack 10, defense 0, HP 30, range 1, move 8 — spawn cost **7 money + 2 ore**
- Berserker: attack 26, defense 8, HP 50, range 1, move 10 — spawn cost **10 money + 2 ore**
- Trapper: attack 20, defense 8, HP 44, range 1, move 10 — spawn cost **6 money + 2 ore**
- Stormcaller: attack 20, defense 8, HP 44, range 1, move 20 — spawn cost **6 money + 2 ore**
- Stunner: attack 20, defense 10, HP 40, range 2, move 8 — spawn cost **7 money + 2 ore**

## Turns-to-kill matrix (deterministic, no-miss)

Row unit attacks; cell shows attack-turns needed and the winner of that duel.

| vs \ attacks →| Warrior | Rider | Archer | Swordsman | Shield | Catapult | Knight | Stalker | Builder | Banner | Berserker | Trapper | Stormcaller | Stunner |
|---|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| **Warrior** | — | 2(→warrior) | 2(→warrior) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 1(→warrior) | 1(→warrior) | 1(→warrior) | 2(→warrior) | 2(→warrior) | 2(→warrior) | 2(→warrior) |
| **Rider** | 2(→rider) | — | 2(→rider) | 1(→swordsman) | 2(→shield) | 1(→rider) | 1(→knight) | 1(→rider) | 1(→rider) | 1(→rider) | 2(→rider) | 2(→rider) | 2(→rider) | 2(→rider) |
| **Archer** | 2(→archer) | 2(→archer) | — | 1(→swordsman) | 3(→archer) | 1(→catapult) | 1(→knight) | 1(→archer) | 1(→archer) | 1(→archer) | 2(→archer) | 2(→archer) | 2(→archer) | 2(→archer) |
| **Swordsman** | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | — | 2(→swordsman) | 2(→catapult) | 2(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) |
| **Shield** | 2(→shield) | 2(→shield) | 2(→shield) | 2(→swordsman) | — | 2(→catapult) | 2(→knight) | 2(→shield) | 1(→shield) | 1(→shield) | 2(→shield) | 2(→shield) | 2(→shield) | 2(→shield) |
| **Catapult** | 1(→catapult) | 1(→catapult) | 1(→catapult) | 2(→catapult) | 2(→catapult) | — | 1(→knight) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) |
| **Knight** | 1(→knight) | 1(→knight) | 1(→knight) | 2(→knight) | 2(→knight) | 1(→knight) | — | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) |
| **Stalker** | 1(→warrior) | 1(→rider) | 1(→archer) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | — | 2(→builder) | 2(→stalker) | 1(→berserker) | 1(→trapper) | 1(→stormcaller) | 1(→stunner) |
| **Builder** | 2(→warrior) | 2(→rider) | 1(→archer) | 1(→swordsman) | 1(→shield) | 1(→catapult) | 1(→knight) | 2(→builder) | — | 2(→builder) | 1(→berserker) | 2(→trapper) | 2(→stormcaller) | 2(→stunner) |
| **Banner** | 1(→warrior) | 1(→rider) | 1(→archer) | 1(→swordsman) | 1(→shield) | 1(→catapult) | 1(→knight) | 2(→banner) | 2(→builder) | — | 1(→berserker) | 1(→trapper) | 1(→stormcaller) | 1(→stunner) |
| **Berserker** | 2(→berserker) | 2(→berserker) | 2(→berserker) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 1(→berserker) | 1(→berserker) | 1(→berserker) | — | 2(→berserker) | 2(→berserker) | 2(→berserker) |
| **Trapper** | 2(→warrior) | 2(→trapper) | 2(→trapper) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 1(→trapper) | 2(→trapper) | 1(→trapper) | 2(→berserker) | — | 2(→trapper) | 2(→trapper) |
| **Stormcaller** | 2(→warrior) | 2(→stormcaller) | 2(→stormcaller) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 1(→stormcaller) | 2(→stormcaller) | 1(→stormcaller) | 2(→berserker) | 2(→stormcaller) | — | 2(→stormcaller) |
| **Stunner** | 2(→stunner) | 2(→stunner) | 2(→stunner) | 1(→swordsman) | 3(→shield) | 1(→catapult) | 1(→knight) | 1(→stunner) | 1(→stunner) | 1(→stunner) | 2(→berserker) | 2(→stunner) | 2(→stunner) | — |

## Win-rate matrix (Monte-Carlo, symmetrised)

🟢 row wins ≥60%, ⚪ 40–60%, 🔴 row wins ≤40%.

| wins over →| Warrior | Rider | Archer | Swordsman | Shield | Catapult | Knight | Stalker | Builder | Banner | Berserker | Trapper | Stormcaller | Stunner |
|---|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| **Warrior** | — | ⚪ 55% | ⚪ 51% | 🔴 0% | 🔴 0% | 🔴 1% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 100% | ⚪ 46% | 🟢 92% | 🟢 91% | ⚪ 54% |
| **Rider** | ⚪ 45% | — | ⚪ 46% | 🔴 0% | 🔴 0% | ⚪ 51% | 🔴 1% | 🟢 100% | 🟢 100% | 🟢 100% | ⚪ 46% | ⚪ 54% | ⚪ 54% | ⚪ 54% |
| **Archer** | ⚪ 49% | ⚪ 54% | — | 🔴 0% | 🔴 37% | 🔴 6% | 🔴 4% | 🟢 100% | 🟢 100% | 🟢 100% | ⚪ 46% | ⚪ 54% | ⚪ 54% | ⚪ 53% |
| **Swordsman** | 🟢 100% | 🟢 100% | 🟢 100% | — | 🟢 100% | 🔴 10% | ⚪ 55% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% |
| **Shield** | 🟢 100% | 🟢 100% | 🟢 63% | 🔴 0% | — | 🔴 0% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% |
| **Catapult** | 🟢 100% | ⚪ 49% | 🟢 94% | 🟢 90% | 🟢 100% | — | 🔴 5% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 95% | 🟢 95% |
| **Knight** | 🟢 100% | 🟢 99% | 🟢 96% | ⚪ 45% | 🟢 100% | 🟢 95% | — | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 96% | 🟢 100% | 🟢 100% | 🟢 100% |
| **Stalker** | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | — | 🔴 9% | ⚪ 50% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% |
| **Builder** | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🟢 91% | — | 🟢 92% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% |
| **Banner** | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | ⚪ 50% | 🔴 8% | — | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% |
| **Berserker** | ⚪ 54% | ⚪ 54% | ⚪ 54% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 4% | 🟢 100% | 🟢 100% | 🟢 100% | — | 🟢 92% | 🟢 91% | 🟢 92% |
| **Trapper** | 🔴 8% | ⚪ 46% | ⚪ 46% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 100% | 🔴 8% | — | ⚪ 51% | ⚪ 47% |
| **Stormcaller** | 🔴 9% | ⚪ 46% | ⚪ 46% | 🔴 0% | 🔴 0% | 🔴 5% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 100% | 🔴 9% | ⚪ 49% | — | ⚪ 47% |
| **Stunner** | ⚪ 46% | ⚪ 46% | ⚪ 47% | 🔴 0% | 🔴 0% | 🔴 5% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 100% | 🔴 8% | ⚪ 53% | ⚪ 53% | — |

## Cost efficiency (live)

| Unit | Effective cost | Win-rate | Efficiency |
|------|---------------:|---------:|-----------:|
| Warrior | 4 | 0.53 | 19.51 🟢 |
| Rider | 9 | 0.50 | 9.80 🟢 |
| Archer | 6 | 0.51 | 13.09 🟢 |
| Swordsman | 25 | 0.90 | 5.65 |
| Shield | 15 | 0.74 | 6.73 |
| Catapult | 42 | 0.87 | 3.24 🔴 |
| Knight | 35 | 0.95 | 4.81 |
| Stalker | 13 | 0.05 | 0.54 🔴 |
| Builder | 15 | 0.14 | 1.47 🔴 |
| Banner | 11 | 0.04 | 0.70 🔴 |
| Berserker | 14 | 0.57 | 5.67 |
| Trapper | 10 | 0.39 | 5.78 |
| Stormcaller | 10 | 0.39 | 5.95 |
| Stunner | 11 | 0.43 | 5.61 |

## Dominance (core combat roster)

- **Super-strong:** Knight.
- **Super-weak:** none.

Core combat roster only (11 units); utility units (Stalker, Builder, Banner) are judged on their abilities and excluded.
Super-strong = beats ≥ ⅔ of the roster at ≥60% and nothing beats it at ≥60% (its worst matchup is above 40%).
Super-weak = beats nothing and is beaten (≤40%) by ≥ ⅔ of the roster.

| Unit | Eff. cost | Upkeep | Mean win (core) | Beats ≥60% | Loses ≤40% | Beaten by |
|------|----------:|-------:|----------------:|-----------:|-----------:|-----------|
| Knight 🟢 super-strong | 35 | 4 | 0.93 | 9 | 0 | — |
| Swordsman | 25 | 3 | 0.86 | 8 | 1 | Catapult |
| Catapult | 42 | 5 | 0.83 | 8 | 1 | Knight |
| Shield | 15 | 2 | 0.66 | 7 | 3 | Swordsman, Catapult, Knight |
| Berserker | 14 | 4 | 0.44 | 3 | 4 | Swordsman, Shield, Catapult, Knight |
| Warrior | 4 | 1 | 0.39 | 2 | 4 | Swordsman, Shield, Catapult, Knight |
| Archer | 6 | 2 | 0.36 | 0 | 4 | Swordsman, Shield, Catapult, Knight |
| Rider | 9 | 2 | 0.35 | 0 | 3 | Swordsman, Shield, Knight |
| Stunner | 11 | 2 | 0.26 | 0 | 5 | Swordsman, Shield, Catapult, Knight, Berserker |
| Stormcaller | 10 | 4 | 0.21 | 0 | 6 | Warrior, Swordsman, Shield, Catapult, Knight, Berserker |
| Trapper | 10 | 3 | 0.21 | 0 | 6 | Warrior, Swordsman, Shield, Catapult, Knight, Berserker |

## Cost vs power (core roster)

| Unit | Eff. cost | Mean win (core) | Win per 10 cost |
|------|----------:|----------------:|----------------:|
| Warrior | 4 | 0.39 | 0.97 |
| Archer | 6 | 0.36 | 0.60 |
| Rider | 9 | 0.35 | 0.39 |
| Trapper | 10 | 0.21 | 0.21 |
| Stormcaller | 10 | 0.21 | 0.21 |
| Stunner | 11 | 0.26 | 0.24 |
| Berserker | 14 | 0.44 | 0.32 |
| Shield | 15 | 0.66 | 0.44 |
| Swordsman | 25 | 0.86 | 0.35 |
| Knight | 35 | 0.93 | 0.27 |
| Catapult | 42 | 0.83 | 0.20 |

## Catapult sensitivity to starting distance

The catapult cannot fire in a turn it moved. The default duel starts it in range (the enemy walks in and eats free volleys); this compares with an ambush at distance 1.

| Opponent | Catapult starts in range (free volleys) | Catapult ambushed at distance 1 |
|----------|:---:|:---:|
| Warrior | catapult | catapult |
| Rider | catapult | catapult |
| Archer | catapult | catapult |
| Swordsman | catapult | swordsman |
| Shield | catapult | shield |
| Knight | knight | knight |
| Berserker | catapult | catapult |
| Trapper | catapult | catapult |
| Stormcaller | catapult | catapult |
| Stunner | catapult | catapult |

## Equal-budget skirmish (budget 96, ≤6 melee attackers per target)

Mono-army vs mono-army with the same budget: focus fire, banner aura, knight extra attack, rage, ranged free volleys during the approach. No terrain, no population cap, no village capacity — mass is flattered.

**Purchase price only**

| Unit | Unit cost | Army size | Mean win vs other armies |
|------|----------:|----------:|-------------------------:|
| Warrior | 4 | 24 | 0.95 |
| Archer | 6 | 16 | 0.95 |
| Rider | 6 | 16 | 0.69 |
| Swordsman | 14 | 7 | 0.68 |
| Stunner | 11 | 9 | 0.60 |
| Knight | 24 | 4 | 0.57 |
| Shield | 12 | 8 | 0.37 |
| Catapult | 31 | 3 | 0.26 |
| Stormcaller | 10 | 10 | 0.23 |
| Trapper | 10 | 10 | 0.18 |
| Berserker | 14 | 7 | 0.01 |

**Price + 5 turns of upkeep**

| Unit | Unit cost | Army size | Mean win vs other armies |
|------|----------:|----------:|-------------------------:|
| Warrior | 9 | 11 | 0.99 |
| Archer | 16 | 6 | 0.87 |
| Stunner | 21 | 5 | 0.74 |
| Swordsman | 29 | 3 | 0.56 |
| Knight | 44 | 2 | 0.56 |
| Catapult | 56 | 2 | 0.53 |
| Rider | 16 | 6 | 0.52 |
| Shield | 22 | 4 | 0.40 |
| Trapper | 25 | 4 | 0.17 |
| Berserker | 34 | 3 | 0.12 |
| Stormcaller | 30 | 3 | 0.03 |

## Balance flags

- **Before:** Warrior (4) beat the pricier Rider at 92% — cheap-but-strong / expensive-but-weak.
- **Before:** Swordsman (25) beat the pricier Knight at 96% — cheap-but-strong / expensive-but-weak.

- **After:** Warrior still beats Stalker at 100%.
- **After:** Warrior still beats Builder at 100%.
- **After:** Warrior still beats Banner at 100%.
- **After:** Warrior still beats Trapper at 92%.
- **After:** Warrior still beats Stormcaller at 91%.
- **After:** Rider still beats Stalker at 100%.
- **After:** Rider still beats Builder at 100%.
- **After:** Rider still beats Banner at 100%.
- **After:** Archer still beats Stalker at 100%.
- **After:** Archer still beats Builder at 100%.
- **After:** Archer still beats Banner at 100%.
- **After:** Knight still beats Catapult at 95%.
- **After:** Berserker still beats Builder at 100%.
- **After:** Trapper still beats Stalker at 100%.
- **After:** Trapper still beats Builder at 100%.
- **After:** Trapper still beats Banner at 100%.
- **After:** Stormcaller still beats Stalker at 100%.
- **After:** Stormcaller still beats Builder at 100%.
- **After:** Stormcaller still beats Banner at 100%.
- **After:** Stunner still beats Stalker at 100%.
- **After:** Stunner still beats Builder at 100%.

## Applied changes (vs pre-rebalance baseline)

| Unit | Stat | Before | After |
|------|------|-------:|------:|
| Rider | attack | 20 | **22** |
| Rider | defense | 7 | **8** |
| Rider | HP | 40 | **45** |
| Archer | attack | 20 | **26** |
| Swordsman | defense | 20 | **16** |
| Knight | defense | 7 | **12** |
| Knight | HP | 60 | **70** |
| Stalker | attack | 30 | **10** |
| Stalker | HP | 60 | **20** |
| Stalker | wood | 2 | **0** |
| Stalker | ore | 0 | **2** |
| Builder | HP | 50 | **40** |
| Builder | price | 7 | **15** |
| Banner | attack | 20 | **10** |
| Banner | defense | 8 | **0** |
| Banner | HP | 60 | **30** |
| Banner | price | 10 | **7** |
| Banner | ore | 0 | **2** |
| Berserker | price | 11 | **10** |
| Berserker | ore | 3 | **2** |
| Trapper | HP | 50 | **44** |
| Trapper | price | 9 | **6** |
| Trapper | wood | 2 | **0** |
| Trapper | ore | 0 | **2** |
| Stormcaller | HP | 50 | **44** |
| Stormcaller | price | 9 | **6** |
| Stunner | attack | 40 | **20** |
| Stunner | ore | 0 | **2** |

## Notes

- **Warrior** stays the cheapest cost-efficient baseline (4 money, no skill) and is never the strictly-best duelist.
- **Rider** was expensive-but-weak (lost 92% to a warrior despite costing more + the Riding skill); now it trades ~50/50 while keeping its scouting move-40 role.
- **Archer** was the most cost-inefficient cheap unit; its ranged-only damage got a small attack boost.
- **Knight** was a strictly-inferior swordsman (lost every 1:1 to the cheaper, tankier swordsman); its duel power was raised so the expensive knight stands on equal footing head-to-head.
- **Catapult** stays the glass-cannon siege specialist; fast melee (knight/rider) is its intended counter, not a balance bug.
- **Knight** attack was later cut 46 → 40 and the swordsman is now its only (coin-flip) counter; see the Dominance section for the live verdict.
- **Trapper / Stormcaller** were repriced to 6 money + 2 ore (effective 10) with +4 HP; **Berserker** to 10 money + 2 ore. See unit-balance-report.md.
