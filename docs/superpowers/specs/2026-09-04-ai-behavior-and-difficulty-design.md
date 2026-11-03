# AI Behavior + Difficulty Design

Date: 2026-09-04

## Problem

The AI is purely reactive and local: priority-ordered patterns fire on nearby
triggers and a greedy scored fallback moves each unit independently. It has no
strategic goal, defends villages only at the last second, drifts or idles when
no trigger is near, and wastes units on bad fights. Observed symptoms:

- Slow to capture the free villages near home; never pushes to take enemy
  villages in capture mode.
- Leaves home villages defenseless while the army is elsewhere.
- Units wander or do nothing useful when no enemy is in immediate reach.
- Loses fights: sends units in one-by-one, attacks without weighing
  counter-damage, no reliable retreat, poor spawn mix, hoarded money.

Decisions are decision-quality and UI only — no stat, resource, or rule changes.

## Goals

1. AI aims at the game goal: capture all villages (capture mode) or maximise
   score (30-turns mode).
2. AI protects its own villages (proactively, by forecast — not only after an
   enemy is already in striking range).
3. AI is never passive: every idle unit resolves to a useful purpose.
4. Three difficulty levels — Easy / Normal / Hard — over **one shared brain**:
   Easy makes visible mistakes; Normal is the sound improved brain; Hard is the
   same brain with earlier defense, tighter armies and quicker war commitment.

## Approach

Add a per-turn **intent layer** that steers the existing planner. Keep the
action executors and the greedy planner loop; replace the "why does this unit
move here" reasoning with goal-driven intent computed once per AI turn.

Per AI turn:
1. **Situation analysis** (pure): stance, per-village danger forecast,
   objective list, hunt target, force comparison.
2. **Mission assignment**: each idle unit gets a mission (defend threatened
   village / join the front / take a free village / hunt an enemy / explore /
   hold).
3. **Planner loop** (existing): patterns and the mission-aware fallback pick
   concrete legal actions, validated via `reachableTargets`.

## Section 1 — Architecture & data flow

Layer flow: `analysis → missions → planner loop`.

Files:

- `src/game/aiTypes.ts` — add `AiDifficulty = 'easy' | 'normal' | 'hard'`,
  the difficulty profile type, and the situation object types.
- `src/game/aiSituation.ts` *(new, pure, unit-testable)* — computes stance,
  per-village danger, objectives, hunt target and force comparison from
  `(map, player, mode)`.
- `src/game/aiDifficulty.ts` *(new, pure data)* — the Easy / Normal / Hard
  knob profiles.
- `src/game/aiPatterns.ts` + `src/game/ai.ts` — patterns consult the
  situation; the fallback move scoring becomes mission-aware; existing
  patterns are kept but tuned.
- `src/game/simulator.ts` — AI turns pass **mode** and the player's
  **difficulty** into `planAiActions`. (Mode is needed so stance can differ
  between capture and 30-turns.)
- `src/game/players.ts` — `Player` gains optional `difficulty?: AiDifficulty`
  so the host's level travels inside snapshots and saves (clients never plan
  AI turns, so no extra networking).

Design rule: all new decision logic lives in pure functions returning plain
data; the planner and patterns only consume it. This keeps the brain testable
without a simulator.

`planAiActions(map, player, rng)` becomes
`planAiActions(map, player, mode, rng)` (or an options object). Default
difficulty is `'normal'` when `player.difficulty` is undefined, so existing
callers/tests are unaffected.

## Section 2 — Situation analysis & game-mode-aware stances

The situation object (computed once per turn):

```
AiSituation {
  stance: 'settle' | 'war' | 'defend'
  mode: 'capture' | 'turns30'
  villageDanger: [{ q, r, turnsUntilThreat, garrisoned }]   // per own village
  frontTarget: { q, r } | null        // the army's marching target
  objectives: [{ kind, tile, value }] // free village / enemy village / bonus / fog frontier
  huntTarget: { q, r } | null         // strongest nearby visible enemy unit
  force: { ownPower, visibleEnemyPower }
  enemies: visible enemy units with pos/hp/type
}
```

Stance decision (mode-aware):

- **`turns30` — play for score.** Board score comes from owned villages (50),
  explored tiles (3), buildings (15), temples (10–25 at game end). While free
  villages remain reachable/cheap → `settle`: grab free villages, upgrade own
  villages (wider territory = more income and explored tiles), build economy
  and temples. Offense is opportunistic only: attack to kill when the trade is
  clearly favorable or the target sits on/adjacent to a valuable tile; never
  feed units into bad trades (a lost unit also loses its tile score).
  Exploration stays valuable all game.
- **`capture` — win by owning all villages.** Phased:
  - Phase 1 `settle`: secure nearby safe free villages and grow, skipping free
    villages on the far side of an enemy.
  - Phase 2 `war`: choose one enemy front (nearest reachable enemy-owned
    village) once the force comparison passes; commit the army and march as a
    group; grab free villages only opportunistically without diverting the
    army.
  - Switch to `defend` whenever an enemy force can threaten home villages more
    than we threaten theirs.
- **`defend`** (both modes): commit idle units to garrison/repel. Triggered
  when any own village is within a few enemy-turns of a visible enemy, or an
  enemy unit stands on/near a home village.

Force comparison gates going to war: compare own summed unit power against
*visible* enemy power near the front. Below the difficulty threshold → keep
settling/defending until stronger or the enemy is weaker.

## Section 3 — Unit missions, village defense & anti-passivity

Mission assignment picks per idle unit, highest-priority first:

1. **Defend a threatened village** — if `villageDanger` says a visible enemy
   can reach an empty home village within the difficulty guard window:
   spawn a garrison there when affordable (existing `defend-empty-village`),
   else route the closest spare combat unit to stand on/adjacent to the
   village (an upgrade of `garrison-empty-village`, now forecast-driven). If an
   enemy already stands on a home village, existing `attack-enemy-in-village`
   and `focus-fire` handle it (kept, priority raised).
2. **Join the front** (war stance) — spare combat units march toward
   `frontTarget`; scoring forces cohesion: a step is better when it stays
   within ~2 hexes of ≥1 committed ally while advancing on the target. Replaces
   the scattered nearest-village fallback and prevents clogging (occupied tiles
   excluded).
3. **Take a valuable free village** (settle stance) — closest spare fast unit
   parks on it (`capture-free-village` / `capture-push`, kept; target
   selection uses the objective list so units do not all run to the same tile).
4. **Hunt** (anti-passivity) — *new*: if no defend/front/free-village mission
   applies **and any enemy is visible anywhere**, the idle unit moves toward the
   nearest visible enemy (hunt target) and attacks only when favorable or with
   numeric/local advantage. This is the key fix for passivity.
5. **Explore / hold** — leftover units explore fog frontier; once the map is
   fully explored and no mission applies, units **hold position** on owned
   tiles/villages (keeps tile score) instead of wandering.

Cohesion not blobs: front group-moves keep allies ~2 hexes apart (occupied
tiles are still excluded). Never move into certain death: a defend/hunt/front
move is only chosen if the destination cannot be reached-and-killed by a
visible enemy next turn (existing `enemyCanAttackNext` checks applied
consistently), unless the tile is a village that must be held.

Resolution order guarantee: every idle unit resolves to
defend → front → free village → hunt → explore → hold, so no unit is ever left
without a purpose.

## Section 4 — Tactical combat quality

1. **Favorable-trade attack check** (new helper, pure):
   - Kill (our damage ≥ target HP) → always attack (no counter risk).
   - Non-kill melee → attack only if the trade is favorable: our damage ≥ the
     counter we would take, or we attack with a numeric/HP advantage, *unless*
     the target is a high-value threat (standing on our village / about to
     capture).
   - Ranged units prefer targets that cannot counter (outside their range) or
     one-shot kills.
   - Easy may skip this check (its mistake channel).
2. **Target/unit-type competence** (tuning existing code):
   - `chooseBestAttack` and focus-fire keep kill/high-value preference; modest
     re-weight so ranged damage is not dumped into high-defence walls when a
     melee could do it.
   - Spawn mix by stance: `war` uses the offense order; `settle`/`defend`
     mixes shields/archers for garrison; skill-gated knights/catapults only
     once unlocked (already true).
   - **Don't hoard money**: above a reserve, if a combat-relevant unit is
     affordable, spawn it.

Net effect: the AI stops feeding, kills when it can, and spends its economy on
a real army. The trade model stays deliberately heuristic — no minimax/search.

## Section 5 — Difficulty levels & UI plumbing

Difficulty is a profile of knobs over one shared brain:

| Knob | Easy | Normal | Hard |
|---|---|---|---|
| Mistake chance (skip/randomize a decision) | ~25% | 0 | 0 |
| Defense guard window (how early to garrison) | reactive (1 turn) | 2 turns | 3 turns |
| War commitment threshold (own vs enemy power) | high | moderate | low |
| Trade check | sometimes skipped | always | always + better targets |
| Front cohesion | loose | normal | tight |
| Economy (reserve before spawn) | hoards more | balanced | always spends well |

Normal = the sound improved brain. Easy = same brain with visible mistakes.
Hard = same brain, earlier defense, tighter armies, quicker war commitment.

Flow of the level:

1. `Player.difficulty?: AiDifficulty` (AI players only; default `'normal'`).
2. **Settings panel** (Start → Settings, `StartScreen.ts`): add an "AI
   difficulty" row (Easy/Normal/Hard). New persisted field in
   `src/storage/settings.ts` (`aiDifficulty`, default `'normal'`). Acts as the
   default for future games.
3. **Single Player setup** (`SetupScreen.ts`): a difficulty row (5th selector)
   initialised from the Settings default; passed through
   `gameController.startGame(...)`.
4. **`players.ts`**: `buildPlayers(...)` accepts difficulty and stamps it on AI
   players (single player). `buildMultiplayerPlayers(...)` accepts difficulty
   too (the AI players created by the host get it).
5. **Multiplayer host**: AI opponents use the Settings default, read on the host
   machine via `loadSettings().aiDifficulty` when the room's players are built
   — no host-screen picker (keeps the host UI unchanged).
6. **`simulator.ts`**: reads `player.difficulty` for each AI turn. Existing
   tests keep working (default `'normal'`, no behavior path removed).
7. **Resume/saves**: difficulty rides in snapshots via `Player`, no extra save
   plumbing.

## Section 6 — Tests & acceptance criteria

Unit tests (pure):

- `aiSituation.ts`: stance per mode; village-danger forecast math; objective
  ordering; force comparison gating `war`.
- `aiDifficulty.ts`: knob values differ per level (guard window, war
  threshold, mistake chance).
- Mission decisions: a distant visible enemy triggers a hunt move; an empty
  village about to be reached gets a garrison assignment from the closest unit;
  a committed front keeps units stepping toward it and near an ally.
- Trade check: unit declines a bad melee but takes a kill and a safe ranged
  shot.
- Economy: money above a reserve produces a stance-appropriate spawn.

Simulator scenarios (following `tests/aiCapture.test.ts`):

- Existing foggy free-village capture test stays green.
- Defense scenario: an enemy raider near an AI home village does not capture it
  over ~8 rounds.
- War scenario: an AI with a large advantage captures a reachable enemy village
  within a bounded number of rounds.
- Mode smoke tests: `capture` and `turns30` AI-vs-AI self-play reach a legal
  game end or a hard turn cap without exceptions; the planner stays within
  `MAX_PLAN_STEPS`.

All existing tests stay green under the `'normal'` default.

Manual/QA acceptance checklist:

1. AI captures nearby free villages early.
2. AI attacks enemy villages as a group, not one unit at a time.
3. Home villages are not left empty while a visible enemy approaches.
4. Units are rarely idle: visible enemies → hunt; else explore/hold.
5. `turns30` AI upgrades/owns tiles and does not suicide its army; `capture` AI
   phases into a war push.
6. Easy is visibly weaker than Normal; Hard presses advantages earlier — same
   underlying brain.
