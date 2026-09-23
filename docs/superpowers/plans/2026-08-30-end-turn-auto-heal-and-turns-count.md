# End-Turn Auto-Heal and Game-Over Turns Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a global `Turns: N` line on the game-over screen, and automatically heal each player's idle damaged units when that player's turn ends (human and AI).

**Architecture:** In `Simulator.doEndTurn()`, a new private `autoHealFor(playerIndex)` iterates the ending player's units and heals any where `canHeal(u)` is true, emitting a `healed` event per unit; it runs for the human at the top of `doEndTurn` and for each AI right after `runAiTurn`. The game-over screen adds a `Turns: ${s.turn}` label under the existing `Mode:` line.

**Tech Stack:** TypeScript, PixiJS, Zustand, Vite, Vitest.

## Global Constraints

- Auto-heal condition is exactly `canHeal(u)`: `!hasMoved && !hasAttacked && !hasHealed && hp < maxHp`. Fresh spawns (all three flags set) and units that already moved/attacked/healed this turn are skipped.
- Auto-heal runs only for the player whose turn is ending: the human at the top of `doEndTurn()`, and each AI right after its `runAiTurn` completes.
- Each healed unit emits `{ type: 'healed', unitId, playerIndex }` — identical to the manual Heal action.
- The turns-count label uses `fontSize: 16, fill: 0xcccccc`, centered, placed directly below the `Mode:` line via the shared `y` cursor.
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: Game-over screen turns count

**Files:**
- Modify: `src/ui/overlays/GameOver.ts`
- Test: `tests/gameOver.test.ts`

**Interfaces:**
- Consumes: `s.turn` from `useGameStore.getState()` (already populated).
- Produces: a `Turns: N` label rendered inside the `GameOver.mount()` overlay.

- [ ] **Step 1: Write the failing test**

In `tests/gameOver.test.ts`, add `turn: 27` to the `useGameStore.setState({...})` call inside the `mount` helper (line ~55):

```ts
    useGameStore.setState({
      screen: 'game', players, localPlayerIndex: 0, winnerIndex: 0, mode: 'capture', bonusAwarded: false, turn: 27,
    });
```

Append a new test inside the `describe('GameOver screen', ...)` block, after the existing `shows place badges 1, 2, 3` test:

```ts
  it('shows the game turn count', () => {
    const r = mount();
    expect(allTexts(r).some((t) => t.includes('Turns: 27'))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gameOver.test.ts`
Expected: FAIL — no text contains `Turns: 27`.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/overlays/GameOver.ts`, inside `mount()`, directly after the `mode` label block (which currently ends with `y += 34;`), add:

```ts
    const turns = makeLabel(`Turns: ${s.turn}`, { fontSize: 16, fill: 0xcccccc });
    turns.anchor.set(0.5, 0.5);
    turns.position.set(host.app.screen.width / 2, y);
    el.addChild(turns);
    y += 34;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameOver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlays/GameOver.ts tests/gameOver.test.ts
git commit -m "feat: show turns count on the game-over screen"
```

---

### Task 2: Auto-heal at turn end

**Files:**
- Modify: `src/game/simulator.ts`
- Test: `tests/simulatorTurn.test.ts`

**Interfaces:**
- Consumes: `canHeal` and `healUnit` (already imported from `./units` in `simulator.ts`).
- Produces: private `Simulator.autoHealFor(playerIndex: number): void` which heals each of that player's units where `canHeal(u)` is true, emitting a `healed` event per unit. Called from `doEndTurn()`.

- [ ] **Step 1: Write the failing tests**

Extend the imports at the top of `tests/simulatorTurn.test.ts`:

```ts
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { TileType } from '../src/game/tileTypes';
import { hexNeighbors } from '../src/game/hex';
```

(Change the existing `import { makeTestMap, tileAt } from './helpers/testMap';` to the line above.)

Append these four tests inside the existing `describe('Simulator turn engine', ...)` block:

```ts
  it('auto-heals an idle damaged unit of the human player at turn end', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const u = makeUnit('me', 0, 'warrior', 0, 0);
    u.hp = 3;
    tileAt(map, 0, 0)!.unit = u;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(u.hp).toBe(5);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'healed' && e.unitId === 'me')).toBe(true);
  });

  it('does not auto-heal a damaged unit that already acted', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const u = makeUnit('me', 0, 'warrior', 0, 0);
    u.hp = 3;
    u.hasAttacked = true;
    tileAt(map, 0, 0)!.unit = u;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(u.hp).toBe(3);
  });

  it('does not auto-heal a freshly spawned unit', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const u = makeUnit('spawned', 0, 'warrior', 0, 0);
    u.hp = 3;
    u.hasMoved = true;
    u.hasAttacked = true;
    u.hasHealed = true;
    tileAt(map, 0, 0)!.unit = u;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(u.hp).toBe(3);
  });

  it('auto-heals an idle damaged AI unit when its turn ends', () => {
    const map = makeTestMap(4);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const aiUnit = makeUnit('ai', 1, 'warrior', 0, 2);
    aiUnit.hp = 2;
    tileAt(map, 0, 2)!.unit = aiUnit;
    for (const n of hexNeighbors({ q: 0, r: 2 })) {
      const t = tileAt(map, n.q, n.r);
      if (t) t.terrain = TileType.GrasslandMountain;
    }
    const archer = makeUnit('arc', 0, 'archer', 2, 2);
    tileAt(map, 2, 2)!.unit = archer;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(aiUnit.hp).toBe(4);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'healed' && e.unitId === 'ai')).toBe(true);
  });
```

Why the AI test isolates auto-heal: the AI unit's six neighbors are mountains (no Climbing skill) so it cannot move; the enemy archer at distance 2 is out of the warrior's attack range but inside `enemyCanAttackNext` (archer movement 1 + attack distance 2 = 3), so the AI planner will not heal it itself during its turn (`bestAvailableAction` skips heal when `enemyCanAttackNext`). The only heal source is `autoHealFor`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- simulatorTurn.test.ts`
Expected: FAIL — the damaged units' HP is unchanged after `endTurn`.

- [ ] **Step 3: Write minimal implementation**

In `src/game/simulator.ts`, add the helper right after the existing `private findUnit(...)` method:

```ts
  private autoHealFor(playerIndex: number): void {
    for (const t of this.map.tiles) {
      const u = t.unit;
      if (u && u.owner === playerIndex && canHeal(u)) {
        healUnit(u);
        this.emit({ type: 'healed', unitId: u.id, playerIndex });
      }
    }
  }
```

In `doEndTurn()`, right after the `if (this.gameOver) return;` guard, add:

```ts
    this.autoHealFor(this.currentPlayerIndex);
```

In the `doEndTurn()` loop, change the AI branch:

```ts
      if (!this.players[next].isHuman) {
        this.runAiTurn(next);
        this.autoHealFor(next);
        continue;
      }
```

(`canHeal` and `healUnit` are already imported in this file from `./units`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- simulatorTurn.test.ts`
Expected: PASS (all four new tests plus the existing four).

- [ ] **Step 5: Commit**

```bash
git add src/game/simulator.ts tests/simulatorTurn.test.ts
git commit -m "feat: auto-heal idle damaged units at turn end"
```

---

### Task 3: Full verification

**Files:**
- None.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Confirm nothing stray was left uncommitted**

Run: `git status`
Expected: no modified tracked files.
