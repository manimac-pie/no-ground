// src/game/player.js

import {
  GROUND_Y,
  GRAVITY,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  FALL_GRAVITY_MULT,
  JUMP_CUT_MULT,
  JUMP_CUT_RAMP_PER_SEC,
  LAND_GRACE_SEC,
  COYOTE_TIME_SEC,
  PERFECT_MIN_PROG,
  CLEAN_MIN_PROG,
  STYLE_BASE,
  STYLE_COMBO_BONUS,
  STYLE_CLEAN_BONUS,
  STYLE_PERFECT_BONUS,
} from "./constants.js";
import { clamp } from "./utils.js";

export function performJump(state) {
  const p = state.player;
  p.vy = JUMP_VELOCITY;
  p.onGround = false;
  p.coyote = 0;
  p.jumpsRemaining -= 1;
}

export function canJumpNow(state) {
  const p = state.player;

  if (p.jumpsRemaining <= 0) return false;

  if (p.jumpsRemaining === 2) {
    return p.onGround || p.coyote > 0 || p.landGrace > 0;
  }

  return true;
}

export function tryConsumeBufferedJump(state) {
  if (state.jumpBuffer <= 0) return false;
  if (!canJumpNow(state)) return false;

  state.jumpBuffer = 0;
  performJump(state);
  return true;
}

export function integratePlayer(state, dt, endGame) {
  const p = state.player;
  const wasOnGround = p.onGround;

  p.groundPlat = null;

  let g = GRAVITY;

  if (p.vy > 0) {
    state.jumpCut = 0;
    g *= FALL_GRAVITY_MULT;
  } else if (p.vy < 0) {
    if (state.jumpHeld) {
      state.jumpCut = 0;
    } else {
      state.jumpCut = clamp(state.jumpCut + JUMP_CUT_RAMP_PER_SEC * dt, 0, 1);
    }
    const cutMult = 1 + (JUMP_CUT_MULT - 1) * state.jumpCut;
    g *= cutMult;
  } else {
    state.jumpCut = 0;
  }

  p.vy += g * dt;
  if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;

  const prevY = p.y;
  p.y += p.vy * dt;

  p.onGround = false;

  const px1 = p.x;
  const px2 = p.x + p.w;
  const prevBottom = prevY + p.h;
  const bottom = p.y + p.h;

  if (p.vy >= 0) {
    for (const plat of state.platforms) {
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

        if (p.spinning || p.trickLandWindow > 0 || (p.spinProg > 0 && p.spinProg < 1)) {
          let bonus = STYLE_BASE + state.styleCombo * STYLE_COMBO_BONUS;

          let quality = null;
          if (p.spinProg >= PERFECT_MIN_PROG) {
            quality = "perfect";
            bonus += STYLE_PERFECT_BONUS;
          } else if (p.spinProg >= CLEAN_MIN_PROG) {
            quality = "clean";
            bonus += STYLE_CLEAN_BONUS;
          }

          state.styleScore += bonus;
          state.styleCombo += 1;

          state.lastLandQuality = quality;
          state.lastLandQualityT = quality ? 0.55 : 0;

          p.spinning = false;
          p.spinT = 0;
          p.spinProg = 0;
          p.trickLandWindow = 0;
        } else {
          state.styleCombo = 0;
          p.trickLandWindow = 0;
          p.spinProg = 0;
        }

        break;
      }
    }
  }

  if (!p.onGround && wasOnGround) {
    p.coyote = COYOTE_TIME_SEC;
  }

  const playerBottom = p.y + p.h;
  if (playerBottom >= GROUND_Y + 1) {
    endGame();
    return;
  }
}