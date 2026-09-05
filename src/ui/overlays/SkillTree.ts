import { Container, Graphics, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { SKILLS, hasSkill, canOpenSkill, skillCost, type SkillId } from '../../game/skills';
import { type Player } from '../../game/players';
import { TRIBES } from '../../game/tribes';
import { clampZoom, zoomAroundCursor, decayVelocity, INERTIA_START_SPEED, INERTIA_STOP_SPEED } from '../../game/zoom';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { HudMoney } from '../hud/HudMoney';
import { makeSkillMedallion } from '../kit/skillMedallion';

const RING_SPACING = 110;
const CX = 400;
const CY = 340;

export interface SkillNodeLayout {
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
  const assign = (id: SkillId, start: number, end: number, d: number): void => {
    depth.set(id, d);
    angle.set(id, (start + end) / 2);
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) return;
    const width = (end - start) / kids.length;
    for (let i = 0; i < kids.length; i++) {
      assign(kids[i]!, start + i * width, start + (i + 1) * width, d + 1);
    }
  };
  for (let i = 0; i < roots.length; i++) {
    assign(roots[i]!, i * rootSector, (i + 1) * rootSector, 1);
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

export class SkillTree {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private ring: Container | null = null;
  private selected: SkillId | null = null;
  private unsub: (() => void) | null = null;
  private hudMoney: HudMoney | null = null;
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

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.fitScale = Math.min(host.app.screen.width / 900, host.app.screen.height / 760, 1);
    this.zoom = 1;
    this.pan = {
      x: host.app.screen.width / 2 - CX * this.fitScale,
      y: host.app.screen.height / 2 - CY * this.fitScale,
    };
    const el = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill(0x1a1a2e);
    bg.eventMode = 'static';
    bg.on('wheel', this.onWheel);
    bg.on('pointerdown', this.onPointerDown);
    el.addChild(bg);
    root.addChild(el);
    this.el = el;
    this.selected = null;
    this.build();
    this.hudMoney = new HudMoney();
    this.hudMoney.mount(host, root);
    this.unsub = useGameStore.subscribe(() => this.build());
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onWheel = (e: FederatedWheelEvent): void => {
    this.stopInertia();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const scale = this.fitScale * this.zoom;
    const nextZoom = clampZoom(this.zoom * factor);
    const nextScale = this.fitScale * nextZoom;
    this.pan = zoomAroundCursor({ x: e.global.x, y: e.global.y }, this.pan, scale, nextScale);
    this.zoom = nextZoom;
    this.applyTransform();
  };

  private onPointerDown = (e: FederatedPointerEvent): void => {
    const pos = { x: e.global.x, y: e.global.y };
    this.pointers.set(e.pointerId, { ...pos });
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
    if (this.pinchActive && this.pointers.size < 2) {
      this.pinchActive = false;
      // Continue panning with the remaining finger.
      const remaining = [...this.pointers.values()][0];
      if (remaining) this.beginSingleDrag(remaining);
    }
    if (this.pointers.size === 0) {
      if (!this.pinchActive && Math.hypot(this.dragVelocity.x, this.dragVelocity.y) >= INERTIA_START_SPEED) {
        this.startInertia();
      }
      this.dragVelocity = { x: 0, y: 0 };
      this.detachPointerListeners();
    }
  };

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
    if (e.key !== 'Escape') return;
    if (this.selected !== null) {
      this.selected = null;
      this.build();
    } else {
      useGameStore.getState().setOverlay(null);
    }
  };

  private build(): void {
    if (!this.el || !this.host) return;
    const host = this.host;
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
    const tribe = TRIBES.find((t) => t.id === human.tribe)!;
    const highlight = new Set(useGameStore.getState().tutorialHighlightSkills);

    const title = makeLabel('Skill tree', { fontSize: 24, fill: 0xffffff, fontWeight: '700' });
    title.anchor.set(0.5, 0.5);
    title.position.set(host.app.screen.width / 2, 64);
    this.el.addChild(title);

    const scale = Math.min(host.app.screen.width / 900, host.app.screen.height / 760, 1);
    this.fitScale = scale;
    const ring = new Container();
    this.ring = ring;
    this.applyTransform();
    this.el.addChild(ring);

    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const opened = hasSkill(human, id);
      const parent = SKILLS[id].parent;
      const p = parent ? POS[parent] : { x: CX, y: CY };
      const c = POS[id];
      const line = new Graphics();
      line.moveTo(p.x, p.y).lineTo(c.x, c.y).stroke({ width: opened ? 4 : 2, color: opened ? 0xff8c00 : 0x555555 });
      ring.addChild(line);
    }

    const rootCircle = new Graphics();
    rootCircle.circle(CX, CY, 34).fill(tribe.color).stroke({ width: 3, color: 0xffffff });
    ring.addChild(rootCircle);
    const rootName = makeLabel(tribe.name, { fontSize: 12, fill: 0xffffff });
    rootName.anchor.set(0.5, 0.5);
    rootName.position.set(CX, CY);
    ring.addChild(rootName);

    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const pos = POS[id];
      const opened = hasSkill(human, id);
      if (!opened && highlight.has(id)) {
        const halo = new Graphics();
        halo.circle(pos.x, pos.y, 33).stroke({ width: 5, color: 0xffd700, alpha: 0.95 });
        halo.circle(pos.x, pos.y, 38).stroke({ width: 2, color: 0xffd700, alpha: 0.5 });
        ring.addChild(halo);
      }
      const node = new Container();
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', () => {
        this.selected = id;
        this.build();
      });

      const medallion = makeSkillMedallion({
        skill: id,
        opened,
        priceText: opened ? '\u2713' : String(skillCost(id, human.skills.length)),
        size: 56,
      });
      medallion.position.set(pos.x, pos.y);
      node.addChild(medallion);

      const name = makeLabel(SKILLS[id].name, { fontSize: 13, fill: 0xeeeeee });
      name.anchor.set(0.5, 0.5);
      name.position.set(pos.x, pos.y + 50);
      node.addChild(name);
      ring.addChild(node);
    }

    const close = new Button({ label: 'Close', onClick: () => useGameStore.getState().setOverlay(null) });
    close.position.set(host.app.screen.width / 2 - close.width / 2, host.app.screen.height - 60);
    this.el.addChild(close);

    if (this.selected !== null) this.drawDetail(human);
  }

  private drawDetail(human: Player): void {
    if (!this.el || !this.host || this.selected === null) return;
    const host = this.host;
    const id = this.selected;
    const info = SKILLS[id];
    const opened = hasSkill(human, id);

    const modalW = 440;
    const name = makeLabel(info.name, { fontSize: 18, fill: 0xff8c00, fontWeight: '700' });
    const desc = makeLabel(info.description, { fontSize: 14, fill: 0xcccccc, wordWrap: true, wordWrapWidth: modalW - 32 });
    const lines: string[] = opened ? ['Opened'] : [`Cost: ${skillCost(id, human.skills.length)} money`];
    const modalH = 46 + desc.height + 8 + lines.length * 20 + 12 + 40 + 16;

    const modal = new Container();
    modal.eventMode = 'static';
    modal.on('pointertap', () => {});

    const bg = new Graphics();
    bg.roundRect(0, 0, modalW, modalH, 8).fill(0x000000);
    modal.addChild(bg);

    name.position.set(16, 12);
    modal.addChild(name);

    desc.position.set(16, 46);
    modal.addChild(desc);

    let y = 46 + desc.height + 8;
    for (const line of lines) {
      const t = makeLabel(line, { fontSize: 14, fill: 0xcccccc });
      t.position.set(16, y);
      modal.addChild(t);
      y += 20;
    }
    const close = new Button({ label: 'Close', onClick: () => { this.selected = null; this.build(); } });
    if (!opened) {
      const open = new Button({ label: 'Open', disabled: !canOpenSkill(human, id), onClick: () => { gameController.openSkill(id); this.selected = null; this.build(); } });
      open.position.set(16, y);
      modal.addChild(open);
      close.position.set(modalW - close.width - 16, y);
    } else {
      close.position.set(modalW / 2 - close.width / 2, y);
    }
    modal.addChild(close);
    modal.position.set(host.app.screen.width / 2 - modalW / 2, host.app.screen.height / 2 - modalH / 2);
    this.el.addChild(modal);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.hudMoney?.destroy();
    this.hudMoney = null;
    this.stopInertia();
    this.detachPointerListeners();
    this.pointers.clear();
    this.pinchActive = false;
    window.removeEventListener('keydown', this.onKeyDown);
    this.el?.destroy({ children: true });
    this.el = null;
    this.ring = null;
    this.host = null;
    this.selected = null;
  }
}
