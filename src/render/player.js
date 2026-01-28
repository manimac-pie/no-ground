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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

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
  const y = (player.y + player.h) + 4;
  const w = player.w * 0.90;
  const h = 6;

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

  // Legs/feet
  const stride = running ? Math.sin(phase) : 0;
  const stride2 = running ? Math.sin(phase + Math.PI) : 0;

  // Air leg behavior
  const up01 = clamp(-vy / 900, 0, 1);
  const down01 = clamp(vy / 900, 0, 1);

  const legBaseY = bodyY + bodyH * 0.45;
  const legLift = running ? (Math.abs(stride) * h * 0.08) : 0;

  const airTuck = up01 * h * 0.10;
  const airExtend = down01 * h * 0.06;

  const footY = legBaseY + bodyH * 0.40 - legLift - airTuck + airExtend;

  const footSep = bodyW * 0.42;
  const footSwing = running ? (stride * bodyW * 0.18) : 0;
  const footSwing2 = running ? (stride2 * bodyW * 0.18) : 0;

  const footW = bodyW * 0.36;
  const footH = Math.max(3, h * 0.12);
  const footR = Math.min(footW, footH) * 0.45;

  // Landing impact: brief wider stance
  const landPunch = landed ? 0.10 : 0;

  // Feet
  ctx.fillStyle = "rgba(242,242,242,0.85)";

  // Left foot
  roundedRectPath(
    ctx,
    -footSep / 2 - footW / 2 + footSwing - bodyW * landPunch,
    footY,
    footW,
    footH,
    footR
  );
  ctx.fill();

  // Right foot
  roundedRectPath(
    ctx,
    footSep / 2 - footW / 2 + footSwing2 + bodyW * landPunch,
    footY,
    footW,
    footH,
    footR
  );
  ctx.fill();

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

// ---------------- full player draw (world space) ----------------
export function drawPlayer(ctx, state, animTime, landed, COLORS) {
  const player = state.player;

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

  // Slight tilt based on vertical velocity
  const rot = clamp(vy / 1800, -1, 1) * 0.08;

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

  const finalRot = rot + spinAngle + trickExtraRot;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(finalRot);
  ctx.scale(sx * trickSkewX, sy * trickSkewY);

  // Afterimage only during tricks
  if (player.spinning) {
    drawAfterimage(ctx, player, animTime, landed, state.running, state.speed || 0, finalRot, COLORS);
  }

  // Glow
  ctx.shadowColor = "rgba(242,242,242,0.18)";
  ctx.shadowBlur = 12;

  // Body
  drawRunner(ctx, player, animTime, landed, state.running, state.speed || 0, COLORS);

  // Crisp outline
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(242,242,242,0.30)";
  ctx.lineWidth = 1;

  const bodyW = player.w * 0.70;
  const bodyH = player.h * 0.78;
  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - player.h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;
  roundedRectPath(ctx, bodyX + 0.5, bodyY + 0.5, bodyW - 1, bodyH - 1, radius);
  ctx.stroke();

  ctx.restore();
}