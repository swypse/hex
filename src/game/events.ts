import type { Axial } from './hex';
import { SkillId } from './skills';
import { UnitType } from './units';
import type { BonusKind } from './bonus';

export type BuildingKind = 'sawmill' | 'mine' | 'port' | 'temple' | 'forestTemple';

export type { Axial };

/** Pre-attack visual info for a combatant so presenters can keep showing a
 * unit (and its hp) after the sim has already applied the combat result. */
export interface AttackUnitPre {
  type: UnitType;
  owner: number;
  shipLevel?: 1 | 2 | 3;
  hp: number;
}

export type GameEvent =
  | { type: 'unitMoved'; unitId: string; from: Axial; path: Axial[]; to: Axial; shipLevel?: 1 | 2 | 3 }
  | { type: 'attack'; attackerId: string; targetId: string; attackerIndex: number; targetIndex: number; attackerTile: Axial; targetTile: Axial; attackerDamage: number; targetDamage: number; missed: boolean; attackerDied: boolean; targetDied: boolean; attackerPre?: AttackUnitPre; targetPre?: AttackUnitPre }
  | { type: 'spawned'; unitType: UnitType; q: number; r: number; playerIndex: number }
  | { type: 'captured'; q: number; r: number; oldOwner: number | null; newOwner: number; ownerDied: boolean }
  | { type: 'villageUpgraded'; q: number; r: number; level: number; playerIndex: number }
  | { type: 'built'; kind: BuildingKind; q: number; r: number; playerIndex: number }
  | { type: 'bridgeBuilt'; q: number; r: number; playerIndex: number }
  | { type: 'templeGrown'; q: number; r: number; level: number; playerIndex: number }
  | { type: 'roadBuilt'; q: number; r: number; playerIndex: number }
  | { type: 'skillOpened'; playerIndex: number; skill: SkillId }
  | { type: 'healed'; unitId: string; playerIndex: number }
  | { type: 'shipUpgraded'; unitId: string; level: 1 | 2 | 3; playerIndex: number }
  | { type: 'shipReverted'; unitId: string }
  | { type: 'scoreFly'; playerIndex: number; amount: number; q: number; r: number }
  | { type: 'knightCombo'; unitId: string; q: number; r: number; playerIndex: number }
  | { type: 'bonusClaimed'; q: number; r: number; kind: BonusKind; playerIndex: number; skill?: SkillId }
  | { type: 'explorer'; q: number; r: number; path: Axial[]; playerIndex: number }
  | { type: 'pirateCapture'; q: number; r: number; playerIndex: number; success: boolean }
  | { type: 'pirateSpawned'; q: number; r: number }
  | { type: 'turnStarted'; playerIndex: number; turn: number }
  | { type: 'aiTurn'; playerIndex: number }
  | { type: 'gameOver'; winnerIndex: number; bonus: number };
