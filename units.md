# Units

Balance reference for all unit types. This document is a **proposal**: it scales every
damage-related value (HP, attack, damage rolls, defence) **×10** for finer balance, adds a
new **defence** characteristic (not implemented yet), and adjusts a few costs/abilities.
Movement, attack range and costs are **not** scaled.

## Defence rule (to implement)

- Every unit has `defence` (`Def`), an armour value. Defence is no longer limited to
  whole 0–2 points: with a ×10 damage scale it can use steps of **5** (5 ≈ 0.5 in the old
  scale), so fragile units can carry light armour.
- Incoming damage is reduced by the defender's defence and never drops below **10**:
  `final = max(10, rolled − defender.Def)`.
- The reduction applies to normal attacks, the catapult's 40–60 roll, and
  counter-attacks.
- Attack damage still scales with the attacker's current HP
  (`round(baseAtk × hp / maxHp)`).

## Land units

| Unit | HP | Atk | Def | Move | Atk range | Cost | Notes |
|------|----|----|-----|------|-----------|------|-------|
| Warrior | 50 | 20 | 0 | 1 | 1 | 4 | Starting/cheap garrison |
| Rider | 40 | 20 | 5 | 4 | 1 | 6 | Hit-and-run: may move after attacking |
| Archer | 30 | 20 | 5 | 1 | 2 | 6 | Ranged; never pursues a kill |
| Swordsman | 80 | 40 | 10 | 1 | 1 | 15 + 3⛏ | Heavy melee |
| Shield | 100 | 10 | 20 | 1 | 1 | 10 + 3⛏ | Counter-attacks for 50-based damage; can't attack after moving |
| Catapult | 30 | 40–60 | 0 | 1 | 4 | 30 + 20🪵 + 5⛏ | Siege; rolls 40–60; can't attack after moving |
| Knight | 50 | 50 | 10 | 3 | 1 | 20 + 10⛏ | Extra attack after a kill |

All values here are **10× the previous doc / current build**, and the new `Def` values add
light armour to Rider and Archer (5 each) that the old whole-point scale could not
represent.

**Resources legend:** 🪵 wood, ⛏ ore. Costs without a resource icon are money only.

### Neutral reference unit

| Unit | HP | Atk | Def | Move | Atk range | Cost |
|------|----|----|-----|------|-----------|------|
| Pirate | 150 | 30 | 10 | 5 (water) | 3 | — (AI-spawned) |

Pirates are not spawnable and sit outside the player balance graph. Their Def 10 is the
kind of light armour the new scale allows.

## Naval units (ships)

Ships carry a land unit as crew: **HP equals the crew's HP**, and damage scales with
the crew's remaining HP. The level determines movement, attack and range.

| Ship level | HP | Atk | Def | Move | Atk range | Upgrade cost to next level |
|-----------|----|----|-----|------|-----------|---------------------------|
| 1 | crew's | 10 | 0 | 2 | 2 | 8 + 4🪵 (→ lvl 2) |
| 2 | crew's | 20 | 0 | 3 | 2 | 16 + 8🪵 + 2⛏ (→ lvl 3) |
| 3 | crew's | 30 | 0 | 4 | 3 | — |

Ships have no armour of their own (`Def 0`); only the crew's defence would apply,
mirroring how HP already works. A level-1 ship is created by moving a unit onto its own
**port** (10🪵 + 30 + 2⛏), which ends the turn.

---

## How each type is countered

Numbers below assume **full-HP damage and the flat-defence rule (min 10)**, and describe
clean conditions on open ground. Real fights depend on terrain, villages, HP and numbers —
treat the bullet as "this type is the reliable answer", not "always wins 1v1".

### Warrior (50 HP, 0 Def)
- **Countered by:** any ranged or costlier melee. Archer kites it forever (20 dmg/shot at
  range 2; Warrior cannot retaliate and cannot close a same-speed kiter; 3 shots kill it).
  Swordsman (40 → 2 hits) and Knight (50 → one-shot) crush it in melee.
- **Why:** it is the cheapest unit; its only virtues are price and availability. Never
  trade it evenly into swordsmen/shields.

### Rider (40 HP, 5 Def)
- **Countered by: Shield.** Rider deals 20 − Shield's Def 20 = **min 10** per hit, while
  the Shield's 50-based counter strips ~40 (after Rider's Def 5) and kills the 40-HP Rider
  in one counter. Swordsman (40 − 5 = 35 → two hits) and Catapult (35–55 → one volley,
  except a low roll) also punish it if caught; Rider escapes them by mobility.
- **Why:** low HP (40) and only light armour (5) make it fragile the moment it cannot
  disengage.
- **How to play against it:** wall approach lanes with a Shield; bait its hit-and-run
  into terrain where it must stay adjacent.

### Archer (30 HP, 5 Def)
- **Countered by:** **Knight** (50 − 5 = 45 → one-shot) and **Catapult** (range 4,
  35–55 → one-shot), which cross or out-range its 2-hex reach before it lands more than a
  volley. **Rider** (2 hits) runs it down if it cannot be screened.
- **Why:** 30 HP and armour 5 win only while the enemy is outside its own reach.
- **How to play against it:** close with cavalry rather than grinding through melee that
  it can kite.

### Swordsman (80 HP, 10 Def)
- **Countered by:** **Archer/Catapult** by out-ranging it (it has range 1, move 1, so it
  can never force an exchange on its terms) and **Shield** in melee (see below).
  Swordsman's Def 10 makes archers deal only 10/shot — grinding one down takes several
  archers, so treat it as "ranged focus-fire + walls".
- **Why:** slow; strong only in a straight melee trade.
- **How to play against it:** never duel it with equal melee; screen it or shoot it.

### Shield (100 HP, 20 Def)
- **Countered by: Catapult.** A volley is 40–60 − Def 20 = 20–40, so a lone Shield falls
  to ~3–4 ranged volleys while it crawls into range. Shields cannot counter what they
  cannot reach, which is why the catapult is the dedicated anti-armour answer.
- **Why:** Def 20 + 100 HP + a 50-based counter makes it unbeatable in melee and grinds
  down single archers; its weakness is that it has no ranged answer.
- **How to play against it:** siege it from range; do **not** feed it riders — its counter
  one-shots them.

### Catapult (30 HP, 0 Def)
- **Countered by:** **Rider/Knight** — flanking cavalry crosses its range in one or two
  turns while it is immobile (Knight 50 → one-shot). A committed catapult still gets a
  volley off first (40–60; 35–55 vs a Rider kills it on all but a low roll), so engage the
  same turn it fires or from outside its arc.
- **Why:** 30 HP, no armour, and it cannot attack on a turn it moved.
- **How to play against it:** attack the same turn it is committed to an immobile siege
  line; never advance straight into its range arc.

### Knight (50 HP, 10 Def)
- **Countered by: Shield.** Knight's 50 − Def 20 = 30 per hit, but the Shield answers
  every exchange with a counter scaled to its own HP: 25, then 20, then 15 after Knight's
  Def 10. The Knight survives two counters, then dies — the Shield ends the 1v1 with ~50 HP
  left. Any second attacker or archer volley tips it, so never send one Knight alone into
  a Shield.
- **Why:** elite stats, but modest HP (50) and Def 10 against a dedicated wall.
- **How to play against it:** shields, ideally backed by a second unit; otherwise screen
  archers/catapults from its 3-move reach. Do not let it chain kills — every kill grants
  it another attack.

### Pirate (reference, 150 HP, 10 Def)
- **Countered by:** coastal **catapults** (range 4, 30–50 per volley after Def 10) and
  concentrated **ships** — a level-3 ship matches its range (3) and deals 20/volley, while
  level 1–2 ships are out-ranged by the Pirate's range 3 and should not duel it alone.
  Its 150 HP makes it a multi-volley target. Killing it scores 30.

### Ships
- **Countered by:** higher ship level (out-guns and out-ranges), **pirates** (capture
  attempts), and coastal **catapults** while within range 4 of shore. A ship's weakness is
  its crew: sink the HP pool (crew HP, e.g. 30 for an Archer crew) and the whole
  investment is lost, so hunting low-HP crews is cheap.

---

## Balance intent

- **No super-strong unit:** every strong stat line has a cheap structural answer
  (Knight → Shield, Catapult → flanking cavalry, Shield → siege, melee → ranged
  kiting). Costs already gate the top end: Swordsman/Catapult/Knight require ore and
  skills.
- **Every type has an effective counter type** (the "Countered by" bullets above), giving
  a counter web rather than one dominant unit.
- The ×10 scale exists to allow **fine armour steps**: light armour (5) on fragile units,
  medium (10) on elites, heavy (20) on the wall, instead of the old all-or-nothing 0/1/2.
