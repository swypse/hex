import type { Simulator } from '../game/simulator';
import type { GameEvent } from '../game/events';
import { t } from '../i18n';
import { hexDistance, hexNeighbors, type Axial } from '../game/map/hex';
import type { MapTile } from '../game/map/map-gen';
import { isForestType, isIceType, isLandType, isWaterType } from '../game/map/tile-types';
import { isExploredFor } from '../game/map/explore';
import { hasSkill } from '../game/skills';
import { makeUnit } from '../game/units/units';
import { isDialogStep, STEP_ORDER } from '../game/tutorial/tutorial-steps';
import { canBuildFarm, canBuildGranary } from '../game/economy/buildings';
import { addStock, readStock } from '../game/economy/stock';
import {
  TUTORIAL_CAPITAL, TUTORIAL_ENEMY_PLAYER, TUTORIAL_ARCHER_ENEMY_PREFERRED,
  TUTORIAL_SHIP_ENEMY_PREFERRED, TUTORIAL_ENEMY_SHIP_ID, TUTORIAL_ENEMY_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_PORT_TILE, TUTORIAL_START_WARRIOR_ID,
} from '../game/tutorial/tutorial-map';
import { BonusKind, BuildingKind, GameEventType, Season, SkillId, TutorialStepId, UnitType } from '@enums';
import { tileAt } from '../game/map/tile-index';

export interface TutorialHost {
  sim(): Simulator | null;
  /** Plays the events queued by the director's own sim changes (season, lightning). */
  presentPending?(): void;
}

/** Money and capital materials the food steps top up to, so the player can always afford them. */
const FOOD_STEP_FUNDS = { money: 120, wood: 20, stone: 20 } as const;

export class TutorialDirector {
  private stepIndex = 0;
  private freeVillageQ = 0;
  private freeVillageR = 0;
  private freeVillageSet = false;
  private fireStarted = false;

  constructor(private readonly host: TutorialHost) {}

  start(): void {
    this.stepIndex = 0;
    this.freeVillageSet = false;
    this.fireStarted = false;
  }

  currentStep(): TutorialStepId {
    return STEP_ORDER[this.stepIndex]!;
  }

  /** Dismisses the current message dialog (all but the final one); true when it advanced. */
  continueDialog(): boolean {
    const step = this.currentStep();
    if (step === TutorialStepId.END || !isDialogStep(step)) return false;
    const before = this.stepIndex;
    this.stepIndex++;
    this.enterCurrent();
    this.autoAdvanceIfDone();
    return this.stepIndex !== before;
  }

  /** Returns true when the director advanced or mutated the sim map. */
  afterCommand(events: GameEvent[]): boolean {
    const step = this.currentStep();
    let changed = false;
    if (!isDialogStep(step) && this.completesOnEvents(step, events)) {
      this.stepIndex++;
      this.enterCurrent();
      changed = true;
    }
    if (this.autoAdvanceIfDone()) changed = true;
    return changed;
  }

  private autoAdvanceIfDone(): boolean {
    let changed = false;
    for (let guard = 0; guard < STEP_ORDER.length; guard++) {
      const step = this.currentStep();
      if (isDialogStep(step) || !this.done(step)) break;
      this.stepIndex++;
      this.enterCurrent();
      changed = true;
    }
    return changed;
  }

  private enterCurrent(): void {
    const step = this.currentStep();
    if (step === TutorialStepId.ATTACK_ENEMY) this.placeEnemyWarrior();
    else if (step === TutorialStepId.BOARD_SHIP) this.repositionWarriorForBoarding();
    else if (step === TutorialStepId.ATTACK_ENEMY_SHIP) this.placeEnemyShip();
    else if (step === TutorialStepId.COLLECT_BONUS) this.placeTutorialBonus();
    else if (step === TutorialStepId.APPROACH_FREE_VILLAGE) this.placeFreeVillage();
    else if (step === TutorialStepId.OPEN_AGRICULTURE) this.ensureFunds();
    else if (step === TutorialStepId.WINTER) this.changeSeason(Season.WINTER);
    else if (step === TutorialStepId.BUILD_GRANARY) this.startSpring();
    else if (step === TutorialStepId.EXTINGUISH_FIRE) this.strikeForest();
    else if (step === TutorialStepId.END) this.removeDummyUnits();
  }

  private done(step: TutorialStepId): boolean {
    const sim = this.host.sim();
    if (!sim) return false;
    const human = sim.players[TUTORIAL_HUMAN];
    if (!human) return false;
    switch (step) {
      case TutorialStepId.MOVE_UNIT: {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return !cap?.unit || cap.unit.id !== TUTORIAL_START_WARRIOR_ID;
      }
      case TutorialStepId.UPGRADE_VILLAGE: {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return (cap?.settlement?.level ?? 0) >= 2;
      }
      case TutorialStepId.OPEN_FORESTRY:
        return hasSkill(human, SkillId.FORESTRY);
      case TutorialStepId.END_TURN1:
      case TutorialStepId.END_TURN2:
        return false;
      case TutorialStepId.BUILD_SAWMILL:
        return sim.map.tiles.some(
          (t) => t.building?.kind === BuildingKind.SAWMILL && t.ownedBy === TUTORIAL_HUMAN,
        );
      case TutorialStepId.OPEN_CLIMBING_SMITHERY:
        return hasSkill(human, SkillId.CLIMBING) && hasSkill(human, SkillId.SMITHERY) && hasSkill(human, SkillId.ARCHER);
      case TutorialStepId.BUILD_MINE:
        return sim.map.tiles.some(
          (t) => t.building?.kind === BuildingKind.MINE && t.ownedBy === TUTORIAL_HUMAN,
        );
      case TutorialStepId.SPAWN_ARCHER:
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.type === UnitType.ARCHER,
        );
      case TutorialStepId.ATTACK_ENEMY:
        return !sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER);
      case TutorialStepId.UPGRADE_VILLAGE3: {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return (cap?.settlement?.level ?? 0) >= 3;
      }
      case TutorialStepId.OPEN_WATER_NAVIGATION:
        return hasSkill(human, SkillId.WATER) && hasSkill(human, SkillId.NAVIGATION);
      case TutorialStepId.BUILD_PORT:
        return sim.map.tiles.some(
          (t) => t.building?.kind === BuildingKind.PORT && t.ownedBy === TUTORIAL_HUMAN,
        );
      case TutorialStepId.BOARD_SHIP:
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined,
        );
      case TutorialStepId.UPGRADE_SHIP:
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && (t.unit.shipLevel ?? 0) >= 2,
        );
      case TutorialStepId.ATTACK_ENEMY_SHIP:
        return !sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER);
      case TutorialStepId.COLLECT_BONUS:
        return !sim.map.tiles.some((t) => t.bonus !== undefined && t.bonus !== null);
      case TutorialStepId.APPROACH_FREE_VILLAGE: {
        if (!this.freeVillageSet) return false;
        const v = tileAt(sim.map, this.freeVillageQ, this.freeVillageR);
        return v !== undefined && v.settlement?.owner === null && v.unit?.owner === TUTORIAL_HUMAN;
      }
      case TutorialStepId.CAPTURE_FREE_VILLAGE: {
        if (!this.freeVillageSet) return false;
        const v = tileAt(sim.map, this.freeVillageQ, this.freeVillageR);
        return v?.settlement?.owner === TUTORIAL_HUMAN;
      }
      case TutorialStepId.OPEN_AGRICULTURE:
        return hasSkill(human, SkillId.AGRICULTURE) && hasSkill(human, SkillId.GRANARY);
      case TutorialStepId.BUILD_FARM:
        return this.hasOwnBuilding(BuildingKind.FARM);
      case TutorialStepId.BUILD_GRANARY:
        return this.hasOwnBuilding(BuildingKind.GRANARY);
      case TutorialStepId.EXTINGUISH_FIRE:
        return !this.fireStarted || !sim.map.tiles.some((t) => t.fire);
      default:
        return false;
    }
  }

  private completesOnEvents(step: TutorialStepId, events: GameEvent[]): boolean {
    const sim = this.host.sim();
    if (!sim) return false;
    for (const e of events) {
      switch (step) {
        case TutorialStepId.MOVE_UNIT:
          if (e.type === GameEventType.UNIT_MOVED && e.unitId === TUTORIAL_START_WARRIOR_ID) return true;
          break;
        case TutorialStepId.UPGRADE_VILLAGE:
          if (
            e.type === GameEventType.VILLAGE_UPGRADED &&
            e.q === TUTORIAL_CAPITAL.q &&
            e.r === TUTORIAL_CAPITAL.r &&
            e.playerIndex === TUTORIAL_HUMAN
          ) {
            return true;
          }
          break;
        case TutorialStepId.OPEN_FORESTRY:
          if (e.type === GameEventType.SKILL_OPENED && e.playerIndex === TUTORIAL_HUMAN && e.skill === SkillId.FORESTRY) return true;
          break;
        case TutorialStepId.END_TURN1:
        case TutorialStepId.END_TURN2:
          if (e.type === GameEventType.TURN_STARTED && e.playerIndex === TUTORIAL_HUMAN) return true;
          break;
        case TutorialStepId.ATTACK_ENEMY: {
          if (e.type !== GameEventType.ATTACK || e.attackerIndex !== TUTORIAL_HUMAN || e.targetIndex !== TUTORIAL_ENEMY_PLAYER) break;
          const attacker = sim.map.tiles.find((t) => t.unit?.id === e.attackerId)?.unit;
          if (attacker?.type === UnitType.ARCHER) return true;
          break;
        }
        case TutorialStepId.ATTACK_ENEMY_SHIP: {
          if (e.type !== GameEventType.ATTACK || e.attackerIndex !== TUTORIAL_HUMAN || e.targetIndex !== TUTORIAL_ENEMY_PLAYER) break;
          const attacker = sim.map.tiles.find((t) => t.unit?.id === e.attackerId)?.unit;
          if (attacker?.shipLevel !== undefined) return true;
          break;
        }
        case TutorialStepId.EXTINGUISH_FIRE:
          if (e.type === GameEventType.FIRE_EXTINGUISHED) return true;
          break;
        case TutorialStepId.COLLECT_BONUS:
          if (e.type === GameEventType.BONUS_CLAIMED && e.playerIndex === TUTORIAL_HUMAN) return true;
          break;
        default:
          break;
      }
    }
    return false;
  }

  /** Tiles the current step wants highlighted besides its fixed markers. */
  markerTiles(): Axial[] {
    const sim = this.host.sim();
    const human = sim?.players[TUTORIAL_HUMAN];
    if (!sim || !human) return [];
    const step = this.currentStep();
    if (step === TutorialStepId.BUILD_FARM || step === TutorialStepId.BUILD_GRANARY) {
      const farm = step === TutorialStepId.BUILD_FARM;
      const spot = sim.map.tiles
        .filter((t) => (farm ? canBuildFarm(sim.map, t, human) : canBuildGranary(sim.map, t, human)))
        .sort((a, b) => Number(!!a.unit) - Number(!!b.unit) || hexDistance(a, TUTORIAL_CAPITAL) - hexDistance(b, TUTORIAL_CAPITAL))[0];
      return spot ? [{ q: spot.q, r: spot.r }] : [];
    }
    if (step === TutorialStepId.EXTINGUISH_FIRE) return sim.map.tiles.filter((t) => t.fire).map((t) => ({ q: t.q, r: t.r }));
    return [];
  }

  private hasOwnBuilding(kind: BuildingKind): boolean {
    return !!this.host.sim()?.map.tiles.some((t) => t.building?.kind === kind && t.ownedBy === TUTORIAL_HUMAN);
  }

  /** Tops up the player's money and the capital's materials for the food buildings. */
  private ensureFunds(): void {
    const sim = this.host.sim();
    const human = sim?.players[TUTORIAL_HUMAN];
    const capital = sim && tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
    if (!human || !capital?.settlement) return;
    human.resources.money = Math.max(human.resources.money, FOOD_STEP_FUNDS.money);
    const stock = readStock(capital);
    addStock(capital, {
      wood: Math.max(0, FOOD_STEP_FUNDS.wood - stock.wood),
      stone: Math.max(0, FOOD_STEP_FUNDS.stone - stock.stone),
    });
  }

  private changeSeason(season: Season): void {
    if (this.host.sim()?.forceSeason(season)) this.host.presentPending?.();
  }

  /** Spring melts the ice and kills whatever stands on it: move own units ashore first. */
  private startSpring(): void {
    const sim = this.host.sim();
    if (!sim) return;
    this.ensureFunds();
    for (const tile of sim.map.tiles) {
      if (!tile.unit || !isIceType(tile.terrain)) continue;
      const shore = sim.map.tiles
        .filter((t) => isLandType(t.terrain) && !t.unit && !t.settlement && !t.building)
        .sort((a, b) => hexDistance(a, tile) - hexDistance(b, tile))[0];
      if (!shore) continue;
      const unit = tile.unit;
      tile.unit = null;
      shore.unit = unit;
      unit.q = shore.q;
      unit.r = shore.r;
    }
    this.changeSeason(Season.SPRING);
  }

  /** Lightning on the forest nearest to the archer, which is stood beside it and rested. */
  private strikeForest(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const anchor = sim.map.tiles.find((t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel === undefined);
    const from = anchor ?? tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r)!;
    const forest = sim.map.tiles
      .filter((t) => isForestType(t.terrain) && !t.unit && !t.fire)
      .sort((a, b) => hexDistance(a, from) - hexDistance(b, from))[0];
    if (!forest) return;
    const unit = anchor?.unit;
    if (anchor && unit) {
      if (hexDistance(anchor, forest) > 1) {
        const spot = hexNeighbors(forest)
          .map((n) => tileAt(sim.map, n.q, n.r))
          .find((t) => t && isLandType(t.terrain) && !t.unit && !t.settlement && !t.building);
        if (spot) {
          anchor.unit = null;
          spot.unit = unit;
          unit.q = spot.q;
          unit.r = spot.r;
        }
      }
      unit.hasMoved = false;
      unit.hasAttacked = false;
      unit.hasHealed = false;
    }
    sim.forceLightning(forest);
    this.fireStarted = true;
    this.host.presentPending?.();
  }

  private placeEnemyWarrior(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const archer = sim.map.tiles.find(
      (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.type === UnitType.ARCHER,
    );
    const from = archer ?? tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
    if (!from) return;
    const candidates = sim.map.tiles
      .filter(
        (t) =>
          hexDistance(t, from) === 3 &&
          isLandType(t.terrain) &&
          !t.unit &&
          isExploredFor(t, TUTORIAL_HUMAN),
      )
      .sort(
        (a, b) =>
          hexDistance(a, TUTORIAL_ARCHER_ENEMY_PREFERRED) - hexDistance(b, TUTORIAL_ARCHER_ENEMY_PREFERRED),
      );
    const spot = candidates[0];
    if (!spot) return;
    spot.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, UnitType.WARRIOR, spot.q, spot.r, {
      id: TUTORIAL_ENEMY_WARRIOR_ID,
      spawnVillage: null,
    });
  }

  private repositionWarriorForBoarding(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const warrior = sim.map.tiles.find((t) => t.unit?.id === TUTORIAL_START_WARRIOR_ID)?.unit;
    if (!warrior || warrior.shipLevel !== undefined) return;
    const currentTile = tileAt(sim.map, warrior.q, warrior.r);
    const stagingOk =
      currentTile !== undefined &&
      !isWaterType(currentTile.terrain) &&
      hexDistance(warrior, TUTORIAL_PORT_TILE) === 1;
    if (stagingOk) return;
    const order = [
      { q: 1, r: -1 }, { q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: -1 },
    ];
    for (const n of order) {
      const t = tileAt(sim.map, n.q, n.r);
      if (!t || t.unit || !isLandType(t.terrain)) continue;
      const fromTile = tileAt(sim.map, warrior.q, warrior.r);
      if (fromTile) fromTile.unit = null;
      t.unit = warrior;
      warrior.q = t.q;
      warrior.r = t.r;
      return;
    }
  }

  private placeEnemyShip(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const ship = sim.map.tiles.find(
      (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined,
    );
    const from = ship ?? tileAt(sim.map, TUTORIAL_PORT_TILE.q, TUTORIAL_PORT_TILE.r);
    if (!from) return;
    const candidates = sim.map.tiles
      .filter(
        (t) =>
          isWaterType(t.terrain) &&
          !t.unit &&
          hexDistance(t, from) === 3 &&
          isExploredFor(t, TUTORIAL_HUMAN),
      )
      .sort(
        (a, b) =>
          hexDistance(a, TUTORIAL_SHIP_ENEMY_PREFERRED) - hexDistance(b, TUTORIAL_SHIP_ENEMY_PREFERRED),
      );
    const spot = candidates[0];
    if (!spot) return;
    spot.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, UnitType.WARRIOR, spot.q, spot.r, {
      id: TUTORIAL_ENEMY_SHIP_ID,
      shipLevel: 1,
      spawnVillage: null,
    });
  }

  private placeTutorialBonus(): void {
    const sim = this.host.sim();
    if (!sim) return;
    // Anchor the bonus next to a player unit that still stands on land (the
    // archer) so it is always reachable in one move.
    const anchor = sim.map.tiles.find(
      (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel === undefined,
    );
    if (!anchor) return;
    const freeLand = (t: ReturnType<typeof tileAt>): boolean =>
      t !== undefined &&
      isLandType(t.terrain) &&
      !t.unit &&
      !t.settlement &&
      !t.building &&
      !t.bonus;
    for (const n of hexNeighbors(anchor)) {
      const t = tileAt(sim.map, n.q, n.r);
      if (freeLand(t)) {
        t!.bonus = { kind: BonusKind.MONEY, claimer: null, arrivalTurn: 0 };
        return;
      }
    }
    for (const t of sim.map.tiles) {
      if (hexDistance(t, anchor) <= 2 && freeLand(t)) {
        t.bonus = { kind: BonusKind.MONEY, claimer: null, arrivalTurn: 0 };
        return;
      }
    }
  }

  private placeFreeVillage(): void {
    const sim = this.host.sim();
    if (!sim) return;
    const anchor = sim.map.tiles.find(
      (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel === undefined,
    );
    if (!anchor) return;
    // The empty village must not sit inside the player's own village territory:
    // pick the closest land tile that is neither owned nor claimed by any
    // settlement.
    const freeNeutral = (t: MapTile): boolean =>
      isLandType(t.terrain) &&
      t.ownedBy === null &&
      t.claimedByVillage === null &&
      !t.unit &&
      !t.settlement &&
      !t.building &&
      !t.bonus;
    const target = [...sim.map.tiles]
      .filter(freeNeutral)
      .sort((a, b) => hexDistance(a, anchor) - hexDistance(b, anchor))[0];
    if (!target) return;
    target.settlement = { owner: null, level: 1, captureReady: false, name: t('tutorial.emptyVillage') };
    this.freeVillageQ = target.q;
    this.freeVillageR = target.r;
    this.freeVillageSet = true;

    // Stage the anchoring unit on a free land tile next to the village so it
    // can step onto it in one move.
    const unit = anchor.unit!;
    if (isLandType(anchor.terrain) && hexDistance(anchor, target) === 1) return;
    for (const n of hexNeighbors(target)) {
      const t = tileAt(sim.map, n.q, n.r);
      if (!t || !isLandType(t.terrain) || t.unit || t.settlement) continue;
      anchor.unit = null;
      t.unit = unit;
      unit.q = t.q;
      unit.r = t.r;
      return;
    }
    // Fallback: stage on any free land tile within two hexes of the village.
    const staging = sim.map.tiles
      .filter(
        (t) =>
          hexDistance(t, target) <= 2 &&
          t !== target &&
          isLandType(t.terrain) &&
          !t.unit &&
          !t.settlement,
      )
      .sort((a, b) => hexDistance(a, anchor) - hexDistance(b, anchor))[0];
    if (staging) {
      anchor.unit = null;
      staging.unit = unit;
      unit.q = staging.q;
      unit.r = staging.r;
    }
  }

  private removeDummyUnits(): void {
    const sim = this.host.sim();
    if (!sim) return;
    for (const t of sim.map.tiles) {
      if (t.unit && t.unit.owner === TUTORIAL_ENEMY_PLAYER) t.unit = null;
    }
  }
}
