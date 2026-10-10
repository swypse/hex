import { describe, it, expect } from 'vitest';
import { SKILLS } from '../src/game/skills';
import { skillLayout } from '../src/ui/overlays/skill-tree';
import { SkillId } from '@enums';

describe('skill tree layout', () => {
  const layout = skillLayout();

  it('places every child farther from the center than its parent', () => {
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const parent = SKILLS[id].parent;
      if (!parent) continue;
      expect(layout[id].radius).toBeGreaterThan(layout[parent].radius);
    }
  });

  const CX = 400;
  const CY = 340;
  const centerAngle = (id: SkillId): number => Math.atan2(layout[id].y - CY, layout[id].x - CX);

  it('spaces the root skills evenly', () => {
    const roots = (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].parent === null);
    expect(roots.length).toBe(7);
    const angles = roots.map(centerAngle).sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!;
      const b = angles[(i + 1) % angles.length]!;
      const gap = i === angles.length - 1 ? angles[0]! + 2 * Math.PI - a : b - a;
      expect(gap).toBeCloseTo((2 * Math.PI) / roots.length, 5);
    }
  });

  it('sits every parent at the center of its children span', () => {
    const childIds = (id: SkillId): SkillId[] =>
      (Object.keys(SKILLS) as SkillId[]).filter((k) => SKILLS[k].parent === id);
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const kids = childIds(id);
      if (kids.length === 0) continue;
      const a = centerAngle(id);
      // Circular mean of the children's angles (robust to the ±π wrap).
      const mid = Math.atan2(
        kids.reduce((sum, k) => sum + Math.sin(centerAngle(k)), 0),
        kids.reduce((sum, k) => sum + Math.cos(centerAngle(k)), 0),
      );
      expect(Math.cos(a - mid)).toBeCloseTo(1, 5);
    }
  });

  it('places the catapult skill on the second ring as a child of shields', () => {
    expect(layout.catapult.depth).toBe(2);
    expect(layout.catapult.radius).toBeGreaterThan(layout.shields.radius);
  });

  it('keeps every pair of second-ring skills at least 100px apart (science has three children)', () => {
    const ring2 = (Object.keys(SKILLS) as SkillId[]).filter((id) => layout[id].depth === 2);
    let closest = Infinity;
    for (let i = 0; i < ring2.length; i++) {
      for (let j = i + 1; j < ring2.length; j++) {
        const a = layout[ring2[i]!];
        const b = layout[ring2[j]!];
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    expect(closest).toBeGreaterThanOrEqual(100);
  });

  it('does not intersect parent-child edges', () => {
    const edges = (Object.keys(SKILLS) as SkillId[])
      .filter((id) => SKILLS[id].parent !== null)
      .map((id) => ({ a: layout[SKILLS[id].parent!], b: layout[id] }));
    const cross = (
      ax: number, ay: number, bx: number, by: number,
      cx: number, cy: number, dx: number, dy: number,
    ): boolean =>
      ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * ((bx - ax) * (dy - ay) - (by - ay) * (dx - ax)) < 0 &&
      ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) * ((dx - cx) * (by - cy) - (dy - cy) * (bx - cx)) < 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i]!;
        const e2 = edges[j]!;
        const sharesVertex =
          (e1.a.x === e2.a.x && e1.a.y === e2.a.y) ||
          (e1.a.x === e2.b.x && e1.a.y === e2.b.y) ||
          (e1.b.x === e2.a.x && e1.b.y === e2.a.y) ||
          (e1.b.x === e2.b.x && e1.b.y === e2.b.y);
        if (sharesVertex) continue;
        expect(
          cross(e1.a.x, e1.a.y, e1.b.x, e1.b.y, e2.a.x, e2.a.y, e2.b.x, e2.b.y),
          `edges intersect`,
        ).toBe(false);
      }
    }
  });
});
