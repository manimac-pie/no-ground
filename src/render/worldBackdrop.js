// src/render/worldBackdrop.js
import { world } from "../game.js";

function drawHorizonGlow(ctx, W, H) {
  const y = world.GROUND_Y - 30;
  const g = ctx.createRadialGradient(W * 0.6, y, 40, W * 0.6, y, 260);
  g.addColorStop(0, "rgba(120,205,255,0.20)");
  g.addColorStop(0.45, "rgba(120,205,255,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawAngledBeams(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "rgba(242,242,242,0.12)";
  for (let i = -2; i < 6; i++) {
    const x = i * 180;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 220, 0);
    ctx.lineTo(x + 380, H);
    ctx.lineTo(x + 160, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawDistantMegastructure(ctx, W, H) {
  const horizon = world.GROUND_Y - 20;
  ctx.fillStyle = "rgba(10,12,16,0.55)";
  for (let x = -120; x < W + 180; x += 180) {
    const h = 80 + (x * 23) % 70;
    ctx.fillRect(x, horizon - h, 120, h);
    ctx.fillRect(x + 80, horizon - h - 20, 60, 20);
  }

  ctx.fillStyle = "rgba(18,20,26,0.65)";
  for (let x = -140; x < W + 200; x += 220) {
    const h = 110 + (x * 41) % 90;
    ctx.fillRect(x, horizon - h, 150, h);
    ctx.fillRect(x + 20, horizon - h - 26, 90, 26);
  }
}

export function drawBackground(ctx, W, H, COLORS) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawAngledBeams(ctx, W, H);
  drawHorizonGlow(ctx, W, H);
  drawDistantMegastructure(ctx, W, H);

  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, world.GROUND_Y - 130, W, 130);

  ctx.restore();
}

export function drawParallax(ctx, W, H, distance) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const horizon = world.GROUND_Y - 26;

  const offFar = -((distance * 0.07) % (W + 420));
  ctx.fillStyle = "rgba(20,24,30,0.55)";
  for (let x = offFar; x < W + 420; x += 420) {
    ctx.fillRect(x + 40, horizon - 180, 220, 90);
    ctx.fillRect(x + 10, horizon - 130, 260, 60);
  }

  const offMid = -((distance * 0.12) % (W + 320));
  ctx.fillStyle = "rgba(26,30,38,0.70)";
  for (let x = offMid; x < W + 320; x += 320) {
    ctx.fillRect(x + 30, horizon - 150, 170, 80);
    ctx.fillRect(x - 10, horizon - 110, 230, 60);
    ctx.fillRect(x + 60, horizon - 210, 60, 50);
  }

  const offNear = -((distance * 0.18) % (W + 260));
  ctx.fillStyle = "rgba(34,38,46,0.85)";
  for (let x = offNear; x < W + 260; x += 260) {
    ctx.fillRect(x + 20, horizon - 120, 160, 70);
    ctx.fillRect(x - 10, horizon - 90, 210, 45);
    ctx.fillRect(x + 110, horizon - 160, 40, 40);
  }

  // Sparse signal lights.
  ctx.fillStyle = "rgba(120,205,255,0.20)";
  for (let i = 0; i < 18; i++) {
    // Move opposite the travel direction to match background drift.
    const sx = ((i * 137 - distance * 0.6) % W + W) % W;
    const sy = 30 + ((i * 67) % 120);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Subtle scanline noise.
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }

  ctx.restore();
}

export function drawVignette(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const g = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.20,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.70
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
}
