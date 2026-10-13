/** Delivers the confirmation code. Implement it to switch the mail provider. */
export interface EmailSender {
  sendConfirmationCode(to: string, name: string, code: string): Promise<void>;
}

/** Dev sender: prints the code instead of mailing it. */
export class ConsoleEmailSender implements EmailSender {
  async sendConfirmationCode(to: string, _name: string, code: string): Promise<void> {
    console.log(`[auth] confirmation code for ${to}: ${code}`);
  }
}
