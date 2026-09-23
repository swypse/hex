# Lobby Tribe Selection and Create Button Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the "Create room" button in the lobby host view, and make a joined (client) player see their own picked tribe highlighted with the selected blue border in the room view.

**Architecture:** Two small layout/selection changes in `src/ui/screens/LobbyScreen.ts`: the host view's Create room button moves to `cx - 120`, and `renderRoom()` computes the current player's own tribe id (`isHost ? hostTribeId : me?.tribeId`), keeps it in the available row, and highlights it.

**Tech Stack:** TypeScript, PixiJS, Zustand, Vite, Vitest.

## Global Constraints

- Create room button is 240px wide and must be centered on the screen center: `position.x = cx - 120`.
- In the room view, the current player's own tribe (host: `hostTribeId`; client: `me?.tribeId`) must stay in the available row and be highlighted with the blue border. The host's tribe remains visible in the row. A client that has not picked a tribe highlights nothing.
- The selected border is drawn by `makeTribeOption(name, icon, onClick, selected)` when `selected` is true (4px `0x5099ff` stroke on the circle).
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: Center the "Create room" button

**Files:**
- Modify: `src/ui/screens/LobbyScreen.ts`
- Test: `tests/lobbyHost.test.ts`

**Interfaces:**
- Consumes: the existing `Button` widget and `cx = this.host!.app.screen.width / 2` in `renderHost()`.
- Produces: `createBtn` positioned at `(cx - 120, y + 446)` in the host view.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('LobbyScreen host keyboard navigation', ...)` block (after the `places the back button as the last navigable button below create room` test):

```ts
  it('centers the create room button', () => {
    const root = (screen as unknown as { root: Container }).root!;
    const texts = (c: Container): string[] => (c as Container).children.filter((ch) => ch instanceof Text).map((ch) => String((ch as Text).text));
    const create = root.children.find((c) => texts(c as Container).includes('Create room')) as Container;
    expect(create).toBeDefined();
    expect(create.position.x).toBe(1280 / 2 - 120);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lobbyHost.test.ts`
Expected: FAIL — `create.position.x` is `1280 / 2 - 260`, not `1280 / 2 - 120`.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/screens/LobbyScreen.ts`, in `renderHost()`, change the Create room button position line from `cx - 260` to `cx - 120`:

```ts
    this.createBtn.position.set(cx - 120, y + 446);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lobbyHost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/LobbyScreen.ts tests/lobbyHost.test.ts
git commit -m "fix: center the create room button"
```

---

### Task 2: Client sees their own tribe selected in the room view

**Files:**
- Modify: `src/ui/screens/LobbyScreen.ts`
- Test: `tests/lobbyHost.test.ts`

**Interfaces:**
- Consumes: store fields `s.lobby` (a `LobbyState` with `role: 'host' | 'client'`, `players: LobbyPlayer[]`) and `s.myPeerId`; `Tribe` enum and `TRIBES` list from `./tribes`; `makeTribeOption` from `../kit/tribeOption`.
- Produces: in `renderRoom()`, a local `ownTribeId: Tribe | -1` used both to keep the current player's tribe in `available` and to pass as the `selected` flag.

- [ ] **Step 1: Write the failing test**

First update the import line at the top of `tests/lobbyHost.test.ts`:

```ts
import { TRIBES, Tribe } from '../src/game/tribes';
```

(The current line is `import { TRIBES } from '../src/game/tribes';`.)

Then append a new `describe` block at the end of `tests/lobbyHost.test.ts` (after the `LobbyScreen host tribe icons use tribe codes` block):

```ts
describe('LobbyScreen client room tribe selection', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    host = makeHost();
    screen = new LobbyScreen();
    screen.mount(host);
  });

  afterEach(() => {
    screen.destroy();
    useGameStore.setState({ lobby: null, myPeerId: '' });
    vi.restoreAllMocks();
  });

  const setClientRoom = (): void => {
    useGameStore.setState({
      lobby: {
        role: 'client',
        code: 'ABCDEF',
        mode: 'capture',
        totalPlayers: 2,
        aiCount: 0,
        players: [
          { peerId: 'host', name: 'Host', tribeId: Tribe.Cats, isHost: true, ready: true },
          { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, isHost: false, ready: true },
        ],
      },
      myPeerId: 'guest-1',
    });
    (screen as unknown as { render: () => void }).render();
  };

  const optionFor = (tribeName: string): Container =>
    ((screen as unknown as { root: Container }).root!).children.find((c) =>
      (c as Container).children.some((ch) => ch instanceof Text && String((ch as Text).text) === tribeName),
    ) as Container;

  const hasSelectedStroke = (opt: Container): boolean =>
    (opt.children.filter((c) => c instanceof Graphics) as Graphics[]).some(
      (g) => (g as unknown as { context?: { instructions?: { action: string }[] } }).context?.instructions?.some((i) => i.action === 'stroke') ?? false,
    );

  it("highlights the client's own tribe and not the host's", () => {
    setClientRoom();
    const clientOpt = optionFor('Warriors');
    const hostOpt = optionFor('Cats');
    expect(clientOpt).toBeDefined();
    expect(hostOpt).toBeDefined();
    expect(hasSelectedStroke(clientOpt)).toBe(true);
    expect(hasSelectedStroke(hostOpt)).toBe(false);
  });

  it('keeps the client’s picked tribe visible in the row', () => {
    setClientRoom();
    expect(optionFor('Warriors')).toBeDefined();
  });
});
```

Add `Graphics` to the pixi.js import at the top of the file:

```ts
import { Container, Graphics, Sprite, Text } from 'pixi.js';
```

(The current line is `import { Container, Sprite, Text } from 'pixi.js';`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lobbyHost.test.ts`
Expected: FAIL — `hasSelectedStroke(clientOpt)` is `false` (host's Cats tribe is highlighted instead), and `optionFor('Warriors')` is `undefined` (the client's tribe is filtered out of `available`).

- [ ] **Step 3: Write minimal implementation**

In `src/ui/screens/LobbyScreen.ts`, in `renderRoom()`, replace the two lines that build `available` and render the options (currently around lines 372-379):

```ts
    const hostTribeId = joined.find((p) => p.isHost)?.tribeId ?? -1;
    const ownTribeId = isHost ? hostTribeId : (me?.tribeId ?? -1);
    const available = TRIBES.filter((t) => !taken.has(t.id) || t.id === hostTribeId || t.id === ownTribeId);
    available.forEach((t, i) => {
      const opt = makeTribeOption(t.name, `${t.code}-icon.png`, () => {
        if (isHost) gameController.pickHostTribe(t.id);
        else gameController.pickClientTribe(t.id);
      }, t.id === ownTribeId);
      opt.el.position.set(cx - ((available.length - 1) / 2) * 140 + i * 140, y);
      this.root!.addChild(opt.el);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lobbyHost.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/LobbyScreen.ts tests/lobbyHost.test.ts
git commit -m "fix: highlight the joining player's own tribe in the room"
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
