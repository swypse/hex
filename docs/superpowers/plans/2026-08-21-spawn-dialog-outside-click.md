# Spawn Dialog Outside-Click Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the spawn popup when the player clicks the dimmed backdrop outside the dialog, identical to pressing Cancel.

**Architecture:** Add an `onClick` handler to the existing full-screen backdrop `<div>` that closes the dialog, and stop propagation on the inner popup `<div>` so clicks inside do not bubble to the backdrop.

**Tech Stack:** React 19, TypeScript, Vite, Vitest.

## Global Constraints

- No new dependencies.
- Do not spawn a unit on outside click; it only calls `setSpawnDialogOpen(false)`.
- Follow existing React/TS conventions in `src/ui/SpawnDialog.tsx`.

---

### Task 1: Close spawn dialog on backdrop click

**Files:**
- Modify: `src/ui/SpawnDialog.tsx:26-58`

**Interfaces:**
- Consumes: `setSpawnDialogOpen(open: boolean)` from `useGameStore` (already used at `SpawnDialog.tsx:55`).
- Produces: No new exports; the dialog now closes when the backdrop is clicked.

- [ ] **Step 1: Add backdrop click handler and stop propagation on inner popup**

In `src/ui/SpawnDialog.tsx`, change the outer backdrop `<div>` (line 27) to:

```tsx
<div
  onClick={() => setOpen(false)}
  style={{
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.5)',
    zIndex: 30,
  }}
>
```

Change the inner popup `<div>` (line 38) to add the propagation guard:

```tsx
<div
  onClick={(e) => e.stopPropagation()}
  style={{ background: '#000', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}
>
```

- [ ] **Step 2: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: typecheck passes, all tests pass. (There are no unit tests for this component's click handling; the dialog has no existing test file.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/SpawnDialog.tsx
git commit -m "feat: close spawn popup on outside click"
```
