import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { TRIBES, type Tribe } from '../../game/tribes';
import { GAME_MODE_NAMES, type GameMode } from '../../game/gameMode';
import { buildJoinLink, consumePendingJoin } from '../../net/joinLink';
import { type ScreenController, type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { makeTribeOption } from '../kit/tribeOption';
import { TextInputOverlay } from '../kit/textInputOverlay';

type View = 'menu' | 'host' | 'join';

const HOST_NAV_ITEMS = 6;
const CREATE_ROOM_FOCUS = HOST_NAV_ITEMS - 2;

export class LobbyScreen implements ScreenController {
  private root: Container | null = null;
  private host: UIHost | null = null;
  private view: View = 'menu';
  private mode: GameMode = 'capture';
  private humans = 2;
  private aiCount = 1;
  private tribe: Tribe = TRIBES[0]!.id;
  private name = 'Player';
  private code = '';
  private focus = 0;
  private menuIndex = 0;
  private menuButtons: Button[] = [];
  private inputs: TextInputOverlay[] = [];
  private createBtn: Button | null = null;
  private joinBtn: Button | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private lastWidth = 0;

  mount(host: UIHost): void {
    this.host = host;
    this.root = new Container();
    host.screenLayer.addChild(this.root);
    // Arriving via a share link ?join=<code> opens the join screen prefilled.
    const joinCode = consumePendingJoin();
    if (joinCode) {
      this.view = 'join';
      this.code = joinCode;
    }
    this.render();
    this.unsub = useGameStore.subscribe(() => this.render());
    this.lastWidth = host.app.screen.width;
    this.onResize = () => {
      const width = this.host?.app.screen.width ?? this.lastWidth;
      if (width === this.lastWidth) return;
      this.lastWidth = width;
      this.render();
    };
    window.addEventListener('resize', this.onResize);
    this.onKeyDown = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private render(): void {
    if (!this.root) return;
    for (const i of this.inputs) i.destroy();
    this.inputs = [];
    this.createBtn = null;
    this.joinBtn = null;
    this.menuButtons = [];
    while (this.root.children.length > 0) {
      this.root.removeChildAt(0).destroy({ children: true });
    }
    const s = useGameStore.getState();
    if (this.view === 'menu' && !s.lobby) this.renderMenu();
    else if (this.view === 'host' && !s.lobby) this.renderHost();
    else if (this.view === 'join' && !s.lobby) this.renderJoin();
    else this.renderRoom();
  }

  private title(text: string): void {
    const t = makeLabel(text, { fontSize: 24, fill: 0xffffff });
    t.anchor.set(0.5, 0.5);
    t.position.set(this.host!.app.screen.width / 2, 48);
    this.root!.addChild(t);
  }

  private renderMenu(): void {
    this.title('Multiplayer');
    const cx = this.host!.app.screen.width / 2;
    const hostBtn = new Button({ label: 'Host game', width: 240, onClick: () => { this.view = 'host'; this.render(); } });
    const joinBtn = new Button({ label: 'Join game', width: 240, onClick: () => { this.view = 'join'; this.render(); } });
    const back = new Button({ label: 'Back', width: 240, onClick: () => useGameStore.getState().setScreen('start') });
    hostBtn.position.set(cx - 120, 160);
    joinBtn.position.set(cx - 120, 230);
    back.position.set(cx - 120, 300);
    this.menuButtons = [hostBtn, joinBtn, back];
    this.menuIndex = Math.min(this.menuIndex, this.menuButtons.length - 1);
    this.updateMenuSelection();
    this.root!.addChild(hostBtn, joinBtn, back);

    const hint = makeLabel('↑/↓ navigate · Enter select · Backspace back', { fontSize: 12, fill: 0x888888 });
    hint.anchor.set(0.5, 0.5);
    hint.position.set(cx, 360);
    this.root!.addChild(hint);
  }

  private updateMenuSelection(): void {
    this.menuButtons.forEach((b, i) => {
      b.selected = i === this.menuIndex;
    });
  }

  private updateCreate(): void {
    if (this.createBtn) {
      this.createBtn.disabled = !(this.name.trim().length > 0 && this.humans + this.aiCount >= 2);
    }
  }

  private createRoom(): void {
    if (this.name.trim().length > 0 && this.humans + this.aiCount >= 2) {
      gameController.hostGame({ mode: this.mode, totalPlayers: this.humans + this.aiCount, aiCount: this.aiCount, name: this.name.trim(), tribe: this.tribe });
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (useGameStore.getState().lobby) return;
    if (this.view === 'menu') {
      this.handleMenuKey(e);
      return;
    }
    if (this.view !== 'host') return;
    // Ignore keys while the name field is being edited.
    if (document.activeElement instanceof HTMLInputElement) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.focus = (this.focus - 1 + HOST_NAV_ITEMS) % HOST_NAV_ITEMS;
      this.render();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.focus = (this.focus + 1) % HOST_NAV_ITEMS;
      this.render();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.changeGroup(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.focus === HOST_NAV_ITEMS - 1) {
        this.view = 'menu';
        this.render();
      } else {
        this.createRoom();
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      this.view = 'menu';
      this.render();
    }
  }

  private handleMenuKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.menuIndex = (this.menuIndex - 1 + this.menuButtons.length) % this.menuButtons.length;
      this.updateMenuSelection();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.menuIndex = (this.menuIndex + 1) % this.menuButtons.length;
      this.updateMenuSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.menuButtons[this.menuIndex]?.trigger();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      useGameStore.getState().setScreen('start');
    }
  }

  private changeGroup(dir: number): void {
    if (this.focus >= CREATE_ROOM_FOCUS) return;
    if (this.focus === 0) {
      const i = TRIBES.findIndex((t) => t.id === this.tribe);
      this.tribe = TRIBES[(i + dir + TRIBES.length) % TRIBES.length]!.id;
    } else if (this.focus === 1) {
      const opts = [2, 3, 4, 5, 6];
      const i = opts.indexOf(this.humans);
      this.humans = opts[(i + dir + opts.length) % opts.length]!;
      this.aiCount = Math.min(this.aiCount, 7 - this.humans);
    } else if (this.focus === 2) {
      const maxAi = 7 - this.humans;
      const opts = Array.from({ length: maxAi }, (_, i) => i);
      const i = opts.indexOf(this.aiCount);
      this.aiCount = opts[(i + dir + opts.length) % opts.length]!;
    } else {
      const opts: GameMode[] = ['capture', 'turns30'];
      const i = opts.indexOf(this.mode);
      this.mode = opts[(i + dir + opts.length) % opts.length]!;
    }
    this.render();
  }

  private groupLabel(text: string, group: number): ReturnType<typeof makeLabel> {
    const label = makeLabel(text, { fontSize: 16, fill: this.focus === group ? 0xffffff : 0x888888 });
    label.anchor.set(0.5, 0.5);
    return label;
  }

  private renderHost(): void {
    const cx = this.host!.app.screen.width / 2;
    this.title('Host game');
    let y = 110;

    const nameInput = new TextInputOverlay({
      x: cx - 100, y, width: 200, height: 34, value: this.name,
      onChange: (v) => { this.name = v; this.updateCreate(); },
    });
    this.inputs.push(nameInput);
    this.root!.addChild(nameInput.container);
    y += 60;

    const tribeLabel = this.groupLabel('Tribe', 0);
    tribeLabel.position.set(cx, y);
    this.root!.addChild(tribeLabel);
    y += 46;
    const tribeStart = cx - (TRIBES.length * 56 + (TRIBES.length - 1) * 16) / 2 + 28;
    TRIBES.forEach((t, i) => {
      const opt = makeTribeOption(t.name, `${t.code}-icon.png`, () => { this.tribe = t.id; this.render(); }, t.id === this.tribe);
      opt.el.position.set(tribeStart + i * 72, y);
      this.root!.addChild(opt.el);
    });

    const humansLabel = this.groupLabel('Human players', 1);
    humansLabel.position.set(cx, y + 76);
    this.root!.addChild(humansLabel);
    const humanOpts = [2, 3, 4, 5, 6];
    const humanStart = cx - (humanOpts.length * 56 + (humanOpts.length - 1) * 4) / 2;
    humanOpts.forEach((n, i) => {
      const b = new Button({ label: String(n), width: 56, selected: n === this.humans, onClick: () => { this.humans = n; this.aiCount = Math.min(this.aiCount, 7 - n); this.render(); } });
      b.position.set(humanStart + i * 60, y + 126);
      this.root!.addChild(b);
    });

    const aiLabel = this.groupLabel('AI opponents', 2);
    aiLabel.position.set(cx, y + 176);
    this.root!.addChild(aiLabel);
    const maxAi = 7 - this.humans;
    const aiStart = cx - (maxAi * 56 + (maxAi - 1) * 4) / 2;
    Array.from({ length: maxAi }, (_, i) => i).forEach((n, i) => {
      const b = new Button({ label: String(n), width: 56, selected: n === this.aiCount, onClick: () => { this.aiCount = n; this.render(); } });
      b.position.set(aiStart + i * 60, y + 226);
      this.root!.addChild(b);
    });

    const total = makeLabel(
      `Total: ${this.humans + this.aiCount} players (${this.humans} human${this.humans > 1 ? 's' : ''} + ${this.aiCount} AI)`,
      { fontSize: 14, fill: 0xeeeeee },
    );
    total.anchor.set(0.5, 0.5);
    total.position.set(cx, y + 276);
    this.root!.addChild(total);

    const modeLabel = this.groupLabel('Mode', 3);
    modeLabel.position.set(cx, y + 326);
    this.root!.addChild(modeLabel);
    (['capture', 'turns30'] as GameMode[]).forEach((m, i) => {
      const b = new Button({ label: GAME_MODE_NAMES[m], width: 200, selected: m === this.mode, onClick: () => { this.mode = m; this.render(); } });
      b.position.set(cx - 220 + i * 240, y + 376);
      this.root!.addChild(b);
    });

    this.createBtn = new Button({ label: 'Create room', width: 240, selected: this.focus === CREATE_ROOM_FOCUS, onClick: () => this.createRoom() });
    const back = new Button({ label: 'Back', width: 96, fontSize: 14, selected: this.focus === HOST_NAV_ITEMS - 1, onClick: () => { this.view = 'menu'; this.render(); } });
    this.createBtn.position.set(cx - 120, y + 446);
    back.position.set(cx - 48, y + 506);
    this.root!.addChild(this.createBtn, back);
    this.updateCreate();

    const hint = makeLabel('↑/↓ navigate · ←/→ change · Enter create · Backspace back', { fontSize: 12, fill: 0x888888 });
    hint.anchor.set(0.5, 0.5);
    hint.position.set(cx, y + 566);
    this.root!.addChild(hint);
  }

  private updateJoin(): void {
    if (this.joinBtn) {
      this.joinBtn.disabled = !(this.code.trim().length === 6 && this.name.trim().length > 0);
    }
  }

  private renderJoin(): void {
    const cx = this.host!.app.screen.width / 2;
    const s = useGameStore.getState();
    this.title('Join game');
    let y = 130;

    const codeInput = new TextInputOverlay({
      x: cx - 100, y, width: 200, height: 34, value: this.code,
      transform: (v) => v.toUpperCase(),
      onChange: (v) => { this.code = v; this.updateJoin(); },
    });
    this.inputs.push(codeInput);
    this.root!.addChild(codeInput.container);
    y += 60;

    const nameInput = new TextInputOverlay({
      x: cx - 100, y, width: 200, height: 34, value: this.name,
      onChange: (v) => { this.name = v; this.updateJoin(); },
    });
    this.inputs.push(nameInput);
    this.root!.addChild(nameInput.container);
    y += 60;

    this.joinBtn = new Button({ label: 'Join', width: 200, onClick: () => gameController.joinGame(this.code.trim(), this.name.trim()) });
    this.joinBtn.position.set(cx - 100, y);
    this.root!.addChild(this.joinBtn);
    this.updateJoin();
    y += 60;

    if (s.connection === 'connecting') {
      const c = makeLabel('Connecting...', { fontSize: 16, fill: 0xeeeeee });
      c.anchor.set(0.5, 0.5);
      c.position.set(cx, y);
      this.root!.addChild(c);
      y += 30;
    } else if (s.connection === 'error') {
      const e = makeLabel('Connection failed', { fontSize: 16, fill: 0xc0392b });
      e.anchor.set(0.5, 0.5);
      e.position.set(cx, y);
      this.root!.addChild(e);
      y += 30;
    }

    const back = new Button({ label: 'Back', width: 200, onClick: () => { this.view = 'menu'; this.render(); } });
    back.position.set(cx - 100, y);
    this.root!.addChild(back);
  }

  private renderRoom(): void {
    const s = useGameStore.getState();
    const lobby = s.lobby!;
    const cx = this.host!.app.screen.width / 2;
    const isHost = lobby.role === 'host';
    const joined = lobby.players;
    const humanSlots = Math.max(1, lobby.totalPlayers - lobby.aiCount);
    const canStart = joined.length === humanSlots && joined.every((p) => p.ready && p.tribeId !== null);
    const me = joined.find((p) => p.peerId === s.myPeerId);
    const myPeerId = isHost ? (joined.find((p) => p.isHost)?.peerId ?? '') : s.myPeerId;

    this.title(isHost ? 'Your room' : 'Room');
    const code = makeLabel(`Code: ${lobby.code}`, { fontSize: 18, fill: 0xffffff });
    code.anchor.set(0.5, 0.5);
    let copyBtn: Button | null = null;
    copyBtn = new Button({
      label: 'Copy',
      width: 80,
      onClick: () => {
        void navigator.clipboard.writeText(lobby.code).catch(() => {});
        copyBtn?.setLabel('Copied!');
        setTimeout(() => {
          if (copyBtn && !copyBtn.destroyed) copyBtn.setLabel('Copy');
        }, 1500);
      },
    });
    const rowW = code.width + 8 + copyBtn.width;
    code.position.set(cx - rowW / 2 + code.width / 2, 90);
    copyBtn.position.set(cx - rowW / 2 + code.width + 8, 90 - copyBtn.height / 2);
    this.root!.addChild(code, copyBtn);

    let joinLinkBtn: Button | null = null;
    if (isHost) {
      joinLinkBtn = new Button({
        label: 'Copy join link',
        width: 240,
        onClick: () => {
          void navigator.clipboard.writeText(buildJoinLink(lobby.code)).catch(() => {});
          joinLinkBtn?.setLabel('Copied!');
          setTimeout(() => {
            if (joinLinkBtn && !joinLinkBtn.destroyed) joinLinkBtn.setLabel('Copy join link');
          }, 1500);
        },
      });
      joinLinkBtn.position.set(cx - 120, 128);
      this.root!.addChild(joinLinkBtn);
    }

    let y = isHost ? 190 : 150;
    for (const p of joined) {
      const tribeName = p.tribeId !== null ? (TRIBES.find((t) => t.id === p.tribeId)?.name ?? '') : '';
      const row = makeLabel(
        `${p.name || '...'}${tribeName ? ` - ${tribeName}` : ''}${p.isHost ? ' (host)' : ''}${p.ready ? ' ✓ ready' : ''}`,
        { fontSize: 16, fill: 0xeeeeee },
      );
      row.anchor.set(0.5, 0.5);
      row.position.set(cx, y);
      this.root!.addChild(row);
      y += 34;
    }
    y += 20;

    const tribeLabel = makeLabel('Choose your tribe', { fontSize: 24, fill: 0xffffff });
    tribeLabel.anchor.set(0.5, 0.5);
    tribeLabel.position.set(cx, y);
    this.root!.addChild(tribeLabel);
    y += 54;
    const hostTribeId = joined.find((p) => p.isHost)?.tribeId ?? -1;
    const ownTribeId = isHost ? hostTribeId : (me?.tribeId ?? -1);
    // Joining players lock their choice once ready. Tribe circles are laid out
    // exactly like the single-player "Choose your tribe" picker; tribes already
    // taken by another player are shown dimmed instead of being removed.
    const ownLocked = !isHost && (me?.ready ?? false);
    const tribeWidth = TRIBES.length * 56 + (TRIBES.length - 1) * 16;
    TRIBES.forEach((t, i) => {
      const takenByOther = joined.some((p) => p.peerId !== myPeerId && p.tribeId === t.id);
      const pickable = !ownLocked && !takenByOther;
      const opt = makeTribeOption(t.name, `${t.code}-icon.png`, () => {
        if (!pickable) return;
        if (isHost) gameController.pickHostTribe(t.id);
        else gameController.pickClientTribe(t.id);
      }, t.id === ownTribeId);
      if (!pickable) {
        opt.el.eventMode = 'none';
        opt.el.alpha = 0.45;
      }
      opt.el.position.set(cx - tribeWidth / 2 + 28 + i * 72, y);
      this.root!.addChild(opt.el);
    });
    y += 70;

    if (isHost) {
      if (s.connection === 'error') {
        const errMsg = makeLabel(s.connectionMessage || 'Could not set up the room.', { fontSize: 14, fill: 0xc0392b });
        errMsg.anchor.set(0.5, 0.5);
        errMsg.position.set(cx, y);
        this.root!.addChild(errMsg);
        const back = new Button({ label: 'Back', width: 150, onClick: () => { gameController.cancelLobby(); this.view = 'menu'; this.render(); } });
        back.position.set(cx - 75, y + 34);
        this.root!.addChild(back);
        return;
      }
      if (s.connection === 'connecting') {
        const setup = makeLabel('Setting up the room...', { fontSize: 14, fill: 0xcccccc });
        setup.anchor.set(0.5, 0.5);
        setup.position.set(cx, y);
        this.root!.addChild(setup);
        return;
      }
      const start = new Button({ label: 'Start game', width: 240, disabled: !canStart, onClick: () => { void gameController.startHostGame(); } });
      start.position.set(cx - 120, y);
      this.root!.addChild(start);
      y += 60;
      if (!canStart) {
        const wait = makeLabel('Waiting for all players to be ready...', { fontSize: 14, fill: 0x888888 });
        wait.anchor.set(0.5, 0.5);
        wait.position.set(cx, y);
        this.root!.addChild(wait);
      }
    } else {
      if (s.connection === 'error') {
        const errMsg = makeLabel(s.connectionMessage || 'Connection failed.', { fontSize: 14, fill: 0xc0392b });
        errMsg.anchor.set(0.5, 0.5);
        errMsg.position.set(cx, y);
        this.root!.addChild(errMsg);
        y += 30;
        const retryName = me?.name ?? this.name;
        const retry = new Button({ label: 'Try again', width: 150, onClick: () => gameController.joinGame(lobby.code, retryName) });
        retry.position.set(cx - 165, y);
        this.root!.addChild(retry);
        const back = new Button({ label: 'Back', width: 150, onClick: () => { gameController.cancelLobby(); this.view = 'join'; this.render(); } });
        back.position.set(cx + 15, y);
        this.root!.addChild(back);
        return;
      }
      const isReady = me?.ready ?? false;
      const ready = new Button({ label: isReady ? 'Ready!' : "I'm ready", width: 240, disabled: !me || me.tribeId === null || isReady, onClick: () => gameController.readyUp() });
      ready.position.set(cx - 120, y);
      this.root!.addChild(ready);
      y += 60;
      if (isReady) {
        const wait = makeLabel('Waiting for game start...', { fontSize: 14, fill: 0x888888 });
        wait.anchor.set(0.5, 0.5);
        wait.position.set(cx, y);
        this.root!.addChild(wait);
        y += 24;
      } else if (me && me.tribeId === null) {
        const hint = makeLabel('Pick a tribe to become ready.', { fontSize: 14, fill: 0x888888 });
        hint.anchor.set(0.5, 0.5);
        hint.position.set(cx, y);
        this.root!.addChild(hint);
        y += 24;
      }
      if (s.connection === 'connecting') {
        const connecting = makeLabel('Connecting to the room...', { fontSize: 14, fill: 0xcccccc });
        connecting.anchor.set(0.5, 0.5);
        connecting.position.set(cx, y);
        this.root!.addChild(connecting);
        y += 30;
        const cancel = new Button({ label: 'Cancel', width: 150, onClick: () => { gameController.cancelLobby(); this.view = 'join'; this.render(); } });
        cancel.position.set(cx - 75, y);
        this.root!.addChild(cancel);
      }
    }
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.unsub = null;
    this.onResize = null;
    this.onKeyDown = null;
    for (const i of this.inputs) i.destroy();
    this.inputs = [];
    this.root?.destroy({ children: true });
    this.root = null;
    this.host = null;
  }
}
