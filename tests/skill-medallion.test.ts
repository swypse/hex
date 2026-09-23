import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { makeSkillMedallion } from '../src/ui/kit/skill-medallion';

describe('makeSkillMedallion', () => {
  function shapes(el: Container): Graphics[] {
    return el.children.filter((c): c is Graphics => c instanceof Graphics);
  }

  it('omits the price/checkmark badge circle when the skill is opened', () => {
    const opened = makeSkillMedallion({ skill: 'science', opened: true, priceText: '\u2713' });
    // The badge is the second Graphics child (background is the first); a
    // plain opened, no  price circle, medallion has only the background.
    const badge = shapes(opened).slice(1);
    expect(badge).toEqual([]);
  });

  it('keeps the price badge circle when the skill is closed', () => {
    const closed = makeSkillMedallion({ skill: 'science', opened: false, priceText: '6' });
    expect(shapes(closed).length).toBe(2);
  });
});