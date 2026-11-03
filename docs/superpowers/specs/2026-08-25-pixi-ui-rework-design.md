# Pixi UI Rework Design

Date: 2026-08-25

## Problem

All screens and UI elements are currently rendered with React (`.tsx` components
in `src/screens/` and `src/ui/`), while the game map already renders in Pixi via
`gameController`. This keeps two rendering stacks (DOM + canvas) alive, plus two
input regimes. The goal: move every screen and UI element to Pixi, remove React
entirely, and keep the Zustand store exactly as it is.

## Decisions

1. **Remove React fully** — delete `react`, `react-dom`, `@types/react`,
   `@types/react-dom`, and `@vitejs/plugin-react` from dependencies; remove the
   plugin from `vite.config.ts`; drop the `jsx` tsconfig option; `index.html`
   loads `/src/main.ts` instead of `/src/main.tsx`. Zustand keeps working because
   it is framework-agnostic (`getState()` / `subscribe()`).
2. **Text input** — Pixi has no native inputs. Lobby name/room-code fields use a
   hidden DOM `<input>` overlaid on the canvas; a Pixi `Label` shows the value.
   Tapping the field focuses the DOM input (native keyboards work); typing
   updates the label; blur/Enter commits and hides it.
3. **Faithful port** — same layout, colors, fonts, positions, and behavior as
   today's CSS/JSX. No visual redesign.

## Architecture

### Boot flow

`src/main.ts` (replaces `main.tsx`):

1. Create a Pixi `Application`: `background: '#1a1a2e'`, `resizeTo: window`,
   `antialias: true`, `resolution: window.devicePixelRatio`, `autoDensity: true`.
2. Append the canvas to `#root`.
3. Construct `ScreenManager` (the app is the single owner of the canvas).

### Layering

`app.stage` (sortableChildren, three layers, top-most first):

1. `screenLayer` — the active screen's content: Start / Setup / Lobby, or for
   the game screen the map container + HUD.
2. `overlayLayer` — global overlays that sit above everything: PopupStack,
   CenterMessage, ConfirmDialog, ShipLandingDialog, SpawnDialog, SkillTree,
   GameOver.
3. Transient effects (floating hp text, score-fly, fog reveal) attach to the
   game container so they never linger on menu screens.

### ScreenManager (`src/ui/ScreenManager.ts`)

- Owns the `Application` and the two layers.
- Subscribes to `store.screen` (`useGameStore.subscribe`) and swaps the active
  screen controller (mount / destroy) whenever it changes.
- Exposes `app`, `screenLayer`, `overlayLayer`, and the current screen size
  (`app.screen.width/height`) for UI positioning.
- Registers a window `resize` handler that repositions the active screen's UI
  (autoDensity + `resolution` already handle DPR).

### Store integration

The store is the single source of truth. UI reads via `useGameStore.getState()`
and subscribes per-slice via `useGameStore.subscribe((state, prev) => ...)`,
re-rendering (redrawing) the affected widget. Actions are called on
`gameController` exactly as today — no API changes.

## Widget kit (`src/ui/kit/`)

- **`theme.ts`** — constants mirroring today's CSS: button fill `#3a3f5a`,
  hover `#4a5070`, panel `rgba(0,0,0,0.6)`, highlight `#ffd700`, radius 4,
  system-ui font stack, tribe colors from `src/config.ts`.
- **`Label`** — thin wrapper over Pixi `Text` (fontSize, fill, fontWeight,
  anchor).
- **`Panel`** — Graphics rounded-rect with fill + optional border; used for
  players list, money/turn info, selected-info, dialog cards, popups.
- **`Button`** — Container (Graphics bg + Label) with:
  - hover → bg `#4a5070`, `cursor: pointer`
  - active press → scale 0.96
  - disabled → opacity 0.5, non-interactive
  - selected → 3px white outline (Start/Setup/Lobby options)
  - auto-size from text + padding; emits `pointertap`
- **`Icon`** — loads PNGs from `public/textures/` (`coin.png`, `wood.png`,
  `stone.png`, `ore.png`, unit images) via `Texture.from`.
- **`TextInputOverlay`** — hidden DOM `<input>` positioned over the field,
  transparent and styled to match, plus a Pixi `Label` rendering the value.
  Tap field → focus input; typing updates label; blur/Enter commits and hides.
  Destroyed cleanly on screen switch.

## Screens (`src/ui/screens/`)

Each controller is a TS class with `mount(root: Container)` / `destroy()`; it
builds Pixi containers, registers pointer + window-keyboard listeners, and keeps
local UI state as instance fields.

### StartScreen

"Hex" title; "Single player" / "Multiplayer" buttons with white outline on the
selected option; hint line. `↑/↓` + Enter keyboard nav and click both work.

### SetupScreen

"Choose your tribe" (4 colored circles, gold ring on selected); "Enemies"
(1/2/3); "Mode" (Capture the map / 30 Turns); Start button. `↑/↓` switch
selector, `←/→` change value, Enter start; clicks supported. `mode` read from
the store (`setMode` persists); tribe/enemies are controller state.

### LobbyScreen

Three views (internal controller state), ported 1:1 from `LobbyScreen.tsx`:

- **Menu**: Host game / Join game / Back.
- **Host form**: name field, tribe buttons, human count 1–4, AI count
  (0..5−humans), mode buttons, Create room (disabled unless valid), Back.
- **Join form**: code (uppercase), name, Join (disabled unless 6-char code +
  name), "Connecting…" / "Connection failed" status, Back.
- **Room view** (once `lobby` set): room code, player rows (name, tribe,
  host/ready markers), your-tribe picker (excluding taken tribes), Start game /
  "I'm ready" button, "waiting for players" hint. Re-renders on `lobby` /
  `connection` store changes.

Text fields use `TextInputOverlay`. Actions: `gameController.hostGame`,
`joinGame`, `pickHostTribe`, `pickClientTribe`, `readyUp`, `startHostGame`,
`store.setScreen`.

## Game screen HUD (`src/ui/hud/`)

The GameScreen controller calls `gameController.init(app, mapLayer)` and builds
a HUD container. HUD widgets are small mount/destroy classes subscribing to the
store slices they need:

- **ScoreInfo** — gold circle badge (top-right), dark bold score text,
  scale-bounce on value change (replaces CSS `scorePop`).
- **Skills button** — top-right, opens skill tree via `setSkillTreeOpen(true)`.
- **TurnInfo** — top-left panel: "Capture the map. Turn N — TribeName";
  strikethrough text when the current player is inactive.
- **MoneyInfo** — top-center panel: coin/wood/stone/ore `Icon`s + amounts +
  income `(+N)`; money-pop scale tween on resource change.
- **PlayersList** — top-left panel (below TurnInfo): ranked players,
  tribe-colored, "(you)"/"(AI)" markers, strikethrough when inactive.
- **SelectedInfo** — bottom-left panel: terrain name + unit (HP, damage,
  village), village (level, pop, owner), building (kind/level/yield) lines;
  background = terrain color, dark text when light.
- **EndTurnButton** — bottom-right, disabled while `aiActive`;
  `gameController.endTurn()`.
- **ActionToolbar** — bottom-center row of action buttons computed with today's
  exact logic (capture / spawn / upgrade / build factory-mine-port / road /
  heal / extract / upgrade ship); hidden when no actions apply.

Animated effects use `app.ticker` tweens. Layout/colors match the current CSS.

## `gameController` refactor

The Application is no longer created/destroyed by `gameController`:

- **`init(app, container)`** replaces `init(container)`: receives the shared
  `Application` and a `Container` to render the map into (no canvas creation,
  no `resizeTo`). Handles the existing `pendingSnapshot` on first render.
- **`shutdown()`** replaces `destroy()` app teardown: destroys `mapView`,
  stops camera/inertia/exclamation tickers, removes window pointer listeners;
  does **not** destroy the app.
- All other logic stays: sim/commands, event presentation, camera/pan/zoom/
  drag/pinch, `render()`, net session logic.
- **Screen switch flow**: entering `screen === 'game'` → ScreenManager mounts
  GameScreen → `gameController.init(app, mapLayer)` + HUD build. Leaving the
  game screen → GameScreen.destroy → `gameController.shutdown()` + HUD teardown.
  The `sim` is kept so `getMap()`/`getSim()` still work after game over.
- **Input isolation**: interactive UI widgets and dialog backdrops are
  `eventMode: 'static'` on higher z-layers, so taps on them never fall through
  to map clicks (Pixi hits the topmost interactive target, not siblings).

## Overlays (`src/ui/overlays/`)

An `OverlayManager` subscribes to the store flags (`spawnDialogOpen`,
`skillTreeOpen`, `gameOver`, `pendingAttack`, `pendingShipLanding`, `popups`,
`centerMessage`) and mounts/destroys the matching overlay into `overlayLayer`:

- **PopupStack** — left-middle vertical stack of chips (popup background, text,
  close ✕); click or ✕ dismisses via `dismissPopup`.
- **CenterMessage** — centered box while `centerMessage` is set; auto-dismiss
  after 1s.
- **ConfirmDialog** (attack) — translucent backdrop (tap = cancel) + card
  "Attack {owner}'s {Unit}?" with Confirm/Cancel.
- **ShipLandingDialog** — same pattern: "Move to land and become a {Unit}
  again?".
- **SpawnDialog** — backdrop (tap outside = close) + card with unit circles
  (PNG in a circle, name, price). Tap a unit → spawn; if unaffordable/blocked →
  reason modal (reasons + OK). Reason state resets on close.
- **SkillTreeScreen** — full-screen panel: title, resources line, ring layout
  drawn with `Graphics` (node circles, parent lines, root tribe circle), node
  labels, ✓/cost text. Tap node → detail modal (name, description, cost, Open
  when affordable, Close). Escape closes detail then screen; Close button.
- **GameOverScreen** — dark full overlay: winner banner (tribe color), mode,
  fast-win bonus line, ranked score table, Play again → `setScreen('setup')`,
  Main menu → `setScreen('start')`.

## Config cleanup

- `package.json`: remove `react`, `react-dom`, `@types/react`,
  `@types/react-dom` from `dependencies`/`devDependencies`;
  `@vitejs/plugin-react` from `devDependencies`.
- `vite.config.ts`: remove the react plugin.
- `tsconfig.json`: remove the `jsx` option.
- `index.html`: load `/src/main.ts`.
- Delete: `src/App.tsx`, `src/main.tsx`, all `.tsx` files under `src/screens/`
  and `src/ui/` (replaced by the TS controllers/kit above).

## Files touched

- New: `src/main.ts`, `src/ui/ScreenManager.ts`, `src/ui/kit/*`,
  `src/ui/screens/*`, `src/ui/hud/*`, `src/ui/overlays/*`.
- Modified: `src/controller/gameController.ts` (init/shutdown refactor),
  `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`.
- Deleted: `src/App.tsx`, `src/main.tsx`, `src/screens/**/*.tsx`,
  `src/ui/**/*.tsx`.
- Untouched: `src/store/gameStore.ts`, `src/game/**`, `src/render/**`,
  `src/net/**`, `src/ui/popupQueue.ts`.

## Testing

- `npm run typecheck` and `npm test` must pass. All 40 test files are
  framework-agnostic (pure game logic + store); the store tests stay unchanged.
  No UI tests are added.
- Manual smoke test (`npm run dev`): Start → Setup → start single game (HUD,
  popups, attack confirm, ship landing, spawn dialog + reason modal, skill tree
  + detail, end turn, game over → Play again / Main menu); multi-player host
  lobby (name/code text input, tribe/human/AI/mode pickers, room view with
  player list, ready/start); a mobile-sized viewport check.
