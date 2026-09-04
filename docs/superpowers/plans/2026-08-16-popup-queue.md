# Popup Queue, Styling, Scrollbars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popups are always-visible-container notifications that queue up 300ms apart, appear/disappear immediately (5s visible or on close), with `max-width: 15vw`, `1em` gaps, 1.5× text, and no page scrollbars.

**Architecture:** CSS changes in `index.html` (scrollbars off, container max-width/font-size/gap, no transition); `popups.ts` becomes a queue-based processor — `showPopup` enqueues, one timer drains the queue at ≥300ms intervals, each popup is appended immediately, removed immediately after 5s or on click/✕, and the container never toggles `display:none`.

**Tech Stack:** TypeScript, plain HTML/CSS.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `html, body` gains `overflow: hidden;`.
- `#popup-stack`: `max-width: 15vw; width: fit-content;`; stays `display: flex` always (never `none`).
- `.popup`: no transition, no off-screen `left`; `font-size: 24px` (16px × 1.5); container `gap: 1em`.
- `QUEUE_GAP_MS = 300`; `VISIBLE_MS = 5000`.
- `showPopup(text, opts?: { background?: string; color?: string })` unchanged.
- Tests: `npm test`; typecheck `npm run typecheck`; manual headless Chrome.
- Commit after the task with the exact message shown.

---

### Task 1: Popup queue + styling + scrollbars

**Files:**
- Modify: `index.html`
- Modify: `src/ui/popups.ts`
- Test: manual — headless Chrome; `npm test` and `npm run typecheck` must stay green.

**Interfaces:**
- Consumes: existing `showPopup`, `#popup-stack`.
- Produces: queued popups, always-visible container, no animations, no scrollbars.

- [ ] **Step 1: Update `index.html` CSS**

Add `overflow: hidden` to the base rule. Replace:

```css
    html, body { margin: 0; height: 100%; background: #1a1a2e; color: #eee; font-family: system-ui, sans-serif; }
```

with:

```css
    html, body { margin: 0; height: 100%; background: #1a1a2e; color: #eee; font-family: system-ui, sans-serif; overflow: hidden; }
```

Replace the `#popup-stack` and `.popup` rules:

```css
    #popup-stack { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 1em; z-index: 10; max-width: 15vw; width: fit-content; }
    #popup-stack .popup { padding: 8px 12px; border-radius: 4px; color: #fff; display: flex; align-items: center; gap: 8px; font-size: 24px; cursor: pointer; }
```

- [ ] **Step 2: Update `src/ui/popups.ts`**

Replace the entire file contents with:

```ts
const QUEUE_GAP_MS = 300;
const VISIBLE_MS = 5000;

interface PendingPopup {
  text: string;
  background: string;
  color: string | undefined;
}

const queue: PendingPopup[] = [];
let processorRunning = false;

export function showPopup(
  text: string,
  opts: { background?: string; color?: string } = {},
): void {
  queue.push({
    text,
    background: opts.background ?? '#000',
    color: opts.color,
  });
  if (!processorRunning) {
    processorRunning = true;
    processNext();
  }
}

function processNext(): void {
  if (queue.length === 0) {
    processorRunning = false;
    return;
  }

  const next = queue.shift()!;
  appendPopup(next);

  setTimeout(() => {
    processNext();
  }, QUEUE_GAP_MS);
}

function appendPopup(pending: PendingPopup): void {
  const stack = document.getElementById('popup-stack');
  if (!stack) return;

  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.style.background = pending.background;
  if (pending.color) popup.style.color = pending.color;

  const label = document.createElement('span');
  label.textContent = pending.text;
  popup.appendChild(label);

  const close = document.createElement('button');
  close.className = 'popup-close';
  close.textContent = '\u2715';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    removePopup(popup);
  });
  popup.appendChild(close);

  popup.addEventListener('click', () => removePopup(popup));
  stack.prepend(popup);

  setTimeout(() => removePopup(popup), VISIBLE_MS);
}

function removePopup(popup: HTMLElement): void {
  if (popup.dataset.removing) return;
  popup.dataset.removing = '1';
  popup.remove();
}
```

Note: the queue processor adds popups ≥300ms apart regardless of the 5s visibility, so several popups can be visible simultaneously in the stack (each spaced 1em via the container `gap`). The container is never set to `display:none`.

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (61 tests).

- [ ] **Step 4: Verify manually via headless Chrome**

Run dev server + Chrome, click through to the game screen, then verify queue spacing, immediate appearance, 5s removal, container always visible, no scrollbars, and font size:

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-pq.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-pq.log 2>&1 &
sleep 4
python3 - <<'EOF'
import json, requests, websocket, time
BASE = "http://127.0.0.1:9222"
ws_headers = {"Origin": "http://127.0.0.1:9222"}
page = requests.put(f"{BASE}/json/new?http://localhost:5173/").json()
ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10, header=ws_headers)
idc = [0]
def send(method, params=None):
    idc[0] += 1
    mid = idc[0]
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == mid:
            return msg.get("result", {})
def evaljs(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return r.get("result", {}).get("value")
send("Runtime.enable")
time.sleep(2)
print("body overflow:", evaljs("getComputedStyle(document.body).overflow"))
print("stack max-width:", evaljs("getComputedStyle(document.getElementById('popup-stack')).maxWidth"))
print("stack display:", evaljs("getComputedStyle(document.getElementById('popup-stack')).display"))
evaljs("document.getElementById('start-btn').click()")
time.sleep(0.3)
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(1)
evaljs("document.getElementById('end-turn-btn').click()")
t0 = time.time()
counts = []
while time.time() - t0 < 7:
    counts.append(evaljs("document.querySelectorAll('#popup-stack .popup').length"))
    time.sleep(0.2)
print("popup counts over 7s:", counts)
print("font-size:", evaljs("getComputedStyle(document.querySelector('#popup-stack .popup')).fontSize"))
ws.close()
EOF
```

Expected: `body overflow: hidden`, `stack max-width: 15vw`, `stack display: flex`, popup count ramps up over time (300ms spacing), popups vanish by ~5s each, `font-size: 24px`. Kill the dev server and Chrome afterwards.

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/popups.ts
git commit -m "feat: queue popups with 300ms spacing and immediate transitions"
```

---

## Self-Review Notes

- **Spec coverage:** container always visible + `max-width: 15vw` — Step 1 CSS; 300ms queue spacing — Step 2 (`QUEUE_GAP_MS`); no in/out animation, immediate removal after 5s or click — Step 2; `1em` gap — Step 1 (`gap: 1em`); 1.5× text — Step 1 (`font-size: 24px`); scrollbars disabled — Step 1 (`overflow: hidden`). All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `showPopup` signature unchanged; `gameScreen.ts` untouched. `PendingPopup`, `queue`, `processorRunning`, `processNext`, `appendPopup`, `removePopup` names consistent within the file.
- **Behavioral note:** Because popups are queued at 300ms while each lives 5s, several can be visible at once — the spec's "accumulated" behavior. The `data-removing` guard keeps click + 5s-timer from double-removing.
