import { Container } from 'pixi.js';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { CenterMessage } from './center-message';
import { DisbandDialog } from './disband-dialog';
import { LeaveGameDialog } from './leave-game-dialog';
import { ShipLandingDialog } from './ship-landing-dialog';
import { MoveAttackDialog } from './move-attack-dialog';
import { StalkerRevealDialog } from './stalker-reveal-dialog';
import { SpawnDialog } from './spawn-dialog';
import { SkillTree } from './skill-tree';
import { UnitHelpDialog } from './unit-help-dialog';
import { GameOver } from './game-over';
import { GameStats } from './game-stats';
import { AchievementsDialog } from './achievements-dialog';
import { WelcomeDialog } from './welcome-dialog';
import { TutorialOverlay } from './tutorial-overlay';
import { DisconnectDialog } from './disconnect-dialog';
import { WatchPromptDialog } from './watch-prompt-dialog';
import { StunChoiceDialog } from './stun-choice-dialog';
import { BuilderBuildDialog } from './builder-build-dialog';
import { OverlayKind, PauseReason, Screen } from '@enums';

interface Overlay {
  mount(host: UIHost, root: Container): void;
  destroy(): void;
  /** Optional: play a hide animation before destroy is called. */
  hide?(onDone: () => void): void;
}

interface Entry {
  make: () => Overlay;
  mounted: Overlay | null;
  hiding: boolean;
}

export class OverlayManager {
  private readonly host: UIHost;
  private readonly root: Container;
  private readonly entries: Record<string, Entry> = {
    center: { make: () => new CenterMessage(), mounted: null, hiding: false },
    disband: { make: () => new DisbandDialog(), mounted: null, hiding: false },
    leave: { make: () => new LeaveGameDialog(), mounted: null, hiding: false },
    ship: { make: () => new ShipLandingDialog(), mounted: null, hiding: false },
    moveattack: { make: () => new MoveAttackDialog(), mounted: null, hiding: false },
    stalkerreveal: { make: () => new StalkerRevealDialog(), mounted: null, hiding: false },
    spawn: { make: () => new SpawnDialog(), mounted: null, hiding: false },
    skill: { make: () => new SkillTree(), mounted: null, hiding: false },
    gameover: { make: () => new GameOver(), mounted: null, hiding: false },
    stats: { make: () => new GameStats(), mounted: null, hiding: false },
    achievements: { make: () => new AchievementsDialog(), mounted: null, hiding: false },
    unithelp: { make: () => new UnitHelpDialog(), mounted: null, hiding: false },
    settlementhelp: { make: () => new UnitHelpDialog(), mounted: null, hiding: false },
    buildinghelp: { make: () => new UnitHelpDialog(), mounted: null, hiding: false },
    buildinglimithelp: { make: () => new UnitHelpDialog(), mounted: null, hiding: false },
    bridgehelp: { make: () => new UnitHelpDialog(), mounted: null, hiding: false },
    welcome: { make: () => new WelcomeDialog(), mounted: null, hiding: false },
    tutorial: { make: () => new TutorialOverlay(), mounted: null, hiding: false },
    disconnect: { make: () => new DisconnectDialog(), mounted: null, hiding: false },
    watchingprompt: { make: () => new WatchPromptDialog(), mounted: null, hiding: false },
    stunchoice: { make: () => new StunChoiceDialog(), mounted: null, hiding: false },
    builderbuild: { make: () => new BuilderBuildDialog(), mounted: null, hiding: false },
  };
  private unsub: (() => void) | null = null;
  private refreshing = false;

  constructor(host: UIHost) {
    this.host = host;
    this.root = new Container();
    host.overlayLayer.addChild(this.root);
    this.unsub = useGameStore.subscribe(() => this.refresh());
    this.refresh();
  }

  private active(): Set<string> {
    const s = useGameStore.getState();
    const inGame = s.screen === Screen.GAME;
    const active = new Set<string>();
    if (inGame && s.centerMessage !== null) active.add('center');
    if (inGame && s.tutorial) active.add('tutorial');
    if (inGame && s.gameOver && s.winnerIndex !== null) active.add('gameover');
    if (inGame && s.paused === PauseReason.DISCONNECT) active.add('disconnect');
    if (inGame) {
      switch (s.overlay?.kind) {
        case OverlayKind.DISBAND:
          active.add('disband');
          break;
        case OverlayKind.LEAVE:
          active.add('leave');
          break;
        case OverlayKind.SHIP_LANDING:
          active.add('ship');
          break;
        case OverlayKind.MOVE_ATTACK:
          active.add('moveattack');
          break;
        case OverlayKind.STALKER_REVEAL:
          active.add('stalkerreveal');
          break;
        case OverlayKind.SPAWN:
          active.add('spawn');
          break;
        case OverlayKind.SKILL:
          active.add('skill');
          break;
        case OverlayKind.STATS:
          active.add('stats');
          break;
        case OverlayKind.ACHIEVEMENTS:
          active.add('achievements');
          break;
        case OverlayKind.WELCOME:
          active.add('welcome');
          break;
        case OverlayKind.UNIT_HELP:
          active.add('unithelp');
          break;
        case OverlayKind.SETTLEMENT_HELP:
          active.add('settlementhelp');
          break;
        case OverlayKind.BUILDING_HELP:
          active.add('buildinghelp');
          break;
        case OverlayKind.BUILDING_LIMIT_HELP:
          active.add('buildinglimithelp');
          break;
        case OverlayKind.BRIDGE_HELP:
          active.add('bridgehelp');
          break;
        case OverlayKind.WATCHING_PROMPT:
          active.add('watchingprompt');
          break;
        case OverlayKind.STUN_CHOICE:
          active.add('stunchoice');
          break;
        case OverlayKind.BUILDER_BUILD:
          active.add('builderbuild');
          break;
      }
    }
    return active;
  }

  refresh(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    const active = this.active();
    for (const key of Object.keys(this.entries)) {
      const entry = this.entries[key]!;
      const shouldShow = active.has(key);
      if (shouldShow && !entry.mounted) {
        entry.hiding = false;
        entry.mounted = entry.make();
        entry.mounted.mount(this.host, this.root);
      } else if (!shouldShow && entry.mounted && !entry.hiding) {
        entry.hiding = true;
        const mounted = entry.mounted;
        const done = (): void => {
          mounted.destroy();
          if (entry.mounted === mounted) entry.mounted = null;
          entry.hiding = false;
          this.refreshing = false;
          this.refresh();
        };
        if (mounted.hide) {
          mounted.hide(done);
        } else {
          done();
        }
      }
    }
    this.refreshing = false;
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    for (const key of Object.keys(this.entries)) {
      const entry = this.entries[key]!;
      if (entry.mounted) {
        entry.mounted!.destroy();
        entry.mounted = null;
      }
    }
    this.root.destroy({ children: true });
  }
}
