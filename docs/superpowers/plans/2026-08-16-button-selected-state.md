# Button Selected State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the currently selected tribe and enemy-count options visible on the setup screen via a white outline, with defaults pre-highlighted on load.

**Architecture:** Add a `.selected` CSS rule using `outline` (so button size doesn't shift) in `index.html`, and have `setupScreen.ts` apply the `selected` class to the default buttons when they are created. Click handlers already manage the class, so only creation-time default marking is added.

**Tech Stack:** TypeScript, plain HTML/CSS (no tests needed — UI-only change verified manually).

## Global Constraints

- Use `outline`, not `border`, for the selected ring (outline doesn't affect layout).
- `.selected` rule: `outline: 3px solid #fff;`.
- Defaults to pre-highlight: tribe `TRIBES[0]` (Villagers) and enemy count `1`.
- The Start button is not part of a selection group and is NOT changed.
- Do NOT add code comments.
- Commands: `npm run typecheck`, `npm test` (must stay green), `npm run dev`.
- Commit after the task with the exact message shown.

---

### Task 1: Add `.selected` styling and pre-highlight defaults

**Files:**
- Modify: `index.html` (add `.selected` CSS rule)
- Modify: `src/screens/setupScreen.ts` (pre-mark default buttons as selected)

**Interfaces:**
- Consumes: existing `setupScreen.ts` structure, existing `index.html` `<style>` block.
- Produces: visible white ring on the currently selected tribe and enemy-count buttons; Villagers and "1" ringed on load.

- [ ] **Step 1: Add the `.selected` CSS rule**

In `index.html`, replace the `button { ... }` line:

```css
    button { font-size: 16px; padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; }
```

with:

```css
    button { font-size: 16px; padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; }
    button.selected { outline: 3px solid #fff; }
```

- [ ] **Step 2: Pre-highlight the default tribe button**

In `src/screens/setupScreen.ts`, modify the tribe-button creation loop so the button matching the default tribe gets the `selected` class immediately. Replace:

```ts
  for (const tribe of TRIBES) {
    const btn = document.createElement('button');
    btn.textContent = tribe.name;
    btn.style.background = colorCss(tribe.color);
    btn.addEventListener('click', () => {
```

with:

```ts
  for (const tribe of TRIBES) {
    const btn = document.createElement('button');
    btn.textContent = tribe.name;
    btn.style.background = colorCss(tribe.color);
    if (tribe.id === selectedTribe) btn.classList.add('selected');
    btn.addEventListener('click', () => {
```

- [ ] **Step 3: Pre-highlight the default enemy-count button**

In `src/screens/setupScreen.ts`, modify the enemy-count creation loop so the button for the default count gets the `selected` class immediately. Replace:

```ts
  for (const count of [1, 2]) {
    const btn = document.createElement('button');
    btn.textContent = `${count}`;
    btn.addEventListener('click', () => {
```

with:

```ts
  for (const count of [1, 2]) {
    const btn = document.createElement('button');
    btn.textContent = `${count}`;
    if (count === selectedEnemies) btn.classList.add('selected');
    btn.addEventListener('click', () => {
```

- [ ] **Step 4: Verify typecheck and tests stay green**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all 27 tests PASS (no behavior change to game logic).

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, open the URL, click "Start".
Expected:
1. "Villagers" button has a white ring; "1" enemy button has a white ring.
2. Clicking another tribe moves the ring to it (only one tribe ringed).
3. Clicking "2" moves the enemy ring to "2".
4. "Start" button has no ring.

- [ ] **Step 6: Commit**

```bash
git add index.html src/screens/setupScreen.ts
git commit -m "feat: show selected state on setup screen buttons"
```

---

## Self-Review Notes

- **Spec coverage:** `.selected` rule with `outline: 3px solid #fff` — Task 1 Step 1. Pre-highlight defaults (Villagers, 1) — Steps 2–3. Start button unchanged — no edits target `#setup-start-btn`. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `selectedTribe` and `selectedEnemies` already exist in `setupScreen.ts` with the default values `TRIBES[0].id` and `1`; the plan reuses them, so no naming mismatches.
