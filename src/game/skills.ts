import type { Player } from './players';
import { canAfford, pay } from './resources';

export type SkillId =
  | 'climbing'
  | 'smithery'
  | 'swordsman'
  | 'geology'
  | 'water'
  | 'navigation'
  | 'waterTemples'
  | 'forestry'
  | 'forestTemple'
  | 'science'
  | 'roads'
  | 'shields'
  | 'defence'
  | 'catapult'
  | 'riding'
  | 'knights'
  | 'bridges';

export interface SkillInfo {
  id: SkillId;
  name: string;
  level: number;
  parent: SkillId | null;
  description: string;
}

export const SKILLS: Record<SkillId, SkillInfo> = {
  climbing: {
    id: 'climbing',
    name: 'Climbing',
    level: 1,
    parent: null,
    description: 'Units can move onto mountain tiles.',
  },
  smithery: {
    id: 'smithery',
    name: 'Smithery',
    level: 2,
    parent: 'climbing',
    description: 'Allows building mines on owned mountain tiles.',
  },
  swordsman: {
    id: 'swordsman',
    name: 'Swordsman',
    level: 2,
    parent: 'climbing',
    description: 'Allows spawning swordsman units (15 money + 1 ore).',
  },
  geology: {
    id: 'geology',
    name: 'Geology',
    level: 2,
    parent: 'science',
    description: 'Mines produce +1 ore per round.',
  },
  water: {
    id: 'water',
    name: 'Water',
    level: 1,
    parent: null,
    description: 'Allows building ports on owned water tiles.',
  },
  navigation: {
    id: 'navigation',
    name: 'Navigation',
    level: 2,
    parent: 'water',
    description: 'Unlocks future naval features.',
  },
  waterTemples: {
    id: 'waterTemples',
    name: 'Water temples',
    level: 2,
    parent: 'water',
    description: 'Unlocks future water temple features.',
  },
  forestry: {
    id: 'forestry',
    name: 'Forestry',
    level: 1,
    parent: null,
    description: 'Allows building factories on owned land near forests.',
  },
  forestTemple: {
    id: 'forestTemple',
    name: 'Forest temple',
    level: 2,
    parent: 'forestry',
    description: 'Unlocks future forest temple features.',
  },
  science: {
    id: 'science',
    name: 'Science',
    level: 1,
    parent: null,
    description: 'Allows advanced research. Cuts your attack miss chance to 5%.',
  },
  roads: {
    id: 'roads',
    name: 'Roads',
    level: 2,
    parent: 'forestry',
    description: 'Allows building roads between villages.',
  },
  shields: {
    id: 'shields',
    name: 'Shields',
    level: 1,
    parent: null,
    description: 'Allows spawning shield units (10 money).',
  },
  defence: {
    id: 'defence',
    name: 'Defence',
    level: 2,
    parent: 'shields',
    description: 'Unlocks the Build village walls action (coming soon).',
  },
  catapult: {
    id: 'catapult',
    name: 'Catapult',
    level: 2,
    parent: 'science',
    description: 'Allows spawning catapult units (30 money + 20 wood + 5 ore).',
  },
  riding: {
    id: 'riding',
    name: 'Riding',
    level: 1,
    parent: null,
    description: 'Allows spawning rider units (6 money).',
  },
  bridges: {
    id: 'bridges',
    name: 'Bridges',
    level: 2,
    parent: 'riding',
    description: 'Allows building bridges across water (10 wood, 15 money, 5 stone).',
  },
  knights: {
    id: 'knights',
    name: 'Knights',
    level: 2,
    parent: 'riding',
    description: 'Allows spawning knight units (20 money + 10 ore).',
  },
};

export function skillCost(id: SkillId, openedCount: number): number {
  return 3 * SKILLS[id].level + openedCount * 2;
}

export function hasSkill(player: Player, id: SkillId): boolean {
  return player.skills.includes(id);
}

export function canOpenSkill(player: Player, id: SkillId): boolean {
  if (hasSkill(player, id)) return false;
  const info = SKILLS[id];
  if (info.parent && !hasSkill(player, info.parent)) return false;
  return canAfford(player.resources, { wood: 0, stone: 0, money: skillCost(id, player.skills.length), ore: 0 });
}

export function openSkill(player: Player, id: SkillId): boolean {
  if (!canOpenSkill(player, id)) return false;
  player.resources = pay(player.resources, { wood: 0, stone: 0, money: skillCost(id, player.skills.length), ore: 0 });
  player.skills.push(id);
  return true;
}

export function randomUnopenedSkill(player: Player, rng: () => number): SkillId | null {
  const opened = new Set(player.skills);
  const unopened = (Object.keys(SKILLS) as SkillId[]).filter((id) => !opened.has(id));
  if (unopened.length === 0) return null;
  return unopened[Math.floor(rng() * unopened.length)]!;
}
