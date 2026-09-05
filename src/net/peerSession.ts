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

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const METERED_CREDENTIALS_URL = 'https://swypse-hex.metered.live/api/v1/turn/credentials';
const METERED_API_KEY = 'd468f3bc240e173eb3d8367ceadd11fd5e86';

let iceServersPromise: Promise<RTCIceServer[]> | null = null;

export function fallbackIceServers(): RTCIceServer[] {
  return STUN_SERVERS.map((s) => ({ ...s }));
}

export function meteredTurnCredentialsUrl(): string {
  return `${METERED_CREDENTIALS_URL}?apiKey=${encodeURIComponent(METERED_API_KEY)}`;
}

function asIceServers(data: unknown): RTCIceServer[] | null {
  const list =
    Array.isArray(data)
      ? data
      : data !== null && typeof data === 'object'
        ? (data as { iceServers?: unknown }).iceServers
        : undefined;
  if (!Array.isArray(list)) return null;
  const valid = list.filter(
    (s): s is RTCIceServer =>
      s !== null &&
      typeof s === 'object' &&
      (typeof (s as { urls?: unknown }).urls === 'string' || Array.isArray((s as { urls?: unknown }).urls)),
  );
  return valid.length > 0 ? valid : null;
}

function loadIceServers(): Promise<RTCIceServer[]> {
  if (typeof RTCPeerConnection === 'undefined') return Promise.resolve(fallbackIceServers());
  if (!iceServersPromise) {
    iceServersPromise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(meteredTurnCredentialsUrl(), { signal: controller.signal });
        if (!res.ok) return fallbackIceServers();
        return asIceServers(await res.json()) ?? fallbackIceServers();
      } catch {
        iceServersPromise = null;
        return fallbackIceServers();
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return iceServersPromise;
}

export function buildPeerConfig(iceServers: RTCIceServer[]): RTCConfiguration {
  return { iceServers };
}

export interface HostSessionEvents {
  onOpen: (peerId: string, conn: DataConnection) => void;
  onData: (peerId: string, msg: ClientMessage) => void;
  onClose: (peerId: string) => void;
  onError?: (err: Error) => void;
}

export class HostSession {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private started = false;

  constructor(private events: HostSessionEvents) {}

  open(code: string): void {
    void this.start(hostPeerId(code));
  }

  private async start(peerId: string): Promise<void> {
    const iceServers = await loadIceServers();
    if (this.started) return;
    this.started = true;
    this.peer = new Peer(peerId, { debug: 1, config: buildPeerConfig(iceServers) });
    this.peer.on('connection', (conn) => this.attach(conn));
    this.peer.on('error', (err) => this.events.onError?.(err));
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

const MAX_CONNECT_ATTEMPTS = 6;
const CONNECT_RETRY_DELAY_MS = 1000;
const CONNECT_ATTEMPT_TIMEOUT_MS = 6000;

export class ClientSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private peerId: string | null = null;
  private started = false;
  private stopped = false;
  private connected = false;
  private joinCode = '';
  private joinName = '';
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private events: ClientSessionEvents) {}

  getPeerId(): string | null {
    return this.peerId;
  }

  join(code: string, name: string): void {
    this.peerId = generateClientId();
    this.joinCode = code;
    this.joinName = name;
    void this.start();
  }

  private async start(): Promise<void> {
    const iceServers = await loadIceServers();
    if (this.stopped || !this.peerId || this.started) return;
    this.started = true;
    this.peer = new Peer(this.peerId, { debug: 1, config: buildPeerConfig(iceServers) });
    this.peer.on('open', () => this.tryConnect());
    this.peer.on('error', (err) => this.handlePeerError(err));
  }

  private tryConnect(): void {
    if (this.stopped || this.connected || !this.peer) return;
    this.attempts++;
    if (this.attemptTimer) {
      clearTimeout(this.attemptTimer);
      this.attemptTimer = null;
    }
    const conn = this.peer.connect(hostPeerId(this.joinCode), { reliable: true });
    this.conn = conn;
    let settled = false;
    conn.on('open', () => {
      if (this.conn !== conn) return;
      settled = true;
      this.clearAttemptTimer();
      this.clearRetryTimer();
      this.connected = true;
      conn.send({ type: 'join', name: this.joinName } satisfies ClientMessage);
      conn.on('data', (data) => {
        if (typeof data === 'object' && data !== null && 'type' in data) {
          this.events.onData(data as HostMessage);
        }
      });
      conn.on('close', () => {
        if (this.conn !== conn) return;
        this.conn = null;
        this.events.onClose();
      });
      this.events.onOpen();
    });
    conn.on('close', () => {
      if (settled) return;
      settled = true;
      this.clearAttemptTimer();
      this.scheduleRetry();
    });
    this.attemptTimer = setTimeout(() => {
      if (settled || this.conn !== conn) return;
      settled = true;
      this.attemptTimer = null;
      this.scheduleRetry();
    }, CONNECT_ATTEMPT_TIMEOUT_MS);
  }

  private handlePeerError(err: Error): void {
    if (this.stopped || this.connected) return;
    const type = (err as { type?: string }).type;
    if (type === 'peer-unavailable') {
      this.scheduleRetry();
      return;
    }
    this.fail(new Error(`Connection error: ${err.message}`));
  }

  private scheduleRetry(): void {
    if (this.stopped || this.connected || this.retryTimer) return;
    if (this.attempts >= MAX_CONNECT_ATTEMPTS) {
      this.fail(new Error(`Could not connect to room ${this.joinCode}. Check the code and that the host is still in the room.`));
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.tryConnect();
    }, CONNECT_RETRY_DELAY_MS);
  }

  private fail(err: Error): void {
    if (this.stopped || this.connected) return;
    this.clearAttemptTimer();
    this.clearRetryTimer();
    this.events.onError(err);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private clearAttemptTimer(): void {
    if (this.attemptTimer) {
      clearTimeout(this.attemptTimer);
      this.attemptTimer = null;
    }
  }

  send(msg: ClientMessage): void {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  close(): void {
    this.stopped = true;
    this.clearAttemptTimer();
    this.clearRetryTimer();
    this.conn?.close();
    this.conn = null;
    this.peer?.destroy();
    this.peer = null;
  }
}
