import { describe, expect, it } from 'vitest';
import { sendMail, type SmtpConnection } from '../worker/src/auth/smtp';

/** Scripted server: replies to each client write with the next canned reply. */
function fakeServer(replies: string[]) {
  const written: string[] = [];
  const queue = [...replies];
  let pending: string[] = [queue.shift()!];
  const conn: SmtpConnection = {
    async read() {
      return pending.shift() ?? '';
    },
    async write(data) {
      written.push(data);
      const next = queue.shift();
      if (next !== undefined) pending.push(next);
    },
    async close() {},
  };
  return { conn, written };
}

const MAIL = { from: 'game@gmail.com', to: 'ann@example.com', subject: 'Code 123456', text: 'Your code is 123456' };

describe('smtp sendMail', () => {
  it('runs the SMTP dialogue with AUTH PLAIN and a base64 body', async () => {
    const { conn, written } = fakeServer([
      '220 smtp.gmail.com ESMTP\r\n',
      '250-smtp.gmail.com\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n',
      '235 2.7.0 Accepted\r\n',
      '250 OK\r\n',
      '250 OK\r\n',
      '354 go ahead\r\n',
      '250 OK queued\r\n',
    ]);
    await sendMail(conn, { user: 'game@gmail.com', password: 'app-pass' }, MAIL);
    expect(written[0]).toBe('EHLO hex-game\r\n');
    expect(written[1]).toBe(`AUTH PLAIN ${btoa('\0game@gmail.com\0app-pass')}\r\n`);
    expect(written[2]).toBe('MAIL FROM:<game@gmail.com>\r\n');
    expect(written[3]).toBe('RCPT TO:<ann@example.com>\r\n');
    expect(written[4]).toBe('DATA\r\n');
    expect(written[5]).toMatch(/\r\n\.\r\n$/);
    expect(written[6]).toBe('QUIT\r\n');
  });

  it('fails when authentication is refused', async () => {
    const { conn } = fakeServer(['220 hi\r\n', '250 ok\r\n', '535 5.7.8 Bad credentials\r\n']);
    await expect(sendMail(conn, { user: 'u', password: 'p' }, MAIL)).rejects.toThrow('535');
  });
});
