import { describe, it, expect } from 'vitest';
import { SKILLS, type SkillId } from '../src/game/skills';
import { skillLayout } from '../src/ui/overlays/SkillTree';

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

  it('spaces the six root skills evenly at 60 degrees', () => {
    const roots = (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].parent === null);
    expect(roots.length).toBe(6);
    const angles = roots.map(centerAngle).sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!;
      const b = angles[(i + 1) % angles.length]!;
      const gap = i === angles.length - 1 ? angles[0]! + 2 * Math.PI - a : b - a;
      expect(gap).toBeCloseTo((2 * Math.PI) / 6, 5);
    }
  });

  it('sits every parent at the center of its children span', () => {
    const childIds = (id: SkillId): SkillId[] =>
      (Object.keys(SKILLS) as SkillId[]).filter((k) => SKILLS[k].parent === id);
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const kids = childIds(id);
      if (kids.length === 0) continue;
      const a = centerAngle(id);
      const childAngles = kids.map(centerAngle).sort((x, y) => x - y);
      const mid = (childAngles[0]! + childAngles[childAngles.length - 1]!) / 2;
      expect(a).toBeCloseTo(mid, 5);
    }
  });

  it('places the catapult skill on the second ring as a child of science', () => {
    expect(layout.catapult.depth).toBe(2);
    expect(layout.catapult.radius).toBeGreaterThan(layout.science.radius);
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
