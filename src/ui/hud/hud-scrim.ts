import { Container, FillGradient, Graphics } from 'pixi.js';
import { type UIHost, type Widget } from '../host';

/** Height of the full-width top/bottom scrim band. */
const SCENIC_BAND_H = 70;

export interface HudScrimOptions {
  /** 'top' fades opaque→transparent downward; 'bottom' is the mirror. */
  side?: 'top' | 'bottom';
}

/** Full-width edge scrim: black α=1 at the very edge of the screen fading to
 *  transparent away from it (the bottom scrim is mirrored: transparent at its
 *  top, opaque at the screen edge). Mounted FIRST in the game HUD so it
 *  renders above the map and every tile but below all HUD widgets (resource
 *  panel, player icons, scores, turn bar). Non-interactive. */
export class HudScrim implements Widget {
  private readonly side: 'top' | 'bottom';
  private el: Graphics | null = null;
  private host: UIHost | null = null;
  private onResize: (() => void) | null = null;
  private gradient: FillGradient | null = null;

  constructor(opts: HudScrimOptions = {}) {
    this.side = opts.side ?? 'top';
  }

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const band = new Graphics();
    band.eventMode = 'none';
    root.addChild(band);
    this.el = band;
    this.layout();
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const screenW = this.host.app.screen.width;
    const screenH = this.host.app.screen.height;
    this.el.clear();
    this.gradient?.destroy();
    // Fade from 0.8 alpha at the screen edge to fully transparent away from it.
    // One gradient fill (rather than stacked alpha-stepped rects) so the fade
    // is smooth with no visible banding lines.
    const edge = this.side === 'top' ? 0.8 : 0;
    const away = this.side === 'top' ? 0 : 0.8;
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: SCENIC_BAND_H },
      colorStops: [
        { offset: 0, color: [0, 0, 0, edge] },
        { offset: 1, color: [0, 0, 0, away] },
      ],
      textureSpace: 'global',
    });
    this.el.rect(0, 0, screenW, SCENIC_BAND_H).fill(gradient);
    this.gradient = gradient;
    this.el.position.set(0, this.side === 'top' ? 0 : screenH - SCENIC_BAND_H);
  };

  destroy(): void {
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.onResize = null;
    this.gradient?.destroy();
    this.gradient = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}