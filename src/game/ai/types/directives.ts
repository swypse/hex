import { AiPace, SkillId, SpawnPreference } from '@enums';

export interface AiDirectives {
  frontTarget: { q: number; r: number } | null;
  muster: { tile: { q: number; r: number } | null; minUnits: number; target: { q: number; r: number } } | null;
  spawnPlan: { villageKey: string; prefer: SpawnPreference }[];
  moneyReserve: number;
  skillChain: SkillId[] | null;
  pace: AiPace;
}
