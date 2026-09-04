import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/game/skills';
import { buildTutorialMap, TUTORIAL_RADIUS } from '../src/game/tutorial/tutorialMap';
import { STEP_ORDER, STEP_CONFIG, skillPulseStep, stepCounter, type TutorialStepDef } from '../src/game/tutorial/tutorialSteps';

const markerExists = (map: ReturnType<typeof buildTutorialMap>, m: { q: number; r: number }): boolean =>
  map.tiles.some((t) => t.q === m.q && t.r === m.r);

describe('tutorial steps', () => {
  it('orders all steps from welcome to end without duplication', () => {
    expect(STEP_ORDER[0]).toBe('welcome');
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe('end');
    expect(new Set(STEP_ORDER).size).toBe(STEP_ORDER.length);
  });

  it('orders all steps from welcome to end and includes the naval segment', () => {
    expect(STEP_ORDER[0]).toBe('welcome');
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe('end');
    expect(new Set(STEP_ORDER).size).toBe(STEP_ORDER.length);
    const naval = ['upgradeVillage3', 'openWaterNavigation', 'buildPort', 'boardShip', 'upgradeShip', 'attackEnemyShip'];
    for (const id of naval) expect(STEP_ORDER).toContain(id);
    // Naval steps sit between the archer attack and the end.
    expect(STEP_ORDER.indexOf('attackEnemy')).toBeLessThan(STEP_ORDER.indexOf('upgradeVillage3'));
    expect(STEP_ORDER.indexOf('attackEnemyShip')).toBeLessThan(STEP_ORDER.indexOf('end'));
  });

  it('configures the naval steps with toolbar keys and skill highlights', () => {
    expect(STEP_CONFIG.upgradeVillage3.toolbarKey).toBe('upgrade');
    expect(STEP_CONFIG.buildPort.toolbarKey).toBe('port');
    expect(STEP_CONFIG.upgradeShip.toolbarKey).toBe('upgrade-ship');
    expect(STEP_CONFIG.openWaterNavigation.highlightSkills).toEqual(['water', 'navigation']);
    expect(STEP_CONFIG.boardShip.markers).toEqual([{ q: 1, r: 0 }]);
  });

  it('gives every step a config with heading, body text and a button label', () => {
    for (const id of STEP_ORDER) {
      const def: TutorialStepDef = STEP_CONFIG[id];
      expect(def.id).toBe(id);
      expect(def.heading.length).toBeGreaterThan(0);
      expect(def.text.length).toBeGreaterThan(0);
      // Dialog steps need a button; banner steps do not.
      if (def.dialog) expect(def.buttonLabel.length).toBeGreaterThan(0);
      else expect(def.buttonLabel).toBe('');
    }
  });

  it('points every marker at an existing map tile', () => {
    const map = buildTutorialMap();
    for (const id of STEP_ORDER) {
      for (const m of STEP_CONFIG[id].markers) expect(markerExists(map, m)).toBe(true);
    }
  });

  it('only highlights existing skill ids', () => {
    for (const id of STEP_ORDER) {
      for (const s of STEP_CONFIG[id].highlightSkills) expect(SKILLS[s]).toBeDefined();
    }
  });

  it('highlights forestry during openForestry and climbing+smithery during openClimbingSmithery', () => {
    expect(STEP_CONFIG.openForestry.highlightSkills).toEqual(['forestry']);
    expect(STEP_CONFIG.openClimbingSmithery.highlightSkills).toEqual(['climbing', 'smithery']);
  });

  it('drives the skills-button pulse from the skill steps only', () => {
    expect(skillPulseStep('openForestry')).toBe(true);
    expect(skillPulseStep('openClimbingSmithery')).toBe(true);
    expect(skillPulseStep('openWaterNavigation')).toBe(true);
    for (const id of STEP_ORDER) {
      if (id !== 'openForestry' && id !== 'openClimbingSmithery' && id !== 'openWaterNavigation') {
        expect(skillPulseStep(id)).toBe(false);
      }
    }
  });

  it('keeps tutorial marker coords inside the map disc', () => {
    for (const id of STEP_ORDER) {
      for (const m of STEP_CONFIG[id].markers) {
        expect(Math.max(Math.abs(m.q), Math.abs(m.r), Math.abs(m.q + m.r))).toBeLessThanOrEqual(TUTORIAL_RADIUS);
      }
    }
  });

  it('numbers every message heading with a [N/M] counter', () => {
    expect(stepCounter('welcome')).toBe(`[1/${STEP_ORDER.length}]`);
    expect(stepCounter('end')).toBe(`[${STEP_ORDER.length}/${STEP_ORDER.length}]`);
    expect(stepCounter('buildSawmill')).toBe(`[7/${STEP_ORDER.length}]`);
    const counted = STEP_ORDER.map((id) => stepCounter(id));
    expect(new Set(counted).size).toBe(STEP_ORDER.length);
  });
});
