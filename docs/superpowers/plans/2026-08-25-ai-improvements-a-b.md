# AI Improvements A+B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI more dangerous through better decisions — a scored best-action fallback (Variant A) and tactical patterns (Variant B) — without any stat/resource/rule cheating.

**Architecture:** Add `chooseBestAttack` to `combat.ts`; move shared distance helpers into `aiPatterns.ts` and add an `attackersForTile` helper; replace `randomAvailableAction` in `ai.ts` with a scored `bestAvailableAction` (with move→attack chaining and economy scoring); add 5 new priority patterns (focus-fire, capture-push, counter-threat, retreat-heal, economy-opening).

**Tech Stack:** TypeScript, Vitest (node env).

## Global Constraints

- No game-logic, unit-stat, or resource changes — planner/decision changes only.
- `doMove`/`doAttack` in `simulator.ts` re-validate and no-op invalid actions; over-planned actions are safe.
- Existing `tests/ai.test.ts` and `tests/aiPatterns.test.ts` stay green (jitter keeps cross-seed variety).
- Keep `AI_PATTERNS` sorted by priority descending.
- Add `rng.next() * 60` jitter to best-action scores so choices vary across seeds.

---
### Task 1: `chooseBestAttack` in `combat.ts`

**Files:**
- Modify: `src/game/combat.ts` (add export near `attackableTargets`)
- Test: `tests/combat.test.ts`

**Interfaces:**
- Produces: `chooseBestAttack(map: GameMap, unit: Unit, playerIndex?: number): MapTile | null` — best attackable target by score, `null` if none. Task 3 and Task 4 use it.

- [ ] **Step 1: Write the failing test**

Append to `tests/combat.test.ts` (after the `attackableTargets` describe):

```ts
describe('chooseBestAttack', () => {
  it('prefers a killable target over a healthy one', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const attacker = makeWarrior('a', 0, 0, 0, MAX_HP);
    const killable = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('k', 1, 1, 0, 1));
    const healthy = makeTile(0, 1, TileType.GrasslandLand, makeWarrior('h', 1, 0, 1, MAX_HP));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), killable, healthy);
    const best = chooseBestAttack(map, attacker, 0);
    expect(best?.q).toBe(1);
    expect(best?.r).toBe(0);
  });

  it('prefers a target that cannot retaliate', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const archer: Unit = { id: 'a', owner: 0, type: 'archer', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 3, attack: 1, attackDistance: 2, spawnVillage: null };
    const melee = makeTile(1, 0, TileType.GrasslandLand, makeWarrior('m', 1, 1, 0, 1));
    const farMelee = makeTile(2, 0, TileType.GrasslandLand, makeWarrior('f', 1, 2, 0, 1));
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, archer), melee, farMelee);
    const best = chooseBestAttack(map, archer, 0);
    expect(best?.q).toBe(2);
    expect(best?.r).toBe(0);
  });
});
```

Update the import on line 3 to include `chooseBestAttack`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/combat.test.ts -t chooseBestAttack`
Expected: FAIL — `chooseBestAttack` is not exported.

- [ ] **Step 3: Implement**

Add to `src/game/combat.ts` (after `attackableTargets`):

```ts
export function chooseBestAttack(map: GameMap, unit: Unit, playerIndex = 0): MapTile | null {
  const targets = attackableTargets(map, unit, playerIndex);
  let best: MapTile | null = null;
  let bestScore = -Infinity;
  for (const t of targets) {
    const target = t.unit!;
    const dmg = attackDamage(unit);
    let s = 0;
    if (dmg >= target.hp) s += 500;
    s += (UNIT_TYPES[target.type].maxHp - target.hp) * 3;
    if (target.type === 'swordsman') s += 80;
    if (target.type === 'archer') s += 60;
    if (target.shipLevel !== undefined) s += 90;
    if (t.settlement && t.settlement.owner !== unit.owner) s += 150;
    const dist = hexDistance({ q: unit.q, r: unit.r }, { q: t.q, r: t.r });
    if (dist > target.attackDistance) s += 40;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/combat.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: add best attack target selection for the AI"
```

---
### Task 2: Shared distance helpers + `attackersForTile` in `aiPatterns.ts`

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Modify: `src/game/ai.ts` (remove its local copies of the two distance helpers)

**Interfaces:**
- Produces (exported from `aiPatterns.ts`):
  - `nearestEnemyDistanceFrom(map, owner, tile): number`
  - `nearestVillageDistanceFrom(map, owner, tile): number`
  - `attackersForTile(map, player, targetTile, state): { unit: Unit; moveTo: MapTile | null }[]`
- Consumes in Task 3/4.

- [ ] **Step 1: Implement**

In `src/game/aiPatterns.ts`:

1. Update the `units` import to include the `Unit` type (the existing import already has `UNIT_ATTACK_DISTANCE, UNIT_MOVEMENT, UNIT_TYPES, UnitType`):

```ts
import { UNIT_ATTACK_DISTANCE, UNIT_MOVEMENT, UNIT_TYPES, Unit, UnitType } from './units';
```

2. Add these exported helpers before `AI_PATTERNS`:

```ts
export function nearestEnemyDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === owner) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function nearestVillageDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === owner) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function attackersForTile(
  map: GameMap,
  player: Player,
  targetTile: MapTile,
  state: AiPlannerState,
): { unit: Unit; moveTo: MapTile | null }[] {
  const out: { unit: Unit; moveTo: MapTile | null }[] = [];
  const canClimb = hasSkill(player, 'climbing');
  const canDock = hasSkill(player, 'navigation');
  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
    if (attackableTargets(map, unit, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
      out.push({ unit, moveTo: null });
      continue;
    }
    for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
      if (state.occupied.has(key(c.q, c.r))) continue;
      const ghost: Unit = { ...unit, q: c.q, r: c.r };
      if (attackableTargets(map, ghost, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
        out.push({ unit, moveTo: c });
        break;
      }
    }
  }
  return out;
}
```

(`hexDistance`, `reachableTargets`, `attackableTargets`, `hasSkill` are already imported in this file.)

- [ ] **Step 2: Remove the local copies from `ai.ts`**

In `src/game/ai.ts`, delete `nearestEnemyDistanceFrom`, `nearestVillageDistanceFrom`, and `hasForeignVillage` (lines 20-42). They move to `aiPatterns.ts`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (ai.ts no longer references the removed locals; nothing else uses them yet).

- [ ] **Step 4: Commit**

```bash
git add src/game/aiPatterns.ts src/game/ai.ts
git commit -m "refactor: move AI distance helpers into aiPatterns"
```

---
### Task 3: `bestAvailableAction` fallback in `ai.ts`

**Files:**
- Modify: `src/game/ai.ts`

**Interfaces:**
- Consumes: `chooseBestAttack` (Task 1); `nearestEnemyDistanceFrom`, `nearestVillageDistanceFrom`, `enemyCanReach`, `enemyCanAttackNext`, `bestSpawnableUnitType` from `aiPatterns`; `pay` from `./resources`.
- Produces: `bestAvailableAction(map, player, rng, state): AiAction[] | null` replacing `randomAvailableAction`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ai.test.ts`:

```ts
it('chains a move then an attack when moving brings the unit in range', () => {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  map.tiles.push(
    makeTile(0, 0, null, null, makeWarrior('ai1', 1, 0, 0)),
    makeTile(1, 0),
    makeTile(2, 0, 0, null, makeWarrior('enemy', 0, 2, 0)),
  );
  const actions = planAiActions(map, aiPlayer(), new SeededRandom(1));
  const move = actions.find((a) => a.type === 'move');
  const attack = actions.find((a) => a.type === 'attack');
  expect(move).toBeDefined();
  expect(attack).toBeDefined();
  expect(actions.indexOf(move!) < actions.indexOf(attack!)).toBe(true);
});

it('spawns the best affordable unit type', () => {
  const map = makeAiMap();
  const spawns = planSeeds(map, aiPlayer(), 40).filter((a) => a.type === 'spawn');
  expect(spawns.length).toBeGreaterThan(0);
  for (const s of spawns) {
    if (s.type === 'spawn') expect(s.unitType).toBe('swordsman');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai.test.ts`
Expected: FAIL — the generic planner does not chain move→attack, and spawns pick random types.

- [ ] **Step 3: Implement**

Rewrite `src/game/ai.ts`:

1. Adjust imports (drop `spawnableTypes`, `greedyMoveTarget`, `hasForeignVillage`, `randomAvailableAction` and the local distance helpers entirely):

```ts
import { canBuildFactory, canBuildMine, canBuildPort, BUILDING_COSTS } from './buildings';
import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay, UPGRADE_COST } from './resources';
import { canOpenSkill, hasSkill, SKILLS, SkillId } from './skills';
import { reachableTargets } from './selection';
import { canHeal, UNIT_TYPES, Unit } from './units';
import { SeededRandom } from '../util/random';
import { AI_PATTERNS, AiPatternContext, bestSpawnableUnitType, enemyCanAttackNext, enemyCanReach, nearestEnemyDistanceFrom, nearestVillageDistanceFrom } from './aiPatterns';
import { AiAction, AiPlannerState } from './aiTypes';
import { chooseBestAttack } from './combat';
```

2. Replace `randomAvailableAction` with:

```ts
function bestAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
): AiAction[] | null {
  const jitter = (): number => rng.next() * 60;
  const candidates: { score: number; action: AiAction | AiAction[] }[] = [];

  for (const v of map.tiles) {
    if (!v.settlement || v.settlement.owner !== player.index) continue;
    const k = key(v.q, v.r);
    if (!state.upgraded.has(k) && canAfford(player.resources, UPGRADE_COST)) {
      const front = nearestEnemyDistanceFrom(map, player.index, v) <= 4;
      candidates.push({ score: (front ? 700 : 350) + jitter(), action: { type: 'upgrade', q: v.q, r: v.r } });
    }
    if (!state.spawned.has(k) && !v.unit) {
      const type = bestSpawnableUnitType(player);
      if (type) {
        const cost = { wood: 0, stone: 0, money: UNIT_TYPES[type].price, ore: UNIT_TYPES[type].priceOre };
        if (canAfford(player.resources, cost)) {
          const threatened = enemyCanReach(map, v, player.index);
          const after = pay(player.resources, cost);
          const reserveOk = threatened || after.money >= UNIT_TYPES.swordsman.price;
          if (reserveOk) {
            candidates.push({ score: (threatened ? 500 : 250) + jitter(), action: { type: 'spawn', q: v.q, r: v.r, unitType: type } });
          }
        }
      }
    }
  }

  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id)) continue;
    if (t.settlement && t.settlement.owner !== unit.owner && t.settlement.captureReady) {
      candidates.push({ score: 5000 + jitter(), action: { type: 'capture', q: t.q, r: t.r, unitId: unit.id } });
      continue;
    }
    const attackTile = chooseBestAttack(map, unit, unit.owner);
    if (attackTile) {
      candidates.push({ score: 4000 + jitter(), action: { type: 'attack', unitId: unit.id, q: attackTile.q, r: attackTile.r } });
      continue;
    }
    if (state.moved.has(unit.id)) continue;
    if (canHeal(unit) && unit.hp < UNIT_TYPES[unit.type].maxHp && !enemyCanAttackNext(map, t, player.index)) {
      candidates.push({ score: 600 + jitter(), action: { type: 'heal', unitId: unit.id, q: t.q, r: t.r } });
      continue;
    }
    const canClimb = hasSkill(player, 'climbing');
    const canDock = hasSkill(player, 'navigation');
    const targets = reachableTargets(map, unit, undefined, canClimb, canDock, unit.owner).filter(
      (c) => !state.occupied.has(key(c.q, c.r)) && !(c.settlement && c.settlement.owner === unit.owner),
    );
    let bestMove: MapTile | null = null;
    let bestMoveScore = -Infinity;
    let bestAttackAfter: MapTile | null = null;
    for (const c of targets) {
      const ghost: Unit = { ...unit, q: c.q, r: c.r };
      const a = chooseBestAttack(map, ghost, unit.owner);
      if (a) {
        const s = 3000 - hexDistance(t, c);
        if (s > bestMoveScore) {
          bestMoveScore = s;
          bestMove = c;
          bestAttackAfter = a;
        }
        continue;
      }
      const distToVillage = nearestVillageDistanceFrom(map, unit.owner, c);
      const inThreat = enemyCanAttackNext(map, c, player.index);
      const ownBonus = c.settlement && c.settlement.owner === unit.owner ? 40 : 0;
      const s = 100 - distToVillage - (inThreat ? 200 : 0) + ownBonus;
      if (s > bestMoveScore) {
        bestMoveScore = s;
        bestMove = c;
        bestAttackAfter = null;
      }
    }
    if (bestMove && bestAttackAfter) {
      candidates.push({
        score: bestMoveScore + jitter(),
        action: [
          { type: 'move', unitId: unit.id, q: bestMove.q, r: bestMove.r },
          { type: 'attack', unitId: unit.id, q: bestAttackAfter.q, r: bestAttackAfter.r },
        ],
      });
    } else if (bestMove) {
      candidates.push({ score: bestMoveScore + jitter(), action: { type: 'move', unitId: unit.id, q: bestMove.q, r: bestMove.r } });
    }
  }

  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index) continue;
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (canBuildFactory(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.factory)) {
      candidates.push({ score: 400 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'factory' } });
    }
    if (canBuildMine(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.mine)) {
      candidates.push({ score: 400 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'mine' } });
    }
    if (canBuildPort(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.port)) {
      candidates.push({ score: 200 + jitter(), action: { type: 'build', q: tile.q, r: tile.r, kind: 'port' } });
    }
  }

  for (const id of Object.keys(SKILLS) as SkillId[]) {
    if (state.opened.has(id)) continue;
    if (canOpenSkill(player, id)) {
      candidates.push({ score: 150 + jitter(), action: { type: 'openSkill', skill: id } });
    }
  }

  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.score > best.score) best = c;
  return Array.isArray(best.action) ? best.action : [best.action];
}
```

3. In `planAiActions`, change the fallback line:

```ts
    if (!next) next = randomAvailableAction(map, player, rng, state);
```

to:

```ts
    if (!next) next = bestAvailableAction(map, player, rng, state);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai.test.ts`
Expected: PASS (all, including the two new tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test` and `npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/ai.ts tests/ai.test.ts
git commit -m "feat: AI picks the best action and chains move into attack"
```

---
### Task 4: New tactical patterns in `aiPatterns.ts`

**Files:**
- Modify: `src/game/aiPatterns.ts`
- Test: `tests/aiPatterns.test.ts`

**Interfaces:**
- Consumes: `attackersForTile`, `nearestEnemyDistanceFrom` (Task 2), `chooseBestAttack` (Task 1), `attackDamage`, `BUILDING_COSTS`/`canBuildMine`/`canBuildFactory`.
- Produces: five new entries in `AI_PATTERNS`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/aiPatterns.test.ts` (inside the `describe('AI patterns', ...)` block, after the existing tests):

```ts
  it('focus-fire directs two attackers at a killable target', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(2, 0, null, warrior('ai2', 1, 2, 0)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0, 1)),
    );
    const actions = findPattern('focus-fire').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.filter((a) => a.type === 'attack').length).toBe(2);
  });

  it('capture-push parks a unit on a nearby enemy village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(1, 0, { owner: 0, level: 1, captureReady: false }, null, 0),
      tile(2, 0),
    );
    const actions = findPattern('capture-push').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0].type).toBe('move');
    if (actions![0].type === 'move') {
      expect(actions![0].q).toBe(1);
      expect(actions![0].r).toBe(0);
    }
  });

  it('counter-threat retreats a unit an enemy can kill', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0, 1)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(0, 1),
    );
    const actions = findPattern('counter-threat').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0].type).toBe('move');
  });

  it('retreat-heal pulls a wounded threatened unit back', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0, 2)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(0, 1),
      tile(1, -1),
    );
    const actions = findPattern('retreat-heal').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0].type).toBe('move');
  });

  it('economy-opening upgrades a village when the AI is small', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, null, warrior('ai1', 1, 1, 0)),
    );
    const actions = findPattern('economy-opening').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0].type).toBe('upgrade');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiPatterns.test.ts`
Expected: FAIL — `findPattern` returns `undefined` for the new ids.

- [ ] **Step 3: Implement**

In `src/game/aiPatterns.ts`:

1. Update imports (the existing import already has `attackableTargets`):

```ts
import { attackableTargets, attackDamage } from './combat';
import { canBuildFactory, canBuildMine, BUILDING_COSTS } from './buildings';
import { canAfford, UPGRADE_COST } from './resources';
```

2. Add these patterns to `AI_PATTERNS` at the correct positions (keeping priority order: 200 > 190 > 110 > 100 > 95 > 90 > 85 > 80 > 25):

After the `attack-enemy-in-village` entry (priority 200):

```ts
  {
    id: 'focus-fire',
    priority: 190,
    evaluate({ map, player, state }): AiAction[] | null {
      for (const t of map.tiles) {
        const enemy = t.unit;
        if (!enemy || enemy.owner === player.index) continue;
        const attackers = attackersForTile(map, player, t, state);
        if (attackers.length < 2) continue;
        const total = attackers.reduce((s, a) => s + attackDamage(a.unit), 0);
        if (total < enemy.hp) continue;
        const actions: AiAction[] = [];
        for (const a of attackers) {
          if (a.moveTo) actions.push({ type: 'move', unitId: a.unit.id, q: a.moveTo.q, r: a.moveTo.r });
          actions.push({ type: 'attack', unitId: a.unit.id, q: t.q, r: t.r });
        }
        return actions;
      }
      return null;
    },
  },
```

Between `defend-empty-village` (100) and `defend-hurt-unit` (90):

```ts
  {
    id: 'capture-push',
    priority: 110,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner === player.index) continue;
        if (t.settlement.captureReady) continue;
        if (t.unit && t.unit.owner === player.index) continue;
        for (const src of map.tiles) {
          const unit = src.unit;
          if (!unit || unit.owner !== player.index) continue;
          if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
          if (state.occupied.has(key(t.q, t.r))) continue;
          const canReach = reachableTargets(map, unit, undefined, canClimb, canDock, player.index).some(
            (c) => c.q === t.q && c.r === t.r,
          );
          if (!canReach) continue;
          return [{ type: 'move', unitId: unit.id, q: t.q, r: t.r }];
        }
      }
      return null;
    },
  },
  {
    id: 'counter-threat',
    priority: 95,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        for (const e of map.tiles) {
          const enemy = e.unit;
          if (!enemy || enemy.owner === player.index) continue;
          if (hexDistance(t, e) > enemy.attackDistance) continue;
          if (attackDamage(enemy) < unit.hp) continue;
          const canKill = attackableTargets(map, unit, player.index).some((a) => a.q === e.q && a.r === e.r) && attackDamage(unit) >= enemy.hp;
          if (canKill) return [{ type: 'attack', unitId: unit.id, q: e.q, r: e.r }];
          let best: MapTile | null = null;
          let bestDist = -Infinity;
          for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
            if (state.occupied.has(key(c.q, c.r))) continue;
            if (c.settlement && c.settlement.owner === unit.owner) {
              best = c;
              break;
            }
            const d = nearestEnemyDistanceFrom(map, player.index, c);
            if (d > bestDist) {
              bestDist = d;
              best = c;
            }
          }
          if (best) return [{ type: 'move', unitId: unit.id, q: best.q, r: best.r }];
        }
      }
      return null;
    },
  },
  {
    id: 'retreat-heal',
    priority: 85,
    evaluate({ map, player, state }): AiAction[] | null {
      const canClimb = hasSkill(player, 'climbing');
      const canDock = hasSkill(player, 'navigation');
      for (const t of map.tiles) {
        const unit = t.unit;
        if (!unit || unit.owner !== player.index) continue;
        if (state.acted.has(unit.id) || state.moved.has(unit.id)) continue;
        if (unit.hp > UNIT_TYPES[unit.type].maxHp / 2) continue;
        if (t.settlement && t.settlement.owner === player.index) continue;
        if (!enemyCanAttackNext(map, t, player.index)) continue;
        let best: MapTile | null = null;
        let bestDist = -Infinity;
        for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
          if (state.occupied.has(key(c.q, c.r))) continue;
          if (c.settlement && c.settlement.owner === unit.owner) {
            best = c;
            break;
          }
          const d = nearestEnemyDistanceFrom(map, player.index, c);
          if (d > bestDist) {
            bestDist = d;
            best = c;
          }
        }
        if (best) return [{ type: 'move', unitId: unit.id, q: best.q, r: best.r }];
      }
      return null;
    },
  },
```

At the end of `AI_PATTERNS` (after `archer-kite`):

```ts
  {
    id: 'economy-opening',
    priority: 25,
    evaluate({ map, player, state }): AiAction[] | null {
      const ownUnits = map.tiles.filter((t) => t.unit && t.unit.owner === player.index).length;
      if (ownUnits > 4) return null;
      for (const t of map.tiles) {
        if (!t.settlement || t.settlement.owner !== player.index) continue;
        const k = key(t.q, t.r);
        if (state.upgraded.has(k)) continue;
        if (!canAfford(player.resources, UPGRADE_COST)) continue;
        const front = nearestEnemyDistanceFrom(map, player.index, t) <= 4;
        if (front || ownUnits <= 2) return [{ type: 'upgrade', q: t.q, r: t.r }];
      }
      for (const tile of map.tiles) {
        if (tile.ownedBy !== player.index) continue;
        if (state.built.has(key(tile.q, tile.r))) continue;
        if (canBuildMine(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.mine)) {
          return [{ type: 'build', q: tile.q, r: tile.r, kind: 'mine' }];
        }
        if (canBuildFactory(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.factory)) {
          return [{ type: 'build', q: tile.q, r: tile.r, kind: 'factory' }];
        }
      }
      return null;
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/aiPatterns.test.ts`
Expected: PASS (all, including the new pattern tests).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/aiPatterns.ts tests/aiPatterns.test.ts
git commit -m "feat: add AI tactical patterns"
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`
1. Start a single-player game with 2-3 AI enemies on normal difficulty.
2. Watch AI turns: units move-and-attack in one turn, wounded units pull back and heal, multiple units gang up on weakened humans, enemy villages get parked on, early villages get upgraded.
3. No AI stat/resource advantages are visible (fair fight, smarter play).
