import { type Player } from '@/game/players';
import { type Selection } from '@/game/units/selection';
import { type GameStateSnapshot } from '@/game/state';
import type { LobbyPlayer } from '@/net/peer-session';
import { activeMatchStore } from '@/storage/active-match';
import { ConnectionState, GameMode, LobbyRole, NetMode, OverlayKind, PauseReason, Screen, SkillId, TutorialStepId } from '@enums';
import { create } from 'zustand';
import type { WeatherEvent } from '@/game/weather/weather';

/** Optional styling for the icon chip shown above a center message. */
interface IconChipStyle {
  size: number;
  bgColor: number;
}

export type OverlayState =
  | null
  | { kind: OverlayKind.SPAWN }
  | { kind: OverlayKind.SKILL }
  | { kind: OverlayKind.STATS }
  | { kind: OverlayKind.ACHIEVEMENTS }
  | { kind: OverlayKind.WELCOME }
  | { kind: OverlayKind.LEAVE }
  | { kind: OverlayKind.UNIT_HELP }
  | { kind: OverlayKind.SETTLEMENT_HELP }
  | { kind: OverlayKind.BUILDING_HELP }
  | { kind: OverlayKind.BUILDING_LIMIT_HELP }
  | { kind: OverlayKind.BRIDGE_HELP }
  | { kind: OverlayKind.SHIP_LANDING; target: { q: number; r: number } }
  | { kind: OverlayKind.MOVE_ATTACK; target: { q: number; r: number } }
  | { kind: OverlayKind.STALKER_REVEAL; target: { q: number; r: number } }
  | { kind: OverlayKind.STUN_CHOICE; target: { q: number; r: number } }
  | { kind: OverlayKind.BONUS_LEAVE; target: { q: number; r: number } }
  | { kind: OverlayKind.BUILDER_BUILD }
  | { kind: OverlayKind.THORN_TRAP }
  | { kind: OverlayKind.DISBAND; unitId: string }
  | { kind: OverlayKind.VETERAN_BONUS; unitId: string }
  | { kind: OverlayKind.VILLAGE_UPGRADE; q: number; r: number }
  | { kind: OverlayKind.TRADE }
  | { kind: OverlayKind.HELP }
  | { kind: OverlayKind.TRADE_PROPOSAL }
  | { kind: OverlayKind.WATCHING_PROMPT };

interface LobbyState {
  role: LobbyRole;
  code: string;
  mode: GameMode;
  totalPlayers: number;
  aiCount: number;
  players: LobbyPlayer[];
}

interface GameStore {
  screen: Screen;
  players: Player[];
  turn: number;
  /** Weather events active now, for the HUD. */
  weather: WeatherEvent[];
  currentPlayerIndex: number;
  aiActive: boolean;
  selection: Selection | null;
  /** Hex whose long-press / right-click context menu is open (always the selected hex). */
  contextMenu: { q: number; r: number } | null;
  overlay: OverlayState;
  mode: GameMode;
  gameOver: boolean;
  winnerIndex: number | null;
  watching: boolean;
  expectedTurns: number;
  bonusAwarded: boolean;
  /** Bumped to show the transient "Your turn" banner; it is not part of the center message queue. */
  turnBannerNonce: number;
  centerMessage: string | null;
  centerMessageQueue: string[];
  centerIconFile: string | null;
  centerIconQueue: (string | null)[];
  centerChipStyle: IconChipStyle | null;
  centerChipQueue: (IconChipStyle | null)[];
  /** Per queued message: the tribe names of a collapsible "you meet" message, else null. */
  centerMeetQueue: (string[] | null)[];
  localPlayerIndex: number;
  netMode: NetMode;
  lobby: LobbyState | null;
  connection: ConnectionState;
  connectionMessage: string;
  pendingSnapshot: GameStateSnapshot | null;
  myPeerId: string;
  playersOnline: boolean[];
  texturesLoading: boolean;
  paused: PauseReason | null;
  pausedName: string;
  tutorial: boolean;
  tutorialStep: TutorialStepId | null;
  tutorialHighlightSkills: SkillId[];
  tutorialHighlightEndTurn: boolean;

  setScreen: (screen: Screen) => void;
  setPlayers: (players: Player[]) => void;
  setTurn: (turn: number) => void;
  setWeather: (weather: WeatherEvent[]) => void;
  setCurrentPlayerIndex: (index: number) => void;
  setAiActive: (active: boolean) => void;
  setSelection: (selection: Selection | null) => void;
  setContextMenu: (tile: { q: number; r: number } | null) => void;
  setOverlay: (overlay: OverlayState) => void;
  setMode: (mode: GameMode) => void;
  setGameOver: (over: boolean) => void;
  setWinnerIndex: (index: number | null) => void;
  setWatching: (v: boolean) => void;
  setExpectedTurns: (turns: number) => void;
  setBonusAwarded: (awarded: boolean) => void;
  showTurnBanner: () => void;
  setCenterMessage: (message: string | null, iconFile?: string | null, chipStyle?: IconChipStyle | null) => void;
  /** Announces newly met tribes in one message. Tribes met while an earlier "you meet" message is still queued join it. */
  queueMetTribes: (names: string[], iconFile: string | null, format: (names: string[]) => string) => void;
  setLocalPlayerIndex: (index: number) => void;
  setNetMode: (mode: NetMode) => void;
  setLobby: (lobby: LobbyState | null) => void;
  setConnection: (connection: ConnectionState) => void;
  setConnectionMessage: (message: string) => void;
  setPendingSnapshot: (snapshot: GameStateSnapshot | null) => void;
  setMyPeerId: (peerId: string) => void;
  setPlayersOnline: (online: boolean[]) => void;
  setTexturesLoading: (loading: boolean) => void;
  setPaused: (paused: PauseReason | null, name?: string) => void;
  setTutorial: (v: boolean) => void;
  setTutorialStep: (v: TutorialStepId | null) => void;
  setTutorialHighlightSkills: (v: SkillId[]) => void;
  setTutorialHighlightEndTurn: (v: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: Screen.START,
  players: [],
  turn: 1,
  weather: [],
  currentPlayerIndex: 0,
  aiActive: false,
  selection: null,
  contextMenu: null,
  overlay: null,
  mode: GameMode.CAPTURE,
  gameOver: false,
  winnerIndex: null,
  watching: false,
  expectedTurns: 0,
  bonusAwarded: false,
  turnBannerNonce: 0,
  centerMessage: null,
  centerMessageQueue: [],
  centerIconFile: null,
  centerIconQueue: [],
  centerChipStyle: null,
  centerChipQueue: [],
  centerMeetQueue: [],
  localPlayerIndex: 0,
  netMode: NetMode.SINGLE,
  lobby: null,
  connection: ConnectionState.IDLE,
  connectionMessage: '',
  pendingSnapshot: null,
  myPeerId: '',
  playersOnline: [],
  texturesLoading: false,
  paused: null,
  pausedName: '',
  tutorial: false,
  tutorialStep: null,
  tutorialHighlightSkills: [],
  tutorialHighlightEndTurn: false,

  setScreen: (screen) => {
    if (!suppressPush && get().screen !== screen) {
      if (screen === Screen.GAME) replaceHistory(screen);
      else pushHistory(screen);
    }
    if (get().screen === Screen.GAME && screen !== Screen.GAME) {
      set({
        centerMessage: null,
        centerMessageQueue: [],
        centerIconFile: null,
        centerIconQueue: [],
        centerChipStyle: null,
        centerChipQueue: [],
        centerMeetQueue: [],
        paused: null,
        pausedName: '',
      });
    }
    set({ screen });
  },
  setPlayers: (players) => set({ players }),
  setTurn: (turn) => set({ turn }),
  setWeather: (weather) => set({ weather }),
  setCurrentPlayerIndex: (index) => set({ currentPlayerIndex: index }),
  setAiActive: (active) => set({ aiActive: active }),
  setSelection: (selection) => set({ selection }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setOverlay: (overlay) => set({ overlay }),
  setMode: (mode) => set({ mode }),
  setGameOver: (over) => set({ gameOver: over }),
  setWinnerIndex: (index) => set({ winnerIndex: index }),
  setWatching: (watching) => set({ watching }),
  setExpectedTurns: (turns) => set({ expectedTurns: turns }),
  setBonusAwarded: (awarded) => set({ bonusAwarded: awarded }),
  showTurnBanner: () => set((s) => ({ turnBannerNonce: s.turnBannerNonce + 1 })),
  setCenterMessage: (message, iconFile = null, chipStyle = null) =>
    set((s) => {
      if (message === null) {
        const next = s.centerMessageQueue[0] ?? null;
        const nextIcon = next === null ? null : (s.centerIconQueue[0] ?? null);
        const nextStyle = next === null ? null : (s.centerChipQueue[0] ?? null);
        return {
          centerMessage: next,
          centerMessageQueue: next === null ? [] : s.centerMessageQueue.slice(1),
          centerIconFile: nextIcon,
          centerIconQueue: next === null ? [] : s.centerIconQueue.slice(1),
          centerChipStyle: nextStyle,
          centerChipQueue: next === null ? [] : s.centerChipQueue.slice(1),
          centerMeetQueue: next === null ? [] : (s.centerMeetQueue ?? []).slice(1),
        };
      }
      if (s.centerMessage !== null) {
        // The same message is never shown twice: a copy already queued is
        // dropped and the new one goes to the back of the queue.
        const keep = s.centerMessageQueue.map((m, i) => (m === message ? -1 : i)).filter((i) => i >= 0);
        return {
          centerMessageQueue: [...keep.map((i) => s.centerMessageQueue[i]!), message],
          centerIconQueue: [...keep.map((i) => s.centerIconQueue[i] ?? null), iconFile],
          centerChipQueue: [...keep.map((i) => s.centerChipQueue[i] ?? null), chipStyle],
          centerMeetQueue: [...keep.map((i) => s.centerMeetQueue?.[i] ?? null), null],
        };
      }
      return { centerMessage: message, centerIconFile: iconFile ?? null, centerChipStyle: chipStyle };
    }),
  queueMetTribes: (names, iconFile, format) => {
    if (names.length === 0) return;
    set((s) => {
      const meet = s.centerMeetQueue ?? [];
      const at = s.centerMessageQueue.findIndex((_, i) => meet[i]);
      if (s.centerMessage !== null && at >= 0) {
        const merged = [...meet[at]!, ...names.filter((n) => !meet[at]!.includes(n))];
        const queue = [...s.centerMessageQueue];
        queue[at] = format(merged);
        const metQueue = s.centerMessageQueue.map((_, i) => meet[i] ?? null);
        metQueue[at] = merged;
        return { centerMessageQueue: queue, centerMeetQueue: metQueue };
      }
      const message = format(names);
      if (s.centerMessage === null) return { centerMessage: message, centerIconFile: iconFile, centerChipStyle: null };
      return {
        centerMessageQueue: [...s.centerMessageQueue, message],
        centerIconQueue: [...s.centerIconQueue, iconFile],
        centerChipQueue: [...s.centerChipQueue, null],
        centerMeetQueue: [...s.centerMessageQueue.map((_, i) => meet[i] ?? null), names],
      };
    });
  },
  setLocalPlayerIndex: (index) => set({ localPlayerIndex: index }),
  setNetMode: (netMode) => set({ netMode }),
  setLobby: (lobby) => set({ lobby }),
  setConnection: (connection) => set({ connection }),
  setConnectionMessage: (connectionMessage) => set({ connectionMessage }),
  setPendingSnapshot: (pendingSnapshot) => set({ pendingSnapshot }),
  setMyPeerId: (myPeerId) => set({ myPeerId }),
  setPlayersOnline: (playersOnline) => set({ playersOnline }),
  setTexturesLoading: (texturesLoading) => set({ texturesLoading }),
  setPaused: (paused, name) => set({ paused, pausedName: paused === null ? '' : (name ?? '') }),
  setTutorial: (tutorial) => set({ tutorial }),
  setTutorialStep: (tutorialStep) => set({ tutorialStep }),
  setTutorialHighlightSkills: (tutorialHighlightSkills) => set({ tutorialHighlightSkills }),
  setTutorialHighlightEndTurn: (tutorialHighlightEndTurn) => set({ tutorialHighlightEndTurn }),
}));

const SCREENS: Screen[] = [Screen.START, Screen.SETUP, Screen.LOBBY, Screen.GAME];

let suppressPush = false;

/** View overlays the browser Back closes, rather than asking to leave the game. */
const BACK_CLOSES_OVERLAY = new Set<OverlayKind>([OverlayKind.SKILL, OverlayKind.STATS, OverlayKind.ACHIEVEMENTS, OverlayKind.TRADE, OverlayKind.HELP]);

/** Lets the visible screen consume a browser Back (e.g. a sub-step of the
 *  setup screen). Returning true keeps the current screen: the history entry
 *  that was popped is restored with a forward step. */
let backInterceptor: (() => boolean) | null = null;

export function setBackInterceptor(fn: (() => boolean) | null): void {
  backInterceptor = fn;
}

/** True when the visible screen consumed a Back. */
export function interceptBack(): boolean {
  return backInterceptor?.() ?? false;
}

function pushHistory(screen: Screen): void {
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') return;
  try {
    window.history.pushState({ screen }, '');
  } catch {
    // history API unavailable (e.g. sandboxed iframe); navigation still works
  }
}

/** Replaces the current history entry instead of stacking a new one. Entering
 *  the game replaces the launcher entry (setup/lobby) so that the browser Back
 *  from the game returns to the main menu, never to the game-setup screen. */
function replaceHistory(screen: Screen): void {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') return;
  try {
    window.history.replaceState({ screen }, '');
  } catch {
    // history API unavailable; navigation still works
  }
}

function applyScreenFromHistory(screen: Screen): void {
  suppressPush = true;
  try {
    useGameStore.getState().setScreen(screen);
  } finally {
    suppressPush = false;
  }
}

function onPopState(event: PopStateEvent): void {
  const store = useGameStore.getState();
  const current = store.screen;
  const raw = event.state?.screen;
  const target: Screen = SCREENS.includes(raw) ? raw : Screen.START;
  if (target === current) return;
  if (interceptBack()) {
    try {
      window.history.forward();
    } catch {
      // history API unavailable
    }
    return;
  }
  // Back closes an open view overlay (the skill tree...) instead of leaving the game.
  if (current === Screen.GAME && store.overlay && BACK_CLOSES_OVERLAY.has(store.overlay.kind)) {
    store.setOverlay(null);
    pushHistory(current);
    return;
  }
  if (current === Screen.GAME && !store.gameOver) {
    store.setOverlay({ kind: OverlayKind.LEAVE });
    pushHistory(current);
    return;
  }
  applyScreenFromHistory(target);
}

export function initNavigation(): void {
  if (typeof window === 'undefined') return;
  const current = useGameStore.getState().screen;
  try {
    window.history.replaceState({ screen: current }, '');
  } catch {
    // history API unavailable; back navigation is simply not wired up
  }
  window.addEventListener('popstate', onPopState);
}

export function confirmLeaveGame(): void {
  if (useGameStore.getState().netMode === NetMode.CLIENT) activeMatchStore.clear();
  useGameStore.getState().setOverlay(null);
  if (typeof window !== 'undefined' && typeof window.history?.replaceState === 'function') {
    try {
      window.history.replaceState({ screen: 'start' }, '');
    } catch {
      // ignore
    }
  }
  applyScreenFromHistory(Screen.START);
}

export function cancelLeaveGame(): void {
  useGameStore.getState().setOverlay(null);
}

/** Puts the store in the state of a fresh match: turn 1, player 0 local and to move, nothing selected. */
export function beginMatchState(match: { players: Player[]; mode: GameMode; expectedTurns: number; netMode: NetMode }): void {
  const store = useGameStore.getState();
  store.setPlayers(match.players);
  store.setMode(match.mode);
  store.setExpectedTurns(match.expectedTurns);
  store.setGameOver(false);
  store.setWinnerIndex(null);
  store.setBonusAwarded(false);
  store.setLocalPlayerIndex(0);
  store.setNetMode(match.netMode);
  store.setTurn(1);
  store.setCurrentPlayerIndex(0);
  store.setAiActive(false);
  store.setSelection(null);
}
