# Adaptive Spawn Dialog Circles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the spawn dialog's unit circles wrap into centered multiple rows when they don't fit in the popup width.

**Architecture:** Add `flexWrap: 'wrap'` and `justifyContent: 'center'` to the existing circles flex row in `src/ui/SpawnDialog.tsx`. Pure CSS; no JS, no breakpoints, no other files.

**Tech Stack:** React inline styles.

## Global Constraints

- Inline `style={{...}}` only — no CSS files, no classes/ids added.
- No store (`gameStore`) changes.
- `npm run typecheck` and `npm test` must pass.
- No component-level automated test exists for `SpawnDialog` (node test env); verification is typecheck + test suite + manual browser check.

---

### Task 1: Enable circle wrapping in the spawn dialog

**Files:**
- Modify: `src/ui/SpawnDialog.tsx` (the circles row `<div>` around line 204)

**Interfaces:**
- Consumes: nothing new.
- Produces: the circles row now wraps; nothing downstream consumes the changed style.

- [ ] **Step 1: Add wrapping to the circles row**

In `src/ui/SpawnDialog.tsx`, find the row that maps the unit circles:

```tsx
        <div style={{ display: 'flex', gap: 12 }}>
```

Change it to:

```tsx
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
```

No other styles or elements change. The card keeps `maxWidth: 320` (in `cardStyle`), so at that width four ~80px circles wrap onto two centered rows on narrow screens, and stay on one row on wide screens.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the app, start a game, open the spawn dialog.

Checklist:
1. At a wide window: the 4 unit circles sit in one centered row.
2. Shrink the window (or a narrow/mobile viewport): circles wrap onto multiple
   centered rows (e.g. 2×2 or 3+1) with no horizontal overflow or clipping.
3. Wide again: layout returns to a single row.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SpawnDialog.tsx
git commit -m "feat: wrap spawn dialog circles onto multiple rows when needed"
```
