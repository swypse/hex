# Units

Balance reference for all unit types. Values here match the live build: damage-related stats (HP, attack, defense)
are on a ×10 scale for fine armour steps, and combat uses the Polytopia-style force-ratio formula described below.
Numbers in the matchup notes are **full-HP, open-ground single trades** computed from that formula; villages,
walled villages and temple protections shift them (see Defense rule). All values come from `src/game/units.ts`,
`src/game/ship.ts` and `src/game/combat.ts`.

**Resources legend:** 🪵 wood, ⛏ ore. Costs without a resource icon are money only.

## Defense rule

Every unit has `defense` (`Def`), an armour value used by the force-ratio combat formula:

- `attackForce  = attack × hp / maxHp`
- `defenseForce = defense × hp / maxHp × defenseBonus`
- `totalDamage  = attackForce + defenseForce`
- damage to the target: `round(attackForce / totalDamage × attack × 1.5)`
- counter damage: `round(defenseForce / totalDamage × defense × 1.5)`

`defenseBonus = 1 + tile reduction / 10` — the defender's terrain protections:

- own village (+5) → ×1.5
- walled own village (+3 more → +8) → ×1.8
- temple protections (+10) → ×2.0

A ship's armour is its crew's `Def`; the ship itself adds none.

## Land units

| Unit      | HP  | Atk | Def | Move | Atk range | Cost             | Notes                                            |
|-----------|-----|-----|-----|------|-----------|------------------|--------------------------------------------------|
| Warrior   | 50  | 20  | 10  | 1    | 1         | 4                | Cheapest garrison                                |
| Rider     | 40  | 20  | 7   | 4    | 1         | 6                | Hit-and-run: may move after attacking            |
| Archer    | 40  | 20  | 7   | 1    | 2         | 6                | Ranged; chips in from range 2                    |
| Swordsman | 80  | 40  | 20  | 1    | 1         | 10 + 2⛏         | Heavy melee                                      |
| Shield    | 80  | 7   | 20  | 1    | 1         | 8 + 2⛏          | Defense-driven counter; can't attack after moving |
| Catapult  | 30  | 50  | 0   | 1    | 4         | 15 + 10🪵 + 3⛏  | Siege; can't attack after moving                 |
| Knight    | 60  | 40  | 7   | 3    | 1         | 14 + 5⛏         | Extra attack after a kill                        |

### Neutral reference unit

| Unit   | HP | Atk | Def | Move      | Atk range | Cost           |
|--------|----|-----|-----|-----------|-----------|----------------|
| Pirate | 80 | 15  | 5   | 5 (water) | 3         | — (AI-spawned) |

Pirates are not spawnable and sit outside the player balance graph. Their Def 5 is lighter than player light armour
(7–10), so their threat comes from HP and numbers rather than armour.

## Naval units (ships)

Ships carry a land unit as crew: **HP equals the crew's HP**, and damage scales with the crew's remaining HP. The
level determines movement, attack and range.

| Ship level | HP     | Atk | Def     | Move | Atk range | Upgrade cost to next level |
|------------|--------|-----|---------|------|-----------|----------------------------|
| 1          | crew's | 10  | crew's  | 2    | 2         | 8 + 4🪵 (→ lvl 2)          |
| 2          | crew's | 20  | crew's  | 3    | 2         | 16 + 8🪵 + 2⛏ (→ lvl 3)   |
| 3          | crew's | 30  | crew's  | 4    | 3         | —                          |

Ships have no armour of their own: a ship's effective Def is its crew's, exactly as its HP is the crew's. Any unit
that moves onto your **own port** embarks for free — the port is what costs 10🪵 + 30 + 2⛏ to build — and embarking
uses the unit's action for the turn. Upgrading a ship costs wood and ore at an owned port.

---

## How each type is countered

Numbers below describe clean, full-HP, open-ground conditions under the current force-ratio combat. Real fights
depend on terrain, villages, HP and numbers — treat the bullet as "this type is the reliable answer", not a
guaranteed 1v1 outcome.

### Warrior (50 HP, 10 Def)

- **Countered by:** any ranged or costlier melee. Archer kites it forever (20 dmg/shot at range 2; a Warrior can
  never retaliate or out-trade that — 3 shots kill it). Swordsman (48 → 2 hits) and Knight crush it in melee; the
  Knight even one-shots archers/riders on the same charge.
- **Why:** it is the cheapest unit; its only virtues are price and availability. Never trade it evenly into
  swordsmen/shields.

### Rider (40 HP, 7 Def)

- **Countered by: Shield.** A Rider hitting a Shield deals 15 but takes a 15 counter; it dies to three counters
  while the 80-HP Shield never buckles. If caught instead, Swordsman (51) and Knight (51) one-shot it, and Catapult
  kills it from range on a guaranteed 66.
- **Why:** fast, but 40 HP and only light armour (7) make it fragile the moment it cannot disengage.
- **How to play against it:** wall approach lanes with a Shield; bait its hit-and-run into terrain where it must stay
  adjacent.

### Archer (40 HP, 7 Def)

- **Countered by:** **Knight** (51 → one-shot) and **Catapult** (66 → one-shot), which cross or out-range its 2-hex
  reach before it lands more than a volley. **Rider** (22 → 2 hits) runs it down if it cannot be screened.
- **Why:** 40 HP and armour 7 win only while the enemy is outside its reach.
- **How to play against it:** close with cavalry rather than grinding through melee that it can kite.

### Swordsman (80 HP, 20 Def)

- **Countered by:** ranged focus-fire. Archer volleys land 15/shot — one archer is a slow grind (six shots) but the
  Swordsman can never force a close-range exchange on its terms. Catapult kills it in two volleys (54 each). On the
  ground, hold it with a Shield screen (it takes a 10 counter every trade) until the range lands; never duel it with
  equal melee.
- **Why:** strong only in a straight melee trade.
- **How to play against it:** screen it or shoot it.

### Shield (80 HP, 20 Def)

- **Countered by: Catapult.** A volley lands 54 and two are lethal (108). Shields cannot counter what they cannot
  reach, which is why the catapult is the dedicated anti-armour answer.
- **Why:** 20 Def + 80 HP + a counter that returns far more than its 7 attack makes it unassailable against light
  units (a 15 counter strips Riders) and a superb lane wall — but it loses the 1v1 to elite melee (Swordsman and
  Knight both land 40 per trade against only a 10 counter).
- **How to play against it:** siege it from range; do **not** feed it riders — its counter strips them.

### Catapult (30 HP, 0 Def)

- **Countered by:** anything that closes its range 4 — **Knight** (60 → one-shot) and **Rider** (30 → one-shot)
  cross it in a turn while it cannot attack after moving. A committed catapult still gets a volley off first though:
  those volleys one-shot riders/archers/knights (66) and 2-volley the walls, so engage the turn it fires, never
  advance straight into its arc.
- **Why:** 30 HP, no armour, and it cannot attack on a turn it moved.
- **How to play against it:** attack the same turn it is committed to an immobile siege line, from two directions.

### Knight (60 HP, 7 Def)

- **Countered by:** ranged pressure it cannot close under. Catapult (66 → one-shot) ends it outright, and Archers
  chip 22/shot — more than one archer in a screen is fatal, because a Knight can only chain kills through a single
  target and any second attacker gets a free volley.
- **Why:** elite offense, but moderate HP (60) and light armour (7) against dedicated ranged.
- **How to play against it:** archers/catapults behind a Shield screen; do not feed it a kill-prone target it can
  chain.

### Pirate (80 HP, 5 Def)

- **Countered by:** concentrated **ships** and coastal **catapults**. A level-3 ship matches its range (3) and lands
  39/volley (three hits), while level 1–2 ships are out-ranged (2 vs 3) and should not duel it alone. A catapult
  volley is 68 (two to kill). Its 80 HP makes it a multi-volley target, and killing it scores 30.

### Ships

- **Countered by:** a higher ship level (out-guns and out-ranges), **pirates** (which lurk in water lanes and out-gun
  low-level ships), and coastal **catapults** while within range 4 of shore. A ship's weakness is its crew: sink the
  crew HP pool and the whole investment is lost, so hunting low-HP crews (e.g. an archer crew at 40 HP) is cheap.

---

## Balance intent

- **No super-strong unit:** every strong stat line has a structural answer (Catapult → flanking cavalry, Knight →
  ranged focus-fire, Shield → siege, Swordsman → ranged kiting). Costs already gate the top end: Swordsman,
  Catapult and Knight require ore and skills.
- **Every type has an effective counter type** (the "Countered by" bullets above), giving a counter web rather than
  one dominant unit.
- The ×10 scale exists to allow **fine armour steps**: light armour (7) on fragile units, medium (10) on warriors,
  heavy (20) on melee elites/walls, instead of an all-or-nothing 0/1/2.