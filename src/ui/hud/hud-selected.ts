import { t } from '../../i18n';
import { Circle, Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { TRIBES } from '../../game/tribes';
import { isForestType, isMountainType, isWaterType, TILE_TYPE_NAMES } from '../../game/tile-types';
import { UNIT_TYPE_NAMES, UNIT_TYPES, unitMaintenance, type Unit } from '../../game/units';
import { unitCanAct } from '../../game/unit-actions';
import { tileAt } from '../../game/selection';
import { attackDamage } from '../../game/combat';
import { activeBuffs, VILLAGE_DEFENSE } from '../../game/buffs';
import { isShip } from '../../game/ship';
import { villageCapacity, villageBuildingLimit, buildingsInVillage, unitsInVillage } from '../../game/village';
import { villageIncome, VILLAGE_CONNECTION_BONUS } from '../../game/capture';
import { villageUpgradeCost } from '../../game/resources';
import { buildingYield, buildingHp, BUILDING_MAX_HP, BUILDING_NAMES, DESTROY_BUILDING_COST } from '../../game/buildings';
import { isExploredFor } from '../../game/explore';
import { hexNeighbors } from '../../game/hex';
import { canOpenSkill, hasSkill, skillCost, type SkillId } from '../../game/skills';
import { canBuildRoadHere, isVillageRoadConnected } from '../../game/roads';
import { canBuildBridgeHere, hasBridge } from '../../game/bridges';
import type { Player } from '../../game/players';
import type { GameMap, MapTile } from '../../game/map-gen';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { makeIcon } from '../kit/icon';
import { ICONS16_FILES, icons16FrameForIconPath, makeIcon16 } from '../kit/icons16';
import { makeSkillMedallion } from '../kit/skill-medallion';
import { makePanel } from '../kit/panel';
import { THEME } from '../kit/theme';
import { makeActionButtonIcon } from '../kit/action-button-icons';
import { ACTION_BUTTON_ICON_FILES } from '../kit/action-button-icons';
import { selectedInfoClosed, setSelectedInfoClosed } from '../../storage/settings';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from '../layout';

function unitDefenseBuffs(map: GameMap, unit: Unit, tile: MapTile): { key: string; amount: number }[] {
  const out: { key: string; amount: number }[] = [];
  if (unit.owner < 0) return out;
  const buffs = activeBuffs(map, unit.owner);
  if (buffs.includes('waterProtection') && isShip(unit)) out.push({ key: 'hud.buff.waterProtection', amount: 10 });
  if (buffs.includes('forestProtection') && isForestType(tile.terrain)) out.push({ key: 'hud.buff.forestProtection', amount: 10 });
  if (tile.settlement && tile.settlement.owner === unit.owner) out.push({ key: 'hud.buff.village', amount: VILLAGE_DEFENSE });
  if (tile.settlement?.wall && tile.settlement.owner === unit.owner) out.push({ key: 'hud.buff.wall', amount: 3 });
  return out;
}

export class HudSelected implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private measured = 0;
  private closed = false;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.closed = selectedInfoClosed();
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const bottom = TOOLBAR_HEIGHT + TURN_BAR_HEIGHT + 8;
    this.el.position.set(0, this.host.app.screen.height - bottom - this.measured);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const selection = s.selection;
    const map = gameController.getMap();
    // Hide the selected-cell info while another player is acting: it would
    // show stale local actions (attacks/builds are not available out of turn).
    if (!selection || !map || s.currentPlayerIndex !== s.localPlayerIndex) {
      this.el.visible = false;
      return;
    }
    const tile = tileAt(map, selection.q, selection.r);
    const human = s.players[s.localPlayerIndex];
    if (!tile || !human || !isExploredFor(tile, human.index)) {
      this.el.visible = false;
      return;
    }
    this.el.visible = true;

    this.el.removeChildren().forEach((c) => c.destroy({ children: true }));

    if (this.closed) {
      this.renderCollapsed();
      this.layout();
      return;
    }

    const lines: string[] = [TILE_TYPE_NAMES[tile.terrain]];
    const bolds: boolean[] = [false];
    let unitLineIndex = -1;
    let settlementLineIndex = -1;
    let buildingLineIndex = -1;
    let buildingLimitLineIndex = -1;
    let bridgeLineIndex = -1;
    let unitRow: { name: string; pairs: { icon: string; value: string }[] } | null = null;
    let settlementRow: { name: string; pairs: { icon: string; value: string }[] } | null = null;
    let buildingRow: { name: string; pairs: { icon: string; value: string }[] } | null = null;

    if (hasBridge(tile)) {
      bridgeLineIndex = lines.length;
      lines.push(t('hud.selected.bridge'));
      bolds.push(true);
    }

    if (tile.unit) {
      const unit = tile.unit;
      const player = unit.owner >= 0 ? s.players[unit.owner] : null;
      const maxHp = UNIT_TYPES[unit.type].maxHp;
      const canAct = unit.type === 'pirate' ? false : unitCanAct(map, tile, unit, player!);
      unitLineIndex = lines.length;
      unitRow = {
        name: t('hud.selected.unit', { name: UNIT_TYPE_NAMES[unit.type] }),
        pairs: [
          { icon: '16/hp-16.png', value: `${unit.hp}/${maxHp}${canAct ? ' •' : ''}` },
          { icon: '16/attack-16.png', value: String(attackDamage(unit)) },
          { icon: '16/def-16.png', value: String(unit.defense ?? 0) },
          { icon: '16/gold-16.png', value: String(unitMaintenance(unit)) },
        ],
      };
      lines.push(''); // placeholder — the unit line renders as a composite icon row
      bolds.push(true);
      for (const buff of unitDefenseBuffs(map, unit, tile)) {
        lines.push(t(buff.key, { n: buff.amount }));
        bolds.push(false);
      }
      if (unit.type === 'pirate') {
        const friends: string[] = [];
        for (const i of unit.paidBy ?? []) {
          const p = s.players[i];
          const name = p ? TRIBES.find((trib) => trib.id === p.tribe)?.name : undefined;
          if (name) friends.push(name);
        }
        lines.push(
          friends.length > 0
            ? t('hud.selected.pirateDealActive', { tribes: friends.join(', ') })
            : t('hud.selected.pirateDeal'),
        );
        bolds.push(true);
      }
    }

    if (tile.settlement) {
      const settlement = tile.settlement;
      settlementLineIndex = lines.length;
      // The village line carries the income as an icon + value pair, like the
      // unit characteristics row.
      settlementRow = {
        name: t('hud.selected.settlement', { name: settlement.name ?? t('hud.selected.settlementDefault'), level: settlement.level, units: unitsInVillage(map, tile), cap: villageCapacity(settlement.level) }),
        pairs: settlement.owner !== null
          ? [{ icon: 'gold-32', value: String(villageIncome(map, tile)) }]
          : [],
      };
      lines.push('');
      bolds.push(true);
      if (settlement.owner === human.index && isVillageRoadConnected(map, tile)) {
        lines.push(t('hud.selected.connectedBonus', { bonus: VILLAGE_CONNECTION_BONUS }));
        bolds.push(false);
      }
      if (settlement.owner === human.index) {
        const count = buildingsInVillage(map, tile);
        const limit = villageBuildingLimit(settlement.level);
        buildingLimitLineIndex = lines.length;
        lines.push(t('hud.selected.buildings', { count, limit }));
        bolds.push(false);
        // Cost to upgrade to the next village level (your own village only).
        if (settlement.level < 4) {
          const cost = villageUpgradeCost(settlement.level);
          lines.push(t('hud.selected.upgradeCost', { level: settlement.level + 1, wood: cost.wood, stone: cost.stone, money: cost.money }));
          bolds.push(false);
        }
        if (count >= limit && settlement.level < 4) {
          lines.push(t('hud.selected.full', { level: settlement.level + 1 }));
          bolds.push(false);
        }
      }
    }

    if (tile.building) {
      const b = tile.building;
      const owner = tile.ownedBy !== null ? (s.players[tile.ownedBy] ?? null) : null;
      const y = buildingYield(map, tile, owner);
      buildingLineIndex = lines.length;
      // The building line carries its hp and resource yield as icon + value
      // pairs, like the unit characteristics row, so damage and production
      // read at a glance.
      buildingRow = {
        name: b.kind === 'sawmill' || b.kind === 'mine'
          ? BUILDING_NAMES[b.kind]
          : t('hud.selected.building', { name: BUILDING_NAMES[b.kind], level: b.level }),
        pairs: [
          { icon: '16/hp-16.png', value: `${buildingHp(b)}/${BUILDING_MAX_HP}` },
          ...(y.wood > 0 ? [{ icon: 'wood-32', value: `+${y.wood}` }] : []),
          ...(y.stone > 0 ? [{ icon: 'stone-32', value: `+${y.stone}` }] : []),
          ...(y.ore > 0 ? [{ icon: 'ore-32', value: `+${y.ore}` }] : []),
        ],
      };
      lines.push('');
      bolds.push(true);
    }

    if (tile.bonus) {
      lines.push(t('hud.selected.bonus.info'));
      bolds.push(false);
    }

    if (tile.bottle) {
      lines.push(t('hud.selected.bottle'));
      bolds.push(false);
    }

    const actions = this.suggestedSkillActions(tile, human);

    const highlightBuildingsLine = s.tutorial && s.tutorialStep === 'upgradeVillage3';

    let maxW = 0;
    const lineH = 18;
    let y = 8;
    const lineWidths: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const iconRow =
        (i === unitLineIndex && unitRow) ||
        (i === settlementLineIndex && settlementRow) ||
        (i === buildingLineIndex && buildingRow);
      if (iconRow) {
        const row =
          (i === unitLineIndex ? unitRow : i === settlementLineIndex ? settlementRow : buildingRow)!;
        const fill = 0xeeeeee;
        const title = makeLabel(row.name, { fontSize: 13, fill, fontWeight: '700' });
        title.position.set(10, y);
        const r = new Container();
        r.addChild(title);
        let x = 10 + title.width + 7;
        for (const pair of row.pairs) {
          const icon = pair.icon.startsWith('16/')
            ? makeIcon16(icons16FrameForIconPath(pair.icon), 16)
            : makeIcon(pair.icon, 16);
          icon.anchor.set(0, 0);
          icon.position.set(x, y + (lineH - 16) / 2);
          const value = makeLabel(pair.value, { fontSize: 13, fill });
          value.position.set(x + 19, y);
          r.addChild(icon, value);
          x += 19 + value.width + 7;
        }
        this.el.addChild(r);
        const contentW = x - 17;
        lineWidths[i] = contentW;
        maxW = Math.max(maxW, contentW);
        y += lineH;
        continue;
      }
      const highlight = highlightBuildingsLine && i === buildingLimitLineIndex;
      const t = makeLabel(lines[i]!, {
        fontSize: 13,
        fill: highlight ? 0xffd700 : 0xeeeeee,
        fontWeight: highlight || bolds[i]! ? '700' : undefined
      });
      t.position.set(10, y);
      this.el.addChild(t);
      lineWidths[i] = t.width;
      maxW = Math.max(maxW, t.width);
      y += lineH;
    }
    if (actions.length > 0) y += 8;
    for (const a of actions) {
      const disabled = s.aiActive || !canOpenSkill(human, a.id);
      const highlighted = !!s.tutorial && s.tutorialHighlightSkills.includes(a.id);
      const row = new Container();
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.alpha = disabled ? 0.5 : 1;
      row.on('pointertap', () => {
        if (!disabled) gameController.openSkill(a.id);
      });
      const size = 44;
      const med = makeSkillMedallion({
        skill: a.id,
        opened: false,
        priceText: String(skillCost(a.id, human.skills.length)),
        size,
      });
      const cy = y + size / 2;
      med.position.set(10 + size / 2, cy);
      if (highlighted) {
        const halo = new Graphics();
        halo.circle(10 + size / 2, cy, size / 2 + 6).stroke({ width: 4, color: 0xffd700, alpha: 0.95 });
        halo.circle(10 + size / 2, cy, size / 2 + 10).stroke({ width: 2, color: 0xffd700, alpha: 0.5 });
        row.addChildAt(halo, 0);
      }
      const label = makeLabel(a.label, { fontSize: 13, fill: highlighted ? 0xffd700 : 0xeeeeee });
      label.position.set(10 + size + 8, cy - label.height / 2);
      row.addChild(med, label);
      this.el.addChild(row);
      maxW = Math.max(maxW, 10 + size + 8 + label.width);
      y += size + 6;
    }
    // Demolish your own building: same icon as disbanding a unit, 5 money.
    if (tile.building && tile.ownedBy === human.index) {
      const disabled = s.aiActive || human.resources.money < DESTROY_BUILDING_COST;
      const row = new Container();
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.alpha = disabled ? 0.5 : 1;
      row.on('pointertap', () => {
        if (!disabled) gameController.destroySelectedBuilding();
      });
      const size = 44;
      const icon = makeActionButtonIcon(ACTION_BUTTON_ICON_FILES['disband']!, size);
      const cy = y + size / 2;
      icon.position.set(10 + size / 2, cy);
      const label = makeLabel(t('action.destroyBuilding', { money: DESTROY_BUILDING_COST }), { fontSize: 13, fill: 0xeeeeee });
      label.position.set(10 + size + 8, cy - label.height / 2);
      row.addChild(icon, label);
      this.el.addChild(row);
      maxW = Math.max(maxW, 10 + size + 8 + label.width);
      y += size + 6;
      this.measured = y + 8;
    } else if (actions.length > 0) {
      this.measured = y - 6 + 8;
    } else {
      this.measured = y + 8;
    }

    const HELP_SIZE = 16;
    type HelpKind = 'unitHelp' | 'settlementHelp' | 'buildingHelp' | 'buildingLimitHelp' | 'bridgeHelp';
    const helpRows: { index: number; kind: HelpKind }[] = [];
    if (bridgeLineIndex >= 0) helpRows.push({ index: bridgeLineIndex, kind: 'bridgeHelp' });
    if (tile.unit) helpRows.push({ index: unitLineIndex, kind: 'unitHelp' });
    if (tile.settlement) helpRows.push({ index: settlementLineIndex, kind: 'settlementHelp' });
    if (tile.building) helpRows.push({ index: buildingLineIndex, kind: 'buildingHelp' });
    if (buildingLimitLineIndex >= 0) helpRows.push({ index: buildingLimitLineIndex, kind: 'buildingLimitHelp' });

    let contentW = maxW;
    for (const row of helpRows) {
      contentW = Math.max(contentW, lineWidths[row.index]! + 6 + HELP_SIZE);
    }
    // Reserve the panel's top-right corner for the close button.
    const CLOSE_SIZE = 16;
    const CLOSE_GAP = 6;
    const bgW = contentW + 10 + CLOSE_GAP + CLOSE_SIZE + 8;
    // Button-style drop shadow under the info panel.
    const SHADOW_OFFSET = 4;
    const shadow = makePanel(bgW, this.measured, {
      fill: 0x000000,
      alpha: 0.3,
      rightRadiusOnly: true,
    });
    shadow.position.set(SHADOW_OFFSET, SHADOW_OFFSET);
    const bg = makePanel(bgW, this.measured, { fill: THEME.dialogBg, alpha: 1, rightRadiusOnly: true });
    bg.position.set(0, 0);
    this.el.addChildAt(shadow, 0);
    this.el.addChildAt(bg, 1);

    for (const row of helpRows) {
      const btn = new Container();
      const circle = new Graphics();
      circle
        .circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2)
        .fill({ color: 0x000000, alpha: 0.7 });
      const mark = makeIcon16(ICONS16_FILES['help']!, HELP_SIZE);
      mark.position.set(HELP_SIZE / 2, HELP_SIZE / 2);
      btn.addChild(circle, mark);
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      btn.hitArea = new Circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2);
      btn.on('pointertap', () => useGameStore.getState().setOverlay({ kind: row.kind }));
      btn.position.set(10 + lineWidths[row.index]! + 6, 8 + row.index * lineH + (lineH - HELP_SIZE) / 2);
      this.el.addChild(btn);
    }

    const close = new Container();
    const closeCircle = new Graphics();
    closeCircle
      .circle(CLOSE_SIZE / 2, CLOSE_SIZE / 2, CLOSE_SIZE / 2)
      .fill({ color: 0x000000, alpha: 0.7 });
    const mark = new Graphics();
    const markPad = 4;
    mark.moveTo(markPad, markPad).lineTo(CLOSE_SIZE - markPad, CLOSE_SIZE - markPad).stroke({ width: 2, color: 0xeeeeee });
    mark.moveTo(CLOSE_SIZE - markPad, markPad).lineTo(markPad, CLOSE_SIZE - markPad).stroke({ width: 2, color: 0xeeeeee });
    close.addChild(closeCircle, mark);
    close.eventMode = 'static';
    close.cursor = 'pointer';
    close.hitArea = new Circle(CLOSE_SIZE / 2, CLOSE_SIZE / 2, CLOSE_SIZE / 2);
    close.on('pointertap', () => {
      setSelectedInfoClosed(true);
      this.closed = true;
      this.update();
    });
    close.position.set(bgW - 8 - CLOSE_SIZE, 8);
    this.el.addChild(close);

    this.layout();
  }

  private renderCollapsed(): void {
    if (!this.el || !this.host) return;
    const ICON_SIZE = 32;
    this.measured = ICON_SIZE;
    const holder = new Container();
    const icon = makeActionButtonIcon('action-info', ICON_SIZE);
    icon.position.set(ICON_SIZE / 2, ICON_SIZE / 2);
    holder.addChild(icon);
    holder.eventMode = 'static';
    holder.cursor = 'pointer';
    holder.hitArea = new Circle(ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE / 2);
    holder.on('pointertap', () => {
      setSelectedInfoClosed(false);
      this.closed = false;
      this.update();
    });
    this.el.addChild(holder);
  }

  private suggestedSkillActions(tile: MapTile, human: Player): { id: SkillId; label: string }[] {
    const actions: { id: SkillId; label: string }[] = [];
    const map = gameController.getMap();
    const push = (id: SkillId, label: string): void => {
      actions.push({ id, label });
    };

    if (isMountainType(tile.terrain)) {
      if (!hasSkill(human, 'climbing')) push('climbing', t('ui.openclimbing'));
      else if (!hasSkill(human, 'smithery')) push('smithery', t('ui.opensmithery'));
    } else if (isWaterType(tile.terrain)) {
      if (!hasSkill(human, 'water')) push('water', t('ui.openwater'));
      else {
        if (!hasSkill(human, 'waterTemples')) push('waterTemples', t('ui.openwatertemples'));
        if (!hasSkill(human, 'navigation')) push('navigation', t('ui.opennavigation'));
      }
    } else {
      const nearForest = isForestType(tile.terrain) || hexNeighbors(tile).some((n) => {
        const t = map ? tileAt(map, n.q, n.r) : undefined;
        return t !== undefined && isForestType(t.terrain);
      });
      if (nearForest && !hasSkill(human, 'forestry')) {
        push('forestry', t('ui.openforestry'));
      } else if (isForestType(tile.terrain) && hasSkill(human, 'forestry') && !hasSkill(human, 'forestTemple')) {
        push('forestTemple', t('ui.openforesttemples'));
      }
    }

    // Unlock hints for the next building skill whose chain is already open.
    if (map) {
      if (isMountainType(tile.terrain) && hasSkill(human, 'science') && !hasSkill(human, 'geology')) {
        push('geology', t('ui.opengeology'));
      }
      if (isWaterType(tile.terrain) && hasSkill(human, 'riding') && !hasSkill(human, 'bridges') && canBuildBridgeHere(map, tile)) {
        push('bridges', t('ui.openbridges'));
      }
      if (!isWaterType(tile.terrain) && hasSkill(human, 'forestry') && !hasSkill(human, 'roads') && canBuildRoadHere(map, tile, human)) {
        push('roads', t('ui.openroads'));
      }
    }
    if (
      tile.settlement &&
      tile.settlement.owner === human.index &&
      !tile.settlement.wall &&
      hasSkill(human, 'shields') &&
      !hasSkill(human, 'defense')
    ) {
      push('defense', t('ui.opendefense'));
    }
    return actions;
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
