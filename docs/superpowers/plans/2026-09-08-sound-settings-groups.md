# Sound System & Settings Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an extensible sound system (playback of `public/sounds/*.wav`, governed by a persisted on/off setting), convert the Settings panel's AI-difficulty and Language rows to `ButtonGroup`s plus a new Sound On/Off `ButtonGroup`, and play the click sound on every button/checkbox interaction and every hex tap that selects.

**Architecture:** A small DOM-audio module `src/sound/sfx.ts` maps logical names to WAV files and no-ops when `Audio` is unavailable or sound is off. A new persisted `soundOn` flag lives in `GameSettings`. Click playback is wired centrally into the shared UI kit (`Button`, `IconButton`, `Checkbox`) so every screen gets it for free, and into `gameController.handleMapClick` for hex-selection clicks. The Settings panel rows are rebuilt with `ButtonGroup`.

**Tech Stack:** TypeScript (strict), PixiJS 8 UI kit (`Container`, `Graphics`, `Text`), Zustand store, Vitest (node env), Vite (`base: '/hex/'`).

## Global Constraints

- TypeScript strict mode; `noUncheckedIndexedAccess` on. Do not add code comments.
- Sound files live in `public/sounds/*.wav` and are referenced as `${import.meta.env.BASE_URL}sounds/<file>`.
- `sfx` must be a silent no-op when `typeof Audio === 'undefined'` (the node test env has no `Audio`) and when sound is disabled.
- New i18n keys must be added to **both** `src/i18n/locales/en.ts` and `src/i18n/locales/ru.ts`.
- Existing behaviour kept: hex tap plays a click only when the tap results in a selection; fog taps, taps that only clear a selection, and taps that open the attack-confirmation overlay stay silent. Language change still reloads the page.
- All tests must pass: `npm test`. Typecheck must pass: `npm run typecheck`.

---

### Task 1: Persist the `soundOn` setting

**Files:**
- Modify: `src/storage/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Consumes: existing `loadSettings()` / `saveSettings()`.
- Produces: `soundEnabled(): boolean` and `setSoundEnabled(enabled: boolean): void` on `GameSettings` (field `soundOn: boolean`, default `true`). Task 2 (sfx) and Task 6 (settings panel) depend on these.

- [ ] **Step 1: Write the failing tests**

In `tests/settings.test.ts`, add `soundEnabled` and `setSoundEnabled` to the import list from `'../src/storage/settings'`:

```ts
import {
  attackConfirmationEnabled,
  loadSettings,
  saveSettings,
  setAiDifficulty,
  setAttackConfirmation,
  setSoundEnabled,
  setTipsDisabled,
  soundEnabled,
  tipsDisabled,
} from '../src/storage/settings';
```

Fix the existing full-literal `saveSettings` call (line 35) — it must include the new field or `npm run typecheck` fails:

```ts
saveSettings({ attackConfirmation: false, aiDifficulty: 'normal', disableTips: false, lang: 'en', soundOn: true });
```

Append a new describe block at the end of the file:

```ts
describe('Sound setting', () => {
  it('defaults to enabled', () => {
    fakeStorage();
    expect(loadSettings().soundOn).toBe(true);
    expect(soundEnabled()).toBe(true);
  });

  it('round-trips a disabled sound value', () => {
    fakeStorage();
    setSoundEnabled(false);
    expect(soundEnabled()).toBe(false);
    expect(loadSettings().soundOn).toBe(false);
    setSoundEnabled(true);
    expect(soundEnabled()).toBe(true);
    expect(loadSettings().soundOn).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL — `soundEnabled` is not exported / `soundOn` missing.

- [ ] **Step 3: Implement the setting**

In `src/storage/settings.ts`:

Add to the `GameSettings` interface (after `lang: Language;`):

```ts
  soundOn: boolean;
```

Add to `DEFAULTS` (after `lang: 'en',`):

```ts
  soundOn: true,
```

Add accessors at the end of the file (after `setLanguage`):

```ts
export function soundEnabled(): boolean {
  return loadSettings().soundOn;
}

export function setSoundEnabled(enabled: boolean): void {
  saveSettings({ ...loadSettings(), soundOn: enabled });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/settings.ts tests/settings.test.ts
git commit -m "feat: persist sound on/off setting"
```

---

### Task 2: Sound module `src/sound/sfx.ts`

**Files:**
- Create: `src/sound/sfx.ts`
- Test: `tests/sfx.test.ts`
- Add (already on disk, currently untracked): `public/sounds/click.wav`

**Interfaces:**
- Consumes: `soundEnabled()` from Task 1.
- Produces:
  - `soundUrl(name: string): string | null` — full URL for a known sound name, `null` for unknown names.
  - `play(name: string): void` — plays the sound; silent no-op if `Audio` is undefined, sound is off, or the name is unknown.
  - `export const sfx = { play, soundUrl }` — the object form lets tests `vi.spyOn(sfx, 'play')`. Consumers must import `sfx` and call `sfx.play(...)`.
  - Registry starts with one entry: `click` → `click.wav`.

- [ ] **Step 1: Write the failing test**

Create `tests/sfx.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sfx, soundUrl } from '../src/sound/sfx';

describe('sfx', () => {
  it('maps known names to the public sounds directory', () => {
    expect(soundUrl('click')).toMatch(/sounds\/click\.wav$/);
  });

  it('returns null for an unknown name', () => {
    expect(soundUrl('missing')).toBeNull();
  });

  it('no-ops play when Audio is unavailable', () => {
    expect(() => sfx.play('click')).not.toThrow();
    expect(() => sfx.play('missing')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sfx.test.ts`
Expected: FAIL — cannot resolve `../src/sound/sfx`.

- [ ] **Step 3: Write the module**

Create `src/sound/sfx.ts`:

```ts
import { soundEnabled } from '../storage/settings';

const FILES: Record<string, string> = {
  click: 'click.wav',
};

const cache = new Map<string, HTMLAudioElement>();

export function soundUrl(name: string): string | null {
  const file = FILES[name];
  if (!file) return null;
  return `${import.meta.env.BASE_URL}sounds/${file}`;
}

export function play(name: string): void {
  if (typeof Audio === 'undefined') return;
  if (!soundEnabled()) return;
  const url = soundUrl(name);
  if (!url) return;
  let el = cache.get(name);
  if (!el) {
    el = new Audio(url);
    cache.set(name, el);
  }
  el.pause();
  el.currentTime = 0;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

export const sfx = { play, soundUrl };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/sfx.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (also tracks the sound asset)**

```bash
git add src/sound/sfx.ts tests/sfx.test.ts public/sounds/click.wav
git commit -m "feat: sfx module playing public/sounds wav clips"
```

---

### Task 3: Click sound on buttons and checkboxes

**Files:**
- Modify: `src/ui/kit/button.ts`
- Modify: `src/ui/kit/iconButton.ts`
- Modify: `src/ui/kit/checkbox.ts`
- Test: `tests/uiClickSounds.test.ts`

**Interfaces:**
- Consumes: `sfx.play` from Task 2.
- Produces: `Button` plays `click` on `pointertap` and `trigger()` before running `onClick` (disabled → silent); `IconButton` plays `click` on `pointertap` before `onClick`; `Checkbox` gains a `tap()` method (`sfx.play('click')` then `onToggle(!checked)`) and its container `pointertap` calls `tap()`. `setChecked` stays a silent programmatic setter. Task 6 uses `checkbox.tap()` for the settings-row labels.

- [ ] **Step 1: Write the failing tests**

Create `tests/uiClickSounds.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../src/ui/kit/button';
import { IconButton } from '../src/ui/kit/iconButton';
import { makeCheckbox } from '../src/ui/kit/checkbox';
import { sfx } from '../src/sound/sfx';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}

describe('UI click sounds', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as { Image?: unknown }).Image = FakeImage;
    spy = vi.spyOn(sfx, 'play');
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('plays a click when a Button is tapped', () => {
    const onClick = vi.fn();
    const btn = new Button({ label: 'X', onClick });
    btn.emit('pointertap', {} as never);
    expect(onClick).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('click');
    btn.destroy({ children: true });
  });

  it('plays a click when a Button is triggered by keyboard', () => {
    const onClick = vi.fn();
    const btn = new Button({ label: 'X', onClick });
    btn.trigger();
    expect(onClick).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('click');
    btn.destroy({ children: true });
  });

  it('does not play a click for a disabled Button', () => {
    const btn = new Button({ label: 'X', onClick: () => {} });
    btn.disabled = true;
    btn.emit('pointertap', {} as never);
    expect(spy).not.toHaveBeenCalled();
    btn.destroy({ children: true });
  });

  it('plays a click when an IconButton is tapped', () => {
    const onClick = vi.fn();
    const btn = new IconButton({ icon: 'x.png', onClick });
    btn.emit('pointertap', {} as never);
    expect(onClick).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('click');
    btn.destroy({ children: true });
  });

  it('plays a click when a checkbox is flipped by the user', () => {
    const onToggle = vi.fn();
    const cb = makeCheckbox(false, onToggle);
    cb.el.emit('pointertap', {} as never);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(spy).toHaveBeenCalledWith('click');
    cb.el.destroy({ children: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/uiClickSounds.test.ts`
Expected: FAIL — `sfx.play` not called.

- [ ] **Step 3: Implement in `Button`**

In `src/ui/kit/button.ts`, add the import after line 3 (`import { TEXT_BUTTON, THEME } from './theme';`):

```ts
import { sfx } from '../../sound/sfx';
```

Replace this existing block:

```ts
  private onTap = (): void => {
    if (!this._disabled) this.onClick();
  };

  trigger(): void {
    if (!this._disabled) this.onClick();
  }
```

with:

```ts
  private onTap = (): void => {
    if (this._disabled) return;
    sfx.play('click');
    this.onClick();
  };

  trigger(): void {
    if (this._disabled) return;
    sfx.play('click');
    this.onClick();
  }
```

- [ ] **Step 4: Implement in `IconButton`**

In `src/ui/kit/iconButton.ts`, add the import after line 2 (`import { makeIcon } from './icon';`):

```ts
import { sfx } from '../../sound/sfx';
```

Replace this existing block:

```ts
  private onTap = (): void => {
    if (!this._disabled) this.onClick();
  };
```

with:

```ts
  private onTap = (): void => {
    if (this._disabled) return;
    sfx.play('click');
    this.onClick();
  };
```

- [ ] **Step 5: Implement in `Checkbox`**

Replace the whole file `src/ui/kit/checkbox.ts` with:

```ts
import { Container, Graphics } from 'pixi.js';
import { makeLabel } from './label';
import { sfx } from '../../sound/sfx';

export interface Checkbox {
  el: Container;
  setChecked(checked: boolean): void;
  tap(): void;
}

export function makeCheckbox(checked: boolean, onToggle: (checked: boolean) => void): Checkbox {
  const el = new Container();
  const size = 22;
  let on = checked;
  const bg = new Graphics();
  const mark = makeLabel('\u2713', { fontSize: 15, fill: 0xffffff, fontWeight: '700' });
  mark.anchor.set(0.5, 0.5);
  mark.position.set(size / 2, size / 2);

  const paint = (): void => {
    bg.clear();
    bg.roundRect(0, 0, size, size, 4);
    if (on) bg.fill(0x5099ff);
    bg.stroke({ width: 2, color: 0xcccccc });
    mark.visible = on;
  };
  paint();

  el.addChild(bg, mark);
  el.eventMode = 'static';
  el.cursor = 'pointer';

  const tap = (): void => {
    sfx.play('click');
    onToggle(!on);
  };
  el.on('pointertap', tap);

  const setChecked = (value: boolean): void => {
    on = value;
    paint();
  };

  return { el, setChecked, tap };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/uiClickSounds.test.ts tests/button.test.ts tests/iconButton.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/kit/button.ts src/ui/kit/iconButton.ts src/ui/kit/checkbox.ts tests/uiClickSounds.test.ts
git commit -m "feat: play click sound on buttons, icon buttons and checkboxes"
```

---

### Task 4: Click sound on hex selection

**Files:**
- Modify: `src/controller/gameController.ts`
- Test: `tests/toolbarSpecs.test.ts`

**Interfaces:**
- Consumes: `sfx.play` from Task 2.
- Produces: `handleMapClick(q, r)` plays `sfx.play('click')` exactly when a tap results in a selection being made (the post-move reselect and the final `cycleSelection` path). No sound for fog taps, selection-clearing taps, or attack-confirmation taps.

- [ ] **Step 1: Write the failing test**

In `tests/toolbarSpecs.test.ts`, add the import:

```ts
import { sfx } from '../src/sound/sfx';
```

Append this test inside the existing `describe('toolbarSpecs', ...)` block, after the last test (line 202):

```ts
  it('plays the click sound when a hex tap selects a tile', async () => {
    const tile = map.tiles.find((t) => t.unit === null)!;
    tile.exploredBy = [0];
    (gameController as unknown as { app: unknown }).app = { screen: {} };
    const spy = vi.spyOn(sfx, 'play');
    await gameController.handleMapClick(tile.q, tile.r);
    expect(useGameStore.getState().selection).not.toBeNull();
    expect(spy).toHaveBeenCalledWith('click');
    spy.mockRestore();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/toolbarSpecs.test.ts -t "plays the click sound"`
Expected: FAIL — spy not called.

- [ ] **Step 3: Implement in `gameController`**

In `src/controller/gameController.ts`, add the import alongside the other top imports:

```ts
import { sfx } from '../sound/sfx';
```

Make two edits inside `handleMapClick`.

Edit A — after the post-move reselect. Replace:

```ts
        this.sendCommand({ type: 'move', unitId: unit.id, q, r });
        store.setSelection({ kind: 'unit', q: tile.q, r: tile.r });
        return;
```

with:

```ts
        this.sendCommand({ type: 'move', unitId: unit.id, q, r });
        store.setSelection({ kind: 'unit', q: tile.q, r: tile.r });
        sfx.play('click');
        return;
```

Edit B — after the final selection. Replace:

```ts
    const next = cycleSelection(selection, tile);
    store.setSelection(next);
```

with:

```ts
    const next = cycleSelection(selection, tile);
    store.setSelection(next);
    sfx.play('click');
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/toolbarSpecs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controller/gameController.ts tests/toolbarSpecs.test.ts
git commit -m "feat: play click sound when a hex tap selects a tile"
```

---

### Task 5: i18n keys for sound setting

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/ru.ts`

**Interfaces:**
- Produces: keys `settings.sound`, `common.on`, `common.off` in both locales. Task 6 renders the Sound row from these.

- [ ] **Step 1: Add English keys**

In `src/i18n/locales/en.ts`, inside the `// Settings` section, insert after the `'settings.language'` line:

```ts
  'settings.sound': 'Sound',
```

In the `// Common` section, after the `'common.back': 'Back',` line:

```ts
  'common.on': 'On',
  'common.off': 'Off',
```

- [ ] **Step 2: Add Russian keys**

In `src/i18n/locales/ru.ts`, inside the `// Settings` section, insert after the `'settings.language'` line:

```ts
  'settings.sound': 'Звук',
```

In the `// Common` section, after the `'common.back': 'Назад',` line:

```ts
  'common.on': 'Вкл',
  'common.off': 'Выкл',
```

(Verify the exact surrounding lines with Read if the Russian `// Common` block differs.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/en.ts src/i18n/locales/ru.ts
git commit -m "feat: localize sound setting labels"
```

---

### Task 6: Settings panel uses ButtonGroups + Sound row

**Files:**
- Modify: `src/ui/screens/StartScreen.ts`
- Test: `tests/startScreen.test.ts`, `tests/popup.test.ts`

**Interfaces:**
- Consumes: `ButtonGroup` from Task-given kit component, `soundEnabled`/`setSoundEnabled` from Task 1, `checkbox.tap()` from Task 3, i18n keys from Task 5.
- Produces: A `SettingsPanel` whose rows are: Attack confirmation (checkbox), AI difficulty (`ButtonGroup` Easy/Normal/Hard), Disable tips (checkbox), Sound (`ButtonGroup` On/Off), Language (`ButtonGroup` English/Русский, page reload on change).

- [ ] **Step 1: Verify baseline tests pass**

Run: `npx vitest run tests/startScreen.test.ts tests/popup.test.ts`
Expected: PASS (baseline before the edit).

- [ ] **Step 2: Update imports in `StartScreen.ts`**

Change the settings import (line 5) to add `setSoundEnabled`:

```ts
import { loadSettings, setAiDifficulty, setAttackConfirmation, setSoundEnabled, setTipsDisabled } from '../../storage/settings';
```

Add after the existing `import { Button } from '../kit/button';` (line 11):

```ts
import { ButtonGroup } from '../kit/buttonGroup';
```

The separate `import { setLanguage, type Language } from '../../storage/settings';` (line 16) stays as is.

- [ ] **Step 3: Replace the `SettingsPanel` class body**

In `src/ui/screens/StartScreen.ts`, replace the entire `class SettingsPanel { ... }` (currently lines 45-165, from `class SettingsPanel {` through the closing `}` just before `export class StartScreen`) with:

```ts
class SettingsPanel {
  readonly el: Container;
  private popup: Popup | null = null;

  constructor(app: Application, onClose: () => void) {
    const close = new Button({ label: t('settings.close'), width: 140, onClick: onClose });
    const popup = new Popup({
      app,
      title: t('settings.title'),
      buttons: [close],
      onClose,
    });
    this.popup = popup;
    this.el = popup.el;

    const content = popup.content;
    const cw = popup.contentWidth;
    const rowH = 30;
    const blockGap = 10;
    let y = 0;

    const attackLabel = makeLabel(t('settings.attackConfirm'), { fontSize: 14, fill: 0xeeeeee });
    const attackCheckbox = makeCheckbox(loadSettings().attackConfirmation, (v) => {
      setAttackConfirmation(v);
      attackCheckbox.setChecked(v);
    });
    attackLabel.eventMode = 'static';
    attackLabel.cursor = 'pointer';
    attackLabel.on('pointertap', () => attackCheckbox.tap());
    attackLabel.position.set(0, y + (rowH - attackLabel.height) / 2);
    attackCheckbox.el.position.set(cw - 22, y + (rowH - 22) / 2);
    content.addChild(attackLabel, attackCheckbox.el);
    y += rowH + blockGap;

    const difficultyLabel = makeLabel(t('settings.difficulty'), { fontSize: 14, fill: 0xeeeeee });
    difficultyLabel.position.set(0, y);
    content.addChild(difficultyLabel);
    y += difficultyLabel.height + 8;

    const difficultyOptions: AiDifficulty[] = ['easy', 'normal', 'hard'];
    const difficultyKeys: Record<AiDifficulty, string> = {
      easy: 'difficulty.easy',
      normal: 'difficulty.normal',
      hard: 'difficulty.hard',
    };
    const difficultyGroup = new ButtonGroup({
      fontSize: 12,
      items: difficultyOptions.map((d) => ({
        label: t(difficultyKeys[d]),
        onClick: () => {
          setAiDifficulty(d);
          difficultyGroup.buttons.forEach((b, i) => {
            b.selected = difficultyOptions[i] === d;
          });
        },
      })),
    });
    const currentDifficulty = loadSettings().aiDifficulty;
    difficultyGroup.buttons.forEach((b, i) => {
      b.selected = difficultyOptions[i] === currentDifficulty;
    });
    difficultyGroup.position.set(0, y);
    content.addChild(difficultyGroup);
    y += difficultyGroup.buttonHeight + blockGap;

    const tipsLabel = makeLabel(t('settings.disableTips'), { fontSize: 14, fill: 0xeeeeee });
    const tipsCheckbox = makeCheckbox(loadSettings().disableTips, (v) => {
      setTipsDisabled(v);
      tipsCheckbox.setChecked(v);
    });
    tipsLabel.eventMode = 'static';
    tipsLabel.cursor = 'pointer';
    tipsLabel.on('pointertap', () => tipsCheckbox.tap());
    tipsLabel.position.set(0, y + (rowH - tipsLabel.height) / 2);
    tipsCheckbox.el.position.set(cw - 22, y + (rowH - 22) / 2);
    content.addChild(tipsLabel, tipsCheckbox.el);
    y += rowH + blockGap;

    const soundLabel = makeLabel(t('settings.sound'), { fontSize: 14, fill: 0xeeeeee });
    soundLabel.position.set(0, y);
    content.addChild(soundLabel);
    y += soundLabel.height + 8;

    const soundGroup = new ButtonGroup({
      fontSize: 12,
      items: [
        {
          label: t('common.on'),
          onClick: () => {
            setSoundEnabled(true);
            soundGroup.buttons.forEach((b, i) => {
              b.selected = i === 0;
            });
          },
        },
        {
          label: t('common.off'),
          onClick: () => {
            setSoundEnabled(false);
            soundGroup.buttons.forEach((b, i) => {
              b.selected = i === 1;
            });
          },
        },
      ],
    });
    const soundOn = loadSettings().soundOn;
    soundGroup.buttons.forEach((b, i) => {
      b.selected = i === 0 ? soundOn : !soundOn;
    });
    soundGroup.position.set(0, y);
    content.addChild(soundGroup);
    y += soundGroup.buttonHeight + blockGap;

    const langLabel = makeLabel(t('settings.language'), { fontSize: 14, fill: 0xeeeeee });
    langLabel.position.set(0, y);
    content.addChild(langLabel);
    y += langLabel.height + 8;

    const langOptions: { code: Language; key: string }[] = [
      { code: 'en', key: 'lang.en' },
      { code: 'ru', key: 'lang.ru' },
    ];
    const currentLang = loadSettings().lang;
    const langGroup = new ButtonGroup({
      fontSize: 12,
      items: langOptions.map((l) => ({
        label: t(l.key),
        onClick: () => {
          if (l.code === currentLang) return;
          setLanguage(l.code);
          window.location.reload();
        },
      })),
    });
    langGroup.buttons.forEach((b, i) => {
      b.selected = langOptions[i]!.code === currentLang;
    });
    langGroup.position.set(0, y);
    content.addChild(langGroup);
  }

  mount(container: Container): void {
    container.addChild(this.el);
    this.popup?.finish();
  }

  hide(onDone: () => void): void {
    this.popup?.animateOut(onDone);
  }

  destroy(): void {
    this.popup?.destroy();
    this.popup = null;
  }
}
```

Note: the `current` / `apply` / `applyTips` / `tipsOn` locals from the old code are gone; checkbox state sync now happens through each checkbox's own `onToggle` callback, and label taps route through `checkbox.tap()` so the click sound plays exactly once per change.

- [ ] **Step 4: Verify targeted tests pass**

Run: `npx vitest run tests/startScreen.test.ts tests/popup.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/StartScreen.ts
git commit -m "feat: settings rows use button groups and add sound toggle"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke checklist (browser, `npm run dev`)**

- Start screen → Settings: difficulty and language render as flush button groups; a Sound row with On/Off exists and On is selected.
- Clicking Off in the Sound group gives one final click, then all further button/checkbox/hex clicks are silent.
- Clicking On restores click sounds.
- Changing difficulty plays a click and updates the highlight; changing language reloads the page.
- Checkbox rows (Attack confirmation, Disable tips) click when tapped on the box or the row label — exactly once per flip.
- Start a game: tapping explored hexes that select plays the click; tapping fog stays silent; an attack tap that opens the confirm overlay is silent, and the overlay's Confirm/Cancel buttons click.
