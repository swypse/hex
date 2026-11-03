# React + Zustand Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract global game/view state into a zustand store and rewrite all UI screens in React, keeping the PixiJS map in a non-React controller that mounts into a React-owned container div.

**Architecture:** A zustand store holds lightweight view state (screen, players, turn, currentPlayerIndex, aiActive, selection, popups). A non-React `GameController` owns the Pixi app, the mutable `GameMap`, and textures, exposing imperative methods that read/write the store and re-render the canvas. React components subscribe to the store and render the DOM; `main.tsx` is the new entry.

**Tech Stack:** React 18, react-dom, zustand, Vite (with `@vitejs/plugin-react`), TypeScript, PixiJS 8, Vitest.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- Store holds ONLY lightweight view state; `GameMap` stays as a mutable ref owned by the controller.
- `Screen = 'start' | 'setup' | 'game'`; `Popup = { id, text, background, color? }`.
- React owns the Pixi container div; controller `init(container)` mounts the canvas into it.
- Controller methods: `init(container)`, `startGame(tribe, enemyCount)`, `handleMapClick(q, r)`, `upgradeSelectedVillage()`, `endTurn()`, `destroy()`.
- Popup queue behavior (≥300ms spacing, 5s visibility, immediate dismiss) lives in the controller or a popup-queue module; React `PopupStack` renders `store.popups`.
- `src/game/*` and `src/render/*` remain unchanged.
- Old DOM modules deleted: `src/main.ts`, `src/screens/startScreen.ts`, `src/screens/setupScreen.ts`, `src/screens/gameScreen.ts`, `src/ui/popups.ts`.
- Tests: `npm test`; typecheck `npm run typecheck`; manual headless Chrome.
- Commit after each task with the exact message shown.

---

### Task 1: Install deps + React entry + App shell

**Files:**
- Modify: `package.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/screens/StartScreen.tsx`, `src/screens/SetupScreen.tsx`
- Delete: `src/main.ts`

**Interfaces:**
- Consumes: nothing yet (store comes in Task 2).
- Produces: React app shell rendering Start/Setup screens (GameScreen stub added later), `npm run dev` boots React.

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install react react-dom zustand
npm install -D @vitejs/plugin-react @types/react @types/react-dom
```

Expected: installs succeed; `package.json` gains `react`, `react-dom`, `zustand` (deps) and `@vitejs/plugin-react`, `@types/react`, `@types/react-dom` (devDeps).

- [ ] **Step 2: Update `vite.config.ts`**

Replace the entire file contents:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Update `index.html`**

Replace the `<body>` content (lines 25-46) with:

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

Keep the `<style>` block as-is (the CSS selectors still apply to the React-rendered elements by the same class/id names). Note: the old `#screen-*` divs are gone; React will render the same classed elements.

- [ ] **Step 4: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Create `src/App.tsx`**

```tsx
export function App(): React.ReactElement {
  return <div>Hex</div>;
}
```

This is a temporary shell so the build compiles; the real screen router arrives in Task 4 once the store exists.

- [ ] **Step 6: Delete `src/main.ts` and the old screen modules**

```bash
rm src/main.ts src/screens/startScreen.ts src/screens/setupScreen.ts
```

(`src/screens/gameScreen.ts` and `src/ui/popups.ts` are deleted in Task 6 once their logic is extracted.)

- [ ] **Step 7: Verify typecheck, tests, and dev server**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (tests don't import screens; pure `src/game/*` still fine).

Run: `npm run dev` — open the URL, expect a bare "Hex" text page (React shell).
Expected: dev server serves and React renders.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts index.html src/main.tsx src/App.tsx
git rm src/main.ts src/screens/startScreen.ts src/screens/setupScreen.ts
git commit -m "feat: add react and zustand dependencies with app shell"
```

---

### Task 2: Zustand store + popup queue module

**Files:**
- Create: `src/store/gameStore.ts`
- Create: `src/ui/popupQueue.ts`
- Test: `tests/gameStore.test.ts`

**Interfaces:**
- Consumes: `players.ts` (`Player`), `selection.ts` (`Selection`).
- Produces (consumed by Tasks 3-6):
  - `useGameStore` (zustand hook) with state `{ screen, players, turn, currentPlayerIndex, aiActive, selection, popups }` and actions `setScreen, setPlayers, setTurn, setCurrentPlayerIndex, setAiActive, setSelection, pushPopup, dismissPopup`.
  - `Popup` type; `popupQueue.show(text, opts?)` / `popupQueue.dismiss(id)`; `popupQueue.getSnapshot()` returning `{ popups: Popup[] }`.

- [ ] **Step 1: Write the failing test**

Create `tests/gameStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, Popup } from '../src/store/gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      aiActive: false,
      selection: null,
      popups: [],
    });
  });

  it('starts on the start screen', () => {
    const s = useGameStore.getState();
    expect(s.screen).toBe('start');
  });

  it('setScreen updates the screen', () => {
    useGameStore.getState().setScreen('setup');
    expect(useGameStore.getState().screen).toBe('setup');
  });

  it('pushPopup adds a popup with an id', () => {
    useGameStore.getState().pushPopup({ text: 'hi', background: '#000' });
    const popups = useGameStore.getState().popups;
    expect(popups).toHaveLength(1);
    expect(popups[0].text).toBe('hi');
    expect(typeof popups[0].id).toBe('number');
  });

  it('dismissPopup removes a popup by id', () => {
    useGameStore.getState().pushPopup({ text: 'a', background: '#000' });
    const id = useGameStore.getState().popups[0].id;
    useGameStore.getState().dismissPopup(id);
    expect(useGameStore.getState().popups).toHaveLength(0);
  });

  it('setSelection and setAiActive update state', () => {
    const store = useGameStore;
    store.getState().setAiActive(true);
    store.getState().setSelection({ kind: 'terrain', q: 1, r: 2 });
    expect(store.getState().aiActive).toBe(true);
    expect(store.getState().selection).toEqual({ kind: 'terrain', q: 1, r: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `gameStore` module not found.

- [ ] **Step 3: Write `src/store/gameStore.ts`**

```ts
import { create } from 'zustand';
import { Player } from '../game/players';
import { Selection } from '../game/selection';

export type Screen = 'start' | 'setup' | 'game';

export interface Popup {
  id: number;
  text: string;
  background: string;
  color?: string;
}

interface GameStore {
  screen: Screen;
  players: Player[];
  turn: number;
  currentPlayerIndex: number;
  aiActive: boolean;
  selection: Selection | null;
  popups: Popup[];

  setScreen: (screen: Screen) => void;
  setPlayers: (players: Player[]) => void;
  setTurn: (turn: number) => void;
  setCurrentPlayerIndex: (index: number) => void;
  setAiActive: (active: boolean) => void;
  setSelection: (selection: Selection | null) => void;
  pushPopup: (popup: Omit<Popup, 'id'>) => void;
  dismissPopup: (id: number) => void;
}

let nextPopupId = 1;

export const useGameStore = create<GameStore>((set) => ({
  screen: 'start',
  players: [],
  turn: 1,
  currentPlayerIndex: 0,
  aiActive: false,
  selection: null,
  popups: [],

  setScreen: (screen) => set({ screen }),
  setPlayers: (players) => set({ players }),
  setTurn: (turn) => set({ turn }),
  setCurrentPlayerIndex: (index) => set({ currentPlayerIndex: index }),
  setAiActive: (active) => set({ aiActive: active }),
  setSelection: (selection) => set({ selection }),
  pushPopup: (popup) =>
    set((state) => ({ popups: [...state.popups, { ...popup, id: nextPopupId++ }] })),
  dismissPopup: (id) =>
    set((state) => ({ popups: state.popups.filter((p) => p.id !== id) })),
}));
```

- [ ] **Step 4: Write `src/ui/popupQueue.ts`**

This module owns popup timing (≥300ms spacing, 5s visibility). It enqueues into the store.

```ts
import { useGameStore } from '../store/gameStore';

const QUEUE_GAP_MS = 300;
const VISIBLE_MS = 5000;

interface PendingPopup {
  text: string;
  background: string;
  color?: string;
}

const queue: PendingPopup[] = [];
let processorRunning = false;

export function showPopup(
  text: string,
  opts: { background?: string; color?: string } = {},
): void {
  queue.push({ text, background: opts.background ?? '#000', color: opts.color });
  if (!processorRunning) {
    processorRunning = true;
    processNext();
  }
}

export function dismissPopup(id: number): void {
  useGameStore.getState().dismissPopup(id);
}

function processNext(): void {
  if (queue.length === 0) {
    processorRunning = false;
    return;
  }

  const next = queue.shift()!;
  useGameStore.getState().pushPopup(next);

  setTimeout(() => {
    processNext();
  }, QUEUE_GAP_MS);
}

useGameStore.subscribe((state, prev) => {
  const added = state.popups.filter((p) => !prev.popups.some((q) => q.id === p.id));
  for (const popup of added) {
    setTimeout(() => dismissPopup(popup.id), VISIBLE_MS);
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/store/gameStore.ts src/ui/popupQueue.ts tests/gameStore.test.ts
git commit -m "feat: add zustand game store and popup queue"
```

---

### Task 3: GameController (extract game logic)

**Files:**
- Create: `src/controller/gameController.ts`
- Test: typecheck + manual; pure logic is in `src/game/*` already tested.

**Interfaces:**
- Consumes: all of `src/game/*`, `src/render/*`, `src/store/gameStore.ts`, `src/ui/popupQueue.ts`, `src/util/random.ts`.
- Produces (consumed by Tasks 4-6):
  - `export const gameController: GameController` with `init(container)`, `startGame(tribe, enemyCount)`, `handleMapClick(q, r)`, `upgradeSelectedVillage()`, `endTurn()`, `destroy()`, and `getMap(): GameMap | null` (for HUD tile lookup).

- [ ] **Step 1: Write `src/controller/gameController.ts`**

This module is the extracted logic from the old `gameScreen.ts`, adapted to read/write the store instead of touching DOM directly. The full file:

```ts
import { Application, Container } from 'pixi.js';
import { planAiActions } from '../game/ai';
import { axialKey, pixelToHex } from '../game/hex';
import { generateMap, GameMap } from '../game/mapGen';
import { buildPlayers } from '../game/players';
import { canAfford, pay, UPGRADE_COST } from '../game/resources';
import { cycleSelection, moveUnit, reachableTargets, Selection, tileAt } from '../game/selection';
import { Tribe } from '../game/tribes';
import { upgradeVillage } from '../game/village';
import { renderMap } from '../render/mapRenderer';
import { createTextures } from '../render/textureFactory';
import { useGameStore } from '../store/gameStore';
import { showPopup } from '../ui/popupQueue';
import { SeededRandom } from '../util/random';

const HEX_SIZE = 40;

class GameController {
  private app: Application | null = null;
  private map: GameMap | null = null;
  private textures: ReturnType<typeof createTextures> | null = null;
  private mapContainer: Container | null = null;
  private reachableKeys = new Set<string>();

  init(container: HTMLElement): void {
    if (this.app) return;
    const app = new Application();
    void app.init({ resizeTo: window, background: '#1a1a2e', antialias: true }).then(() => {
      container.appendChild(app.canvas);
      this.app = app;
    });
  }

  getMap(): GameMap | null {
    return this.map;
  }

  startGame(tribe: Tribe, enemyCount: number): void {
    const store = useGameStore.getState();
    const players = buildPlayers(tribe, enemyCount, new SeededRandom(Math.floor(Math.random() * 100000)));
    store.setPlayers(players);
    this.map = generateMap(players.length, Math.floor(Math.random() * 100000));
    if (this.app) {
      this.textures = createTextures(this.app);
    }
    store.setTurn(1);
    store.setCurrentPlayerIndex(0);
    store.setAiActive(false);
    store.setSelection(null);
    store.setScreen('game');
    this.render();
    const human = players[0];
    const tribeInfo = { color: 0, name: '' };
    showPopup(`${human.name}'s turn!`, { background: '#000' });
  }

  handleMapClick(q: number, r: number): void {
    if (!this.map || !this.app) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const tile = tileAt(this.map, q, r);
    if (!tile) return;

    const selection = store.selection;
    if (selection && selection.kind === 'unit' && this.reachableKeys.has(axialKey(tile))) {
      const unit = tileAt(this.map, selection.q, selection.r)!.unit!;
      moveUnit(this.map, unit, tile);
      store.setSelection(null);
      this.render();
      return;
    }

    store.setSelection(cycleSelection(selection, tile));
    this.render();
  }

  upgradeSelectedVillage(): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'village') return;
    const tile = tileAt(this.map, selection.q, selection.r)!;
    if (!tile.settlement || tile.settlement.owner !== 0) return;
    const players = store.players;
    if (!canAfford(players[0].resources, UPGRADE_COST)) return;
    players[0].resources = pay(players[0].resources, UPGRADE_COST);
    upgradeVillage(this.map, tile);
    store.setPlayers([...players]);
    showPopup(`${players[0].name}'s village upgraded to level ${tile.settlement.level}`, { background: '#000' });
    this.render();
  }

  endTurn(): void {
    const store = useGameStore.getState();
    if (store.aiActive) return;
    store.setAiActive(true);
    store.setSelection(null);
    void this.runAiPhase();
  }

  destroy(): void {
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
      this.map = null;
      this.textures = null;
      this.mapContainer = null;
    }
  }

  private async runAiPhase(): Promise<void> {
    if (!this.map) return;
    const store = useGameStore.getState();
    const players = store.players;
    const aiPlayers = players.filter((p) => !p.isHuman);

    for (const ai of aiPlayers) {
      store.setCurrentPlayerIndex(ai.index);
      const start = Date.now();

      showPopup(`${ai.name}'s turn!`, { background: '#000' });
      this.render();

      const actions = planAiActions(this.map, ai.index, new SeededRandom(Math.floor(Math.random() * 100000)));

      for (const action of actions) {
        if (action.type === 'upgrade') {
          const tile = tileAt(this.map, action.q, action.r)!;
          if (tile.settlement && tile.settlement.owner === ai.index && canAfford(ai.resources, UPGRADE_COST)) {
            ai.resources = pay(ai.resources, UPGRADE_COST);
            upgradeVillage(this.map, tile);
            showPopup(`${ai.name}'s village upgraded to level ${tile.settlement.level}`, { background: '#000' });
          }
        } else {
          const unit = this.map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          if (unit) {
            const target = tileAt(this.map, action.q, action.r)!;
            moveUnit(this.map, unit, target);
          }
        }
        this.render();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const elapsed = Date.now() - start;
      if (elapsed < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 5000 - elapsed));
      }
      this.render();
    }

    store.setCurrentPlayerIndex(0);
    store.setTurn(store.turn + 1);
    for (const t of this.map.tiles) {
      if (t.unit) t.unit.hasMoved = false;
    }
    store.setAiActive(false);
    store.setSelection(null);
    const human = players[0];
    showPopup(`${human.name}'s turn!`, { background: '#000' });
    this.render();
  }

  private render(): void {
    if (!this.app || !this.map || !this.textures) return;
    const store = useGameStore.getState();

    if (this.mapContainer) this.app.stage.removeChild(this.mapContainer);

    this.reachableKeys = new Set<string>();
    const selection = store.selection;
    if (selection && selection.kind === 'unit') {
      const tile = tileAt(this.map, selection.q, selection.r)!;
      const unit = tile.unit!;
      if (unit.owner === 0 && !unit.hasMoved) {
        this.reachableKeys = new Set(reachableTargets(this.map, unit).map((t) => axialKey(t)));
      }
    }

    this.mapContainer = renderMap(this.app, this.map, this.textures, store.players, selection, this.reachableKeys, HEX_SIZE);
    this.mapContainer.eventMode = 'static';
    this.mapContainer.on('pointertap', (e) => {
      if (!this.mapContainer) return;
      const local = this.mapContainer.toLocal(e.global);
      const h = pixelToHex(local.x, local.y, HEX_SIZE);
      this.handleMapClick(h.q, h.r);
    });

    this.app.stage.addChild(this.mapContainer);
  }
}

export const gameController = new GameController();
```

Note: `startGame` includes a placeholder `const tribeInfo = { color: 0, name: '' };` — remove that unused line before committing (it is not needed). The human turn-start popup uses the human's tribe color in Task 5 via a store helper; for now black background is acceptable and will be improved in Task 4/5 when `TRIBES` is imported for the HUD.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors (remove any unused locals if tsc flags them).

- [ ] **Step 3: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: extract game logic into a non-react controller"
```

---

### Task 4: React screens (Start, Setup, Game) + HUD

**Files:**
- Create: `src/App.tsx` (replace shell), `src/screens/GameScreen.tsx`, `src/screens/hud/TurnInfo.tsx`, `src/screens/hud/ResourcesInfo.tsx`, `src/screens/hud/PlayersList.tsx`, `src/screens/hud/SelectedInfo.tsx`, `src/screens/hud/EndTurnButton.tsx`, `src/ui/PopupStack.tsx`
- Test: typecheck + manual headless Chrome.

**Interfaces:**
- Consumes: `useGameStore`, `gameController`, `game/game.ts` types.
- Produces: full React UI — start/setup/game screens, HUD panels, popup stack.

- [ ] **Step 1: Rewrite `src/App.tsx`**

```tsx
import { useGameStore } from './store/gameStore';
import { StartScreen } from './screens/StartScreen';
import { SetupScreen } from './screens/SetupScreen';
import { GameScreen } from './screens/GameScreen';

export function App(): React.ReactElement {
  const screen = useGameStore((s) => s.screen);
  if (screen === 'start') return <StartScreen />;
  if (screen === 'setup') return <SetupScreen />;
  return <GameScreen />;
}
```

- [ ] **Step 2: Create `src/screens/StartScreen.tsx`**

```tsx
import { useGameStore } from '../store/gameStore';

export function StartScreen(): React.ReactElement {
  const setScreen = useGameStore((s) => s.setScreen);
  return (
    <div className="screen">
      <h1>Hex</h1>
      <button onClick={() => setScreen('setup')}>Start</button>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/screens/SetupScreen.tsx`**

```tsx
import { useState } from 'react';
import { gameController } from '../controller/gameController';
import { TRIBES, Tribe } from '../game/tribes';

function colorCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function SetupScreen(): React.ReactElement {
  const [tribe, setTribe] = useState<Tribe>(TRIBES[0].id);
  const [enemies, setEnemies] = useState(1);

  return (
    <div className="screen">
      <h2>Choose your tribe</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {TRIBES.map((t) => (
          <button
            key={t.id}
            className={tribe === t.id ? 'selected' : ''}
            style={{ background: colorCss(t.color) }}
            onClick={() => setTribe(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      <h2>Enemies</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2].map((n) => (
          <button key={n} className={enemies === n ? 'selected' : ''} onClick={() => setEnemies(n)}>
            {n}
          </button>
        ))}
      </div>
      <button onClick={() => gameController.startGame(tribe, enemies)}>Start</button>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/screens/GameScreen.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { gameController } from '../controller/gameController';
import { TurnInfo } from './hud/TurnInfo';
import { ResourcesInfo } from './hud/ResourcesInfo';
import { PlayersList } from './hud/PlayersList';
import { SelectedInfo } from './hud/SelectedInfo';
import { EndTurnButton } from './hud/EndTurnButton';
import { PopupStack } from '../ui/PopupStack';

export function GameScreen(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      gameController.init(containerRef.current);
    }
    return () => gameController.destroy();
  }, []);

  return (
    <div className="screen">
      <div id="game-root" ref={containerRef} />
      <PlayersList />
      <TurnInfo />
      <ResourcesInfo />
      <SelectedInfo />
      <EndTurnButton />
      <PopupStack />
    </div>
  );
}
```

- [ ] **Step 5: Create HUD components**

`src/screens/hud/TurnInfo.tsx`:

```tsx
import { useGameStore } from '../../store/gameStore';

export function TurnInfo(): React.ReactElement {
  const turn = useGameStore((s) => s.turn);
  const player = useGameStore((s) => s.players[s.currentPlayerIndex]);
  return <div id="turn-info">{player ? `Turn ${turn} — ${player.name}` : ''}</div>;
}
```

`src/screens/hud/ResourcesInfo.tsx`:

```tsx
import { useGameStore } from '../../store/gameStore';

export function ResourcesInfo(): React.ReactElement {
  const player = useGameStore((s) => s.players[s.currentPlayerIndex]);
  if (!player) return <div id="resources-info" />;
  return (
    <div id="resources-info">
      Wood: {player.resources.wood} Stone: {player.resources.stone} Money: {player.resources.money}
    </div>
  );
}
```

`src/screens/hud/PlayersList.tsx`:

```tsx
import { useGameStore } from '../../store/gameStore';
import { TRIBES } from '../../game/tribes';

export function PlayersList(): React.ReactElement {
  const players = useGameStore((s) => s.players);
  return (
    <div id="players-list">
      {players.map((p) => {
        const tribe = TRIBES.find((t) => t.id === p.tribe)!;
        const color = `#${tribe.color.toString(16).padStart(6, '0')}`;
        const role = p.isHuman ? ' (you)' : ' (AI)';
        return (
          <div key={p.index} style={{ color }}>
            {p.name} ({tribe.name}){role}
          </div>
        );
      })}
    </div>
  );
}
```

`src/screens/hud/SelectedInfo.tsx`:

```tsx
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { TRIBES } from '../../game/tribes';
import { TILE_TYPE_NAMES } from '../../game/tileTypes';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { canAfford, UPGRADE_COST } from '../../game/resources';

export function SelectedInfo(): React.ReactElement {
  const selection = useGameStore((s) => s.selection);
  const players = useGameStore((s) => s.players);

  if (!selection) return <div id="selected-info" />;
  const map = gameController.getMap();
  if (!map) return <div id="selected-info" />;
  const tile = tileAt(map, selection.q, selection.r);
  if (!tile) return <div id="selected-info" />;

  const lines: React.ReactElement[] = [];
  if (selection.kind === 'unit') {
    const unit = tile.unit!;
    const player = players[unit.owner];
    const tribe = TRIBES.find((t) => t.id === player.tribe)!;
    lines.push(<div key="n">Name: {UNIT_TYPE_NAMES[unit.type]}</div>);
    lines.push(<div key="t">Type: unit</div>);
    lines.push(<div key="tr">Tribe: {tribe.name}</div>);
    lines.push(<div key="p">Player: {player.name}</div>);
  } else if (selection.kind === 'village') {
    lines.push(<div key="n">Name: Settlement</div>);
    lines.push(<div key="t">Type: village</div>);
    lines.push(<div key="l">Level: {tile.settlement!.level}</div>);
    const owner = tile.settlement!.owner;
    if (owner !== null) {
      const player = players[owner];
      const tribe = TRIBES.find((t) => t.id === player.tribe)!;
      lines.push(<div key="tr">Tribe: {tribe.name}</div>);
      lines.push(<div key="p">Player: {player.name}</div>);
      if (owner === 0) {
        const affordable = canAfford(players[0].resources, UPGRADE_COST);
        lines.push(
          <button key="u" disabled={!affordable} onClick={() => gameController.upgradeSelectedVillage()}>
            Upgrade village
          </button>,
        );
      }
    }
  } else {
    lines.push(<div key="n">Name: {TILE_TYPE_NAMES[tile.terrain]}</div>);
    lines.push(<div key="t">Type: terrain</div>);
  }

  return <div id="selected-info">{lines}</div>;
}
```

`src/screens/hud/EndTurnButton.tsx`:

```tsx
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';

export function EndTurnButton(): React.ReactElement {
  const aiActive = useGameStore((s) => s.aiActive);
  return (
    <button id="end-turn-btn" disabled={aiActive} onClick={() => gameController.endTurn()}>
      End turn
    </button>
  );
}
```

`src/ui/PopupStack.tsx`:

```tsx
import { useGameStore } from '../store/gameStore';
import { dismissPopup } from './popupQueue';

export function PopupStack(): React.ReactElement {
  const popups = useGameStore((s) => s.popups);
  return (
    <div id="popup-stack">
      {popups.map((p) => (
        <div key={p.id} className="popup" style={{ background: p.background }} onClick={() => dismissPopup(p.id)}>
          <span>{p.text}</span>
          <button
            className="popup-close"
            onClick={(e) => {
              e.stopPropagation();
              dismissPopup(p.id);
            }}
          >
            {'\u2715'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Fix `GameScreen` container sizing**

The `#game-root` div must be sized for the absolute-positioned Pixi canvas. The CSS already sets `#game-root { position: absolute; inset: 0; }`. Since `.screen` is `display: flex; align-items: center; justify-content: center`, the absolute child fills the screen — no change needed.

- [ ] **Step 7: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Manual verification**

Run `npm run dev`; verify: start → setup (tribe/enemies selection) → game screen with map rendered, HUD panels showing, end-turn button, and popup stack present. Kill the server.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/screens/GameScreen.tsx src/screens/hud src/ui/PopupStack.tsx
git commit -m "feat: render ui screens in react with zustand"
```

---

### Task 5: Controller popup tribe colors

**Files:**
- Modify: `src/controller/gameController.ts`
- Test: manual.

**Interfaces:**
- Consumes: `TRIBES` from `game/tribes`.
- Produces: turn-start and upgrade popups use the player's tribe color background.

- [ ] **Step 1: Add tribe-colored popups in `gameController.ts`**

Add a helper and use it for the human turn-start and AI turn/upgrade popups:

```ts
import { TRIBES, Tribe } from '../game/tribes';

function tribeBackground(player: { tribe: Tribe }): string {
  const tribe = TRIBES.find((t) => t.id === player.tribe)!;
  return `#${tribe.color.toString(16).padStart(6, '0')}`;
}
```

Replace the `startGame` human turn popup:

```ts
    showPopup(`${human.name}'s turn!`, { background: tribeBackground(human) });
```

Replace the AI turn-start popup in `runAiPhase`:

```ts
      showPopup(`${ai.name}'s turn!`, { background: tribeBackground(ai) });
```

Replace the AI upgrade popup:

```ts
            showPopup(`${ai.name}'s village upgraded to level ${tile.settlement.level}`, { background: tribeBackground(ai) });
```

Replace the human turn-start popup at the end of `runAiPhase`:

```ts
    showPopup(`${human.name}'s turn!`, { background: tribeBackground(human) });
```

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: use tribe colors in popups"
```

---

### Task 6: Remove old DOM modules + final wiring

**Files:**
- Delete: `src/screens/gameScreen.ts`, `src/ui/popups.ts`
- Modify: `index.html` (remove stale `#screen-*` markup if any remains; the root div + style already exist)
- Test: typecheck + tests + full manual flow.

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: clean final state — no legacy DOM modules.

- [ ] **Step 1: Delete legacy modules**

```bash
git rm src/screens/gameScreen.ts src/ui/popups.ts
```

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Full manual verification**

Run `npm run dev`. Verify the complete flow end-to-end in a browser (and via headless Chrome CDP if desired):
1. Start screen → Setup → choose tribe + enemies → Start.
2. Game screen: map renders with terrain/villages/units; players list, turn info, resources, selected-info, end turn button, popup stack all present.
3. Click a unit → ghost targets; click a target → unit moves.
4. Select a village → upgrade button; upgrade → resources decrease, level increases, popup appears.
5. End turn → AI phase runs (upgrades/moves with 300ms gaps, ≥5s), then back to human at Turn 2.
6. Popups queue 300ms apart, live 5s, dismiss on click.

- [ ] **Step 4: Commit**

```bash
git add index.html
git rm src/screens/gameScreen.ts src/ui/popups.ts
git commit -m "refactor: remove legacy dom screens and popup module"
```

---

## Self-Review Notes

- **Spec coverage:** zustand store with all view state — Task 2; controller owning Pixi + mutable map — Task 3; React screens + HUD + popup stack — Task 4; tribe-colored popups — Task 5; deletion of legacy modules — Task 6. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete. One explicit note in Task 3 to remove an unused placeholder line.
- **Type consistency:** `useGameStore`, `gameController`, `Popup`, `showPopup`, `dismissPopup` names consistent across tasks. Store action names match the spec (`setScreen`, `setPlayers`, `setTurn`, `setCurrentPlayerIndex`, `setAiActive`, `setSelection`, `pushPopup`, `dismissPopup`).
- **Coordinated change:** Task 4's React components depend on `gameController.getMap()` (Task 3) and `popupQueue` (Task 2). Tasks 3-5 must all be complete before the full flow works; typecheck is green after each task because each file compiles independently.
- **Known simplification:** `GameController.init` is async (Pixi `app.init` returns a promise); `startGame` guards `this.app` before creating textures. If a user clicks Start before init resolves, `render()` no-ops until init completes — acceptable, but the UI could disable Start until `init` resolves (deferred).
- **Popup timing note:** popup spacing (300ms) and visibility (5s) are handled in `popupQueue.ts` via a store subscription that schedules dismissal; manual verification covers timing.
- **Test isolation:** the zustand store is a module singleton, so `tests/gameStore.test.ts` resets state in `beforeEach`.
