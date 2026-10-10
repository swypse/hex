import { t } from '../../i18n';
import { Circle, Container, Graphics, Rectangle } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { TRIBES } from '../../game/tribes';
import { isForestType, isMountainType, isWaterType } from '../../game/map/tile-types';
import { UNIT_TYPE_NAMES, unitFoodEaten, unitMaintenance, type Unit } from '../../game/units/units';
import { attackDamage } from '../../game/units/combat';
import { berserkerRage } from '../../game/units/abilities';
import { activeBuffs, VILLAGE_DEFENSE } from '../../game/units/buffs';
import { isShip } from '../../game/units/ship';
import { villageCapacity, villageBuildingLimit, buildingKindsInVillage, unitsInVillage } from '../../game/economy/village';
import { tileUpkeep, villageIncomeBreakdown } from '../../game/economy/capture';
import { farmYield, GRANARY_CAPACITY, STARVATION_DAMAGE, villageFood, villageGranaries } from '../../game/economy/food';
import { villageUpgradeCost } from '../../game/economy/resources';
import { buildingYield, buildingHp, canPlaceFoodBuilding, BUILDING_NAMES, DESTROY_BUILDING_COST } from '../../game/economy/buildings';
import { TRAP_TURNS } from '../../game/units/traps';
import { isExploredFor } from '../../game/map/explore';
import { hexNeighbors } from '../../game/map/hex';
import { canOpenSkill, hasSkill, skillCost } from '../../game/skills';
import { canBuildRoadHere } from '../../game/economy/roads';
import { canBuildBridgeHere, hasBridge } from '../../game/economy/bridges';
import type { Player } from '../../game/players';
import type { GameMap, MapTile } from '../../game/map/map-gen';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../../gfx/label';
import { makeIcon } from '../kit/icon';
import { makeSkillIcon, SKILL_ICON_FILES } from '../../gfx/skill-icons';
import { makePanel } from '../kit/panel';
import { THEME } from '../../gfx/theme';
import { makeActionButtonIcon } from '../../gfx/action-button-icons';
import { ACTION_BUTTON_ICON_FILES } from '../../gfx/action-button-icons';
import { selectedInfoClosed, setSelectedInfoClosed } from '../../storage/settings';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from './layout';
import { BuffId, BuildingKind, FontSize, OverlayKind, SkillId, TutorialStepId, UnitType } from '@enums';
import { earthquakeProtected, stormProtected, weatherEffectsAt, WEATHER_RULES } from '../../game/weather/weather';
import { tileAt } from '../../game/map/tile-index';

/** Overlay kinds that open a help dialog from a row of the selection panel. */
type HelpKind =
  | OverlayKind.UNIT_HELP
  | OverlayKind.SETTLEMENT_HELP
  | OverlayKind.BUILDING_HELP
  | OverlayKind.BUILDING_LIMIT_HELP
  | OverlayKind.BRIDGE_HELP;

function unitDefenseBuffs(map: GameMap, unit: Unit, tile: MapTile): { key: string; amount: number }[] {
  const out: { key: string; amount: number }[] = [];
  if (unit.owner < 0) return out;
  const buffs = activeBuffs(map, unit.owner);
  if (buffs.includes(BuffId.WATER_PROTECTION) && isShip(unit)) out.push({ key: 'hud.buff.waterProtection', amount: 10 });
  if (buffs.includes(BuffId.FOREST_PROTECTION) && isForestType(tile.terrain)) out.push({ key: 'hud.buff.forestProtection', amount: 10 });
  if (tile.settlement && tile.settlement.owner === unit.owner) out.push({ key: 'hud.buff.village', amount: VILLAGE_DEFENSE });
  if (tile.settlement?.wall && tile.settlement.owner === unit.owner) out.push({ key: 'hud.buff.wall', amount: 3 });
  return out;
}

/** A composite title + icon/value pairs row; `hp` adds green hp squares. */
interface IconRow {
  /** Built buildings, one circle per kind with the kind's count (shown as xN when above 1). */
  slots?: { kind: BuildingKind; count: number }[];
  /** Free slots, shown as one empty circle that says how many more there are (+N). */
  freeSlots?: number;
  /** Draw the values in gold (tutorial emphasis). */
  highlight?: boolean;
  name: string;
  pairs: { icon: string; value: string }[];
  hp?: number;
}

const HP_SQUARE = 6;
const HP_SQUARE_GAP = 3;
/** Diameter of a building-slot circle and the gap between circles. */
const SLOT_SIZE = 36;
const SLOT_GAP = 3;
const HP_SQUARE_COLOR = 0x49cc5d;

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

    const lines: string[] = [];
    const bolds: boolean[] = [];
    // Lines drawn in red (starvation warnings).
    const redLines = new Set<number>();
    let unitLineIndex = -1;
    let settlementLineIndex = -1;
    let buildingLineIndex = -1;
    /** Plain icon rows without a title (the village income line), by line index. */
    const extraRows = new Map<number, IconRow>();
    const highlightBuildingsLine = s.tutorial && s.tutorialStep === TutorialStepId.UPGRADE_VILLAGE3;
    let buildingLimitLineIndex = -1;
    let bridgeLineIndex = -1;
    let unitRow: IconRow | null = null;
    let settlementRow: IconRow | null = null;
    let buildingRow: IconRow | null = null;

    if (hasBridge(tile)) {
      bridgeLineIndex = lines.length;
      lines.push(t('hud.selected.bridge'));
      bolds.push(true);
    }

    if (tile.unit) {
      const unit = tile.unit;
      const rageBonus = berserkerRage(unit);
      unitLineIndex = lines.length;
      // Status tags that used to ride on the hp text (stunned / stealth / "can
      // act now") move onto the unit name; the hp itself no longer shows here.
      const statusBits: string[] = [];
      if ((unit.stunTurns ?? 0) >= 1) statusBits.push(t('hud.selected.stunned'));
      if (unit.isStealthed) statusBits.push(t('hud.selected.stealth'));
      const defenseBuffs = unitDefenseBuffs(map, unit, tile);
      const bonusDefense = defenseBuffs.reduce((sum, b) => sum + b.amount, 0);
      unitRow = {
        name:
          t('hud.selected.unit', { name: UNIT_TYPE_NAMES[unit.type] }) +
          (statusBits.length > 0 ? ` (${statusBits.join(' ')})` : ''),
        pairs: [
          // A veteran carries a star with its kill count.
          ...(unit.veteran ? [{ icon: 'star-32', value: String(unit.kills ?? 0) }] : []),
          { icon: 'attack-32', value: rageBonus > 0 ? `${attackDamage(unit)} +${rageBonus}` : String(attackDamage(unit)) },
          { icon: 'def-32', value: bonusDefense > 0 ? `${unit.defense ?? 0} + ${bonusDefense}` : String(unit.defense ?? 0) },
          { icon: 'gold-32', value: String(unitMaintenance(unit)) },
          ...(unitFoodEaten(unit) > 0 ? [{ icon: 'food-32', value: `-${unitFoodEaten(unit)}` }] : []),
        ],
      };
      lines.push(''); // placeholder — the unit line renders as a composite icon row
      bolds.push(true);
      // The unit's own kill count, right below its characteristics.
      if (unit.owner >= 0) {
        lines.push(t('hud.selected.kills', { n: unit.kills ?? 0 }));
        bolds.push(false);
      }
      for (const buff of defenseBuffs) {
        extraRows.set(lines.length, { name: '', pairs: [{ icon: 'def-32', value: t(buff.key, { n: buff.amount }) }] });
        lines.push('');
        bolds.push(false);
      }
      if (unit.type === UnitType.PIRATE) {
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
        name: t('hud.selected.settlement', { name: settlement.name ?? t('hud.selected.settlementDefault'), level: settlement.level }),
        pairs: [{ icon: 'unit-32', value: `${unitsInVillage(map, tile)}/${villageCapacity(settlement.level)}` }],
      };
      lines.push('');
      bolds.push(true);
      if (settlement.owner !== null) {
        const income = villageIncomeBreakdown(map, tile);
        // Result first, then the gross income (connection bonus included) less the upkeep actually charged,
        // so the bracket always adds up to the result.
        const value = settlement.owner === human.index ? `${income.total} (${income.gross} - ${income.deducted})` : String(income.total);
        const pairs = [{ icon: 'gold-32', value }];
        if (settlement.owner === human.index) {
          const food = villageFood(map, tile, human);
          pairs.push({ icon: 'food-32', value: `${food.balance} (${food.production} - ${food.upkeep})` });
        }
        extraRows.set(lines.length, { name: '', pairs });
        lines.push('');
        bolds.push(false);
      }
      if (settlement.owner === human.index) {
        if (villageGranaries(map, tile).length > 0) {
          lines.push(t('hud.selected.villageGranary', { food: villageFood(map, tile, human).granaryFood, cap: villageGranaries(map, tile).length * GRANARY_CAPACITY }));
          bolds.push(false);
        }
      }
      if (settlement.owner !== null && settlement.starving) {
        redLines.add(lines.length);
        lines.push(t('hud.selected.starving', { damage: STARVATION_DAMAGE }));
        bolds.push(true);
      }
      if (settlement.owner === human.index) {
        const limit = villageBuildingLimit(settlement.level);
        buildingLimitLineIndex = lines.length;
        const built = buildingKindsInVillage(map, tile);
        const grouped = new Map<BuildingKind, number>();
        for (const kind of built) grouped.set(kind, (grouped.get(kind) ?? 0) + 1);
        const slots = [...grouped].map(([kind, count]) => ({ kind, count }));
        extraRows.set(lines.length, { name: '', pairs: [], slots, freeSlots: Math.max(0, limit - built.length), highlight: highlightBuildingsLine });
        lines.push('');
        bolds.push(false);
        // Cost to upgrade to the next village level (your own village only).
        if (settlement.level < 4) {
          const cost = villageUpgradeCost(settlement.level);
          lines.push(t('hud.selected.upgradeCost', { level: settlement.level + 1, wood: cost.wood, stone: cost.stone, money: cost.money }));
          bolds.push(false);
        }
        if (built.length >= limit && settlement.level < 4) {
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
        name: b.kind === BuildingKind.SAWMILL || b.kind === BuildingKind.MINE || b.kind === BuildingKind.FARM || b.kind === BuildingKind.GRANARY || b.kind === BuildingKind.UNIVERSITY
          ? BUILDING_NAMES[b.kind]
          : t('hud.selected.building', { name: BUILDING_NAMES[b.kind], level: b.level }),
        hp: buildingHp(b),
        pairs: [
          ...(y.wood > 0 ? [{ icon: 'wood-32', value: String(y.wood) }] : []),
          ...(y.stone > 0 ? [{ icon: 'stone-32', value: String(y.stone) }] : []),
          ...(y.ore > 0 ? [{ icon: 'ore-32', value: String(y.ore) }] : []),
          ...(b.kind === BuildingKind.FARM ? [{ icon: 'food-32', value: String(farmYield(owner, gameController.getMap() ?? undefined, tile)) }] : []),
          ...(b.kind === BuildingKind.GRANARY ? [{ icon: 'food-32', value: String(b.food ?? 0) }] : []),
        ],
      };
      lines.push('');
      bolds.push(true);
      if (b.kind === BuildingKind.GRANARY) {
        lines.push(t('hud.selected.granaryFood', { food: b.food ?? 0, cap: GRANARY_CAPACITY }));
        bolds.push(false);
      }
    }

    if (tileUpkeep(tile) > 0) {
      lines.push(t('hud.selected.upkeep', { n: tileUpkeep(tile) }));
      bolds.push(false);
    }

    if (tile.bonus) {
      lines.push(t('hud.selected.bonus.info'));
      bolds.push(false);
    }

    if (tile.bottle) {
      lines.push(t('hud.selected.bottle'));
      bolds.push(false);
    }

    if (tile.fire) {
      lines.push(t('hud.selected.burning'));
      bolds.push(false);
    }

    // What the active weather does to this tile, if anything.
    const weatherMap = gameController.getMap();
    for (const event of weatherMap ? weatherEffectsAt(weatherMap, tile) : []) {
      lines.push(t(`weather.effect.${event.type}` as never, {
        damage: WEATHER_RULES.storm.shipDamage,
        factor: WEATHER_RULES.storm.moveCostFactor,
        portDamage: WEATHER_RULES.storm.portDamage,
        portEvery: WEATHER_RULES.storm.portEvery,
      }));
      bolds.push(false);
    }

    // Temple protection from weather for own buildings and units here.
    if (weatherMap) {
      const mine = (tile.building && tile.ownedBy === human.index) || tile.unit?.owner === human.index;
      if (mine && earthquakeProtected(weatherMap, tile, human.index)) {
        lines.push(t('hud.selected.quakeProtected'));
        bolds.push(false);
      }
      if (mine && isWaterType(tile.terrain) && stormProtected(weatherMap, tile, human.index)) {
        lines.push(t('hud.selected.stormProtected'));
        bolds.push(false);
      }
    }

    if (tile.trap && tile.trap.owner === human.index) {
      const turnsLeft = Math.max(0, TRAP_TURNS - (s.turn - tile.trap.placedTurn));
      lines.push(t('hud.selected.trap', { turns: turnsLeft }));
      bolds.push(false);
    }

    const actions = this.suggestedSkillActions(tile, human);

    // Nothing to show (no unit, village, building, note or helper action): hide
    // the panel entirely, collapsed icon included.
    if (lines.length === 0 && actions.length === 0) {
      this.el.visible = false;
      return;
    }
    if (this.closed) {
      this.renderCollapsed();
      this.layout();
      return;
    }

    let maxW = 0;
    const lineH = 18;
    const lineGap = 4;
    // The info panel is capped at 80% of the screen width; any line that would
    // exceed the panel's inner width is word-wrapped to fit.
    const capW = Math.floor((this.host?.app?.screen?.width ?? 0) * 0.8);
    const innerW = Math.max(120, capW - 22);
    let y = 8;
    const lineWidths: number[] = [];
    const rowY: number[] = [];
    const rowH: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      rowY[i] = y;
      const iconRow =
        (i === unitLineIndex && unitRow) ||
        (i === settlementLineIndex && settlementRow) ||
        (i === buildingLineIndex && buildingRow) ||
        extraRows.get(i);
      if (iconRow) {
        const row =
          extraRows.get(i) ?? (i === unitLineIndex ? unitRow : i === settlementLineIndex ? settlementRow : buildingRow)!;
        const fill = row.highlight ? 0xffd700 : 0xeeeeee;
        const title = makeLabel(row.name, { fontSize: FontSize.VERY_SMALL, fill, fontWeight: '700', wordWrap: true, wordWrapWidth: innerW });
        title.position.set(10, y);
        const r = new Container();
        r.addChild(title);
        let x = 10 + (row.name ? title.width + 7 : 0);
        // Remaining building hp: one green square per hp point.
        const hpPoints = row.hp ?? 0;
        if (hpPoints > 0) {
          const squares = new Graphics();
          for (let n = 0; n < hpPoints; n++) {
            squares.rect(x + n * (HP_SQUARE + HP_SQUARE_GAP), y + (lineH - HP_SQUARE) / 2, HP_SQUARE, HP_SQUARE).fill(HP_SQUARE_COLOR);
          }
          r.addChild(squares);
          x += hpPoints * HP_SQUARE + (hpPoints - 1) * HP_SQUARE_GAP + 7;
        }
        if (row.slots) {
          const drawSlot = (kind: BuildingKind | null, count: number): void => {
            const cx = x + SLOT_SIZE / 2;
            const cy = y + SLOT_SIZE / 2;
            const circle = new Graphics();
            circle.circle(cx, cy, SLOT_SIZE / 2 - 1).fill({ color: 0x000000, alpha: kind ? 0.45 : 0.2 }).stroke({ width: 2, color: row.highlight ? 0xffd700 : 0x8a8a9a, alpha: kind ? 1 : 0.6 });
            r.addChild(circle);
            if (kind) {
              const icon = makeActionButtonIcon(kind, SLOT_SIZE - 8);
              icon.position.set(cx, cy);
              r.addChild(icon);
            } else if (count > 0) {
              // The collapsed free-slot circle says how many more there are.
              const more = makeLabel(`+${count}`, { fontSize: FontSize.VERY_SMALL, fill: 0xcccccc });
              more.anchor.set(0.5, 0.5);
              more.position.set(cx, cy);
              r.addChild(more);
            }
            if (kind && count > 1) {
              // Count badge pinned to the circle's top-right edge, like the skill medallion price.
              const label = makeLabel(String(count), { fontSize: FontSize.VERY_SMALL, fill: THEME.white });
              label.anchor.set(0.5, 0.5);
              const bx = cx + Math.round((SLOT_SIZE / 2) * 0.78);
              const by = cy - Math.round((SLOT_SIZE / 2) * 0.78);
              label.position.set(bx, by);
              const badge = new Graphics();
              badge.circle(bx, by, Math.max(7, Math.ceil(Math.max(label.width, label.height) / 2) + 2)).fill(THEME.skillTree.closedSkillStroke);
              r.addChild(badge, label);
            }
            // Leave room for the badge overhanging the circle's right edge.
            x += SLOT_SIZE + (kind && count > 1 ? 5 : 0);
            x += SLOT_GAP;
          };
          for (const slot of row.slots) drawSlot(slot.kind, slot.count);
          if ((row.freeSlots ?? 0) > 0) drawSlot(null, row.freeSlots! - 1);
        }
        for (const pair of row.pairs) {
          const icon = makeIcon(pair.icon, 16);
          icon.anchor.set(0, 0);
          icon.position.set(x, y + (lineH - 16) / 2);
          const value = makeLabel(pair.value, { fontSize: FontSize.VERY_SMALL, fill });
          value.position.set(x + 19, y);
          r.addChild(icon, value);
          x += 19 + value.width + 7;
        }
        this.el.addChild(r);
        const contentW = row.slots ? x - SLOT_GAP - 10 : x - 17;
        lineWidths[i] = contentW;
        maxW = Math.max(maxW, contentW);
        rowH[i] = Math.max(row.slots ? SLOT_SIZE : lineH, title.height);
        y += rowH[i]! + lineGap;
        continue;
      }
      const t = makeLabel(lines[i]!, {
        fontSize: FontSize.VERY_SMALL,
        fill: redLines.has(i) ? 0xff4d4d : 0xeeeeee,
        fontWeight: bolds[i]! ? '700' : undefined,
        wordWrap: true,
        wordWrapWidth: innerW,
      });
      t.position.set(10, y);
      this.el.addChild(t);
      lineWidths[i] = t.width;
      maxW = Math.max(maxW, t.width);
      rowH[i] = Math.max(lineH, t.height);
      y += rowH[i]! + lineGap;
    }
    if (actions.length > 0) y += 8;
    // Action rows get a full-width hit area once the panel width is known, so a
    // tap beside the icon or text still hits the row instead of the map below.
    const actionRows: { row: Container; top: number; h: number }[] = [];
    for (const a of actions) {
      const disabled = s.aiActive || !canOpenSkill(human, a.id, map);
      const highlighted = !!s.tutorial && s.tutorialHighlightSkills.includes(a.id);
      const row = new Container();
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.alpha = disabled ? 0.5 : 1;
      row.on('pointertap', () => {
        if (!disabled) gameController.actions.openSkill(a.id);
      });
      // Just the skill texture (no background or border), then the label
      // "Open <Skill>" followed by the money icon and the price.
      const size = 40;
      const iconKey = SKILL_ICON_FILES[a.id];
      const cy = y + size / 2;
      const halo = new Graphics();
      if (highlighted) {
        halo.circle(10 + size / 2, cy, size / 2 + 6).stroke({ width: 4, color: 0xffd700, alpha: 0.95 });
        halo.circle(10 + size / 2, cy, size / 2 + 10).stroke({ width: 2, color: 0xffd700, alpha: 0.5 });
        row.addChild(halo);
      }
      if (iconKey) {
        const skillIcon = makeSkillIcon(iconKey, size);
        skillIcon.position.set(10 + size / 2, cy);
        row.addChild(skillIcon);
      }
      const fill = highlighted ? 0xffd700 : 0xeeeeee;
      const label = makeLabel(a.label, { fontSize: FontSize.VERY_SMALL, fill });
      label.position.set(10 + size + 8, cy - label.height / 2);
      const coin = makeIcon('gold-32', 16);
      coin.anchor.set(0, 0.5);
      coin.position.set(label.x + label.width + 6, cy);
      const price = makeLabel(String(skillCost(a.id, human.skills.length)), { fontSize: FontSize.VERY_SMALL, fill });
      price.position.set(coin.x + 19, cy - price.height / 2);
      row.addChild(label, coin, price);
      this.el.addChild(row);
      actionRows.push({ row, top: y, h: size + 6 });
      maxW = Math.max(maxW, price.x + price.width);
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
        if (!disabled) gameController.actions.destroySelectedBuilding();
      });
      const size = 44;
      const icon = makeActionButtonIcon(ACTION_BUTTON_ICON_FILES['disband']!, size);
      const cy = y + size / 2;
      icon.position.set(10 + size / 2, cy);
      const label = makeLabel(t('action.destroyBuilding', { money: DESTROY_BUILDING_COST }), { fontSize: FontSize.VERY_SMALL, fill: 0xeeeeee });
      label.position.set(10 + size + 8, cy - label.height / 2);
      row.addChild(icon, label);
      this.el.addChild(row);
      actionRows.push({ row, top: y, h: size + 6 });
      maxW = Math.max(maxW, 10 + size + 8 + label.width);
      y += size + 6;
      this.measured = y + 8;
    } else if (actions.length > 0) {
      this.measured = y - 6 + 8;
    } else {
      this.measured = y + 8;
    }

    const HELP_SIZE = 16;

    const helpRows: { index: number; kind: HelpKind }[] = [];
    if (bridgeLineIndex >= 0) helpRows.push({ index: bridgeLineIndex, kind: OverlayKind.BRIDGE_HELP });
    if (tile.unit) helpRows.push({ index: unitLineIndex, kind: OverlayKind.UNIT_HELP });
    if (tile.settlement) helpRows.push({ index: settlementLineIndex, kind: OverlayKind.SETTLEMENT_HELP });
    if (tile.building) helpRows.push({ index: buildingLineIndex, kind: OverlayKind.BUILDING_HELP });
    if (buildingLimitLineIndex >= 0) helpRows.push({ index: buildingLimitLineIndex, kind: OverlayKind.BUILDING_LIMIT_HELP });

    let contentW = maxW;
    for (const row of helpRows) {
      contentW = Math.max(contentW, lineWidths[row.index]! + 6 + HELP_SIZE);
    }
    // Reserve the panel's top-right corner for the close button.
    const CLOSE_SIZE = 16;
    const CLOSE_GAP = 6;
    const bgW = Math.min(contentW + 10 + CLOSE_GAP + CLOSE_SIZE + 8, capW);
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
    for (const { row, top, h } of actionRows) row.hitArea = new Rectangle(0, top, bgW, h);

    for (const row of helpRows) {
      const btn = new Container();
      const circle = new Graphics();
      circle
        .circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2)
        .fill({ color: 0x000000, alpha: 0.7 });
      const mark = makeIcon('help-32', HELP_SIZE);
      mark.position.set(HELP_SIZE / 2, HELP_SIZE / 2);
      btn.addChild(circle, mark);
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      btn.hitArea = new Circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2);
      btn.on('pointertap', () => useGameStore.getState().setOverlay({ kind: row.kind }));
      btn.position.set(10 + lineWidths[row.index]! + 6, (rowY[row.index] ?? 8) + ((rowH[row.index] ?? lineH) - HELP_SIZE) / 2);
      this.el.addChild(btn);
    }

    // The close button is just the close-32 icon, no background.
    const close = new Container();
    const closeIcon = makeIcon('close-32', CLOSE_SIZE);
    closeIcon.anchor.set(0, 0);
    close.addChild(closeIcon);
    close.eventMode = 'static';
    close.cursor = 'pointer';
    close.hitArea = new Rectangle(0, 0, CLOSE_SIZE, CLOSE_SIZE);
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
      if (!hasSkill(human, SkillId.CLIMBING)) push(SkillId.CLIMBING, t('ui.openclimbing'));
      else if (!hasSkill(human, SkillId.SMITHERY)) push(SkillId.SMITHERY, t('ui.opensmithery'));
    } else if (isWaterType(tile.terrain)) {
      if (!hasSkill(human, SkillId.WATER)) push(SkillId.WATER, t('ui.openwater'));
      else {
        if (!hasSkill(human, SkillId.WATER_TEMPLES)) push(SkillId.WATER_TEMPLES, t('ui.openwatertemples'));
        if (!hasSkill(human, SkillId.NAVIGATION)) push(SkillId.NAVIGATION, t('ui.opennavigation'));
      }
    } else {
      const nearForest = isForestType(tile.terrain) || hexNeighbors(tile).some((n) => {
        const t = map ? tileAt(map, n.q, n.r) : undefined;
        return t !== undefined && isForestType(t.terrain);
      });
      if (nearForest && !hasSkill(human, SkillId.FORESTRY)) {
        push(SkillId.FORESTRY, t('ui.openforestry'));
      } else if (isForestType(tile.terrain) && hasSkill(human, SkillId.FORESTRY) && !hasSkill(human, SkillId.FOREST_TEMPLE)) {
        push(SkillId.FOREST_TEMPLE, t('ui.openforesttemples'));
      }
    }

    // Unlock hints for the next building skill whose chain is already open.
    if (map) {
      if (isMountainType(tile.terrain) && hasSkill(human, SkillId.SCIENCE) && !hasSkill(human, SkillId.GEOLOGY)) {
        push(SkillId.GEOLOGY, t('ui.opengeology'));
      }
      if (isWaterType(tile.terrain) && hasSkill(human, SkillId.RIDING) && !hasSkill(human, SkillId.BRIDGES) && canBuildBridgeHere(map, tile)) {
        push(SkillId.BRIDGES, t('ui.openbridges'));
      }
      if (!isWaterType(tile.terrain) && hasSkill(human, SkillId.FORESTRY) && !hasSkill(human, SkillId.ROADS) && canBuildRoadHere(map, tile, human)) {
        push(SkillId.ROADS, t('ui.openroads'));
      }
    }
    // Food buildings: hint at Agriculture on any own empty land tile, and at
    // Granary next to one of your farms.
    if (map && canPlaceFoodBuilding(tile, human)) {
      if (!hasSkill(human, SkillId.AGRICULTURE)) push(SkillId.AGRICULTURE, t('ui.openagriculture'));
      else if (
        !hasSkill(human, SkillId.GRANARY) &&
        hexNeighbors(tile).some((n) => {
          const nt = tileAt(map, n.q, n.r);
          return nt !== undefined && nt.building?.kind === BuildingKind.FARM && nt.ownedBy === human.index;
        })
      ) {
        push(SkillId.GRANARY, t('ui.opengranary'));
      }
    }
    if (
      tile.settlement &&
      tile.settlement.owner === human.index &&
      !tile.settlement.wall &&
      hasSkill(human, SkillId.SHIELDS) &&
      !hasSkill(human, SkillId.DEFENSE)
    ) {
      push(SkillId.DEFENSE, t('ui.opendefense'));
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
