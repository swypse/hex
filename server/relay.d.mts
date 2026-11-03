export interface RelayServerHandle {
  url: string;
  close(): void;
}

export function createRelayServer(): Promise<RelayServerHandle>;
