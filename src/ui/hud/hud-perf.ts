import { Container } from 'pixi.js';
import { markDirty } from '../../render/render-gate';
import { perfStatsFor } from '../../render/perf-stats';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { makePanel } from '../kit/panel';

const PANEL_X = 6;
const PANEL_Y = 6;
const REFRESH_MS = 300;

/** Debug stats panel (F3): FPS, frame ms, GL draw calls (WebGL only), visible
 *  render-object and texture counts, and JS heap (Chromium only). Top-left,
 *  hidden until toggled, rebuilt at ~3 Hz from the shared `PerfStats`. */
export class HudPerf implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    el.eventMode = 'none';
    el.position.set(PANEL_X, PANEL_Y);
    root.addChild(el);
    this.el = el;
    this.el.visible = false;

    perfStatsFor(host.app).begin();
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F3') this.toggle();
    };
    window.addEventListener('keydown', this.onKey);
    this.timer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  private toggle(): void {
    if (!this.el) return;
    this.el.visible = !this.el.visible;
    if (this.el.visible) this.refresh();
  }

  private refresh(): void {
    if (!this.el || !this.host || !this.el.visible) return;
    markDirty();
    const snap = perfStatsFor(this.host.app).getSnapshot();
    const lines = [
      `fps ${snap.fps}   ${snap.frameMs.toFixed(1)} ms`,
      `draws ${snap.drawCalls === null ? 'n/a' : snap.drawCalls}`,
      `objs ${snap.renderObjects}`,
      `tex ${snap.textures}`,
    ];
    if (snap.heapMb !== null) lines.push(`heap ${snap.heapMb.toFixed(1)} MB`);

    this.el.removeChildren();
    const padSide = 6;
    const padTop = 4;
    let y = padTop;
    let widest = 0;
    for (const line of lines) {
      const label = makeLabel(line, { fontSize: 10, fill: 0xeeeeee });
      label.eventMode = 'none';
      label.position.set(padSide, y);
      this.el.addChild(label);
      widest = Math.max(widest, label.width);
      y += label.height + 1;
    }
    const panel = makePanel(widest + padSide * 2, y + 2, { radius: 3, fill: 0x0d0d1a, alpha: 0.85 });
    panel.eventMode = 'none';
    this.el.addChildAt(panel, 0);
  }

  destroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    if (this.host) perfStatsFor(this.host.app).stop();
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}