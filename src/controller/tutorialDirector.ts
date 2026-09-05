import type { Simulator } from '../game/simulator';
import type { GameEvent } from '../game/events';
import { hexDistance, hexNeighbors } from '../game/hex';
import { tileAt } from '../game/selection';
import { isLandType, isWaterType } from '../game/tileTypes';
import { isExploredFor } from '../game/explore';
import { hasSkill } from '../game/skills';
import { makeUnit } from '../game/units';
import { STEP_ORDER, type TutorialStepId } from '../game/tutorial/tutorialSteps';
import {
  TUTORIAL_CAPITAL, TUTORIAL_ENEMY_PLAYER, TUTORIAL_ARCHER_ENEMY_PREFERRED,
  TUTORIAL_SHIP_ENEMY_PREFERRED, TUTORIAL_ENEMY_SHIP_ID, TUTORIAL_ENEMY_WARRIOR_ID,
  TUTORIAL_HUMAN, TUTORIAL_PORT_TILE, TUTORIAL_START_WARRIOR_ID,
} from '../game/tutorial/tutorialMap';

export interface TutorialHost {
  sim(): Simulator | null;
}

export class TutorialDirector {
  private stepIndex = 0;

  constructor(private readonly host: TutorialHost) {}

  start(): void {
    this.stepIndex = 0;
  }

  currentStep(): TutorialStepId {
    return STEP_ORDER[this.stepIndex]!;
  }

  welcomeClosed(): boolean {
    if (this.currentStep() !== 'welcome') return false;
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
    if (step !== 'welcome' && step !== 'end' && this.completesOnEvents(step, events)) {
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
      if (step === 'welcome' || step === 'end') break;
      if (!this.done(step)) break;
      this.stepIndex++;
      this.enterCurrent();
      changed = true;
    }
    return changed;
  }

  private enterCurrent(): void {
    const step = this.currentStep();
    if (step === 'attackEnemy') this.placeEnemyWarrior();
    else if (step === 'upgradeVillage3') this.removeDummyUnits();
    else if (step === 'boardShip') this.repositionWarriorForBoarding();
    else if (step === 'attackEnemyShip') this.placeEnemyShip();
    else if (step === 'collectBonus') this.placeTutorialBonus();
    else if (step === 'end') this.removeDummyUnits();
  }

  private done(step: TutorialStepId): boolean {
    const sim = this.host.sim();
    if (!sim) return false;
    const human = sim.players[TUTORIAL_HUMAN];
    if (!human) return false;
    switch (step) {
      case 'moveUnit': {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return !cap?.unit || cap.unit.id !== TUTORIAL_START_WARRIOR_ID;
      }
      case 'upgradeVillage': {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return (cap?.settlement?.level ?? 0) >= 2;
      }
      case 'openForestry':
        return hasSkill(human, 'forestry');
      case 'endTurn1':
      case 'endTurn2':
        return false;
      case 'buildSawmill':
        return sim.map.tiles.some(
          (t) => t.building?.kind === 'sawmill' && t.ownedBy === TUTORIAL_HUMAN,
        );
      case 'openClimbingSmithery':
        return hasSkill(human, 'climbing') && hasSkill(human, 'smithery');
      case 'buildMine':
        return sim.map.tiles.some(
          (t) => t.building?.kind === 'mine' && t.ownedBy === TUTORIAL_HUMAN,
        );
      case 'spawnArcher':
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.type === 'archer',
        );
      case 'attackEnemy':
        return !sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER);
      case 'upgradeVillage3': {
        const cap = tileAt(sim.map, TUTORIAL_CAPITAL.q, TUTORIAL_CAPITAL.r);
        return (cap?.settlement?.level ?? 0) >= 3;
      }
      case 'openWaterNavigation':
        return hasSkill(human, 'water') && hasSkill(human, 'navigation');
      case 'buildPort':
        return sim.map.tiles.some(
          (t) => t.building?.kind === 'port' && t.ownedBy === TUTORIAL_HUMAN,
        );
      case 'boardShip':
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.shipLevel !== undefined,
        );
      case 'upgradeShip':
        return sim.map.tiles.some(
          (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && (t.unit.shipLevel ?? 0) >= 2,
        );
      case 'attackEnemyShip':
        return !sim.map.tiles.some((t) => t.unit?.owner === TUTORIAL_ENEMY_PLAYER);
      case 'collectBonus':
        return !sim.map.tiles.some((t) => t.bonus !== undefined && t.bonus !== null);
      default:
        return false;
    }
  }

  private completesOnEvents(step: TutorialStepId, events: GameEvent[]): boolean {
    const sim = this.host.sim();
    if (!sim) return false;
    for (const e of events) {
      switch (step) {
        case 'moveUnit':
          if (e.type === 'unitMoved' && e.unitId === TUTORIAL_START_WARRIOR_ID) return true;
          break;
        case 'upgradeVillage':
          if (
            e.type === 'villageUpgraded' &&
            e.q === TUTORIAL_CAPITAL.q &&
            e.r === TUTORIAL_CAPITAL.r &&
            e.playerIndex === TUTORIAL_HUMAN
          ) {
            return true;
          }
          break;
        case 'openForestry':
          if (e.type === 'skillOpened' && e.playerIndex === TUTORIAL_HUMAN && e.skill === 'forestry') return true;
          break;
        case 'endTurn1':
        case 'endTurn2':
          if (e.type === 'turnStarted' && e.playerIndex === TUTORIAL_HUMAN) return true;
          break;
        case 'attackEnemy': {
          if (e.type !== 'attack' || e.attackerIndex !== TUTORIAL_HUMAN || e.targetIndex !== TUTORIAL_ENEMY_PLAYER) break;
          const attacker = sim.map.tiles.find((t) => t.unit?.id === e.attackerId)?.unit;
          if (attacker?.type === 'archer') return true;
          break;
        }
        case 'attackEnemyShip': {
          if (e.type !== 'attack' || e.attackerIndex !== TUTORIAL_HUMAN || e.targetIndex !== TUTORIAL_ENEMY_PLAYER) break;
          const attacker = sim.map.tiles.find((t) => t.unit?.id === e.attackerId)?.unit;
          if (attacker?.shipLevel !== undefined) return true;
          break;
        }
        case 'collectBonus':
          if (e.type === 'bonusClaimed' && e.playerIndex === TUTORIAL_HUMAN) return true;
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
      (t) => t.unit && t.unit.owner === TUTORIAL_HUMAN && t.unit.type === 'archer',
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
    spot.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, 'warrior', spot.q, spot.r, {
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
    spot.unit = makeUnit(TUTORIAL_ENEMY_PLAYER, 'warrior', spot.q, spot.r, {
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
        t!.bonus = { kind: 'money', claimer: null, arrivalTurn: 0 };
        return;
      }
    }
    for (const t of sim.map.tiles) {
      if (hexDistance(t, anchor) <= 2 && freeLand(t)) {
        t.bonus = { kind: 'money', claimer: null, arrivalTurn: 0 };
        return;
      }
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
