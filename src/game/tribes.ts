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
  { id: Tribe.Cats, name: 'Cats', code: 'cats', color: TRIBE_COLORS.Cats, startSkill: 'shields' },
  { id: Tribe.Villagers, name: 'Villagers', code: 'villagers', color: TRIBE_COLORS.Villagers, startMoneyBonus: 10 },
  { id: Tribe.Warriors, name: 'Warriors', code: 'warriors', color: TRIBE_COLORS.Warriors, startSkill: 'swordsman' },
  { id: Tribe.Barbarians, name: 'Barbarians', code: 'barbarians', color: TRIBE_COLORS.Barbarians, startSkill: 'climbing' },
  { id: Tribe.Forest, name: 'Forest people', code: 'forest', color: TRIBE_COLORS.Forest, startSkill: 'forestry' },
  { id: Tribe.Aqua, name: 'Aqua people', code: 'aqua', color: TRIBE_COLORS.Aqua, startSkill: 'navigation' },
];
