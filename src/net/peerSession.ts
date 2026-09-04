import { GameEvent } from '../game/events';
import { GameStateSnapshot } from '../game/state';
import { Command } from '../game/simulator';
import { Tribe } from '../game/tribes';

export type ClientMessage =
  | { type: 'join'; name: string }
  | { type: 'pickTribe'; tribeId: Tribe }
  | { type: 'ready' }
  | { type: 'command'; cmd: Command };

export type HostMessage =
  | { type: 'lobbyUpdate'; joined: LobbyPlayer[]; totalPlayers: number; aiCount: number }
  | { type: 'state'; state: GameStateSnapshot; playerIndex: number }
  | { type: 'events'; events: GameEvent[] }
  | { type: 'playersOnline'; online: boolean[] }
  | { type: 'error'; message: string };

export interface LobbyPlayer {
  peerId: string;
  name: string;
  tribeId: Tribe | null;
  isHost: boolean;
  ready: boolean;
}

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function isRoomCode(value: string): boolean {
  if (value.length !== 6) return false;
  for (const ch of value) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
