# Pirate Cannonball Attacks Design

Date: 2026-09-12

## Goal

Pure pirates (`unit.type === 'pirate'`, no `shipLevel`) fight with a cannonball,
matching player ships visually: a pirate attack fires a cannonball at the
target, and a surviving pirate also counter-fires a cannonball. Counter shots
are strictly sequenced — they launch only after the attacker's shot has landed
(attack animation ends), consistently for ships, catapults, and pirates.

## Current behavior

`src/controller/eventPresenter.ts` decides projectiles on the attacker side in
`presentAttack` (~lines 351-377): archers fire an arrow, units with a
`shipLevel` fire a cannonball, catapults lob a cannonball. **Pure pirates match
none of these — they melee-lunge instead of shooting.** The defender's counter
in `presentStagedAttack` (~line 542): archers (no `shipLevel`) fire an arrow
back, `shipLevel`/catapults fire a cannonball back, **everything else (incl.
pure pirates) melee-lunges back.**

Attacker shots are fire-and-forget (`spawnArrow` / `spawnCannonball` /
`spawnCatapultBall` wrappers, ~lines 1006-1025), so a multi-tile attacker shot
is still in flight while the counter ball already launches — the two balls
overlap.

## Changes

### `src/controller/eventPresenter.ts` — pirate shots

1. `presentAttack` attacker-side: add a cannonball branch for a pure pirate
   attacker, same flat lob as ships (`false` catapult flag). A pirate attacker
   now shoots a 35px cannonball along the standard arc when its tile is visible
   to the local player.

2. `presentStagedAttack` counter branch (~line 544): extend the cannonball
   condition from `targetPre.shipLevel !== undefined || targetPre.type === 'catapult'`
   to also include `targetPre.type === 'pirate'`. A surviving pirate target
   fires a cannonball back (same flat ship lob) instead of melee-lunging.

### `src/controller/eventPresenter.ts` — sequential counter

3. `presentAttack`: replace the three fire-and-forget helper calls
   (`spawnArrow`, `spawnCannonball`, `spawnCatapultBall`) with the
   await-able `FromTo` variants and keep the promise in a local
   `attackerShot: Promise<void> | null`. Pass `attackerShot` into
   `presentStagedAttack` as a new parameter (default `null`).

4. `presentStagedAttack` ordering becomes:
   - attacker lunge (`await mapView.lungeUnit(...)`)
   - `if (attackerShot) await attackerShot;` — the attacker's ball lands
   - impact sound (`sfx.play(impact)`)
   - target `-hp` text (moved after the ball lands, so the number syncs with
     the visible impact)
   - counter branch fires (arrow/cannonball/lunge) → attacker `-hp` text

   Because the ball is spawned before the stage and the lunge (160 ms) runs
   concurrently with the flight (`PROJECTILE_MS_PER_TILE` = 150 ms/tile), the
   `await attackerShot` waits only for the remaining flight; total attack time
   stays ≈ `max(lunge, flight)`. For melee attackers `attackerShot` is `null`
   and behavior is unchanged.

5. Delete the now-unused fire-and-forget wrappers `spawnArrow`,
   `spawnCannonball`, `spawnCatapultBall` (only `presentAttack` called them,
   checked) — the melee `else` branch in `presentAttack` and non-staged path are
   unaffected (no projectile → `attackerShot` stays `null`).

## Tests (`tests/combatAnimation.test.ts`)

Mirror the existing captured-pirate-ship tests but with a **pure pirate** (no
`shipLevel`):

- `shoots a cannonball from a pure pirate attack`: attacker `type: 'pirate'`,
  owner `-1`, no `shipLevel`, melee-style unit on the attacker tile; presenting
  the attack yields a 35px cannonball sprite on `mapRoot` that is removed on
  arrival.
- `fires a cannonball back from a pure pirate during its counter-attack`:
  melee warrior attacker, pure pirate target that survives and deals counter
  damage; a 35px cannonball flies back from the target toward the attacker.
- `keeps counter cannonballs sequential after the attack shot lands`: pirate
  attacker and pirate defender two tiles apart (300 ms attacker flight), both
  surviving with counter damage; drive ticks and assert the defender's ball
  never appears while the attacker's ball is still in flight (ball count stays
  at 1 until the attacker's ball is removed, then the counter ball launches).

Existing tests that must stay green: captured-pirate-ship attack/counter
(still routed via `shipLevel`), ship catapult arc tests, arrow counter tests,
and all impact-sound tests in `combatAnimation.test.ts` (the `swordHit` / `hit`
tests use melee attackers → `attackerShot` is `null`, no re-timing).

## Out of scope

- No change to damage numbers, counter rules, or `attackSound` plans.
- No change to ship/catapult/archer arcs; pirates reuse the flat ship lob.
- No new assets or sound.
- Pirates boarding/capturing (separate `pirateCapture` presentation) untouched.