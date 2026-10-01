import { t } from '../../i18n';
import { Circle, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { TRIBES } from '../../game/tribes';
import { isForestType, isMountainType, isWaterType, TILE_TYPE_NAMES } from '../../game/tile-types';
import { UNIT_TYPE_NAMES, unitFoodEaten, unitMaintenance, type Unit } from '../../game/units';
import { unitCanAct } from '../../game/unit-actions';
import { tileAt } from '../../game/selection';
import { attackDamage } from '../../game/combat';
import { berserkerRage } from '../../game/abilities';
import { activeBuffs, VILLAGE_DEFENSE } from '../../game/buffs';
import { isShip } from '../../game/ship';
import { villageCapacity, villageBuildingLimit, buildingsInVillage, unitsInVillage } from '../../game/village';
import { villageIncome, VILLAGE_CONNECTION_BONUS } from '../../game/capture';
import { farmYield, GRANARY_CAPACITY, STARVATION_DAMAGE, villageFood, villageGranaries } from '../../game/food';
import { villageUpgradeCost } from '../../game/resources';
import { buildingYield, buildingHp, canPlaceFoodBuilding, BUILDING_MAX_HP, BUILDING_NAMES, DESTROY_BUILDING_COST } from '../../game/buildings';
import { TRAP_TURNS } from '../../game/traps';
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
import { makeSkillIcon, SKILL_ICON_FILES } from '../kit/skill-icons';
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

/** A composite title + icon/value pairs row; `hp` adds green hp squares. */
interface IconRow {
  name: string;
  pairs: { icon: string; value: string }[];
  hp?: number;
}

const HP_SQUARE = 8;
const HP_SQUARE_GAP = 3;
const HP_SQUARE_COLOR = 0x49cc5d;

/** Plain `N` for income values; negative values keep their `-N`. */
function signed(n: number): string {
  return String(n);
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
    // Lines drawn in red (starvation warnings).
    const redLines = new Set<number>();
    let unitLineIndex = -1;
    let settlementLineIndex = -1;
    let buildingLineIndex = -1;
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
      const player = unit.owner >= 0 ? s.players[unit.owner] : null;
      const canAct = unit.type === 'pirate' ? false : unitCanAct(map, tile, unit, player!);
      const rageBonus = berserkerRage(unit);
      unitLineIndex = lines.length;
      // Status tags that used to ride on the hp text (stunned / stealth / "can
      // act now") move onto the unit name; the hp itself no longer shows here.
      const statusBits: string[] = [];
      if ((unit.stunTurns ?? 0) >= 1) statusBits.push(t('hud.selected.stunned'));
      if (unit.isStealthed) statusBits.push(t('hud.selected.stealth'));
      unitRow = {
        name:
          t('hud.selected.unit', { name: UNIT_TYPE_NAMES[unit.type] }) +
          (statusBits.length > 0 ? ` (${statusBits.join(' ')})` : ''),
        pairs: [
          { icon: 'attack-32', value: rageBonus > 0 ? `${attackDamage(unit)} +${rageBonus}` : String(attackDamage(unit)) },
          { icon: 'def-32', value: String(unit.defense ?? 0) },
          { icon: 'gold-32', value: String(unitMaintenance(unit)) },
          ...(unitFoodEaten(unit) > 0 ? [{ icon: 'food-32', value: `-${unitFoodEaten(unit)}` }] : []),
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
          ? [
              { icon: 'gold-32', value: String(villageIncome(map, tile)) },
              ...(settlement.owner === human.index
                ? [{ icon: 'food-32', value: signed(villageFood(map, tile, human).balance) }]
                : []),
            ]
          : [],
      };
      lines.push('');
      bolds.push(true);
      if (settlement.owner === human.index && isVillageRoadConnected(map, tile)) {
        lines.push(t('hud.selected.connectedBonus', { bonus: VILLAGE_CONNECTION_BONUS }));
        bolds.push(false);
      }
      if (settlement.owner === human.index) {
        const food = villageFood(map, tile, human);
        lines.push(
          t(food.networkSize > 1 ? 'hud.selected.foodNetwork' : 'hud.selected.foodBalance', {
            production: food.production,
            upkeep: food.upkeep,
            balance: signed(food.balance),
            n: food.networkSize,
          }),
        );
        bolds.push(false);
        if (villageGranaries(map, tile).length > 0) {
          lines.push(t('hud.selected.villageGranary', { food: food.granaryFood, cap: villageGranaries(map, tile).length * GRANARY_CAPACITY }));
          bolds.push(false);
        }
      }
      if (settlement.owner !== null && settlement.starving) {
        redLines.add(lines.length);
        lines.push(t('hud.selected.starving', { damage: STARVATION_DAMAGE }));
        bolds.push(true);
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
        name: b.kind === 'sawmill' || b.kind === 'mine' || b.kind === 'farm' || b.kind === 'granary'
          ? BUILDING_NAMES[b.kind]
          : t('hud.selected.building', { name: BUILDING_NAMES[b.kind], level: b.level }),
        hp: buildingHp(b),
        pairs: [
          ...(y.wood > 0 ? [{ icon: 'wood-32', value: String(y.wood) }] : []),
          ...(y.stone > 0 ? [{ icon: 'stone-32', value: String(y.stone) }] : []),
          ...(y.ore > 0 ? [{ icon: 'ore-32', value: String(y.ore) }] : []),
          ...(b.kind === 'farm' ? [{ icon: 'food-32', value: String(farmYield(owner)) }] : []),
          ...(b.kind === 'granary' ? [{ icon: 'food-32', value: String(b.food ?? 0) }] : []),
        ],
      };
      lines.push('');
      bolds.push(true);
      if (b.kind === 'granary') {
        lines.push(t('hud.selected.granaryFood', { food: b.food ?? 0, cap: GRANARY_CAPACITY }));
        bolds.push(false);
      }
    }

    if (tile.bonus) {
      lines.push(t('hud.selected.bonus.info'));
      bolds.push(false);
    }

    if (tile.bottle) {
      lines.push(t('hud.selected.bottle'));
      bolds.push(false);
    }

    if (tile.trap && tile.trap.owner === human.index) {
      const turnsLeft = Math.max(0, TRAP_TURNS - (s.turn - tile.trap.placedTurn));
      lines.push(t('hud.selected.trap', { turns: turnsLeft }));
      bolds.push(false);
    }

    const actions = this.suggestedSkillActions(tile, human);

    const highlightBuildingsLine = s.tutorial && s.tutorialStep === 'upgradeVillage3';

    let maxW = 0;
    const lineH = 18;
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
        (i === buildingLineIndex && buildingRow);
      if (iconRow) {
        const row =
          (i === unitLineIndex ? unitRow : i === settlementLineIndex ? settlementRow : buildingRow)!;
        const fill = 0xeeeeee;
        const title = makeLabel(row.name, { fontSize: 13, fill, fontWeight: '700', wordWrap: true, wordWrapWidth: innerW });
        title.position.set(10, y);
        const r = new Container();
        r.addChild(title);
        let x = 10 + title.width + 7;
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
        for (const pair of row.pairs) {
          const icon = makeIcon(pair.icon, 16);
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
        rowH[i] = Math.max(lineH, title.height);
        y += rowH[i]!;
        continue;
      }
      const highlight = highlightBuildingsLine && i === buildingLimitLineIndex;
      const t = makeLabel(lines[i]!, {
        fontSize: 13,
        fill: highlight ? 0xffd700 : redLines.has(i) ? 0xff4d4d : 0xeeeeee,
        fontWeight: highlight || bolds[i]! ? '700' : undefined,
        wordWrap: true,
        wordWrapWidth: innerW,
      });
      t.position.set(10, y);
      this.el.addChild(t);
      lineWidths[i] = t.width;
      maxW = Math.max(maxW, t.width);
      rowH[i] = Math.max(lineH, t.height);
      y += rowH[i]!;
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
      const label = makeLabel(a.label, { fontSize: 13, fill });
      label.position.set(10 + size + 8, cy - label.height / 2);
      const coin = makeIcon('gold-32', 16);
      coin.anchor.set(0, 0.5);
      coin.position.set(label.x + label.width + 6, cy);
      const price = makeLabel(String(skillCost(a.id, human.skills.length)), { fontSize: 13, fill });
      price.position.set(coin.x + 19, cy - price.height / 2);
      row.addChild(label, coin, price);
      this.el.addChild(row);
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
    // Food buildings: hint at Agriculture on any own empty land tile, and at
    // Granary next to one of your farms.
    if (map && canPlaceFoodBuilding(tile, human)) {
      if (!hasSkill(human, 'agriculture')) push('agriculture', t('ui.openagriculture'));
      else if (
        !hasSkill(human, 'granary') &&
        hexNeighbors(tile).some((n) => {
          const nt = tileAt(map, n.q, n.r);
          return nt !== undefined && nt.building?.kind === 'farm' && nt.ownedBy === human.index;
        })
      ) {
        push('granary', t('ui.opengranary'));
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
