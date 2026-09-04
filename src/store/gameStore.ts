import { create } from 'zustand';
import type { LobbyPlayer } from '../net/peerSession';
import { Player } from '../game/players';
import { Selection } from '../game/selection';
import { GameStateSnapshot } from '../game/state';
import { GameMode } from '../game/gameMode';
import { Tribe } from '../game/tribes';

export type Screen = 'start' | 'setup' | 'lobby' | 'game';

export type { LobbyPlayer };

export type OverlayState =
  | null
  | { kind: 'spawn' }
  | { kind: 'skill' }
  | { kind: 'stats' }
  | { kind: 'welcome' }
  | { kind: 'leave' }
  | { kind: 'unitHelp' }
  | { kind: 'settlementHelp' }
  | { kind: 'buildingHelp' }
  | { kind: 'buildingLimitHelp' }
  | { kind: 'confirm'; target: { q: number; r: number } }
  | { kind: 'shipLanding'; target: { q: number; r: number } };

export interface LobbyState {
  role: 'host' | 'client';
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
  currentPlayerIndex: number;
  aiActive: boolean;
  selection: Selection | null;
  overlay: OverlayState;
  mode: GameMode;
  gameOver: boolean;
  winnerIndex: number | null;
  expectedTurns: number;
  bonusAwarded: boolean;
  centerMessage: string | null;
  centerMessageQueue: string[];
  localPlayerIndex: number;
  netMode: 'single' | 'host' | 'client';
  lobby: LobbyState | null;
  connection: 'idle' | 'connecting' | 'connected' | 'error';
  pendingSnapshot: GameStateSnapshot | null;
  myPeerId: string;
  playersOnline: boolean[];
  texturesLoading: boolean;

  setScreen: (screen: Screen) => void;
  setPlayers: (players: Player[]) => void;
  setTurn: (turn: number) => void;
  setCurrentPlayerIndex: (index: number) => void;
  setAiActive: (active: boolean) => void;
  setSelection: (selection: Selection | null) => void;
  setOverlay: (overlay: OverlayState) => void;
  setMode: (mode: GameMode) => void;
  setGameOver: (over: boolean) => void;
  setWinnerIndex: (index: number | null) => void;
  setExpectedTurns: (turns: number) => void;
  setBonusAwarded: (awarded: boolean) => void;
  setCenterMessage: (message: string | null) => void;
  setLocalPlayerIndex: (index: number) => void;
  setNetMode: (mode: 'single' | 'host' | 'client') => void;
  setLobby: (lobby: LobbyState | null) => void;
  setConnection: (connection: 'idle' | 'connecting' | 'connected' | 'error') => void;
  setPendingSnapshot: (snapshot: GameStateSnapshot | null) => void;
  setMyPeerId: (peerId: string) => void;
  setPlayersOnline: (online: boolean[]) => void;
  setTexturesLoading: (loading: boolean) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'start',
  players: [],
  turn: 1,
  currentPlayerIndex: 0,
  aiActive: false,
  selection: null,
  overlay: null,
  mode: 'capture',
  gameOver: false,
  winnerIndex: null,
  expectedTurns: 0,
  bonusAwarded: false,
  centerMessage: null,
  centerMessageQueue: [],
  localPlayerIndex: 0,
  netMode: 'single',
  lobby: null,
  connection: 'idle',
  pendingSnapshot: null,
  myPeerId: '',
  playersOnline: [],
  texturesLoading: false,

  setScreen: (screen) => {
    if (!suppressPush && get().screen !== screen) pushHistory(screen);
    set({ screen });
  },
  setPlayers: (players) => set({ players }),
  setTurn: (turn) => set({ turn }),
  setCurrentPlayerIndex: (index) => set({ currentPlayerIndex: index }),
  setAiActive: (active) => set({ aiActive: active }),
  setSelection: (selection) => set({ selection }),
  setOverlay: (overlay) => set({ overlay }),
  setMode: (mode) => set({ mode }),
  setGameOver: (over) => set({ gameOver: over }),
  setWinnerIndex: (index) => set({ winnerIndex: index }),
  setExpectedTurns: (turns) => set({ expectedTurns: turns }),
  setBonusAwarded: (awarded) => set({ bonusAwarded: awarded }),
  setCenterMessage: (message) =>
    set((s) => {
      if (message === null) {
        const next = s.centerMessageQueue[0] ?? null;
        return {
          centerMessage: next,
          centerMessageQueue: next === null ? [] : s.centerMessageQueue.slice(1),
        };
      }
      if (s.centerMessage !== null) {
        return { centerMessageQueue: [...s.centerMessageQueue, message] };
      }
      return { centerMessage: message };
    }),
  setLocalPlayerIndex: (index) => set({ localPlayerIndex: index }),
  setNetMode: (netMode) => set({ netMode }),
  setLobby: (lobby) => set({ lobby }),
  setConnection: (connection) => set({ connection }),
  setPendingSnapshot: (pendingSnapshot) => set({ pendingSnapshot }),
  setMyPeerId: (myPeerId) => set({ myPeerId }),
  setPlayersOnline: (playersOnline) => set({ playersOnline }),
  setTexturesLoading: (texturesLoading) => set({ texturesLoading }),
}));

const SCREENS: Screen[] = ['start', 'setup', 'lobby', 'game'];

let suppressPush = false;

function pushHistory(screen: Screen): void {
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') return;
  try {
    window.history.pushState({ screen }, '');
  } catch {
    // history API unavailable (e.g. sandboxed iframe); navigation still works
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
  const target: Screen = SCREENS.includes(raw) ? raw : 'start';
  if (target === current) return;
  if (current === 'game' && !store.gameOver) {
    store.setOverlay({ kind: 'leave' });
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
  useGameStore.getState().setOverlay(null);
  if (typeof window !== 'undefined' && typeof window.history?.replaceState === 'function') {
    try {
      window.history.replaceState({ screen: 'start' }, '');
    } catch {
      // ignore
    }
  }
  applyScreenFromHistory('start');
}

export function cancelLeaveGame(): void {
  useGameStore.getState().setOverlay(null);
}
