// src/render/playerBody.js
// Procedural player body rendering (shape/identity). Purely visual.

import { clamp, roundedRectPath } from "./playerKit.js";

function hash01(n) {
  const x = Math.sin(n * 999.123) * 43758.5453;
  return x - Math.floor(x);
}

export function drawRunner(ctx, player, t, landed, stateRunning, speed, COLORS, eyes) {
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

  const legLift = running ? Math.abs(stride) * h * 0.08 : 0;

  const airTuck = up01 * h * 0.10;
  const airExtend = down01 * h * 0.06;

  const wheelR = Math.max(6, bodyW * 0.22);
  // Anchor wheel near the bottom of the hitbox so the character doesn't appear to float.
  const wheelY = h / 2 - wheelR - 1 - legLift - airTuck + airExtend;

  // Wheel
  ctx.save();
  ctx.translate(0, wheelY + wheelR);
  const roll = running ? phase * 0.65 : 0;
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

  // Accent dot (single eye)
  let eyeX = visorX + visorW * 0.78;
  let eyeY = visorY + visorH * 0.35;
  if (eyes) {
    const eyeT = eyes.t || 0;
    const saccadeDur = 0.75;
    const saccadeIdx = Math.floor(eyeT / saccadeDur);
    const saccadeT = (eyeT - saccadeIdx * saccadeDur) / saccadeDur;
    const jumpT = saccadeT < 0.2 ? saccadeT / 0.2 : 1;
    const jumpEase = jumpT * jumpT * (3 - 2 * jumpT);
    const baseX = (hash01(saccadeIdx * 13.7) - 0.5) * 3.4;
    const baseY = (hash01(saccadeIdx * 31.9) - 0.5) * 2.2;
    const nextX = (hash01((saccadeIdx + 1) * 13.7) - 0.5) * 3.4;
    const nextY = (hash01((saccadeIdx + 1) * 31.9) - 0.5) * 2.2;
    const saccX = baseX + (nextX - baseX) * jumpEase;
    const saccY = baseY + (nextY - baseY) * jumpEase;
    const driftX = Math.sin(eyeT * 2.7 + 1.3) * 0.35 + Math.sin(eyeT * 5.1) * 0.2;
    const driftY = Math.sin(eyeT * 2.1 + 0.7) * 0.25;
    const lookX = saccX + driftX;
    const lookY = saccY + driftY;
    eyeX += lookX;
    eyeY += lookY;
  }
  ctx.fillStyle = COLORS.accent || "rgba(120,205,255,0.95)";
  ctx.fillRect(eyeX, eyeY, 2, 2);
}
