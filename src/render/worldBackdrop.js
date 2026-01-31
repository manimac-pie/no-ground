// src/render/worldBackdrop.js
import { world } from "../game.js";

function drawSkyGradient(ctx, W, H, COLORS) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(0.55, "rgba(20,26,36,0.95)");
  g.addColorStop(0.85, "rgba(8,10,14,0.95)");
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function hash01(n) {
  const x = Math.sin(n * 731.13) * 43758.5453;
  return x - Math.floor(x);
}

function drawLowSun(ctx, W, H) {
  const y = world.GROUND_Y - 42;
  const g = ctx.createRadialGradient(W * 0.68, y, 20, W * 0.68, y, 280);
  g.addColorStop(0, "rgba(255,180,90,0.16)");
  g.addColorStop(0.35, "rgba(120,205,255,0.12)");
  g.addColorStop(0.7, "rgba(120,205,255,0.04)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawAuroraRibbons(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(120,205,255,0.30)";
  ctx.lineWidth = 36;
  for (let i = 0; i < 3; i++) {
    const y = H * (0.18 + i * 0.13);
    ctx.beginPath();
    ctx.moveTo(-80, y + 18 * i);
    for (let x = -80; x <= W + 80; x += 120) {
      const k = (x / W) * Math.PI * 2;
      const wave = Math.sin(k + i * 0.9) * (14 + i * 6);
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "rgba(255,120,180,0.28)";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(-60, H * 0.26);
  for (let x = -60; x <= W + 80; x += 100) {
    const k = (x / W) * Math.PI * 3;
    const wave = Math.cos(k * 1.1) * 10;
    ctx.lineTo(x, H * 0.26 + wave);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBandFog(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(242,242,242,0.24)";
  for (let i = 0; i < 5; i++) {
    const y = H * (0.33 + i * 0.10);
    const h = 22 + i * 8;
    ctx.fillRect(0, y, W, h);
  }
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = "rgba(12,14,18,0.55)";
  for (let i = 0; i < 4; i++) {
    const y = H * (0.38 + i * 0.12);
    const h = 14 + i * 6;
    ctx.fillRect(0, y, W, h);
  }
  ctx.restore();
}

function drawDistantRidges(ctx, W, H) {
  const horizon = world.GROUND_Y - 18;
  ctx.save();

  // Far skyline blocks.
  ctx.fillStyle = "rgba(8,10,14,0.82)";
  for (let x = -120; x < W + 160; x += 140) {
    const h = 60 + ((x * 29) % 70);
    const w = 90 + ((x * 17) % 50);
    ctx.fillRect(x, horizon - h, w, h);
    ctx.fillRect(x + w * 0.6, horizon - h - 20, 24, 20);
  }

  // Mid skyline with tanks + stacks.
  ctx.fillStyle = "rgba(12,14,20,0.88)";
  for (let x = -160; x < W + 200; x += 180) {
    const h = 90 + ((x * 13) % 90);
    const w = 120 + ((x * 23) % 70);
    ctx.fillRect(x, horizon - h, w, h);
    ctx.fillRect(x + 10, horizon - h - 14, 46, 14);
    ctx.fillRect(x + w - 28, horizon - h - 36, 18, 36);
  }

  // Light industrial pipe run + orange hazard.
  ctx.fillStyle = "rgba(120,205,255,0.18)";
  for (let x = -80; x < W + 120; x += 160) {
    ctx.fillRect(x, horizon - 46, 90, 2);
  }
  ctx.fillStyle = "rgba(255,170,80,0.16)";
  for (let x = -60; x < W + 140; x += 200) {
    ctx.fillRect(x + 40, horizon - 52, 22, 2);
  }

  ctx.restore();
}

export function drawBackground(ctx, W, H, COLORS) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  drawSkyGradient(ctx, W, H, COLORS);
  drawAuroraRibbons(ctx, W, H);
  drawLowSun(ctx, W, H);
  drawBandFog(ctx, W, H);
  drawDistantRidges(ctx, W, H);

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

  const farSpan = 520;
  const farScroll = distance * 0.06;
  const farIndex = Math.floor(farScroll / farSpan);
  const offFar = -(farScroll % farSpan);
  ctx.fillStyle = "rgba(10,12,18,0.72)";
  for (let i = -1; i <= Math.ceil(W / farSpan) + 1; i++) {
    const tile = farIndex + i;
    const x = offFar + i * farSpan;
    const h1 = 120 + Math.floor(hash01(tile * 3.1) * 80);
    const h2 = 90 + Math.floor(hash01(tile * 5.7) * 70);
    ctx.fillRect(x + 30, horizon - h1, 180, h1);
    ctx.fillRect(x + 220, horizon - h2, 160, h2);
    ctx.fillRect(x + 120, horizon - h1 - 28, 30, 28);

    // Cyan windows + orange stack glow.
    ctx.fillStyle = "rgba(120,205,255,0.14)";
    ctx.fillRect(x + 60, horizon - h1 + 30, 2, 60);
    ctx.fillStyle = "rgba(255,140,70,0.18)";
    ctx.fillRect(x + 240, horizon - h2 - 22, 16, 22);
    ctx.fillStyle = "rgba(10,12,18,0.72)";
  }

  const midSpan = 360;
  const midScroll = distance * 0.11;
  const midIndex = Math.floor(midScroll / midSpan);
  const offMid = -(midScroll % midSpan);
  ctx.fillStyle = "rgba(16,18,26,0.88)";
  for (let i = -1; i <= Math.ceil(W / midSpan) + 1; i++) {
    const tile = midIndex + i;
    const x = offMid + i * midSpan;
    const h = 130 + Math.floor(hash01(10 + tile * 4.3) * 90);
    ctx.fillRect(x + 10, horizon - h, 210, h);
    ctx.fillRect(x + 30, horizon - h - 16, 70, 16);
    ctx.fillRect(x + 160, horizon - h - 40, 28, 40);
    ctx.fillRect(x + 80, horizon - h - 70, 16, 70);
    ctx.fillRect(x + 8, horizon - h - 28, 20, 28);

    // Crane silhouette.
    ctx.fillRect(x + 180, horizon - h - 88, 4, 88);
    ctx.fillRect(x + 150, horizon - h - 88, 60, 6);

    ctx.fillStyle = "rgba(120,205,255,0.20)";
    ctx.fillRect(x + 120, horizon - h + 20, 2, 70);
    ctx.fillStyle = "rgba(255,160,80,0.16)";
    ctx.fillRect(x + 46, horizon - h - 12, 40, 4);
    ctx.fillStyle = "rgba(16,18,26,0.88)";
  }

  const nearSpan = 300;
  const nearScroll = distance * 0.18;
  const nearIndex = Math.floor(nearScroll / nearSpan);
  const offNear = -(nearScroll % nearSpan);
  ctx.fillStyle = "rgba(22,24,32,0.96)";
  for (let i = -1; i <= Math.ceil(W / nearSpan) + 1; i++) {
    const tile = nearIndex + i;
    const x = offNear + i * nearSpan;
    const h = 110 + Math.floor(hash01(30 + tile * 6.1) * 70);
    ctx.fillRect(x - 10, horizon - h, 200, h);
    ctx.fillRect(x + 40, horizon - h - 22, 80, 22);
    ctx.fillRect(x + 150, horizon - h - 48, 22, 48);
    ctx.fillRect(x + 10, horizon - h - 62, 14, 62);
    ctx.fillRect(x + 90, horizon - h - 40, 18, 40);

    // Crane + catwalk.
    ctx.fillRect(x + 130, horizon - h - 92, 4, 92);
    ctx.fillRect(x + 90, horizon - h - 92, 70, 6);
    ctx.fillStyle = "rgba(120,205,255,0.26)";
    ctx.fillRect(x + 60, horizon - h + 28, 2, 60);
    ctx.fillStyle = "rgba(255,150,70,0.20)";
    ctx.fillRect(x + 120, horizon - h - 8, 24, 4);
    ctx.fillStyle = "rgba(22,24,32,0.96)";
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
