# Sound system and settings panel button groups

Date: 2026-09-08

## Goal

- Introduce a small, extensible sound system that plays `public/sounds/*.wav`
  clips and is governed by a persisted on/off setting.
- Rework the start-screen Settings panel so the AI difficulty and Language
  rows use the shared `ButtonGroup` component, and add a Sound row (On/Off)
  using the same component.
- Play the `click.wav` sound on: every button click/activation, every user
  checkbox flip, and every hex tap that results in a selection.

## Current state

- Settings UI is `SettingsPanel` inside `src/ui/screens/StartScreen.ts` (a
  `Popup`). Difficulty and language rows are hand-placed `Button`s with gaps,
  not `ButtonGroup`.
- `src/ui/kit/buttonGroup.ts` already exists and is used by `SetupScreen.ts`
  (its `refresh()` toggles `button.selected` per current value).
- `GameSettings` in `src/storage/settings.ts` persists
  `attackConfirmation`, `aiDifficulty`, `disableTips`, `lang` under
  `localStorage` key `hex-settings-v1`.
- Hex taps route through `gameController.handleMapClick(q, r)`
  (`src/controller/gameController.ts:565`), called from the map view
  `pointertap` handler.
- `public/sounds/click.wav` exists (RIFF PCM 16-bit stereo 44.1 kHz).
- Vite `base` is `/hex/`; existing assets resolve via
  `${import.meta.env.BASE_URL}...`.

## Design

### 1. Sound module — `src/sound/sfx.ts`

A single function with a name → file registry so future sounds only need a
registry entry plus a file drop:

```ts
const FILES: Record<string, string> = { click: 'click.wav' };
const cache = new Map<string, HTMLAudioElement>();
export function play(name: string): void;
```

Behavior:

- Resolves the URL as `${import.meta.env.BASE_URL}sounds/${FILES[name]}`.
- Unknown name → no-op.
- No-ops when `soundEnabled()` is false or when `Audio` is not defined (node
  test environment).
- Caches one `Audio` element per name. Retrigger by `pause()`, reset
  `currentTime = 0`, then `play()` (so rapid taps do not stack overlapping
  clips).
- `play()` returns a promise; catch load/autoplay errors silently.

No module in `src/` imports `pixi.js` for this; it is plain DOM audio.

### 2. Settings persistence — `src/storage/settings.ts`

- Add `soundOn: boolean` to `GameSettings` and `DEFAULTS` (`true`).
- Add `soundEnabled(): boolean` and `setSoundEnabled(enabled: boolean): void`
  mirroring existing accessors. Old persisted settings without the field fall
  back to the default (`true`) via the existing spread merge.

### 3. Settings panel — `src/ui/screens/StartScreen.ts`

Rework `SettingsPanel`:

- **Attack confirmation** row: unchanged (checkbox + tappable label).
- **AI difficulty**: replace the hand-placed buttons with a `ButtonGroup`
  of Easy / Normal / Hard, using `difficulty.*` i18n keys; persist via
  `setAiDifficulty` and mark the matching button `selected`.
- **Disable tips** row: unchanged.
- **Language**: replace the hand-placed buttons with a `ButtonGroup` of
  English / Русский (`lang.en` / `lang.ru` keys); on pick, `setLanguage`
  then `window.location.reload()` as today; mark current language selected.
- **Sound**: new label row + `ButtonGroup` On / Off (`common.on` /
  `common.off`); persist via `setSoundEnabled`; mark current state selected.
- Re-space the fixed-height rows so the panel content fits the groups
  (groups have no inter-button gaps, so widths shrink slightly vs today).

### 4. Global click wiring

- `Button` (`src/ui/kit/button.ts`): call `play('click')` at the start of
  `onTap` (before `onClick`) and in `trigger()` (keyboard activation). This
  covers every button on every screen, including the new `ButtonGroup`s.
  Playing before `onClick` means the button that turns Sound Off still gives
  its final click.
- `Checkbox` (`src/ui/kit/checkbox.ts`): add a user-flip path
  `tap()` that plays `play('click')` then calls `onToggle(!on)`; the
  container's `pointertap` calls `tap()`. Expose `tap` on the returned
  `Checkbox` object so the settings row labels flip through the same single
  code path (no double sound). `setChecked` stays a silent programmatic setter.
- Hex selection (`gameController.handleMapClick`): play `play('click')`
  exactly when a tap ends in a selection being made — the post-move reselect
  branch and the final `cycleSelection`/`setSelection` path. Taps on
  unexplored fog, taps that only clear a selection, and taps that open an
  attack-confirmation overlay (no new selection) stay silent.

### 5. i18n

Add to `src/i18n/locales/en.ts` and `ru.ts`:

| key | en | ru |
| --- | --- | --- |
| `settings.sound` | Sound | Звук |
| `common.on` | On | Вкл |
| `common.off` | Off | Выкл |

Place under the existing Settings and Common sections respectively.

## Testing

- `tests/settings.test.ts` gets a `soundOn` block mirroring the existing
  ones: defaults to `true`; `setSoundEnabled(false)` → `soundEnabled()`
  false; round-trip back to `true`.
- The existing `saveSettings({ ... })` literal at `tests/settings.test.ts:35`
  must gain `soundOn` so `npm run typecheck` stays green.
- Existing `handleMapClick` tests (`tests/toolbarSpecs.test.ts`) keep passing:
  `play` no-ops in the node env (no `Audio`), so selection logic is unchanged.
- `sfx` unit test (node env): `play('missing')` does not throw; `play('click')`
  is a safe no-op without `Audio`.

## Verification

- `npm test`
- `npm run typecheck`
- Manual smoke: start screen → Settings; change difficulty/language/sound with
  groups; each change is heard; turning Sound Off silences further clicks;
  in a game, tapping hexes that select plays the click and fog taps stay
  silent.
