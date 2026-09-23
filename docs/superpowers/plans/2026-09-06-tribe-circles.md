# Tribe Circles Below the Resource Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a row of ~20px circular tribe chips just below the top-center resource panel, one per opposing tribe in the current game, showing the tribe icon when explored, a grey `?` circle when not, dimmed to 0.3 alpha when eliminated.

**Architecture:** A new HUD widget (`HudTribes`) mounted in `GameScreen` alongside the other HUD widgets. It reads the already-synced `useGameStore` state (`players`, `localPlayerIndex`, `screen`), renders one chip per player except the local one, and re-renders on every store change and window resize.

**Tech Stack:** TypeScript, PixiJS 8 (Containers/Graphics/Text/Sprite), Zustand store, Vitest.

## Global Constraints

- Follow existing HUD widget patterns (`HudMoney`, `HudPlayers`, `HudTips`): a class implementing `Widget` (`mount(host, root)` / `destroy()`), a private `el`, subscribe via `useGameStore.subscribe(() => this.update())`, `window.addEventListener('resize', ...)`.
- Use existing helpers `makeIcon(file, size)` and `makeLabel(text, opts)` from `src/ui/kit`.
- Explored = opposing tribe present in the local player's `knownTribes` (union includes the local player's own tribe). Matches `HudTurn`.
- Eliminated = opposing `player.isActive === false`.
- Reuse `UNKNOWN_TRIBE_COLOR` from `src/game/discovery.ts` (value `0x888888`) for the unexplored fill.
- Circle diameter 20px, gaps 6px, row vertically centered at `y = 44`, horizontally centered on `app.screen.width / 2`.
- No new dependencies. Spec: `docs/superpowers/specs/2026-09-06-tribe-circles-design.md`.

---

### Task 1: HudTribes widget with unit tests

**Files:**
- Create: `src/ui/hud/HudTribes.ts`
- Test: `tests/hudTribes.test.ts`

**Interfaces:**
- Produces: `export class HudTribes implements Widget` with `mount(host: UIHost, root: Container): void` and `destroy(): void` (the `Widget` interface from `src/ui/host.ts`). Mounted later by `GameScreen`.
- Consumes: `useGameStore` state fields `screen`, `players`, `localPlayerIndex`; `TRIBES` from `src/game/tribes.ts`; `UNKNOWN_TRIBE_COLOR` from `src/game/discovery.ts`; `makeIcon`, `makeLabel`.

- [ ] **Step 1: Write the failing test**

Create `tests/hudTribes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { HudTribes } from '../src/ui/hud/HudTribes';
import { useGameStore } from '../src/store/gameStore';
import { UNKNOWN_TRIBE_COLOR } from '../src/game/discovery';
import { Tribe } from '../src/game/tribes';
import { type Player } from '../src/game/players';
import { type UIHost } from '../src/ui/host';

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

function player(
  index: number,
  tribe: Tribe,
  name: string,
  isActive = true,
  knownTribes: Tribe[] = [],
): Player {
  return {
    index, tribe, isHuman: false, name,
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0, kills: 0, skills: [], isActive,
    knownTribes,
  };
}

function setGame(local: Player, enemies: Player[]): void {
  useGameStore.setState({
    screen: 'game',
    localPlayerIndex: local.index,
    players: [local, ...enemies],
  });
}

describe('HudTribes', () => {
  let host: UIHost;
  let root: Container;
  let widget: HudTribes | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    host = makeHost();
    root = new Container();
    useGameStore.setState({ screen: 'start', players: [], localPlayerIndex: 0 });
  });

  afterEach(() => {
    widget?.destroy();
    widget = null;
    vi.restoreAllMocks();
    useGameStore.setState({ screen: 'start', players: [], localPlayerIndex: 0 });
  });

  const el = (): Container => (widget as unknown as { el: Container }).el!;

  const chips = (): Container[] =>
    el().children.filter((c): c is Container => c instanceof Container);

  const spritesIn = (chip: Container): number =>
    chip.children.filter((c) => c instanceof Sprite).length;

  const textOf = (chip: Container): string[] =>
    chip.children.filter((c): c is Text => c instanceof Text).map((c) => String(c.text));

  const hasFill = (chip: Container, color: number): boolean =>
    (chip.children.filter((c) => c instanceof Graphics) as Graphics[]).some((g) =>
      (g as unknown as { context?: { instructions?: { action: string; data?: { style?: { color?: number } } }[] } }).context?.instructions?.some((i) => i.action === 'fill' && i.data?.style?.color === color) ?? false,
    );

  it('is hidden outside the game screen', () => {
    useGameStore.setState({ screen: 'start' });
    widget = new HudTribes();
    widget.mount(host, root);
    expect(el().visible).toBe(false);
  });

  it('draws one chip per opposing player and excludes the local tribe', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats, Tribe.Warriors]),
      [
        player(1, Tribe.Warriors, 'Warriors'),
        player(2, Tribe.Forest, 'Forest'),
      ],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    expect(el().visible).toBe(true);
    expect(chips()).toHaveLength(2);
  });

  it('shows the tribe icon for an explored tribe', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats, Tribe.Warriors]),
      [player(1, Tribe.Warriors, 'Warriors')],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    const chip = chips()[0]!;
    expect(spritesIn(chip)).toBe(1);
    expect(textOf(chip)).toEqual([]);
    expect(chip.alpha).toBe(1);
  });

  it('shows a grey circle with a white question mark for an unexplored tribe', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats]),
      [player(1, Tribe.Forest, 'Forest')],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    const chip = chips()[0]!;
    expect(spritesIn(chip)).toBe(0);
    expect(textOf(chip)).toEqual(['?']);
    expect(hasFill(chip, UNKNOWN_TRIBE_COLOR)).toBe(true);
    const q = chip.children.find((c): c is Text => c instanceof Text)!;
    expect((q.style as { fill?: string | number }).fill).toBe(0xffffff);
  });

  it('dims an eliminated player\'s chip to 0.3 alpha', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats, Tribe.Warriors, Tribe.Aqua]),
      [
        player(1, Tribe.Warriors, 'Warriors'),
        player(2, Tribe.Aqua, 'Aqua', false),
      ],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    const [warriors, aqua] = chips();
    expect(warriors!.alpha).toBe(1);
    expect(aqua!.alpha).toBeCloseTo(0.3, 5);
  });

  it('centers the row under the resource panel', () => {
    setGame(
      player(0, Tribe.Cats, 'Cats', true, [Tribe.Cats]),
      [player(1, Tribe.Warriors, 'Warriors')],
    );
    widget = new HudTribes();
    widget.mount(host, root);
    expect(el().position.x).toBe(640);
    expect(el().position.y).toBe(44);
    // A single chip sits at its own centre.
    expect(chips()[0]!.position.x).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/hudTribes.test.ts`
Expected: FAIL — cannot resolve `../src/ui/hud/HudTribes` (no such module).

- [ ] **Step 3: Implement the widget**

Create `src/ui/hud/HudTribes.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
import { TRIBES } from '../../game/tribes';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

const CIRCLE_SIZE = 20;
const RADIUS = CIRCLE_SIZE / 2;
const GAP = 6;
/** Vertical centre of the chip row, just below the top-centre resource panel. */
const ROW_Y = 44;
const ELIMINATED_ALPHA = 0.3;

export class HudTribes implements Widget {
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
    this.el.position.set(this.host.app.screen.width / 2, ROW_Y);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const local = s.players[s.localPlayerIndex];
    this.el.removeChildren();
    if (s.screen !== 'game' || !local) {
      this.el.visible = false;
      return;
    }
    const known = new Set<number>([local.tribe, ...(local.knownTribes ?? [])]);
    const enemies = s.players.filter((p) => p.index !== local.index);
    this.el.visible = enemies.length > 0;
    let x = -(((enemies.length - 1) * (CIRCLE_SIZE + GAP)) / 2);
    for (const p of enemies) {
      const chip = this.makeChip(p.tribe, known.has(p.tribe), p.isActive);
      chip.position.set(x, 0);
      this.el.addChild(chip);
      x += CIRCLE_SIZE + GAP;
    }
  }

  private makeChip(tribeId: number, explored: boolean, active: boolean): Container {
    const chip = new Container();
    if (explored) {
      const tribe = TRIBES.find((t) => t.id === tribeId);
      if (!tribe) return chip;
      const bg = new Graphics();
      bg.circle(0, 0, RADIUS).fill(0xffffff);
      const clip = new Graphics();
      clip.circle(0, 0, RADIUS).fill(0xffffff);
      const icon = makeIcon(`${tribe.code}-icon.png`, CIRCLE_SIZE);
      icon.mask = clip;
      chip.addChild(bg, clip, icon);
    } else {
      const bg = new Graphics();
      bg.circle(0, 0, RADIUS).fill(UNKNOWN_TRIBE_COLOR);
      const question = makeLabel('?', { fontSize: 13, fill: 0xffffff, fontWeight: '800' });
      question.anchor.set(0.5, 0.5);
      chip.addChild(bg, question);
    }
    chip.alpha = active ? 1 : ELIMINATED_ALPHA;
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/hudTribes.test.ts`
Expected: PASS (6 tests). If Pixi complains about text measurement, the `Text.prototype.width/height` overrides and fake `document` in the test handle it; ensure the test setup block is present exactly as written.

- [ ] **Step 5: Commit**

```bash
git add src/ui/hud/HudTribes.ts tests/hudTribes.test.ts
git commit -m "feat: tribe circles widget showing explored/eliminated opponents"
```

### Task 2: Mount HudTribes on the game screen

**Files:**
- Modify: `src/ui/screens/GameScreen.ts`
- Test: `tests/gameScreen.test.ts` (existing, must keep passing)

**Interfaces:**
- Consumes: `HudTribes` (Task 1) — mounted like any other widget.

- [ ] **Step 1: Add the import**

In `src/ui/screens/GameScreen.ts`, after the `HudTips` import line (`import { HudTips } from '../hud/HudTips';`) add:

```ts
import { HudTribes } from '../hud/HudTribes';
```

- [ ] **Step 2: Add the widget to the list**

In `GameScreen.mount`, in the `gameWidgets` array directly after `new HudMoney(),` add:

```ts
      new HudTribes(),
```

- [ ] **Step 3: Typecheck and run the focused tests**

Run: `npm run typecheck && npx vitest run tests/hudTribes.test.ts tests/gameScreen.test.ts tests/hudMoney.test.ts`
Expected: PASS.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: 113 test files pass (existing 813 + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/GameScreen.ts
git commit -m "feat: show opponent tribe circles under the resource panel"
```

---
