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
directed pair, seed 12345.

Effective cost = money + 1×wood + 2×ore + one-time skill-gate cost (skill price `3 × level + 2 × opened`, summed over the skill's prerequisite chain).

## Units (live stats)

- Warrior: attack 20, defense 10, HP 50, range 1, move 10 — spawn cost **4 money**
- Rider: attack 22, defense 8, HP 45, range 1, move 40, skill riding — spawn cost **6 money**
- Archer: attack 26, defense 7, HP 40, range 2, move 10 — spawn cost **6 money**
- Swordsman: attack 40, defense 16, HP 80, range 1, move 10, skill swordsman — spawn cost **10 money + 2 ore**
- Shield: attack 7, defense 20, HP 80, range 1, move 10, skill shields — spawn cost **8 money + 2 ore**
- Catapult: attack 50, defense 0, HP 30, range 4, move 10, skill catapult — spawn cost **15 money + 10 wood + 3 ore**
- Knight: attack 46, defense 12, HP 70, range 1, move 30, skill knights — spawn cost **14 money + 5 ore**
- Stalker: attack 10, defense 0, HP 20, range 1, move 20 — spawn cost **9 money + 2 ore**
- Builder: attack 10, defense 0, HP 40, range 1, move 8 — spawn cost **15 money**
- Banner: attack 20, defense 8, HP 40, range 1, move 8 — spawn cost **7 money + 2 ore**
- Berserker: attack 30, defense 8, HP 50, range 1, move 10 — spawn cost **11 money + 3 ore**
- Trapper: attack 20, defense 8, HP 40, range 1, move 10 — spawn cost **9 money + 2 ore**
- Stormcaller: attack 20, defense 8, HP 40, range 1, move 20 — spawn cost **9 money + 2 ore**
- Stunner: attack 20, defense 10, HP 40, range 2, move 8 — spawn cost **7 money + 2 ore**

## Turns-to-kill matrix (deterministic, no-miss)

Row unit attacks; cell shows attack-turns needed and the winner of that duel.

| vs \ attacks →| Warrior | Rider | Archer | Swordsman | Shield | Catapult | Knight | Stalker | Builder | Banner | Berserker | Trapper | Stormcaller | Stunner |
|---|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| **Warrior** | — | 2(→warrior) | 2(→warrior) | 1(→swordsman) | 3(→shield) | 1(→catapult) | 1(→knight) | 1(→warrior) | 1(→warrior) | 2(→warrior) | 2(→berserker) | 2(→warrior) | 2(→warrior) | 2(→warrior) |
| **Rider** | 2(→rider) | — | 2(→rider) | 1(→swordsman) | 3(→shield) | 1(→rider) | 1(→knight) | 1(→rider) | 1(→rider) | 2(→rider) | 2(→berserker) | 2(→rider) | 2(→rider) | 2(→rider) |
| **Archer** | 2(→archer) | 2(→archer) | — | 1(→swordsman) | 3(→archer) | 1(→catapult) | 1(→knight) | 1(→archer) | 1(→archer) | 2(→archer) | 2(→archer) | 2(→archer) | 2(→archer) | 2(→archer) |
| **Swordsman** | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | — | 2(→swordsman) | 2(→catapult) | 2(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) |
| **Shield** | 3(→shield) | 3(→shield) | 2(→shield) | 2(→swordsman) | — | 2(→catapult) | 2(→knight) | 1(→shield) | 2(→shield) | 2(→shield) | 3(→berserker) | 2(→shield) | 2(→shield) | 2(→shield) |
| **Catapult** | 1(→catapult) | 1(→catapult) | 1(→catapult) | 2(→catapult) | 2(→catapult) | — | 1(→knight) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) |
| **Knight** | 1(→knight) | 1(→knight) | 1(→knight) | 2(→knight) | 2(→knight) | 1(→knight) | — | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) | 1(→knight) |
| **Stalker** | 1(→warrior) | 1(→rider) | 1(→archer) | 1(→swordsman) | 1(→shield) | 1(→catapult) | 1(→knight) | — | 2(→builder) | 1(→banner) | 1(→berserker) | 1(→trapper) | 1(→stormcaller) | 1(→stunner) |
| **Builder** | 2(→warrior) | 2(→rider) | 1(→archer) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 2(→builder) | — | 2(→banner) | 1(→berserker) | 2(→trapper) | 2(→stormcaller) | 2(→stunner) |
| **Banner** | 2(→warrior) | 2(→banner) | 2(→banner) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 1(→banner) | 2(→banner) | — | 2(→berserker) | 2(→banner) | 2(→banner) | 2(→banner) |
| **Berserker** | 2(→berserker) | 2(→berserker) | 1(→berserker) | 1(→swordsman) | 3(→berserker) | 1(→catapult) | 1(→knight) | 1(→berserker) | 1(→berserker) | 1(→berserker) | — | 1(→berserker) | 1(→berserker) | 1(→berserker) |
| **Trapper** | 2(→warrior) | 2(→trapper) | 2(→trapper) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 1(→trapper) | 2(→trapper) | 2(→trapper) | 2(→berserker) | — | 2(→trapper) | 2(→trapper) |
| **Stormcaller** | 2(→warrior) | 2(→stormcaller) | 2(→stormcaller) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 1(→stormcaller) | 2(→stormcaller) | 2(→stormcaller) | 2(→berserker) | 2(→stormcaller) | — | 2(→stormcaller) |
| **Stunner** | 2(→stunner) | 2(→stunner) | 2(→stunner) | 1(→swordsman) | 4(→stunner) | 1(→catapult) | 1(→knight) | 1(→stunner) | 1(→stunner) | 2(→stunner) | 2(→berserker) | 2(→stunner) | 2(→stunner) | — |

## Win-rate matrix (Monte-Carlo, symmetrised)

🟢 row wins ≥60%, ⚪ 40–60%, 🔴 row wins ≤40%.

| wins over →| Warrior | Rider | Archer | Swordsman | Shield | Catapult | Knight | Stalker | Builder | Banner | Berserker | Trapper | Stormcaller | Stunner |
|---|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| **Warrior** | — | ⚪ 55% | ⚪ 51% | 🔴 0% | 🔴 1% | 🔴 1% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 92% | 🔴 8% | 🟢 93% | 🟢 92% | ⚪ 54% |
| **Rider** | ⚪ 45% | — | ⚪ 46% | 🔴 0% | 🔴 0% | ⚪ 51% | 🔴 1% | 🟢 100% | 🟢 100% | ⚪ 54% | 🔴 8% | ⚪ 54% | ⚪ 54% | ⚪ 54% |
| **Archer** | ⚪ 49% | ⚪ 54% | — | 🔴 0% | ⚪ 45% | 🔴 6% | 🔴 0% | 🟢 100% | 🟢 100% | ⚪ 54% | ⚪ 45% | ⚪ 54% | ⚪ 54% | ⚪ 53% |
| **Swordsman** | 🟢 100% | 🟢 100% | 🟢 100% | — | 🟢 100% | 🔴 10% | ⚪ 55% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 100% |
| **Shield** | 🟢 99% | 🟢 100% | ⚪ 55% | 🔴 0% | — | 🔴 1% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 100% | 🔴 0% | 🟢 100% | 🟢 100% | 🟢 65% |
| **Catapult** | 🟢 100% | ⚪ 49% | 🟢 94% | 🟢 90% | 🟢 100% | — | 🔴 5% | 🟢 100% | 🟢 100% | 🟢 99% | 🟢 100% | 🟢 100% | 🟢 95% | 🟢 95% |
| **Knight** | 🟢 100% | 🟢 99% | 🟢 100% | ⚪ 45% | 🟢 100% | 🟢 95% | — | 🟢 100% | 🟢 100% | 🟢 100% | 🟢 96% | 🟢 100% | 🟢 100% | 🟢 100% |
| **Stalker** | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | — | 🔴 9% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% |
| **Builder** | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🟢 91% | — | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% |
| **Banner** | 🔴 8% | ⚪ 46% | ⚪ 46% | 🔴 0% | 🔴 0% | 🔴 1% | 🔴 0% | 🟢 100% | 🟢 100% | — | 🔴 4% | ⚪ 51% | ⚪ 50% | ⚪ 46% |
| **Berserker** | 🟢 92% | 🟢 92% | ⚪ 55% | 🔴 0% | 🟢 100% | 🔴 0% | 🔴 4% | 🟢 100% | 🟢 100% | 🟢 96% | — | 🟢 95% | 🟢 96% | 🟢 91% |
| **Trapper** | 🔴 7% | ⚪ 46% | ⚪ 46% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🟢 100% | 🟢 100% | ⚪ 49% | 🔴 5% | — | ⚪ 51% | ⚪ 46% |
| **Stormcaller** | 🔴 8% | ⚪ 46% | ⚪ 46% | 🔴 0% | 🔴 0% | 🔴 5% | 🔴 0% | 🟢 100% | 🟢 100% | ⚪ 50% | 🔴 4% | ⚪ 49% | — | ⚪ 46% |
| **Stunner** | ⚪ 46% | ⚪ 46% | ⚪ 47% | 🔴 0% | 🔴 35% | 🔴 5% | 🔴 0% | 🟢 100% | 🟢 100% | ⚪ 54% | 🔴 9% | ⚪ 54% | ⚪ 54% | — |

## Cost efficiency (live)

| Unit | Effective cost | Win-rate | Efficiency |
|------|---------------:|---------:|-----------:|
| Warrior | 4 | 0.50 | 19.44 🟢 |
| Rider | 9 | 0.43 | 9.03 🟢 |
| Archer | 6 | 0.47 | 12.98 🟢 |
| Swordsman | 25 | 0.90 | 6.01 |
| Shield | 15 | 0.63 | 5.91 |
| Catapult | 42 | 0.87 | 3.44 |
| Knight | 35 | 0.95 | 5.07 |
| Stalker | 13 | 0.01 | 0.11 🔴 |
| Builder | 15 | 0.07 | 0.79 🔴 |
| Banner | 11 | 0.35 | 4.96 |
| Berserker | 17 | 0.71 | 6.19 |
| Trapper | 13 | 0.35 | 4.10 |
| Stormcaller | 13 | 0.35 | 4.22 |
| Stunner | 11 | 0.42 | 5.96 |

## Balance flags

- **Before:** Warrior (4) beat the pricier Rider at 92% — cheap-but-strong / expensive-but-weak.
- **Before:** Swordsman (25) beat the pricier Knight at 96% — cheap-but-strong / expensive-but-weak.

- **After:** Warrior still beats Stalker at 100%.
- **After:** Warrior still beats Builder at 100%.
- **After:** Warrior still beats Banner at 92%.
- **After:** Warrior still beats Trapper at 93%.
- **After:** Warrior still beats Stormcaller at 92%.
- **After:** Rider still beats Stalker at 100%.
- **After:** Rider still beats Builder at 100%.
- **After:** Archer still beats Stalker at 100%.
- **After:** Archer still beats Builder at 100%.
- **After:** Knight still beats Catapult at 95%.
- **After:** Banner still beats Stalker at 100%.
- **After:** Banner still beats Builder at 100%.
- **After:** Trapper still beats Builder at 100%.
- **After:** Stormcaller still beats Builder at 100%.
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
| Knight | attack | 40 | **46** |
| Knight | defense | 7 | **12** |
| Knight | HP | 60 | **70** |
| Stalker | attack | 30 | **10** |
| Stalker | HP | 60 | **20** |
| Stalker | wood | 2 | **0** |
| Stalker | ore | 0 | **2** |
| Builder | HP | 50 | **40** |
| Builder | price | 7 | **15** |
| Banner | HP | 60 | **40** |
| Banner | price | 10 | **7** |
| Banner | ore | 0 | **2** |
| Berserker | attack | 50 | **30** |
| Berserker | defense | 12 | **8** |
| Berserker | HP | 70 | **50** |
| Trapper | HP | 50 | **40** |
| Trapper | wood | 2 | **0** |
| Trapper | ore | 0 | **2** |
| Stormcaller | HP | 50 | **40** |
| Stunner | attack | 40 | **20** |
| Stunner | ore | 0 | **2** |

## Notes

- **Warrior** stays the cheapest cost-efficient baseline (4 money, no skill) and is never the strictly-best duelist.
- **Rider** was expensive-but-weak (lost 92% to a warrior despite costing more + the Riding skill); now it trades ~50/50 while keeping its scouting move-40 role.
- **Archer** was the most cost-inefficient cheap unit; its ranged-only damage got a small attack boost.
- **Knight** was a strictly-inferior swordsman (lost every 1:1 to the cheaper, tankier swordsman); its duel power was raised so the expensive knight stands on equal footing head-to-head.
- **Catapult** stays the glass-cannon siege specialist; fast melee (knight/rider) is its intended counter, not a balance bug.
