# Money Panel Icons and Merged Turn Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enlarge resource icons and remove their text labels; merge the mode label into the turn-info box positioned at the left-top corner.

**Architecture:** Two component edits (`MoneyInfo.tsx`, `TurnInfo.tsx`), one screen edit removing the mode label (`GameScreen.tsx`), and a CSS repositioning in `index.html`.

**Tech Stack:** TypeScript, React 19, CSS, Vite, Vitest.

## Global Constraints

- No new dependencies.
- No game-logic changes.
- Existing 290 tests pass; `npm run typecheck` clean.

---

### Task 1: Enlarge money panel icons and remove labels

**Files:**
- Modify: `src/screens/hud/MoneyInfo.tsx`

**Interfaces:**
- Consumes: `human.resources.{money,wood,stone,ore}` and income annotations (unchanged).
- Produces: 27px icons; resource label words removed.

- [ ] **Step 1: Enlarge icons and remove labels**

In `src/screens/hud/MoneyInfo.tsx`, change the icon style width/height from `18` to `27`:

```ts
  const iconStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 27,
    height: 27,
    marginLeft: 8,
    marginRight: 4,
    verticalAlign: 'middle',
  };
```

Replace the return block with the label-free version:

```tsx
  return (
    <div id="money-info" style={{ fontSize: 24 }}>
      <img src={`${TEXTURE_BASE}coin.png`} style={iconStyle} alt="money" />
      <span>{money}{moneyIncome > 0 ? ` (+${moneyIncome})` : ''}</span>
      <img src={`${TEXTURE_BASE}wood.png`} style={iconStyle} alt="wood" />
      <span>{wood}{building.wood > 0 ? ` (+${building.wood})` : ''}</span>
      <img src={`${TEXTURE_BASE}stone.png`} style={iconStyle} alt="stone" />
      <span>{stone}{building.stone > 0 ? ` (+${building.stone})` : ''}</span>
      <img src={`${TEXTURE_BASE}ore.png`} style={iconStyle} alt="ore" />
      <span>{ore}{building.ore > 0 ? ` (+${building.ore})` : ''}</span>
    </div>
  );
```

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/screens/hud/MoneyInfo.tsx
git commit -m "feat: enlarge resource icons and drop labels"
```

---

### Task 2: Merge mode label into turn-info and move it to the left-top corner

**Files:**
- Modify: `src/screens/hud/TurnInfo.tsx`
- Modify: `src/screens/GameScreen.tsx`
- Modify: `index.html`

**Interfaces:**
- Consumes: `mode` from the store, `players`/`localPlayerIndex` from the store, `GAME_MODE_NAMES` from `../game/gameMode`, `TRIBES` from `../game/tribes`.
- Produces: a single `#turn-info` box reading `"{Mode name}. Turn {N} — {TribeName}"`; no separate mode label.

- [ ] **Step 1: Rewrite `TurnInfo.tsx`**

Replace the file with:

```tsx
import { useGameStore } from '../../store/gameStore';
import { GAME_MODE_NAMES } from '../../game/gameMode';
import { TRIBES } from '../../game/tribes';

export function TurnInfo(): React.ReactElement {
  const turn = useGameStore((s) => s.turn);
  const mode = useGameStore((s) => s.mode);
  const players = useGameStore((s) => s.players);
  const localIndex = useGameStore((s) => s.localPlayerIndex);
  const player = useGameStore((s) => s.players[s.currentPlayerIndex]);
  const human = players[localIndex];
  const tribeName = human ? (TRIBES.find((t) => t.id === human.tribe)?.name ?? '') : '';
  return (
    <div id="turn-info">
      {player ? `${GAME_MODE_NAMES[mode]}. Turn ${turn} — ` : ''}
      {player ? (
        <span style={{ textDecoration: player.isActive ? 'none' : 'line-through' }}>{tribeName || player.name}</span>
      ) : (
        ''
      )}
    </div>
  );
}
```

Note: `tribeName` comes from the local player; if missing (e.g., game over edge), fall back
to `player.name`.

- [ ] **Step 2: Remove the mode label from `GameScreen.tsx`**

- Remove the import `GAME_MODE_NAMES` (line 6).
- Remove the `<div id="mode-label">{GAME_MODE_NAMES[mode]}</div>` line (line 47).
- Remove the `const mode = useGameStore((s) => s.mode);` line (line 25) and its `GameMode`
  import if it becomes unused (check `GAME_MODE_NAMES` was its only use).

- [ ] **Step 3: Update `index.html` CSS**

- Replace the `#mode-label` rule (line 27) with repositioning for `#turn-info`:

```css
    #turn-info { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
```

- Change `#players-list` top from `40px` to `52px` so it stacks below the moved turn-info:

```css
    #players-list { position: absolute; top: 52px; left: 8px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
```

- Remove the `#mode-label` line from the mobile `@media (max-width: 600px)` block (the
  `#mode-label { top: 60px; ... }` override), and adjust `#players-list`/`#turn-info`
  there to keep them stacked (e.g. `#players-list { top: 44px; left: 4px; ... }` and
  `#turn-info { top: 4px; left: 4px; ... }`).

- [ ] **Step 4: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/hud/TurnInfo.tsx src/screens/GameScreen.tsx index.html
git commit -m "feat: merge mode label into left-top turn info"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a game.
Check:
- The money panel (top-center) shows 27px coin/wood/stone/ore icons with no `Wood:`/`Stone:`/
  `Ore:` text labels.
- The left-top box reads `"Capture the map. Turn 1 — Cats"` (or the selected mode/tribe).
- No separate mode label box remains; `#players-list` sits below the turn-info without
  overlapping.
- On a narrow (mobile) viewport the same elements remain non-overlapping.
