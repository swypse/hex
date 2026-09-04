declare module 'ws' {
  export class WebSocket {
    constructor(url: string);
    readyState: number;
    on(event: string, listener: (...args: any[]) => void): this;
    send(data: string): void;
    close(): void;
  }
}
