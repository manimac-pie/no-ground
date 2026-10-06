// src/game/player.js
// Player physics + movement integration.
// Exports integratePlayer() used by src/game/index.js.

import { clamp, smoothstep01 } from "../shared/math.js";
import { getConst } from "./utils.js";
import { awardBonus, beginAir, countEvent, landAir, loseAir } from "./score.js";

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
const DIVE_BONUS_SEC = getConst("DIVE_BONUS_SEC", 0);

const DOUBLE_JUMP_BONUS_SEC = getConst("DOUBLE_JUMP_BONUS_SEC", 0);

const DUCK_HEIGHT_FRAC = getConst("DUCK_HEIGHT_FRAC", 0.5);
const DUCK_LAND_SQUAT_SEC = getConst("DUCK_LAND_SQUAT_SEC", 0.2);
const DUCK_JUMP_WINDOW_SEC = getConst("DUCK_JUMP_WINDOW_SEC", 0.15);
const DUCK_JUMP_VELOCITY_MULT = getConst("DUCK_JUMP_VELOCITY_MULT", 1.08);
const LEDGE_CATCH_PX = getConst("LEDGE_CATCH_PX", 6);

const DASH_COOLDOWN = getConst("DASH_COOLDOWN", 0.45);
const DASH_SPEED_BOOST = getConst("DASH_SPEED_BOOST", 520);
const DASH_IMPULSE_DECAY = getConst("DASH_IMPULSE_DECAY", 6.5);
const DASH_IMPULSE_FX_SEC = getConst("DASH_IMPULSE_FX_SEC", 0.20);
const DASH_BREAK_GRACE_SEC = getConst("DASH_BREAK_GRACE_SEC", 0.10);
const AIR_DASH_BONUS_SEC = getConst("AIR_DASH_BONUS_SEC", 0);

const SLOWFALL_FUEL_MAX = getConst("SLOWFALL_FUEL_MAX", 1.0);
const SLOWFALL_GRAVITY_MULT = getConst("SLOWFALL_GRAVITY_MULT", 0.30);
const SLOWFALL_FUEL_REGEN_PER_SEC = getConst("SLOWFALL_FUEL_REGEN_PER_SEC", 0.7);

const GROUND_Y = getConst("GROUND_Y", 390);
const COYOTE_TIME_SEC = getConst("COYOTE_TIME_SEC", 0.13);
const LAND_GRACE_SEC = getConst("LAND_GRACE_SEC", 0.06);
const JUMP_BUFFER_SEC = getConst("JUMP_BUFFER_SEC", 0.13);
const JUMP_VELOCITY = getConst("JUMP_VELOCITY", -630);
const BREAK_JIT_BONUS_SEC = getConst("BREAK_JIT_BONUS_SEC", 0);
const BILLBOARD_OVER_BONUS_SEC = getConst("BILLBOARD_OVER_BONUS_SEC", 0);
const BILLBOARD_DUCK_BONUS_SEC = getConst("BILLBOARD_DUCK_BONUS_SEC", 0);
const BILLBOARD_SMASH_BONUS_SEC = getConst("BILLBOARD_SMASH_BONUS_SEC", 0);
const PERFECT_BREAK_WINDOW_SEC = getConst("PERFECT_BREAK_WINDOW_SEC", 0.1);
const PERFECT_DODGE_WINDOW_SEC = getConst("PERFECT_DODGE_WINDOW_SEC", 0.3);
const CLOSE_CALL_BONUS_SEC = getConst("CLOSE_CALL_BONUS_SEC", 0);
const CLOSE_CALL_OVERLAP_FRAC = getConst("CLOSE_CALL_OVERLAP_FRAC", 0.6);
const BILLBOARD_BOUNCE_VY = getConst("BILLBOARD_BOUNCE_VY", 0);

// ---------------- helpers ----------------
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

  const isDoubleJump = state.airActive === true && p.jumpsRemaining < 2;
  // Jumping out of a duck (S held, or just let go) springs a little higher. First jump only.
  const duckJump = p.jumpsRemaining === 2
    && (p.ducking === true || p.unduckAgeSec <= DUCK_JUMP_WINDOW_SEC);
  beginAir(state);
  // A plain jump scores nothing itself: crossing the gap is the job, and the distance pays for it.
  if (isDoubleJump) awardBonus(state, DOUBLE_JUMP_BONUS_SEC, "DOUBLE JUMP");

  p.vy = duckJump ? JUMP_VELOCITY * DUCK_JUMP_VELOCITY_MULT : JUMP_VELOCITY;
  p.ducking = false;
  p.duckingPrev = false; // so the next step doesn't count this as letting go of a duck
  p.unduckAgeSec = Infinity;
  p.onGround = false;
  p.onBillboard = false;
  p.coyote = 0;
  p.jumpsRemaining = Math.max(0, p.jumpsRemaining - 1);
  p.jumpImpulseT = JUMP_IMPULSE_FX_SEC;
  // A jump (while one is left) cancels a dive.
  p.diving = false;
  p.divePhase = "";
  p.divePhaseT = 0;

  if (p.breakGrace > 0 && p.breakJumpEligible === true) {
    awardBonus(state, BREAK_JIT_BONUS_SEC, "JUST IN TIME");
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
    awardBonus(state, DIVE_BONUS_SEC, "DIVE");
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

  // How long the current duck has lasted (perfect dodge), and how long since the last one ended (duck jump).
  if (p.ducking) {
    p.duckAgeSec = p.duckingPrev ? p.duckAgeSec + dt : 0;
  } else {
    p.unduckAgeSec = p.duckingPrev ? 0 : p.unduckAgeSec + dt;
  }
  p.duckingPrev = p.ducking;
}

// Break an unreinforced billboard. A dash pressed just before impact is a PERFECT break (double).
function smashBillboard(state, b, byDash) {
  const p = state.player;
  const perfect = byDash && p.dashAgeSec <= PERFECT_BREAK_WINDOW_SEC;
  awardBonus(state, BILLBOARD_SMASH_BONUS_SEC, perfect ? "PERFECT AD BREAK" : "AD BREAK", "smash", perfect ? 2 : 1);
  state.billboardDashCount += 1;
  b.perfect = perfect; // the renderer gives a perfect break a brighter shatter
  b.resolved = true;
  b.breaking = true;
  b.breakT = 0.28;
  b.broken = true;
  b.hit = false;
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
  // Landing on a billboard or dying on one rules out a roof landing this step. Smashing through one
  // doesn't: a low billboard hangs just above the roof, so Bob can reach the roof in the same step.
  let skipRoofLanding = false;
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
      // A dash breaks ads for its burst plus a short grace after it.
      const isDashing = p.dashAgeSec <= DASH_IMPULSE_FX_SEC + DASH_BREAK_GRACE_SEC;
      const isDiving = p.diving === true;
      if (b.reinforced === false && (isDashing || isDiving)) {
        smashBillboard(state, b, isDashing);
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
          b.hit = false;
          state.billboardDashCount += 1;
          countEvent(state, "smash"); // diving down through it breaks it too (no SMASH bonus)
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
        landAir(state);
        billboardHit = true;
        skipRoofLanding = true;
        break;
      }
      const leftGraceEdge = bx + bw * 0.1;
      const rightGraceEdge = bx + bw * 0.70;
      if (px2 <= leftGraceEdge || px1 >= rightGraceEdge) continue;
      if (b.reinforced === false && isDashing) {
        smashBillboard(state, b, true);
      } else {
        b.hit = true;
        p.billboardDeath = true;
        loseAir(state);
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
        skipRoofLanding = true;
      }
      billboardHit = true;
      break;
    }
  }

  if (!deathFall && p.vy >= 0) {
    if (skipRoofLanding) {
      // Already on a billboard, or knocked off one: no roof landing this step.
    } else {
    // How far the roofs scrolled left this step: a roof whose front edge is within this of Bob's
    // front only reached him this step.
    const scrollDx = Math.max(0, (state.speed || 0) * dt);
    for (const plat of state.platforms) {
      if (plat.collapsing) continue;

      const overlapsX = px2 > plat.x && px1 < plat.x + plat.w;
      // A rising roof moves up this step too, so test against where its top was before it moved.
      const topBefore = Math.max(plat.y, Number.isFinite(plat.prevY) ? plat.prevY : plat.y);
      const crossedTop = prevBottom <= topBefore && bottom >= plat.y;
      // Ledge catch: the roof's edge only scrolled under Bob this step, and last step his feet were
      // still at (or just under) its top. Between steps a fast roof can slide in under him after he
      // has dropped past its top, and he'd fall past an edge he visibly reached.
      const justReached = px2 - plat.x <= scrollDx + 1;
      const ledgeCatch = justReached && bottom >= plat.y && prevBottom <= topBefore + LEDGE_CATCH_PX;

      if (overlapsX && (crossedTop || ledgeCatch)) {
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
        // Only the front of Bob made it onto the roof (still airborne, so it goes into the pot).
        if (px2 - plat.x <= p.w * CLOSE_CALL_OVERLAP_FRAC) {
          awardBonus(state, CLOSE_CALL_BONUS_SEC, "CLOSE CALL", "closeCall");
        }
        landAir(state);
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
      // The moment Bob's front reaches the ad: how long has he been ducking? (perfect dodge)
      if (b.duckLeadSec < 0 && p.x + p.w >= bx) {
        b.duckLeadSec = p.ducking ? p.duckAgeSec : Infinity;
      }
      if (bx + bw < centerX) {
        if (p.y + p.h <= by) {
          awardBonus(state, BILLBOARD_OVER_BONUS_SEC, "VAULT");
          b.resolved = true;
        } else if (p.ducking && hitTop(p) >= by + bh) {
          const perfect = b.low === true && b.duckLeadSec <= PERFECT_DODGE_WINDOW_SEC;
          awardBonus(state, BILLBOARD_DUCK_BONUS_SEC, perfect ? "PERFECT DODGE" : "DODGING ADS", "dodge", perfect ? 2 : 1);
          b.resolved = true;
        } else {
          b.resolved = true;
        }
      }
    }
  }

  if (p.y + p.h >= GROUND_Y + 1) {
    loseAir(state);
    if (typeof endGame === "function") endGame();
    else {
      state.running = false;
      state.gameOver = true;
    }
    return;
  }

  // Takeoff (walked off an edge, roof gave way, or jumped): start this airtime's pot.
  if (!p.onGround && p.billboardDeath !== true) beginAir(state);

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
  p.dashAgeSec += dt; // time since the last dash press (perfect ad break)

  // DASH RULES:
  // - one press of D
  // - no direction requirement
  if (state.dashPressed === true && p.dashCooldown <= 0) {
    state.speedImpulse += DASH_SPEED_BOOST;
    p.dashCooldown = DASH_COOLDOWN;
    p.dashImpulseT = DASH_IMPULSE_FX_SEC;
    p.dashAgeSec = 0;
    // Only an air dash scores (into the pot, so it pays only if Bob lands). A roof dash is risk-free.
    if (state.airActive) awardBonus(state, AIR_DASH_BONUS_SEC, "DASH");
  }

  state.speedImpulse *= Math.exp(-DASH_IMPULSE_DECAY * dt);
  if (state.speedImpulse < 1) state.speedImpulse = 0;
}
