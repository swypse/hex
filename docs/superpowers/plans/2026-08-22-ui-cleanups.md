# UI Cleanups: ESC Close, Empty Containers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the skill tree with ESC and stop rendering empty containers for selected-info and the action toolbar.

**Architecture:** Three isolated React component changes: a `keydown` effect in the skill tree, and `null` returns in the two HUD components.

**Tech Stack:** TypeScript, React 19, Vite, Vitest.

## Global Constraints

- No new dependencies.
- No game-logic changes.
- Existing 287 tests pass; `npm run typecheck` clean.

---

### Task 1: ESC closes the skill tree

**Files:**
- Modify: `src/screens/SkillTreeScreen.tsx`

**Interfaces:**
- Consumes: `selected`, `setSelected`, `setSkillTreeOpen` (already available in the component).
- Produces: pressing ESC closes the skill-detail dialog first, then the whole tree.

- [ ] **Step 1: Add the `useEffect`**

In `src/screens/SkillTreeScreen.tsx`:
- Add `useEffect` to the React import on line 1: `import { useEffect, useState } from 'react';`
- Inside the component, after `const [selected, setSelected] = useState<SkillId | null>(null);` (line 24), add:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (selected !== null) {
        setSelected(null);
      } else {
        setSkillTreeOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, setSelected, setSkillTreeOpen]);
```

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SkillTreeScreen.tsx
git commit -m "feat: close skill tree with ESC"
```

---

### Task 2: SelectedInfo returns nothing when there is no content

**Files:**
- Modify: `src/screens/hud/SelectedInfo.tsx`

**Interfaces:**
- Produces: component returns `null` (renders nothing) instead of an empty `<div id="selected-info" />` when there is no selection, no map, no tile, or the tile is unexplored.

- [ ] **Step 1: Replace the four early returns**

In `src/screens/hud/SelectedInfo.tsx`, replace each of the four early-return lines:

- Line 29: `if (!selection) return <div id="selected-info" />;` → `if (!selection) return null;`
- Line 31: `if (!map) return <div id="selected-info" />;` → `if (!map) return null;`
- Line 33: `if (!tile) return <div id="selected-info" />;` → `if (!tile) return null;`
- Line 35: `if (!human || !isExploredFor(tile, human.index)) return <div id="selected-info" />;` → `if (!human || !isExploredFor(tile, human.index)) return null;`

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/screens/hud/SelectedInfo.tsx
git commit -m "feat: hide empty selected-info container"
```

---

### Task 3: ActionToolbar returns nothing when there are no actions

**Files:**
- Modify: `src/screens/hud/ActionToolbar.tsx`

**Interfaces:**
- Produces: component returns `null` when there is no selection/map/tile/player, and when `buttons` is empty.

- [ ] **Step 1: Replace the four early returns**

In `src/screens/hud/ActionToolbar.tsx`, replace each early-return line:

- Line 18: `if (!selection) return <div id="action-toolbar"/>;` → `if (!selection) return null;`
- Line 20: `if (!map) return <div id="action-toolbar"/>;` → `if (!map) return null;`
- Line 22: `if (!tile) return <div id="action-toolbar"/>;` → `if (!tile) return null;`
- Line 24: `if (!player) return <div id="action-toolbar"/>;` → `if (!player) return null;`

- [ ] **Step 2: Guard the final render on non-empty buttons**

Replace the final return (line 108-109) with:

```tsx
  if (buttons.length === 0) return null;

  return <div id="action-toolbar"
              style={{ background: 'rgba(0,0,0,.5)', borderRadius: 4, padding: '6px 16px' }}>{buttons}</div>;
```

- [ ] **Step 3: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/screens/hud/ActionToolbar.tsx
git commit -m "feat: hide empty action toolbar"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a game.
Check:
- Open the skill tree, then press ESC: if a skill-detail dialog is open it closes first;
  a second ESC closes the tree.
- Deselect everything: no empty black box bottom-left.
- Select a plain tile with no actions (e.g., empty water): no empty toolbar bottom-center.
- Select a unit/village with actions: toolbar and selected-info appear as before.
