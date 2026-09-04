import type { SkillId } from '../skills';
import { TUTORIAL_CAPITAL } from './tutorialMap';

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
  | 'end';

export interface TutorialStepDef {
  id: TutorialStepId;
  heading: string;
  text: string;
  markers: { q: number; r: number }[];
  highlightSkills: SkillId[];
  highlightEndTurn: boolean;
  pulseSkillsButton: boolean;
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
  'end',
];

const CAPITAL = { ...TUTORIAL_CAPITAL };

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
    text: 'Click your village, then press Upgrade (2 wood + 1 stone + 2 money). Each level raises its income, territory and unit capacity.',
    markers: [CAPITAL],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
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
    text: 'Select the highlighted tile beside the forest and press Build sawmill (10 money). Sawmills produce +1 wood per adjacent forest each turn.',
    markers: [{ q: 0, r: 1 }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
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
    text: 'Select the highlighted mountain and press Build mine (15 money). Mines produce 1 stone and 1 ore each turn.',
    markers: [{ q: 2, r: -2 }],
    highlightSkills: [],
    highlightEndTurn: false,
    pulseSkillsButton: false,
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
  return step === 'openForestry' || step === 'openClimbingSmithery';
}
