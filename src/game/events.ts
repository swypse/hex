import type { Axial } from './map/hex';
import type { WeatherBuildingHit, WeatherEvent, WeatherUnitHit } from './weather/weather';
import { AchievementId, BonusKind, BottleEffect, BuildingKind, GameEventType, Season, SiegeTargetKind, SkillId, UnitType } from '@enums';



/** Pre-attack visual info for a combatant so presenters can keep showing a
 * unit (and its hp) after the sim has already applied the combat result. */
export interface AttackUnitPre {
  type: UnitType;
  owner: number;
  shipLevel?: 1 | 2 | 3;
  hp: number;
}

export type GameEvent =
  | { type: GameEventType.UNIT_MOVED; unitId: string; from: Axial; path: Axial[]; to: Axial; shipLevel?: 1 | 2 | 3 }
  | { type: GameEventType.ATTACK; attackerId: string; targetId: string; attackerIndex: number; targetIndex: number; attackerTile: Axial; targetTile: Axial; attackerDamage: number; targetDamage: number; missed: boolean; attackerDied: boolean; targetDied: boolean; attackerPre?: AttackUnitPre; targetPre?: AttackUnitPre }
  | { type: GameEventType.SIEGE; attackerId: string; attackerIndex: number; targetIndex: number; targetTile: Axial; missed: boolean; destroyed: SiegeTargetKind | null; buildingHp?: number }
  | { type: GameEventType.SPAWNED; unitType: UnitType; q: number; r: number; playerIndex: number }
  | { type: GameEventType.CAPTURED; q: number; r: number; oldOwner: number | null; newOwner: number; ownerDied: boolean }
  | { type: GameEventType.VILLAGE_UPGRADED; q: number; r: number; level: number; playerIndex: number }
  | { type: GameEventType.WALL_BUILT; q: number; r: number; playerIndex: number }
  | { type: GameEventType.BUILT; kind: BuildingKind; q: number; r: number; playerIndex: number }
  | { type: GameEventType.BUILDING_REPAIRED; q: number; r: number; playerIndex: number }
  | { type: GameEventType.BUILDING_DESTROYED; q: number; r: number; playerIndex: number }
  | { type: GameEventType.BRIDGE_BUILT; q: number; r: number; playerIndex: number }
  | { type: GameEventType.TEMPLE_GROWN; q: number; r: number; level: number; playerIndex: number }
  | { type: GameEventType.ROAD_BUILT; q: number; r: number; playerIndex: number }
  | { type: GameEventType.SKILL_OPENED; playerIndex: number; skill: SkillId }
  | { type: GameEventType.HEALED; unitId: string; playerIndex: number }
  | { type: GameEventType.SHIP_UPGRADED; unitId: string; level: 1 | 2 | 3; playerIndex: number }
  | { type: GameEventType.SHIP_REVERTED; unitId: string }
  | { type: GameEventType.UNIT_DISBANDED; unitId: string; q: number; r: number; playerIndex: number }
  | { type: GameEventType.SCORE_FLY; playerIndex: number; amount: number; q: number; r: number }
  | { type: GameEventType.KNIGHT_COMBO; unitId: string; q: number; r: number; playerIndex: number }
  | { type: GameEventType.BONUS_CLAIMED; q: number; r: number; kind: BonusKind; playerIndex: number; skill?: SkillId }
  | { type: GameEventType.BOTTLE_COLLECTED; q: number; r: number; kind: BottleEffect; playerIndex: number; skill?: SkillId }
  | { type: GameEventType.EXPLORER; q: number; r: number; path: Axial[]; playerIndex: number }
  | { type: GameEventType.PIRATE_CAPTURE; q: number; r: number; playerIndex: number; success: boolean }
  | { type: GameEventType.PIRATE_SPAWNED; q: number; r: number }
  | { type: GameEventType.PIRATE_DEAL; unitId: string; q: number; r: number; playerIndex: number }
  | { type: GameEventType.PIRATE_DEAL_CANCELED; unitId: string; q: number; r: number; playerIndex: number }
  | { type: GameEventType.STEALTH_ENABLED; unitId: string }
  | { type: GameEventType.STEALTH_REVEALED; unitId: string; q: number; r: number }
  | { type: GameEventType.STALKER_SPOTTED; unitId: string; villageQ: number; villageR: number }
  | { type: GameEventType.TRAP_PLACED; q: number; r: number; playerIndex: number }
  | { type: GameEventType.ROAD_BURNED; unitId: string; q: number; r: number; playerIndex: number; owner: number }
  | { type: GameEventType.BURNED; unitId: string; kind: BuildingKind.FARM | BuildingKind.GRANARY; q: number; r: number; playerIndex: number }
  | { type: GameEventType.STARVATION; q: number; r: number; playerIndex: number; units: { q: number; r: number; damage: number }[] }
  | { type: GameEventType.TRAP_TRIGGERED; q: number; r: number; targetId: string; damage: number; attackerIndex: number }
  | { type: GameEventType.STORM; unitId: string; q: number; r: number; targets: { q: number; r: number; damage: number }[] }
  | { type: GameEventType.STUN_SHOT; attackerId: string; targetId: string; attackerTile: Axial; targetTile: Axial; missed: boolean; stunned: boolean }
  | { type: GameEventType.ACHIEVEMENT_UNLOCKED; playerIndex: number; achievement: AchievementId }
  | { type: GameEventType.SEASON_CHANGED; season: Season; frozen: Axial[]; thawed: Axial[]; landed: { unitId: string; owner: number }[]; removed: Axial[]; killed: { unitId: string; q: number; r: number; owner: number }[] }
  | { type: GameEventType.WEATHER_STARTED; weather: WeatherEvent }
  | { type: GameEventType.WEATHER_ENDED; weather: WeatherEvent }
  | { type: GameEventType.WEATHER_MOVED; weather: WeatherEvent }
  | { type: GameEventType.WEATHER_DAMAGE; weather: WeatherEvent; units: WeatherUnitHit[]; buildings: WeatherBuildingHit[] }
  | { type: GameEventType.TURN_STARTED; playerIndex: number; turn: number }
  | { type: GameEventType.AI_TURN; playerIndex: number }
  | { type: GameEventType.AI_TAKEOVER; playerIndex: number }
  | { type: GameEventType.PLAYER_FORFEITED; playerIndex: number }
  | { type: GameEventType.GAME_OVER; winnerIndex: number; bonus: number };
