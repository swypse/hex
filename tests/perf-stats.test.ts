import { describe, it, expect } from 'vitest';
import { Container, Sprite } from 'pixi.js';
import { countRenderObjects, summarizeFrameTimes, wrapGlDrawCalls, type GlDrawCallContext } from '../src/render/perf-stats';

describe('countRenderObjects', () => {
  it('counts visible renderables including the root and containers', () => {
    const root = new Container();
    root.addChild(new Sprite(), new Container());
    expect(countRenderObjects(root)).toBe(3);
  });

  it('skips invisible subtrees entirely', () => {
    const root = new Container();
    const hidden = new Container();
    hidden.visible = false;
    hidden.addChild(new Sprite());
    root.addChild(hidden, new Sprite());
    expect(countRenderObjects(root)).toBe(2);
  });

  it('walks nested descendants', () => {
    const root = new Container();
    const a = new Container();
    a.addChild(new Sprite());
    const b = new Container();
    const inner = new Container();
    inner.addChild(new Sprite());
    b.addChild(inner);
    root.addChild(a, b);
    expect(countRenderObjects(root)).toBe(6);
  });

  it('counts an empty root as one', () => {
    expect(countRenderObjects(new Container())).toBe(1);
  });
});

describe('summarizeFrameTimes', () => {
  it('averages frame ms and derives fps from per-frame deltas', () => {
    const out = summarizeFrameTimes([16.6, 16.7, 16.8]);
    expect(out.frameMs).toBeCloseTo(16.7, 1);
    expect(out.fps).toBeCloseTo(1000 / 16.7, 0);
  });

  it('returns zeros for an empty window', () => {
    expect(summarizeFrameTimes([])).toEqual({ fps: 0, frameMs: 0 });
  });

  it('ignores non-positive deltas', () => {
    expect(summarizeFrameTimes([16.6, 0, -1])).toEqual({ fps: 1000 / 16.6, frameMs: 16.6 });
  });
});

describe('wrapGlDrawCalls', () => {
  function fakeGl(): GlDrawCallContext & { callLog: string[] } {
    const callLog: string[] = [];
    return {
      callLog,
      drawArrays: () => void callLog.push('arrays'),
      drawElements: () => void callLog.push('elements'),
    };
  }

  it('counts wrapped drawArrays and drawElements calls', () => {
    const gl = fakeGl();
    const counter = wrapGlDrawCalls(gl);
    gl.drawArrays(4, 0, 6);
    gl.drawElements(4, 6, 5121, 0);
    gl.drawArrays(4, 0, 3);
    expect(counter.count).toBe(3);
    expect(gl.callLog).toEqual(['arrays', 'elements', 'arrays']);
  });

  it('restore puts the original methods back and stops counting', () => {
    const gl = fakeGl();
    const counter = wrapGlDrawCalls(gl);
    gl.drawArrays(4, 0, 3);
    expect(counter.count).toBe(1);
    counter.restore();
    gl.drawArrays(4, 0, 3);
    gl.drawElements(4, 3, 5121, 0);
    expect(counter.count).toBe(1);
    expect(gl.callLog).toHaveLength(3);
  });

  it('wrap is idempotent on the same context', () => {
    const gl = fakeGl();
    const first = wrapGlDrawCalls(gl);
    const second = wrapGlDrawCalls(gl);
    gl.drawArrays(4, 0, 3);
    expect(first.count).toBe(1);
    expect(second.count).toBe(1);
    second.restore();
    first.restore();
  });

  it('re-wraps and counts again after a restore (remount cycle)', () => {
    const gl = fakeGl();
    const first = wrapGlDrawCalls(gl);
    gl.drawArrays(4, 0, 3);
    expect(first.count).toBe(1);
    first.restore();

    // The counter is cumulative per context; consumers take deltas.
    const second = wrapGlDrawCalls(gl);
    gl.drawArrays(4, 0, 3);
    gl.drawElements(4, 3, 5121, 0);
    expect(second.count).toBe(3);
    second.restore();
    gl.drawArrays(4, 0, 3);
    expect(second.count).toBe(3);
  });
});