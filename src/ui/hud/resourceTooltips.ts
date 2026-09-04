export interface ResourceTooltipInfo {
  name: string;
  requiredFor: string;
}

export const RESOURCE_TOOLTIPS: Record<'money' | 'wood' | 'stone' | 'ore', ResourceTooltipInfo> = {
  money: { name: 'Money', requiredFor: 'spawning units, upgrading villages, building factories, mines and ports, opening skills, and upgrading ships.' },
  wood: { name: 'Wood', requiredFor: 'upgrading villages, building ports and roads, and upgrading ships.' },
  stone: { name: 'Stone', requiredFor: 'upgrading villages and building roads.' },
  ore: { name: 'Ore', requiredFor: 'spawning swordsmen, building ports, and upgrading ships to level 3.' },
};
