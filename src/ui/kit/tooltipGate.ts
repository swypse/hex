import { useGameStore } from '../../store/gameStore';

/** Whether hover tooltips should be shown. Disabled entirely on the tutorial
 * screen so its highlight pulses and banners stay unobstructed. */
export function tooltipsEnabled(): boolean {
  return !useGameStore.getState().tutorial;
}
