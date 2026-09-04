# Resource Icons in Money Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the star glyph and colored-square icons in the money panel with the new resource PNGs.

**Architecture:** Swap four icon renderings in `src/screens/hud/MoneyInfo.tsx` to `<img>` tags using the existing `/textures/...` public path.

**Tech Stack:** TypeScript, React 19, Vite, Vitest.

## Global Constraints

- No new dependencies.
- No game-logic changes.
- Existing 290 tests pass; `npm run typecheck` clean.

---

### Task 1: Use resource images in the money panel

**Files:**
- Modify: `src/screens/hud/MoneyInfo.tsx`

**Interfaces:**
- Consumes: `human.resources.{money,wood,stone,ore}` and income annotations (unchanged).
- Produces: the panel renders coin/wood/stone/ore images next to the values.

- [ ] **Step 1: Replace `squareStyle` with `iconStyle` and swap the icons**

In `src/screens/hud/MoneyInfo.tsx`:

a. Replace the `squareStyle` const (lines 18-25) with:

```ts
  const iconStyle: React.CSSProperties = {
    display: 'inline-block',
    width: 18,
    height: 18,
    marginLeft: 8,
    marginRight: 4,
    verticalAlign: 'middle',
  };
```

b. Replace the return block (lines 27-37) with:

```tsx
  return (
    <div id="money-info" style={{ fontSize: 24 }}>
      <img src="/textures/coin.png" style={iconStyle} alt="money" />
      <span>{money}{moneyIncome > 0 ? ` (+${moneyIncome})` : ''}</span>
      <img src="/textures/wood.png" style={iconStyle} alt="wood" />
      <span>Wood: {wood}{building.wood > 0 ? ` (+${building.wood})` : ''}</span>
      <img src="/textures/stone.png" style={iconStyle} alt="stone" />
      <span>Stone: {stone}{building.stone > 0 ? ` (+${building.stone})` : ''}</span>
      <img src="/textures/ore.png" style={iconStyle} alt="ore" />
      <span>Ore: {ore}{building.ore > 0 ? ` (+${building.ore})` : ''}</span>
    </div>
  );
```

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/screens/hud/MoneyInfo.tsx
git commit -m "feat: use resource images in money panel"
```

---

### Task 2: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a game.
Check: the money panel (top-center) shows coin, wood, stone, and ore images beside their
counts and income annotations, with no missing-image icons.
