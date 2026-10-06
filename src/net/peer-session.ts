import { type GameEvent } from '../game/events';
import { type GameStateSnapshot } from '../game/state';
import { type Command } from '../game/simulator';
import { Tribe } from '../game/tribes';
import { ClientMessageType, HostMessageType } from '@enums';

export type ClientMessage =
  | { type: ClientMessageType.JOIN; name: string }
  | { type: ClientMessageType.PICK_TRIBE; tribeId: Tribe }
  | { type: ClientMessageType.READY }
  | { type: ClientMessageType.COMMAND; cmd: Command };

export type HostMessage =
  | { type: HostMessageType.LOBBY_UPDATE; joined: LobbyPlayer[]; totalPlayers: number; aiCount: number }
  | { type: HostMessageType.STATE; state: GameStateSnapshot; playerIndex: number }
  | { type: HostMessageType.EVENTS; events: GameEvent[] }
  | { type: HostMessageType.PLAYERS_ONLINE; online: boolean[] }
  | { type: HostMessageType.ERROR; message: string };

export interface LobbyPlayer {
  peerId: string;
  name: string;
  tribeId: Tribe | null;
  isHost: boolean;
  ready: boolean;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
