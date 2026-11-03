# Design: Zustand global state + React UI

Date: 2026-08-16

## Goal

Extract global game/view state into a zustand store and rewrite all UI screens in React. The PixiJS map remains rendered by a non-React controller that owns the canvas, mounts into a React container div, and reads/writes the store.

## Architecture

```
React (DOM UI)                 Non-React controller
┌───────────────────┐         ┌──────────────────────────┐
│ App               │         │ GameController           │
│  StartScreen      │         │  - Pixi Application      │
│  SetupScreen      │         │  - GameMap (mutable ref) │
│  GameScreen       │         │  - textures              │
│   - canvas div    │◄──────►│  - runAiPhase(), render() │
│   - HUD panels    │  zustand│  - click handler         │
│   - PopupStack    │  store  │                          │
└───────────────────┘         └──────────────────────────┘
```

- **React owns the DOM and the Pixi container div.** A `useEffect` calls `controller.init(divRef)` to mount the Pixi canvas into the div.
- **The controller owns the Pixi Application, the mutable `GameMap`, and textures.** It is a plain (non-React) module exposing imperative methods. It re-renders the Pixi map after any change and pushes view-state updates into the store.
- **The store holds lightweight view state only.** The `GameMap` stays as a mutable reference held by the controller (not copied into the store).

## Zustand store (`src/store/gameStore.ts`, new)

```ts
type Screen = 'start' | 'setup' | 'game';

interface Popup {
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

  setScreen(screen: Screen): void;
  setPlayers(players: Player[]): void;
  setTurn(turn: number): void;
  setCurrentPlayerIndex(index: number): void;
  setAiActive(active: boolean): void;
  setSelection(selection: Selection | null): void;
  pushPopup(popup: Omit<Popup, 'id'>): void;
  dismissPopup(id: number): void;
}
```

- Popup queue behavior (≥300ms spacing, 5s visibility, immediate dismissal on click) lives in the controller or a small popup-queue module that drives `pushPopup`/`dismissPopup`; the React `PopupStack` renders `store.popups`.
- Existing CSS for popups (stack, `.popup`, `.popup-close`) is preserved in `index.html`.

## Controller (`src/controller/gameController.ts`, new)

```ts
class GameController {
  init(container: HTMLElement): void;        // create Pixi app, mount canvas
  startGame(tribe: Tribe, enemyCount: number): void;  // build players + map, store them
  handleMapClick(q: number, r: number): void;
  upgradeSelectedVillage(): void;
  endTurn(): void;                            // guards on aiActive, runs AI phase
  destroy(): void;
}
export const gameController = new GameController();
```

- Holds `app`, `map`, `textures`, `HEX_SIZE`.
- `startGame` builds players via `buildPlayers` + names, generates the map, stores players/screen in the store, renders.
- `handleMapClick` implements the current click logic (move if reachable target, else cycle selection) reading `selection`/`aiActive`/`reachableKeys` from the controller or store, then `render()`.
- `render()` rebuilds the Pixi container from the current map + store selection; subscribes to store changes (or is called by the controller's own actions).
- `endTurn` = current End turn handler (aiActive guard, `runAiPhase` with 300ms gaps / 5s minimum, popups via `pushPopup`).
- Popup queue timing (300ms spacing, 5s removal) is managed here; dismissals update the store.

## React components

- `src/main.tsx` — React entry: `createRoot(document.getElementById('root')).render(<App />)`.
- `src/App.tsx` — reads `screen` from the store, renders Start/Setup/Game.
- `src/screens/StartScreen.tsx` — title + Start button → `store.setScreen('setup')`.
- `src/screens/SetupScreen.tsx` — tribe + enemy-count selection, Start → `gameController.startGame(...)`.
- `src/screens/GameScreen.tsx` — container div for Pixi (`useEffect` → `gameController.init`), renders HUD + PopupStack.
- `src/screens/hud/*` — `TurnInfo`, `ResourcesInfo`, `PlayersList`, `SelectedInfo`, `EndTurnButton` (subscribe to store slices; `SelectedInfo` reads the selected tile via the controller's map + `selection`).
- `src/ui/PopupStack.tsx` — renders `store.popups` with per-popup close.

## Entry & wiring changes

- `package.json`: add `react`, `react-dom`, `zustand`, `@vitejs/plugin-react`; script `dev`/`build` unchanged.
- `vite.config.ts`: add the React plugin.
- `index.html`: replace the three `.screen` divs with a single `<div id="root"></div>`; keep the global styles.
- Delete `src/main.ts` (replaced by `main.tsx`), `src/screens/startScreen.ts`, `src/screens/setupScreen.ts`, `src/screens/gameScreen.ts`, `src/ui/popups.ts` (all logic moves to React components + controller + store).
- `src/game/*` and `src/render/*` remain unchanged (pure logic + renderers).

## Tests

- Existing pure-logic tests stay green.
- Store actions: new `tests/gameStore.test.ts` covering set/dismiss/push-popup behavior (store is plain enough to test without a DOM; popup timing is manual-verified).
- Manual verification: full flow start → setup → game (map renders, selection/movement/upgrade/end-turn/AI phase, popups) via headless Chrome.

## Notes

- The store deliberately avoids holding the `GameMap`; the controller owns it to avoid deep copies and preserve object identity across mutations.
- `reachableKeys` stays controller-local (derived during render), not in the store.
