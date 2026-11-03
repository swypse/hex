# Unit balance rebalance (Polytopia-inspired)

## Problem

Several units in the current game have poor cost-to-stat ratios, making them
strictly inferior choices:
- **Archer** costs 50% more than a warrior but has the same attack/defense with
  less HP; range 2 doesn't compensate.
- **Rider** has the same issue — speed is valuable but not enough to offset
  worse combat stats at higher cost.
- **Swordsman** costs 3.75× a warrior for only 2× the stats; four warriors
  (same cost) dominate.
- **Knight** costs 5× a warrior for ~2.5× attack; the chain-kill is powerful
  but not that powerful.

## Solution

Adjust all unit stats so the Polytopia ratio pattern applies: elite units are
stronger per-unit but weaker per-cost. The baseline warrior stays unchanged
to preserve existing map balance.

### New unit stats

| Unit     | Atk | Def | HP  | Cost (money, ore) | Movement | Range | Rationale                                     |
|----------|-----|-----|-----|--------------------|----------|-------|-----------------------------------------------|
| Warrior  | 20  | 10  | 50  | 4 / 0              | 1        | 1     | Baseline (unchanged)                          |
| Archer   | 20  | 7   | 40  | 6 / 0              | 1        | 2     | Lower def/HP; range 2 enables free volleys    |
| Rider    | 20  | 7   | 40  | 6 / 0              | 4        | 1     | Same frailty tradeoff for speed               |
| Swordsman| 40  | 20  | 80  | 10 / 2             | 1        | 1     | 2.5× cost for 2× stats — per-unit beast       |
| Shield   | 7   | 20  | 80  | 8 / 2              | 1        | 1     | Very weak attack, very durable wall           |
| Catapult | 50  | 0   | 30  | 15 / 3 (+10 wood)  | 1        | 4     | One-shots warriors, dies to anything          |
| Knight   | 40  | 7   | 60  | 14 / 5             | 3        | 1     | Near-oneshot vs warriors, survives 2 hits     |
| Pirate   | 15  | 5   | 80  | —                  | 5        | 3     | Unchanged (neutral)                           |

### Cost efficiency

| Unit     | Combat power vs warrior (1:1) | Combat power vs warrior (equal cost) |
|----------|-------------------------------|--------------------------------------|
| Archer   | Worse (lower def/HP)          | Worse (archer + 0 warriors = 6 cost) |
| Swordsman| Wins decisively               | ~Loses to 2.5 warriors (same cost)   |
| Shield   | Holds ground, can't kill      | Better with support                  |
| Catapult | One-shots warrior             | Very cost-efficient at range         |
| Knight   | Dominates 1:1                 | ~Loses to 3.5 warriors               |

This mirrors Polytopia: the basic warrior is the most cost-efficient unit.
Elite units exist to break stalemates, hold chokepoints, or exploit specific
tactical situations — not for raw cost efficiency.

### Combat examples (full HP vs full-HP warrior)

- **Archer at range 2**: deals 20 to warrior (no counter). Warrior at 30 HP.
- **Swordsman**: deals 48 to warrior (near oneshot), takes 15. Wins handily.
- **Shield**: deals 4 to warrior, takes 9. A wall, not a killer.
- **Catapult at range**: deals 63 — one-shots a full-HP warrior.
- **Knight**: deals 48 to warrior, takes 3. Dominates 1:1.

### Files to change

- `src/game/units.ts` — UNIT_TYPES values
- `tests/units.test.ts` — update assertions that reference old stats
- `tests/combat.test.ts` — update expected damage values
- `tests/simulator.test.ts` — update any stat-dependent assertions
- `tests/ai.test.ts` — update any AI expectations
- `tests/pirates.test.ts` — pirate-specific expectations
- Other test files that depend on specific unit stat values
- `GAME.md` — update the unit stat table to match