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
import { tryConsumeBufferedJump, integratePlayer } from "./game/player.js";
import { startSpin, updateTricks } from "./game/tricks.js";

export function createGame() {
  const state = createInitialState();

  function reset() {
    resetRunState(state);
    resetPlatforms(state);
  }

  function start() {
    if (state.gameOver) reset();
    state.running = true;
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
  }

  function update(dt, input) {
    state.uiTime += dt;
    if (state.running) state.animTime += dt;

    state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
    state.player.coyote = Math.max(0, state.player.coyote - dt);
    state.player.landGrace = Math.max(0, state.player.landGrace - dt);
    state.lastLandQualityT = Math.max(0, state.lastLandQualityT - dt);
    if (state.lastLandQualityT === 0) state.lastLandQuality = null;

    const jumpPressed = input?.consumeJumpPressed?.() === true;
    const trickPressed = input?.consumeTrickPressed?.() === true;
    const trickIntent = input?.consumeTrickIntent?.() || "neutral";

    state.jumpHeld = input?.jumpHeld === true;

    // Air controls
    state.floatHeld = input?.floatHeld === true;

    // One-press dive pulse (S): consumed by game/player.js to latch p.diving.
    state.divePressed = input?.consumeDivePressed?.() === true;

    // Keep held flag for UI/debug if needed (no longer required for gameplay).
    state.diveHeld = input?.diveHeld === true;

    if (!state.running) {
      if (jumpPressed) {
        if (state.gameOver) reset();
        start();

        state.jumpBuffer = JUMP_BUFFER_SEC;
        tryConsumeBufferedJump(state);
      }
      return state;
    }

    const targetSpeed = clamp(
      SPEED_START + SPEED_RAMP_PER_SEC * state.animTime,
      SPEED_START,
      SPEED_MAX
    );
    const alpha = 1 - Math.exp(-SPEED_SMOOTH * dt);
    state.speed = clamp(state.speed + (targetSpeed - state.speed) * alpha, SPEED_START, SPEED_MAX);

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
