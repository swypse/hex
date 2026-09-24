import { t } from '../i18n';
import { TRIBE_COLORS } from '../config';
import { SkillId } from './skills';
import type { UnitType } from './units';

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
  { id: Tribe.Cats, name: t('tribe.cats'), code: 'cats', color: TRIBE_COLORS.Cats, startSkill: 'shields' },
  { id: Tribe.Villagers, name: t('tribe.villagers'), code: 'villagers', color: TRIBE_COLORS.Villagers, startMoneyBonus: 8 },
  { id: Tribe.Warriors, name: t('tribe.warriors'), code: 'warriors', color: TRIBE_COLORS.Warriors, startSkill: 'swordsman' },
  { id: Tribe.Barbarians, name: t('tribe.barbarians'), code: 'barbarians', color: TRIBE_COLORS.Barbarians, startSkill: 'climbing' },
  { id: Tribe.Forest, name: t('tribe.forest'), code: 'forest', color: TRIBE_COLORS.Forest, startSkill: 'forestry' },
  { id: Tribe.Aqua, name: t('tribe.aqua'), code: 'aqua', color: TRIBE_COLORS.Aqua, startSkill: 'navigation' },
  { id: Tribe.Sand, name: t('tribe.sand'), code: 'sand', color: TRIBE_COLORS.Sand, startSkill: 'riding' },
];

export function tribeById(id: number): TribeInfo | undefined {
  return TRIBES.find((t) => t.id === id);
}

/** The single tribe-gate: each tribe's special unit, spawnable only by it.
 *  Special units have no skill requirement — the tribe itself is the gate. */
export const TRIBE_SPECIAL_UNIT: Record<Tribe, UnitType> = {
  [Tribe.Villagers]: 'builder',
  [Tribe.Warriors]: 'banner',
  [Tribe.Barbarians]: 'berserker',
  [Tribe.Cats]: 'stalker',
  [Tribe.Forest]: 'trapper',
  [Tribe.Aqua]: 'stormcaller',
  [Tribe.Sand]: 'stunner',
};

export function specialUnitFor(tribe: Tribe): UnitType {
  return TRIBE_SPECIAL_UNIT[tribe];
}
