# UI Cleanups: ESC Close, Empty Containers Design

Date: 2026-08-22

## Problem

Three small UI issues:

1. The skill tree can only be closed with the Close button — ESC should close it.
2. `SelectedInfo` renders an empty black box when nothing is selected.
3. `ActionToolbar` renders an empty container when the selection offers no actions.

## Design

### 1. ESC closes the skill tree (`src/screens/SkillTreeScreen.tsx`)

Add a `useEffect` with a `keydown` listener on `window`, matching the existing pattern in
`StartScreen.tsx` / `SetupScreen.tsx`. Precedence:

- If the skill-detail dialog is open (`selected !== null`), ESC closes the dialog first
  (`setSelected(null)`).
- Otherwise, ESC closes the whole tree (`setSkillTreeOpen(false)`).

```ts
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

### 2. SelectedInfo: no empty container (`src/screens/hud/SelectedInfo.tsx`)

The four early-return branches (`!selection`, `!map`, `!tile`, unexplored) currently return
`<div id="selected-info" />`, which renders an empty styled box. Change all four to `null`.

### 3. ActionToolbar: no empty container (`src/screens/hud/ActionToolbar.tsx`)

- The four early-return branches (`!selection`, `!map`, `!tile`, `!player`) change to `null`.
- The final render returns the toolbar container only when it has buttons: after building
  `buttons`, return `null` when `buttons.length === 0`, otherwise the existing container.

## Files touched

- `src/screens/SkillTreeScreen.tsx`
- `src/screens/hud/SelectedInfo.tsx`
- `src/screens/hud/ActionToolbar.tsx`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass (no logic changes).
- Manual: ESC closes the skill dialog then the tree; no empty black box bottom-left when
  nothing is selected; no empty toolbar bottom-center when no actions are available.
