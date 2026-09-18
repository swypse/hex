import { Container, Graphics } from 'pixi.js';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { IconButton } from '../kit/icon-button';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/action-button-icons';
import { skillPulseStep } from '../../game/tutorial/tutorial-steps';
import { SKILLS_BUTTON_SIZE, scoreButtonsPosition, SCORE_ACTION_BG, SCORE_ACTION_BG_ACTIVE } from '../layout';
import { activeBuffs } from '../../game/buffs';
import { gameController } from '../../controller/game-controller';

export class HudSkills implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private onResize: (() => void) | null = null;
  private unsub: (() => void) | null = null;
  private pulse: Graphics | null = null;
  private stopSkillsPulse: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const btn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['skills']!,
      size: SKILLS_BUTTON_SIZE,
      color: SCORE_ACTION_BG,
      hoverColor: SCORE_ACTION_BG_ACTIVE,
      pressedColor: SCORE_ACTION_BG_ACTIVE,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'skill' }),
      iconFactory: makeActionButtonIcon,
    });
    btn.position.set(0, 0);
    el.addChild(btn);
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => {
      this.layout();
      this.update();
    });
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = scoreButtonsPosition(this.host.app.screen.width, this.host.app.screen.height, this.buffCount()).skills;
    this.el.position.set(pos.x, pos.y);
  };

  private buffCount(): number {
    const map = gameController.getMap();
    if (!map) return 0;
    const s = useGameStore.getState();
    return activeBuffs(map, s.localPlayerIndex).length;
  }

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const pulseSkills = s.tutorial && skillPulseStep(s.tutorialStep);
    if (!pulseSkills) {
      if (this.stopSkillsPulse) {
        this.stopSkillsPulse();
        this.stopSkillsPulse = null;
      }
      if (this.pulse) {
        this.pulse.destroy();
        this.pulse = null;
      }
      return;
    }
    if (this.pulse) return;
    const size = SKILLS_BUTTON_SIZE;
    const ring = new Graphics();
    ring.circle(size / 2, size / 2, size / 2 + 3).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    this.el.addChild(ring);
    this.pulse = ring;
    const ticker = this.host.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (!this.pulse || this.pulse.destroyed) {
        ticker.remove(fn);
        this.stopSkillsPulse = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      const r = size / 2 + 3 + 2 * Math.abs(Math.sin(phase * Math.PI * 2));
      this.pulse.clear().circle(size / 2, size / 2, r).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    };
    ticker.add(fn);
    this.stopSkillsPulse = () => ticker.remove(fn);
  }

  destroy(): void {
    if (this.stopSkillsPulse) {
      this.stopSkillsPulse();
      this.stopSkillsPulse = null;
    }
    if (this.unsub) this.unsub();
    this.unsub = null;
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.onResize = null;
    this.pulse = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
