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
- Stalker: attack 30, defense 0, HP 60, range 1, move 12 — spawn cost **9 money + 2 wood**
- Builder: attack 10, defense 0, HP 50, range 1, move 8 — spawn cost **7 money**
- Banner: attack 20, defense 8, HP 60, range 1, move 8 — spawn cost **10 money**
- Berserker: attack 50, defense 12, HP 70, range 1, move 10 — spawn cost **11 money + 3 ore**
- Trapper: attack 20, defense 8, HP 50, range 1, move 10 — spawn cost **9 money + 2 wood**
- Stormcaller: attack 20, defense 8, HP 50, range 1, move 20 — spawn cost **9 money + 2 ore**
- Stunner: attack 40, defense 10, HP 40, range 2, move 8 — spawn cost **7 money**

## Turns-to-kill matrix (deterministic, no-miss)

Row unit attacks; cell shows attack-turns needed and the winner of that duel.

| vs \ attacks →| Warrior | Rider | Archer | Swordsman | Shield | Catapult | Knight | Stalker | Builder | Banner | Berserker | Trapper | Stormcaller | Stunner |
|---|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| **Warrior** | — | 2(→warrior) | 2(→warrior) | 1(→swordsman) | 3(→shield) | 1(→catapult) | 1(→knight) | 2(→warrior) | 2(→warrior) | 3(→warrior) | 1(→berserker) | 2(→warrior) | 2(→warrior) | 2(→stunner) |
| **Rider** | 2(→rider) | — | 2(→rider) | 1(→swordsman) | 3(→shield) | 1(→rider) | 1(→knight) | 2(→rider) | 2(→rider) | 2(→rider) | 1(→berserker) | 2(→rider) | 2(→rider) | 1(→stunner) |
| **Archer** | 2(→archer) | 2(→archer) | — | 1(→swordsman) | 3(→archer) | 1(→catapult) | 1(→knight) | 2(→archer) | 2(→archer) | 2(→archer) | 1(→berserker) | 2(→archer) | 2(→archer) | 1(→stunner) |
| **Swordsman** | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | — | 2(→swordsman) | 2(→catapult) | 2(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) | 2(→swordsman) | 1(→swordsman) | 1(→swordsman) | 1(→swordsman) |
| **Shield** | 3(→shield) | 3(→shield) | 2(→shield) | 2(→swordsman) | — | 2(→catapult) | 2(→knight) | 3(→shield) | 2(→shield) | 3(→shield) | 2(→berserker) | 3(→shield) | 3(→shield) | 2(→stunner) |
| **Catapult** | 1(→catapult) | 1(→catapult) | 1(→catapult) | 2(→catapult) | 2(→catapult) | — | 1(→knight) | 1(→catapult) | 1(→catapult) | 1(→catapult) | 2(→catapult) | 1(→catapult) | 1(→catapult) | 1(→catapult) |
| **Knight** | 1(→knight) | 1(→knight) | 1(→knight) | 2(→knight) | 2(→knight) | 1(→knight) | — | 1(→knight) | 1(→knight) | 1(→knight) | 2(→knight) | 1(→knight) | 1(→knight) | 1(→knight) |
| **Stalker** | 2(→stalker) | 2(→stalker) | 2(→stalker) | 1(→swordsman) | 3(→shield) | 1(→catapult) | 1(→knight) | — | 2(→stalker) | 2(→stalker) | 1(→berserker) | 2(→stalker) | 2(→stalker) | 1(→stunner) |
| **Builder** | 2(→warrior) | 2(→rider) | 2(→archer) | 1(→swordsman) | 2(→shield) | 1(→catapult) | 1(→knight) | 2(→stalker) | — | 2(→banner) | 1(→berserker) | 2(→trapper) | 2(→stormcaller) | 1(→stunner) |
| **Banner** | 2(→banner) | 2(→banner) | 2(→banner) | 1(→swordsman) | 3(→shield) | 1(→catapult) | 1(→knight) | 2(→banner) | 2(→banner) | — | 1(→berserker) | 2(→banner) | 2(→banner) | 2(→stunner) |
| **Berserker** | 1(→berserker) | 1(→berserker) | 1(→berserker) | 2(→berserker) | 2(→berserker) | 2(→catapult) | 1(→berserker) | 1(→berserker) | 1(→berserker) | 1(→berserker) | — | 1(→berserker) | 1(→berserker) | 1(→berserker) |
| **Trapper** | 2(→trapper) | 2(→trapper) | 2(→trapper) | 1(→swordsman) | 3(→shield) | 1(→catapult) | 1(→knight) | 2(→trapper) | 2(→trapper) | 3(→trapper) | 1(→berserker) | — | 2(→trapper) | 2(→stunner) |
| **Stormcaller** | 2(→stormcaller) | 2(→stormcaller) | 2(→stormcaller) | 1(→swordsman) | 3(→shield) | 1(→catapult) | 1(→knight) | 2(→stormcaller) | 2(→stormcaller) | 3(→stormcaller) | 1(→berserker) | 2(→stormcaller) | — | 2(→stunner) |
| **Stunner** | 1(→stunner) | 1(→stunner) | 1(→stunner) | 2(→swordsman) | 2(→stunner) | 1(→catapult) | 1(→knight) | 1(→stunner) | 1(→stunner) | 1(→stunner) | 1(→berserker) | 1(→stunner) | 1(→stunner) | — |

## Win-rate matrix (Monte-Carlo, symmetrised)

🟢 row wins ≥60%, ⚪ 40–60%, 🔴 row wins ≤40%.

| wins over →| Warrior | Rider | Archer | Swordsman | Shield | Catapult | Knight | Stalker | Builder | Banner | Berserker | Trapper | Stormcaller | Stunner |
|---|----|----|----|----|----|----|----|----|----|----|----|----|----|----|
| **Warrior** | — | ⚪ 55% | ⚪ 51% | 🔴 0% | 🔴 1% | 🔴 1% | 🔴 0% | ⚪ 51% | 🟢 100% | ⚪ 49% | 🔴 0% | ⚪ 54% | ⚪ 54% | 🔴 5% |
| **Rider** | ⚪ 45% | — | ⚪ 46% | 🔴 0% | 🔴 0% | ⚪ 51% | 🔴 1% | ⚪ 50% | 🟢 100% | ⚪ 46% | 🔴 0% | ⚪ 50% | ⚪ 51% | 🔴 4% |
| **Archer** | ⚪ 49% | ⚪ 54% | — | 🔴 0% | ⚪ 45% | 🔴 6% | 🔴 0% | ⚪ 50% | 🟢 100% | ⚪ 46% | 🔴 0% | ⚪ 54% | ⚪ 54% | 🔴 5% |
| **Swordsman** | 🟢 100% | 🟢 100% | 🟢 100% | — | 🟢 100% | 🔴 10% | ⚪ 55% | 🟢 100% | 🟢 100% | 🟢 100% | ⚪ 50% | 🟢 100% | 🟢 100% | 🟢 96% |
| **Shield** | 🟢 99% | 🟢 100% | ⚪ 55% | 🔴 0% | — | 🔴 1% | 🔴 0% | 🟢 91% | 🟢 100% | 🟢 100% | 🔴 0% | 🟢 100% | 🟢 100% | 🔴 0% |
| **Catapult** | 🟢 100% | ⚪ 49% | 🟢 94% | 🟢 90% | 🟢 100% | — | 🔴 5% | 🟢 100% | 🟢 100% | 🟢 99% | 🟢 90% | 🟢 100% | 🟢 95% | 🟢 95% |
| **Knight** | 🟢 100% | 🟢 99% | 🟢 100% | ⚪ 45% | 🟢 100% | 🟢 95% | — | 🟢 100% | 🟢 100% | 🟢 100% | ⚪ 46% | 🟢 100% | 🟢 100% | 🟢 96% |
| **Stalker** | ⚪ 49% | ⚪ 50% | ⚪ 50% | 🔴 1% | 🔴 9% | 🔴 0% | 🔴 0% | — | 🟢 99% | ⚪ 50% | 🔴 0% | ⚪ 50% | ⚪ 50% | 🔴 5% |
| **Builder** | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 1% | — | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% |
| **Banner** | ⚪ 51% | ⚪ 54% | ⚪ 54% | 🔴 0% | 🔴 0% | 🔴 1% | 🔴 0% | ⚪ 50% | 🟢 100% | — | 🔴 1% | ⚪ 58% | ⚪ 57% | 🔴 8% |
| **Berserker** | 🟢 100% | 🟢 100% | 🟢 100% | ⚪ 50% | 🟢 100% | 🔴 10% | ⚪ 54% | 🟢 100% | 🟢 100% | 🟢 99% | — | 🟢 100% | 🟢 100% | 🟢 95% |
| **Trapper** | ⚪ 46% | ⚪ 50% | ⚪ 46% | 🔴 0% | 🔴 0% | 🔴 0% | 🔴 0% | ⚪ 50% | 🟢 100% | ⚪ 42% | 🔴 0% | — | ⚪ 51% | 🔴 5% |
| **Stormcaller** | ⚪ 46% | ⚪ 49% | ⚪ 46% | 🔴 0% | 🔴 0% | 🔴 5% | 🔴 0% | ⚪ 50% | 🟢 100% | ⚪ 43% | 🔴 0% | ⚪ 49% | — | 🔴 4% |
| **Stunner** | 🟢 95% | 🟢 96% | 🟢 95% | 🔴 4% | 🟢 100% | 🔴 5% | 🔴 4% | 🟢 95% | 🟢 100% | 🟢 92% | 🔴 5% | 🟢 95% | 🟢 96% | — |

## Cost efficiency (live)

| Unit | Effective cost | Win-rate | Efficiency |
|------|---------------:|---------:|-----------:|
| Warrior | 4 | 0.32 | 9.80 🟢 |
| Rider | 9 | 0.34 | 6.19 |
| Archer | 6 | 0.36 | 7.76 🟢 |
| Swordsman | 25 | 0.85 | 4.98 |
| Shield | 15 | 0.57 | 4.50 |
| Catapult | 42 | 0.86 | 3.01 |
| Knight | 35 | 0.91 | 4.33 |
| Stalker | 11 | 0.32 | 3.23 |
| Builder | 7 | 0.00 | 0.02 🔴 |
| Banner | 10 | 0.33 | 3.74 |
| Berserker | 17 | 0.85 | 7.54 🟢 |
| Trapper | 11 | 0.30 | 2.99 |
| Stormcaller | 13 | 0.30 | 2.58 🔴 |
| Stunner | 7 | 0.68 | 12.58 🟢 |

## Balance flags

- **Before:** Warrior (4) beat the pricier Rider at 92% — cheap-but-strong / expensive-but-weak.
- **Before:** Swordsman (25) beat the pricier Knight at 96% — cheap-but-strong / expensive-but-weak.

- **After:** Warrior still beats Builder at 100%.
- **After:** Archer still beats Builder at 100%.
- **After:** Knight still beats Catapult at 95%.
- **After:** Stunner still beats Rider at 96%.
- **After:** Stunner still beats Shield at 100%.
- **After:** Stunner still beats Stalker at 95%.
- **After:** Stunner still beats Banner at 92%.
- **After:** Stunner still beats Trapper at 95%.
- **After:** Stunner still beats Stormcaller at 96%.

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

## Notes

- **Warrior** stays the cheapest cost-efficient baseline (4 money, no skill) and is never the strictly-best duelist.
- **Rider** was expensive-but-weak (lost 92% to a warrior despite costing more + the Riding skill); now it trades ~50/50 while keeping its scouting move-40 role.
- **Archer** was the most cost-inefficient cheap unit; its ranged-only damage got a small attack boost.
- **Knight** was a strictly-inferior swordsman (lost every 1:1 to the cheaper, tankier swordsman); its duel power was raised so the expensive knight stands on equal footing head-to-head.
- **Catapult** stays the glass-cannon siege specialist; fast melee (knight/rider) is its intended counter, not a balance bug.
