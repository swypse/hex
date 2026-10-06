import type { Simulator } from '../game/simulator';
import type { GameEvent } from '../game/events';
import { t } from '../i18n';
import { hexDistance, hexNeighbors } from '../game/map/hex';
import type { MapTile } from '../game/map/map-gen';
import { isLandType, isWaterType } from '../game/map/tile-types';
import { isExploredFor } from '../game/map/explore';
import { hasSkill } from '../game/skills';
import { makeUnit } from '../game/units/units';
import { STEP_ORDER } from '../game/tutorial/tutorial-steps';
import {
  TUTORIAL_CAPITAL, TUTORIAL_ENEMY_PLAYER, TUTORIAL_ARCHER_ENEMY_PREFERRED,
  TUTORIAL_SHIP_ENEMY_PREFERRED, TUTORIAL_ENEMY_SHIP_ID, TUTORIAL_ENEMY_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_PORT_TILE, TUTORIAL_START_WARRIOR_ID,
} from '../game/tutorial/tutorial-map';
import { BonusKind, BuildingKind, GameEventType, SkillId, TutorialStepId, UnitType } from '@enums';
import { tileAt } from '../game/map/tile-index';

export interface TutorialHost {
  sim(): Simulator | null;
}

export class TutorialDirector {
  private stepIndex = 0;
  private freeVillageQ = 0;
  private freeVillageR = 0;
  private freeVillageSet = false;

  constructor(private readonly host: TutorialHost) {}

  start(): void {
    this.stepIndex = 0;
    this.freeVillageSet = false;
  }

  currentStep(): TutorialStepId {
    return STEP_ORDER[this.stepIndex]!;
  }

  welcomeClosed(): boolean {
    if (this.currentStep() !== TutorialStepId.WELCOME) return false;
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
    if (step !== TutorialStepId.WELCOME && step !== TutorialStepId.END && this.completesOnEvents(step, events)) {
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
      if (step === TutorialStepId.WELCOME || step === TutorialStepId.END) break;
      if (!this.done(step)) break;
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
        return hasSkill(human, SkillId.CLIMBING) && hasSkill(human, SkillId.SMITHERY);
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
        case TutorialStepId.COLLECT_BONUS:
          if (e.type === GameEventType.BONUS_CLAIMED && e.playerIndex === TUTORIAL_HUMAN) return true;
          break;
        default:
          break;
      }
    }
    return false;
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
