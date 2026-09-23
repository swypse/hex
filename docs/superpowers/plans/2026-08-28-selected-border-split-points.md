# Selected Border Split Points Toward Hex Top — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the split points of the selected-cell border from the middle of the hex's left/right edges (0.5) to near the top corners (0.9).

**Architecture:** Single change inside `splitHexBorder` in `src/game/hex.ts`: replace the 0.5 midpoint helper with a 0.9 split-point helper for the two edge split points. Consumers (`mapRenderer`) call it unchanged.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Split points are 90% of the way from the top corner toward the bottom corner on each left/right edge.
- `top` and `bottom` polylines still share both split points (border stays continuous).
- Run `npm test` and `npm run typecheck` after the change; output must be clean.

---

### Task 1: 0.9 split points in splitHexBorder

**Files:**
- Modify: `src/game/hex.ts` (`splitHexBorder`)
- Modify: `tests/hex.test.ts`

**Interfaces:**
- Consumes: `hexCorners(h, hexSize)` corner array shape.
- Produces: `splitHexBorder(corners)` unchanged signature — split points now blended at 0.9 toward the top.

- [ ] **Step 1: Write the failing test**

In `tests/hex.test.ts`, replace the `splitHexBorder` test (lines 127-140) with:

```ts
it('splitHexBorder splits near the top of the hex and keeps the border continuous', () => {
  const corners = hexCorners({ q: 0, r: 0 }, 40);
  const split = (a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } => ({
    x: a.x + (b.x - a.x) * 0.9,
    y: a.y + (b.y - a.y) * 0.9,
  });
  const rightMid = split(corners[0], corners[1]);
  const leftMid = split(corners[3], corners[4]);
  const { top, bottom } = splitHexBorder(corners);
  expect(top).toEqual([rightMid, corners[0], corners[5], corners[4], leftMid]);
  expect(bottom).toEqual([rightMid, corners[1], corners[2], corners[3], leftMid]);
  expect(top[0]).toEqual(bottom[0]);
  expect(top[top.length - 1]).toEqual(bottom[bottom.length - 1]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/hex.test.ts`
Expected: FAIL — `top`/`bottom` contain the 0.5 midpoints, not the 0.9 points.

- [ ] **Step 3: Implement the change**

In `src/game/hex.ts`, in `splitHexBorder`, replace the `mid` helper and the two calls:

```ts
export function splitHexBorder(
  corners: { x: number; y: number }[],
): { top: { x: number; y: number }[]; bottom: { x: number; y: number }[] } {
  const splitPoint = (a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } => ({
    x: a.x + (b.x - a.x) * 0.9,
    y: a.y + (b.y - a.y) * 0.9,
  });
  const rightMid = splitPoint(corners[0], corners[1]);
  const leftMid = splitPoint(corners[3], corners[4]);
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
git commit -m "feat: move selected-border split points toward the hex top"
```

---

### Task 2: Final verification

- [ ] **Step 1: Full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: Confirm spec coverage**

- 0.9 split points on both hex edges: Task 1.
- Border continuity preserved: Task 1 test assertions.
