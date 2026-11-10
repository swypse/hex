import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { SKILLS, hasSkill, canOpenSkill, skillCost } from '../../game/skills';
import { type Player } from '../../game/players';
import { tribeById } from '../../game/tribes';
import { clampZoom, zoomAroundCursor, decayVelocity, INERTIA_START_SPEED, INERTIA_STOP_SPEED } from '../../controller/zoom';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../../gfx/label';
import { Popup } from '../kit/popup';
import { makeRichLabel } from '../kit/rich-label';
import { makeIcon } from '../kit/icon';
import { KeyHints } from '../kit/key-hints';
import { isTouchDevice } from '../kit/touch';
import { makeIconChip } from '../kit/tribe-chip';
import { HudResourcePanel } from '../hud/hud-resource-panel';
import { makeSkillMedallion, medallionStrokeWidth } from '../kit/skill-medallion';
import { THEME } from '../../gfx/theme';
import { FontSize, SkillId } from '@enums';

const RING_SPACING = 150;
/** Diameter of a skill node's medallion in the tree. */
const MEDALLION_SIZE = 56;
/** The tree is magnified up to the max zoom: bake its text that many times
 *  larger so it stays sharp when zoomed all the way in. */
const TREE_TEXT_BAKE = 3;

const CX = 400;
const CY = 340;

interface SkillNodeLayout {
  x: number;
  y: number;
  depth: number;
  radius: number;
}

export function skillLayout(): Record<SkillId, SkillNodeLayout> {
  const childrenOf = new Map<SkillId, SkillId[]>();
  const roots: SkillId[] = [];
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const parent = SKILLS[id].parent;
    if (parent) {
      const arr = childrenOf.get(parent) ?? [];
      arr.push(id);
      childrenOf.set(parent, arr);
    } else {
      roots.push(id);
    }
  }
  const angle = new Map<SkillId, number>();
  const depth = new Map<SkillId, number>();
  const rootSector = (2 * Math.PI) / roots.length;
  // The roots sit evenly around the ring, but their children may spill into the
  // neighbouring sectors: a root with 3 children needs more room than one with 2.
  // All second-ring skills share one angular step, the widest that keeps the
  // closest two (within a root, or across two neighbouring roots) that far apart.
  const kidCount = (id: SkillId): number => (childrenOf.get(id) ?? []).length;
  let rootStep = rootSector;
  for (let i = 0; i < roots.length; i++) {
    const pair = (kidCount(roots[i]!) + kidCount(roots[(i + 1) % roots.length]!)) / 2;
    if (pair > 0) rootStep = Math.min(rootStep, rootSector / pair);
  }
  const assign = (id: SkillId, center: number, sector: number, d: number): void => {
    depth.set(id, d);
    angle.set(id, center);
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) return;
    const step = d === 1 ? rootStep : sector / kids.length;
    for (let i = 0; i < kids.length; i++) {
      assign(kids[i]!, center + (i - (kids.length - 1) / 2) * step, step, d + 1);
    }
  };
  for (let i = 0; i < roots.length; i++) {
    assign(roots[i]!, (i + 0.5) * rootSector, rootSector, 1);
  }

  const out = {} as Record<SkillId, SkillNodeLayout>;
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const radius = depth.get(id)! * RING_SPACING;
    const a = angle.get(id)!;
    out[id] = { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a), depth: depth.get(id)!, radius };
  }
  return out;
}

const POS = skillLayout();

const ARROW_DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};
/** Screen margins the keyboard cursor is kept inside by panning (the bottom one leaves room for the buttons). */
const CURSOR_MARGIN_X = 70;
const CURSOR_MARGIN_Y = 130;
const CURSOR_COLOR = 0xffd54a;
/** Medallion zoom while hovered / under the keyboard cursor, and while pressed. */
const HOVER_SCALE = 1.12;
const PRESSED_SCALE = 1.2;
/** How fast a medallion eases to its target zoom (1/s). */
const SCALE_EASE_RATE = 18;
/** Opening animation: the orange line grows parent -> child, then the medallion zooms up and bounces in. */
const GROW_MS = 250;
const POP_MS = 400;
const POP_PEAK = 0.35;
const GROW_LINE_COLOR = 0xff8c00;
/** Gap below a button row to the key-hint line. */
const HINT_GAP = 14;

export class SkillTree {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private ring: Container | null = null;
  private selected: SkillId | null = null;
  /** Skill under the keyboard cursor (arrows move it, Enter opens its popup). */
  private cursor: SkillId | null = null;
  /** Opens the skill in the detail popup (Enter there); null when it can't be opened. */
  private detailOpen: (() => void) | null = null;
  private detailPopup: Popup | null = null;
  private unsub: (() => void) | null = null;
  private hudMoney: HudResourcePanel | null = null;
  private zoom = 1;
  private fitScale = 1;
  private pan = { x: 0, y: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private listening = false;
  private pinchActive = false;
  private pinchStartZoom = 1;
  private pinchStartDist = 0;
  private pinchWorldAnchor = { x: 0, y: 0 };
  private dragStart = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private dragLast = { x: 0, y: 0 };
  private dragLastTime = 0;
  private dragVelocity = { x: 0, y: 0 };
  private inertiaRemove: (() => void) | null = null;
  private gestureMoved = false;
  private sawPinch = false;
  /** Skill under the mouse / the pressed skill (drive the medallion zoom). */
  private hovered: SkillId | null = null;
  private pressed: SkillId | null = null;
  /** Skills already seen opened; null until the first build (no animation for skills opened before the tree was shown). */
  private seenOpened: Set<SkillId> | null = null;
  /** Skills whose connecting line is still growing, and their start times. */
  private growing = new Map<SkillId, number>();
  /** Skills whose medallion is playing the zoom-up bounce, and their start times. */
  private popping = new Map<SkillId, number>();
  private growLines = new Map<SkillId, Graphics>();
  private medallions = new Map<SkillId, Container>();
  private medallionScale = new Map<SkillId, number>();
  private tickFn: ((t: { deltaMS: number }) => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.fitScale = Math.min(host.app.screen.width / 900, host.app.screen.height / 760, 1);
    // Open the tree at 1.3x zoom, keeping the ring centred on the screen.
    this.zoom = 1.3;
    const scale = this.fitScale * this.zoom;
    this.pan = {
      x: host.app.screen.width / 2 - CX * scale,
      y: host.app.screen.height / 2 - CY * scale,
    };
    const el = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill(THEME.skillTree.bg);
    // Swallow pointer events so a tap on the backdrop never reaches the map below.
    bg.eventMode = 'static';
    el.addChild(bg);
    root.addChild(el);
    this.el = el;
    this.selected = null;
    this.build();
    this.hudMoney = new HudResourcePanel();
    this.hudMoney.mount(host, root);
    this.unsub = useGameStore.subscribe(() => this.build());
    window.addEventListener('keydown', this.onKeyDown);
    // DOM-level interaction handlers: wheel zoom and pointer panning work no
    // matter what is under the cursor/finger (skill nodes are not Pixi
    // hit-test targets), and a stationary tap is forwarded to the skill node
    // under it. Pixi wheel events do not bubble through the non-interactive
    // ring container to the background surface.
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onHoverMove);
    window.addEventListener('wheel', this.onDomWheel, { passive: false });
    const ticker = host.app.ticker;
    if (ticker) {
      this.tickFn = (tk) => this.tick(tk.deltaMS);
      ticker.add(this.tickFn);
    }
  }

  private onHoverMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || this.detailPopup || this.pointers.size > 0) return;
    this.hovered = this.skillAt(e.clientX, e.clientY);
  };

  /** Per frame: grows opening lines, plays the pop and eases each medallion to its hover/pressed/cursor zoom. */
  private tick(deltaMS: number): void {
    const now = performance.now();
    for (const [id, start] of this.growing) {
      const k = Math.min(1, (now - start) / GROW_MS);
      const parent = SKILLS[id].parent;
      const from = parent ? POS[parent] : { x: CX, y: CY };
      const to = POS[id];
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.growLines.get(id)?.clear().moveTo(from.x, from.y).lineTo(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e)
        .stroke({ width: medallionStrokeWidth(MEDALLION_SIZE), color: GROW_LINE_COLOR });
      if (k >= 1) {
        this.growing.delete(id);
        this.popping.set(id, now);
        this.build();
        return;
      }
    }
    const ease = Math.min(1, (deltaMS / 1000) * SCALE_EASE_RATE);
    for (const [id, node] of this.medallions) {
      const target = this.pressed === id ? PRESSED_SCALE : this.hovered === id || this.cursor === id ? HOVER_SCALE : 1;
      const cur = this.medallionScale.get(id) ?? 1;
      const next = cur + (target - cur) * ease;
      this.medallionScale.set(id, next);
      let pop = 1;
      const popStart = this.popping.get(id);
      if (popStart !== undefined) {
        const u = (now - popStart) / POP_MS;
        if (u >= 1) this.popping.delete(id);
        else pop = popScale(u);
      }
      node.scale.set(next * pop);
    }
  }

  private onDomWheel = (e: WheelEvent): void => {
    if (!this.host || this.detailPopup) return;
    e.preventDefault();
    this.stopInertia();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const scale = this.fitScale * this.zoom;
    const nextZoom = clampZoom(this.zoom * factor);
    const nextScale = this.fitScale * nextZoom;
    this.pan = zoomAroundCursor({ x: e.clientX, y: e.clientY }, this.pan, scale, nextScale);
    this.zoom = nextZoom;
    this.applyTransform();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.host || this.detailPopup) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pos = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, { ...pos });
    this.pressed = this.pointers.size === 1 ? this.skillAt(pos.x, pos.y) : null;
    this.gestureMoved = false;
    this.sawPinch = false;
    this.stopInertia();
    this.attachPointerListeners();
    if (this.pointers.size >= 2) {
      this.beginPinch();
      return;
    }
    this.beginSingleDrag(pos);
  };

  private onWindowMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const pos = { x: e.clientX, y: e.clientY };
    this.pointers.set(e.pointerId, { ...pos });
    if (this.pinchActive) {
      this.applyPinch();
      return;
    }
    if (this.pointers.size !== 1) return;
    if (!this.gestureMoved && Math.hypot(pos.x - this.dragStart.x, pos.y - this.dragStart.y) > 6) {
      this.gestureMoved = true;
      this.pressed = null;
    }
    const now = performance.now();
    const dt = Math.max(0.0001, (now - this.dragLastTime) / 1000);
    const dx = pos.x - this.dragLast.x;
    const dy = pos.y - this.dragLast.y;
    this.dragVelocity.x = this.dragVelocity.x * 0.8 + (dx / dt) * 0.2;
    this.dragVelocity.y = this.dragVelocity.y * 0.8 + (dy / dt) * 0.2;
    this.pan = {
      x: this.panStart.x + (pos.x - this.dragStart.x),
      y: this.panStart.y + (pos.y - this.dragStart.y),
    };
    this.applyTransform();
    this.dragLast = { ...pos };
    this.dragLastTime = now;
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return;
    this.pressed = null;
    if (this.pinchActive && this.pointers.size < 2) {
      this.pinchActive = false;
      // Continue panning with the remaining finger.
      const remaining = [...this.pointers.values()][0];
      if (remaining) this.beginSingleDrag(remaining);
    }
    if (this.pointers.size === 0) {
      const tap = !this.pinchActive && !this.gestureMoved && !this.sawPinch && this.selected === null;
      if (tap) this.handleTap(e.clientX, e.clientY);
      if (!this.pinchActive && Math.hypot(this.dragVelocity.x, this.dragVelocity.y) >= INERTIA_START_SPEED) {
        this.startInertia();
      }
      this.dragVelocity = { x: 0, y: 0 };
      this.detachPointerListeners();
    }
  };

  /** The skill whose medallion is under the screen point, if any. */
  private skillAt(x: number, y: number): SkillId | null {
    if (!this.ring) return null;
    const s = this.ring.scale.x;
    let best: SkillId | null = null;
    let bestD = Infinity;
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const p = POS[id];
      const wx = this.pan.x + p.x * s;
      const wy = this.pan.y + p.y * s;
      const r = Math.max(12, (MEDALLION_SIZE / 2 - 4) * s);
      const d2 = (x - wx) * (x - wx) + (y - wy) * (y - wy);
      if (d2 <= r * r && d2 < bestD) {
        bestD = d2;
        best = id;
      }
    }
    return best;
  }

  private handleTap(x: number, y: number): void {
    const best = this.skillAt(x, y);
    if (best !== null) {
      this.selected = best;
      this.build();
    }
  }

  private attachPointerListeners(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
  }

  private detachPointerListeners(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
  }

  private beginSingleDrag(pos: { x: number; y: number }): void {
    this.dragStart = { ...pos };
    this.panStart = { ...this.pan };
    this.dragLast = { ...pos };
    this.dragLastTime = performance.now();
    this.dragVelocity = { x: 0, y: 0 };
  }

  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(b!.x - a!.x, b!.y - a!.y);
  }

  private pointerMidpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  }

  private beginPinch(): void {
    if (this.pointers.size < 2) return;
    this.sawPinch = true;
    this.pinchActive = true;
    this.pinchStartZoom = this.zoom;
    this.pinchStartDist = this.pointerDistance();
    const mid = this.pointerMidpoint();
    const startScale = this.fitScale * this.pinchStartZoom;
    this.pinchWorldAnchor = {
      x: (mid.x - this.pan.x) / startScale,
      y: (mid.y - this.pan.y) / startScale,
    };
  }

  private applyPinch(): void {
    if (!this.pinchActive || this.pointers.size < 2) return;
    const dist = this.pointerDistance();
    const mid = this.pointerMidpoint();
    const nextZoom = clampZoom(this.pinchStartZoom * (dist / this.pinchStartDist));
    const nextScale = this.fitScale * nextZoom;
    this.zoom = nextZoom;
    this.pan = {
      x: mid.x - this.pinchWorldAnchor.x * nextScale,
      y: mid.y - this.pinchWorldAnchor.y * nextScale,
    };
    this.applyTransform();
  }

  private startInertia(): void {
    if (this.inertiaRemove || !this.host || !this.host.app.ticker) return;
    const ticker = this.host.app.ticker;
    const fn = (t: { deltaMS: number }): void => {
      const dt = Math.min(0.05, t.deltaMS / 1000);
      this.pan = {
        x: this.pan.x + this.dragVelocity.x * dt,
        y: this.pan.y + this.dragVelocity.y * dt,
      };
      this.dragVelocity = decayVelocity(this.dragVelocity, dt);
      this.applyTransform();
      if (Math.hypot(this.dragVelocity.x, this.dragVelocity.y) < INERTIA_STOP_SPEED) this.stopInertia();
    };
    ticker.add(fn);
    this.inertiaRemove = () => ticker.remove(fn);
  }

  private stopInertia(): void {
    if (this.inertiaRemove) {
      this.inertiaRemove();
      this.inertiaRemove = null;
    }
  }

  private applyTransform(): void {
    if (!this.ring) return;
    this.ring.scale.set(this.fitScale * this.zoom);
    this.ring.position.set(this.pan.x, this.pan.y);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (this.selected !== null || this.detailPopup) {
        this.closeDetail();
      } else {
        useGameStore.getState().setOverlay(null);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (this.detailPopup) {
        this.detailOpen?.();
      } else if (this.cursor !== null) {
        this.selected = this.cursor;
        this.build();
      }
      return;
    }
    const dir = ARROW_DIRECTIONS[e.key];
    if (!dir || this.detailPopup) return;
    e.preventDefault();
    this.moveCursor(dir.dx, dir.dy);
  };

  /** Moves the keyboard cursor to the nearest skill in that direction (the first press picks the one nearest the screen centre). */
  private moveCursor(dx: number, dy: number): void {
    const ids = Object.keys(SKILLS) as SkillId[];
    if (this.cursor === null) {
      const centre = this.host ? this.worldAt(this.host.app.screen.width / 2, this.host.app.screen.height / 2) : { x: CX, y: CY };
      this.cursor = ids.reduce((a, b) => (Math.hypot(POS[b].x - centre.x, POS[b].y - centre.y) < Math.hypot(POS[a].x - centre.x, POS[a].y - centre.y) ? b : a));
    } else {
      const from = POS[this.cursor];
      let best: { id: SkillId; score: number } | null = null;
      for (const id of ids) {
        if (id === this.cursor) continue;
        const rx = POS[id].x - from.x;
        const ry = POS[id].y - from.y;
        const along = rx * dx + ry * dy;
        if (along <= 0) continue;
        const score = along + Math.abs(rx * dy - ry * dx) * 2;
        if (!best || score < best.score) best = { id, score };
      }
      if (!best) return;
      this.cursor = best.id;
    }
    this.panToCursor();
    this.build();
  }

  private worldAt(x: number, y: number): { x: number; y: number } {
    const s = this.fitScale * this.zoom;
    return { x: (x - this.pan.x) / s, y: (y - this.pan.y) / s };
  }

  /** Pans the tree just enough to keep the cursor skill on screen. */
  private panToCursor(): void {
    if (!this.host || this.cursor === null) return;
    const s = this.fitScale * this.zoom;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    const x = this.pan.x + POS[this.cursor].x * s;
    const y = this.pan.y + POS[this.cursor].y * s;
    const mx = CURSOR_MARGIN_X;
    const my = CURSOR_MARGIN_Y;
    if (x < mx) this.pan.x += mx - x;
    else if (x > w - mx) this.pan.x -= x - (w - mx);
    if (y < my) this.pan.y += my - y;
    else if (y > h - my) this.pan.y -= y - (h - my);
  }

  private closeDetail(): void {
    const popup = this.detailPopup;
    this.detailPopup = null;
    this.selected = null;
    popup?.destroy();
    this.build();
  }

  private build(): void {
    if (!this.el || !this.host) return;
    const host = this.host;
    this.detailPopup?.destroy();
    this.detailPopup = null;
    while (this.el.children.length > 1) {
      this.el.removeChildAt(1).destroy({ children: true });
    }
    this.ring = null;
    const human = useGameStore.getState().players[useGameStore.getState().localPlayerIndex];
    if (!human) {
      this.el.visible = false;
      return;
    }
    this.el.visible = true;
    const tribe = tribeById(human.tribe)!;
    const highlight = new Set(useGameStore.getState().tutorialHighlightSkills);
    const openedNow = new Set((Object.keys(SKILLS) as SkillId[]).filter((id) => hasSkill(human, id)));
    if (this.seenOpened) {
      const now = performance.now();
      for (const id of openedNow) if (!this.seenOpened.has(id)) this.growing.set(id, now);
    }
    this.seenOpened = openedNow;
    for (const id of [...this.growing.keys()]) if (!openedNow.has(id)) this.growing.delete(id);
    this.growLines.clear();
    this.medallions.clear();

    const scale = Math.min(host.app.screen.width / 900, host.app.screen.height / 760, 1);
    this.fitScale = scale;
    const ring = new Container();
    this.ring = ring;
    this.applyTransform();
    this.el.addChild(ring);

    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const growing = this.growing.has(id);
      const opened = hasSkill(human, id) && !growing;
      const parent = SKILLS[id].parent;
      const p = parent ? POS[parent] : { x: CX, y: CY };
      const c = POS[id];
      const line = new Graphics();
      const lineColor = opened ? GROW_LINE_COLOR : growing || canOpenSkill(human, id, gameController.getMap()) ? THEME.skillTree.closedSkillStroke : THEME.skillTree.unreachableLine;
      line.moveTo(p.x, p.y).lineTo(c.x, c.y).stroke({ width: opened ? medallionStrokeWidth(MEDALLION_SIZE) : 2, color: lineColor });
      ring.addChild(line);
      if (growing) {
        // Overlay redrawn every frame by `tick` until it reaches the child.
        const grow = new Graphics();
        this.growLines.set(id, grow);
        ring.addChild(grow);
      }
    }

    const rootChip = makeIconChip(`${tribe.code}-icon.png`, MEDALLION_SIZE, { bgColor: 0xffffff, border: { width: 4, color: THEME.skillTree.openedSkillStroke, alignment: 0 } });
    rootChip.position.set(CX, CY);
    ring.addChild(rootChip);

    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const pos = POS[id];
      const growing = this.growing.has(id);
      const opened = hasSkill(human, id) && !growing;
      if (!opened && highlight.has(id)) {
        const halo = new Graphics();
        halo.circle(pos.x, pos.y, 35).stroke({ width: 5, color: 0xffd700, alpha: 0.95 });
        halo.circle(pos.x, pos.y, 40).stroke({ width: 2, color: 0xffd700, alpha: 0.5 });
        ring.addChild(halo);
      }
      if (id === this.cursor) {
        const mark = new Graphics();
        mark.circle(pos.x, pos.y, MEDALLION_SIZE / 2 + 6).stroke({ width: 4, color: CURSOR_COLOR });
        ring.addChild(mark);
      }
      // Skill nodes are intentionally not Pixi-interactive: panning, zooming
      // and tap-to-open are all handled at the DOM level (window pointer/wheel
      // events) so they work identically no matter what is under the cursor.
      const node = new Container();
      const medallion = makeSkillMedallion({
        skill: id,
        opened,
        priceText: growing ? undefined : opened ? '\u2713' : String(skillCost(id, human.skills.length)),
        reachable: growing || canOpenSkill(human, id, gameController.getMap()),
        size: MEDALLION_SIZE,
        app: host.app,
        textBake: TREE_TEXT_BAKE,
      });
      medallion.position.set(pos.x, pos.y);
      medallion.scale.set(this.medallionScale.get(id) ?? 1);
      this.medallions.set(id, medallion);
      node.addChild(medallion);

      const name = makeLabel(SKILLS[id].name, {
        fontSize: FontSize.VERY_SMALL,
        fill: opened || growing || canOpenSkill(human, id, gameController.getMap()) ? THEME.skillTree.openedLabelText : THEME.skillTree.closedLabelText,
        bake: TREE_TEXT_BAKE,
      });
      name.anchor.set(0.5, 0.5);
      name.position.set(pos.x, pos.y + MEDALLION_SIZE / 2 + 22);
      node.addChild(name);
      ring.addChild(node);
    }

    const close = new Button({ label: t('common.close'), onClick: () => useGameStore.getState().setOverlay(null) });
    close.position.set(host.app.screen.width / 2 - close.width / 2, host.app.screen.height - 84);
    this.el.addChild(close);
    if (!isTouchDevice()) {
      const hint = new KeyHints([
        { key: '↑↓←→', label: t('common.keySelect') },
        { key: 'Enter', label: t('common.keyConfirm') },
        { key: 'Esc', label: t('common.keyClose') },
      ]);
      hint.position.set((host.app.screen.width - hint.width) / 2, close.y + close.height + HINT_GAP / 2);
      this.el.addChild(hint);
    }

    if (this.selected !== null) this.drawDetail(human);
  }

  private drawDetail(human: Player): void {
    if (!this.el || !this.host || this.selected === null) return;
    const host = this.host;
    const id = this.selected;
    const info = SKILLS[id];
    const opened = hasSkill(human, id);

    const buttons: Button[] = [];
    this.detailOpen = null;
    if (!opened) {
      const canOpen = canOpenSkill(human, id, gameController.getMap());
      const open = (): void => {
        gameController.actions.openSkill(id);
        this.closeDetail();
      };
      if (canOpen) this.detailOpen = open;
      buttons.push(new Button({ label: t('ui.open'), disabled: !canOpen, onClick: open }));
    }
    buttons.push(new Button({ label: opened ? t('common.ok') : t('common.close'), onClick: () => this.closeDetail() }));

    const popup = new Popup({
      app: host.app,
      title: info.name,
      buttons,
      onClose: () => this.closeDetail(),
      closeOnBackdrop: true,
      closeOnEscape: false,
    });

    const content = popup.content;
    let y = 0;
    // The skill medallion, centred above the description.
    const MEDALLION_DETAIL_SIZE = 72;
    const medallion = makeSkillMedallion({
      skill: id,
      opened,
      size: MEDALLION_DETAIL_SIZE,
      app: host.app,
    });
    medallion.position.set(popup.contentWidth / 2, MEDALLION_DETAIL_SIZE / 2);
    content.addChild(medallion);
    y = MEDALLION_DETAIL_SIZE + 12;
    const desc = makeRichLabel(info.description, { fontSize: FontSize.SMALL, fill: 0xcccccc, width: popup.contentWidth });
    desc.position.set(0, y);
    content.addChild(desc);
    y += desc.height + 12;

    if (opened) {
      const state = makeLabel(t('skill.opened'), { fontSize: FontSize.SMALL, fill: 0xeeeeee, wordWrap: true, wordWrapWidth: popup.contentWidth });
      state.position.set(0, y);
      content.addChild(state);
    } else {
      const label = makeLabel(t('skill.costLabel'), { fontSize: FontSize.SMALL, fill: 0xeeeeee });
      label.position.set(0, y);
      const coin = makeIcon('gold-32', 18);
      coin.anchor.set(0, 0.5);
      coin.position.set(label.width + 6, y + label.height / 2);
      const price = makeLabel(String(skillCost(id, human.skills.length)), { fontSize: FontSize.SMALL, fill: 0xeeeeee });
      price.position.set(coin.x + 22, y);
      content.addChild(label, coin, price);
    }

    this.el.addChild(popup.el);
    this.detailPopup = popup;
    popup.finish();
    if (!isTouchDevice()) {
      const hint = new KeyHints([
        ...(opened ? [] : [{ key: 'Enter', label: t('ui.open') }]),
        { key: 'Esc', label: t('common.keyClose') },
      ]);
      hint.position.set((host.app.screen.width - hint.width) / 2, popup.cardEl.y + popup.height / 2 + HINT_GAP);
      popup.el.addChild(hint);
    }
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.hudMoney?.destroy();
    this.hudMoney = null;
    this.stopInertia();
    if (this.tickFn) this.host?.app.ticker?.remove(this.tickFn);
    this.tickFn = null;
    window.removeEventListener('pointermove', this.onHoverMove);
    this.detachPointerListeners();
    this.pointers.clear();
    this.pinchActive = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('wheel', this.onDomWheel);
    window.removeEventListener('pointerdown', this.onPointerDown);
    this.detailPopup?.destroy();
    this.detailPopup = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.ring = null;
    this.host = null;
    this.selected = null;
    this.cursor = null;
    this.detailOpen = null;
    this.hovered = null;
    this.pressed = null;
    this.seenOpened = null;
    this.growing.clear();
    this.popping.clear();
    this.growLines.clear();
    this.medallions.clear();
    this.medallionScale.clear();
  }
}

/** Zoom factor of the opening pop at progress u in [0, 1]: zooms up to the peak, then settles back to 1 with a bounce. */
function popScale(u: number): number {
  const rise = 0.3;
  if (u < rise) {
    const k = u / rise;
    return 1 + POP_PEAK * (1 - (1 - k) ** 3);
  }
  const v = (u - rise) / (1 - rise);
  return 1 + POP_PEAK * Math.cos(v * Math.PI * 2.5) * (1 - v);
}
