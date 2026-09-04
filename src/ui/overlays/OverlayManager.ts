import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { CenterMessage } from './CenterMessage';
import { ConfirmDialog } from './ConfirmDialog';
import { LeaveGameDialog } from './LeaveGameDialog';
import { ShipLandingDialog } from './ShipLandingDialog';
import { SpawnDialog } from './SpawnDialog';
import { SkillTree } from './SkillTree';
import { UnitHelpDialog } from './UnitHelpDialog';
import { GameOver } from './GameOver';
import { GameStats } from './GameStats';
import { WelcomeDialog } from './WelcomeDialog';

interface Overlay {
  mount(host: UIHost, root: Container): void;
  destroy(): void;
}

interface Entry {
  make: () => Overlay;
  mounted: Overlay | null;
}

export class OverlayManager {
  private readonly host: UIHost;
  private readonly root: Container;
  private readonly entries: Record<string, Entry> = {
    center: { make: () => new CenterMessage(), mounted: null },
    confirm: { make: () => new ConfirmDialog(), mounted: null },
    leave: { make: () => new LeaveGameDialog(), mounted: null },
    ship: { make: () => new ShipLandingDialog(), mounted: null },
    spawn: { make: () => new SpawnDialog(), mounted: null },
    skill: { make: () => new SkillTree(), mounted: null },
    gameover: { make: () => new GameOver(), mounted: null },
    stats: { make: () => new GameStats(), mounted: null },
    unithelp: { make: () => new UnitHelpDialog(), mounted: null },
    settlementhelp: { make: () => new UnitHelpDialog(), mounted: null },
    buildinghelp: { make: () => new UnitHelpDialog(), mounted: null },
    buildinglimithelp: { make: () => new UnitHelpDialog(), mounted: null },
    welcome: { make: () => new WelcomeDialog(), mounted: null },
  };
  private unsub: (() => void) | null = null;

  constructor(host: UIHost) {
    this.host = host;
    this.root = new Container();
    host.overlayLayer.addChild(this.root);
    this.unsub = useGameStore.subscribe(() => this.refresh());
    this.refresh();
  }

  private active(): Set<string> {
    const s = useGameStore.getState();
    const inGame = s.screen === 'game';
    const active = new Set<string>();
    if (s.centerMessage !== null) active.add('center');
    if (inGame && s.gameOver && s.winnerIndex !== null) active.add('gameover');
    if (inGame) {
      switch (s.overlay?.kind) {
        case 'confirm':
          active.add('confirm');
          break;
        case 'leave':
          active.add('leave');
          break;
        case 'shipLanding':
          active.add('ship');
          break;
        case 'spawn':
          active.add('spawn');
          break;
        case 'skill':
          active.add('skill');
          break;
        case 'stats':
          active.add('stats');
          break;
        case 'welcome':
          active.add('welcome');
          break;
        case 'unitHelp':
          active.add('unithelp');
          break;
        case 'settlementHelp':
          active.add('settlementhelp');
          break;
        case 'buildingHelp':
          active.add('buildinghelp');
          break;
        case 'buildingLimitHelp':
          active.add('buildinglimithelp');
          break;
      }
    }
    return active;
  }

  refresh(): void {
    const active = this.active();
    for (const key of Object.keys(this.entries)) {
      const entry = this.entries[key]!;
      const shouldShow = active.has(key);
      if (shouldShow && !entry.mounted) {
        entry.mounted = entry.make();
        entry.mounted.mount(this.host, this.root);
      } else if (!shouldShow && entry.mounted) {
        entry.mounted.destroy();
        entry.mounted = null;
      }
    }
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
