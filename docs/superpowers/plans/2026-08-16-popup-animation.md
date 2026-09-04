# Popup Duration, Position, and Slide Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Popups stay fully visible 5 seconds, the stack sits at the left edge vertically centered, and popups slide in from `-500px` to `10px` and slide back out to `-500px`, with `max-width: 400px`.

**Architecture:** CSS-only positioning + a `left` transition on the popup element; `popups.ts` changes the auto-dismiss timing from 300ms to 5000ms and drives the slide-in by setting inline `left: 10px` after append, and slide-out by resetting `left: -500px` before removal. `showPopup` signature unchanged, so `gameScreen.ts` is untouched.

**Tech Stack:** TypeScript, plain HTML/CSS.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `#popup-stack` CSS: `left: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 10;` (replace the old `top: 8px; left: 8px` version).
- `.popup` CSS: `transition: left 0.3s ease; position: relative; left: -500px; max-width: 400px;` (replace `transition: opacity 0.4s`).
- Popup fully visible for `5000ms`, then slide out to `-500px`, then remove from DOM.
- Click / ✕ slides out immediately (no 5s wait).
- `showPopup(text, opts?: { background?: string; color?: string }): void` unchanged.
- Tests: `npm test`; typecheck `npm run typecheck`; manual headless Chrome verification.
- Commit after the task with the exact message shown.

---

### Task 1: Popup positioning, duration, and slide animations

**Files:**
- Modify: `index.html`
- Modify: `src/ui/popups.ts`
- Test: manual — headless Chrome; `npm test` and `npm run typecheck` must stay green.

**Interfaces:**
- Consumes: existing `showPopup`, `#popup-stack` in `index.html`.
- Produces: 5s-visible, left-centered-stack, slide in/out popups.

- [ ] **Step 1: Update `index.html` CSS**

Replace the `#popup-stack` rule (line 20) and the `.popup` rule (line 21):

```css
    #popup-stack { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 10; }
    #popup-stack .popup { padding: 8px 12px; border-radius: 4px; color: #fff; display: flex; align-items: center; gap: 8px; transition: left 0.3s ease; cursor: pointer; position: relative; left: -500px; max-width: 400px; }
```

Note: `#popup-stack` keeps `display: flex` set by CSS. The `transform: translateY(-50%)` centers it; keep `flex-direction: column` so newest (prepended) sits on top.

- [ ] **Step 2: Update `src/ui/popups.ts`**

Replace the entire file contents with:

```ts
const SLIDE_OUT_LEFT = '-500px';
const SLIDE_IN_LEFT = '10px';
const VISIBLE_MS = 5000;
const SLIDE_MS = 300;

export function showPopup(
  text: string,
  opts: { background?: string; color?: string } = {},
): void {
  const stack = document.getElementById('popup-stack');
  if (!stack) return;

  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.style.background = opts.background ?? '#000';
  if (opts.color) popup.style.color = opts.color;

  const label = document.createElement('span');
  label.textContent = text;
  popup.appendChild(label);

  const close = document.createElement('button');
  close.className = 'popup-close';
  close.textContent = '\u2715';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    slideOut(popup);
  });
  popup.appendChild(close);

  popup.addEventListener('click', () => slideOut(popup));
  stack.prepend(popup);

  requestAnimationFrame(() => {
    popup.style.left = SLIDE_IN_LEFT;
  });

  setTimeout(() => slideOut(popup), VISIBLE_MS);
}

function slideOut(popup: HTMLElement): void {
  if (popup.dataset.sliding) return;
  popup.dataset.sliding = '1';
  popup.style.left = SLIDE_OUT_LEFT;
  setTimeout(() => {
    popup.remove();
    const stack = document.getElementById('popup-stack');
    if (stack) {
      stack.style.display = stack.children.length === 0 ? 'none' : 'flex';
    }
  }, SLIDE_MS);
}
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (61 tests).

- [ ] **Step 4: Verify manually via headless Chrome**

Run dev server + Chrome, click through to the game screen, then check the popup stack geometry and a popup's lifecycle:

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-pop.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-pop.log 2>&1 &
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
evaljs("document.getElementById('start-btn').click()")
time.sleep(0.3)
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(1)
print("stack display:", evaljs("getComputedStyle(document.getElementById('popup-stack')).display"))
print("stack top:", evaljs("getComputedStyle(document.getElementById('popup-stack')).top"))
print("popup count right after turn start:", evaljs("document.querySelectorAll('#popup-stack .popup').length"))
time.sleep(6)
print("popup count after 6s:", evaljs("document.querySelectorAll('#popup-stack .popup').length"))
ws.close()
EOF
```

Expected: stack `display: flex`, `top: 50%`, one popup right after the human's turn starts, and zero popups ~6s later (auto-slid out). Also confirm visually in a browser that the popup slides in from the left, sits at the left edge vertically centered, is ≤400px wide, and slides back out to the left. Kill the dev server and Chrome afterwards.

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/popups.ts
git commit -m "feat: slide popups and keep them visible 5 seconds"
```

---

## Self-Review Notes

- **Spec coverage:** 5s fully-visible — Step 2 (`VISIBLE_MS = 5000`); left-edge vertical-center stack — Step 1 CSS; slide in `-500px → 10px` and out `-500px` — Steps 1–2; `max-width: 400px` — Step 1. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `showPopup` signature unchanged; `gameScreen.ts` untouched (verified — it only calls `showPopup(text, opts)`). `requestAnimationFrame` used to ensure the CSS default `left: -500px` renders before the inline `10px` triggers the transition.
- **Edge case:** `updateStackVisibility` from the old code was folded into `slideOut` with a direct `getElementById` lookup after removal, fixing the previous `parentElement === null` bug.
