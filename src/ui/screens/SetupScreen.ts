import { Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { TRIBES, type Tribe } from '../../game/tribes';
import { type GameMode } from '../../game/gameMode';
import { type AiDifficulty } from '../../game/aiDifficulty';
import { loadSettings } from '../../storage/settings';
import { t } from '../../i18n';
import { isTouchDevice } from '../touch';
import { type ScreenController, type UIHost } from '../host';
import { ScreenScroll } from '../verticalScroll';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { TRIBE_ROW_STEP, tribeSlots } from '../kit/tribeLayout';

const ENEMY_OPTIONS = [1, 2, 3, 4, 5];
const MODE_OPTIONS: GameMode[] = ['capture', 'turns30'];
const DIFFICULTY_OPTIONS: AiDifficulty[] = ['easy', 'normal', 'hard'];
const SELECTOR_COUNT = 5;
// Title centre to the block content below it (circle tops and button tops).
const TITLE_TO_CONTENT = 44;
// Vertical gap between the bottom of one block and the title above the next.
const BLOCK_GAP = 16;
// Horizontal gap between option buttons (enemies / mode / difficulty).
const BUTTON_GAP = 8;
// Horizontal margin kept clear on each side when laying out the tribe grid.
const SIDE_MARGIN = 24;
const RADIUS = 28;

export class SetupScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private scroll: ScreenScroll | null = null;
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
  private tribeItemLabels: Text[] = [];
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
    this.scroll = new ScreenScroll(host.app, this.root);

    this.tribeTitle = makeLabel(t('setup.chooseTribe'), { fontSize: 24, fill: 0xffffff });
    this.tribeTitle.anchor.set(0.5, 0.5);
    this.enemiesTitle = makeLabel(t('setup.enemies'), { fontSize: 24, fill: 0xffffff });
    this.enemiesTitle.anchor.set(0.5, 0.5);
    this.modeTitle = makeLabel(t('setup.mode'), { fontSize: 24, fill: 0xffffff });
    this.modeTitle.anchor.set(0.5, 0.5);
    this.difficultyTitle = makeLabel(t('setup.difficulty'), { fontSize: 24, fill: 0xffffff });
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
      this.tribeItemLabels.push(label);
      this.scroll!.content.addChild(item);
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
      this.scroll!.content.addChild(b);
    }

    for (const m of MODE_OPTIONS) {
      const b = new Button({
        label: m === 'capture' ? t('mode.capture') : t('mode.turns30'),
        onClick: () => {
          useGameStore.getState().setMode(m);
          this.refresh();
        },
      });
      this.modeButtons.push(b);
      this.scroll!.content.addChild(b);
    }

    for (const d of DIFFICULTY_OPTIONS) {
      const b = new Button({
        label: t(d === 'easy' ? 'difficulty.easy' : d === 'normal' ? 'difficulty.normal' : 'difficulty.hard'),
        width: 110,
        onClick: () => {
          this.difficulty = d;
          this.refresh();
        },
      });
      this.difficultyButtons.push(b);
      this.scroll!.content.addChild(b);
    }

    this.startBtn = new Button({
      label: t('setup.start'),
      fontSize: 32,
      paddingX: 32,
      paddingY: 16,
      onClick: () => gameController.startGame(this.tribe, this.enemies, useGameStore.getState().mode, this.difficulty),
    });
    this.hint = makeLabel(t('setup.hint'), { fontSize: 12, fill: 0xeeeeee });
    this.hint.visible = !isTouchDevice();
    this.hint.alpha = 0.7;
    this.hint.anchor.set(0.5, 0.5);

    this.backBtn = new Button({ label: t('setup.back'), width: 96, fontSize: 14, onClick: () => useGameStore.getState().setScreen('start') });

    this.scroll!.content.addChild(
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
    const cx = w / 2;
    const titleHalf = this.tribeTitle?.height ? this.tribeTitle.height / 2 : 15;
    const labelH = this.tribeItemLabels[0]?.height ?? 16;
    const buttonH = this.enemyButtons[0]?.height ?? 36;
    const startH = this.startBtn?.height ?? 0;
    const backH = this.backBtn?.height ?? 0;
    const hintH = this.hint?.height ?? 0;

    // Tribe grid may wrap onto a second row on narrow screens.
    const avail = Math.max(0, w - SIDE_MARGIN * 2);
    const grid = tribeSlots(this.tribeItems.length, avail);

    // Block height measured from the title's centre to the bottom of its content.
    const tribeDrop = TITLE_TO_CONTENT + RADIUS + (grid.rows - 1) * TRIBE_ROW_STEP + 34 + labelH;
    const buttonDrop = TITLE_TO_CONTENT + buttonH;

    // All y positions below are relative to the tribe title's centre (cy0 = 0).
    const cy0 = 0;
    const bottomTribe = cy0 + tribeDrop;
    const cy1 = bottomTribe + BLOCK_GAP + titleHalf;
    const bottomEnemies = cy1 + buttonDrop;
    const cy2 = bottomEnemies + BLOCK_GAP + titleHalf;
    const bottomMode = cy2 + buttonDrop;
    const cy3 = bottomMode + BLOCK_GAP + titleHalf;
    const bottomDifficulty = cy3 + buttonDrop;
    const startTop = bottomDifficulty + 30;
    const backTop = startTop + startH + 16;
    const hintCentre = backTop + backH + 16;
    const glyphTop = cy0 - titleHalf;
    const end = this.hint?.visible ? hintCentre + hintH / 2 : backTop + backH;
    const contentH = end - glyphTop;
    const screenGlyphTop = Math.max(16, Math.min((h - contentH) / 2, h - contentH - 16));
    const y = (rel: number): number => rel - glyphTop + screenGlyphTop;

    this.tribeTitle!.position.set(cx, y(cy0));
    const tribeRow1Centre = TITLE_TO_CONTENT + RADIUS;
    this.tribeItems.forEach((item, i) => {
      const s = grid.slots[i]!;
      item.position.set(cx + s.x, y(tribeRow1Centre) + s.y);
    });

    this.enemiesTitle!.position.set(cx, y(cy1));
    const enemyWidth = this.enemyButtons.reduce((sum, b) => sum + b.width, 0) + BUTTON_GAP * (this.enemyButtons.length - 1);
    let ex = cx - enemyWidth / 2;
    const enemyTop = y(cy1) + TITLE_TO_CONTENT;
    this.enemyButtons.forEach((b) => {
      b.position.set(ex, enemyTop);
      ex += b.width + BUTTON_GAP;
    });

    this.modeTitle!.position.set(cx, y(cy2));
    const modeWidth = this.modeButtons.reduce((sum, b) => sum + b.width, 0) + BUTTON_GAP * (this.modeButtons.length - 1);
    let mx = cx - modeWidth / 2;
    const modeTop = y(cy2) + TITLE_TO_CONTENT;
    this.modeButtons.forEach((b) => {
      b.position.set(mx, modeTop);
      mx += b.width + BUTTON_GAP;
    });

    this.difficultyTitle!.position.set(cx, y(cy3));
    const diffWidth = this.difficultyButtons.reduce((sum, b) => sum + b.width, 0) + BUTTON_GAP * (this.difficultyButtons.length - 1);
    let dx = cx - diffWidth / 2;
    const diffTop = y(cy3) + TITLE_TO_CONTENT;
    this.difficultyButtons.forEach((b) => {
      b.position.set(dx, diffTop);
      dx += b.width + BUTTON_GAP;
    });

    this.startBtn!.position.set(cx - this.startBtn!.width / 2, y(startTop));
    this.backBtn!.position.set(cx - this.backBtn!.width / 2, y(backTop));
    if (this.hint) this.hint.position.set(cx, y(hintCentre));
    this.scroll?.resize();
    this.scroll?.refresh();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    this.scroll?.destroy();
    this.scroll = null;
    this.root?.destroy({ children: true });
    this.root = null;
    this.host = null;
    this.tribeItems = [];
    this.tribeCircles = [];
    this.tribeItemLabels = [];
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
