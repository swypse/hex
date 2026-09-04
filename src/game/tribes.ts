import { t } from '../i18n';
import { TRIBE_COLORS } from '../config';
import { SkillId } from './skills';

export enum Tribe {
  Villagers,
  Warriors,
  Barbarians,
  Cats,
  Forest,
  Aqua,
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
  { id: Tribe.Villagers, name: t('tribe.villagers'), code: 'villagers', color: TRIBE_COLORS.Villagers, startMoneyBonus: 10 },
  { id: Tribe.Warriors, name: t('tribe.warriors'), code: 'warriors', color: TRIBE_COLORS.Warriors, startSkill: 'swordsman' },
  { id: Tribe.Barbarians, name: t('tribe.barbarians'), code: 'barbarians', color: TRIBE_COLORS.Barbarians, startSkill: 'climbing' },
  { id: Tribe.Forest, name: t('tribe.forest'), code: 'forest', color: TRIBE_COLORS.Forest, startSkill: 'forestry' },
  { id: Tribe.Aqua, name: t('tribe.aqua'), code: 'aqua', color: TRIBE_COLORS.Aqua, startSkill: 'navigation' },
];
