// src/game.js
// Orchestrator that keeps the same public API.

import {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  GROUND_Y,
  PLATFORM_H,
  SPEED_START,
  SPEED_MAX,
  SPEED_RAMP_PER_SEC,
  SPEED_SMOOTH,
  JUMP_BUFFER_SEC,
} from "./game/constants.js";

import { clamp } from "./game/utils.js";
import { createInitialState, resetRunState } from "./game/state.js";
import { resetPlatforms, scrollWorld, updatePlatforms } from "./game/platforms.js";
import {
  tryConsumeBufferedJump,
  integratePlayer,
  updateDash,
} from "./game/player.js";
import { startSpin, updateTricks } from "./game/tricks.js";

export function createGame() {
  const state = createInitialState();

  function reset() {
    resetRunState(state);
    resetPlatforms(state);
  }

  function armStart() {
    if (state.gameOver) reset();
    state.startReady = true;
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
    state.startReady = false;
  }

  function update(dt, input) {
    state.uiTime += dt;
    if (state.running) state.animTime += dt;

    state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
    state.player.coyote = Math.max(0, state.player.coyote - dt);
    state.player.landGrace = Math.max(0, state.player.landGrace - dt);
    state.lastLandQualityT = Math.max(0, state.lastLandQualityT - dt);
    if (state.lastLandQualityT === 0) state.lastLandQuality = null;

    const jumpPress = input?.consumeJumpPress?.() || { pressed: false, source: null };
    const jumpPressed = jumpPress.pressed === true;
    const jumpSource = jumpPress.source;
    const trickPressed = input?.consumeTrickPressed?.() === true;
    const trickIntent = input?.consumeTrickIntent?.() || "neutral";
    const dashPressed = input?.consumeDashPressed?.() === true;

    state.jumpHeld = input?.jumpHeld === true;
    state.floatHeld = input?.floatHeld === true;

    // One-press pulses
    state.divePressed = input?.consumeDivePressed?.() === true;
    state.dashPressed = dashPressed;

    // Kept for UI/debug only
    state.diveHeld = input?.diveHeld === true;

    if (!state.running) {
      // Menu flow: click/tap play to arm, then press Space to launch the run.
      if (jumpPressed && jumpSource === "pointer") {
        armStart();
      }

      if (state.startReady && jumpPressed && jumpSource === "Space") {
        state.running = true;
        state.startReady = false;
        state.jumpBuffer = JUMP_BUFFER_SEC;
        tryConsumeBufferedJump(state);
      }

      return state;
    }

    // DASH LOGIC (world-speed impulse)
    updateDash(state, dt);

    // Base world speed (difficulty ramp)
    const baseSpeed = clamp(
      SPEED_START + SPEED_RAMP_PER_SEC * state.animTime,
      SPEED_START,
      SPEED_MAX
    );

    // Dash adds to world speed, not player position
    const impulse = state.speedImpulse || 0;
    const desiredSpeed = baseSpeed + impulse;

    const alpha = 1 - Math.exp(-SPEED_SMOOTH * dt);
    state.speed = clamp(
      state.speed + (desiredSpeed - state.speed) * alpha,
      SPEED_START,
      SPEED_MAX + impulse
    );

    if (jumpPressed) state.jumpBuffer = JUMP_BUFFER_SEC;
    if (trickPressed) startSpin(state, trickIntent);

    state.distance += state.speed * dt;

    scrollWorld(state, dt);
    updatePlatforms(state, dt);
    updateTricks(state, dt);
    integratePlayer(state, dt, endGame);

    tryConsumeBufferedJump(state);
    return state;
  }

  reset();
  return { state, reset, update };
}

export const world = {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  GROUND_Y,
  PLATFORM_H,
};
