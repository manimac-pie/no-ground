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

const DASH_COOLDOWN = getConst("DASH_COOLDOWN", 0.45);
const DASH_SPEED_BOOST = getConst("DASH_SPEED_BOOST", 520);
const DASH_IMPULSE_DECAY = getConst("DASH_IMPULSE_DECAY", 6.5);
const DASH_IMPULSE_FX_SEC = getConst("DASH_IMPULSE_FX_SEC", 0.20);
const DASH_SCORE_BONUS = getConst("DASH_SCORE_BONUS", 0);

const FLOAT_FUEL_MAX = getConst("FLOAT_FUEL_MAX", 1.0);
const FLOAT_GRAVITY_MULT = getConst("FLOAT_GRAVITY_MULT", 0.30);
const FLOAT_FUEL_REGEN_PER_SEC = getConst("FLOAT_FUEL_REGEN_PER_SEC", 0.7);

const GROUND_Y = getConst("GROUND_Y", 390);
const PLAYER_X = getConst("PLAYER_X", 160);
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
      || (p.coyote ?? 0) > 0
      || (p.landGrace ?? 0) > 0
      || (p.breakGrace ?? 0) > 0;
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

  if ((p.breakGrace ?? 0) > 0 && p.breakJumpEligible === true) {
    if (!Number.isFinite(state.score)) state.score = 0;
    state.score += BREAK_JIT_SCORE_BONUS;
    p.breakGrace = 0;
    p.breakJumpEligible = false;
  }
}

export function tryConsumeBufferedJump(state) {
  if (!state || (state.jumpBuffer ?? 0) <= 0) return false;
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

  if (typeof p.diving !== "boolean") p.diving = false;
  if (typeof p.divePhase !== "string") p.divePhase = "";
  if (!Number.isFinite(p.divePhaseT)) p.divePhaseT = 0;

  if (airborne && state.divePressed === true) {
    p.diving = true;
    p.divePhase = "anticipate";
    p.divePhaseT = 0;

    if ((p.vy ?? 0) < 220) p.vy = 220;
    if (!Number.isFinite(state.score)) state.score = 0;
    state.score += DIVE_SCORE_BONUS;
    if (!Number.isFinite(state.diveCount)) state.diveCount = 0;
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

// ---------------- integration ----------------
export function integratePlayer(state, dt, endGame) {
  const p = state.player;
  if (!p) return;

  if (!Number.isFinite(p.vy)) p.vy = 0;
  if (!Number.isFinite(p.x)) p.x = PLAYER_X;
  if (!Number.isFinite(p.coyote)) p.coyote = 0;
  if (!Number.isFinite(p.landGrace)) p.landGrace = 0;
  if (!Number.isFinite(p.breakGrace)) p.breakGrace = 0;
  if (typeof p.breakJumpEligible !== "boolean") p.breakJumpEligible = false;
  if (!Number.isFinite(state.jumpCut)) state.jumpCut = 0;
  if (!Number.isFinite(p.dashCooldown)) p.dashCooldown = 0;
  if (!Number.isFinite(p.jumpImpulseT)) p.jumpImpulseT = 0;
  if (!Number.isFinite(p.floatFuel)) p.floatFuel = FLOAT_FUEL_MAX;
  if (typeof p.billboardDeath !== "boolean") p.billboardDeath = false;

  const wasOnGround = p.onGround === true;
  const wasDiving = p.diving === true;
  const deathFall = p.billboardDeath === true;

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

  if (!deathFall && airborne && state.floatHeld && !p.diving && p.floatFuel > 0) {
    g *= FLOAT_GRAVITY_MULT;
    p.floatFuel = Math.max(0, p.floatFuel - dt);
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

  if (!deathFall && p.onGround && p.floatFuel < FLOAT_FUEL_MAX) {
    p.floatFuel = Math.min(
      FLOAT_FUEL_MAX,
      p.floatFuel + FLOAT_FUEL_REGEN_PER_SEC * dt
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
  if (Array.isArray(state.platforms)) {
    for (const plat of state.platforms) {
      if (!plat || plat.collapsing) continue;
      const b = plat.billboard;
      if (!b || b.resolved || b.broken) continue;

      const bw = Number.isFinite(b.w) ? b.w : 0;
      const bh = Number.isFinite(b.h) ? b.h : 0;
      if (bw <= 0 || bh <= 0) continue;

      const bx = plat.x + (Number.isFinite(b.offsetX) ? b.offsetX : 0);
      const by = plat.y - (Number.isFinite(b.offsetY) ? b.offsetY : 0);
      const overlapsX = px2 > bx && px1 < bx + bw;
      const overlapsY = bottom > by && p.y < by + bh;

      if (overlapsX && overlapsY) {
        const fromAbove = prevBottom <= by && bottom >= by && p.vy >= 0;
        if (fromAbove) {
          if (p.diving === true && b.reinforced === false) {
            b.resolved = true;
            b.breaking = true;
            b.breakT = 0.28;
            b.broken = true;
            b.breakSpawned = false;
            b.hit = false;
            if (!Number.isFinite(state.billboardDashCount)) state.billboardDashCount = 0;
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
          p.diving = false;
          p.divePhase = "";
          p.divePhaseT = 0;
          p.floatFuel = FLOAT_FUEL_MAX;
          billboardHit = true;
          break;
        }
        const leftHalfX = bx + bw * 0.5;
        const hitLeftHalf = px1 < leftHalfX && px2 > bx;
        if (!hitLeftHalf) continue;
        const isDashing = (p.dashImpulseT || 0) > 0.01;
        if (b.reinforced === false && isDashing) {
          if (!Number.isFinite(state.score)) state.score = 0;
          state.score += BILLBOARD_DASH_SCORE;
          if (!Number.isFinite(state.billboardDashCount)) state.billboardDashCount = 0;
          state.billboardDashCount += 1;
          b.resolved = true;
          b.breaking = true;
          b.breakT = 0.28;
          b.broken = true;
          b.breakSpawned = false;
          b.hit = false;
        } else {
          b.resolved = true;
          b.hit = true;
          p.billboardDeath = true;
          p.onGround = false;
          p.groundPlat = null;
          p.coyote = 0;
          p.landGrace = 0;
          p.jumpsRemaining = 0;
          p.breakGrace = 0;
          p.breakJumpEligible = false;
          p.vy = Math.max(p.vy || 0, BILLBOARD_BOUNCE_VY);
          p.y = Math.max(p.y, by + bh + 2);
        }
        billboardHit = true;
        break;
      }
    }
  }

  if (!deathFall && p.vy >= 0 && Array.isArray(state.platforms)) {
    if (billboardHit) {
      // Skip roof landing this frame so billboard hit forces a drop.
    } else {
    for (const plat of state.platforms) {
      if (!plat || plat.collapsing) continue;

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

        p.diving = false;
        p.divePhase = "";
        p.divePhaseT = 0;
        p.floatFuel = FLOAT_FUEL_MAX;
        break;
      }
    }
    }
  }

  if (!p.onGround && wasOnGround) {
    p.coyote = COYOTE_TIME_SEC;
  }

  if (!billboardHit && Array.isArray(state.platforms)) {
    const centerX = p.x + p.w * 0.5;
    for (const plat of state.platforms) {
      if (!plat || plat.collapsing) continue;
      const b = plat.billboard;
      if (!b || b.resolved) continue;
      const bw = Number.isFinite(b.w) ? b.w : 0;
      const bh = Number.isFinite(b.h) ? b.h : 0;
      if (bw <= 0 || bh <= 0) continue;

      const bx = plat.x + (Number.isFinite(b.offsetX) ? b.offsetX : 0);
      const by = plat.y - (Number.isFinite(b.offsetY) ? b.offsetY : 0);
      if (bx + bw < centerX) {
        if (!Number.isFinite(state.score)) state.score = 0;
        if (p.y + p.h <= by) {
          state.score += BILLBOARD_OVER_SCORE;
          b.resolved = true;
        } else if (p.y >= by + bh) {
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

// ---------------- DASH (FIXED) ----------------
export function updateDash(state, dt) {
  const p = state.player;
  if (!p) return;

  if (!Number.isFinite(p.dashCooldown)) p.dashCooldown = 0;
  if (!Number.isFinite(p.dashImpulseT)) p.dashImpulseT = 0;
  if (!Number.isFinite(state.speedImpulse)) state.speedImpulse = 0;
  if (!Number.isFinite(state.score)) state.score = 0;

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
