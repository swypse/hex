import { connect } from 'cloudflare:sockets';
import type { SmtpConnection } from './smtp';

const GMAIL_HOST = 'smtp.gmail.com';
const GMAIL_PORT = 465;

/** Implicit-TLS socket to Gmail SMTP. */
export async function connectToGmail(): Promise<SmtpConnection> {
  const socket = connect({ hostname: GMAIL_HOST, port: GMAIL_PORT }, { secureTransport: 'on', allowHalfOpen: false });
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  return {
    async read() {
      const { value, done } = await reader.read();
      return done ? '' : decoder.decode(value);
    },
    write: (data) => writer.write(encoder.encode(data)),
    close: () => socket.close(),
  };
}
