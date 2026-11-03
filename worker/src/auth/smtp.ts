import type { EmailSender } from './email-sender';

/** Line-oriented duplex connection; lets the SMTP dialogue be tested without sockets. */
export interface SmtpConnection {
  /** Next chunk of server output. */
  read(): Promise<string>;
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface SmtpCredentials {
  user: string;
  password: string;
}

const CRLF = '\r\n';

/** Reads one complete (possibly multi-line) reply and returns its status code. */
async function readReply(conn: SmtpConnection, buffer: { text: string }): Promise<number> {
  for (;;) {
    const lines = buffer.text.split(CRLF);
    // Complete reply: a terminated line shaped "NNN <text>" (no dash after the code).
    for (let i = 0; i < lines.length - 1; i++) {
      const m = /^(\d{3}) /.exec(lines[i]!);
      if (m) {
        buffer.text = lines.slice(i + 1).join(CRLF);
        return Number(m[1]);
      }
    }
    const chunk = await conn.read();
    if (chunk === '') throw new Error('SMTP connection closed');
    buffer.text += chunk;
  }
}

async function command(conn: SmtpConnection, buffer: { text: string }, line: string, expect: number): Promise<void> {
  await conn.write(line + CRLF);
  const code = await readReply(conn, buffer);
  if (code !== expect) throw new Error(`SMTP ${line.split(' ')[0]} failed: ${code}`);
}

const b64 = (s: string): string => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/** Sends one message over an already connected (implicit TLS) SMTP connection. */
export async function sendMail(conn: SmtpConnection, creds: SmtpCredentials, mail: MailMessage): Promise<void> {
  const buffer = { text: '' };
  if ((await readReply(conn, buffer)) !== 220) throw new Error('SMTP greeting failed');
  await command(conn, buffer, 'EHLO hex-game', 250);
  await command(conn, buffer, `AUTH PLAIN ${b64(`\0${creds.user}\0${creds.password}`)}`, 235);
  await command(conn, buffer, `MAIL FROM:<${mail.from}>`, 250);
  await command(conn, buffer, `RCPT TO:<${mail.to}>`, 250);
  await command(conn, buffer, 'DATA', 354);
  const message = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: =?UTF-8?B?${b64(mail.subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(mail.text).replace(/.{1,76}/g, '$&\r\n').trimEnd(),
  ].join(CRLF);
  await command(conn, buffer, `${message}${CRLF}.`, 250);
  await conn.write(`QUIT${CRLF}`);
}

/** Sends confirmation codes through Gmail SMTP with an app password. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly creds: SmtpCredentials,
    private readonly connect: () => Promise<SmtpConnection>,
  ) {}

  async sendConfirmationCode(to: string, name: string, code: string): Promise<void> {
    const conn = await this.connect();
    try {
      await sendMail(conn, this.creds, {
        from: this.creds.user,
        to,
        subject: `Hex Terra confirmation code: ${code}`,
        text: `Hi ${name},\n\nYour Hex Terra confirmation code is ${code}.\nIt expires in 10 minutes.\n`,
      });
    } finally {
      await conn.close().catch(() => undefined);
    }
  }
}
