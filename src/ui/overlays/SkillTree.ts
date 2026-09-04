import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { SKILLS, hasSkill, canOpenSkill, skillCost, type SkillId } from '../../game/skills';
import { scoreBreakdown, totalScore } from '../../game/score';
import { type Player } from '../../game/players';
import { TRIBES } from '../../game/tribes';
import { clampZoom, zoomAroundCursor, decayVelocity, INERTIA_START_SPEED, INERTIA_STOP_SPEED } from '../../game/zoom';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';
import { HudMoney } from '../hud/HudMoney';
import { HudScore } from '../hud/HudScore';
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
  private detailPopup: Popup | null = null;
  private unsub: (() => void) | null = null;
  private hudMoney: HudMoney | null = null;
  private hudScore: HudScore | null = null;
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
    el.addChild(bg);
    root.addChild(el);
    this.el = el;
    this.selected = null;
    this.build();
    this.hudMoney = new HudMoney();
    this.hudMoney.mount(host, root);
    const hudScore = new HudScore();
    hudScore.onTap = () => this.openScorePopup();
    hudScore.mount(host, root);
    this.hudScore = hudScore;
    this.unsub = useGameStore.subscribe(() => this.build());
    window.addEventListener('keydown', this.onKeyDown);
    // DOM-level interaction handlers: wheel zoom and pointer panning work no
    // matter what is under the cursor/finger (skill nodes are not Pixi
    // hit-test targets), and a stationary tap is forwarded to the skill node
    // under it. Pixi wheel events do not bubble through the non-interactive
    // ring container to the background surface.
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('wheel', this.onDomWheel, { passive: false });
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

  private handleTap(x: number, y: number): void {
    if (!this.ring) return;
    const s = this.ring.scale.x;
    let best: SkillId | null = null;
    let bestD = Infinity;
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const p = POS[id];
      const wx = this.pan.x + p.x * s;
      const wy = this.pan.y + p.y * s;
      const r = Math.max(12, 32 * s);
      const d2 = (x - wx) * (x - wx) + (y - wy) * (y - wy);
      if (d2 <= r * r && d2 < bestD) {
        bestD = d2;
        best = id;
      }
    }
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
    if (e.key !== 'Escape') return;
    if (this.selected !== null || this.detailPopup) {
      this.closeDetail();
    } else {
      useGameStore.getState().setOverlay(null);
    }
  };

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
    const tribe = TRIBES.find((t) => t.id === human.tribe)!;
    const highlight = new Set(useGameStore.getState().tutorialHighlightSkills);

    const title = makeLabel(t('skillTree.title'), { fontSize: 24, fill: 0xffffff, fontWeight: '700' });
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
      // Skill nodes are intentionally not Pixi-interactive: panning, zooming
      // and tap-to-open are all handled at the DOM level (window pointer/wheel
      // events) so they work identically no matter what is under the cursor.
      const node = new Container();
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

    const close = new Button({ label: t('common.close'), onClick: () => useGameStore.getState().setOverlay(null) });
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

    const buttons: Button[] = [];
    if (!opened) {
      buttons.push(new Button({
        label: t('ui.open'),
        disabled: !canOpenSkill(human, id),
        onClick: () => {
          gameController.openSkill(id);
          this.closeDetail();
        },
      }));
    }
    buttons.push(new Button({ label: opened ? 'OK' : 'Close', onClick: () => this.closeDetail() }));

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
    const desc = makeLabel(info.description, {
      fontSize: 14,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    desc.position.set(0, y);
    content.addChild(desc);
    y += desc.height + 12;

    const stateText = opened ? t('skill.opened') : t('skill.cost', { cost: skillCost(id, human.skills.length) });
    const state = makeLabel(stateText, { fontSize: 14, fill: 0xeeeeee, wordWrap: true, wordWrapWidth: popup.contentWidth });
    state.position.set(0, y);
    content.addChild(state);

    this.el.addChild(popup.el);
    this.detailPopup = popup;
    popup.finish();
  }

  private openScorePopup(): void {
    if (!this.host || !this.el) return;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const player = s.players[s.localPlayerIndex];
    if (!map || !player) return;
    const popup = new Popup({
      app: this.host.app,
      title: t('stats.title'),
      buttons: [new Button({ label: t('common.close'), onClick: () => popup.destroy() })],
      closeOnBackdrop: true,
      closeOnEscape: true,
      onClose: () => popup.destroy(),
    });
    let y = 0;
    const addLine = (text: string, opts?: { bold?: boolean }): void => {
      const label = makeLabel(text, {
        fontSize: opts?.bold ? 16 : 14,
        fill: opts?.bold ? 0xffffff : 0xeeeeee,
        fontWeight: opts?.bold ? '700' : undefined,
        wordWrap: true,
        wordWrapWidth: popup.contentWidth,
      });
      label.position.set(0, y);
      y += label.height + (opts?.bold ? 10 : 6);
      popup.content.addChild(label);
    };
    const tribe = TRIBES.find((t) => t.id === player.tribe);
    addLine(`${player.name}${tribe ? ` (${tribe.name})` : ''}`, { bold: true });
    for (const item of scoreBreakdown(map, player, 0)) {
      const line = item.score === 0
        ? `${item.label}: ${item.count}`
        : item.count === 0
          ? `${item.label}: ${item.score}`
          : `${item.label}: ${item.count}, Scores: ${item.score}`;
      addLine(line);
    }
    addLine(`${t('gameover.total')} ${totalScore(map, player)}`, { bold: true });
    this.el.addChild(popup.el);
    popup.finish();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.hudMoney?.destroy();
    this.hudMoney = null;
    this.hudScore?.destroy();
    this.hudScore = null;
    this.stopInertia();
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
  }
}
