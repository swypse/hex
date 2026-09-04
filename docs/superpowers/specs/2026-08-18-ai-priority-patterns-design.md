# Design: AI turn refinement with priority patterns

Date: 2026-08-18

## Goal

Expand the AI so it can perform every player action (move, upgrade, capture, attack, spawn any unit type, build factory/mine/port, open skills, heal), randomly selecting actions until none are available — while three high-priority defensive/kiting patterns run first. Patterns live in a separate, editable file with explicit priorities.

## Design decisions (confirmed with user)

1. **Action loop**: the planner iterates; each step first evaluates priority patterns (highest priority first) and takes the first pattern that applies; otherwise it picks a random available action; marks that entity/place used; repeats until nothing is available (with a max-iteration guard).
2. **AI skills**: when nothing else applies, the AI opens a random openable skill (+30 score, like the human).
3. **AI buildings**: the AI builds on a random eligible owned tile (via `canBuildFactory/Mine/Port`), affordable and with the required skill unlocked.
4. Unit move/attack can both apply to one unit (kiting); heal and capture consume the unit for the round.

## Action set (`src/game/ai.ts`)

`AiAction` gains:

```ts
| { type: 'heal'; unitId: string; q: number; r: number }
| { type: 'build'; q: number; r: number; kind: 'factory' | 'mine' | 'port' }
| { type: 'openSkill'; skill: SkillId }
```

## Pattern system (`src/game/aiPatterns.ts`, new)

```ts
export interface AiPatternContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
}

export interface AiPattern {
  id: string;
  priority: number; // higher = checked first
  evaluate(ctx: AiPatternContext): AiAction[] | null; // null when not applicable
}

export const AI_PATTERNS: AiPattern[] = [ /* sorted by priority desc */ ];
```

Threat approximations (next-round):
- Enemy can reach a tile: `hexDistance(enemy, tile) <= UNIT_MOVEMENT[enemy.type]`.
- Enemy can attack a tile next round: `hexDistance(enemy, tile) <= UNIT_MOVEMENT[enemy.type] + UNIT_ATTACK_DISTANCE[enemy.type]`.

Patterns (data, easy to add/edit/re-prioritize):

1. **`defend-empty-village`** (priority 100) — an AI village with no unit on it, threatened, and a spawn is affordable/skill-available → `[spawn(mostHp affordable unit)]`. Most-HP ordering: swordsman (8) > warrior (5) > rider (4) > archer (3), affordability + swordsman skill considered.
2. **`defend-hurt-unit`** (priority 90) — an AI unit on its village with `hp <= maxHp / 2`, threatened → with probability 0.5 `[heal(unit)]`, else `[move(unit to any reachable non-occupied tile), spawn(mostHp affordable unit in the village)]`.
3. **`archer-kite`** (priority 80) — an AI archer not on a village, with an enemy at distance 1 → `[move(archer to a reachable tile at distance 2 from that enemy), attack(enemy)]`.

## Planner (`src/game/ai.ts` rework)

`planAiActions(map, player: Player, rng: SeededRandom): AiAction[]`.

Planner state:
```ts
interface AiPlannerState {
  moved: Set<string>;      // unit ids that moved
  acted: Set<string>;      // unit ids that attacked/healed/captured
  upgraded: Set<string>;   // village keys upgraded
  spawned: Set<string>;    // village keys that spawned
  built: Set<string>;      // tile keys with a planned building
  opened: Set<SkillId>;    // skills opened
  occupied: Set<string>;   // tile keys planned as movement targets
}
```

Algorithm:
1. Evaluate patterns in priority order; the first non-null result is appended (all actions) and the state is marked.
2. If no pattern applies, build the random action pool:
   - upgrade for each non-upgraded, affordable village;
   - spawn for each non-spawned village with an empty tile and an affordable + skill-available unit (random type);
   - for each unit by its state: capture (on a capturable village), else attack (random attackable target), else heal (if healable), else move (greedy target, excluding `occupied`);
   - build on a random eligible owned tile (kind from `canBuild*`);
   - open a random openable skill.
   Pick one at random, append, mark.
3. Loop until no pattern and no random action apply; guard with a max-iteration cap (e.g., 200).

Marking rules: `move` → `moved` (+`occupied` target); `attack`/`heal`/`capture` → `acted`; `spawn`/`upgrade` → per village; `build` → `built` (+`occupied`); `openSkill` → `opened`.

## Controller (`src/controller/gameController.ts`)

- Call becomes `planAiActions(this.map, ai, rng)`.
- The action switch in `runAiPhase` gains:
  - `heal`: `healUnit(unit)` + popup (`{name} heals`).
  - `build`: `buildBuilding(this.map, tile, kind, ai)` + popup (`{name} builds a {kind}`).
  - `openSkill`: `openSkill(ai, skill)` + `awardScore(ai, SKILL_SCORE)` + popup.

## Files touched

- `src/game/aiPatterns.ts` (new) — patterns + `AiPatternContext`.
- `src/game/ai.ts` — extended `AiAction`, planner rework (`planAiActions(map, player, rng)`), greedy move, most-HP selection, random pool.
- `src/controller/gameController.ts` — new action execution + call site.
- `tests/aiPatterns.test.ts` (new), `tests/ai.test.ts` (rework).

## Testing

- `aiPatterns.test.ts`: each pattern returns actions in its scenario and null otherwise (empty village threatened → spawn; hurt threatened unit → heal or move+spawn; archer + enemy at 1 → move to distance 2 + attack).
- `ai.test.ts` (reworked): planner produces moves on reachable tiles, spawns when affordable, captures when parked, attacks in range, builds/opens skills eventually, and terminates (bounded).
- Existing suite, `npm run typecheck`, `npm run build` stay green.
- Manual via `npm run dev`: AI defends threatened villages, heals/kites hurt units, builds and opens skills, and plays through its full turn.

## Out of scope

- Multi-unit coordinated planning (each unit decides independently).
- Enemy-move simulation for precise threat evaluation (uses distance approximations).
- Learning/tuning parameters beyond the priority list.
