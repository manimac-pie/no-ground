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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randRange(seed, min, max) {
  return lerp(min, max, hash01(seed));
}

function drawSkylineLayer(ctx, x, horizon, span, tile, style) {
  const count = style.minBuildings
    + Math.floor(hash01(tile * style.seedA) * (style.maxBuildings - style.minBuildings + 1));
  let cursor = x + style.pad;
  const maxX = x + span - style.pad;

  for (let i = 0; i < count; i++) {
    let bw = randRange(tile * style.seedB + i * 7.7, style.minW, style.maxW);
    const bh = randRange(tile * style.seedC + i * 9.3, style.minH, style.maxH);
    const gap = randRange(tile * style.seedD + i * 5.1, style.gapMin, style.gapMax);

    if (cursor + bw > maxX) {
      bw = maxX - cursor;
      if (bw < style.minW * 0.6) break;
    }

    ctx.fillStyle = style.baseColor;
    ctx.fillRect(cursor, horizon - bh, bw, bh);

    if (hash01(tile * style.seedE + i * 3.7) > style.roofChance) {
      const rh = randRange(tile * style.seedF + i * 6.1, style.roofMin, style.roofMax);
      const rw = bw * randRange(tile * style.seedG + i * 2.9, 0.18, 0.48);
      const rx = cursor + bw * randRange(tile * style.seedH + i * 4.1, 0.08, 0.62);
      ctx.fillRect(rx, horizon - bh - rh, rw, rh);
    }

    if (hash01(tile * style.seedI + i * 4.3) > style.shoulderChance) {
      const sw = bw * randRange(tile * style.seedJ + i * 3.1, 0.18, 0.35);
      const sh = randRange(tile * style.seedK + i * 2.7, 18, 60);
      const sx = cursor + bw * randRange(tile * style.seedL + i * 5.3, 0.05, 0.72);
      ctx.fillRect(sx, horizon - bh - sh, sw, sh);
    }

    if (hash01(tile * style.seedM + i * 2.3) > style.antennaChance) {
      const ax = cursor + bw * randRange(tile * style.seedN + i * 6.9, 0.15, 0.82);
      const ah = randRange(tile * style.seedO + i * 4.9, 20, style.antennaMax);
      ctx.fillRect(ax, horizon - bh - ah, 2, ah);
    }

    if (hash01(tile * style.seedP + i * 5.7) > style.craneChance) {
      const cx = cursor + bw * randRange(tile * style.seedQ + i * 7.1, 0.2, 0.7);
      const ch = randRange(tile * style.seedR + i * 3.9, 60, 110);
      ctx.fillRect(cx, horizon - bh - ch, 3, ch);
      ctx.fillRect(cx - 40, horizon - bh - ch, 80, 4);
    }

    ctx.fillStyle = style.windowColor;
    const wcount = 1 + Math.floor(hash01(tile * style.seedS + i * 3.9) * 2);
    for (let w = 0; w < wcount; w++) {
      const wx = cursor + bw * randRange(tile * style.seedT + i * 9.1 + w * 1.7, 0.12, 0.86);
      const wy = horizon - bh + randRange(tile * style.seedU + i * 4.1 + w * 2.3, 18, 50);
      const wh = randRange(tile * style.seedV + i * 7.3 + w * 1.1, 40, bh * 0.6);
      ctx.fillRect(wx, wy, 2, wh);
    }
    ctx.fillStyle = style.accentColor;
    if (hash01(tile * style.seedW + i * 6.3) > style.accentChance) {
      const ax = cursor + bw * randRange(tile * style.seedX + i * 5.7, 0.2, 0.7);
      ctx.fillRect(ax, horizon - bh - 12, randRange(tile * style.seedY + i * 3.5, 18, 46), 3);
    }

    cursor += bw + gap;
  }
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
  for (let i = -1; i <= Math.ceil(W / farSpan) + 1; i++) {
    const tile = farIndex + i;
    const x = offFar + i * farSpan;
    drawSkylineLayer(ctx, x, horizon, farSpan, tile, {
      baseColor: "rgba(10,12,18,0.72)",
      windowColor: "rgba(120,205,255,0.14)",
      accentColor: "rgba(255,140,70,0.18)",
      minBuildings: 2,
      maxBuildings: 3,
      minW: 90,
      maxW: 200,
      minH: 90,
      maxH: 190,
      roofMin: 16,
      roofMax: 36,
      antennaMax: 80,
      gapMin: 14,
      gapMax: 40,
      pad: 20,
      roofChance: 0.55,
      shoulderChance: 0.6,
      antennaChance: 0.72,
      craneChance: 0.8,
      accentChance: 0.6,
      seedA: 3.1,
      seedB: 5.7,
      seedC: 9.1,
      seedD: 11.3,
      seedE: 13.7,
      seedF: 17.9,
      seedG: 19.7,
      seedH: 23.3,
      seedI: 29.1,
      seedJ: 31.3,
      seedK: 37.7,
      seedL: 41.9,
      seedM: 43.7,
      seedN: 47.1,
      seedO: 49.9,
      seedP: 53.3,
      seedQ: 59.1,
      seedR: 61.7,
      seedS: 67.9,
      seedT: 71.3,
      seedU: 73.7,
      seedV: 79.1,
      seedW: 83.3,
      seedX: 89.7,
      seedY: 97.1,
    });
  }

  const midSpan = 360;
  const midScroll = distance * 0.11;
  const midIndex = Math.floor(midScroll / midSpan);
  const offMid = -(midScroll % midSpan);
  for (let i = -1; i <= Math.ceil(W / midSpan) + 1; i++) {
    const tile = midIndex + i;
    const x = offMid + i * midSpan;
    drawSkylineLayer(ctx, x, horizon, midSpan, tile, {
      baseColor: "rgba(16,18,26,0.88)",
      windowColor: "rgba(120,205,255,0.20)",
      accentColor: "rgba(255,160,80,0.16)",
      minBuildings: 2,
      maxBuildings: 4,
      minW: 80,
      maxW: 200,
      minH: 110,
      maxH: 230,
      roofMin: 18,
      roofMax: 44,
      antennaMax: 100,
      gapMin: 10,
      gapMax: 32,
      pad: 12,
      roofChance: 0.5,
      shoulderChance: 0.55,
      antennaChance: 0.68,
      craneChance: 0.72,
      accentChance: 0.55,
      seedA: 4.3,
      seedB: 6.9,
      seedC: 8.7,
      seedD: 12.1,
      seedE: 14.9,
      seedF: 18.7,
      seedG: 21.1,
      seedH: 24.9,
      seedI: 27.7,
      seedJ: 33.1,
      seedK: 36.7,
      seedL: 39.9,
      seedM: 45.1,
      seedN: 48.7,
      seedO: 52.3,
      seedP: 57.1,
      seedQ: 62.9,
      seedR: 66.7,
      seedS: 70.1,
      seedT: 74.3,
      seedU: 78.7,
      seedV: 82.9,
      seedW: 86.3,
      seedX: 91.7,
      seedY: 95.9,
    });
  }

  const nearSpan = 300;
  const nearScroll = distance * 0.18;
  const nearIndex = Math.floor(nearScroll / nearSpan);
  const offNear = -(nearScroll % nearSpan);
  for (let i = -1; i <= Math.ceil(W / nearSpan) + 1; i++) {
    const tile = nearIndex + i;
    const x = offNear + i * nearSpan;
    drawSkylineLayer(ctx, x, horizon, nearSpan, tile, {
      baseColor: "rgba(22,24,32,0.96)",
      windowColor: "rgba(120,205,255,0.26)",
      accentColor: "rgba(255,150,70,0.20)",
      minBuildings: 2,
      maxBuildings: 4,
      minW: 70,
      maxW: 190,
      minH: 100,
      maxH: 210,
      roofMin: 16,
      roofMax: 40,
      antennaMax: 120,
      gapMin: 8,
      gapMax: 26,
      pad: 10,
      roofChance: 0.48,
      shoulderChance: 0.52,
      antennaChance: 0.62,
      craneChance: 0.66,
      accentChance: 0.5,
      seedA: 6.1,
      seedB: 8.3,
      seedC: 10.9,
      seedD: 14.3,
      seedE: 18.1,
      seedF: 21.7,
      seedG: 25.1,
      seedH: 28.7,
      seedI: 31.9,
      seedJ: 35.3,
      seedK: 38.9,
      seedL: 42.1,
      seedM: 46.3,
      seedN: 49.1,
      seedO: 52.7,
      seedP: 57.7,
      seedQ: 61.1,
      seedR: 65.3,
      seedS: 69.1,
      seedT: 73.3,
      seedU: 76.7,
      seedV: 81.1,
      seedW: 85.3,
      seedX: 88.9,
      seedY: 93.1,
    });
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
