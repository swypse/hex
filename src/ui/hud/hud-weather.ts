import { BitmapText, Container } from 'pixi.js';
import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { WEATHER_RULES } from '../../game/weather';
import { useGameStore } from '../../store/game-store';
import { FontSize } from '@enums';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { SCORE_PAD, SCORE_TEXT_Y } from '../layout';

/** Distance from the season text to the first weather line, and between lines. */
const FIRST_LINE_GAP = 22;
const LINE_HEIGHT = 18;

/** Active weather events under the season text, one line each:
 *  `Storm 3/6` (turns it has existed / its lifetime; just the name for an event
 *  that lasts one turn). Tapping a line centers the
 *  map on the event's center tile and bounces it. */
export class HudWeather implements Widget {
  private lines: BitmapText[] = [];
  /** Center tile of the event each line currently shows. */
  private targets: { q: number; r: number }[] = [];
  private unsub: (() => void) | null = null;
  private lastKey = '';
  private root: Container | null = null;

  constructor(private readonly onSelect: (q: number, r: number) => void = (q, r) => void gameController.focusTile(q, r)) {}

  mount(_host: UIHost, root: Container): void {
    this.root = root;
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
  }

  private update(): void {
    if (!this.root) return;
    const { weather } = useGameStore.getState();
    const texts = weather.map((w) => {
      const name = t(`weather.${w.type}` as never);
      // A one-turn event (the earthquake) has no progress to show.
      return w.lifetime > 1 ? t('weather.progress', { name, age: w.age, lifetime: w.lifetime }) : name;
    });
    // Targets follow every change (a storm drifts without its label changing).
    this.targets = weather.map((w) => ({ q: w.q, r: w.r }));
    const key = texts.join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    // Keep one label per line; surplus labels are hidden rather than rebuilt.
    while (this.lines.length < Math.min(texts.length, WEATHER_RULES.maxActive)) {
      const label = makeLabel('', { fontSize: FontSize.SMALL, fill: 0xffffff });
      label.anchor.set(0, 0.5);
      label.position.set(SCORE_PAD, SCORE_TEXT_Y + FIRST_LINE_GAP + this.lines.length * LINE_HEIGHT);
      label.eventMode = 'static';
      label.cursor = 'pointer';
      const index = this.lines.length;
      label.on('pointertap', () => {
        const target = this.targets[index];
        if (target) this.onSelect(target.q, target.r);
      });
      this.root.addChild(label);
      this.lines.push(label);
    }
    this.lines.forEach((label, i) => {
      label.visible = i < texts.length;
      if (i < texts.length) label.text = texts[i]!;
    });
  }

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    for (const l of this.lines) l.destroy();
    this.lines = [];
    this.root = null;
  }
}
