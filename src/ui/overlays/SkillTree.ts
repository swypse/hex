import { Container, Graphics, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { SKILLS, hasSkill, canOpenSkill, skillCost, type SkillId } from '../../game/skills';
import { type Player } from '../../game/players';
import { TRIBES } from '../../game/tribes';
import { clampZoom, zoomAroundCursor } from '../../game/zoom';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { makeIcon } from '../kit/icon';
import { HudMoney } from '../hud/HudMoney';

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

const SKILL_ICON_FILES: Partial<Record<SkillId, string>> = {
  climbing: 'mountain.png',
  smithery: 'build-mine.png',
  swordsman: 'sword.png',
  geology: 'ore-increase.png',
  water: 'build-port.png',
  waterTemples: 'water-temple.png',
  navigation: 'ship.png',
  forestry: 'build-sawmill.png',
  forestTemple: 'forest-temple.png',
  science: 'miss-decrease.png',
  roads: 'build-road.png',
  shields: 'shield.png',
  defense: 'shield.png',
  catapult: 'catapult.png',
  riding: 'horse.png',
  bridges: 'build-bridge.png',
  knights: 'knight.png',
};

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
  private dragging = false;
  private dragPointerId = -1;
  private dragStart = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };

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
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const scale = this.fitScale * this.zoom;
    const nextZoom = clampZoom(this.zoom * factor);
    const nextScale = this.fitScale * nextZoom;
    this.pan = zoomAroundCursor({ x: e.global.x, y: e.global.y }, this.pan, scale, nextScale);
    this.zoom = nextZoom;
    this.applyTransform();
  };

  private onPointerDown = (e: FederatedPointerEvent): void => {
    this.dragging = true;
    this.dragPointerId = e.pointerId;
    this.dragStart = { x: e.global.x, y: e.global.y };
    this.panStart = { ...this.pan };
    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
  };

  private onWindowMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.pan = {
      x: this.panStart.x + (e.clientX - this.dragStart.x),
      y: this.panStart.y + (e.clientY - this.dragStart.y),
    };
    this.applyTransform();
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragPointerId) return;
    this.dragging = false;
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
  };

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

      const RADIUS = 28;
      const iconFile = SKILL_ICON_FILES[id];
      // Colored circle: grey (535353) when unopened, blue (5198FF) when opened.
      const bg = new Graphics();
      bg.circle(pos.x, pos.y, RADIUS)
        .fill(opened ? 0x5198ff : 0x535353)
        .stroke({ width: opened ? 5 : 2, color: opened ? 0x5198ff : 0x333333 });
      node.addChild(bg);

      // The skill image sits centered inside the circle, slightly smaller, so
      // the colored circle stays visible as its background/ring.
      if (iconFile) {
        const icon = makeIcon(iconFile, 42);
        icon.position.set(pos.x, pos.y);
        node.addChild(icon);
      }

      // Price / check badge pinned to the top-right edge of the node circle.
      const badgeCX = pos.x + RADIUS * 0.78;
      const badgeCY = pos.y - RADIUS * 0.78;
      const badgeR = 12;
      const badge = new Graphics();
      badge.circle(badgeCX, badgeCY, badgeR).fill(0xff8c00).stroke({ width: 2, color: 0xffffff });
      node.addChild(badge);
      const badgeText = makeLabel(opened ? '\u2713' : String(skillCost(id, human.skills.length)), {
        fontSize: 11,
        fill: 0xffffff,
        fontWeight: '800',
      });
      badgeText.anchor.set(0.5, 0.5);
      badgeText.position.set(badgeCX, badgeCY);
      node.addChild(badgeText);

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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    this.el?.destroy({ children: true });
    this.el = null;
    this.ring = null;
    this.host = null;
    this.selected = null;
  }
}
