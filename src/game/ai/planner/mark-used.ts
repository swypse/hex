import { AiActionType } from '@enums';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { key } from '../util/tile-key';

export function markUsed(state: AiPlannerState, action: AiAction): void {
  switch (action.type) {
    case AiActionType.MOVE:
      state.moved.add(action.unitId);
      state.occupied.add(key(action.q, action.r));
      break;
    case AiActionType.ATTACK:
    case AiActionType.HEAL:
    case AiActionType.CAPTURE:
    case AiActionType.EXTINGUISH:
      state.acted.add(action.unitId);
      break;
    case AiActionType.SPAWN:
      state.spawned.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case AiActionType.UPGRADE:
      state.upgraded.add(key(action.q, action.r));
      break;
    case AiActionType.BUILD:
      state.plannedKinds?.add(action.kind);
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case AiActionType.BUILD_ROAD:
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case AiActionType.BUILD_BRIDGE:
      state.built.add(key(action.q, action.r));
      state.occupied.add(key(action.q, action.r));
      break;
    case AiActionType.REPAIR:
    case AiActionType.DESTROY_BUILDING:
      state.built.add(key(action.q, action.r));
      break;
    case AiActionType.UPGRADE_SHIP:
      state.acted.add(action.unitId);
      break;
    case AiActionType.STUN:
    case AiActionType.ENABLE_STEALTH:
    case AiActionType.STORM:
    case AiActionType.TRAP:
    case AiActionType.BURN:
    case AiActionType.BURN_ROAD:
      state.acted.add(action.unitId);
      break;
    case AiActionType.BUILDER_BUILD:
      state.acted.add(action.unitId);
      state.built.add(key(action.q, action.r));
      break;
    case AiActionType.OPEN_SKILL:
      state.opened.add(action.skill);
      break;
    case AiActionType.LIGHTNING:
      state.lightningCalled = true;
      break;
  }
}
