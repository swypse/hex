import { t } from '../i18n';
import { TRIBE_COLORS } from '../config';
import { SkillId, UnitType } from '@enums';

export enum Tribe {
  Villagers,
  Warriors,
  Barbarians,
  Cats,
  Forest,
  Aqua,
  Sand,
}

export interface TribeInfo {
  id: Tribe;
  name: string;
  code: string;
  color: number;
  startMoneyBonus?: number;
  startSkill?: SkillId;
}

export const TRIBES: TribeInfo[] = [
  { id: Tribe.Cats, name: t('tribe.cats'), code: 'cats', color: TRIBE_COLORS.Cats, startSkill: SkillId.SHIELDS },
  { id: Tribe.Villagers, name: t('tribe.villagers'), code: 'villagers', color: TRIBE_COLORS.Villagers, startMoneyBonus: 8 },
  { id: Tribe.Warriors, name: t('tribe.warriors'), code: 'warriors', color: TRIBE_COLORS.Warriors, startSkill: SkillId.SWORDSMAN },
  { id: Tribe.Barbarians, name: t('tribe.barbarians'), code: 'barbarians', color: TRIBE_COLORS.Barbarians, startSkill: SkillId.CLIMBING },
  { id: Tribe.Forest, name: t('tribe.forest'), code: 'forest', color: TRIBE_COLORS.Forest, startSkill: SkillId.FORESTRY },
  { id: Tribe.Aqua, name: t('tribe.aqua'), code: 'aqua', color: TRIBE_COLORS.Aqua, startSkill: SkillId.NAVIGATION },
  { id: Tribe.Sand, name: t('tribe.sand'), code: 'sand', color: TRIBE_COLORS.Sand, startSkill: SkillId.RIDING },
];

export function tribeById(id: number): TribeInfo | undefined {
  return TRIBES.find((t) => t.id === id);
}

/** The single tribe-gate: each tribe's special unit, spawnable only by it.
 *  Special units have no skill requirement — the tribe itself is the gate. */
export const TRIBE_SPECIAL_UNIT: Record<Tribe, UnitType> = {
  [Tribe.Villagers]: UnitType.BUILDER,
  [Tribe.Warriors]: UnitType.BANNER,
  [Tribe.Barbarians]: UnitType.BERSERKER,
  [Tribe.Cats]: UnitType.STALKER,
  [Tribe.Forest]: UnitType.TRAPPER,
  [Tribe.Aqua]: UnitType.STORMCALLER,
  [Tribe.Sand]: UnitType.STUNNER,
};

export function specialUnitFor(tribe: Tribe): UnitType {
  return TRIBE_SPECIAL_UNIT[tribe];
}
