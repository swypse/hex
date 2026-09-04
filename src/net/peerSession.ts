import Peer, { DataConnection } from 'peerjs';
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

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOST_PREFIX = 'hex-';
const CLIENT_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

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

export function generateClientId(): string {
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += CLIENT_ID_ALPHABET[Math.floor(Math.random() * CLIENT_ID_ALPHABET.length)];
  }
  return `guest-${id}`;
}

export function hostPeerId(code: string): string {
  return HOST_PREFIX + code;
}

export interface HostSessionEvents {
  onOpen: (peerId: string, conn: DataConnection) => void;
  onData: (peerId: string, msg: ClientMessage) => void;
  onClose: (peerId: string) => void;
}

export class HostSession {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();

  constructor(private events: HostSessionEvents) {}

  open(code: string): void {
    this.peer = new Peer(hostPeerId(code), { debug: 1 });
    this.peer.on('connection', (conn) => this.attach(conn));
  }

  private attach(conn: DataConnection): void {
    const peerId = conn.peer;
    conn.on('open', () => {
      this.conns.set(peerId, conn);
      this.events.onOpen(peerId, conn);
    });
    conn.on('data', (data) => {
      if (typeof data === 'object' && data !== null && 'type' in data) {
        this.events.onData(peerId, data as ClientMessage);
      }
    });
    conn.on('close', () => {
      this.conns.delete(peerId);
      this.events.onClose(peerId);
    });
  }

  sendTo(peerId: string, msg: HostMessage): void {
    const conn = this.conns.get(peerId);
    if (conn && conn.open) conn.send(msg);
  }

  broadcast(msg: HostMessage): void {
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send(msg);
    }
  }

  close(): void {
    for (const conn of this.conns.values()) conn.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}

export interface ClientSessionEvents {
  onOpen: () => void;
  onData: (msg: HostMessage) => void;
  onClose: () => void;
  onError: (err: Error) => void;
}

export class ClientSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private peerId: string | null = null;

  constructor(private events: ClientSessionEvents) {}

  getPeerId(): string | null {
    return this.peerId;
  }

  join(code: string, name: string): void {
    this.peerId = generateClientId();
    this.peer = new Peer(this.peerId, { debug: 1 });
    this.peer.on('open', () => {
      if (!this.peer) return;
      const conn = this.peer.connect(hostPeerId(code), { reliable: true });
      this.conn = conn;
      conn.on('open', () => {
        conn.send({ type: 'join', name } satisfies ClientMessage);
        this.events.onOpen();
      });
      conn.on('data', (data) => {
        if (typeof data === 'object' && data !== null && 'type' in data) {
          this.events.onData(data as HostMessage);
        }
      });
      conn.on('close', () => this.events.onClose());
    });
    this.peer.on('error', (err) => this.events.onError(err));
  }

  send(msg: ClientMessage): void {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close(): void {
    this.conn?.close();
    this.conn = null;
    this.peer?.destroy();
    this.peer = null;
  }
}
