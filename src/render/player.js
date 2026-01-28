// src/render/player.js
/*
  Player rendering: shadow + orchestration of body + FX.

  Usage:
    import { drawPlayerShadow, drawPlayer } from "./render/player.js";
*/

import { DIVE_ANTICIPATION_SEC } from "../game/constants.js";
import { world } from "../game.js";

import { clamp, smoothstep01, roundedRectPath } from "./playerKit.js";
import { drawRunner } from "./playerBody.js";
import {
  diveStrengthFromVY,
  drawAfterimage,
  drawDiveFX,
  drawDiveStreaks,
  drawFloatFX,
  drawHeavyLandingBurst,
  drawHeavyLandingRing,
  drawLandingRubble,
} from "./playerFx.js";

// Render-only smoothing for dive pose (prevents snapping frame-to-frame)
let _diveK = 0; // 0..1 smoothed

// ---------------- shadow ----------------
export function drawPlayerShadow(ctx, player) {
  const cx = player.x + player.w / 2;
  const groundY = (player.onGround && player.groundPlat)
    ? (player.groundPlat.y + 2)
    : (world.GROUND_Y + 2);

  const dist = (player.y + player.h) - groundY;
  const shrink = clamp(1 - (dist / 320), 0.4, 1);

  const y = groundY;
  const w = player.w * 0.98 * shrink;
  const h = 7 * shrink;

  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(w / 2, h / 2);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.restore();
}

// ---------------- full player draw (world space) ----------------
export function drawPlayer(ctx, state, animTime, landed, COLORS) {
  const player = state.player;

  const airborne = !player.onGround;
  const floating = airborne && state.floatHeld === true;
  const diving = airborne && player.diving === true;

  const divePhase = typeof player.divePhase === "string" ? player.divePhase : "";
  const divePhaseT = Number.isFinite(player.divePhaseT) ? player.divePhaseT : 0;
  const antic01 = (diving && divePhase === "anticipate")
    ? clamp(divePhaseT / DIVE_ANTICIPATION_SEC, 0, 1)
    : 0;

  // Smooth dive strength so the pose ramps in/out instead of snapping.
  const dt = 1 / 60;
  const rawDiveK = diving ? diveStrengthFromVY(player.vy ?? 0) : 0;
  const targetDiveK = diving ? rawDiveK * (0.35 + 0.65 * (antic01 > 0 ? antic01 : 1)) : 0;
  const smooth = 10; // lower = smoother
  const a = 1 - Math.exp(-smooth * dt);
  _diveK = _diveK + (targetDiveK - _diveK) * a;

  // Squash/stretch
  const vy = player.vy ?? 0;
  const up01 = clamp(-vy / 900, 0, 1);
  const down01 = clamp(vy / 900, 0, 1);

  let sx = 1;
  let sy = 1;

  sy += up01 * 0.14;
  sx -= up01 * 0.08;

  sy -= down01 * 0.12;
  sx += down01 * 0.08;

  if (landed) {
    sy -= 0.10;
    sx += 0.10;
  }

  sx = clamp(sx, 0.82, 1.18);
  sy = clamp(sy, 0.82, 1.22);

  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;

  const bodyW = player.w * 0.70;
  const bodyH = player.h * 0.78;

  // Slight tilt based on vertical velocity (disabled during dive for upright feel)
  const baseRot = clamp(vy / 1800, -1, 1) * 0.08;
  const rot = diving ? 0 : baseRot;

  // Base spin rotation
  const spinProg = clamp(player.spinProg ?? 0, 0, 1);
  const spinDir = (player.spinDir === -1 ? -1 : 1);
  const spinAngle = (player.spinning ? (spinDir * spinProg * Math.PI * 2) : 0);

  // Directional trick visuals (cosmetic)
  const trickKind = player.trickKind || "spin";
  let trickExtraRot = 0;
  let trickSkewX = 1;
  let trickSkewY = 1;

  if (player.spinning) {
    if (trickKind === "flip") {
      trickExtraRot = spinDir * spinProg * Math.PI * 2;
    } else if (trickKind === "stall") {
      trickExtraRot = spinDir * spinProg * Math.PI * 0.35;
      trickSkewY = 0.92;
      trickSkewX = 1.06;
    } else if (trickKind === "corkscrew") {
      trickExtraRot = spinDir * spinProg * Math.PI * 2;
      trickSkewX = 1.08;
      trickSkewY = 0.96;
    }
  }

  // While diving, avoid stacking trick rotations (it reads chaotic).
  const trickRot = diving ? 0 : (spinAngle + trickExtraRot);
  const finalRot = rot + trickRot;

  // Dive pose: lean + compression + streaks.
  let poseRot = finalRot;
  let poseSx = sx * trickSkewX;
  let poseSy = sy * trickSkewY;

  let poseTx = 0;
  let poseTy = 0;

  if (diving) {
    const k = _diveK;
    const a01 = antic01 > 0 ? smoothstep01(antic01) : 0;

    // Remove dive tilt entirely: keep the character upright during dive.
    // We still use scale + offsets + streak FX to sell the motion.
    poseRot = 0;

    if (divePhase === "anticipate") {
      // Tuck + slight compression (reads as intent) without rotation
      poseSx *= 1.06 + 0.06 * a01;
      poseSy *= 0.96 - 0.10 * a01;
      poseTy += bodyH * 0.02 * a01;
    } else {
      // Commit: compact + heavy (wider, shorter) without rotation
      poseSx *= 1.05 + 0.10 * k;
      poseSy *= 0.92 - 0.10 * k;

      // Lead the body slightly forward/down
      poseTx += bodyW * (0.06 + 0.06 * k);
      poseTy += bodyH * (0.05 + 0.03 * k);
    }
  }

  // Heavy landing squash if the game provides a timer.
  const heavyT = Number.isFinite(state.heavyLandT) ? state.heavyLandT : 0;
  if (heavyT > 0) {
    const t01 = clamp(heavyT / 0.18, 0, 1);
    poseSx *= 1.00 + 0.10 * t01;
    poseSy *= 1.00 - 0.14 * t01;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(poseRot);
  ctx.scale(poseSx, poseSy);
  if (poseTx || poseTy) ctx.translate(poseTx, poseTy);

  // Afterimage only during tricks (but not during dive)
  if (player.spinning && !diving) {
    drawAfterimage(ctx, player, animTime, landed, state.running, state.speed || 0, poseRot, COLORS);
  }

  // Float/Dive FX (readability for W/S)
  if (diving) {
    // Always draw the red dive halo so feedback is immediate, even during anticipation.
    drawDiveFX(ctx, bodyW, bodyH, COLORS, animTime || 0, vy);

    // Streaks only after the anticipation tuck (keeps the first frames clean).
    if (divePhase !== "anticipate") {
      drawDiveStreaks(ctx, bodyW, bodyH, animTime || 0, _diveK);
    }
  } else if (floating) {
    drawFloatFX(ctx, bodyW, bodyH, COLORS, animTime || 0);
  }

  // Glow (stronger tint during float/dive)
  if (diving) ctx.shadowColor = "rgba(255,85,110,0.18)";
  else if (floating) ctx.shadowColor = "rgba(120,205,255,0.22)";
  else ctx.shadowColor = "rgba(242,242,242,0.18)";
  ctx.shadowBlur = 12;

  // Body
  drawRunner(ctx, player, animTime, landed, state.running, state.speed || 0, COLORS);

  // Heavier landing burst (requires state.heavyLandT to be set by game logic)
  if (heavyT > 0) {
    const t01a = clamp(heavyT / 0.18, 0, 1);
    drawHeavyLandingBurst(ctx, bodyW, bodyH, t01a);
    drawHeavyLandingRing(ctx, bodyW, bodyH, t01a);

    const t01b = clamp(heavyT / 0.22, 0, 1);
    drawLandingRubble(ctx, bodyW, bodyH, t01b);
  }

  // Crisp outline
  ctx.shadowBlur = 0;
  if (diving) ctx.strokeStyle = "rgba(255,85,110,0.35)";
  else if (floating) ctx.strokeStyle = "rgba(120,205,255,0.35)";
  else ctx.strokeStyle = "rgba(242,242,242,0.30)";
  ctx.lineWidth = 1;

  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - player.h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;
  roundedRectPath(ctx, bodyX + 0.5, bodyY + 0.5, bodyW - 1, bodyH - 1, radius);
  ctx.stroke();

  ctx.restore();
}