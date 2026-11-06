import type { AiDirectives } from '../../types/directives';

/** True while a strategy goal is mustering the army (units hold back from
 *  suicidal solo trades until the massed strike is ready). */
export function mustering(directives: AiDirectives | undefined): boolean {
  return directives?.muster !== undefined && directives?.muster !== null;
}
