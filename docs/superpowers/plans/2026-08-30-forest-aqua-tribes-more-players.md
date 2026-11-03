# Forest & Aqua Tribes + More Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two playable tribes — Forest people (code `forest`) and Aqua people (code `aqua`) — and raise the max player count from 4 to 6 in single-player and multiplayer.

**Architecture:** Tribes are defined in `src/game/tribes.ts` (`Tribe` enum + `TRIBES` array) with colors in `src/config.ts`. Texture paths are derived from a new `code` field on each tribe instead of `name.toLowerCase()`. Player caps live in `players.ts`, `mapGen.ts` (`mapRadiusFor`), `SetupScreen.ts` and `LobbyScreen.ts`. Texture assets already exist in `public/textures/` (`forest-*`, `aqua-*`).

**Tech Stack:** TypeScript, PixiJS, React/Zustand, Vite, Vitest.

## Global Constraints

- Append `Forest` and `Aqua` to the `Tribe` enum **after** existing values (numeric ids must stay stable: `Cats === 3`, `Forest === 4`, `Aqua === 5`).
- Display names are `Forest people` and `Aqua people`; codes are `forest` and `aqua`.
- Colors: Forest `0x47b220`, Aqua `0x4da2da`.
- New max player counts: single-player 1–5 enemies (max 6), multiplayer total 2–6.
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: Tribe data model (enum, codes, colors)

**Files:**
- Modify: `src/config.ts`
- Modify: `src/game/tribes.ts`
- Create: `tests/tribes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Tribe.Forest` and `Tribe.Aqua` enum members; `TribeInfo` gains `code: string`; `TRIBES` has 6 entries. Later tasks rely on `TRIBES[i].code`.

- [ ] **Step 1: Write the failing test**

Create `tests/tribes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TRIBES, Tribe } from '../src/game/tribes';

describe('TRIBES', () => {
  it('keeps existing enum ids stable and adds forest/aqua last', () => {
    expect(Tribe.Cats).toBe(3);
    expect(Tribe.Forest).toBe(4);
    expect(Tribe.Aqua).toBe(5);
  });

  it('defines six tribes with unique ids', () => {
    expect(TRIBES).toHaveLength(6);
    expect(new Set(TRIBES.map((t) => t.id)).size).toBe(6);
  });

  it('assigns codes in order', () => {
    expect(TRIBES.map((t) => t.code)).toEqual(['cats', 'villagers', 'warriors', 'barbarians', 'forest', 'aqua']);
  });

  it('names and colors the new tribes', () => {
    const forest = TRIBES.find((t) => t.code === 'forest')!;
    const aqua = TRIBES.find((t) => t.code === 'aqua')!;
    expect(forest.name).toBe('Forest people');
    expect(forest.color).toBe(0x47b220);
    expect(aqua.name).toBe('Aqua people');
    expect(aqua.color).toBe(0x4da2da);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tribes.test.ts`
Expected: FAIL (type errors / `Tribe.Forest` undefined).

- [ ] **Step 3: Implement the data model**

`src/config.ts` — add to `TRIBE_COLORS`:

```ts
  Forest: 0x47b220,
  Aqua: 0x4da2da,
```

`src/game/tribes.ts` — replace the whole file with:

```ts
import { TRIBE_COLORS } from '../config';

export enum Tribe {
  Villagers,
  Warriors,
  Barbarians,
  Cats,
  Forest,
  Aqua,
}

export interface TribeInfo {
  id: Tribe;
  name: string;
  code: string;
  color: number;
}

export const TRIBES: TribeInfo[] = [
  { id: Tribe.Cats, name: 'Cats', code: 'cats', color: TRIBE_COLORS.Cats },
  { id: Tribe.Villagers, name: 'Villagers', code: 'villagers', color: TRIBE_COLORS.Villagers },
  { id: Tribe.Warriors, name: 'Warriors', code: 'warriors', color: TRIBE_COLORS.Warriors },
  { id: Tribe.Barbarians, name: 'Barbarians', code: 'barbarians', color: TRIBE_COLORS.Barbarians },
  { id: Tribe.Forest, name: 'Forest people', code: 'forest', color: TRIBE_COLORS.Forest },
  { id: Tribe.Aqua, name: 'Aqua people', code: 'aqua', color: TRIBE_COLORS.Aqua },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tribes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/game/tribes.ts tests/tribes.test.ts
git commit -m "feat: add Forest and Aqua tribes with code field"
```

---

### Task 2: Unit texture files for the new tribes

**Files:**
- Modify: `src/game/units.ts:31-36`
- Modify: `tests/units.test.ts:30-39`

**Interfaces:**
- Consumes: `Tribe.Forest`, `Tribe.Aqua` from Task 1.
- Produces: `UNIT_IMAGE_FILES[Tribe.Forest]` and `UNIT_IMAGE_FILES[Tribe.Aqua]` records.

- [ ] **Step 1: Write the failing test**

In `tests/units.test.ts`, extend the `UNIT_IMAGE_FILES` expectation (`expect(UNIT_IMAGE_FILES).toEqual({...})`) with two more entries:

```ts
      [Tribe.Forest]: { warrior: 'forest-warrior.png', rider: 'forest-rider.png', archer: 'forest-archer.png', swordsman: 'forest-swordsman.png', shield: 'forest-shield.png' },
      [Tribe.Aqua]: { warrior: 'aqua-warrior.png', rider: 'aqua-rider.png', archer: 'aqua-archer.png', swordsman: 'aqua-swordsman.png', shield: 'aqua-shield.png' },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- units.test.ts`
Expected: FAIL (received object missing Forest/Aqua keys).

- [ ] **Step 3: Implement the texture map**

`src/game/units.ts` — add to `UNIT_IMAGE_FILES`:

```ts
  [Tribe.Forest]: { warrior: 'forest-warrior.png', rider: 'forest-rider.png', archer: 'forest-archer.png', swordsman: 'forest-swordsman.png', shield: 'forest-shield.png' },
  [Tribe.Aqua]: { warrior: 'aqua-warrior.png', rider: 'aqua-rider.png', archer: 'aqua-archer.png', swordsman: 'aqua-swordsman.png', shield: 'aqua-shield.png' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/units.ts tests/units.test.ts
git commit -m "feat: map Forest and Aqua unit textures"
```

---

### Task 3: Derive icon/ship paths from tribe code

**Files:**
- Modify: `src/render/textureFactory.ts:316`
- Modify: `src/ui/screens/SetupScreen.ts:51`
- Modify: `src/ui/screens/LobbyScreen.ts:211,374`
- Modify: `tests/lobbyHost.test.ts`

**Interfaces:**
- Consumes: `TribeInfo.code` from Task 1.
- Produces: tribe icons resolve to `forest-icon.png`/`aqua-icon.png`; ship textures resolve to `forest-ship*.png`/`aqua-ship*.png`.

- [ ] **Step 1: Write the failing test**

Append a new describe block to `tests/lobbyHost.test.ts` (after the existing ones). It mocks `Image` (same pattern as `tests/icon.test.ts`) so we can assert which icon files the host view requests:

```ts
class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

describe('LobbyScreen host tribe icons use tribe codes', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;
  let keyHandler: ((e: KeyboardEventLike) => void) | null;
  const originalImage = globalThis.Image;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    (globalThis as Record<string, unknown>).document = { activeElement: null };
    (globalThis as Record<string, unknown>).HTMLInputElement = class {};
    keyHandler = null;
    const win = (globalThis as { window: { addEventListener: (t: string, cb: unknown) => void; removeEventListener: (t: string, cb: unknown) => void } }).window;
    win.addEventListener = (t, cb) => { if (t === 'keydown') keyHandler = cb as (e: KeyboardEventLike) => void; };
    win.removeEventListener = () => {};

    host = makeHost();
    screen = new LobbyScreen();
    screen.mount(host);
    (screen as unknown as { view: string }).view = 'host';
    (screen as unknown as { render: () => void }).render();
  });

  afterEach(() => {
    screen.destroy();
    vi.restoreAllMocks();
    (globalThis as { Image?: unknown }).Image = originalImage;
  });

  it('requests the code-based icon files for all tribes', () => {
    const srcs = FakeImage.instances.map((i) => i.src);
    expect(srcs.some((s) => s.includes('cats-icon.png'))).toBe(true);
    expect(srcs.some((s) => s.includes('forest-icon.png'))).toBe(true);
    expect(srcs.some((s) => s.includes('aqua-icon.png'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lobbyHost.test.ts`
Expected: FAIL (no `forest-icon.png`/`aqua-icon.png` requested; `Forest people-icon.png` requested instead).

- [ ] **Step 3: Implement the path switches**

`src/ui/screens/SetupScreen.ts:51`:

```ts
      const icon = makeIcon(`${t.code}-icon.png`, 60);
```

`src/ui/screens/LobbyScreen.ts:211`:

```ts
      const opt = makeTribeOption(t.name, `${t.code}-icon.png`, () => { this.tribe = t.id; this.render(); }, t.id === this.tribe);
```

`src/ui/screens/LobbyScreen.ts:374`:

```ts
      const opt = makeTribeOption(t.name, `${t.code}-icon.png`, () => {
```

`src/render/textureFactory.ts:316`:

```ts
    const base = tribe.code;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lobbyHost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/ui/screens/SetupScreen.ts src/ui/screens/LobbyScreen.ts tests/lobbyHost.test.ts
git commit -m "feat: derive tribe icon and ship paths from tribe code"
```

---

### Task 4: Raise player caps in players.ts

**Files:**
- Modify: `src/game/players.ts:19-48,50-89`
- Modify: `tests/players.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildPlayers` accepts 1–5 enemies (max 6 players); `buildMultiplayerPlayers` accepts total 2–6. Later tasks (map radius, screens) build on these.

- [ ] **Step 1: Write the failing test**

Update `tests/players.test.ts`:

In `buildMultiplayerPlayers` "throws for invalid totals" (line ~35-38), change the second assertion and add a 6-player case:

```ts
  it('throws for invalid totals', () => {
    expect(() => buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Villagers }], 0, new SeededRandom(1))).toThrow();
    expect(() => buildMultiplayerPlayers([{ name: 'A', tribe: Tribe.Villagers }], 6, new SeededRandom(1))).toThrow();
  });

  it('supports up to 6 players total', () => {
    const players = buildMultiplayerPlayers(
      [
        { name: 'A', tribe: Tribe.Villagers },
        { name: 'B', tribe: Tribe.Warriors },
      ],
      4,
      new SeededRandom(3),
    );
    expect(players).toHaveLength(6);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(6);
  });
```

In `buildPlayers` "throws for invalid enemy counts" (line ~70-73), change the second assertion and add a 5-enemy case:

```ts
  it('throws for invalid enemy counts', () => {
    expect(() => buildPlayers(Tribe.Villagers, 0, new SeededRandom(42))).toThrow();
    expect(() => buildPlayers(Tribe.Villagers, 6, new SeededRandom(42))).toThrow();
  });

  it('creates 6 players with distinct tribes for 5 enemies', () => {
    const players = buildPlayers(Tribe.Warriors, 5, new SeededRandom(42));
    expect(players).toHaveLength(6);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(6);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- players.test.ts`
Expected: FAIL (`buildMultiplayerPlayers` throws on total 6; `buildPlayers` throws on 5 enemies).

- [ ] **Step 3: Implement the new limits**

`src/game/players.ts` — in `buildPlayers`:

```ts
  if (enemyCount < 1 || enemyCount > 5) {
    throw new Error(`Enemy count must be between 1 and 5, got ${enemyCount}`);
  }
```

In `buildMultiplayerPlayers`:

```ts
  if (total < 2 || total > 6) {
    throw new Error(`Player total must be between 2 and 6, got ${total}`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- players.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/players.ts tests/players.test.ts
git commit -m "feat: allow up to 6 players and 5 enemies"
```

---

### Task 5: Map radius for 5 and 6 players

**Files:**
- Modify: `src/game/mapGen.ts:54-59`
- Modify: `tests/mapGen.test.ts:10-16`

**Interfaces:**
- Consumes: new player-count limits from Task 4.
- Produces: `mapRadiusFor(5) === 10`, `mapRadiusFor(6) === 11`, throws outside 2–6.

- [ ] **Step 1: Write the failing test**

In `tests/mapGen.test.ts` "chooses radius by player count":

```ts
    expect(mapRadiusFor(2)).toBe(7);
    expect(mapRadiusFor(3)).toBe(8);
    expect(mapRadiusFor(4)).toBe(9);
    expect(mapRadiusFor(5)).toBe(10);
    expect(mapRadiusFor(6)).toBe(11);
    expect(() => mapRadiusFor(1)).toThrow();
    expect(() => mapRadiusFor(7)).toThrow();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mapGen.test.ts`
Expected: FAIL (`mapRadiusFor(5)` throws).

- [ ] **Step 3: Implement the radius table**

`src/game/mapGen.ts`:

```ts
export function mapRadiusFor(playerCount: number): number {
  if (playerCount === 2) return Math.round(11 / 1.5);
  if (playerCount === 3) return Math.round(12 / 1.5);
  if (playerCount === 4) return Math.round(14 / 1.5);
  if (playerCount === 5) return Math.round(15 / 1.5);
  if (playerCount === 6) return Math.round(16 / 1.5);
  throw new Error(`Unsupported player count: ${playerCount}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mapGen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: map radius for 5 and 6 players"
```

---

### Task 6: Setup and multiplayer screens

**Files:**
- Modify: `src/ui/screens/SetupScreen.ts:11`
- Modify: `src/ui/screens/LobbyScreen.ts:163-235`
- Modify: `tests/lobbyHost.test.ts`

**Interfaces:**
- Consumes: new player-count limits from Task 4, `TRIBES.length` (6).
- Produces: single-player enemy options `[1,2,3,4,5]`; multiplayer humans `[2,3,4,5,6]` and AI `0..(6−humans)`.

- [ ] **Step 1: Write the failing test**

Update `tests/lobbyHost.test.ts`:

Line ~84 (inside "changes the value within the focused group"):

```ts
    const aiOpts = Array.from({ length: 7 - state().humans }, (_, i) => i);
```

Line ~110 (in "requires at least 2 human players"):

```ts
    expect(humanButtons.map((b) => texts(b as Container).find((t) => /^\d$/.test(t))).sort()).toEqual(['2', '3', '4', '5', '6']);
```

Lines ~158-161 (in "centers the human player and AI opponent buttons"):

```ts
    expect(humanButtons.length).toBe(5);
    expect(aiButtons.length).toBe(5);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lobbyHost.test.ts`
Expected: FAIL (only 3 human buttons; AI options still derived from `5 - humans`).

- [ ] **Step 3: Implement the screen changes**

`src/ui/screens/SetupScreen.ts:11`:

```ts
const ENEMY_OPTIONS = [1, 2, 3, 4, 5];
```

`src/ui/screens/LobbyScreen.ts` — define the human options once. In `changeGroup` (focus 1, line ~168-172):

```ts
    } else if (this.focus === 1) {
      const opts = [2, 3, 4, 5, 6];
      const i = opts.indexOf(this.humans);
      this.humans = opts[(i + dir + opts.length) % opts.length];
      this.aiCount = Math.min(this.aiCount, 7 - this.humans);
    } else if (this.focus === 2) {
      const maxAi = 7 - this.humans;
```

In `renderHost`, the human buttons block (lines ~219-224):

```ts
    const humanOpts = [2, 3, 4, 5, 6];
    const humanStart = cx - (humanOpts.length * 56 + (humanOpts.length - 1) * 4) / 2;
    humanOpts.forEach((n, i) => {
      const b = new Button({ label: String(n), width: 56, selected: n === this.humans, onClick: () => { this.humans = n; this.aiCount = Math.min(this.aiCount, 7 - n); this.render(); } });
      b.position.set(humanStart + i * 60, y + 126);
      this.root!.addChild(b);
    });
```

In `renderHost`, the AI count block (line ~229):

```ts
    const maxAi = 7 - this.humans;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lobbyHost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/SetupScreen.ts src/ui/screens/LobbyScreen.ts tests/lobbyHost.test.ts
git commit -m "feat: more enemies and multiplayer player options"
```

---

### Task 7: Update GAME.md

**Files:**
- Modify: `GAME.md`

- [ ] **Step 1: Edit the docs**

In the Multiplayer section (`GAME.md:17-21`), change "up to 4" to "up to 6":

```md
A player can host a room (at least 2 human players, up to 6) with optional AI opponents, or join a room by code.
```

In the Tribes section (`GAME.md:23-32`), extend the table:

```md
| Tribe         | Color   |
|---------------|---------|
| Cats          | pink    |
| Villagers     | brown   |
| Warriors      | red     |
| Barbarians    | gray    |
| Forest people | green   |
| Aqua people   | aqua    |
```

(Keep the two existing rows you see there; update `Warriors`/`Barbarians` descriptions only if they currently contradict the code — `0xd11515` is red and `0x424242` is gray.)

In the Map section (`GAME.md:167`), extend the radius list:

```md
- Hex grid. Radius depends on player count: 2 players → 8, 3 → 9, 4 → 10, 5 → 11, 6 → 12.
```

- [ ] **Step 2: Verify**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add GAME.md
git commit -m "docs: document Forest and Aqua tribes and 6-player games"
```

---

### Task 8: Full verification

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

- [ ] **Step 4: Verify new tribe textures are tracked**

Run: `git status`
Expected: `public/textures/forest-*` and `public/textures/aqua-*` files are untracked but present. Add them to the final commit:

```bash
git add public/textures/
git commit -m "feat: add Forest and Aqua tribe textures"
```

- [ ] **Step 5: Confirm nothing stray was left uncommitted**

Run: `git status`
Expected: clean working tree (no modified tracked files).
