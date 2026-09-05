import type { SkillId } from '../skills';
import { TUTORIAL_CAPITAL, TUTORIAL_PORT_TILE } from './tutorialMap';

export type TutorialStepId =
  | 'welcome'
  | 'moveUnit'
  | 'upgradeVillage'
  | 'openForestry'
  | 'endTurn1'
  | 'endTurn2'
  | 'buildSawmill'
  | 'openClimbingSmithery'
  | 'buildMine'
  | 'spawnArcher'
  | 'attackEnemy'
  | 'upgradeVillage3'
  | 'openWaterNavigation'
  | 'buildPort'
  | 'boardShip'
  | 'upgradeShip'
  | 'attackEnemyShip'
  | 'collectBonus'
  | 'approachFreeVillage'
  | 'captureFreeVillage'
  | 'end';

export interface TutorialStepDef {
  id: TutorialStepId;
  heading: string;
  text: string;
  markers: { q: number; r: number }[];
  highlightSkills: SkillId[];
  highlightEndTurn: boolean;
  pulseSkillsButton: boolean;
  /** Toolbar action key (see ToolbarSpec.key) to pulse, if any. */
  toolbarKey?: string;
  /** Rendered as a blocking dialog (welcome/end) rather than a banner. */
  dialog: boolean;
  /** Label for the dialog button; not used for banners. */
  buttonLabel: string;
}

export const STEP_ORDER: TutorialStepId[] = [
  'welcome',
  'moveUnit',
  'upgradeVillage',
  'openForestry',
  'endTurn1',
  'endTurn2',
  'buildSawmill',
  'openClimbingSmithery',
  'buildMine',
  'spawnArcher',
  'attackEnemy',
  'upgradeVillage3',
  'openWaterNavigation',
  'buildPort',
  'boardShip',
  'upgradeShip',
  'attackEnemyShip',
  'collectBonus',
  'approachFreeVillage',
  'captureFreeVillage',
  'end',
];

const CAPITAL = { ...TUTORIAL_CAPITAL };
const PORT_TILE = { ...TUTORIAL_PORT_TILE };

export const STEP_CONFIG: Record<TutorialStepId, TutorialStepDef> = {
  welcome: {
    id: 'welcome',
    heading: 'Welcome to the Hex tutorial',
    text: 'Welcome to the Hex demo. This tutorial teaches you the basics: move a unit, upgrade your village, collect income each turn, research skills, build a sawmill and a mine, spawn an archer, and fight an enemy. Follow each instruction; your current objective is shown at the top of the screen.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: true,
    buttonLabel: 'Continue',
  },
  moveUnit: {
    id: 'moveUnit',
    heading: 'Move your Warrior',
    text: 'Select your Warrior (it is already selected) and click a highlighted tile to move it to a new hex.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  upgradeVillage: {
    id: 'upgradeVillage',
    heading: 'Upgrade your village',
    text: 'Click your village, then press the pulsing Upgrade button (2 wood + 1 stone + 2 money). Each level raises its income, territory and unit capacity.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'upgrade',
    dialog: false,
    buttonLabel: '',
  },
  openForestry: {
    id: 'openForestry',
    heading: 'Open the Forestry skill',
    text: 'You need wood to build. Open the skill tree (the pulsing skills button, bottom right) and open the Forestry skill. It lets you build sawmills next to forests.',
    markers: [],
    highlightSkills: ['forestry'],
    highlightEndTurn: false,
    pulseSkillsButton: true,
    dialog: false,
    buttonLabel: '',
  },
  endTurn1: {
    id: 'endTurn1',
    heading: 'End your turn',
    text: 'You are done with this turn. Press the highlighted End Turn button.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: true,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  endTurn2: {
    id: 'endTurn2',
    heading: 'Income is collected each turn',
    text: 'Money is collected each turn: every village pays 3 + its level, minus 1 for each unit above its capacity. Your upgraded village just earned you money. Press End Turn again to collect another turn of income.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: true,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  buildSawmill: {
    id: 'buildSawmill',
    heading: 'Build a sawmill',
    text: 'Select the highlighted tile beside the forest and press the pulsing Build sawmill button (10 money). Sawmills produce +1 wood per adjacent forest each turn.',
    markers: [{ q: 0, r: 1 }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'sawmill',
    dialog: false,
    buttonLabel: '',
  },
  openClimbingSmithery: {
    id: 'openClimbingSmithery',
    heading: 'Research Climbing and Smithery',
    text: 'You will need stone and ore for mines and stronger units. Open the skill tree and research Climbing, then its child Smithery. Both nodes are highlighted.',
    markers: [],
    highlightSkills: ['climbing', 'smithery'],
    highlightEndTurn: false,
    pulseSkillsButton: true,
    dialog: false,
    buttonLabel: '',
  },
  buildMine: {
    id: 'buildMine',
    heading: 'Build a mine',
    text: 'Select the highlighted mountain and press the pulsing Build mine button (15 money). Mines produce 1 stone and 1 ore each turn.',
    markers: [{ q: 2, r: -2 }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'mine',
    dialog: false,
    buttonLabel: '',
  },
  spawnArcher: {
    id: 'spawnArcher',
    heading: 'Spawn an Archer',
    text: 'Select your village and press Spawn, then choose the Archer (6 money). Archers attack from up to 2 hexes away.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  attackEnemy: {
    id: 'attackEnemy',
    heading: 'Attack the enemy Warrior',
    text: 'An enemy Warrior appeared three hexes away. Your fresh Archer cannot act until next turn, so end your turn to let it act — the enemy will not move. Then move your Archer to within 2 hexes and click the enemy to attack it.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  upgradeVillage3: {
    id: 'upgradeVillage3',
    heading: 'Upgrade your village again',
    text: 'Your village is at its building limit. Select it and press the pulsing Upgrade button (4 wood + 2 stone + 4 money) to reach level 3 and make room for a port.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'upgrade',
    dialog: false,
    buttonLabel: '',
  },
  openWaterNavigation: {
    id: 'openWaterNavigation',
    heading: 'Open the Water and Navigation skills',
    text: 'You need Water, then Navigation, to build a port and sail. Open the skill tree and research both — the nodes are highlighted.',
    markers: [],
    highlightSkills: ['water', 'navigation'],
    highlightEndTurn: false,
    pulseSkillsButton: true,
    dialog: false,
    buttonLabel: '',
  },
  buildPort: {
    id: 'buildPort',
    heading: 'Build a port',
    text: 'Select the highlighted water tile next to your village and press the pulsing Build port button (10 wood + 30 money + 2 ore).',
    markers: [PORT_TILE],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'port',
    dialog: false,
    buttonLabel: '',
  },
  boardShip: {
    id: 'boardShip',
    heading: 'Turn a unit into a ship',
    text: 'Move your Warrior onto the port to turn it into a ship. Ships sail on water and can move then attack in the same turn.',
    markers: [PORT_TILE],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  upgradeShip: {
    id: 'upgradeShip',
    heading: 'Upgrade your ship',
    text: 'Select your ship and press the pulsing Upgrade Ship button (8 money + 4 wood). Level-2 ships move farther.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    toolbarKey: 'upgrade-ship',
    dialog: false,
    buttonLabel: '',
  },
  attackEnemyShip: {
    id: 'attackEnemyShip',
    heading: 'Sail and attack the enemy ship',
    text: 'An enemy ship appeared on the sea. If your ship cannot act yet, end your turn. Then sail within range and click the enemy ship to attack — it will not move.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  collectBonus: {
    id: 'collectBonus',
    heading: 'Collect a bonus',
    text: 'Bonus markers are scattered across the map. Move one of your units onto the glowing bonus, then press End your turn. On the next turn a "Get the bonus" button appears — press it to collect rewards such as money or resources.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  approachFreeVillage: {
    id: 'approachFreeVillage',
    heading: 'Claim an empty village',
    text: 'An unclaimed village appeared next to your unit. Move that unit onto the village — if it already acted this turn, press End your turn first so it can move.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  captureFreeVillage: {
    id: 'captureFreeVillage',
    heading: 'Capture the empty village',
    text: 'Press End your turn so the village becomes capturable, then select it and press the Capture button. Villages expand your income and unit capacity.',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: false,
    buttonLabel: '',
  },
  end: {
    id: 'end',
    heading: 'Basic tutorial complete',
    text: 'You now know how to move, upgrade, build, research and fight. Good luck in the real game!',
    markers: [],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
    dialog: true,
    buttonLabel: 'Return to main menu',
  },
};

export function skillPulseStep(step: TutorialStepId | null): boolean {
  return step === 'openForestry' || step === 'openClimbingSmithery' || step === 'openWaterNavigation';
}

/** "[N/M]" counter where N is the 1-based step index and M is the total
 * number of tutorial messages. */
export function stepCounter(step: TutorialStepId): string {
  return `[${STEP_ORDER.indexOf(step) + 1}/${STEP_ORDER.length}]`;
}
