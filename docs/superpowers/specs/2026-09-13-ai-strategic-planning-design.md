# AI Strategic Planning Design

Date: 2026-09-13

## Problem

The AI plans one turn at a time and keeps no memory between turns. Every turn
`planAiActions` re-derives the situation from scratch and greedily picks the
best immediate action. Consequences:

- **No multi-turn sequencing.** It never persists "first build economy, then an
  army, then attack". It trickles units into a fight one at a time, where a
  massed strike would succeed.
- **Reactive, not planned, defense.** Threat response is a per-turn scramble;
  there is no "muster at the threatened village, then counterattack when we have
  local superiority" arc.
- **No resource intent.** Spawning/upgrade/build/skill decisions are scored
  independently each turn, so the AI does not commit to an economy ramp
  (sawmills → mines → village upgrades) before spending on troops.
- **No personality.** Every AI plays identically (only difficulty scalars
  differ), so a multi-AI game feels like fighting the same player N times.

The goal: an AI that *plans* multi-turn (economy → army assembly → committed
push), reacts to threats with a planned counter, allocates resources toward the
active plan, and — via personalities — visibly differs between AI opponents.
The player should find the AI genuinely hard.

No stat, resource, balance, rules, UI, renderer, or network change. Decision
logic only.

## Goals

1. AI maintains **persistent multi-turn goals** that shape several turns of
   decisions instead of one.
2. The tactical layer (pattern cascade + `bestAvailableAction`) keeps all
   existing behaviour — it is only *biased* by the strategy, and remains
   byte-for-byte identical when the strategy has nothing to say.
3. Difficulty steers *how well* the AI executes its plan (plan depth, muster
   strictness, thresholds) through the existing profiles — the engine itself is
   the same at every difficulty.
4. Multi-AI opponents get **distinct personalities** (aggressive / balanced /
   builder) that pick goals differently on identical maps.
5. All new state is plain-serializable on `Player`, so save/load works for free.

## Scope decisions (from design dialogue)

- **Approach:** a strategic "Directives" layer (HTN-flavored goal recipes that
  expand per-turn into *directives*, which bias the existing utility/BT
  tactical layer). No full GOAP forward planner, no HTN runtime engine, no
  MCTS.
- **Coverage:** five goal chains — Economy-Ramp, ArmyPush, Defense, Naval,
  Score-Race — all required (the user approved all five).
- **Difficulty:** same strategy engine at all difficulties; parameters steer it.
- **Personalities:** distinct per-AI, assigned deterministically.
- **Persistence:** `player.strategy` JSON object; survives save/load; optional
  field → no migration.
- **Enabling rule:** the strategy emits **no directive** when nothing applies
  (e.g. a bare one-village map), so existing tests and behaviour remain green;
  tests are edited only where behaviour intentionally improves.

## Approach

Add a persistent strategic layer on top of the existing one-turn planner:

1. **Strategy state** on `Player.strategy` persists goals between turns.
2. **Strategy planner** (`aiStrategy.ts`) runs inside the AI turn: re-picks
   goals (throttled, ~every N turns), expands the active goal's phase into
   concrete *directives*, and exposes them to the tactical layer.
3. **Personalities** (`aiPersonality.ts`) provide goal-preference vectors that
   change which goals an AI picks and at what thresholds.
4. **Integration:** the pattern cascade and `bestAvailableAction` read an
   optional `directives` object and add/subtract score bias; defaults are
   neutral.

### Aligning with the recommended hybrid architecture

- Strategy: HTN-flavored **goal recipes** with phases (already present in
  spirit via `analyzeSituation`'s stance FSM, which stays as the low-level
  reactive layer).
- Tactics: **Utility AI** scoring (`bestAvailableAction`) — already present.
- Execution: **Behavior-Tree style** pattern selector (`AI_PATTERNS`) — already
  present.

## Section 1 — Persistent strategy state

`Player` gains an optional field:

```ts
strategy?: {
  personalityId: string;          // 'aggressive' | 'balanced' | 'builder'
  nextPlanTurn: number;           // throttle: earliest turn goals may be re-picked
  goals: {
    id: string;                   // 'economy' | 'army' | 'defense' | 'naval' | 'score'
    phase: string;                // goal-specific phase id (see Section 2)
    target: { q: number; r: number } | null; // e.g. enemy village / muster tile
    sinceTurn: number;
    confidence: number;           // 0..1 steering strength
  }[];
}
```

Rules:

- Optional and plain-JSON: save/load (`GameStateSnapshot.players`) serializes it
  with no migration; `stripUndefinedValues` is unaffected.
- `nextPlanTurn`: goals are *re-picked* only when `turn >= nextPlanTurn`, except
  for forced re-plans on decisive invalidation (Section 4). Between re-picks the
  existing goal set and phases persist — this is what gives the AI staying power
  and prevents turn-by-turn flip-flopping.
- Created lazily the first time an AI's turn runs (`ensurePlayerStrategy`).

## Section 2 — Goal recipes (phases and directives)

Each goal is a `{ id, phases }` recipe. The planner tracks the *phase* of each
active goal and expands the current phase into directives each turn.

### 2.1 `economy` — Economy-Ramp
Phases in order; advances when its acceptance test passes:
1. **build**: place sawmills (forests) and mines (mountains) on eligible owned
   tiles as they become affordable and slot-permitting (reuses `canBuildSawmill`
   / `canBuildMine` and `reserveLastSlotForMine`).
2. **level**: upgrade owned villages while `level <= 2` (economy-phase cap) when
   affordable.
3. **research**: open economy skills in `forestry → smithery → geology →
   science` order (economy slice of `AI_SKILL_ORDER`).
4. **gate**: maintain `moneyReserve` — spawn/skill spending below reserve is
   suppressed unless `defense` urgency or an army directive overrides.

Completion test: production buildings (mines + sawmills) reach a target derived
from difficulty and personality; then yields to `army`.

### 2.2 `army` — ArmyPush
Phases:
1. **choose-target**: nearest explored enemy village with a reachable path;
   else the farthest free-village cluster (scored like today's
   `nearestVillageDistanceFrom` / `freeVillages`). Target persisted as
   `goals[].target`.
2. **muster**: choose a muster tile near the target (today's front-bonus code
   already pulls units toward a tile); assign nearest idle units to it
   (unit-ids tracked via `AiPlannerState`-style assignment, not persisted);
   **suppress scatter** — assigned units hold/group (moves to non-front tiles
   are de-prioritized) and suicidal solo trades are gated by a stricter
   `tradeIsFavorable` check until `minUnits` or the assault power ratio is met.
3. **assault**: when the triggered ratio is met, assigned units advance on the
   front target and attack through the normal attack/focus-fire logic.
4. **capture**: once the target falls, re-pick (advance to a new front, or drop
   back to `economy` refill by clearing the goal).

### 2.3 `defense` — planned defense (conditional secondary)
Trigger: `situation.endangered` / `situation.dangers` non-empty.
Phases:
1. **muster-at-village**: assign the nearest free units to the threatened
   village (extends today's `reinforce-endangered-village` / `garrison` /
   `defend-hurt-unit` with a *counter* trigger).
2. **counter**: when local own power ≥ local enemy power (per `profile.warRatio`
   scaled down), ordered counterattack toward the threat origin instead of
   passive hold.

### 2.4 `naval` — naval commitment (conditional)
Trigger: naval threat active (existing `situation.navalThreat`) **or** a
`builder` personality near water.
Phases:
1. **research**: `water → navigation → (science →) catapult` chain (generalizes
   today's `naval-open-skills`).
2. **port**: build a port on the threatened coast (generalizes
   `naval-build-port`), with the existing `reserveLastSlotForMine` bypass.
3. **fleet**: board ships / hunt / upgrade (`naval-board-ship`, `naval-hunt`,
   `naval-upgrade-ship` — existing patterns, now steered by the goal phase).

### 2.5 `score` — Score-Race (30 Turns mode only)
Trigger: `mode === 'thirty'` (30 Turns).
Prefers cheap kills, free-village captures, and village upgrades for income;
suppresses `army` until the AI is already ahead on power (`ownPower >=
enemyPower`).

### Directives output

`deriveDirectives()` returns (all neutral when a phase has nothing to steer):

```ts
interface AiDirectives {
  frontTarget: MapTile | null;         // 'army' assault / 'defense' counter
  muster: { tile: MapTile | null; minUnits: number; target: MapTile } | null;
  spawnPlan: { villageKey: string; unitType: UnitType }[];
  moneyReserve: number;                // minimum money kept before spawn/big spend
  skillChain: SkillId[] | null;        // forced next-skills when set
  pace: 'rushed' | 'normal' | 'slow';  // spending aggressiveness
}
```

## Section 3 — Personalities

`aiPersonality.ts` exports a preference vector per personality:

```ts
interface AiPersonality {
  id: string;
  goalWeights: { economy: number; army: number; defense: number; naval: number; score: number };
  assaultThresholds: { economyCap: number; musterMinUnits: number; ratioRequired: number };
}
```

- `aggressive`: high `army` weight, low `economyCap` (spends earlier), earlier
  muster.
- `balanced`: neutral — the default for normal/hard without a personality.
- `builder`: high `economy`/`naval` weight, higher `economyCap` and attack
  thresholds — simmers, then crushes.

Assignment is deterministic: seeded from the player's name + a difficulty
scramble, so a given setup always yields the same AI mix (tests stay
deterministic). Goal re-picking uses `goalWeights` to multiply a candidate
goal's base score.

## Section 4 — Goal re-picking lifecycle

- **Throttled re-pick:** inside the AI turn, if `turn >= nextPlanTurn` the
  planner re-scores all candidate goals (base score from `analyzeSituation`
  facts: dangers, front distance, own/enemy power, free villages) × personality
  `goalWeights`, picks the top 1–2, and sets `nextPlanTurn = turn +
  profile.strategy.planIntervalTurns`.
- **Forced re-plan** (ignores the throttle): own village captured, `frontTarget`
  no longer reachable/explored, `navalThreat` toggled on. Prevents dead plans
  from persisting.
- **Stand-down:** a goal whose trigger cleared (e.g. `navalThreat` gone) is
  dropped at the next re-pick; its directives also stop being emitted the turn
  the condition clears, so behaviour reverts promptly (mirrors the naval
  stand-down already in place).
- **Persistence of target coordination:** the muster *assignment* (which unit
  ids are mustering) is NOT persisted — it is re-derived per turn from
  proximity so saved games don't carry stale unit ids; only the goal
  (`target`/`phase`) is persisted.

## Section 5 — Tactical integration (biases, all additive)

The planner context (`AiPatternContext`) and `bestAvailableAction` gain an
optional `directives: AiDirectives | undefined`. Where a directive is absent (or
undefined) every path behaves exactly as today.

- **Spawns** (`bestAvailableAction` village loop, `ai.ts:188`): when
  `spawnPlan[village]` names a type, that type's score is boosted; `moneyReserve`
  tightens the existing `reserveOk` gate unless `defense`-urgency overrides.
- **Moves** (`ai.ts:259` move scorer): `muster.tile` / `frontTarget` add the same
  distance-based bonus the war-stance front already uses (`ai.ts:286`).
  Muster-assigned units see non-front move scores *reduced* (holding) while
  mustering.
- **Attacks** (`hunt-idle-enemy` + `bestAvailableAction` attack branch):
  mustering units apply stricter `tradeIsFavorable` unless the kill is certain;
  once assembled, normal pattern logic (focus-fire etc.) runs unhindered.
- **Skills** (`ai.ts` skill loop, `aiPatterns.ts` patterns): when `skillChain` is
  set, it is opened before `AI_SKILL_ORDER` (same mechanism as today's
  `naval-open-skills`, generalized).
- **Builds** (`ai.ts:315` build loop): economy phase 1 raises mine/sawmill
  priority and suppresses temple/port/temple spending while under the
  `economyCap`; army phase braces money for spawns (reduces build scores).
- **Pace:** `pace` scales the `jitter()` magnitude and the reserve math — easy
  AIs wobble more and hold more cash; hard AIs commit.

No new `AiAction` type is added. No renderer/UI/network change.

## Section 6 — Difficulty steering

`AiDifficultyProfile` gains a `strategy` group:

| Field | Meaning |
|---|---|
| `planIntervalTurns` | re-pick throttle (smaller = more adaptive) |
| `musterMinUnits` | units mustered before assault |
| `assaultRatio` | own/enemy power ratio required to enter assault |
| `economyCap` | production-building target before army starts |
| `reserveBleed` | how much `moneyReserve` eases under pressure |

| Profile | Rough effect |
|---|---|
| easy | slow re-picks, loose muster (few units), late assault; `mistakeChance` still randomizes actions |
| normal | current feel + mild strategy; defaults chosen to keep existing scenario tests green |
| hard | fast re-picks, strict muster, tight thresholds, aggressive reserve use |

## Section 7 — Implementation surface & tests

Files touched (all `src/game/`):

- `aiStrategy.ts` (new) — `AiStrategyState`, goal recipes, planner,
  `deriveDirectives`, throttle/invalidation logic.
- `aiPersonality.ts` (new) — personality vectors + deterministic assignment.
- `aiTypes.ts` — `AiDirectives` type; `AiPatternContext` gains an optional
  `directives` field.
- `ai.ts` — call strategy update inside `planAiActions`; bias spawn/move/
  attack/skill/build scoring via directives (Section 5).
- `aiPatterns.ts` — read `directives` where cheap (skill chain, attack-gate
  during muster).
- `aiDifficulty.ts` — `strategy` param group per profile.
- `players.ts` — `strategy?: AiStrategyState` optional field.
- `GAME.md` unchanged (no rules change).

Tests — new `tests/aiStrategy.test.ts` (helpers mirroring `tests/ai.test.ts`):

1. On a bare one-village map the strategy emits no directives and, across many
   seeds, the planned actions match today's (regression / neutral-default).
2. Economy → army progression: a 2-village map with forest/mountain gives
   mine/sawmill builds and village upgrades before spawn spending ramps.
3. Muster: several units converge toward the muster tile and *hold* (no
   trickle attacks) until the assault ratio is met, then advance together.
4. Budget gating: `moneyReserve` suppresses spawns below the reserve while in
   economy-gate phase; `defense` urgency overrides it.
5. Personality divergence: aggressive vs builder on the same map pick different
   goals (army-first vs economy-first) and muster earlier / later.
6. Persistence: `Player.strategy` round-trips through a `GameStateSnapshot`
   JSON serialize/parse; a loaded game resumes the same goal+phase.
7. Difficulty params: hard keeps plans through the full muster; easy re-picks
   goals less often and musters fewer units.
8. Forced re-plan: capturing the AI's own village or losing `frontTarget`
   reachability triggers a re-pick before the throttle.

Existing tests: full `tests/ai*.test.ts` suite is a regression gate. Tests are
edited **only** where behaviour intentionally improves, and each edit is called
out in the plan. Manual/QA checklist:

1. AI vs human: the AI visibly builds sawmills/mines and upgrades villages
   early, stops spending on troops into a bare economy, then musters 3–5 units
   at a staging tile and pushes the nearest enemy village as one group.
2. When its village is threatened it musters a defense there, then
   counterattacks once it has local superiority (instead of today's passive
   per-turn scramble).
3. With 3 AI opponents, the AIs pursue visibly different paces (one attacks
   early, one builds first, one goes naval when water is near).
4. A mid-game save/load keeps the AI acting on the same goal phase afterwards.