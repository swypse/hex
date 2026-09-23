# Science Miss Chance and In-Game Tips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Science skill cut its owner's attack miss chance from 10% to 5%, add a per-game onboarding tips HUD shown next to the Skills button, and add a persistent "Disable tips" setting.

**Architecture:** A pure `missChanceFor(player)` helper in `combat.ts` feeds a new optional `missChance` argument to `performAttack`; the simulator's two attack paths pass it. Tip copy + scheduling live in a pure module (`src/ui/hud/tips.ts`); a new `HudTips` Pixi widget subscribes to the Zustand store, shows/hides from turn + local-player checks, and reads a new `disableTips` setting persisted in `settings.ts`.

**Tech Stack:** TypeScript (strict), PixiJS 8 HUD widgets, Zustand store, Vitest, Vite. No new dependencies.

## Global Constraints

- No new runtime or dev dependencies.
- Follow existing repo conventions: pure modules get pure tests; Pixi widgets implement `Widget` (`mount(host, root)` / `destroy()`) and are mounted in `GameScreen`; labels via `makeLabel`; clicks via `.on('pointertap', ...)`.
- Keep the base `MISS_CHANCE` constant exactly `0.1`; Science lowers the *owner's* attacks to `0.05`. Pirates (owner `-1`, no player) stay at `0.1`.
- Only the initiating attack can miss; counter-attacks never miss (unchanged).
- The five tip strings are verbatim (display order per game is random):
  1. `Attacks can miss. Open the Science skill to make your attacks more precise.`
  2. `Open the Roads skill to connect villages and move your units faster.`
  3. `Open the Navigation skill to turn units into ships and sail the seas.`
  4. `Beware: pirates can capture your ships.`
  5. `Build mines on mountains to gather stone and ore — you need them to upgrade villages.`
- Tip scheduling rules (all global-turn based, shown only at the start of the **local player's own turn**): first tip due at turn `3`; after closing a tip at turn `T` the next is due at turn `T + 2`; each tip appears once per game; an unclosed tip keeps reappearing on later own turns until closed; once all five are shown, nothing more shows.
- Workspace: implement on a clean feature branch created from current `master` HEAD. The working tree of the repo contains unrelated, uncommitted in-progress edits — never stage or commit those. Per-task commits must add only the files listed in that task.
- Verification commands: single file `npx vitest run <file>`; full gate `npm test`, then `npm run typecheck`.

## File Structure

| File | Responsibility |
|---|---|
| `src/game/combat.ts` (modify) | `SCIENCE_MISS_CHANCE`, `missChanceFor`, `performAttack` miss-chance parameter |
| `src/game/skills.ts` (modify) | Science skill description |
| `src/game/simulator.ts` (modify) | Pass `missChanceFor(attackerPlayer)` in `doAttack` |
| `src/storage/settings.ts` (modify) | `disableTips` field + `tipsDisabled`/`setTipsDisabled` |
| `src/ui/screens/StartScreen.ts` (modify) | "Disable tips" row in the Settings panel |
| `src/ui/layout.ts` (modify) | Shared skills-button anchor used by `HudSkills` + `HudTips` |
| `src/ui/hud/HudSkills.ts` (modify) | Use the shared anchor (behavior unchanged) |
| `src/ui/hud/tips.ts` (create) | Tip copy + pure scheduler (`TipsProgress`) |
| `src/ui/hud/HudTips.ts` (create) | The on-screen tip widget |
| `src/ui/screens/GameScreen.ts` (modify) | Mount `HudTips` |
| `GAME.md` (modify) | Science skill + attack rule documentation |
| Tests | `combat.test.ts`, `simulator.test.ts`, `skills.test.ts`, `settings.test.ts`, `tips.test.ts`, `hudTips.test.ts` |

**Task dependency chain:** Task 1 produces `missChanceFor`/`performAttack` (Task 3 consumes). Task 4 produces the `disableTips` setting helpers (Task 5 UI and Task 8 widget consume). Task 6 produces `skillsButtonPosition` (Task 8 consumes). Task 7 produces `tips.ts` (Task 8 consumes). Tasks 2 and 9 are independent doc/description edits.

---

### Task 1: Science-aware miss chance in combat

**Files:**
- Modify: `src/game/combat.ts:1-17, 76-95`
- Test: `tests/combat.test.ts`

**Interfaces:**
- Produces:
  - `export const SCIENCE_MISS_CHANCE = 0.05;`
  - `export function missChanceFor(player: Player): number` — `0.05` when `hasSkill(player, 'science')`, else `0.1`.
  - `export function performAttack(map: GameMap, attacker: Unit, target: MapTile, rng: () => number = Math.random, missChance: number = MISS_CHANCE): AttackResult` — the miss check uses `missChance`.

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `tests/combat.test.ts` and extend the import on line 3 to include `missChanceFor`, plus a type-only `Player` import:

```ts
// tests/combat.test.ts — replace the import on line 3:
import { attackDamage, attackableTargets, chooseBestAttack, counterAttackDamage, MISS_CHANCE, missChanceFor, performAttack, rollAttackDamage, MIN_DAMAGE, tradeIsFavorable } from '../src/game/combat';
import type { Player } from '../src/game/players';
```

Append after the existing `describe('miss', ...)` block (which ends at line 330):

```ts
describe('science miss chance', () => {
  it('missChanceFor returns 0.05 with Science and 0.1 without', () => {
    expect(missChanceFor({ skills: ['science'] } as unknown as Player)).toBe(0.05);
    expect(missChanceFor({ skills: [] } as unknown as Player)).toBe(0.1);
  });

  it('honours an explicit miss chance lower than the default', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const before = target.unit!.hp;
    const result = performAttack(map, attacker, target, () => 0.04, 0.05);
    expect(result.missed).toBe(true);
    expect(result.attackerDamage).toBe(0);
    expect(target.unit!.hp).toBe(before);
  });

  it('hits when an explicit miss chance is not exceeded', () => {
    const map = makeMap();
    const attacker = map.tiles[0]!.unit!;
    const target = map.tiles[1]!;
    const result = performAttack(map, attacker, target, () => 0.08, 0.05);
    expect(result.missed).toBe(false);
    expect(result.attackerDamage).toBe(20);
    expect(target.unit!.hp).toBe(30);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/combat.test.ts`
Expected: FAIL — `missChanceFor is not defined` / type error on the extra `performAttack` argument.

- [ ] **Step 3: Implement in `src/game/combat.ts`**

Add imports after the existing `import { isExploredFor } from './explore';`:

```ts
import { hasSkill } from './skills';
import type { Player } from './players';
```

Change the constant block (currently line 16) to:

```ts
export const MISS_CHANCE = 0.1;
export const SCIENCE_MISS_CHANCE = 0.05;
export const MIN_DAMAGE = 10;

export function missChanceFor(player: Player): number {
  return hasSkill(player, 'science') ? SCIENCE_MISS_CHANCE : MISS_CHANCE;
}
```

Change the `performAttack` signature and its miss check:

```ts
export function performAttack(
  map: GameMap,
  attacker: Unit,
  target: MapTile,
  rng: () => number = Math.random,
  missChance: number = MISS_CHANCE,
): AttackResult {
  const targetUnit = target.unit!;
  const attackerTile = map.tiles.find((t) => t.unit === attacker);

  if (rng() < missChance) {
```

Everything else in the function body stays identical.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/combat.test.ts`
Expected: PASS (all existing + new).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: add science-aware attack miss chance in combat"
```

---

### Task 2: Science skill description

**Files:**
- Modify: `src/game/skills.ts:94-100`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `SKILLS.science.description` reads `'Allows advanced research. Cuts your attack miss chance to 5%.'`

- [ ] **Step 1: Write the failing test**

Append inside the top-level `describe('skills', ...)` in `tests/skills.test.ts` (after the `'scales the cost...'` block):

```ts
  it('science description mentions the reduced attack miss chance', () => {
    expect(SKILLS.science.description).toContain('5%');
    expect(SKILLS.science.description).toContain('miss');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL — description is `'Allows advanced research.'`.

- [ ] **Step 3: Implement the description change**

In `src/game/skills.ts`, change the `science` entry's description:

```ts
  science: {
    id: 'science',
    name: 'Science',
    level: 1,
    parent: null,
    description: 'Allows advanced research. Cuts your attack miss chance to 5%.',
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/skills.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/skills.ts tests/skills.test.ts
git commit -m "feat: describe science 5% attack miss chance effect"
```

---

### Task 3: Wire Science miss chance through the simulator

**Files:**
- Modify: `src/game/simulator.ts:4, 251`
- Test: `tests/simulator.test.ts`

**Interfaces:**
- Consumes: `missChanceFor(player: Player): number` from Task 1.
- Produces: human + AI attacks through `doAttack` use the attacker's own miss chance; pirate attacks stay at the 10% default.

- [ ] **Step 1: Write the failing tests**

Append a new top-level describe to `tests/simulator.test.ts`:

```ts
describe('science miss chance in the simulator', () => {
  function setup(hasScience: boolean): { sim: Simulator; map: ReturnType<typeof makeTestMap> } {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('att', 0, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.unit = makeUnit('def', 1, 'warrior', 0, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    if (hasScience) players[0]!.skills.push('science');
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.08 });
    sim.startGame();
    sim.drainEvents();
    return { sim, map };
  }

  it('without science a 0.08 attack roll misses', () => {
    const { sim } = setup(false);
    expect(sim.applyCommand({ type: 'attack', unitId: 'att', q: 0, r: 1 })).toBe(true);
    const attack = sim.drainEvents().find((e) => e.type === 'attack');
    expect((attack as { missed: boolean }).missed).toBe(true);
  });

  it('with science the same 0.08 attack roll hits', () => {
    const { sim, map } = setup(true);
    expect(sim.applyCommand({ type: 'attack', unitId: 'att', q: 0, r: 1 })).toBe(true);
    const attack = sim.drainEvents().find((e) => e.type === 'attack');
    expect((attack as { missed: boolean }).missed).toBe(false);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(30);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/simulator.test.ts`
Expected: FAIL — both attacks use the 10% chance, so the 0.08 roll misses in both cases (the Science case expects a hit).

- [ ] **Step 3: Implement in `src/game/simulator.ts`**

Change the import on line 4 from:

```ts
import { attackableTargets, performAttack } from './combat';
```

to:

```ts
import { attackableTargets, missChanceFor, performAttack } from './combat';
```

Change the `doAttack` call to `performAttack` (line 251) from:

```ts
    const result = performAttack(this.map, attacker, target, this.rng);
```

to:

```ts
    const result = performAttack(this.map, attacker, target, this.rng, missChanceFor(attackerPlayer));
```

`attackerPlayer` is already defined earlier in the same method (line 243: `const attackerPlayer = this.players[attacker.owner]!;`). The `pirateAttack` call site keeps its default 10% chance.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/simulator.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/simulator.ts tests/simulator.test.ts
git commit -m "feat: apply science miss chance to simulator attacks"
```

---

### Task 4: "Disable tips" setting

**Files:**
- Modify: `src/storage/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces:
  - `GameSettings.disableTips: boolean` (default `false`).
  - `export function tipsDisabled(): boolean`
  - `export function setTipsDisabled(disabled: boolean): void`

- [ ] **Step 1: Write the failing tests**

Update `tests/settings.test.ts`:
1. Add `setTipsDisabled`, `tipsDisabled` to the import from `'../src/storage/settings'`.
2. On line 33 the existing round-trip test passes a full settings object; add the new required field: `saveSettings({ attackConfirmation: false, aiDifficulty: 'normal', disableTips: false });`.
3. Append a new describe:

```ts
describe('Disable tips setting', () => {
  it('defaults to tips enabled', () => {
    fakeStorage();
    expect(loadSettings().disableTips).toBe(false);
    expect(tipsDisabled()).toBe(false);
  });

  it('round-trips a disabled-tips value', () => {
    fakeStorage();
    setTipsDisabled(true);
    expect(tipsDisabled()).toBe(true);
    setTipsDisabled(false);
    expect(tipsDisabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL — `disableTips` not on `GameSettings`/defaults, helpers undefined.

- [ ] **Step 3: Implement in `src/storage/settings.ts`**

Change the interface, defaults, and add helpers:

```ts
export interface GameSettings {
  attackConfirmation: boolean;
  aiDifficulty: AiDifficulty;
  disableTips: boolean;
}

const DEFAULTS: GameSettings = {
  attackConfirmation: true,
  aiDifficulty: DEFAULT_AI_DIFFICULTY,
  disableTips: false,
};
```

Append after `setAttackConfirmation`:

```ts
export function tipsDisabled(): boolean {
  return loadSettings().disableTips;
}

export function setTipsDisabled(disabled: boolean): void {
  saveSettings({ ...loadSettings(), disableTips: disabled });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/storage/settings.ts tests/settings.test.ts
git commit -m "feat: add disable tips setting"
```

---

### Task 5: "Disable tips" checkbox in the Settings panel

**Files:**
- Modify: `src/ui/screens/StartScreen.ts:5, 52-106`

**Interfaces:**
- Consumes: `loadSettings()`, `setTipsDisabled(...)` from Task 4.
- Produces: a "Disable tips" row in the main-menu Settings modal (card grows from 250 to 294 px tall; Close moves from y 188 to 232).

- [ ] **Step 1: (No failing test — UI wiring; verify by typecheck + manual smoke)**

There is no existing test asserting Settings-panel internals (`tests/startScreen.test.ts` only checks background images). Verify current behaviour first:

Run: `npx vitest run tests/startScreen.test.ts`
Expected: PASS (before change).

- [ ] **Step 2: Edit the import line**

In `src/ui/screens/StartScreen.ts` change line 5 from:

```ts
import { loadSettings, setAiDifficulty, setAttackConfirmation } from '../../storage/settings';
```

to:

```ts
import { loadSettings, setAiDifficulty, setAttackConfirmation, setTipsDisabled } from '../../storage/settings';
```

- [ ] **Step 3: Grow the card and shift Close**

In the `SettingsPanel` constructor:
- change `const cardH = 250;` to `const cardH = 294;`
- change the Close button position from `close.position.set(cardW / 2 - 70, 188);` to `close.position.set(cardW / 2 - 70, 232);`

- [ ] **Step 4: Add the "Disable tips" row**

Insert this block between the AI-difficulty buttons loop and `const close = new Button(...)`:

```ts
    const tipsLabel = makeLabel('Disable tips', { fontSize: 16, fill: 0xeeeeee });
    let tipsOn = loadSettings().disableTips;
    const applyTips = (value: boolean): void => {
      tipsOn = value;
      setTipsDisabled(value);
      tipsCheckbox.setChecked(value);
    };
    const tipsCheckbox = makeCheckbox(tipsOn, applyTips);
    tipsLabel.position.set(24, 162 - tipsLabel.height / 2);
    tipsCheckbox.el.position.set(cardW - 24 - 22, 162 - 11);
    tipsLabel.eventMode = 'static';
    tipsLabel.cursor = 'pointer';
    tipsLabel.on('pointertap', () => applyTips(!tipsOn));
    card.addChild(tipsLabel, tipsCheckbox.el);
```

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/startScreen.test.ts` — PASS.
Run: `npm run typecheck` — no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/StartScreen.ts
git commit -m "feat: add disable tips checkbox to the settings panel"
```

---

### Task 6: Shared skills-button layout anchor

**Files:**
- Modify: `src/ui/layout.ts`, `src/ui/hud/HudSkills.ts`

**Interfaces:**
- Produces:
  - `export const SKILLS_BUTTON_SIZE = 48;`
  - `export const TOOLBAR_SIDE_PADDING = 12;`
  - `export const TURN_BAR_GAP = 6;`
  - `export function skillsButtonPosition(screenWidth: number, screenHeight: number): { x: number; y: number }`
- Consumed by: `HudSkills` (this task) and `HudTips` (Task 8).

- [ ] **Step 1: Add the shared anchor in `src/ui/layout.ts`**

Replace the file body with:

```ts
export const TOOLBAR_HEIGHT = 64;
export const TURN_BAR_HEIGHT = 24;
export const TOOLBAR_SIDE_PADDING = 12;
export const SKILLS_BUTTON_SIZE = 48;
export const TURN_BAR_GAP = 6;

/** Top-left of the Skills button, which HudSkills and the tip box both anchor to. */
export function skillsButtonPosition(screenWidth: number, screenHeight: number): { x: number; y: number } {
  return {
    x: screenWidth - TOOLBAR_SIDE_PADDING - SKILLS_BUTTON_SIZE,
    y: screenHeight - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT - TURN_BAR_GAP - SKILLS_BUTTON_SIZE,
  };
}
```

- [ ] **Step 2: Refactor `HudSkills` to use it**

In `src/ui/hud/HudSkills.ts`:
- Delete the local constants block:

```ts
const BUTTON_SIZE = 48;
const TURN_BAR_GAP = 6;
const TOOLBAR_SIDE_PADDING = 12;
```

- Change the imports to:

```ts
import { SKILLS_BUTTON_SIZE, skillsButtonPosition } from '../layout';
```

- In `mount`, the button creation keeps `size: 48` (leave as-is).
- Replace the `layout` method body with:

```ts
  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = skillsButtonPosition(this.host.app.screen.width, this.host.app.screen.height);
    this.el.position.set(pos.x, pos.y);
  };
```

- [ ] **Step 3: Run the existing placement test**

Run: `npx vitest run tests/hudSkills.test.ts`
Expected: PASS — the computed position is unchanged (`x = width - 12 - 48`, `y = height - 64 - 24 - 6 - 48`).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ui/layout.ts src/ui/hud/HudSkills.ts
git commit -m "refactor: share skills button layout anchor"
```

---

### Task 7: Tips copy and scheduler (pure module)

**Files:**
- Create: `src/ui/hud/tips.ts`
- Test: `tests/tips.test.ts`

**Interfaces:**
- Produces:
  - `export const TIP_TEXTS: readonly string[]` (the five verbatim strings).
  - `export interface TipsProgress { order: number[]; pointer: number; closedAtTurn: number | null }`
  - `export function initialTipsProgress(rng: () => number = Math.random): TipsProgress`
  - `export function tipsDueTurn(progress: TipsProgress): number`
  - `export function isTipsExhausted(progress: TipsProgress): boolean`
  - `export function currentTipText(progress: TipsProgress): string | null`
- Consumed by: `HudTips` (Task 8).

- [ ] **Step 1: Write the failing tests**

Create `tests/tips.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  TIP_TEXTS,
  currentTipText,
  initialTipsProgress,
  isTipsExhausted,
  tipsDueTurn,
} from '../src/ui/hud/tips';

describe('tips module', () => {
  it('defines the five tip strings', () => {
    expect(TIP_TEXTS).toHaveLength(5);
    expect(TIP_TEXTS[0]).toBe('Attacks can miss. Open the Science skill to make your attacks more precise.');
    expect(TIP_TEXTS[4]).toBe('Build mines on mountains to gather stone and ore — you need them to upgrade villages.');
  });

  it('uses the rng to shuffle the display order', () => {
    const p = initialTipsProgress(() => 0);
    expect(p.order).toEqual([1, 2, 3, 4, 0]);
  });

  it('is due at turn 3 before anything has been closed', () => {
    expect(tipsDueTurn(initialTipsProgress(() => 0))).toBe(3);
  });

  it('is due two turns after the last close', () => {
    const p = initialTipsProgress(() => 0);
    p.closedAtTurn = 7;
    expect(tipsDueTurn(p)).toBe(9);
  });

  it('reports the current tip until it is exhausted', () => {
    const p = initialTipsProgress(() => 0);
    expect(isTipsExhausted(p)).toBe(false);
    expect(currentTipText(p)).toBe(TIP_TEXTS[1]!);
    p.pointer = p.order.length;
    expect(isTipsExhausted(p)).toBe(true);
    expect(currentTipText(p)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tips.test.ts`
Expected: FAIL — module `tips` does not exist.

- [ ] **Step 3: Create `src/ui/hud/tips.ts`**

```ts
export const TIP_TEXTS: readonly string[] = [
  'Attacks can miss. Open the Science skill to make your attacks more precise.',
  'Open the Roads skill to connect villages and move your units faster.',
  'Open the Navigation skill to turn units into ships and sail the seas.',
  'Beware: pirates can capture your ships.',
  'Build mines on mountains to gather stone and ore — you need them to upgrade villages.',
];

export interface TipsProgress {
  /** Indices into `TIP_TEXTS` in the per-game random display order. */
  order: number[];
  /** Position in `order` of the next tip to show. */
  pointer: number;
  /** Game turn on which the most recent tip was closed (null until the first close). */
  closedAtTurn: number | null;
}

export function initialTipsProgress(rng: () => number = Math.random): TipsProgress {
  const order = TIP_TEXTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return { order, pointer: 0, closedAtTurn: null };
}

export function tipsDueTurn(progress: TipsProgress): number {
  return progress.closedAtTurn === null ? 3 : progress.closedAtTurn + 2;
}

export function isTipsExhausted(progress: TipsProgress): boolean {
  return progress.pointer >= progress.order.length;
}

export function currentTipText(progress: TipsProgress): string | null {
  if (isTipsExhausted(progress)) return null;
  return TIP_TEXTS[progress.order[progress.pointer]!]!;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tips.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/hud/tips.ts tests/tips.test.ts
git commit -m "feat: add in-game tips content and scheduler module"
```

---

### Task 8: HudTips widget and GameScreen mount

**Files:**
- Create: `src/ui/hud/HudTips.ts`
- Modify: `src/ui/screens/GameScreen.ts`
- Test: `tests/hudTips.test.ts`

**Interfaces:**
- Consumes:
  - `tipsDisabled()` from Task 4.
  - `SKILLS_BUTTON_SIZE`, `skillsButtonPosition` from Task 6.
  - `TIP_TEXTS`, `TipsProgress`, `initialTipsProgress`, `tipsDueTurn`, `isTipsExhausted`, `currentTipText` from Task 7.
- Produces: a `Widget` whose box is visible only during the local player's own turn once a tip is due; a close (`✕`) click advances the scheduler.

- [ ] **Step 1: Write the failing widget tests**

Create `tests/hudTips.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { Text } from 'pixi.js';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { useGameStore } from '../src/store/gameStore';
import { HudTips } from '../src/ui/hud/HudTips';
import { TIP_TEXTS } from '../src/ui/hud/tips';
import { storageService } from '../src/storage/storageService';
import { type UIHost } from '../src/ui/host';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudTips', () => {
  let host: UIHost;
  let root: Container;
  let tips: HudTips | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    host = makeHost();
    root = new Container();
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      localPlayerIndex: 0,
      gameOver: false,
      texturesLoading: false,
    });
  });

  afterEach(() => {
    tips?.destroy();
    tips = null;
    vi.restoreAllMocks();
  });

  function startGame(turn: number, current = 0): void {
    useGameStore.setState({
      screen: 'game',
      players: buildPlayers(Tribe.Cats, 1, new SeededRandom(1)),
      localPlayerIndex: 0,
      currentPlayerIndex: current,
      turn,
      gameOver: false,
      texturesLoading: false,
    });
  }

  const box = (): Container => (tips as unknown as { el: Container }).el!;
  const textOf = (): string => (tips as unknown as { text: Text }).text!.text;

  it('shows nothing before turn 3', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    expect(box().visible).toBe(false);
  });

  it('shows a tip on the local turn once the game reaches turn 3', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    startGame(3);
    expect(box().visible).toBe(true);
    expect(TIP_TEXTS).toContain(textOf());
  });

  it('hides during another players turn and shows the same unclosed tip again on return', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    startGame(3);
    const first = textOf();
    startGame(3, 1);
    expect(box().visible).toBe(false);
    startGame(3, 0);
    expect(box().visible).toBe(true);
    expect(textOf()).toBe(first);
  });

  it('closing hides the tip and the next one waits two more turns', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    startGame(3);
    const first = textOf();
    (tips as unknown as { cross: Text }).cross!.emit('pointertap');
    expect(box().visible).toBe(false);
    startGame(4);
    expect(box().visible).toBe(false);
    startGame(5);
    expect(box().visible).toBe(true);
    expect(textOf()).not.toBe(first);
  });

  it('shows nothing when tips are disabled in settings', () => {
    vi.spyOn(storageService, 'getItem').mockReturnValue(
      JSON.stringify({ attackConfirmation: true, aiDifficulty: 'normal', disableTips: true }),
    );
    startGame(3);
    tips = new HudTips();
    tips.mount(host, root);
    expect(box().visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/hudTips.test.ts`
Expected: FAIL — module `HudTips` does not exist.

- [ ] **Step 3: Create `src/ui/hud/HudTips.ts`**

```ts
import { Container, Graphics } from 'pixi.js';
import type { Text } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { tipsDisabled } from '../../storage/settings';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { SKILLS_BUTTON_SIZE, skillsButtonPosition } from '../layout';
import { currentTipText, initialTipsProgress, isTipsExhausted, tipsDueTurn, type TipsProgress } from './tips';

const TEXT_SIZE = 12;
const PAD_X = 10;
const PAD_Y = 8;
const CROSS_SIZE = 13;
const CROSS_GAP = 10;
const TIP_GAP = 8;
const WRAP_WIDTH = 240;

export class HudTips implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private bg: Graphics | null = null;
  private text: Text | null = null;
  private cross: Text | null = null;
  private boxW = 0;
  private boxH = 0;
  private progress: TipsProgress = initialTipsProgress();
  private pending: string | null = null;
  private shown: string | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.progress = initialTipsProgress();
    const el = new Container();
    const bg = new Graphics();
    const text = makeLabel('', { fontSize: TEXT_SIZE, fill: 0xffffff, wordWrap: true, wordWrapWidth: WRAP_WIDTH });
    text.anchor.set(0, 0.5);
    const cross = makeLabel('\u2715', { fontSize: CROSS_SIZE, fill: 0xffffff });
    cross.anchor.set(0.5, 0.5);
    cross.eventMode = 'static';
    cross.cursor = 'pointer';
    cross.on('pointertap', this.close);
    el.addChild(bg, text, cross);
    el.visible = false;
    root.addChild(el);
    this.el = el;
    this.bg = bg;
    this.text = text;
    this.cross = cross;
    this.refresh();
    this.unsub = useGameStore.subscribe(() => this.refresh());
    this.onResize = () => this.refresh();
    window.addEventListener('resize', this.onResize);
  }

  private refresh = (): void => {
    if (!this.el) return;
    const s = useGameStore.getState();
    const active =
      s.screen === 'game' &&
      !s.gameOver &&
      !s.texturesLoading &&
      s.players.length > s.localPlayerIndex &&
      s.currentPlayerIndex === s.localPlayerIndex &&
      !tipsDisabled();
    if (!active) {
      this.el.visible = false;
      this.shown = null;
      return;
    }
    if (this.pending === null) {
      if (isTipsExhausted(this.progress) || s.turn < tipsDueTurn(this.progress)) {
        this.el.visible = false;
        this.shown = null;
        return;
      }
      // currentTipText is non-null here because the progress is not exhausted.
      this.pending = currentTipText(this.progress)!;
    }
    this.render(this.pending);
  };

  private render(text: string): void {
    if (!this.el || !this.bg || !this.text || !this.cross) return;
    if (this.shown === text && this.el.visible) return;
    this.text.text = text;
    this.boxW = PAD_X + this.text.width + CROSS_GAP + this.cross.width + PAD_X;
    this.boxH = Math.max(this.text.height, this.cross.height) + PAD_Y * 2;
    this.bg.clear().roundRect(0, 0, this.boxW, this.boxH, 6).fill({ color: 0x000000, alpha: 0.92 });
    this.text.position.set(PAD_X, this.boxH / 2);
    this.cross.position.set(PAD_X + this.text.width + CROSS_GAP + this.cross.width / 2, this.boxH / 2);
    this.layout();
    this.el.visible = true;
    this.shown = text;
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = skillsButtonPosition(this.host.app.screen.width, this.host.app.screen.height);
    const x = Math.max(4, pos.x - TIP_GAP - this.boxW);
    const y = pos.y + SKILLS_BUTTON_SIZE / 2 - this.boxH / 2;
    this.el.position.set(x, y);
  };

  private close = (): void => {
    if (!this.el) return;
    this.progress.closedAtTurn = useGameStore.getState().turn;
    this.progress.pointer += 1;
    this.pending = null;
    this.shown = null;
    this.el.visible = false;
  };

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.bg = null;
    this.text = null;
    this.cross = null;
    this.host = null;
  }
}
```

Note: the cross glyph is the multiplication sign `✕` (U+2715) in both the widget and, if you copy/paste, the tests; the tests never assert the glyph, only that the cross emits `pointertap`.

- [ ] **Step 4: Mount the widget in `GameScreen`**

In `src/ui/screens/GameScreen.ts`:
- add the import with the other HUD imports:

```ts
import { HudTips } from '../hud/HudTips';
```

- add `new HudTips(),` to the widget list, after `new HudToolbar(),`:

```ts
      new HudToolbar(),
      new HudTips(),
```

(Order within the list controls draw order; placing `HudTips` last keeps the tip above the other HUD content.)

- [ ] **Step 5: Run the widget tests to verify they pass**

Run: `npx vitest run tests/hudTips.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the wider suite and typecheck**

Run: `npm test`
Expected: PASS (in particular `gameScreen.test.ts` still mounts fine).
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/hud/HudTips.ts src/ui/screens/GameScreen.ts tests/hudTips.test.ts
git commit -m "feat: show onboarding tips next to the skills button"
```

---

### Task 9: Document the changes in GAME.md

**Files:**
- Modify: `GAME.md`

**Interfaces:**
- Consumes: the behaviour implemented in Tasks 1–3 (miss chance) and the Science description from Task 2.

- [ ] **Step 1: Update the attack rule**

In `GAME.md`, in the "Unit actions" → **Attack** bullet (line ~82-87), after `Damage = round(attack × current hp / max hp).` the text currently reads:

```
   Each
   attack has a 10% chance to miss, dealing no damage (the attack still counts as used).
```

Change that sentence to:

```
   Each attack has a 10% chance to miss (5% if the attacker's owner has opened Science), dealing
   no damage (the attack still counts as used).
```

Keep the rest of the bullet unchanged.

- [ ] **Step 2: Update the Science skill row**

In `GAME.md`, in the Skills table, change the Science row from:

```
| Science       | 1     | —        | Allows advanced research                                                                |
```

to:

```
| Science       | 1     | —        | Allows advanced research; cuts the owner's attack miss chance to 5%                     |
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck` — no errors (GAME.md is documentation; this is a sanity check that nothing else broke).
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add GAME.md
git commit -m "docs: document science miss chance effect"
```

---

## Verification (run once after Task 9)

Run from the feature branch root:

```bash
npm test
npm run typecheck
```

Expected: all tests pass, typecheck clean.

Manual smoke check (via `npm run dev`): start a single-player game, play to turn 3, confirm a small black box with white text + ✕ appears to the left of the Skills button at the start of your turn; close it, confirm the next tip waits until two turns later; check Settings → "Disable tips" hides future tips; open Science and confirm attacks visibly miss far less often.
