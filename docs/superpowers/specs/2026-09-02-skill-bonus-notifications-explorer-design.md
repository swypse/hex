# Design: Skill bonus, private bonus notifications, smarter explorer movement

Date: 2026-09-02

## Overview

Three changes to map bonuses:

1. A new bonus kind that opens a random unopened skill for the claiming player.
2. Bonus-claim notifications are shown only to the claiming player (other players
   no longer see toasts for claims that are not theirs).
3. The Explorer bonus unit prefers moving onto unexplored cells instead of
   revisiting already-explored terrain.

## 1. New bonus: open a random unopened skill

### Behavior

- A bonus can now be of kind `skill`. When claimed it opens, for free, a
  uniformly random skill (from `SKILLS`) that the claiming player has **not**
  opened yet — any level is allowed, the parent skill is not required, and no
  money is paid.
- If the player has already opened every skill, the bonus falls back to
  `+15 money` (mirrors the existing `villageUpgrade` fallback).
- The claim notification reads `Skill {name} opened!` (e.g. `Skill Navigation
  opened!`).
- No action score is awarded (this is a free bonus, not the paid skill action).

### Implementation

- `src/game/bonus.ts`: add `'skill'` to `BonusKind` and to
  `randomBonusKind()`.
- `src/game/skills.ts`: export a helper `randomUnopenedSkill(player, rng)`
  returning a random `SkillId` from `SKILLS` that the player has not opened, or
  `null` when all skills are open. It lives in `skills.ts` so skill-list
  knowledge stays in one module.
- `src/game/simulator.ts` (`applyBonus`): handle `kind === 'skill'`:
  - pick via `randomUnopenedSkill(player, this.rng)`;
  - if found, push it onto `player.skills` and emit `bonusClaimed` with the
    extra `skill` field;
  - if none, add `+15 money` (and still emit `bonusClaimed` for the money
    fallback with no `skill`).
- `src/game/events.ts`: extend the `bonusClaimed` event with
  `skill?: SkillId`.
- `src/controller/eventPresenter.ts` (`presentBonusClaimed`): for `kind ===
  'skill'` show `Skill ${SKILLS[e.skill].name} opened!`; keep the existing
  generic messages for the other kinds.
- `GAME.md`: add the skill bonus to the Bonuses list and its effect.

## 2. Bonus notifications only for the claiming player

### Behavior

- A player never sees the center "Bonus: …" notification for a bonus claimed
  by another player.
- The gold burst still appears when the claim tile is explored by the local
  player (so a visible grab is still noticeable), but no toast is shown.

### Implementation

- `src/controller/eventPresenter.ts` (`presentBonusClaimed`):
  - set the center message only when `e.playerIndex === localPlayerIndex`;
  - spawn the `mapView.spawnBonusClaim` burst only when the tile is explored
    for the local player (`isExploredFor(tile, local)`).

## 3. Explorer prefers unexplored cells

### Behavior

- While planning its ≤ 25 moves, the explorer at each step picks among its
  land, empty neighbours in a random order but **prefers cells that the
  claiming player has not yet explored** (fog-of-war state at plan time).
- It steps onto an already-explored ("visited") cell only when no unexplored
  cell is adjacent (the single possible variant), picking randomly among them.
- Movement stops when no reachable land cell exists, as today.
- "Unexplored" means the player's exploration state at planning time, before
  this explorer reveals anything.

### Implementation

- `src/game/bonus.ts`:
  - `explorerPath(map, start, rng)` gains a `playerIndex` parameter.
  - Each step: gather the 6 neighbour tiles that exist, are land, and have no
    unit. Split into `unexplored` (not `isExploredFor(_, playerIndex)`) and the
    rest. Pick a random unexplored neighbour when any exist, otherwise a random
    reachable neighbour. Append & continue; break when none are reachable.
- `src/game/simulator.ts` (`applyBonus` explorer branch): pass
  `player.index` to `explorerPath`.
- `GAME.md`: note the explorer favours unexplored cells.

## Tests

- `tests/skills.test.ts` (or `tests/bonus.test.ts`): `randomUnopenedSkill`
  returns an unopened skill for a player with a partial skill set, any level;
  returns `null` when all skills are open.
- `tests/bonus.test.ts`:
  - `randomBonusKind` can now return `'skill'`.
  - claiming a `skill` bonus adds an unopened skill to the player's `skills`
    and emits `bonusClaimed` with that `skill`; claiming when every skill is
    open grants `+15 money`.
  - `explorerPath(…, playerIndex)` first moves onto an unexplored cell when one
    is adjacent (fixture where only one neighbour is unexplored), and only
    revisits an explored cell when no unexplored neighbour exists.
- `tests/moveAnimation.test.ts` (or a new presenter test): presenting a
  `bonusClaimed` event for a non-local player does not set `centerMessage`;
  the message appears for the local player, and the local `skill` message reads
  `Skill Navigation opened!`.
