import { Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { TRIBES, type Tribe } from '../../game/tribes';
import { GAME_MODE_NAMES, type GameMode } from '../../game/gameMode';
import { type AiDifficulty } from '../../game/aiDifficulty';
import { loadSettings } from '../../storage/settings';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

const ENEMY_OPTIONS = [1, 2, 3, 4, 5];
const MODE_OPTIONS: GameMode[] = ['capture', 'turns30'];
const DIFFICULTY_OPTIONS: AiDifficulty[] = ['easy', 'normal', 'hard'];
const SELECTOR_COUNT = 5;
const TITLE_TO_GROUP = 44;
const BUTTON_GAP = 16;

export class SetupScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private selector = 0;
  private tribe: Tribe = TRIBES[0]!.id;
  private enemies = 3;
  private difficulty: AiDifficulty = loadSettings().aiDifficulty;
  private tribeTitle: Text | null = null;
  private enemiesTitle: Text | null = null;
  private modeTitle: Text | null = null;
  private difficultyTitle: Text | null = null;
  private tribeItems: Container[] = [];
  private tribeCircles: Graphics[] = [];
  private enemyButtons: Button[] = [];
  private modeButtons: Button[] = [];
  private difficultyButtons: Button[] = [];
  private startBtn: Button | null = null;
  private backBtn: Button | null = null;
  private hint: Text | null = null;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);

    this.tribeTitle = makeLabel('Choose your tribe', { fontSize: 24, fill: 0xffffff });
    this.tribeTitle.anchor.set(0.5, 0.5);
    this.enemiesTitle = makeLabel('Enemies', { fontSize: 24, fill: 0xffffff });
    this.enemiesTitle.anchor.set(0.5, 0.5);
    this.modeTitle = makeLabel('Mode', { fontSize: 24, fill: 0xffffff });
    this.modeTitle.anchor.set(0.5, 0.5);
    this.difficultyTitle = makeLabel('AI difficulty', { fontSize: 24, fill: 0xffffff });
    this.difficultyTitle.anchor.set(0.5, 0.5);

    for (const t of TRIBES) {
      const circle = new Graphics();
      circle.circle(0, 0, 28).fill(0xffffff);
      const clip = new Graphics();
      clip.circle(0, 0, 28).fill(0xffffff);
      const icon = makeIcon(`${t.code}-icon.png`, 60);
      icon.position.set(0, 0);
      icon.mask = clip;
      const label = makeLabel(t.name, { fontSize: 12, fill: 0xeeeeee });
      label.anchor.set(0.5, 0);
      label.position.set(0, 34);
      const item = new Container();
      item.addChild(circle, clip, icon, label);
      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.on('pointertap', () => {
        this.tribe = t.id;
        this.refresh();
      });
      this.tribeItems.push(item);
      this.tribeCircles.push(circle);
      this.root.addChild(item);
    }

    for (const n of ENEMY_OPTIONS) {
      const b = new Button({
        label: String(n),
        width: 64,
        onClick: () => {
          this.enemies = n;
          this.refresh();
        },
      });
      this.enemyButtons.push(b);
      this.root.addChild(b);
    }

    for (const m of MODE_OPTIONS) {
      const b = new Button({
        label: GAME_MODE_NAMES[m],
        onClick: () => {
          useGameStore.getState().setMode(m);
          this.refresh();
        },
      });
      this.modeButtons.push(b);
      this.root.addChild(b);
    }

    for (const d of DIFFICULTY_OPTIONS) {
      const b = new Button({
        label: d[0]!.toUpperCase() + d.slice(1),
        width: 110,
        onClick: () => {
          this.difficulty = d;
          this.refresh();
        },
      });
      this.difficultyButtons.push(b);
      this.root.addChild(b);
    }

    this.startBtn = new Button({
      label: 'Start',
      fontSize: 32,
      paddingX: 32,
      paddingY: 16,
      onClick: () => gameController.startGame(this.tribe, this.enemies, useGameStore.getState().mode, this.difficulty),
    });
    this.hint = makeLabel('↑/↓ navigate · ←/→ change · Enter start · Backspace back', { fontSize: 12, fill: 0xeeeeee });
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5, 0.5);

    this.backBtn = new Button({ label: 'Back', width: 96, fontSize: 14, onClick: () => useGameStore.getState().setScreen('start') });

    this.root.addChild(
      this.tribeTitle,
      this.enemiesTitle,
      this.modeTitle,
      this.difficultyTitle,
      this.startBtn,
      this.backBtn,
      this.hint,
    );
    this.refresh();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => this.layout();

  private onKeyDown = (e: KeyboardEvent): void => {
    const store = useGameStore.getState();
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selector = (this.selector - 1 + SELECTOR_COUNT) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selector = (this.selector + 1) % SELECTOR_COUNT;
      this.refresh();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.change(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.change(1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selector === 4) {
        useGameStore.getState().setScreen('start');
      } else {
        gameController.startGame(this.tribe, this.enemies, store.mode, this.difficulty);
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      useGameStore.getState().setScreen('start');
    }
  };

  private change(dir: number): void {
    if (this.selector === 4) return;
    if (this.selector === 0) {
      const i = TRIBES.findIndex((t) => t.id === this.tribe);
      this.tribe = TRIBES[(i + dir + TRIBES.length) % TRIBES.length]!.id;
    } else if (this.selector === 1) {
      const i = ENEMY_OPTIONS.indexOf(this.enemies);
      this.enemies = ENEMY_OPTIONS[(i + dir + ENEMY_OPTIONS.length) % ENEMY_OPTIONS.length]!;
    } else if (this.selector === 2) {
      const store = useGameStore.getState();
      const i = MODE_OPTIONS.indexOf(store.mode);
      useGameStore.getState().setMode(MODE_OPTIONS[(i + dir + MODE_OPTIONS.length) % MODE_OPTIONS.length]!);
    } else {
      const i = DIFFICULTY_OPTIONS.indexOf(this.difficulty);
      this.difficulty = DIFFICULTY_OPTIONS[(i + dir + DIFFICULTY_OPTIONS.length) % DIFFICULTY_OPTIONS.length]!;
    }
    this.refresh();
  }

  private refresh(): void {
    if (!this.root) return;
    const tribeIndex = TRIBES.findIndex((t) => t.id === this.tribe);
    const enemiesIndex = ENEMY_OPTIONS.indexOf(this.enemies);
    const modeIndex = MODE_OPTIONS.indexOf(useGameStore.getState().mode);
    const difficultyIndex = DIFFICULTY_OPTIONS.indexOf(this.difficulty);
    this.tribeCircles.forEach((c, i) => {
      c.clear().circle(0, 0, 28).fill(0xffffff);
      if (i === tribeIndex) c.stroke({ width: 4, color: 0x5099ff });
    });
    this.enemyButtons.forEach((b, i) => {
      b.selected = i === enemiesIndex;
    });
    this.modeButtons.forEach((b, i) => {
      b.selected = i === modeIndex;
    });
    this.difficultyButtons.forEach((b, i) => {
      b.selected = i === difficultyIndex;
    });
    this.backBtn!.selected = this.selector === 4;
    this.tribeTitle!.style.fill = this.selector === 0 ? 0xffffff : 0x888888;
    this.enemiesTitle!.style.fill = this.selector === 1 ? 0xffffff : 0x888888;
    this.modeTitle!.style.fill = this.selector === 2 ? 0xffffff : 0x888888;
    this.difficultyTitle!.style.fill = this.selector === 3 ? 0xffffff : 0x888888;
    this.layout();
  }

  private layout(): void {
    if (!this.root || !this.host) return;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    const y0 = h / 2 - 360;
    const BLOCK_GAP = 26;

    const titleHalf = (this.tribeTitle?.height ?? 29) / 2;
    const buttonHeight = this.enemyButtons[0]?.height ?? 36;
    const tribeLabel = this.tribeItems[0]?.children[1] as Text | undefined;
    const tribeLabelHeight = tribeLabel ? tribeLabel.height : 15;
    const tribeBottom = TITLE_TO_GROUP + 28 + 28 + 34 + tribeLabelHeight;
    const buttonBottom = TITLE_TO_GROUP + buttonHeight;

    this.tribeTitle!.position.set(w / 2, y0);
    const tribeCount = this.tribeItems.length;
    const tribeWidth = tribeCount * 56 + (tribeCount - 1) * BUTTON_GAP;
    this.tribeItems.forEach((item, i) => {
      item.position.set(w / 2 - tribeWidth / 2 + 28 + i * (56 + BUTTON_GAP), y0 + TITLE_TO_GROUP + 28);
    });

    const y1 = y0 + titleHalf + tribeBottom + BLOCK_GAP;
    this.enemiesTitle!.position.set(w / 2, y1);
    const enemyWidth = this.enemyButtons.reduce((s, b) => s + b.width, 0) + BUTTON_GAP * (this.enemyButtons.length - 1);
    let ex = w / 2 - enemyWidth / 2;
    this.enemyButtons.forEach((b) => {
      b.position.set(ex, y1 + TITLE_TO_GROUP);
      ex += b.width + BUTTON_GAP;
    });

    const y2 = y1 + titleHalf + buttonBottom + BLOCK_GAP;
    this.modeTitle!.position.set(w / 2, y2);
    const modeWidth = this.modeButtons.reduce((s, b) => s + b.width, 0) + BUTTON_GAP * (this.modeButtons.length - 1);
    let mx = w / 2 - modeWidth / 2;
    this.modeButtons.forEach((b) => {
      b.position.set(mx, y2 + TITLE_TO_GROUP);
      mx += b.width + BUTTON_GAP;
    });

    const y3 = y2 + titleHalf + buttonBottom + BLOCK_GAP;
    this.difficultyTitle!.position.set(w / 2, y3);
    const diffWidth = this.difficultyButtons.reduce((s, b) => s + b.width, 0) + BUTTON_GAP * (this.difficultyButtons.length - 1);
    let dx = w / 2 - diffWidth / 2;
    this.difficultyButtons.forEach((b) => {
      b.position.set(dx, y3 + TITLE_TO_GROUP);
      dx += b.width + BUTTON_GAP;
    });

    this.startBtn!.position.set(w / 2 - this.startBtn!.width / 2, y3 + TITLE_TO_GROUP + 72);
    const backY = y3 + TITLE_TO_GROUP + 72 + this.startBtn!.height + 24;
    this.backBtn!.position.set(w / 2 - this.backBtn!.width / 2, backY);
    this.hint!.position.set(w / 2, backY + this.backBtn!.height + 24);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.root?.destroy({ children: true });
    this.root = null;
    this.host = null;
    this.tribeItems = [];
    this.tribeCircles = [];
    this.enemyButtons = [];
    this.modeButtons = [];
    this.difficultyButtons = [];
    this.tribeTitle = null;
    this.enemiesTitle = null;
    this.modeTitle = null;
    this.difficultyTitle = null;
    this.startBtn = null;
    this.backBtn = null;
    this.hint = null;
  }
}
