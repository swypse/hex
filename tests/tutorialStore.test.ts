import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';

describe('tutorial store fields', () => {
  it('defaults to inactive', () => {
    const s = useGameStore.getState();
    expect(s.tutorial).toBe(false);
    expect(s.tutorialStep).toBeNull();
    expect(s.tutorialHighlightSkills).toEqual([]);
    expect(s.tutorialHighlightEndTurn).toBe(false);
  });

  it('persists tutorial state and highlight setters', () => {
    const s = useGameStore.getState();
    s.setTutorial(true);
    s.setTutorialStep('moveUnit');
    s.setTutorialHighlightSkills(['forestry']);
    s.setTutorialHighlightEndTurn(true);
    const t = useGameStore.getState();
    expect(t.tutorial).toBe(true);
    expect(t.tutorialStep).toBe('moveUnit');
    expect(t.tutorialHighlightSkills).toEqual(['forestry']);
    expect(t.tutorialHighlightEndTurn).toBe(true);
    s.setTutorial(false);
    s.setTutorialStep(null);
    s.setTutorialHighlightSkills([]);
    s.setTutorialHighlightEndTurn(false);
  });
});

describe('gameController tutorial API', () => {
  it('exposes tutorial entry/exit methods', () => {
    expect(typeof gameController.startTutorial).toBe('function');
    expect(typeof gameController.tutorialWelcomeClosed).toBe('function');
    expect(typeof gameController.exitTutorial).toBe('function');
  });
});
