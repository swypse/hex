# Village Colors and Unit Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render occupied villages in their owner's tribe color, unoccupied villages gray, and give unit circles a permanent black outline so they stand out from the village circle underneath.

**Architecture:** Change `TextureSet` in `textureFactory.ts`: replace the single black `villageTexture` with per-tribe `villageTextures` plus a gray `freeVillageTexture`, and add a black stroke to `makeUnitTexture`. Update `mapRenderer.ts` to pick the village texture by `tile.settlement.owner`. Manual visual verification via headless screenshot.

**Tech Stack:** TypeScript, PixiJS 8 (Graphics), Vitest (existing suite stays green).

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `TextureSet` field names: `villageTextures: Record<Tribe, Texture>`, `freeVillageTexture: Texture`, `unitTextures: Record<Tribe, Texture>`.
- Free village gray color: `0x9a9a9a`.
- Unit outline: `stroke({ width: 3, color: 0x000000 })` on the unit circle.
- Village circle radius stays `hexSize * 0.3`; unit circle radius stays `hexSize * 0.2`.
- Renderer picks village texture by `tile.settlement.owner`: null → `freeVillageTexture`, else `villageTextures[players[owner].tribe]`.
- Tests: `npm test`, typecheck `npm run typecheck` — must stay green (no unit tests for rendering).
- Commit after the task with the exact message shown.

---

### Task 1: Village colors + unit outline

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts`
- Test: manual — headless screenshot; `npm test` and `npm run typecheck` must stay green.

**Interfaces:**
- Consumes: `tribes.ts` (`TRIBES`, `Tribe`), `players.ts` (`Player`), `mapGen.ts` (`MapTile`).
- Produces: `villageTextures`, `freeVillageTexture`, unit circles with black outline; renderer picks village texture by owner.

- [ ] **Step 1: Update `src/render/textureFactory.ts`**

Change the `TextureSet` interface. Replace:

```ts
export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  villageTexture: Texture;
  unitTextures: Record<Tribe, Texture>;
  glowTextures: GlowTextures;
}
```

with:

```ts
export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  villageTextures: Record<Tribe, Texture>;
  freeVillageTexture: Texture;
  unitTextures: Record<Tribe, Texture>;
  glowTextures: GlowTextures;
}
```

Change `makeVillageTexture` from a fixed black circle to a per-color circle:

```ts
function makeVillageTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.3).fill(color);
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

Add a black outline to `makeUnitTexture`. Replace:

```ts
function makeUnitTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.2).fill(color);
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

with:

```ts
function makeUnitTexture(app: Application, color: number, hexSize: number): Texture {
  const g = new Graphics();
  g.circle(0, 0, hexSize * 0.2).fill(color).stroke({ width: 3, color: 0x000000 });
  const texture = app.renderer.generateTexture({ target: g });
  g.destroy();
  return texture;
}
```

Update `createTextures` to build per-tribe village textures and the free-village texture. Replace the return block:

```ts
  const unitTextures = {} as Record<Tribe, Texture>;
  for (const tribe of TRIBES) {
    unitTextures[tribe.id] = makeUnitTexture(app, tribe.color, hexSize);
  }
  return {
    tileTextures,
    villageTexture: makeVillageTexture(app, hexSize),
    unitTextures,
    glowTextures,
  };
```

with:

```ts
  const villageTextures = {} as Record<Tribe, Texture>;
  for (const tribe of TRIBES) {
    villageTextures[tribe.id] = makeVillageTexture(app, tribe.color, hexSize);
  }
  const unitTextures = {} as Record<Tribe, Texture>;
  for (const tribe of TRIBES) {
    unitTextures[tribe.id] = makeUnitTexture(app, tribe.color, hexSize);
  }
  return {
    tileTextures,
    villageTextures,
    freeVillageTexture: makeVillageTexture(app, 0x9a9a9a, hexSize),
    unitTextures,
    glowTextures,
  };
```

- [ ] **Step 2: Update `src/render/mapRenderer.ts`**

Replace the village-sprite block:

```ts
    if (tile.settlement) {
      const villageSprite = new Sprite(textures.villageTexture);
      villageSprite.anchor.set(0.5);
      villageSprite.position.set(p.x, p.y);
      container.addChild(villageSprite);
    }
```

with:

```ts
    if (tile.settlement) {
      const villageSprite = new Sprite(
        tile.settlement.owner === null
          ? textures.freeVillageTexture
          : textures.villageTextures[players[tile.settlement.owner].tribe],
      );
      villageSprite.anchor.set(0.5);
      villageSprite.position.set(p.x, p.y);
      container.addChild(villageSprite);
    }
```

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS (all tests — no render-module unit tests exist).

- [ ] **Step 4: Verify manually with a headless screenshot**

```bash
timeout 30 npm run dev > /tmp/p4rth-opencode/vite-vc.log 2>&1 &
sleep 5
timeout 40 google-chrome --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox --remote-allow-origins=* about:blank > /tmp/p4rth-opencode/chrome-vc.log 2>&1 &
sleep 4
python3 - <<'EOF'
import json, requests, websocket, time, base64
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
send("Page.enable")
time.sleep(2)
evaljs("document.getElementById('start-btn').click()")
time.sleep(0.3)
evaljs("document.getElementById('setup-start-btn').click()")
time.sleep(2)
shot = send("Page.captureScreenshot", {"format": "png"})
open("/tmp/p4rth-opencode/village-colors.png", "wb").write(base64.b64decode(shot["data"]))
ws.close()
EOF
convert /tmp/p4rth-opencode/village-colors.png -format "%c" histogram:info:- 2>/dev/null | grep -iE "8B5A2B|E07B22|C0392B|9A9A9A" | head -6
```

Expected: tribe colors `#8B5A2B`/`#E07B22`/`#C0392B` present (occupied villages + units), and gray `#9A9A9A` present (free villages). Kill the dev server and Chrome afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: tribe-colored villages, gray free villages, unit outline"
```

---

## Self-Review Notes

- **Spec coverage:** occupied villages tribe-colored, unoccupied gray, unit black outline — all in Task 1 (textureFactory + mapRenderer). No gaps.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `villageTextures`, `freeVillageTexture`, `unitTextures` names match between `TextureSet`, `createTextures`, and the renderer. No other file references `villageTexture` (removed) — verified against `gameScreen.ts` and `mapRenderer.ts`, which only consume `TextureSet` as a whole.
