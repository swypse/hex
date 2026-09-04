import { t } from '../i18n';
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
  | 'defense'
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
    name: t('skill.climbing.name'),
    level: 1,
    parent: null,
    description: t('skill.climbing.desc'),
  },
  smithery: {
    id: 'smithery',
    name: t('skill.smithery.name'),
    level: 2,
    parent: 'climbing',
    description: t('skill.smithery.desc'),
  },
  swordsman: {
    id: 'swordsman',
    name: t('skill.swordsman.name'),
    level: 2,
    parent: 'climbing',
    description: t('skill.swordsman.desc'),
  },
  geology: {
    id: 'geology',
    name: t('skill.geology.name'),
    level: 2,
    parent: 'science',
    description: t('skill.geology.desc'),
  },
  water: {
    id: 'water',
    name: t('skill.water.name'),
    level: 1,
    parent: null,
    description: t('skill.water.desc'),
  },
  navigation: {
    id: 'navigation',
    name: t('skill.navigation.name'),
    level: 2,
    parent: 'water',
    description: t('skill.navigation.desc'),
  },
  waterTemples: {
    id: 'waterTemples',
    name: t('skill.waterTemples.name'),
    level: 2,
    parent: 'water',
    description: t('skill.waterTemples.desc'),
  },
  forestry: {
    id: 'forestry',
    name: t('skill.forestry.name'),
    level: 1,
    parent: null,
    description: t('skill.forestry.desc'),
  },
  forestTemple: {
    id: 'forestTemple',
    name: t('skill.forestTemple.name'),
    level: 2,
    parent: 'forestry',
    description: t('skill.forestTemple.desc'),
  },
  science: {
    id: 'science',
    name: t('skill.science.name'),
    level: 1,
    parent: null,
    description: t('skill.science.desc'),
  },
  roads: {
    id: 'roads',
    name: t('skill.roads.name'),
    level: 2,
    parent: 'forestry',
    description: t('skill.roads.desc'),
  },
  shields: {
    id: 'shields',
    name: t('skill.shields.name'),
    level: 1,
    parent: null,
    description: t('skill.shields.desc'),
  },
  defense: {
    id: 'defense',
    name: t('skill.defense.name'),
    level: 2,
    parent: 'shields',
    description: t('skill.defense.desc'),
  },
  catapult: {
    id: 'catapult',
    name: t('skill.catapult.name'),
    level: 2,
    parent: 'science',
    description: t('skill.catapult.desc'),
  },
  riding: {
    id: 'riding',
    name: t('skill.riding.name'),
    level: 1,
    parent: null,
    description: t('skill.riding.desc'),
  },
  bridges: {
    id: 'bridges',
    name: t('skill.bridges.name'),
    level: 2,
    parent: 'riding',
    description: t('skill.bridges.desc'),
  },
  knights: {
    id: 'knights',
    name: t('skill.knights.name'),
    level: 2,
    parent: 'riding',
    description: t('skill.knights.desc'),
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
