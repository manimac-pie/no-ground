// src/game/player.js
// Player physics + movement integration.
// Exports integratePlayer() used by src/game.js.

import * as C from "./constants.js";
import { clamp } from "./utils.js";

function getConst(name, fallback) {
  const v = C[name];
  return Number.isFinite(v) ? v : fallback;
}

// Feel-good helpers (fallbacks if constants are missing)
const GRAVITY = getConst("GRAVITY", 1800);
const FALL_GRAVITY_MULT = getConst("FALL_GRAVITY_MULT", 1.2);
const JUMP_CUT_MULT = getConst("JUMP_CUT_MULT", 2.0);
const JUMP_CUT_RAMP_PER_SEC = getConst("JUMP_CUT_RAMP_PER_SEC", 18);
const MAX_FALL_SPEED = getConst("MAX_FALL_SPEED", 1800);
const DIVE_GRAVITY_MULT = getConst("DIVE_GRAVITY_MULT", 2.2);
const DIVE_MAX_FALL_SPEED = getConst("DIVE_MAX_FALL_SPEED", 2200);

const GROUND_Y = getConst("GROUND_Y", 390);
const COYOTE_TIME_SEC = getConst("COYOTE_TIME_SEC", 0.13);
const LAND_GRACE_SEC = getConst("LAND_GRACE_SEC", 0.06);
const JUMP_BUFFER_SEC = getConst("JUMP_BUFFER_SEC", 0.13);

const JUMP_VELOCITY = getConst("JUMP_VELOCITY", -630);

// Dive timing tunables (optional)
const DIVE_ANTICIPATION_SEC = getConst("DIVE_ANTICIPATION_SEC", 0.11);

// Float tunables (optional)
const FLOAT_FUEL_MAX = getConst("FLOAT_FUEL_MAX", 1.0);
const FLOAT_GRAVITY_MULT = getConst("FLOAT_GRAVITY_MULT", 0.35);
const FLOAT_FUEL_REGEN_PER_SEC = getConst("FLOAT_FUEL_REGEN_PER_SEC", 0.7);

function canJumpNow(state) {
  const p = state.player;
  if (!p || p.jumpsRemaining <= 0) return false;

  // Rule:
  // - If you still have both jumps, treat it as the first jump.
  //   Allowed if grounded OR within coyote OR land grace.
  // - If you have 1 jump left, it can be used mid-air any time.
  if (p.jumpsRemaining === 2) {
    return p.onGround || (p.coyote ?? 0) > 0 || (p.landGrace ?? 0) > 0;
  }
  return true;
}

export function performJump(state) {
  const p = state.player;
  if (!p) return;

  p.vy = JUMP_VELOCITY;
  p.onGround = false;
  p.coyote = 0;
  p.jumpsRemaining = Math.max(0, (p.jumpsRemaining ?? 0) - 1);
}

export function tryConsumeBufferedJump(state) {
  if (!state) return false;
  if ((state.jumpBuffer ?? 0) <= 0) return false;
  if (!canJumpNow(state)) return false;

  state.jumpBuffer = 0;
  performJump(state);
  return true;
}

function updateDivePhase(state, dt, airborne) {
  const p = state.player;
  if (!p) return;

  // Defaults
  if (typeof p.diving !== "boolean") p.diving = false;
  if (typeof p.divePhase !== "string") p.divePhase = "";
  if (!Number.isFinite(p.divePhaseT)) p.divePhaseT = 0;

  // Latch dive on pulse
  if (airborne && state.divePressed === true) {
    p.diving = true;
    p.divePhase = "anticipate";
    p.divePhaseT = 0;

    // Cancel trick/spin state if present
    if (p.spinning) p.spinning = false;
    if (Number.isFinite(p.spinT)) p.spinT = 0;
    if (Number.isFinite(p.spinProg)) p.spinProg = 0;
    if (Number.isFinite(p.trickLandWindow)) p.trickLandWindow = 0;

    // Avoid diving while still rising
    if ((p.vy ?? 0) < 220) p.vy = 220;
  }

  // Advance phases
  if (airborne && p.diving) {
    p.divePhaseT += dt;
    if (p.divePhase === "anticipate" && p.divePhaseT >= DIVE_ANTICIPATION_SEC) {
      p.divePhase = "commit";
      p.divePhaseT = 0;
    }
  } else {
    p.divePhase = "";
    p.divePhaseT = 0;
  }
}

function smoothstep01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function integratePlayer(state, dt, endGame) {
  const p = state.player;
  if (!p) return;

  // Defensive defaults
  if (!Number.isFinite(p.vy)) p.vy = 0;
  if (typeof p.onGround !== "boolean") p.onGround = false;
  if (!Number.isFinite(p.coyote)) p.coyote = 0;
  if (!Number.isFinite(p.landGrace)) p.landGrace = 0;
  if (!Number.isFinite(state.jumpCut)) state.jumpCut = 0;

  const wasOnGround = p.onGround;
  const wasDiving = p.diving === true;

  // Will be set if we find supporting ground this frame.
  p.groundPlat = null;

  const airborne = !p.onGround;
  updateDivePhase(state, dt, airborne);

  // Gravity with feel adjustments
  let g = GRAVITY;
  let maxFall = MAX_FALL_SPEED;

  // Initialize float fuel on first use
  if (!Number.isFinite(p.floatFuel)) p.floatFuel = FLOAT_FUEL_MAX;

  if (p.vy > 0) {
    // Falling
    state.jumpCut = 0;
    g *= FALL_GRAVITY_MULT;
  } else if (p.vy < 0) {
    // Rising
    const held = state.jumpHeld === true;
    if (held) {
      state.jumpCut = 0;
    } else {
      state.jumpCut = clamp(state.jumpCut + JUMP_CUT_RAMP_PER_SEC * dt, 0, 1);
    }

    const cutMult = 1 + (JUMP_CUT_MULT - 1) * state.jumpCut;
    g *= cutMult;
  } else {
    state.jumpCut = 0;
  }

  // Float (reduces gravity while fuel lasts)
  if (airborne && state.floatHeld === true && !p.diving && p.floatFuel > 0) {
    g *= FLOAT_GRAVITY_MULT;
    p.floatFuel = Math.max(0, p.floatFuel - dt);
  }

  // Dive (heavier gravity, higher terminal speed) — smoothly ramp in
  if (airborne && p.diving === true) {
    const t = (p.divePhase === "anticipate" && Number.isFinite(p.divePhaseT))
      ? (p.divePhaseT / Math.max(0.001, DIVE_ANTICIPATION_SEC))
      : 1;
    const blend = smoothstep01(t);
    g *= 1 + (DIVE_GRAVITY_MULT - 1) * blend;
    maxFall = MAX_FALL_SPEED + (DIVE_MAX_FALL_SPEED - MAX_FALL_SPEED) * blend;
  }

  // Regen float fuel when grounded
  if (p.onGround && p.floatFuel < FLOAT_FUEL_MAX) {
    p.floatFuel = Math.min(FLOAT_FUEL_MAX, p.floatFuel + FLOAT_FUEL_REGEN_PER_SEC * dt);
  }

  p.vy += g * dt;
  if (p.vy > maxFall) p.vy = maxFall;

  const prevY = p.y;
  p.y += p.vy * dt;

  // Landing / platform collision (only from above)
  p.onGround = false;

  const px1 = p.x;
  const px2 = p.x + p.w;
  const prevBottom = prevY + p.h;
  const bottom = p.y + p.h;

  if (p.vy >= 0 && Array.isArray(state.platforms)) {
    for (const plat of state.platforms) {
      if (!plat) continue;
      if (plat.collapsing) continue;

      const top = plat.y;
      const left = plat.x;
      const right = plat.x + plat.w;

      const overlapsX = px2 > left && px1 < right;
      const crossedTop = prevBottom <= top && bottom >= top;

      if (overlapsX && crossedTop) {
        p.y = top - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumpsRemaining = 2;
        p.coyote = COYOTE_TIME_SEC;
        p.landGrace = LAND_GRACE_SEC;
        p.groundPlat = plat;

        // Landing ends dive mode + resets float fuel if present
        if (wasDiving && !state.heavyLandT) {
          state.heavyLandT = 0.30;
        }
        p.diving = false;
        p.divePhase = "";
        p.divePhaseT = 0;
        if (Number.isFinite(p.floatFuel)) {
          p.floatFuel = FLOAT_FUEL_MAX;
        }

        break;
      }
    }
  }

  if (!p.onGround && wasOnGround) {
    p.coyote = COYOTE_TIME_SEC;
  }

  // Lethal ground
  const playerBottom = p.y + p.h;
  if (playerBottom >= GROUND_Y + 1) {
    if (typeof endGame === "function") endGame();
    else {
      state.running = false;
      state.gameOver = true;
    }
    return;
  }

  if (state.heavyLandT > 0) {
    state.heavyLandT = Math.max(0, state.heavyLandT - dt);
  }
}

// Convenience: allow game loop to buffer jump presses here if it wants.
export function bufferJump(state) {
  state.jumpBuffer = JUMP_BUFFER_SEC;
}
