import { BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import { t } from '../../i18n';
import { HELP_BUILDINGS, HELP_SHORTCUTS, HELP_WEATHER } from '../../game/help-catalog';
import { resourceTokens } from '../../game/economy/resources';
import { tribeUnitTypes, TRIBES } from '../../game/tribes';
import { unitTypeDescription, unitTypeFeatureLines } from '../../game/units/unit-descriptions';
import { UNIT_IMAGE_FILES, UNIT_TYPE_NAMES, UNIT_TYPES, unitFoodUpkeep, unitSpawnCost, unitTypeMaintenance } from '../../game/units/units';
import { BODY_LINE_HEIGHT, makeLabel } from '../../gfx/label';
import { makeActionButtonIcon } from '../../gfx/action-button-icons';
import { ensureTribeAtlas, tribeTileTexture } from '../../render/tribe-atlas';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { ButtonGroup } from '../kit/button-group';
import { Popup } from '../kit/popup';
import { makeRichLabel } from '../kit/rich-label';
import { makeTribeOption } from '../kit/tribe-option';
import { hasKeyboard } from '../kit/touch';
import { PopupDialog } from './popup-dialog';
import { FontSize, HelpTab, Tribe, type UnitType } from '@enums';

const WIDTH = 480;
/** Line height of the content text, as a multiple of the font size. */
const LINE_HEIGHT = 1.6;
/** Pixel line pitch of the content text, and the extra space between its paragraphs. */
const TEXT_LINE_PX = Math.round(FontSize.SMALL * LINE_HEIGHT);
const PARAGRAPH_GAP = 10;
const ROW_GAP = 14;
const DIVIDER_ALPHA = 0.15;
const SECTION_GAP = 12;
const ICON_SIZE = 40;
const ICON_GAP = 12;
const KEY_COLUMN = 130;
/** Tribe picker circles are drawn at this fraction of the setup screen's size; the unselected ones are dimmed. */
const TRIBE_SCALE = 0.75;
/** Radius of a tribe option circle (as in the setup screen), the gap between them and their selection stroke. */
const TRIBE_RADIUS = 28 * TRIBE_SCALE;
const TRIBE_GAP = 14;
const TRIBE_STROKE = 4 * TRIBE_SCALE;
const UNIT_SPRITE_SIZE = 84;
/** Pixels one Up / Down key press scrolls. */
const SCROLL_STEP = 60;
const INACTIVE_ALPHA = 0.6;
const TEXT_COLOR = 0xeeeeee;
const MUTED_COLOR = 0xb8bccc;
/** Share of the screen height the dialog takes; fixed so switching tabs doesn't resize it. */
const HEIGHT_SHARE = 0.85;

const TAB_LABELS: Record<HelpTab, string> = {
  [HelpTab.KEYBOARD]: 'guide.tab.keyboard',
  [HelpTab.BUILDINGS]: 'guide.tab.buildings',
  [HelpTab.BONUSES]: 'guide.tab.bonuses',
  [HelpTab.EVENTS]: 'guide.tab.events',
  [HelpTab.UNITS]: 'guide.tab.units',
};

/** Tabs with the game's rules at a glance: shortcuts, buildings, bonuses, weather events, units by tribe. */
export class HelpDialog extends PopupDialog {
  private tab = HelpTab.BUILDINGS;
  private tribe = Tribe.Cats;
  private body = new Container();
  private tabs: ButtonGroup | null = null;
  private tabIds: HelpTab[] = [];
  private contentWidth = 0;
  private destroyed = false;

  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const close = (): void => useGameStore.getState().setOverlay(null);
    const popup = new Popup({
      app: host.app,
      title: t('guide.title'),
      width: WIDTH,
      height: Math.floor(host.app.screen.height * HEIGHT_SHARE),
      buttons: [new Button({ label: t('common.close'), onClick: close })],
      onClose: close,
    });
    this.contentWidth = popup.contentWidth;
    this.tribe = s.players[s.localPlayerIndex]?.tribe ?? Tribe.Cats;
    this.tabIds = [...(hasKeyboard() ? [HelpTab.KEYBOARD] : []), HelpTab.BUILDINGS, HelpTab.BONUSES, HelpTab.EVENTS, HelpTab.UNITS];
    this.tab = this.tabIds[0]!;

    const tabs = new ButtonGroup({ items: this.tabIds.map((id) => ({ label: t(TAB_LABELS[id]), onClick: () => this.select(id) })) });
    // A narrow screen squeezes the tab row instead of overflowing it.
    if (tabs.groupWidth > this.contentWidth) tabs.scale.set(this.contentWidth / tabs.groupWidth);
    this.tabs = tabs;
    this.body.position.set(0, tabs.height + SECTION_GAP);
    popup.content.addChild(tabs, this.body);
    this.present(root, popup);
    this.select(this.tab);
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** Left / right switch to the previous / next tab; up / down scroll the content; Tab / Shift+Tab pick the next / previous tribe on the Units tab. */
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (this.tab !== HelpTab.UNITS) return;
      const n = TRIBES.length;
      const i = TRIBES.findIndex((tr) => tr.id === this.tribe);
      this.tribe = TRIBES[(i + (e.shiftKey ? -1 : 1) + n) % n]!.id;
      this.renderBody();
      return;
    }
    if (e.shiftKey) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.popup?.scrollBy(e.key === 'ArrowDown' ? SCROLL_STEP : -SCROLL_STEP);
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const n = this.tabIds.length;
    const i = this.tabIds.indexOf(this.tab) + (e.key === 'ArrowRight' ? 1 : -1);
    this.select(this.tabIds[(i + n) % n]!);
  };

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.destroyed = true;
    super.destroy();
  }

  private select(tab: HelpTab): void {
    this.tab = tab;
    this.tabs?.buttons.forEach((b, i) => (b.selected = this.tabIds[i] === tab));
    this.renderBody();
  }

  private renderBody(): void {
    this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    switch (this.tab) {
      case HelpTab.KEYBOARD:
        this.renderKeyboard();
        break;
      case HelpTab.BUILDINGS:
        this.renderBuildings();
        break;
      case HelpTab.BONUSES:
        this.renderBonuses();
        break;
      case HelpTab.EVENTS:
        this.renderEvents();
        break;
      case HelpTab.UNITS:
        this.renderUnits();
        break;
    }
    this.popup?.reflow();
    this.popup?.scrollBy(null);
  }

  private text(text: string, width: number, fill = TEXT_COLOR): Container {
    return makeRichLabel(text, { fontSize: FontSize.SMALL, fill, width, lineHeight: LINE_HEIGHT });
  }

  /** A bold title above wrapped lines, to the right of an optional left column of `indent` px; returns the height used. */
  private addBlock(y: number, indent: number, title: string, lines: string[], muted = false): number {
    const width = this.contentWidth - indent;
    const head = makeLabel(title, { fontSize: FontSize.NORMAL, fill: 0xffffff, fontWeight: 'bold' });
    head.position.set(indent, y);
    this.body.addChild(head);
    let h = head.height + 4;
    for (const line of lines) {
      const label = this.text(line, width, muted ? MUTED_COLOR : TEXT_COLOR);
      label.position.set(indent, y + h);
      this.body.addChild(label);
      // Whole text lines plus an extra gap, so paragraphs sit further apart than the lines inside one.
      h += Math.ceil(label.height / TEXT_LINE_PX) * TEXT_LINE_PX + PARAGRAPH_GAP;
    }
    return h;
  }

  /** Ends a row that spans down to `bottom`: a thin divider in the middle of the gap, unless it is the last row. Returns the next row's y. */
  private endRow(bottom: number, last: boolean): number {
    if (!last) {
      const line = new Graphics().rect(0, bottom + ROW_GAP / 2, this.contentWidth, 1).fill({ color: 0xffffff, alpha: DIVIDER_ALPHA });
      this.body.addChild(line);
    }
    return bottom + ROW_GAP;
  }

  private renderKeyboard(): void {
    let y = 0;
    for (const [i, { keys, labelKey }] of HELP_SHORTCUTS.entries()) {
      const cap = makeLabel(keys, { fontSize: FontSize.VERY_SMALL, fill: 0xffffff });
      const box = new Graphics()
        .roundRect(0, 0, cap.width + 12, cap.height + 6, 4)
        .fill({ color: 0xffffff, alpha: 0.12 })
        .stroke({ color: 0xffffff, alpha: 0.45, width: 1 });
      cap.position.set(6, 3);
      const key = new Container();
      key.addChild(box, cap);
      key.position.set(0, y);
      const label = this.text(t(labelKey), this.contentWidth - KEY_COLUMN);
      label.position.set(KEY_COLUMN, y);
      this.body.addChild(key, label);
      y = this.endRow(y + Math.max(key.height, label.height), i === HELP_SHORTCUTS.length - 1);
    }
  }

  private renderBuildings(): void {
    let y = 0;
    for (const [i, { id, cost, upkeep }] of HELP_BUILDINGS.entries()) {
      const icon = makeActionButtonIcon(id, ICON_SIZE);
      icon.position.set(ICON_SIZE / 2, ICON_SIZE / 2);
      icon.anchor.set(0.5);
      icon.y = y + ICON_SIZE / 2;
      this.body.addChild(icon);
      const upkeepLine = upkeep > 0 ? t('guide.label.upkeep', { value: `[money:${upkeep}]` }) : t('guide.label.upkeepNone');
      y = this.endRow(y + Math.max(
        ICON_SIZE,
        this.addBlock(y, ICON_SIZE + ICON_GAP, t(`guide.building.${id}.name`), [
          t('guide.label.cost', { value: resourceTokens(cost) }),
          upkeepLine,
          t('guide.label.gives', { value: t(`guide.building.${id}.gives`) }),
          t('guide.label.destroy', { value: t(`guide.building.${id}.destroy`) }),
        ]),
      ), i === HELP_BUILDINGS.length - 1);
    }
  }

  private renderBonuses(): void {
    const y = this.endRow(this.addBlock(0, 0, t('guide.bonus.title'), [t('guide.bonus.where'), t('guide.bonus.claim'), t('guide.bonus.types')]), false);
    this.addBlock(y, 0, t('guide.bottle.title'), [t('guide.bottle.where'), t('guide.bottle.claim'), t('guide.bottle.types')]);
  }

  private renderEvents(): void {
    let y = 0;
    for (const [i, type] of HELP_WEATHER.entries()) {
      y = this.endRow(y + this.addBlock(y, 0, t(`guide.weather.${type}.name`), [
        t('guide.label.when', { value: t(`guide.weather.${type}.when`) }),
        t('guide.label.effect', { value: t(`guide.weather.${type}.effect`) }),
        t('guide.label.protect', { value: t(`guide.weather.${type}.protect`) }),
      ]), i === HELP_WEATHER.length - 1);
    }
  }

  private renderUnits(): void {
    // The tribe picker: round buttons like the setup screen's, the selected one outlined in its colour.
    const step = TRIBE_RADIUS * 2 + TRIBE_GAP;
    const rowWidth = step * (TRIBES.length - 1) + TRIBE_RADIUS * 2;
    const row = new Container();
    TRIBES.forEach((tr, i) => {
      const opt = makeTribeOption(tr.name, `${tr.code}-icon.png`, () => {
        this.tribe = tr.id;
        this.renderBody();
      }, tr.id === this.tribe, tr.color);
      // Only the circle: the names don't fit in a row of seven.
      opt.el.children.forEach((c) => {
        if (c instanceof BitmapText) c.visible = false;
      });
      opt.el.scale.set(TRIBE_SCALE);
      opt.el.alpha = tr.id === this.tribe ? 1 : INACTIVE_ALPHA;
      opt.el.position.set(TRIBE_RADIUS + i * step, TRIBE_RADIUS + TRIBE_STROKE);
      row.addChild(opt.el);
    });
    row.x = Math.max(0, (this.contentWidth - rowWidth) / 2);
    if (rowWidth > this.contentWidth) row.scale.set(this.contentWidth / rowWidth);
    this.body.addChild(row);

    const tribe = TRIBES.find((tr) => tr.id === this.tribe)!;
    let y = (TRIBE_RADIUS + TRIBE_STROKE) * 2 * row.scale.x + SECTION_GAP * 1.5;
    const types = tribeUnitTypes(this.tribe);
    for (const [i, type] of types.entries()) {
      const sprite = this.unitSprite(tribe.code, type);
      sprite.position.set(0, y);
      this.body.addChild(sprite);
      const info = UNIT_TYPES[type];
      const lines = [
        unitTypeDescription(type),
        t('guide.unit.stats', { move: info.movePoints, attack: info.attack, range: info.attackDistance, hp: info.maxHp, def: info.defense }),
        t('guide.unit.cost', { value: resourceTokens(unitSpawnCost(type)) }),
        t('guide.unit.upkeep', { money: unitTypeMaintenance(type), food: unitFoodUpkeep(type) }),
        ...unitTypeFeatureLines(type),
      ];
      y = this.endRow(y + Math.max(UNIT_SPRITE_SIZE, this.addBlock(y, UNIT_SPRITE_SIZE + ICON_GAP, UNIT_TYPE_NAMES[type], lines)), i === types.length - 1);
    }
  }

  /** The unit's art for a tribe; filled in once that tribe's atlas has loaded. */
  private unitSprite(code: string, type: UnitType): Sprite {
    const size = UNIT_SPRITE_SIZE;
    const sprite = new Sprite();
    const tribe = TRIBES.find((tr) => tr.code === code)!;
    const frameKey = UNIT_IMAGE_FILES[tribe.id][type as keyof (typeof UNIT_IMAGE_FILES)[Tribe]].replace(/\.png$/, '');
    void ensureTribeAtlas(code).then(() => {
      const texture = tribeTileTexture(code, frameKey);
      if (!texture || sprite.destroyed) return;
      sprite.texture = texture;
      const k = size / Math.max(texture.width, texture.height);
      sprite.scale.set(k);
    });
    return sprite;
  }
}
