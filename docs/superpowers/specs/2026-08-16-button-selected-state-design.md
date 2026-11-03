# Design: Selected state for setup buttons

Date: 2026-08-16

## Goal

Make the currently selected option visible on the setup screen. Tribe and enemy-count buttons get a white ring (outline) when selected. Defaults are pre-highlighted on load.

## Background

`src/screens/setupScreen.ts` already toggles a `selected` CSS class on click, but no `.selected` rule exists in `index.html`, so nothing is visible. Defaults (Villagers, 1 enemy) are also not highlighted initially.

## Changes

### CSS (`index.html`)

Add a `.selected` rule using `outline` (not `border`) so button size doesn't shift:

```css
button.selected { outline: 3px solid #fff; }
```

### setupScreen.ts

Pre-add the `selected` class to the default buttons on creation:
- The tribe button matching `TRIBES[0]` (Villagers).
- The enemy-count button for `1`.

Click handlers already manage the class on selection, so no other logic changes.

## Scope

- Tribe buttons and enemy-count buttons on the setup screen only.
- The Start button (not part of a selection group) is unchanged.
