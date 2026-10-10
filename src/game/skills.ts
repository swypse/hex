import { t } from '../i18n';
import type { Player } from './players';
import type { GameMap } from './map/map-gen';
import { BuildingKind, SkillId } from '@enums';
import { pickRandom } from '../util/random';



interface SkillInfo {
  id: SkillId;
  name: string;
  level: number;
  parent: SkillId | null;
  description: string;
  /** A building the player must own for the skill to be opened (it stays open once bought). */
  requiresBuilding?: BuildingKind;
}

export const SKILLS: Record<SkillId, SkillInfo> = {
  climbing: {
    id: SkillId.CLIMBING,
    name: t('skill.climbing.name'),
    level: 1,
    parent: null,
    description: t('skill.climbing.desc'),
  },
  smithery: {
    id: SkillId.SMITHERY,
    name: t('skill.smithery.name'),
    level: 2,
    parent: SkillId.CLIMBING,
    description: t('skill.smithery.desc'),
  },
  swordsman: {
    id: SkillId.SWORDSMAN,
    name: t('skill.swordsman.name'),
    level: 2,
    parent: SkillId.CLIMBING,
    description: t('skill.swordsman.desc'),
  },
  geology: {
    id: SkillId.GEOLOGY,
    name: t('skill.geology.name'),
    level: 2,
    parent: SkillId.SCIENCE,
    description: t('skill.geology.desc'),
    requiresBuilding: BuildingKind.UNIVERSITY,
  },
  water: {
    id: SkillId.WATER,
    name: t('skill.water.name'),
    level: 1,
    parent: null,
    description: t('skill.water.desc'),
  },
  navigation: {
    id: SkillId.NAVIGATION,
    name: t('skill.navigation.name'),
    level: 2,
    parent: SkillId.WATER,
    description: t('skill.navigation.desc'),
  },
  waterTemples: {
    id: SkillId.WATER_TEMPLES,
    name: t('skill.waterTemples.name'),
    level: 2,
    parent: SkillId.WATER,
    description: t('skill.waterTemples.desc'),
  },
  forestry: {
    id: SkillId.FORESTRY,
    name: t('skill.forestry.name'),
    level: 1,
    parent: null,
    description: t('skill.forestry.desc'),
  },
  forestTemple: {
    id: SkillId.FOREST_TEMPLE,
    name: t('skill.forestTemple.name'),
    level: 2,
    parent: SkillId.FORESTRY,
    description: t('skill.forestTemple.desc'),
  },
  science: {
    id: SkillId.SCIENCE,
    name: t('skill.science.name'),
    level: 1,
    parent: null,
    description: t('skill.science.desc'),
  },
  roads: {
    id: SkillId.ROADS,
    name: t('skill.roads.name'),
    level: 2,
    parent: SkillId.FORESTRY,
    description: t('skill.roads.desc'),
  },
  shields: {
    id: SkillId.SHIELDS,
    name: t('skill.shields.name'),
    level: 1,
    parent: null,
    description: t('skill.shields.desc'),
  },
  defense: {
    id: SkillId.DEFENSE,
    name: t('skill.defense.name'),
    level: 2,
    parent: SkillId.SHIELDS,
    description: t('skill.defense.desc'),
  },
  catapult: {
    id: SkillId.CATAPULT,
    name: t('skill.catapult.name'),
    level: 2,
    parent: SkillId.SHIELDS,
    description: t('skill.catapult.desc'),
  },
  riding: {
    id: SkillId.RIDING,
    name: t('skill.riding.name'),
    level: 1,
    parent: null,
    description: t('skill.riding.desc'),
  },
  bridges: {
    id: SkillId.BRIDGES,
    name: t('skill.bridges.name'),
    level: 2,
    parent: SkillId.RIDING,
    description: t('skill.bridges.desc'),
  },
  knights: {
    id: SkillId.KNIGHTS,
    name: t('skill.knights.name'),
    level: 2,
    parent: SkillId.RIDING,
    description: t('skill.knights.desc'),
  },
  agriculture: {
    id: SkillId.AGRICULTURE,
    name: t('skill.agriculture.name'),
    level: 1,
    parent: null,
    description: t('skill.agriculture.desc'),
  },
  granary: {
    id: SkillId.GRANARY,
    name: t('skill.granary.name'),
    level: 2,
    parent: SkillId.AGRICULTURE,
    description: t('skill.granary.desc'),
  },
  agronomy: {
    id: SkillId.AGRONOMY,
    name: t('skill.agronomy.name'),
    level: 2,
    parent: SkillId.AGRICULTURE,
    description: t('skill.agronomy.desc'),
    requiresBuilding: BuildingKind.UNIVERSITY,
  },
  engineering: {
    id: SkillId.ENGINEERING,
    name: t('skill.engineering.name'),
    level: 2,
    parent: SkillId.SCIENCE,
    description: t('skill.engineering.desc'),
    requiresBuilding: BuildingKind.UNIVERSITY,
  },
  medicine: {
    id: SkillId.MEDICINE,
    name: t('skill.medicine.name'),
    level: 2,
    parent: SkillId.SCIENCE,
    description: t('skill.medicine.desc'),
    requiresBuilding: BuildingKind.UNIVERSITY,
  },
};

export function skillCost(id: SkillId, openedCount: number): number {
  return 3 * SKILLS[id].level + openedCount * 2;
}

export function hasSkill(player: Player, id: SkillId): boolean {
  return player.skills.includes(id);
}

/** Whether the player owns a building of `kind`. */
function ownsBuilding(map: Pick<GameMap, 'tiles'>, player: Player, kind: BuildingKind): boolean {
  return map.tiles.some((t) => t.building?.kind === kind && t.ownedBy === player.index);
}

/** Whether the skill's building requirement is met; skills with one need the map to know. */
export function skillBuildingMet(player: Player, id: SkillId, map?: Pick<GameMap, 'tiles'> | null): boolean {
  const kind = SKILLS[id].requiresBuilding;
  if (kind === undefined) return true;
  return map ? ownsBuilding(map, player, kind) : false;
}

export function canOpenSkill(player: Player, id: SkillId, map?: Pick<GameMap, 'tiles'> | null): boolean {
  if (hasSkill(player, id)) return false;
  const info = SKILLS[id];
  if (info.parent && !hasSkill(player, info.parent)) return false;
  if (!skillBuildingMet(player, id, map)) return false;
  return player.resources.money >= skillCost(id, player.skills.length);
}

export function openSkill(player: Player, id: SkillId, map?: Pick<GameMap, 'tiles'> | null): boolean {
  if (!canOpenSkill(player, id, map)) return false;
  player.resources.money -= skillCost(id, player.skills.length);
  player.skills.push(id);
  return true;
}

/** A random skill the player has not opened. Bonuses and bottles skip the parent
 *  requirement but not a building one: a skill that needs a university the
 *  player does not have is never picked. */
export function randomUnopenedSkill(player: Player, rng: () => number, map?: Pick<GameMap, 'tiles'> | null): SkillId | null {
  const opened = new Set(player.skills);
  const unopened = (Object.keys(SKILLS) as SkillId[]).filter((id) => !opened.has(id) && skillBuildingMet(player, id, map));
  if (unopened.length === 0) return null;
  return pickRandom(unopened, rng)!;
}
