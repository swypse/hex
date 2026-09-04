import { t } from '../../i18n';
import { Circle, Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { isForestType, isMountainType, isWaterType, TILE_TYPE_COLORS, TILE_TYPE_NAMES } from '../../game/tileTypes';
import { UNIT_TYPE_NAMES, UNIT_TYPES, type Unit } from '../../game/units';
import { unitCanAct } from '../../game/unitActions';
import { tileAt } from '../../game/selection';
import { attackDamage } from '../../game/combat';
import { activeBuffs } from '../../game/buffs';
import { isShip } from '../../game/ship';
import { villageCapacity, villageBuildingLimit, buildingsInVillage, unitsInVillage } from '../../game/village';
import { villageIncome } from '../../game/capture';
import { villageUpgradeCost } from '../../game/resources';
import { buildingYield, BUILDING_NAMES } from '../../game/buildings';
import { isExploredFor } from '../../game/explore';
import { hexNeighbors } from '../../game/hex';
import { canOpenSkill, hasSkill, skillCost, type SkillId } from '../../game/skills';
import { canBuildRoadHere } from '../../game/roads';
import { canBuildBridgeHere } from '../../game/bridges';
import type { Player } from '../../game/players';
import type { GameMap, MapTile } from '../../game/mapGen';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { makeSkillMedallion } from '../kit/skillMedallion';
import { makePanel } from '../kit/panel';
import { isLightColor } from '../kit/theme';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from '../layout';

function unitDefenceBuffs(map: GameMap, unit: Unit, tile: MapTile): { key: string; amount: number }[] {
  const out: { key: string; amount: number }[] = [];
  if (unit.owner < 0) return out;
  const buffs = activeBuffs(map, unit.owner);
  if (buffs.includes('waterProtection') && isShip(unit)) out.push({ key: 'hud.buff.waterProtection', amount: 10 });
  if (buffs.includes('forestProtection') && isForestType(tile.terrain)) out.push({ key: 'hud.buff.forestProtection', amount: 10 });
  if (tile.settlement?.wall && tile.settlement.owner === unit.owner) out.push({ key: 'hud.buff.wall', amount: 3 });
  return out;
}

export class HudSelected implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private measured = 0;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
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
    if (!selection || !map) {
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

    const terrainColor = TILE_TYPE_COLORS[tile.terrain];
    const darkText = isLightColor(terrainColor);
    const lines: string[] = [TILE_TYPE_NAMES[tile.terrain]];
    const bolds: boolean[] = [false];
    let unitLineIndex = -1;
    let settlementLineIndex = -1;
    let buildingLineIndex = -1;
    let buildingLimitLineIndex = -1;

    if (tile.unit) {
      const unit = tile.unit;
      const player = unit.owner >= 0 ? s.players[unit.owner] : null;
      const maxHp = UNIT_TYPES[unit.type].maxHp;
      const canAct = unit.type === 'pirate' ? false : unitCanAct(map, tile, unit, player!);
      unitLineIndex = lines.length;
      lines.push(t('hud.selected.unit', { name: UNIT_TYPE_NAMES[unit.type], hp: unit.hp, max: maxHp, active: canAct ? ' •' : '', atk: attackDamage(unit), def: unit.defence ?? 0 }));
      bolds.push(true);
      for (const buff of unitDefenceBuffs(map, unit, tile)) {
        lines.push(t(buff.key, { n: buff.amount }));
        bolds.push(false);
      }
    }

    if (tile.settlement) {
      const settlement = tile.settlement;
      settlementLineIndex = lines.length;
      lines.push(t('hud.selected.settlement', { name: settlement.name ?? t('hud.selected.settlementDefault'), level: settlement.level, units: unitsInVillage(map, tile), cap: villageCapacity(settlement.level) }));
      bolds.push(true);
      if (settlement.owner !== null) {
        lines.push(t('hud.selected.income', { income: villageIncome(map, tile) }));
        bolds.push(false);
      }
      if (settlement.owner === human.index) {
        const count = buildingsInVillage(map, tile);
        const limit = villageBuildingLimit(settlement.level);
        buildingLimitLineIndex = lines.length;
        lines.push(t('hud.selected.buildings', { count, limit }));
        bolds.push(false);
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
      lines.push(t('hud.selected.building', { name: BUILDING_NAMES[b.kind], level: b.level }));
      bolds.push(true);
      if (y.wood > 0 || y.stone > 0 || y.ore > 0) {
        lines.push(t('hud.selected.produces', { wood: y.wood, stone: y.stone, ore: y.ore }));
        bolds.push(false);
      }
    }

    const actions = this.suggestedSkillActions(tile, human);

    const highlightBuildingsLine = s.tutorial && s.tutorialStep === 'upgradeVillage3';

    let maxW = 0;
    const lineH = 18;
    let y = 8;
    const lineWidths: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const highlight = highlightBuildingsLine && i === buildingLimitLineIndex;
      const t = makeLabel(lines[i]!, {
        fontSize: 13,
        fill: highlight ? 0xffd700 : darkText ? 0x111111 : 0xeeeeee,
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
    this.measured = actions.length > 0 ? y - 6 + 8 : y + 8;

    const HELP_SIZE = 14;
    type HelpKind = 'unitHelp' | 'settlementHelp' | 'buildingHelp' | 'buildingLimitHelp';
    const helpRows: { index: number; kind: HelpKind }[] = [];
    if (tile.unit) helpRows.push({ index: unitLineIndex, kind: 'unitHelp' });
    if (tile.settlement) helpRows.push({ index: settlementLineIndex, kind: 'settlementHelp' });
    if (tile.building) helpRows.push({ index: buildingLineIndex, kind: 'buildingHelp' });
    if (buildingLimitLineIndex >= 0) helpRows.push({ index: buildingLimitLineIndex, kind: 'buildingLimitHelp' });

    let contentW = maxW;
    for (const row of helpRows) {
      contentW = Math.max(contentW, lineWidths[row.index]! + 6 + HELP_SIZE);
    }
    const bgW = contentW + 20;
    const bg = makePanel(bgW, this.measured, { fill: terrainColor, alpha: 1, rightRadiusOnly: true });
    bg.position.set(0, 0);
    this.el.addChildAt(bg, 0);

    for (const row of helpRows) {
      const btn = new Container();
      const circle = new Graphics();
      circle
        .circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2)
        .fill({ color: 0x000000, alpha: 0.7 });
      const mark = makeLabel('?', { fontSize: 11, fill: 0xffffff, fontWeight: '800' });
      mark.anchor.set(0.5, 0.5);
      mark.position.set(HELP_SIZE / 2, HELP_SIZE / 2);
      btn.addChild(circle, mark);
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      btn.hitArea = new Circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2);
      btn.on('pointertap', () => useGameStore.getState().setOverlay({ kind: row.kind }));
      btn.position.set(10 + lineWidths[row.index]! + 6, 8 + row.index * lineH + (lineH - HELP_SIZE) / 2);
      this.el.addChild(btn);
    }

    this.layout();
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
