import { RUNTIME_STATES } from "../shared/constants";
import type { RuntimeState } from "../shared/runtime-types";

export function createRuntimeState() {
  let currentState: RuntimeState = RUNTIME_STATES.ACTIVE;
  let currentReason: string | null = null;

  return {
    current() {
      return currentState;
    },
    reason() {
      return currentReason;
    },
    disableAtStartup(message: string) {
      currentState = RUNTIME_STATES.DISABLED_AT_STARTUP;
      currentReason = message;
    },
    disableAfterRuntimeError(message: string) {
      currentState = RUNTIME_STATES.DISABLED_AFTER_RUNTIME_ERROR;
      currentReason = message;
    },
  };
}
