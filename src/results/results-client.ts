import type { AuthResult } from '../auth/auth-types';
import { apiOrigin, jsonCall } from '../auth/json-call';
import type { GameResultInput, TribeBest } from './result-types';

/** Finished-game results of the logged-in user. `HttpResultsClient` talks to
 *  the worker; implement it to use another backend. */
export interface ResultsClient {
  submit(token: string, result: GameResultInput): Promise<AuthResult>;
  /** One entry per tribe (zeroed when never played). */
  best(token: string): Promise<AuthResult<TribeBest[]>>;
}

const RESULTS_PATH = '/api/results';

export class HttpResultsClient implements ResultsClient {
  constructor(
    private readonly baseUrl: () => string = () => {
      const url = apiOrigin();
      url.pathname = RESULTS_PATH;
      return url.toString();
    },
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  submit(token: string, result: GameResultInput): Promise<AuthResult> {
    return jsonCall(this.fetchFn, this.baseUrl(), 'POST', result, token);
  }

  best(token: string): Promise<AuthResult<TribeBest[]>> {
    return jsonCall(this.fetchFn, `${this.baseUrl()}/best`, 'GET', undefined, token);
  }
}
