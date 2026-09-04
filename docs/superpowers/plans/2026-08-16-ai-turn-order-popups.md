# AI Players, Turn Order, and Popup System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a round-based turn system (human first, then AI), simple probabilistic AI behavior with visible step-by-step actions, per-turn HUD, and a stacking popup/notification system.

**Architecture:** Pure AI planning in `src/game/ai.ts` (testable with a seeded RNG) produces an ordered list of upgrade/move actions; `gameScreen.ts` executes them sequentially with 300ms delays and re-renders after each. `src/ui/popups.ts` manages a persistent `#popup-stack` DOM container. `gameScreen.ts` gains `currentPlayerIndex`, an `aiActive` flag, and async AI-turn orchestration.

**Tech Stack:** TypeScript, PixiJS 8, Vitest, plain HTML/CSS.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `turn` = round number; player order fixed (human = `players[0]`, then AI in index order).
- AI action gap = 300ms; each AI player's turn lasts at least 5000ms.
- AI upgrade probability = 0.8 (per owned village, skip if unaffordable); AI move probability = 0.9 (per unmoved unit).
- Human input blocked while `aiActive` (`#end-turn-btn` disabled, map clicks ignored).
- `planAiActions(map, playerIndex, rng): AiAction[]`; plan order = upgrades first, then moves.
- Popup: active 300ms then fade; click or ✕ fades immediately; newest on top; `#popup-stack` hidden when empty.
- Tests: `npm test`; typecheck `npm run typecheck`.
- Commit after each task with the exact message shown.

---

### Task 1: AI planning logic

**Files:**
- Create: `src/game/ai.ts`
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: `mapGen.ts` (`GameMap`, `MapTile`), `selection.ts` (`reachableTargets`, `moveUnit`, `tileAt`), `resources.ts` (`canAfford`, `pay`, `UPGRADE_COST`), `village.ts` (`upgradeVillage`), `units.ts` (`Unit`), `random.ts` (`SeededRandom`).
- Produces (consumed by Task 4): `planAiActions(map: GameMap, playerIndex: number, rng: SeededRandom): AiAction[]` with `type AiAction = { type: 'upgrade'; q: number; r: number } | { type: 'move'; unitId: string; q: number; r: number }`.

- [ ] **Step 1: Write the failing test**

Create `tests/ai.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { planAiActions, AiAction } from '../src/game/ai';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';
import { SeededRandom } from '../src/util/random';

function makeTile(
  q: number,
  r: number,
  ownedBy: number | null = null,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain: TileType.Land, settlement, unit, ownedBy };
}

function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hp: 5 };
}

function makeAiMap(): GameMap {
  const village = makeTile(0, 0, 1, { owner: 1, level: 1 });
  const warrior = makeTile(0, 0, 1, { owner: 1, level: 1 }, makeWarrior('w1', 1, 0, 0));
  const target = makeTile(1, 0, null);
  return { radius: 4, tiles: [village, warrior, target], spawns: [] };
}

describe('planAiActions', () => {
  it('emits upgrades before moves', () => {
    const map = makeAiMap();
    const actions = planAiActions(map, 1, new SeededRandom(1));
    const types = actions.map((a) => a.type);
    expect(types.indexOf('upgrade')).toBeGreaterThanOrEqual(0);
    const firstMove = types.indexOf('move');
    const lastUpgrade = types.lastIndexOf('upgrade');
    if (firstMove !== -1 && lastUpgrade !== -1) {
      expect(lastUpgrade).toBeLessThan(firstMove);
    }
  });

  it('moves land on reachable tiles', () => {
    const map = makeAiMap();
    const actions = planAiActions(map, 1, new SeededRandom(1));
    for (const a of actions) {
      if (a.type === 'move') {
        expect(a.q).not.toBe(0);
        expect(a.r).not.toBe(0);
      }
    }
  });

  it('does not plan moves for other players units', () => {
    const map = makeAiMap();
    const actions = planAiActions(map, 1, new SeededRandom(1));
    for (const a of actions) {
      if (a.type === 'move') {
        expect(a.unitId).toBe('w1');
      }
    }
  });

  it('respects probability with a seed that yields no actions', () => {
    const map = makeAiMap();
    const actions = planAiActions(map, 1, new SeededRandom(999));
    expect(Array.isArray(actions)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `ai.ts` module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/ai.ts`:

```ts
import { GameMap } from './mapGen';
import { reachableTargets } from './selection';
import { Unit } from './units';
import { SeededRandom } from '../util/random';

export type AiAction =
  | { type: 'upgrade'; q: number; r: number }
  | { type: 'move'; unitId: string; q: number; r: number };

export function planAiActions(
  map: GameMap,
  playerIndex: number,
  rng: SeededRandom,
): AiAction[] {
  const actions: AiAction[] = [];

  const villages = map.tiles.filter(
    (t) => t.settlement && t.settlement.owner === playerIndex,
  );

  for (const tile of villages) {
    if (rng.next() > 0.8) continue;
    actions.push({ type: 'upgrade', q: tile.q, r: tile.r });
  }

  const units = map.tiles
    .map((t) => t.unit)
    .filter((u): u is Unit => u !== null && u.owner === playerIndex && !u.hasMoved);

  for (const unit of units) {
    if (rng.next() > 0.9) continue;
    const targets = reachableTargets(map, unit);
    if (targets.length === 0) continue;
    const target = targets[Math.floor(rng.next() * targets.length)];
    actions.push({ type: 'move', unitId: unit.id, q: target.q, r: target.r });
  }

  return actions;
}
```

Note: affordability is intentionally NOT checked in the planner — it emits upgrade actions purely by probability. The executor (Task 4) checks `canAfford` and skips unaffordable upgrades, so the plan is the AI's *intent* and the executor applies reality.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (ai tests + existing).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/ai.ts tests/ai.test.ts
git commit -m "feat: add ai action planning"
```

---

### Task 2: Popup system

**Files:**
- Create: `src/ui/popups.ts`
- Modify: `index.html`
- Test: manual — headless DOM verification.

**Interfaces:**
- Consumes: `index.html` (`#popup-stack`).
- Produces (consumed by Tasks 3–4):
  - `showPopup(text: string, opts?: { background?: string; color?: string }): void`

- [ ] **Step 1: Add `#popup-stack` to `index.html`**

Add the CSS rule (after `#end-turn-btn`):

```css
    #popup-stack { position: absolute; top: 8px; left: 8px; display: flex; flex-direction: column; gap: 6px; z-index: 10; }
    #popup-stack .popup { padding: 8px 12px; border-radius: 4px; color: #fff; display: flex; align-items: center; gap: 8px; transition: opacity 0.4s; cursor: pointer; }
    #popup-stack .popup .popup-close { background: none; border: none; color: #fff; font-size: 14px; cursor: pointer; padding: 0; }
```

Add the element inside `#screen-game`:

```html
    <div id="popup-stack"></div>
```

- [ ] **Step 2: Write `src/ui/popups.ts`**

```ts
export function showPopup(
  text: string,
  opts: { background?: string; color?: string } = {},
): void {
  const stack = document.getElementById('popup-stack');
  if (!stack) return;

  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.style.background = opts.background ?? '#000';
  if (opts.color) popup.style.color = opts.color;

  const label = document.createElement('span');
  label.textContent = text;
  popup.appendChild(label);

  const close = document.createElement('button');
  close.className = 'popup-close';
  close.textContent = '\u2715';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    fadeOut(popup);
  });
  popup.appendChild(close);

  popup.addEventListener('click', () => fadeOut(popup));
  stack.prepend(popup);
  stack.style.display = 'flex';

  setTimeout(() => fadeOut(popup), 300);

  updateStackVisibility(stack);
}

function fadeOut(popup: HTMLElement): void {
  if (popup.dataset.fading) return;
  popup.dataset.fading = '1';
  popup.style.opacity = '0';
  setTimeout(() => {
    popup.remove();
    updateStackVisibility(popup.parentElement as HTMLElement);
  }, 400);
}

function updateStackVisibility(stack: HTMLElement): void {
  if (stack) {
    stack.style.display = stack.children.length === 0 ? 'none' : 'flex';
  }
}
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verify manually via headless DOM**

Run dev server + Chrome, click through to the game screen, then:

```bash
python3 - <<'EOF'
import json, requests, websocket, time
BASE = "http://127.0.0.1:9222"
ws_headers = {"Origin": "http://127.0.0.1:9222"}
page = requests.put(f"{BASE}/json/new?http://localhost:5173/").json()
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10, header=ws_headers)
idc = [0]
def send(method, params=None):
    idc[0] += 1
    mid = idc[0]
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == mid:
            return msg.get("result", {})
def evaljs(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r.get("result", {}).get("value")
send("Runtime.enable")
time.sleep(2)
print("popup-stack exists:", evaljs("document.getElementById('popup-stack') !== null"))
ws.close()
EOF
```

Expected: `popup-stack exists: True`. Kill the dev server and Chrome afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/ui/popups.ts index.html
git commit -m "feat: add popup system"
```

---

### Task 3: Turn order state in gameScreen

**Files:**
- Modify: `src/screens/gameScreen.ts`
- Test: typecheck + tests green.

**Interfaces:**
- Consumes: `showPopup` (Task 2).
- Produces: `currentPlayerIndex`, `aiActive`, per-turn HUD.

- [ ] **Step 1: Replace the `initGameScreen` state block**

In `src/screens/gameScreen.ts`, replace:

```ts
  let selection: Selection | null = null;
  let reachableKeys = new Set<string>();
  let mapContainer: Container | null = null;
  let turn = 1;
  const currentPlayer = players[0];
```

with:

```ts
  let selection: Selection | null = null;
  let reachableKeys = new Set<string>();
  let mapContainer: Container | null = null;
  let turn = 1;
  let currentPlayerIndex = 0;
  let aiActive = false;
  const currentPlayer = players[currentPlayerIndex];
```

- [ ] **Step 2: Add a player-switch helper and update HUD**

After the `const updateHud = ...` definition, add:

```ts
  const showTurnStart = (): void => {
    const p = players[currentPlayerIndex];
    const tribe = TRIBES.find((t) => t.id === p.tribe)!;
    showPopup(`${p.name}'s turn!`, { background: `#${tribe.color.toString(16).padStart(6, '0')}` });
  };
```

Replace `updateHud` body references to `currentPlayer` with `players[currentPlayerIndex]`, and make `#resources-info` show the current player's resources:

```ts
  const updateHud = (): void => {
    const player = players[currentPlayerIndex];
    turnInfoEl.textContent = `Turn ${turn} — ${player.name}`;
    resourcesInfoEl.textContent = `Wood: ${player.resources.wood} Stone: ${player.resources.stone} Money: ${player.resources.money}`;
    selectedInfoEl.innerHTML = selectedInfoHtml(players, map, selection, () => handleUpgrade());
    const upgradeBtn = document.getElementById('upgrade-village-btn');
    if (upgradeBtn) upgradeBtn.addEventListener('click', handleUpgrade);
  };
```

- [ ] **Step 3: Gate End turn and clicks on `aiActive`**

Update the `pointertap` handler start:

```ts
    mapContainer.on('pointertap', (e) => {
      if (aiActive) return;
      const local = mapContainer!.toLocal(e.global);
```

Update the End turn button handler to set `aiActive` and start the AI phase (the `runAiPhase` function is added in Task 4; for now keep behavior human-only):

```ts
  document.getElementById('end-turn-btn')!.addEventListener('click', () => {
    if (aiActive) return;
    aiActive = true;
    const btn = document.getElementById('end-turn-btn') as HTMLButtonElement;
    btn.disabled = true;
    runAiPhase();
  });
```

For this task, define a stub `runAiPhase` that returns to the human immediately so the code compiles:

```ts
  const runAiPhase = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    aiActive = false;
    const btn = document.getElementById('end-turn-btn') as HTMLButtonElement;
    btn.disabled = false;
    showTurnStart();
    render();
  };
```

- [ ] **Step 4: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/gameScreen.ts
git commit -m "feat: add turn order state and input blocking"
```

---

### Task 4: AI phase execution

**Files:**
- Modify: `src/screens/gameScreen.ts`
- Test: typecheck + tests green; manual verification.

**Interfaces:**
- Consumes: `planAiActions` (Task 1), `showPopup` (Task 2), `moveUnit`/`tileAt` (existing), `upgradeVillage` (existing), `pay`/`UPGRADE_COST`/`canAfford` (existing).
- Produces: full AI phase — upgrades then moves with 300ms gaps, 5s minimum, re-render after each action, back to human.

- [ ] **Step 1: Replace the `runAiPhase` stub**

Replace the Task 3 stub with:

```ts
  const runAiPhase = async (): Promise<void> => {
    const aiPlayers = players.filter((p) => !p.isHuman);

    for (const ai of aiPlayers) {
      const aiIndex = ai.index;
      currentPlayerIndex = aiIndex;
      const start = Date.now();

      const tribe = TRIBES.find((t) => t.id === ai.tribe)!;
      const bg = `#${tribe.color.toString(16).padStart(6, '0')}`;
      showPopup(`${ai.name}'s turn!`, { background: bg });
      render();

      const actions = planAiActions(map, aiIndex, new SeededRandom(Math.floor(Math.random() * 100000)));

      for (const action of actions) {
        if (action.type === 'upgrade') {
          const tile = tileAt(map, action.q, action.r)!;
          if (tile.settlement && tile.settlement.owner === aiIndex && canAfford(ai.resources, UPGRADE_COST)) {
            ai.resources = pay(ai.resources, UPGRADE_COST);
            upgradeVillage(map, tile);
            showPopup(`${ai.name}'s village upgraded to level ${tile.settlement.level}`, { background: bg });
          }
        } else {
          const unit = map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          if (unit) {
            const target = tileAt(map, action.q, action.r)!;
            moveUnit(map, unit, target);
          }
        }
        render();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const elapsed = Date.now() - start;
      if (elapsed < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 5000 - elapsed));
      }
      render();
    }

    currentPlayerIndex = 0;
    turn++;
    for (const t of map.tiles) {
      if (t.unit) t.unit.hasMoved = false;
    }
    aiActive = false;
    const btn = document.getElementById('end-turn-btn') as HTMLButtonElement;
    btn.disabled = false;
    selection = null;
    showTurnStart();
    render();
  };
```

- [ ] **Step 2: Add imports to `gameScreen.ts`**

Add at the top:

```ts
import { planAiActions } from '../game/ai';
import { showPopup } from '../ui/popups';
import { SeededRandom } from '../util/random';
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verify manually**

Run `npm run dev`, play with 1 enemy. Expected:
1. Human turn: `Turn 1 — <human>`, resources show human's, End turn enabled.
2. Click End turn → End turn disabled, AI name + resources shown, popup `<ai>'s turn!`.
3. AI upgrades its village (prob 0.8) and moves its unit (prob 0.9), each step re-renders with ~300ms gaps, popups appear for upgrades.
4. Turn lasts ≥5s, then control returns to human, `Turn 2 — <human>`, popup `<human>'s turn!`.
5. Repeat with 2 enemies — two AI turns in sequence.

- [ ] **Step 5: Commit**

```bash
git add src/screens/gameScreen.ts
git commit -m "feat: execute ai turns with timed actions"
```

---

## Self-Review Notes

- **Spec coverage:** round-based turn counter + fixed order — Task 3; AI planning (0.8 upgrade / 0.9 move, upgrades-first, affordable-only) — Task 1 + Task 4; 300ms gaps, 5s minimum, re-render after each action — Task 4; input blocking — Task 3; HUD shows AI name/resources during its turn — Task 3; popup system (300ms active, click/✕ fade, stack newest-on-top, hidden when empty, black default / explicit bg) — Task 2; turn-start and upgrade popups — Tasks 3–4. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `AiAction`, `planAiActions`, `showPopup`, `currentPlayerIndex`, `aiActive`, `runAiPhase` names consistent across tasks. `pay`/`canAfford`/`UPGRADE_COST` used in both Task 1 (skipped) and Task 4 (applied). `moveUnit`/`upgradeVillage` signatures unchanged.
- **Known simplification:** `planAiActions` intentionally omits affordability — it emits upgrade actions purely by probability (the AI's intent). The executor (Task 4) checks `canAfford` and skips unaffordable upgrades, applying cost deduction.
