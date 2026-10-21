import { BUILDING_COSTS } from './economy/buildings';
import { BRIDGE_COST } from './economy/bridges';
import { STRUCTURE_UPKEEP, UNIVERSITY_UPKEEP } from './economy/capture';
import type { Resources } from './economy/resources';
import { ROAD_COST } from './economy/roads';
import { WALL_COST } from './economy/village';
import { HelpBuilding, WeatherType } from '@enums';

export interface HelpShortcut {
  keys: string;
  /** i18n key of what the keys do. */
  labelKey: string;
}

/** The keyboard shortcuts, in the order the Keyboard tab lists them. */
export const HELP_SHORTCUTS: readonly HelpShortcut[] = [
  { keys: '← ↑ ↓ →', labelKey: 'guide.key.arrows' },
  { keys: 'Shift + ←↑↓→', labelKey: 'guide.key.shiftArrows' },
  { keys: 'Enter / Space', labelKey: 'guide.key.space' },
  { keys: '← ↑ ↓ →', labelKey: 'guide.key.targetArrows' },
  { keys: 'Enter', labelKey: 'guide.key.targetEnter' },
  { keys: 'Space', labelKey: 'guide.key.targetExit' },
  { keys: 'Tab', labelKey: 'guide.key.tab' },
  { keys: '← →  Enter', labelKey: 'guide.key.tabArrows' },
  { keys: 'Ctrl + Enter', labelKey: 'guide.key.enter' },
  { keys: 'I', labelKey: 'guide.key.info' },
  { keys: 'S', labelKey: 'guide.key.skills' },
  { keys: 'A', labelKey: 'guide.key.achievements' },
  { keys: 'H', labelKey: 'guide.key.help' },
  { keys: 'Tab / Shift + Tab', labelKey: 'guide.key.helpTribe' },
  { keys: '← →', labelKey: 'guide.key.helpTabs' },
  { keys: 'Esc', labelKey: 'guide.key.esc' },
];

export interface HelpBuildingEntry {
  id: HelpBuilding;
  cost: Resources;
  /** Money per round the owner's village pays. */
  upkeep: number;
}

/** The Buildings tab, in listing order. Texts live under `guide.building.<id>.*`. */
export const HELP_BUILDINGS: readonly HelpBuildingEntry[] = [
  { id: HelpBuilding.SAWMILL, cost: BUILDING_COSTS.sawmill, upkeep: STRUCTURE_UPKEEP },
  { id: HelpBuilding.MINE, cost: BUILDING_COSTS.mine, upkeep: STRUCTURE_UPKEEP },
  { id: HelpBuilding.FARM, cost: BUILDING_COSTS.farm, upkeep: STRUCTURE_UPKEEP },
  { id: HelpBuilding.GRANARY, cost: BUILDING_COSTS.granary, upkeep: STRUCTURE_UPKEEP },
  { id: HelpBuilding.PORT, cost: BUILDING_COSTS.port, upkeep: 0 },
  { id: HelpBuilding.TEMPLE, cost: BUILDING_COSTS.temple, upkeep: 0 },
  { id: HelpBuilding.FOREST_TEMPLE, cost: BUILDING_COSTS.forestTemple, upkeep: 0 },
  { id: HelpBuilding.UNIVERSITY, cost: BUILDING_COSTS.university, upkeep: UNIVERSITY_UPKEEP },
  { id: HelpBuilding.WALL, cost: WALL_COST, upkeep: STRUCTURE_UPKEEP },
  { id: HelpBuilding.ROAD, cost: ROAD_COST, upkeep: STRUCTURE_UPKEEP },
  { id: HelpBuilding.BRIDGE, cost: BRIDGE_COST, upkeep: STRUCTURE_UPKEEP },
];

/** The Events tab, in listing order. Texts live under `guide.weather.<type>.*`. */
export const HELP_WEATHER: readonly WeatherType[] = [WeatherType.STORM, WeatherType.DROUGHT, WeatherType.EARTHQUAKE, WeatherType.LIGHTNING];
