# Text Button Styling and Lobby Copy Button Design

Date: 2026-08-25

## Problem

Two items:

1. Text buttons (especially on the multiplayer/lobby screens) should have a clear
   hover/focus effect, and all text buttons should share a single common style so
   they look consistent.
2. The lobby room code (`Code: XXXXXX`) is a Pixi text label and can't be
   selected/copied; players need a copy button.

## Section 1 — Common text-button style + hover/focus ring

- `src/ui/kit/theme.ts`: add a shared style constant:

  ```ts
  export const TEXT_BUTTON = {
    fontSize: 16,
    paddingX: 16,
    paddingY: 8,
    minHeight: 34,
  } as const;
  ```

- `src/ui/kit/button.ts`: use `TEXT_BUTTON` for the `Button` defaults
  (`fontSize`, `paddingX`, `paddingY`, min height). On `pointerover`, in addition
  to the existing hover fill (`THEME.buttonHover`), draw a gold `THEME.highlight`
  ring around the button (matching `IconButton`); `pointerout` restores. Disabled
  buttons don't react.
- Screens keep explicit `width` (and the toolbar's larger sizing) only where
  intended; the base appearance is now unified across every text button.

## Section 2 — Copy button next to the lobby code

- `src/ui/kit/button.ts`: add `setLabel(text: string): void` to update the
  button's text (used for the transient "Copied!" state).
- `src/ui/screens/LobbyScreen.ts`, `renderRoom`: place a small **Copy** `Button`
  next to the `Code: XXXX` label. On click:
  - `void navigator.clipboard.writeText(lobby.code).catch(() => {})`
  - `button.setLabel('Copied!')`, then after ~1500ms `setLabel('Copy')`.
- Pixi text remains non-selectable; the button is the copy mechanism.

## Files touched

- Modify: `src/ui/kit/theme.ts`, `src/ui/kit/button.ts`,
  `src/ui/screens/LobbyScreen.ts`.

## Testing

- `npm run typecheck` and `npm test` must pass.
- Manual (`npm run dev`):
  1. Hovering any text button (start, lobby, toolbar) shows the gold ring +
     hover color; pressing still scales down; disabled buttons don't react.
  2. In a hosted lobby, the code row shows a Copy button; clicking it copies the
     room code to the clipboard and shows "Copied!" briefly.
