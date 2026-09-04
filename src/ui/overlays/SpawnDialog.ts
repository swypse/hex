import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { hasSkill } from '../../game/skills';
import { tileAt } from '../../game/selection';
import { UNIT_TYPES, UNIT_TYPE_NAMES, type UnitType } from '../../game/units';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Dialog } from '../kit/dialog';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

const SPAWN_ICONS: Record<Exclude<UnitType, 'pirate'>, string> = {
  warrior: 'fist.png',
  archer: 'arch.png',
  rider: 'horse.png',
  swordsman: 'sword.png',
  shield: 'shield.png',
  catapult: 'catapult.png',
  knight: 'knight.png',
};

export class SpawnDialog {
  private el: Container | null = null;
  private card: Container | null = null;
  private host: UIHost | null = null;
  private reasonFor: UnitType | null = null;
  private cardW = 0;
  private cardH = 0;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.reasonFor = null;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || !selection) return;
    const village = tileAt(map, selection.q, selection.r);
    const player = s.players[s.localPlayerIndex];
    if (!village || !village.settlement || !player) return;

    const types = (Object.keys(UNIT_TYPES) as UnitType[]).filter((t) => t !== 'pirate');
    const cols = Math.min(types.length, host.app.screen.width <= 600 ? 2 : 4);
    const rows = Math.ceil(types.length / cols);
    this.cardW = cols * 92 + 32;
    this.cardH = 16 + 24 + 12 + rows * 112 + 16;

    const dialog = new Dialog({
      app: host.app,
      width: this.cardW,
      height: this.cardH,
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    root.addChild(dialog.el);
    this.el = dialog.el;
    this.card = dialog.card;
    this.drawCard(s);

    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useGameStore.getState().setOverlay(null);
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  private reasons(type: UnitType): string[] {
    const s = useGameStore.getState();
    const player = s.players[s.localPlayerIndex];
    const info = UNIT_TYPES[type];
    const out: string[] = [];
    if (!player) return out;
    if (player.resources.money < info.price) out.push(`Not enough money — need ${info.price}, have ${player.resources.money}`);
    if (info.priceWood > 0 && player.resources.wood < info.priceWood) out.push(`Not enough wood — need ${info.priceWood}, have ${player.resources.wood}`);
    if (info.priceOre > 0 && player.resources.ore < info.priceOre) out.push(`Not enough ore — need ${info.priceOre}, have ${player.resources.ore}`);
    if (type === 'rider' && !hasSkill(player, 'riding')) out.push('Requires the Riding skill');
    if (type === 'knight' && !hasSkill(player, 'knights')) out.push('Requires the Knights skill');
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) out.push('Requires the Swordsman skill');
    if (type === 'shield' && !hasSkill(player, 'shields')) out.push('Requires the Shields skill');
    if (type === 'catapult' && !hasSkill(player, 'catapult')) out.push('Requires the Catapult skill');
    return out;
  }

  private drawCard(s: ReturnType<typeof useGameStore.getState>): void {
    if (!this.card || !this.host) return;
    while (this.card.children.length > 1) {
      this.card.removeChildAt(1).destroy({ children: true });
    }
    const card = this.card;
    const cardW = this.cardW;
    const cardH = this.cardH;
    const host = this.host;

    const title = makeLabel('Spawn a unit', { fontSize: 16, fill: 0xffffff });
    title.position.set(16, 12);
    card.addChild(title);

    const close = makeLabel('\u2715', { fontSize: 16, fill: 0xffffff });
    close.position.set(cardW - 28, 10);
    close.eventMode = 'static';
    close.cursor = 'pointer';
    close.on('pointertap', () => useGameStore.getState().setOverlay(null));
    card.addChild(close);

    const types = (Object.keys(UNIT_TYPES) as UnitType[]).filter((t) => t !== 'pirate');
    const cellW = 92;
    const cellH = 112;
    const cols = Math.min(types.length, host.app.screen.width <= 600 ? 2 : 4);

    types.forEach((type, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const item = new Container();
      item.position.set(16 + col * cellW, 52 + row * cellH);
      item.eventMode = 'static';
      item.cursor = 'pointer';

      const circle = new Graphics();
      circle.circle(30, 30, 30).fill(0x333333).stroke({ width: 2, color: 0x888888 });
      item.addChild(circle);

      const icon = makeIcon(SPAWN_ICONS[type], 56);
      icon.position.set(30, 30);
      item.addChild(icon);

      const name = makeLabel(UNIT_TYPE_NAMES[type], { fontSize: 12, fill: 0xeeeeee });
      name.position.set(30 - name.width / 2, 66);
      item.addChild(name);

      const info = UNIT_TYPES[type];
      const woodText = info.priceWood > 0 ? ` + ${info.priceWood} wood` : '';
      const oreText = info.priceOre > 0 ? ` + ${info.priceOre} ore` : '';
      const price = makeLabel(`${info.price}${woodText}${oreText}`, { fontSize: 12, fill: 0xeeeeee });
      price.position.set(30 - price.width / 2, 84);
      item.addChild(price);

      const reasons = this.reasons(type);
      const disabled = reasons.length > 0;
      item.alpha = disabled ? 0.4 : 1;
      item.on('pointertap', () => {
        if (disabled) {
          this.reasonFor = type;
          this.drawCard(useGameStore.getState());
        } else {
          gameController.spawnSelectedVillage(type);
        }
      });
      card.addChild(item);
    });

    if (this.reasonFor !== null) {
      const r = this.reasons(this.reasonFor);
      const modal = new Container();
      modal.eventMode = 'static';
      modal.on('pointertap', () => {});
      const modalW = 340;
      const modalH = 24 + r.length * 22 + 12 + 34 + 16;
      const mbg = new Graphics();
      mbg.roundRect(0, 0, modalW, modalH, 8).fill(0x111111);
      modal.addChild(mbg);
      const name = makeLabel(UNIT_TYPE_NAMES[this.reasonFor], { fontSize: 16, fill: 0xffffff, fontWeight: '700' });
      name.position.set(16, 12);
      modal.addChild(name);
      r.forEach((reason, i) => {
        const t = makeLabel(reason, { fontSize: 14, fill: 0xcccccc });
        t.position.set(16, 40 + i * 22);
        modal.addChild(t);
      });
      const ok = new Button({ label: 'OK', width: 120, onClick: () => { this.reasonFor = null; this.drawCard(useGameStore.getState()); } });
      ok.position.set(modalW / 2 - 60, 24 + r.length * 22 + 12);
      modal.addChild(ok);
      modal.position.set(cardW / 2 - modalW / 2, cardH / 2 - modalH / 2);
      card.addChild(modal);
    }
  }

  destroy(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.card = null;
    this.host = null;
    this.reasonFor = null;
  }
}
