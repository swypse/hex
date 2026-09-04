# Selected Border Split Points (Right 0.1, Left 0.9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `splitHexBorder` so both selected-border split points sit near the hex's top corners — blend `0.1` on the right edge, `0.9` on the left edge.

**Architecture:** In `src/game/hex.ts`, generalize the split-point helper to take a blend factor and use `0.1` for the right edge and `0.9` for the left edge. Consumers call `splitHexBorder` unchanged.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Right edge split point: `blend(corners[0], corners[1], 0.1)` (near the top-right corner).
- Left edge split point: `blend(corners[3], corners[4], 0.9)` (near the top-left corner).
- `top` and `bottom` polylines still share both split points (border stays continuous).
- Run `npm test` and `npm run typecheck` after the change; output must be clean.

---

### Task 1: Asymmetric split points in splitHexBorder

**Files:**
- Modify: `src/game/hex.ts` (`splitHexBorder`)
- Modify: `tests/hex.test.ts`

**Interfaces:**
- Consumes: `hexCorners(h, hexSize)` corner array shape.
- Produces: `splitHexBorder(corners)` unchanged signature — right split at `0.1`, left split at `0.9`.

- [ ] **Step 1: Write the failing test**

In `tests/hex.test.ts`, replace the `splitHexBorder` test with:

```ts
it('splitHexBorder splits near the top of the hex on both edges and keeps the border continuous', () => {
  const corners = hexCorners({ q: 0, r: 0 }, 40);
  const blend = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const rightMid = blend(corners[0], corners[1], 0.1);
  const leftMid = blend(corners[3], corners[4], 0.9);
  const { top, bottom } = splitHexBorder(corners);
  expect(top).toEqual([rightMid, corners[0], corners[5], corners[4], leftMid]);
  expect(bottom).toEqual([rightMid, corners[1], corners[2], corners[3], leftMid]);
  expect(top[0]).toEqual(bottom[0]);
  expect(top[top.length - 1]).toEqual(bottom[bottom.length - 1]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/hex.test.ts`
Expected: FAIL — `rightMid` is currently the `0.9` blend (near the bottom-right corner), not `0.1`.

- [ ] **Step 3: Implement the change**

In `src/game/hex.ts`, in `splitHexBorder`:

```ts
export function splitHexBorder(
  corners: { x: number; y: number }[],
): { top: { x: number; y: number }[]; bottom: { x: number; y: number }[] } {
  const blend = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const rightMid = blend(corners[0], corners[1], 0.1);
  const leftMid = blend(corners[3], corners[4], 0.9);
  return {
    top: [rightMid, corners[0], corners[5], corners[4], leftMid],
    bottom: [rightMid, corners[1], corners[2], corners[3], leftMid],
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/hex.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/hex.ts tests/hex.test.ts
git commit -m "feat: split selected border at 0.1 on the right edge and 0.9 on the left"
```

---

### Task 2: Final verification

- [ ] **Step 1: Full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: Confirm spec coverage**

- Right edge `0.1`, left edge `0.9`: Task 1.
- Border continuity preserved: Task 1 test assertions.
