// src/render/playerFx.js
// Trails + VFX for player rendering. Purely visual.

import { clamp, roundedRectPath } from "./playerKit.js";

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

  // Outer glow
  ctx.globalAlpha = 0.18 * shimmer;
  ctx.strokeStyle = cMain;
  ctx.lineWidth = Math.max(2, bodyW * 0.10);
  ctx.beginPath();
  ctx.arc(0, 0, r1, start, end, d === -1);
  ctx.stroke();

  // Main ribbon
  ctx.globalAlpha = 0.26;
  ctx.strokeStyle = cMain;
  ctx.lineWidth = Math.max(2, bodyW * 0.07);
  ctx.beginPath();
  ctx.arc(0, 0, r0, start, end, d === -1);
  ctx.stroke();

  // Inner highlight
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = cHi;
  ctx.lineWidth = Math.max(1, bodyW * 0.03);
  ctx.beginPath();
  ctx.arc(0, 0, r0 - bodyW * 0.10, start, end, d === -1);
  ctx.stroke();

  // Motes (rounded, non-blocky)
  ctx.filter = "none";
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = d === 1 ? (COLORS.accent || "rgba(120,205,255,0.95)") : "rgba(255,85,110,0.85)";
  const moteN = 5;
  for (let i = 0; i < moteN; i++) {
    const u = (i + 1) / (moteN + 1);
    const aa = start + (end - start) * u;
    const rr = r0 + (r1 - r0) * (0.15 + 0.25 * u);
    const x = Math.cos(aa) * rr;
    const y = Math.sin(aa) * rr;
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.filter = prevFilter;
}

export function drawAfterimage(ctx, player, animTime, landed, stateRunning, speed, rot, COLORS) {
  // Flip trail: ribbon arc instead of blocky ghosts
  if (player && player.spinning === true && player.trickKind === "flip") {
    const bodyW2 = player.w * 0.70;
    const bodyH2 = player.h * 0.78;
    const prog = clamp(player.spinProg ?? 0, 0, 1);
    const dir = player.spinDir === -1 ? -1 : 1;
    drawFlipRibbonTrail(ctx, bodyW2, bodyH2, prog, dir, animTime || 0, COLORS);
    return;
  }

  const w = player.w;
  const h = player.h;

  const bodyW = w * 0.70;
  const bodyH = h * 0.78;
  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;

  const wheelR = Math.max(6, bodyW * 0.22);
  const wheelY = h / 2 - wheelR - 1;

  function drawGhost(alpha) {
    ctx.fillStyle = `rgba(242,242,242,${alpha.toFixed(3)})`;
    roundedRectPath(ctx, bodyX, bodyY, bodyW, bodyH, radius);
    ctx.fill();

    ctx.fillStyle = `rgba(36,38,44,${(alpha * 0.55).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, wheelY + wheelR, wheelR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();

  const prevFilter = ctx.filter;
  ctx.filter = "blur(1.4px)";

  const prevComp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";

  const samples = 4;
  for (let i = 1; i <= samples; i++) {
    const k = i / samples;
    const falloff = 1 - k;
    const alpha = 0.20 * falloff * falloff;

    ctx.save();
    ctx.translate(-k * 11, k * 6);
    ctx.rotate(rot * (1 - k) * 0.35);
    drawGhost(alpha);
    ctx.restore();
  }

  ctx.globalCompositeOperation = prevComp;
  ctx.filter = prevFilter;
  ctx.restore();
}

export function diveStrengthFromVY(vy) {
  return clamp((vy - 250) / 1350, 0, 1);
}

function drawHaloFX(ctx, bodyW, bodyH, t, mode, vy = 0) {
  const diving = mode === "dive";
  const k = diving ? diveStrengthFromVY(vy || 0) : 0;

  ctx.save();
  ctx.globalAlpha = diving ? (0.50 + 0.10 * k) : 0.55;

  ctx.strokeStyle = diving ? "rgba(255,85,110,0.30)" : "rgba(120,205,255,0.30)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, bodyH * 0.05, bodyW * 0.55, bodyH * 0.70, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = diving ? "rgba(255,85,110,0.22)" : "rgba(120,205,255,0.20)";
  const dir = diving ? 1 : -1;
  for (let i = 0; i < 6; i++) {
    const a = (i * 1.7 + t * (diving ? 5.6 : 6.0)) % (Math.PI * 2);
    const r = bodyW * (0.18 + 0.08 * (i % 2));
    const x = Math.cos(a) * r;
    const base = bodyH * (0.25 + 0.08 * i);
    const drift = (t * 50 + i * 13) % 18;
    const y = dir * (base + drift);
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.restore();
}

export function drawFloatFX(ctx, bodyW, bodyH, COLORS, t) {
  drawHaloFX(ctx, bodyW, bodyH, t, "float");
}

export function drawDiveFX(ctx, bodyW, bodyH, COLORS, t, vy) {
  drawHaloFX(ctx, bodyW, bodyH, t, "dive", vy);
}

export function drawDiveStreaks(ctx, bodyW, bodyH, t, k) {
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.28 * k;
  ctx.fillStyle = "rgba(255,85,110,0.22)";

  const n = 6;
  for (let i = 0; i < n; i++) {
    const s = i / n;
    const len = bodyW * (0.55 + 0.55 * k) * (0.55 + 0.45 * Math.sin(t * 9 + i * 1.7));
    const y = -bodyH * 0.10 + (s - 0.5) * bodyH * 0.55;
    const x0 = -bodyW * (0.25 + 0.15 * k) - len;

    ctx.save();
    ctx.rotate(-0.10);
    ctx.fillRect(x0, y, len, 2);
    ctx.restore();
  }

  ctx.restore();
}

export function drawLandingRubble(ctx, bodyW, bodyH, t01) {
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

export function drawHeavyLandingBurst(ctx, bodyW, bodyH, t01) {
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

export function drawHeavyLandingRing(ctx, bodyW, bodyH, t01) {
  ctx.save();
  const k = 1 - t01;
  ctx.globalAlpha = 0.18 + 0.35 * t01;
  ctx.strokeStyle = "rgba(242,242,242,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(
    0,
    bodyH * 0.48,
    bodyW * (0.35 + 0.55 * k),
    Math.max(6, bodyH * (0.10 + 0.12 * k)),
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  ctx.globalAlpha *= 0.55;
  ctx.strokeStyle = "rgba(255,85,110,0.22)";
  ctx.beginPath();
  ctx.ellipse(
    0,
    bodyH * 0.48,
    bodyW * (0.28 + 0.42 * k),
    Math.max(6, bodyH * (0.08 + 0.10 * k)),
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  ctx.restore();
}