// src/game/player.js
// Player physics + movement integration.
// Exports integratePlayer() used by src/game.js.

import * as C from "./constants.js";
import { clamp } from "./utils.js";

function getConst(name, fallback) {
  const v = C[name];
  return Number.isFinite(v) ? v : fallback;
}

// ---------------- constants ----------------
const GRAVITY = getConst("GRAVITY", 1800);
const FALL_GRAVITY_MULT = getConst("FALL_GRAVITY_MULT", 1.2);
const JUMP_CUT_MULT = getConst("JUMP_CUT_MULT", 2.0);
const JUMP_CUT_RAMP_PER_SEC = getConst("JUMP_CUT_RAMP_PER_SEC", 18);
const MAX_FALL_SPEED = getConst("MAX_FALL_SPEED", 1800);
const JUMP_IMPULSE_FX_SEC = getConst("JUMP_IMPULSE_FX_SEC", 0.18);

const DIVE_GRAVITY_MULT = getConst("DIVE_GRAVITY_MULT", 2.2);
const DIVE_MAX_FALL_SPEED = getConst("DIVE_MAX_FALL_SPEED", 2200);
const DIVE_ANTICIPATION_SEC = getConst("DIVE_ANTICIPATION_SEC", 0.11);
const DIVE_SCORE_BONUS = getConst("DIVE_SCORE_BONUS", 0);

const DUCK_HEIGHT_FRAC = getConst("DUCK_HEIGHT_FRAC", 0.5);
const DUCK_LAND_SQUAT_SEC = getConst("DUCK_LAND_SQUAT_SEC", 0.2);

const DASH_COOLDOWN = getConst("DASH_COOLDOWN", 0.45);
const DASH_SPEED_BOOST = getConst("DASH_SPEED_BOOST", 520);
const DASH_IMPULSE_DECAY = getConst("DASH_IMPULSE_DECAY", 6.5);
const DASH_IMPULSE_FX_SEC = getConst("DASH_IMPULSE_FX_SEC", 0.20);
const DASH_SCORE_BONUS = getConst("DASH_SCORE_BONUS", 0);

const SLOWFALL_FUEL_MAX = getConst("SLOWFALL_FUEL_MAX", 1.0);
const SLOWFALL_GRAVITY_MULT = getConst("SLOWFALL_GRAVITY_MULT", 0.30);
const SLOWFALL_FUEL_REGEN_PER_SEC = getConst("SLOWFALL_FUEL_REGEN_PER_SEC", 0.7);

const GROUND_Y = getConst("GROUND_Y", 390);
const COYOTE_TIME_SEC = getConst("COYOTE_TIME_SEC", 0.13);
const LAND_GRACE_SEC = getConst("LAND_GRACE_SEC", 0.06);
const JUMP_BUFFER_SEC = getConst("JUMP_BUFFER_SEC", 0.13);
const JUMP_VELOCITY = getConst("JUMP_VELOCITY", -630);
const BREAK_JIT_SCORE_BONUS = getConst("BREAK_JIT_SCORE_BONUS", 0);
const BILLBOARD_OVER_SCORE = getConst("BILLBOARD_OVER_SCORE", 50);
const BILLBOARD_UNDER_SCORE = getConst("BILLBOARD_UNDER_SCORE", 60);
const BILLBOARD_DASH_SCORE = getConst("BILLBOARD_DASH_SCORE", 130);
const BILLBOARD_BOUNCE_VY = getConst("BILLBOARD_BOUNCE_VY", 0);

// ---------------- helpers ----------------
function smoothstep01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function canJumpNow(state) {
  const p = state.player;
  if (!p || p.jumpsRemaining <= 0) return false;

  if (p.jumpsRemaining === 2) {
    return p.onGround
      || p.coyote > 0
      || p.landGrace > 0
      || p.breakGrace > 0;
  }
  return true;
}

// ---------------- jump ----------------
export function performJump(state) {
  const p = state.player;
  if (!p) return;

  if (p.onGround) {
    state.roofJumpT = 0.22;
  }

  p.vy = JUMP_VELOCITY;
  p.onGround = false;
  p.onBillboard = false;
  p.coyote = 0;
  p.jumpsRemaining = Math.max(0, p.jumpsRemaining - 1);
  p.jumpImpulseT = JUMP_IMPULSE_FX_SEC;

  if (p.breakGrace > 0 && p.breakJumpEligible === true) {
    state.score += BREAK_JIT_SCORE_BONUS;
    p.breakGrace = 0;
    p.breakJumpEligible = false;
  }
}

export function tryConsumeBufferedJump(state) {
  if (!state || state.jumpBuffer <= 0) return false;
  if (!canJumpNow(state)) return false;

  state.jumpBuffer = 0;
  performJump(state);
  return true;
}

export function bufferJump(state) {
  state.jumpBuffer = JUMP_BUFFER_SEC;
}

// ---------------- dive ----------------
function updateDivePhase(state, dt, airborne) {
  const p = state.player;
  if (!p) return;
  if (p.billboardDeath === true) {
    p.diving = false;
    p.divePhase = "";
    p.divePhaseT = 0;
    return;
  }

  if (airborne && state.divePressed === true) {
    p.diving = true;
    p.divePhase = "anticipate";
    p.divePhaseT = 0;

    if (p.vy < 220) p.vy = 220;
    state.score += DIVE_SCORE_BONUS;
    state.diveCount += 1;
  }

  if (airborne && p.diving) {
    p.divePhaseT += dt;
    if (p.divePhase === "anticipate" && p.divePhaseT >= DIVE_ANTICIPATION_SEC) {
      p.divePhase = "commit";
      p.divePhaseT = 0;
    }
  } else {
    p.diving = false;
    p.divePhase = "";
    p.divePhaseT = 0;
  }
}

// ---------------- duck ----------------
// Same button as dive: on a roof it ducks (while held), in the air it dives.
// A dive landing flows into a duck; if S is already released it's a brief squat.
function updateDuck(state, dt) {
  const p = state.player;
  if (!p) return;

  if (p.duckLandT > 0) p.duckLandT = Math.max(0, p.duckLandT - dt);

  const canDuck = p.onGround && p.billboardDeath !== true;
  if (!canDuck) p.duckLandT = 0;
  p.ducking = canDuck && (state.diveHeld === true || p.duckLandT > 0);
}

// Top of the hitbox; lower while ducking (feet stay planted).
function hitTop(p) {
  return p.ducking ? p.y + p.h * (1 - DUCK_HEIGHT_FRAC) : p.y;
}

// ---------------- integration ----------------
export function integratePlayer(state, dt, endGame) {
  const p = state.player;
  if (!p) return;

  const wasOnGround = p.onGround === true;
  const wasDiving = p.diving === true;
  const deathFall = p.billboardDeath === true;
  if (deathFall) {
    p.billboardDeathT += dt;
  } else if (p.billboardDeathT > 0) {
    p.billboardDeathT = 0;
  }

  updateDuck(state, dt);

  p.groundPlat = null;
  const airborne = !p.onGround;

  updateDivePhase(state, dt, airborne);

  let g = GRAVITY;
  let maxFall = MAX_FALL_SPEED;

  if (p.vy > 0) {
    state.jumpCut = 0;
    g *= FALL_GRAVITY_MULT;
  } else if (p.vy < 0) {
    if (state.jumpHeld) {
      state.jumpCut = 0;
    } else {
      state.jumpCut = clamp(state.jumpCut + JUMP_CUT_RAMP_PER_SEC * dt, 0, 1);
    }
    g *= 1 + (JUMP_CUT_MULT - 1) * state.jumpCut;
  } else {
    state.jumpCut = 0;
  }

  if (!deathFall && airborne && state.slowfallHeld && !p.diving && p.slowfallFuel > 0) {
    g *= SLOWFALL_GRAVITY_MULT;
    p.slowfallFuel = Math.max(0, p.slowfallFuel - dt);
  }

  if (!deathFall && airborne && p.diving) {
    const t =
      p.divePhase === "anticipate"
        ? p.divePhaseT / Math.max(0.001, DIVE_ANTICIPATION_SEC)
        : 1;
    const blend = smoothstep01(t);
    g *= 1 + (DIVE_GRAVITY_MULT - 1) * blend;
    maxFall = MAX_FALL_SPEED + (DIVE_MAX_FALL_SPEED - MAX_FALL_SPEED) * blend;
  }

  if (!deathFall && p.onGround && p.slowfallFuel < SLOWFALL_FUEL_MAX) {
    p.slowfallFuel = Math.min(
      SLOWFALL_FUEL_MAX,
      p.slowfallFuel + SLOWFALL_FUEL_REGEN_PER_SEC * dt
    );
  }

  if (p.jumpImpulseT > 0) {
    p.jumpImpulseT = Math.max(0, p.jumpImpulseT - dt);
  }

  p.vy += g * dt;
  if (p.vy > maxFall) p.vy = maxFall;

  const prevY = p.y;
  p.y += p.vy * dt;

  // ---------------- collision ----------------
  p.onGround = false;

  const px1 = p.x;
  const px2 = p.x + p.w;
  const prevBottom = prevY + p.h;
  const bottom = p.y + p.h;

  let billboardHit = false;
  for (const plat of state.platforms) {
    if (plat.collapsing) continue;
    const b = plat.billboard;
    if (!b || b.resolved || b.broken) continue;

    const bw = b.w;
    const bh = b.h;
    const bx = plat.x + b.offsetX;
    const by = plat.y - b.offsetY;
    const overlapsX = px2 > bx && px1 < bx + bw;
    const overlapsY = bottom > by && hitTop(p) < by + bh;

    if (overlapsX && overlapsY) {
      const isDashing = p.dashImpulseT > 0.01;
      const isDiving = p.diving === true;
      if (b.reinforced === false && (isDashing || isDiving)) {
        state.score += BILLBOARD_DASH_SCORE;
        state.billboardDashCount += 1;
        b.resolved = true;
        b.breaking = true;
        b.breakT = 0.28;
        b.broken = true;
        b.breakSpawned = false;
        b.hit = false;
        billboardHit = true;
        break;
      }
      const fromAbove = prevBottom <= by && bottom >= by && p.vy >= 0;
      if (fromAbove) {
        if (p.diving === true && b.reinforced === false) {
          b.resolved = true;
          b.breaking = true;
          b.breakT = 0.28;
          b.broken = true;
          b.breakSpawned = false;
          b.hit = false;
          state.billboardDashCount += 1;
          billboardHit = true;
          break;
        }
        p.y = by - p.h;
        p.vy = 0;
        p.onGround = true;
        p.onBillboard = true;
        p.jumpsRemaining = 2;
        p.coyote = COYOTE_TIME_SEC;
        p.landGrace = LAND_GRACE_SEC;
        p.breakGrace = 0;
        p.breakJumpEligible = false;
        p.groundPlat = null;
        if (wasDiving && !state.heavyLandT) {
          state.heavyLandT = 0.3;
        }
        if (wasDiving) {
          p.duckLandT = DUCK_LAND_SQUAT_SEC;
          p.ducking = true;
        }
        p.diving = false;
        p.divePhase = "";
        p.divePhaseT = 0;
        p.slowfallFuel = SLOWFALL_FUEL_MAX;
        billboardHit = true;
        break;
      }
      const leftGraceEdge = bx + bw * 0.1;
      const rightGraceEdge = bx + bw * 0.70;
      if (px2 <= leftGraceEdge || px1 >= rightGraceEdge) continue;
      if (b.reinforced === false && isDashing) {
        state.score += BILLBOARD_DASH_SCORE;
        state.billboardDashCount += 1;
        b.resolved = true;
        b.breaking = true;
        b.breakT = 0.28;
        b.broken = true;
        b.breakSpawned = false;
        b.hit = false;
      } else {
        b.hit = true;
        p.billboardDeath = true;
        p.billboardDeathT = 0;
        p.onGround = false;
        p.groundPlat = null;
        p.coyote = 0;
        p.landGrace = 0;
        p.jumpsRemaining = 0;
        p.breakGrace = 0;
        p.breakJumpEligible = false;
        p.vy = Math.max(p.vy, BILLBOARD_BOUNCE_VY * 0.6);
        p.y = Math.max(p.y, by + bh + 2);
        if (!state.heavyLandT) state.heavyLandT = 0.12;
      }
      billboardHit = true;
      break;
    }
  }

  if (!deathFall && p.vy >= 0) {
    if (billboardHit) {
      // Skip roof landing this frame so billboard hit forces a drop.
    } else {
    for (const plat of state.platforms) {
      if (plat.collapsing) continue;

      const overlapsX = px2 > plat.x && px1 < plat.x + plat.w;
      const crossedTop = prevBottom <= plat.y && bottom >= plat.y;

      if (overlapsX && crossedTop) {
        p.y = plat.y - p.h;
        p.vy = 0;
        p.onGround = true;
        p.jumpsRemaining = 2;
        p.coyote = COYOTE_TIME_SEC;
        p.landGrace = LAND_GRACE_SEC;
        p.groundPlat = plat;
        p.breakGrace = 0;
        p.breakJumpEligible = false;

        if (wasDiving && !state.heavyLandT) {
          state.heavyLandT = 0.3;
        }
        if (wasDiving) {
          p.duckLandT = DUCK_LAND_SQUAT_SEC;
          p.ducking = true;
        }

        p.diving = false;
        p.divePhase = "";
        p.divePhaseT = 0;
        p.slowfallFuel = SLOWFALL_FUEL_MAX;
        break;
      }
    }
    }
  }

  if (!p.onGround && wasOnGround) {
    p.coyote = COYOTE_TIME_SEC;
  }

  if (!billboardHit) {
    const centerX = p.x + p.w * 0.5;
    for (const plat of state.platforms) {
      if (plat.collapsing) continue;
      const b = plat.billboard;
      if (!b || b.resolved) continue;
      const bw = b.w;
      const bh = b.h;
      const bx = plat.x + b.offsetX;
      const by = plat.y - b.offsetY;
      if (bx + bw < centerX) {
        if (p.y + p.h <= by) {
          state.score += BILLBOARD_OVER_SCORE;
          b.resolved = true;
        } else if (hitTop(p) >= by + bh) {
          state.score += BILLBOARD_UNDER_SCORE;
          b.resolved = true;
        } else {
          b.resolved = true;
        }
      }
    }
  }

  if (p.y + p.h >= GROUND_Y + 1) {
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

// ---------------- DASH ----------------
export function updateDash(state, dt) {
  const p = state.player;
  if (!p) return;

  if (p.dashCooldown > 0) {
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  }

  if (p.dashImpulseT > 0) {
    p.dashImpulseT = Math.max(0, p.dashImpulseT - dt);
  }

  // DASH RULES:
  // - one press of D
  // - no direction requirement
  if (state.dashPressed === true && p.dashCooldown <= 0) {
    state.speedImpulse += DASH_SPEED_BOOST;
    p.dashCooldown = DASH_COOLDOWN;
    p.dashImpulseT = DASH_IMPULSE_FX_SEC;
    state.score += DASH_SCORE_BONUS;
  }

  state.speedImpulse *= Math.exp(-DASH_IMPULSE_DECAY * dt);
  if (state.speedImpulse < 1) state.speedImpulse = 0;
}
