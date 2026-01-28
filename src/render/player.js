// src/render/player.js

/*
  Player rendering: shadow + procedural runner body + afterimage trail + trick visuals.

  Usage (Option B split):
    import { drawPlayerShadow, drawPlayer } from "./render/player.js";

  drawPlayerShadow(ctx, state.player);
  drawPlayer(ctx, state, animTime, landed, COLORS);

  Notes:
  - Purely visual: reads from state.player fields that game.js sets:
      player.spinning, player.spinProg, player.spinDir, player.trickKind
  - COLORS is injected so this stays decoupled from your palette module.
*/

import {
  DIVE_ANTICIPATION_SEC,
  DIVE_SPIKE_ANGLE_RAD,
  DIVE_SILHOUETTE_SHOULDER_W,
  DIVE_SILHOUETTE_MID_W,
  DIVE_SILHOUETTE_TIP_W,
} from "../game/constants.js";
import { world } from "../game.js";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Render-only smoothing for dive pose (prevents snapping frame-to-frame)
let _diveK = 0; // 0..1 smoothed

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// ---------------- shadow ----------------
export function drawPlayerShadow(ctx, player) {
  // Soft ellipse under the player to anchor it to the world.
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

// ---------------- runner body ----------------
function drawRunner(ctx, player, t, landed, stateRunning, speed, COLORS) {
  // Local space: origin at player center after transforms in caller.
  const w = player.w;
  const h = player.h;

  const vy = player.vy ?? 0;
  const onGround = player.onGround === true;
  const running = stateRunning && onGround;

  // Scale cadence with speed
  const s = Number.isFinite(speed) ? speed : 0;
  const runRate = clamp(6 + (s / 480) * 10, 6, 18); // steps/sec
  const phase = t * runRate * Math.PI * 2;

  // Body capsule (kept inside hitbox)
  const bodyW = w * 0.70;
  const bodyH = h * 0.78;
  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;

  // Wheel roll phase
  const stride = running ? Math.sin(phase) : 0;

  // Air leg behavior
  const up01 = clamp(-vy / 900, 0, 1);
  const down01 = clamp(vy / 900, 0, 1);

  const legLift = running ? (Math.abs(stride) * h * 0.08) : 0;

  const airTuck = up01 * h * 0.10;
  const airExtend = down01 * h * 0.06;

  const wheelR = Math.max(6, bodyW * 0.22);
  // Anchor wheel near the bottom of the hitbox so the character doesn't appear to float.
  const wheelY = (h / 2) - wheelR - 1 - legLift - airTuck + airExtend;

  // Wheel
  ctx.save();
  ctx.translate(0, wheelY + wheelR);
  const roll = running ? (phase * 0.65) : 0;
  ctx.rotate(roll);

  // Tire
  ctx.fillStyle = "rgba(36,38,44,0.95)";
  ctx.beginPath();
  ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.fillStyle = "rgba(242,242,242,0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, wheelR * 0.62, 0, Math.PI * 2);
  ctx.fill();

  // Hub + spokes
  ctx.strokeStyle = "rgba(15,17,22,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, wheelR * 0.30, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * wheelR * 0.55, Math.sin(a) * wheelR * 0.55);
    ctx.stroke();
  }

  // Tire highlight
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-wheelR * 0.10, -wheelR * 0.10, wheelR * 0.92, -0.3, 1.1);
  ctx.stroke();
  ctx.restore();

  // Body capsule
  roundedRectPath(ctx, bodyX, bodyY, bodyW, bodyH, radius);
  ctx.fillStyle = COLORS.player || "#f2f2f2";
  ctx.fill();

  // Visor/face stripe
  ctx.fillStyle = "rgba(15,17,22,0.58)";
  const visorW = bodyW * 0.62;
  const visorH = Math.max(3, bodyH * 0.18);
  const visorX = -visorW / 2;
  const visorY = bodyY + bodyH * 0.20;
  roundedRectPath(ctx, visorX, visorY, visorW, visorH, visorH * 0.6);
  ctx.fill();

  // Highlight on visor
  ctx.fillStyle = "rgba(242,242,242,0.16)";
  roundedRectPath(
    ctx,
    visorX + visorW * 0.10,
    visorY + visorH * 0.20,
    visorW * 0.35,
    Math.max(2, visorH * 0.25),
    visorH * 0.4
  );
  ctx.fill();

  // Accent dot
  ctx.fillStyle = COLORS.accent || "rgba(120,205,255,0.95)";
  ctx.fillRect(visorX + visorW * 0.78, visorY + visorH * 0.35, 2, 2);
}

function drawAfterimage(ctx, player, animTime, landed, stateRunning, speed, rot, COLORS) {
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.shadowBlur = 0;

  for (let i = 1; i <= 3; i++) {
    const k = i / 3;
    ctx.save();
    ctx.translate(-k * 6, k * 3);
    ctx.rotate(rot * (1 - k) * 0.6);
    drawRunner(ctx, player, animTime - k * 0.03, landed, stateRunning, speed, COLORS);
    ctx.restore();
  }

  ctx.restore();
}

function drawFloatFX(ctx, bodyW, bodyH, COLORS, t) {
  drawHaloFX(ctx, bodyW, bodyH, t, "float");
}

function diveStrengthFromVY(vy) {
  // 0..1 based on downward speed
  return clamp((vy - 250) / 1350, 0, 1);
}

function drawDiveFX(ctx, bodyW, bodyH, COLORS, t, vy) {
  drawHaloFX(ctx, bodyW, bodyH, t, "dive", vy);
}

function drawHaloFX(ctx, bodyW, bodyH, t, mode, vy = 0) {
  const diving = mode === "dive";
  const k = diving ? diveStrengthFromVY(vy || 0) : 0;

  ctx.save();
  ctx.globalAlpha = diving ? (0.50 + 0.10 * k) : 0.55;

  // Ring: same outline/animation; color swaps by mode
  ctx.strokeStyle = diving ? "rgba(255,85,110,0.30)" : "rgba(120,205,255,0.30)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, bodyH * 0.05, bodyW * 0.55, bodyH * 0.70, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Motes: same orbiting motion but vertical bias switches
  ctx.fillStyle = diving ? "rgba(255,85,110,0.22)" : "rgba(120,205,255,0.20)";
  const dir = diving ? 1 : -1;
  for (let i = 0; i < 6; i++) {
    const a = (i * 1.7 + t * (diving ? 5.6 : 6.0)) % (Math.PI * 2);
    const r = bodyW * (0.18 + 0.08 * (i % 2));
    const x = Math.cos(a) * r;
    const base = bodyH * (0.25 + 0.08 * i);
    const drift = ((t * 50 + i * 13) % 18);
    const y = dir * (base + drift);
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.restore();
}

function drawDiveSpikeTip(ctx, bodyW, bodyH) {
  // A small pointed "tip" under the body to read as a spike.
  // Purely visual; stays within/near hitbox.
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = "rgba(242,242,242,0.85)";

  const tipW = bodyW * 0.34;
  const tipH = Math.max(6, bodyH * 0.22);
  const y0 = bodyH * 0.42;

  ctx.beginPath();
  ctx.moveTo(0, y0 + tipH);
  ctx.lineTo(-tipW / 2, y0);
  ctx.lineTo(tipW / 2, y0);
  ctx.closePath();
  ctx.fill();

  // tiny highlight edge
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "rgba(120,205,255,0.60)";
  ctx.fillRect(-1, y0 - 2, 2, 2);

  ctx.restore();
}

function drawDiveSpikeSilhouette(ctx, bodyW, bodyH, COLORS, k) {
  // Bottom-heavy teardrop silhouette for dive commit.
  const topW = bodyW * (0.40 + 0.06 * k);
  const midW = bodyW * (0.58 + 0.10 * k);
  const baseW = bodyW * (0.82 + 0.14 * k);

  const topY = -bodyH * 0.48;
  const midY = -bodyH * 0.05;
  const baseY = bodyH * 0.56;

  ctx.save();

  // Fill
  ctx.fillStyle = COLORS.player || "#f2f2f2";
  ctx.beginPath();
  ctx.moveTo(0, topY);
  ctx.lineTo(topW / 2, topY + bodyH * 0.20);
  ctx.lineTo(midW / 2, midY);
  ctx.lineTo(baseW / 2, baseY);
  ctx.lineTo(-baseW / 2, baseY);
  ctx.lineTo(-midW / 2, midY);
  ctx.lineTo(-topW / 2, topY + bodyH * 0.20);
  ctx.closePath();
  ctx.fill();

  // Visor stripe (keeps identity)
  ctx.fillStyle = "rgba(15,17,22,0.58)";
  const visorW = midW * 0.86;
  const visorH = Math.max(4, bodyH * 0.14);
  roundedRectPath(ctx, -visorW / 2, -bodyH * 0.20, visorW, visorH, visorH * 0.6);
  ctx.fill();

  // Tiny accent
  ctx.fillStyle = COLORS.accent || "rgba(120,205,255,0.95)";
  ctx.fillRect(visorW * 0.34, -bodyH * 0.15, 2, 2);

  ctx.restore();
}

function drawLandingRubble(ctx, bodyW, bodyH, t01) {
  // Small rubble burst near the feet on landing.
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.45 * t01;
  ctx.fillStyle = "rgba(242,242,242,0.24)";

  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = bodyW * (0.10 + 0.26 * (1 - t01)) + (i % 2) * bodyW * 0.06;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r + bodyH * 0.44;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.restore();
}

function drawHeavyLandingBurst(ctx, bodyW, bodyH, t01) {
  // Quick outward shards on impact (screen-space within player transform).
  // t01: 1 at impact, down to 0.
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.55 * t01;
  ctx.fillStyle = "rgba(242,242,242,0.22)";

  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = bodyW * (0.10 + 0.30 * (1 - t01));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r + bodyH * 0.40;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.restore();
}

function drawHeavyLandingRing(ctx, bodyW, bodyH, t01) {
  // Expanding ring near the feet to sell impact.
  ctx.save();
  const k = 1 - t01; // expands as time passes
  ctx.globalAlpha = 0.18 + 0.35 * t01;
  ctx.strokeStyle = "rgba(242,242,242,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, bodyH * 0.48, bodyW * (0.35 + 0.55 * k), Math.max(6, bodyH * (0.10 + 0.12 * k)), 0, 0, Math.PI * 2);
  ctx.stroke();

  // subtle red accent on heavy impacts
  ctx.globalAlpha *= 0.55;
  ctx.strokeStyle = "rgba(255,85,110,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, bodyH * 0.48, bodyW * (0.28 + 0.42 * k), Math.max(6, bodyH * (0.08 + 0.10 * k)), 0, 0, Math.PI * 2);
  ctx.stroke();

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
  const antic01 = (diving && divePhase === "anticipate") ? clamp(divePhaseT / DIVE_ANTICIPATION_SEC, 0, 1) : 0;

  // Smooth dive strength so the pose ramps in/out instead of snapping.
  const dt = 1 / 60;
  const rawDiveK = diving ? diveStrengthFromVY(player.vy ?? 0) : 0;
  // During anticipation, fade in the strength so commit doesn't pop.
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

  // Dive spike pose (visual only)
  let poseRot = finalRot;
  let poseSx = sx * trickSkewX;
  let poseSy = sy * trickSkewY;

  if (diving) {
    const k = _diveK;

    // Anticipation: quick wide/short squash so the dive feels intentional.
    if (antic01 > 0) {
      poseSx *= 1.05 + 0.08 * antic01;
      poseSy *= 0.95 - 0.08 * antic01;
    }

    // Commit: stronger fixed spike angle reads cleaner.
    // No dive tilt; keep upright. Subtle shape change only.
    poseRot = rot;
    poseSx *= 0.99 - 0.03 * k;
    poseSy *= 1.01 + 0.08 * k;
  }

  // Heavy landing squash if the game provides a timer.
  // (Set in game logic; this renderer only reads it.)
  const heavyT = Number.isFinite(state.heavyLandT) ? state.heavyLandT : 0;
  if (heavyT > 0) {
    const t01 = clamp(heavyT / 0.18, 0, 1);
    poseSx *= 1.00 + 0.10 * t01;
    poseSy *= 1.00 - 0.14 * t01;
  }

  const bodyW = player.w * 0.70;
  const bodyH = player.h * 0.78;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(poseRot);
  ctx.scale(poseSx, poseSy);

  // Afterimage only during tricks (but not during dive — too noisy)
  if (player.spinning && !diving) {
    drawAfterimage(ctx, player, animTime, landed, state.running, state.speed || 0, poseRot, COLORS);
  }

  // Float/Dive FX (readability for W/S)
  if (diving) {
    if (divePhase !== "anticipate") {
      drawDiveFX(ctx, bodyW, bodyH, COLORS, animTime || 0, vy);
    }
  } else if (floating) {
    drawFloatFX(ctx, bodyW, bodyH, COLORS, animTime || 0);
  }

  // Glow (stronger tint during float/dive)
  if (diving) {
    ctx.shadowColor = "rgba(255,85,110,0.18)";
  } else if (floating) {
    ctx.shadowColor = "rgba(120,205,255,0.22)";
  } else {
    ctx.shadowColor = "rgba(242,242,242,0.18)";
  }
  ctx.shadowBlur = 12;

  // Body: always use the normal runner silhouette (dive uses pose + FX only)
  drawRunner(ctx, player, animTime, landed, state.running, state.speed || 0, COLORS);

  // No spike tip during dive/anticipation (keep silhouette rounded)

  // Heavier landing burst (requires state.heavyLandT to be set by game logic)
  if (heavyT > 0) {
    const t01 = clamp(heavyT / 0.18, 0, 1);
    drawHeavyLandingBurst(ctx, bodyW, bodyH, t01);
    drawHeavyLandingRing(ctx, bodyW, bodyH, t01);
  }

  if (heavyT > 0) {
    const t01 = clamp(heavyT / 0.22, 0, 1);
    drawLandingRubble(ctx, bodyW, bodyH, t01);
  }

  // Crisp outline
  ctx.shadowBlur = 0;
  if (diving) {
    ctx.strokeStyle = "rgba(255,85,110,0.35)";
  } else if (floating) {
    ctx.strokeStyle = "rgba(120,205,255,0.35)";
  } else {
    ctx.strokeStyle = "rgba(242,242,242,0.30)";
  }
  ctx.lineWidth = 1;

  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - player.h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;
  roundedRectPath(ctx, bodyX + 0.5, bodyY + 0.5, bodyW - 1, bodyH - 1, radius);
  ctx.stroke();

  ctx.restore();
}
