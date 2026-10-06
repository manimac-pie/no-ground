// src/render/effects.js
// Death effects: the robot arm (the claw), break shards and the scrape dust.

import { BREAK_SHARDS, world } from "../game/constants.js";
import { clamp } from "../shared/math.js";

// Scrape dust streaks (drawDeathScrapeDust). Purely visual, and they follow the claw, which only
// the renderer places (camera.js), so they live here. They move on the game clock: render() passes
// the game time since the last frame as dt.
const dragTrail = [];
let dragTrailEmitT = 0;

export function drawRobotArm(ctx, info, COLORS, animTime, mode = "all") {
  if (!info || !info.arm) return;
  const arm = info.arm;
  const wobble = Math.sin((animTime || 0) * 6) * (1 - arm.dragK) * 4;

  // Simple 2-segment arm with a soft elbow bend.
  const elbowX = arm.baseX + (arm.tipX - arm.baseX) * 0.55;
  const elbowY = arm.baseY - 28 + (arm.tipY - arm.baseY) * 0.20 + wobble;

  ctx.save();
  // Keep the arm fully opaque so it doesn't show Bob through it.
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const steelDark = COLORS?.gantry || "rgba(20,22,28,0.85)";
  const steelMid = "rgba(44,48,58,0.95)";
  const steelHi = "rgba(120,205,255,0.55)";
  const warning = COLORS?.warning || "rgba(255,180,70,0.65)";
  const coreGlow = COLORS?.groundGlow || "rgba(255,85,110,0.22)";

  if (mode !== "claw") {
    // Ceiling rail / mount
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(arm.baseX - 26, arm.baseY + 8);
    ctx.lineTo(arm.baseX + 52, arm.baseY + 8);
    ctx.stroke();

    // No cyan highlight on the rail (opaque arm look)

    // Rail brackets
    ctx.fillStyle = steelDark;
    ctx.fillRect(arm.baseX - 34, arm.baseY + 2, 12, 14);
    ctx.fillRect(arm.baseX + 40, arm.baseY + 2, 12, 14);

    // Arm body
    ctx.strokeStyle = steelMid;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(arm.baseX, arm.baseY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(arm.tipX, arm.tipY);
    ctx.stroke();

    // Cyan highlight on the arm body
    ctx.strokeStyle = steelHi;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(arm.baseX, arm.baseY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(arm.tipX, arm.tipY);
    ctx.stroke();

    // Joint caps + bolts
    ctx.fillStyle = steelDark;
    ctx.beginPath();
    ctx.arc(arm.baseX, arm.baseY, 8, 0, Math.PI * 2);
    ctx.arc(elbowX, elbowY, 7, 0, Math.PI * 2);
    ctx.arc(arm.tipX, arm.tipY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = warning;
    ctx.beginPath();
    ctx.arc(arm.baseX + 3, arm.baseY + 1, 2, 0, Math.PI * 2);
    ctx.arc(elbowX - 2, elbowY + 1, 2, 0, Math.PI * 2);
    ctx.fill();

    // Small power conduit along the underside
    ctx.strokeStyle = coreGlow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arm.baseX + 4, arm.baseY + 6);
    ctx.lineTo(elbowX + 4, elbowY + 6);
    ctx.lineTo(arm.tipX + 4, arm.tipY + 6);
    ctx.stroke();
  }

  if (mode !== "body") {
    // Claw: flatter, clamp-like hands with small pads
    const bobW = Number.isFinite(info.snap?.w) ? info.snap.w : 0;
    const totalLen = bobW > 0 ? bobW : 15;
    const clawLen = totalLen * 0.7;
    const padLen = totalLen * 0.3;
    const spread = 14 - 5 * arm.gripK;
    const clawBaseX = arm.tipX + 2;

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(clawBaseX, arm.tipY - spread);
    ctx.lineTo(clawBaseX + clawLen, arm.tipY - spread);
    ctx.moveTo(clawBaseX, arm.tipY + spread);
    ctx.lineTo(clawBaseX + clawLen, arm.tipY + spread);
    ctx.stroke();

    // Palm caps and inner pads to read as a clamp
    ctx.strokeStyle = steelDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(clawBaseX + clawLen, arm.tipY - spread);
    ctx.lineTo(clawBaseX + clawLen + padLen, arm.tipY - spread);
    ctx.moveTo(clawBaseX + clawLen, arm.tipY + spread);
    ctx.lineTo(clawBaseX + clawLen + padLen, arm.tipY + spread);
    // No inner brace line
    ctx.stroke();
  }

  ctx.restore();
}

// Bob's breakup shards. They move in the game update (game/breakShards.js); this only draws them.
export function drawBreakShards(ctx, shards, offsetX = 0) {
  if (!Array.isArray(shards) || shards.length === 0) return;

  for (const s of shards) {
    if (!s || s.life <= 0) continue;
    const a = clamp(s.life / BREAK_SHARDS.LIFE, 0, 1);
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.translate(offsetX + s.x, s.y);
    ctx.rotate(s.rot || 0);

    const w = s.w || 8;
    const h = s.h || 6;
    if (s.kind === "spark") {
      ctx.fillStyle = "rgba(255,120,80,0.9)";
      ctx.fillRect(-w * 0.4, -1, w * 0.8, 2);
    } else if (s.kind === "plate") {
      ctx.fillStyle = "rgba(230,234,240,0.92)";
      ctx.fillRect(-w * 0.6, -h * 0.6, w * 1.2, h * 0.9);
      ctx.fillStyle = "rgba(20,22,28,0.45)";
      ctx.fillRect(-w * 0.6, h * 0.2, w * 1.2, 1);
    } else {
      ctx.fillStyle = "rgba(120,205,255,0.75)";
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.5);
      ctx.lineTo(w * 0.6, 0);
      ctx.lineTo(-w * 0.2, h * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawDeathScrapeDust(ctx, info, animTime, dt = 1 / 60) {
  if (!info || !info.snap) return;
  const k = clamp(info.arm?.dragK || 0, 0, 1);
  if (k <= 0.01) {
    dragTrail.length = 0;
    dragTrailEmitT = 0;
    return;
  }

  const px = info.snap.x + info.snap.w * 0.55 + (info.bobOffsetX || 0);
  const py = world.GROUND_Y - 6;
  const spread = 36 + 70 * k;
  const count = 14 + Math.floor(14 * k);
  const jitter = (Math.sin((animTime || 0) * 20) + 1) * 0.5;

  ctx.save();
  ctx.globalAlpha = 0.7 + 0.35 * k;
  ctx.fillStyle = "rgba(255,175,190,0.95)";
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2 + jitter;
    const ox = Math.cos(t) * spread * (0.4 + 0.8 * k) - 28 * k;
    const oy = Math.sin(t) * 8 * k - 1;
    const r = 2.5 + 4.5 * k;
    ctx.beginPath();
    ctx.arc(px + ox, py + oy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.45 + 0.35 * k;
  ctx.fillStyle = "rgba(255,220,235,0.9)";
  for (let i = 0; i < 10; i++) {
    const sx = px - 18 * k + i * 7;
    const sy = py + 2 + Math.sin((animTime || 0) * 9 + i) * 1.6;
    ctx.fillRect(sx, sy, 8, 1.6);
  }

  // Longer streaks that trail behind the drag
  dragTrailEmitT += Math.max(0, dt);
  const emitEvery = Math.max(0.01, 0.03 - 0.015 * k);
  if (dragTrailEmitT >= emitEvery) {
    dragTrailEmitT = 0;
    dragTrail.push({
      x: px,
      y: py + 1,
      life: 0.7 + 0.5 * k,
      w: 22 + 24 * k,
    });
  }
  for (let i = dragTrail.length - 1; i >= 0; i--) {
    const p = dragTrail[i];
    p.life -= dt;
    if (p.life <= 0) dragTrail.splice(i, 1);
  }

  ctx.strokeStyle = "rgba(255,150,170,0.9)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (const p of dragTrail) {
    const a = clamp(p.life / 1.2, 0, 1);
    ctx.globalAlpha = (0.25 + 0.45 * k) * a;
    const jitterY = Math.sin((animTime || 0) * 7 + p.x * 0.01) * 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + jitterY);
    ctx.lineTo(p.x - p.w, p.y + jitterY + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}
