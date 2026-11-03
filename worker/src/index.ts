import { handleAuthRequest } from './auth/auth-routes';
import { AuthService } from './auth/auth-service';
import { ConsoleEmailSender, type EmailSender } from './auth/email-sender';
import { connectToGmail } from './auth/gmail-connection';
import { SmtpEmailSender } from './auth/smtp';
import { UserDirectory } from './auth/user-directory';
import { handleResultsRequest } from './results/results-routes';
import { ResultService } from './results/result-service';
import { RelayRoom, type Env } from './relay-room';

export { RelayRoom, UserDirectory };

const USER_DIRECTORY_NAME = 'main';

/** Gmail when its secrets are set, otherwise codes are only logged (dev). */
function emailSender(env: Env): EmailSender {
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return new SmtpEmailSender({ user: env.GMAIL_USER, password: env.GMAIL_APP_PASSWORD }, connectToGmail);
  }
  return new ConsoleEmailSender();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
      if (!code) {
        return new Response('Missing room code', { status: 400 });
      }
      const id = env.RELAY_ROOM.idFromName(code);
      const stub = env.RELAY_ROOM.get(id);
      return stub.fetch(request);
    }
    const directory = env.USER_DIRECTORY.get(env.USER_DIRECTORY.idFromName(USER_DIRECTORY_NAME));
    const authService = new AuthService(directory, emailSender(env));
    const auth = await handleAuthRequest(request, authService);
    if (auth) return auth;
    const results = await handleResultsRequest(request, authService, new ResultService(directory));
    if (results) return results;
    return new Response('hex relay', { headers: { 'content-type': 'text/plain' } });
  },
} satisfies ExportedHandler<Env>;
