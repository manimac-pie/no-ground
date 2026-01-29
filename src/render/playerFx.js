// src/render/playerFx.js
// Trails + VFX for player rendering. Purely visual.

import { clamp, roundedRectPath } from "./playerKit.js";

/* ------------------------------------------------------------
   FLIP RIBBON (unchanged)
------------------------------------------------------------ */
export function drawFlipRibbonTrail(ctx, bodyW, bodyH, prog, dir, t, COLORS) {
  const d = dir === -1 ? -1 : 1;
  const p = clamp(prog, 0, 1);

  const r0 = Math.max(10, bodyW * 0.60);
  const r1 = r0 + bodyW * 0.22;

  const cMain = d === 1 ? "rgba(120,205,255,0.42)" : "rgba(255,85,110,0.42)";
  const cHi = "rgba(242,242,242,0.24)";

  const a = d * p * Math.PI * 2;
  const start = a - d * 1.35;
  const end = a - d * 0.35;

  const prevFilter = ctx.filter;
  ctx.filter = "blur(1.1px)";

  ctx.save();
  ctx.lineCap = "round";

  const shimmer = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 7.5));

  ctx.globalAlpha = 0.18 * shimmer;
  ctx.strokeStyle = cMain;
  ctx.lineWidth = Math.max(2, bodyW * 0.10);
  ctx.beginPath();
  ctx.arc(0, 0, r1, start, end, d === -1);
  ctx.stroke();

  ctx.globalAlpha = 0.26;
  ctx.lineWidth = Math.max(2, bodyW * 0.07);
  ctx.beginPath();
  ctx.arc(0, 0, r0, start, end, d === -1);
  ctx.stroke();

  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = cHi;
  ctx.lineWidth = Math.max(1, bodyW * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, r0 - bodyW * 0.10, start, end, d === -1);
  ctx.stroke();

  ctx.filter = "none";
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = d === 1
    ? (COLORS?.accent || "rgba(120,205,255,0.95)")
    : "rgba(255,85,110,0.85)";

  const moteN = 5;
  for (let i = 0; i < moteN; i++) {
    const u = (i + 1) / (moteN + 1);
    const aa = start + (end - start) * u;
    const rr = r0 + (r1 - r0) * (0.15 + 0.25 * u);
    ctx.beginPath();
    ctx.arc(Math.cos(aa) * rr, Math.sin(aa) * rr, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.filter = prevFilter;
}

/* ------------------------------------------------------------
   AFTERIMAGE (unchanged)
------------------------------------------------------------ */
export function drawAfterimage(ctx, player, animTime, landed, stateRunning, speed, rot, COLORS) {
  if (player && player.spinning === true && player.trickKind === "flip") {
    drawFlipRibbonTrail(
      ctx,
      player.w * 0.70,
      player.h * 0.78,
      clamp(player.spinProg ?? 0, 0, 1),
      player.spinDir === -1 ? -1 : 1,
      animTime || 0,
      COLORS
    );
    return;
  }

  const bodyW = player.w * 0.70;
  const bodyH = player.h * 0.78;
  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - player.h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;

  const wheelR = Math.max(6, bodyW * 0.22);
  const wheelY = player.h / 2 - wheelR - 1;

  function drawGhost(alpha) {
    ctx.fillStyle = `rgba(242,242,242,${alpha})`;
    roundedRectPath(ctx, bodyX, bodyY, bodyW, bodyH, radius);
    ctx.fill();

    ctx.fillStyle = `rgba(36,38,44,${alpha * 0.55})`;
    ctx.beginPath();
    ctx.arc(0, wheelY + wheelR, wheelR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.filter = "blur(1.4px)";
  ctx.globalCompositeOperation = "lighter";

  for (let i = 1; i <= 4; i++) {
    const k = i / 4;
    ctx.save();
    ctx.translate(-k * 11, k * 6);
    ctx.rotate(rot * (1 - k) * 0.35);
    drawGhost(0.20 * (1 - k) ** 2);
    ctx.restore();
  }

  ctx.restore();
}

/* ------------------------------------------------------------
   JUMP TAKEOFF RUBBLE (new)
------------------------------------------------------------ */
export function drawJumpTakeoffRubble(ctx, bodyW, bodyH, t, k) {
  if (k <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.70 * k;
  ctx.fillStyle = "rgba(36,38,44,0.70)";

  const baseY = bodyH * 0.86;
  const spread = bodyW * 0.55;
  const n = 8;

  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const jitter = Math.sin(t * 9 + i * 2.1) * bodyW * 0.05;
    const x = s * spread + jitter;
    const lift = (0.6 + 0.4 * Math.sin(t * 7 + i)) * bodyH * 0.10 * k;
    const w = bodyW * (0.040 + 0.03 * (1 - k));
    const h = bodyH * (0.030 + 0.02 * (1 - k));
    ctx.fillRect(x - w / 2, baseY - lift - h / 2, w, h);
  }

  ctx.globalAlpha = 0.45 * k;
  ctx.fillStyle = "rgba(220,220,220,0.55)";
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const r = bodyW * (0.12 + 0.10 * k);
    const x = Math.cos(a + t * 3) * r;
    const y = baseY - Math.sin(a + t * 3) * r * 0.45;
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.35 * k;
  ctx.strokeStyle = "rgba(200,200,200,0.45)";
  ctx.lineWidth = Math.max(1, bodyW * 0.02);
  ctx.beginPath();
  ctx.ellipse(0, baseY + bodyH * 0.02, bodyW * 0.22, bodyH * 0.04, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/* ------------------------------------------------------------
   DASH STREAKS + ANTICIPATION SQUASH (FIXED)
------------------------------------------------------------ */
export function drawDashStreaks(ctx, bodyW, bodyH, t, k) {
  ctx.save();

  // k ∈ [0..1] from dash impulse
  // Phase split: 0–0.25 squash, 0.25–1 release
  const squashT = clamp(k / 0.25, 0, 1);
  const releaseT = clamp((k - 0.25) / 0.75, 0, 1);

  // Ease curves
  const squashEase = squashT * squashT;
  const releaseEase = 1 - Math.pow(1 - releaseT, 2);

  // Anticipation squash (vertical compression)
  const scaleX =
    1 +
    0.14 * squashEase +
    0.42 * releaseEase;

  const scaleY =
    1 -
    0.30 * squashEase -
    0.12 * releaseEase;

  ctx.scale(scaleX, scaleY);

  ctx.globalAlpha = 0.16 + 0.34 * k;
  ctx.fillStyle = "rgba(120,205,255,0.22)";

  const n = 7;
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1);
    const wobble = 0.6 + 0.4 * Math.sin(t * 9 + i * 1.3);
    const len = bodyW * (0.55 + 1.35 * k) * wobble;
    const y = -bodyH * 0.10 + (s - 0.5) * bodyH * 0.65;
    const x0 = -bodyW * (0.12 + 0.28 * k) - len;

    ctx.save();
    ctx.rotate(-0.05);
    ctx.fillRect(x0, y, len, 2);
    ctx.restore();
  }

  ctx.restore();
}

/* ------------------------------------------------------------
   DIVE STREAKS (new)
------------------------------------------------------------ */
export function drawDiveStreaks(ctx, bodyW, bodyH, t, k) {
  if (k <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.14 + 0.38 * k;
  ctx.strokeStyle = "rgba(255,85,110,0.55)";
  ctx.lineWidth = Math.max(1, bodyW * 0.028);
  ctx.lineCap = "round";

  const n = 6;
  const spread = bodyW * 0.55;
  const len = bodyH * (0.7 + 1.2 * k);
  const y0 = -bodyH * 0.05;

  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const wobble = Math.sin(t * 8 + i * 1.6) * bodyW * 0.06;
    const x = s * spread + wobble;
    const tilt = -bodyW * 0.06 * k;
    const jitter = Math.sin(t * 6 + i) * bodyH * 0.04;

    ctx.beginPath();
    ctx.moveTo(x, y0 + jitter * 0.2);
    ctx.lineTo(x + tilt, y0 + len + jitter);
    ctx.stroke();
  }

  ctx.restore();
}

/* ------------------------------------------------------------
   FLOAT / DIVE FX (unchanged from your tuned version)
------------------------------------------------------------ */
export function diveStrengthFromVY(vy) {
  return clamp((vy - 250) / 1350, 0, 1);
}

function drawHaloFX(ctx, bodyW, bodyH, t, mode, vy = 0) {
  ctx.save();
  const diving = mode === "dive";
  const k = diving ? diveStrengthFromVY(vy || 0) : 0;
  const floating = mode === "float";

  ctx.globalAlpha = diving ? (0.50 + 0.10 * k) : (floating ? 0.78 : 0.55);
  ctx.strokeStyle = diving ? "rgba(255,85,110,0.30)" : "rgba(120,205,255,0.30)";
  ctx.lineWidth = floating ? 3 : 2;

  ctx.beginPath();
  ctx.ellipse(0, bodyH * 0.05, bodyW * 0.55, bodyH * 0.70, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (floating) {
    ctx.filter = "blur(1.2px)";
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, bodyH * 0.05, bodyW * 0.58, bodyH * 0.74, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.filter = "none";
  }

  ctx.restore();
}

export function drawFloatFX(ctx, bodyW, bodyH, COLORS, t) {
  drawHaloFX(ctx, bodyW, bodyH, t, "float");
}

export function drawDiveFX(ctx, bodyW, bodyH, COLORS, t, vy) {
  drawHaloFX(ctx, bodyW, bodyH, t, "dive", vy);
}

/* ------------------------------------------------------------
   HEAVY LANDING FX (new)
------------------------------------------------------------ */
export function drawHeavyLandingBurst(ctx, bodyW, bodyH, t01) {
  if (t01 <= 0) return;

  ctx.save();
  const k = clamp(t01, 0, 1);
  const cx = 0;
  const cy = bodyH * 0.44;
  const r = bodyW * (0.18 + 0.45 * k);

  ctx.globalAlpha = 0.35 * (1 - k);
  ctx.strokeStyle = "rgba(242,242,242,0.7)";
  ctx.lineWidth = Math.max(1, bodyW * 0.025);
  ctx.lineCap = "round";

  const rays = 7;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const x0 = cx + Math.cos(a) * r * 0.25;
    const y0 = cy + Math.sin(a) * r * 0.25;
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawHeavyLandingRing(ctx, bodyW, bodyH, t01) {
  if (t01 <= 0) return;

  ctx.save();
  const k = clamp(t01, 0, 1);
  const cx = 0;
  const cy = bodyH * 0.45;
  const rx = bodyW * (0.35 + 0.55 * k);
  const ry = bodyH * (0.10 + 0.20 * k);

  ctx.globalAlpha = 0.28 * (1 - k);
  ctx.strokeStyle = "rgba(120,205,255,0.45)";
  ctx.lineWidth = Math.max(1, bodyW * 0.02);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export function drawLandingRubble(ctx, bodyW, bodyH, t01) {
  if (t01 <= 0) return;

  ctx.save();
  const k = clamp(t01, 0, 1);
  const baseY = bodyH * 0.46;
  const n = 6;

  ctx.globalAlpha = 0.25 * (1 - k);
  ctx.fillStyle = "rgba(36,38,44,0.5)";

  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const jitter = Math.sin((i + 1) * 2.3) * bodyW * 0.03;
    const x = s * bodyW * 0.75 + jitter;
    const y = baseY + Math.sin((i + 2) * 1.7) * bodyH * 0.03;
    const w = bodyW * (0.04 + 0.03 * (1 - k));
    const h = bodyH * (0.03 + 0.02 * (1 - k));
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  }

  ctx.restore();
}
