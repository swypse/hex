import { BitmapText, Container, Graphics } from 'pixi.js';
import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { WEATHER_RULES } from '../../game/weather/weather';
import { useGameStore } from '../../store/game-store';
import { FontSize } from '@enums';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../../gfx/label';
import { THEME } from '../../gfx/theme';
import { SCORE_PAD, SCORE_TEXT_Y } from './layout';

/** Distance from the season text to the first weather line, and between lines. */
const FIRST_LINE_GAP = 22;
const LINE_HEIGHT = 18;
/** Black plate behind each event name. */
const PLATE_ALPHA = 0.5;
const PLATE_RADIUS = 2;
const PLATE_PAD_X = 4;
const PLATE_PAD_Y = 1;

/** Active weather events under the season text, one line each:
 *  `Storm 3/6` (turns it has existed / its lifetime; just the name for an event
 *  that lasts one turn). Tapping a line centers the
 *  map on the event's center tile and bounces it. */
export class HudWeather implements Widget {
  private lines: BitmapText[] = [];
  private plates: Graphics[] = [];
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
    while (this.lines.length < Math.min(texts.length, WEATHER_RULES.maxActive + 1)) {
      const label = makeLabel('', { fontSize: FontSize.SMALL, fill: THEME.skillTree.openedSkillStroke });
      label.anchor.set(0, 0.5);
      label.position.set(SCORE_PAD, SCORE_TEXT_Y + FIRST_LINE_GAP + this.lines.length * LINE_HEIGHT);
      label.eventMode = 'static';
      label.cursor = 'pointer';
      const index = this.lines.length;
      label.on('pointertap', () => {
        const target = this.targets[index];
        if (target) this.onSelect(target.q, target.r);
      });
      const plate = new Graphics();
      plate.eventMode = 'none';
      this.root.addChild(plate, label);
      this.plates.push(plate);
      this.lines.push(label);
    }
    this.lines.forEach((label, i) => {
      const plate = this.plates[i]!;
      label.visible = i < texts.length;
      plate.visible = i < texts.length;
      if (i < texts.length) {
        label.text = texts[i]!;
        plate.clear().roundRect(
          label.x - PLATE_PAD_X,
          label.y - label.height / 2 - PLATE_PAD_Y,
          label.width + PLATE_PAD_X * 2,
          label.height + PLATE_PAD_Y * 2,
          PLATE_RADIUS,
        ).fill({ color: 0x000000, alpha: PLATE_ALPHA });
      }
    });
  }

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    for (const l of this.lines) l.destroy();
    for (const p of this.plates) p.destroy();
    this.lines = [];
    this.plates = [];
    this.root = null;
  }
}
