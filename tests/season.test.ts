import { describe, it, expect } from 'vitest';
import { seasonForTurn, seasonTurn, SEASON_LENGTH } from '../src/game/season';
import { Season } from '@enums';

describe('seasonForTurn', () => {
  it('starts in spring and lasts 6 turns per season', () => {
    expect(SEASON_LENGTH).toBe(6);
    expect(seasonForTurn(1)).toBe(Season.SPRING);
    expect(seasonForTurn(6)).toBe(Season.SPRING);
    expect(seasonForTurn(7)).toBe(Season.SUMMER);
    expect(seasonForTurn(12)).toBe(Season.SUMMER);
    expect(seasonForTurn(13)).toBe(Season.AUTUMN);
    expect(seasonForTurn(19)).toBe(Season.WINTER);
    expect(seasonForTurn(24)).toBe(Season.WINTER);
  });

  it('counts the turn within the season', () => {
    expect([1, 2, 6, 7, 12, 13, 24, 25].map(seasonTurn)).toEqual([1, 2, 6, 1, 6, 1, 6, 1]);
  });

  it('cycles back to spring after winter', () => {
    expect(seasonForTurn(25)).toBe(Season.SPRING);
    expect(seasonForTurn(31)).toBe(Season.SUMMER);
  });
});
