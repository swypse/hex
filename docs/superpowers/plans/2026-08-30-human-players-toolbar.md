# Human Players Toolbar with Online/Offline Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-left toolbar on the multiplayer game screen showing each human player as a tribe-icon circle with their name, tribe name, and a green/red online/offline status dot, with the host tracking and broadcasting mid-game disconnects.

**Architecture:** Add an index-aligned `playersOnline: boolean[]` to the game store. The host marks a disconnected client offline in-game (keeping the entry and broadcasting a new `playersOnline` host message) while still removing pre-game disconnects from the lobby. A new `HudPlayers` widget (mounted in `GameScreen`) renders the toolbar from `s.players` + `s.playersOnline`.

**Tech Stack:** TypeScript, PixiJS, Zustand, Vite, Vitest.

## Global Constraints

- `playersOnline: boolean[]` is index-aligned with `s.players`; `true` = online. Toolbar reads `s.playersOnline[p.index]` (fallback `true`).
- Toolbar is visible only when `s.screen === 'game'` and `s.netMode !== 'single'`; shows human players only (`p.isHuman`).
- Status dot: green `0x2ecc71` (online) / red `0xe74c3c` (offline), radius 6, thin white stroke, overlapping the top-right of the tribe circle (radius 20).
- Lobby behavior unchanged: a disconnect with `playerIndex === null` removes the entry from `hostPlayers` and rebroadcasts the lobby. A mid-game disconnect (`playerIndex !== null`) keeps the entry, sets `online = false`, and broadcasts `{ type: 'playersOnline', online }`.
- Presence initializes to all-true at game start for both host and clients. Do NOT reset `playersOnline` on routine state syncs (an offline player must stay offline).
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: Store presence data

**Files:**
- Modify: `src/store/gameStore.ts`
- Test: `tests/gameStore.test.ts`

**Interfaces:**
- Produces:
  - `GameStore.playersOnline: boolean[]` (default `[]`)
  - `GameStore.setPlayersOnline(online: boolean[]): void`
  Later tasks consume both.

- [ ] **Step 1: Write the failing test**

Append to `tests/gameStore.test.ts` inside the `describe('gameStore', ...)` block (after the `setMyPeerId` test):

```ts
  it('setPlayersOnline updates playersOnline', () => {
    useGameStore.getState().setPlayersOnline([true, false, true]);
    expect(useGameStore.getState().playersOnline).toEqual([true, false, true]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gameStore.test.ts`
Expected: FAIL — `setPlayersOnline` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/store/gameStore.ts`, add to the `GameStore` interface:

```ts
  playersOnline: boolean[];
```

```ts
  setPlayersOnline: (online: boolean[]) => void;
```

Add the default value next to the other state defaults (e.g., after `myPeerId: ''`):

```ts
  playersOnline: [],
```

Add the setter implementation next to the other setters (e.g., after `setMyPeerId`):

```ts
  setPlayersOnline: (playersOnline) => set({ playersOnline }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gameStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/gameStore.ts tests/gameStore.test.ts
git commit -m "feat: track per-player online status in the store"
```

---

### Task 2: `playersOnline` host message

**Files:**
- Modify: `src/net/peerSession.ts`
- Test: `tests/peerSession.test.ts`

**Interfaces:**
- Consumes: the existing `HostMessage` union.
- Produces: `HostMessage` variant `{ type: 'playersOnline'; online: boolean[] }`. Task 3 broadcasts it; the client handler consumes it.

- [ ] **Step 1: Write the failing test**

In `tests/peerSession.test.ts`, extend the `ClientMessage and HostMessage survive JSON round-trip` test body (before its closing brace):

```ts
    const onlineMsg: HostMessage = { type: 'playersOnline', online: [true, false, true] };
    expect(JSON.parse(JSON.stringify(onlineMsg))).toEqual(onlineMsg);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- peerSession.test.ts`
Expected: FAIL — type error: object literal is not assignable to `HostMessage`.

- [ ] **Step 3: Write minimal implementation**

In `src/net/peerSession.ts`, extend the `HostMessage` union:

```ts
export type HostMessage =
  | { type: 'lobbyUpdate'; joined: LobbyPlayer[]; totalPlayers: number; aiCount: number }
  | { type: 'state'; state: GameStateSnapshot; playerIndex: number }
  | { type: 'events'; events: GameEvent[] }
  | { type: 'playersOnline'; online: boolean[] }
  | { type: 'error'; message: string };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- peerSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/peerSession.ts tests/peerSession.test.ts
git commit -m "feat: add playersOnline host message"
```

---

### Task 3: Host tracks mid-game disconnects and clients receive presence

**Files:**
- Modify: `src/controller/gameController.ts`
- Test: `tests/presence.test.ts` (new)

**Interfaces:**
- Consumes: `setPlayersOnline` (Task 1); `{ type: 'playersOnline'; online }` (Task 2).
- Produces: `gameController` handles presence — on mid-game client close it keeps the entry offline and broadcasts `playersOnline`; clients initialize to all-true on entering the game and apply `playersOnline` messages. Task 4 reads the store.

- [ ] **Step 1: Write the failing tests**

Create `tests/presence.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { makeTestMap } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';

type HostPlayerEntry = { peerId: string; name: string; tribeId: Tribe | null; playerIndex: number | null; ready: boolean; online: boolean };

const controller = gameController as unknown as {
  hostPlayers: HostPlayerEntry[];
  handleClientClosed: (peerId: string) => void;
  hostSession: { broadcast: (msg: unknown) => void } | null;
  hostConfig: { mode: 'capture' | 'turns30'; totalPlayers: number; aiCount: number } | null;
  hostName: string;
  hostTribe: Tribe | null;
  sim: Simulator | null;
};

describe('multiplayer presence', () => {
  const original = (gameController as unknown as {
    hostPlayers: HostPlayerEntry[];
    hostSession: unknown;
    hostConfig: unknown;
    hostName: string;
    hostTribe: Tribe | null;
    sim: unknown;
  });

  afterEach(() => {
    controller.hostPlayers = original.hostPlayers;
    controller.hostSession = original.hostSession as never;
    controller.hostConfig = original.hostConfig as never;
    controller.hostName = original.hostName;
    controller.hostTribe = original.hostTribe;
    controller.sim = original.sim as never;
    useGameStore.setState({ playersOnline: [], lobby: null, players: [] });
    vi.restoreAllMocks();
  });

  it('keeps a mid-game disconnect in the list, marks it offline, and broadcasts presence', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    controller.sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    useGameStore.setState({ players, playersOnline: players.map(() => true) });
    controller.hostPlayers = [
      { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, playerIndex: 1, ready: true, online: true },
    ];
    const broadcast = vi.fn();
    controller.hostSession = { broadcast };
    controller.handleClientClosed('guest-1');
    expect(controller.hostPlayers).toHaveLength(1);
    expect(controller.hostPlayers[0].online).toBe(false);
    expect(useGameStore.getState().playersOnline).toEqual([true, false]);
    expect(broadcast).toHaveBeenCalledWith({ type: 'playersOnline', online: [true, false] });
  });

  it('removes a disconnected player from the lobby list before the game starts', () => {
    useGameStore.setState({
      lobby: { role: 'host', code: 'ABC123', mode: 'capture', totalPlayers: 2, aiCount: 0, players: [] },
    });
    controller.hostConfig = { mode: 'capture', totalPlayers: 2, aiCount: 0 };
    controller.hostName = 'Host';
    controller.hostTribe = Tribe.Cats;
    controller.hostPlayers = [
      { peerId: 'guest-1', name: 'Guest', tribeId: Tribe.Warriors, playerIndex: null, ready: true, online: true },
    ];
    controller.hostSession = { broadcast: vi.fn() };
    controller.handleClientClosed('guest-1');
    expect(controller.hostPlayers).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- presence.test.ts`
Expected: FAIL — `handleClientClosed` is not a function (or the behavior isn't implemented).

- [ ] **Step 3: Write minimal implementation**

In `src/controller/gameController.ts`:

1. Change the `hostPlayers` field type (line ~57) to include `online`:

```ts
  private hostPlayers: { peerId: string; name: string; tribeId: Tribe | null; playerIndex: number | null; ready: boolean; online: boolean }[] = [];
```

2. In `hostGame`, the `onOpen` callback that pushes the entry (line ~752) gains `online: true`:

```ts
      onOpen: (peerId) => {
        this.hostPlayers.push({ peerId, name: '', tribeId: null, playerIndex: null, ready: false, online: true });
        this.broadcastLobby();
      },
```

3. Replace the `onClose` callback (lines ~757-760) to delegate:

```ts
      onClose: (peerId) => {
        this.handleClientClosed(peerId);
      },
```

4. Add two private methods (e.g., after `broadcastBatch`):

```ts
  private handleClientClosed(peerId: string): void {
    const entry = this.hostPlayers.find((p) => p.peerId === peerId);
    if (!entry) return;
    if (entry.playerIndex === null) {
      this.hostPlayers = this.hostPlayers.filter((p) => p.peerId !== peerId);
      this.broadcastLobby();
    } else {
      entry.online = false;
      this.broadcastPlayersOnline();
    }
  }

  private broadcastPlayersOnline(): void {
    if (!this.sim) return;
    const online = this.sim.players.map(() => true);
    for (const p of this.hostPlayers) {
      if (p.playerIndex !== null) online[p.playerIndex] = p.online;
    }
    useGameStore.getState().setPlayersOnline(online);
    this.hostSession?.broadcast({ type: 'playersOnline', online });
  }
```

5. In `startHostGame`, after `store.setPlayers(players);` (line ~879), initialize the host's presence:

```ts
    store.setPlayersOnline(players.map(() => true));
```

6. In `onHostMessage`, in the `'state'` handler, inside the `if (enteringGame) ...` block (line ~977), initialize the client's presence:

```ts
        if (enteringGame) store.setWelcomeOpen(true);
        if (enteringGame) store.setPlayersOnline(msg.state.players.map(() => true));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- presence.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/controller/gameController.ts tests/presence.test.ts
git commit -m "feat: track and broadcast mid-game player disconnects"
```

---

### Task 4: Human players toolbar widget

**Files:**
- Create: `src/ui/hud/HudPlayers.ts`
- Modify: `src/ui/screens/GameScreen.ts`
- Test: `tests/hudPlayers.test.ts` (new)

**Interfaces:**
- Consumes: `s.players`, `s.playersOnline`, `s.screen`, `s.netMode` from the store; `TRIBES` from `./tribes`; `makeIcon` from `../kit/icon`; `makeLabel` from `../kit/label`.
- Produces: exported `PLAYER_ONLINE_COLOR = 0x2ecc71`, `PLAYER_OFFLINE_COLOR = 0xe74c3c`, and class `HudPlayers` implementing `Widget`. Mounted in `GameScreen`.

- [ ] **Step 1: Write the failing test**

Create `tests/hudPlayers.test.ts`:

```ts
import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { HudPlayers, PLAYER_ONLINE_COLOR, PLAYER_OFFLINE_COLOR } from '../src/ui/hud/HudPlayers';
import { useGameStore } from '../src/store/gameStore';
import { Tribe } from '../src/game/tribes';
import { type UIHost } from '../src/ui/host';
import { type Player } from '../src/game/players';

function fakeCanvasContext() {
  return { measureText: (s: string) => ({ width: s.length * 8 }) };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

function player(index: number, tribe: Tribe, name: string, isHuman: boolean): Player {
  return {
    index, tribe, isHuman, name,
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

describe('HudPlayers', () => {
  let host: UIHost;
  let root: Container;

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
      screen: 'game',
      netMode: 'host',
      localPlayerIndex: 0,
      players: [
        player(0, Tribe.Cats, 'Host', true),
        player(1, Tribe.Warriors, 'Guest', true),
        player(2, Tribe.Barbarians, 'Bot', false),
      ],
      playersOnline: [true, true, true],
    });
  });

  afterEach(() => {
    useGameStore.setState({ screen: 'start', netMode: 'single', players: [], playersOnline: [] });
  });

  const allTexts = (c: Container): string[] => {
    const out: string[] = [];
    const walk = (cc: Container): void => {
      for (const ch of cc.children) {
        if (ch instanceof Text) out.push(String((ch as Text).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(c);
    return out;
  };

  const chipFor = (c: Container, name: string): Container | null => {
    for (const ch of c.children) {
      if (!(ch instanceof Container)) continue;
      if (ch.children.some((x) => x instanceof Text && String((x as Text).text) === name)) return ch as Container;
    }
    return null;
  };

  const hasFill = (chip: Container, color: number): boolean =>
    (chip.children.filter((x) => x instanceof Graphics) as Graphics[]).some((g) =>
      (g as unknown as { context?: { instructions?: { action: string; data?: { style?: { color?: number } } }[] } }).context?.instructions?.some((i) => i.action === 'fill' && i.data?.style?.color === color) ?? false,
    );

  it('is hidden in single-player mode', () => {
    useGameStore.setState({ netMode: 'single' });
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    expect(el.visible).toBe(false);
    w.destroy();
  });

  it('renders each human player name and tribe name, excluding AI', () => {
    const w = new HudPlayers();
    w.mount(host, root);
    const texts = allTexts(root);
    expect(texts.some((t) => t === 'Host')).toBe(true);
    expect(texts.some((t) => t === 'Guest')).toBe(true);
    expect(texts.some((t) => t === 'Cats')).toBe(true);
    expect(texts.some((t) => t === 'Warriors')).toBe(true);
    expect(texts.some((t) => t === 'Bot')).toBe(false);
    expect(texts.some((t) => t === 'Barbarians')).toBe(false);
    w.destroy();
  });

  it('shows a green dot for online players and a red dot for offline players', () => {
    useGameStore.setState({ playersOnline: [true, false, true] });
    const w = new HudPlayers();
    w.mount(host, root);
    const el = (w as unknown as { el: Container }).el!;
    const hostChip = chipFor(el, 'Host')!;
    const guestChip = chipFor(el, 'Guest')!;
    expect(hasFill(hostChip, PLAYER_ONLINE_COLOR)).toBe(true);
    expect(hasFill(guestChip, PLAYER_OFFLINE_COLOR)).toBe(true);
    expect(hasFill(hostChip, PLAYER_OFFLINE_COLOR)).toBe(false);
    w.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hudPlayers.test.ts`
Expected: FAIL — module `../src/ui/hud/HudPlayers` cannot be found.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/hud/HudPlayers.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { TRIBES } from '../../game/tribes';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

export const PLAYER_ONLINE_COLOR = 0x2ecc71;
export const PLAYER_OFFLINE_COLOR = 0xe74c3c;

const RADIUS = 20;
const DOT_RADIUS = 6;
const PAD = 8;
const SLOT_WIDTH = 132;

export class HudPlayers implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    this.el.position.set(PAD, PAD);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    this.el.visible = s.screen === 'game' && s.netMode !== 'single';
    this.el.removeChildren();
    if (!this.el.visible) return;
    let x = 0;
    for (const p of s.players) {
      if (!p.isHuman) continue;
      const online = s.playersOnline[p.index] ?? true;
      const chip = this.makeChip(p.name, p.tribe, online);
      chip.position.set(x, 0);
      this.el.addChild(chip);
      x += SLOT_WIDTH;
    }
  }

  private makeChip(name: string, tribeId: number, online: boolean): Container {
    const tribe = TRIBES.find((t) => t.id === tribeId)!;
    const chip = new Container();
    const cx = SLOT_WIDTH / 2;
    const cy = RADIUS + 4;

    const circle = new Graphics();
    circle.circle(0, 0, RADIUS).fill(0xffffff);
    circle.position.set(cx, cy);

    const clip = new Graphics();
    clip.circle(0, 0, RADIUS).fill(0xffffff);
    clip.position.set(cx, cy);

    const icon = makeIcon(`${tribe.code}-icon.png`, RADIUS * 2);
    icon.mask = clip;
    icon.position.set(cx, cy);

    const dot = new Graphics();
    dot.circle(0, 0, DOT_RADIUS).fill(online ? PLAYER_ONLINE_COLOR : PLAYER_OFFLINE_COLOR).stroke({ width: 2, color: 0xffffff });
    dot.position.set(cx + RADIUS - DOT_RADIUS - 2, cy - RADIUS + DOT_RADIUS + 2);

    const nameLabel = makeLabel(name, { fontSize: 12, fill: 0xffffff, fontWeight: '700' });
    nameLabel.anchor.set(0.5, 0);
    nameLabel.position.set(cx, cy + RADIUS + 6);

    const tribeLabel = makeLabel(tribe.name, { fontSize: 10, fill: 0xbbbbbb });
    tribeLabel.anchor.set(0.5, 0);
    tribeLabel.position.set(cx, cy + RADIUS + 22);

    chip.addChild(circle, clip, icon, dot, nameLabel, tribeLabel);
    return chip;
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
```

In `src/ui/screens/GameScreen.ts`, add the import and mount the widget:

```ts
import { HudPlayers } from '../hud/HudPlayers';
```

Add `new HudPlayers()` to the `widgets` array (e.g., after `new HudScore()`):

```ts
      new HudScore(),
      new HudPlayers(),
      new HudTurn(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hudPlayers.test.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud/HudPlayers.ts src/ui/screens/GameScreen.ts tests/hudPlayers.test.ts
git commit -m "feat: human players toolbar with online status on the game screen"
```

---

### Task 5: Full verification

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
