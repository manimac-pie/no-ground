// src/render/world/backdrop.js
import { world } from "../../game/constants.js";
import { hash01 } from "../../shared/math.js";

// The skyline's own hash01 constant, so the distant city doesn't repeat the buildings in front.
const SKYLINE_K = 731.13;

function drawSkyGradient(ctx, W, H, COLORS) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(0.55, "rgba(20,26,36,0.95)");
  g.addColorStop(0.85, "rgba(8,10,14,0.95)");
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randRange(seed, min, max) {
  return lerp(min, max, hash01(seed, SKYLINE_K));
}

function drawSkylineLayer(ctx, x, horizon, span, tile, style) {
  const count = style.minBuildings
    + Math.floor(hash01(tile * style.seedA, SKYLINE_K) * (style.maxBuildings - style.minBuildings + 1));
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

    if (hash01(tile * style.seedE + i * 3.7, SKYLINE_K) > style.roofChance) {
      const rh = randRange(tile * style.seedF + i * 6.1, style.roofMin, style.roofMax);
      const rw = bw * randRange(tile * style.seedG + i * 2.9, 0.18, 0.48);
      const rx = cursor + bw * randRange(tile * style.seedH + i * 4.1, 0.08, 0.62);
      ctx.fillRect(rx, horizon - bh - rh, rw, rh);
    }

    if (hash01(tile * style.seedI + i * 4.3, SKYLINE_K) > style.shoulderChance) {
      const sw = bw * randRange(tile * style.seedJ + i * 3.1, 0.18, 0.35);
      const sh = randRange(tile * style.seedK + i * 2.7, 18, 60);
      const sx = cursor + bw * randRange(tile * style.seedL + i * 5.3, 0.05, 0.72);
      ctx.fillRect(sx, horizon - bh - sh, sw, sh);
    }

    if (hash01(tile * style.seedM + i * 2.3, SKYLINE_K) > style.antennaChance) {
      const ax = cursor + bw * randRange(tile * style.seedN + i * 6.9, 0.15, 0.82);
      const ah = randRange(tile * style.seedO + i * 4.9, 20, style.antennaMax);
      ctx.fillRect(ax, horizon - bh - ah, 2, ah);
    }

    if (hash01(tile * style.seedP + i * 5.7, SKYLINE_K) > style.craneChance) {
      const cx = cursor + bw * randRange(tile * style.seedQ + i * 7.1, 0.2, 0.7);
      const ch = randRange(tile * style.seedR + i * 3.9, 60, 110);
      ctx.fillRect(cx, horizon - bh - ch, 3, ch);
      ctx.fillRect(cx - 40, horizon - bh - ch, 80, 4);
    }

    ctx.fillStyle = style.windowColor;
    const wcount = 1 + Math.floor(hash01(tile * style.seedS + i * 3.9, SKYLINE_K) * 2);
    for (let w = 0; w < wcount; w++) {
      const wx = cursor + bw * randRange(tile * style.seedT + i * 9.1 + w * 1.7, 0.12, 0.86);
      const wy = horizon - bh + randRange(tile * style.seedU + i * 4.1 + w * 2.3, 18, 50);
      const wh = randRange(tile * style.seedV + i * 7.3 + w * 1.1, 40, bh * 0.6);
      ctx.fillRect(wx, wy, 2, wh);
    }
    ctx.fillStyle = style.accentColor;
    if (hash01(tile * style.seedW + i * 6.3, SKYLINE_K) > style.accentChance) {
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

function drawBackgroundDirect(ctx, W, H, COLORS) {
  drawSkyGradient(ctx, W, H, COLORS);
  drawAuroraRibbons(ctx, W, H);
  drawLowSun(ctx, W, H);
  drawBandFog(ctx, W, H);
  drawDistantRidges(ctx, W, H);

  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, world.GROUND_Y - 130, W, 130);
}

// ---------------- cached layers ----------------
// The background and skyline tiles never change for a given size, so they're painted
// once into offscreen canvases at the current device scale and stamped with drawImage.
// While the zoom animates (menu zoom-in, death cinematic) the scale changes every frame,
// so those frames draw directly instead of repainting a cache each time.
const canCache = typeof document !== "undefined";

function createCanvas() {
  return document.createElement("canvas");
}

// True when the transform is axis-aligned and its scale matches the previous call's.
function scaleSettled(slot, m) {
  const scaleKey = `${m.a}|${m.d}`;
  const settled = slot.lastScaleKey === scaleKey;
  slot.lastScaleKey = scaleKey;
  return settled && m.b === 0 && m.c === 0 && m.a > 0 && m.d > 0;
}

// Sub-pixel offsets are rounded to 1/64 px so float noise in the camera transform
// doesn't force a repaint.
function quantize(v) {
  return Math.round(v * 64) / 64;
}

const bgCache = { canvas: null, key: "", lastScaleKey: "", lastKey: "" };

// Returns false if it couldn't use the cache this frame.
function stampBackground(ctx, W, H, COLORS) {
  const m = ctx.getTransform();
  if (!scaleSettled(bgCache, m)) return false;

  // Device-pixel box of the W×H background, clipped to the canvas.
  const x0 = Math.max(0, Math.floor(m.e));
  const y0 = Math.max(0, Math.floor(m.f));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(m.a * W + m.e));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(m.d * H + m.f));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return true;

  const tx = quantize(m.e - x0);
  const ty = quantize(m.f - y0);
  const key = `${m.a}|${m.d}|${tx}|${ty}|${w}|${h}|${W}|${H}|${world.GROUND_Y}|${COLORS.bgTop}|${COLORS.bgBottom}|${COLORS.fog}`;
  // The camera can pan while zoomed in: only repaint once the view has held still for a frame.
  const steady = key === bgCache.lastKey;
  bgCache.lastKey = key;

  if (bgCache.key !== key) {
    if (!steady) return false;
    if (!bgCache.canvas) bgCache.canvas = createCanvas();
    const canvas = bgCache.canvas;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const pctx = canvas.getContext("2d");
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, w, h);
    pctx.setTransform(m.a, 0, 0, m.d, tx, ty);
    drawBackgroundDirect(pctx, W, H, COLORS);
    bgCache.key = key;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bgCache.canvas, x0, y0);
  return true;
}

export function drawBackground(ctx, W, H, COLORS) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (!canCache || !stampBackground(ctx, W, H, COLORS)) {
    drawBackgroundDirect(ctx, W, H, COLORS);
  }

  ctx.restore();
}

// Skyline tiles: one canvas per (layer, tile index), dropped once it scrolls off screen.
// Records the bounds of a tile's fillRects so its canvas is exactly as big as needed.
const boundsCtx = {
  fillStyle: "",
  x0: 0, y0: 0, x1: 0, y1: 0,
  fillRect(x, y, w, h) {
    this.x0 = Math.min(this.x0, x);
    this.y0 = Math.min(this.y0, y);
    this.x1 = Math.max(this.x1, x + w);
    this.y1 = Math.max(this.y1, y + h);
  },
};

function createTileLayer() {
  return { key: "", lastScaleKey: "", tiles: new Map(), spare: [], frame: 0 };
}

// Paints (or reuses) one tile and stamps it at x if it's on screen.
// Assumes the layer's scale is settled. viewX0/viewX1: visible range in layer units.
function stampSkylineTile(ctx, layer, m, x, viewX0, viewX1, horizon, span, tile, style) {
  let entry = layer.tiles.get(tile);
  if (!entry) {
    // Bounds relative to the tile's left edge (x = 0), with a 1 device px margin
    // for antialiased edges. The canvas is painted later, once the tile is visible.
    boundsCtx.x0 = Infinity;
    boundsCtx.y0 = Infinity;
    boundsCtx.x1 = -Infinity;
    boundsCtx.y1 = -Infinity;
    drawSkylineLayer(boundsCtx, 0, horizon, span, tile, style);
    const empty = !(boundsCtx.x1 > boundsCtx.x0);
    const bx = boundsCtx.x0 - 1 / m.a;
    const by = boundsCtx.y0 - 1 / m.d;
    const pw = empty ? 0 : Math.ceil((boundsCtx.x1 - bx) * m.a) + 1;
    const ph = empty ? 0 : Math.ceil((boundsCtx.y1 - by) * m.d) + 1;
    entry = { canvas: null, frame: 0, bx, by, pw, ph, bw: pw / m.a, bh: ph / m.d };
    layer.tiles.set(tile, entry);
  }
  entry.frame = layer.frame;
  if (entry.pw === 0 || x + entry.bx >= viewX1 || x + entry.bx + entry.bw <= viewX0) return;

  if (!entry.canvas) {
    const canvas = layer.spare.pop() || createCanvas();
    if (canvas.width !== entry.pw || canvas.height !== entry.ph) {
      canvas.width = entry.pw;
      canvas.height = entry.ph;
    }
    const pctx = canvas.getContext("2d");
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, entry.pw, entry.ph);
    pctx.setTransform(m.a, 0, 0, m.d, -entry.bx * m.a, -entry.by * m.d);
    drawSkylineLayer(pctx, 0, horizon, span, tile, style);
    entry.canvas = canvas;
  }
  ctx.drawImage(entry.canvas, x + entry.bx, entry.by, entry.bw, entry.bh);
}

// Draws one parallax layer, from cached tiles when the scale is settled.
function drawSkylineTiles(ctx, layer, W, horizon, span, scroll, style) {
  const index = Math.floor(scroll / span);
  const off = -(scroll % span);
  const last = Math.ceil(W / span) + 1;

  // Zoomed in (start screen, death cinematic), tiles would be bigger than the screen
  // and mostly off it: draw directly.
  const m = canCache ? ctx.getTransform() : null;
  const settled = m && scaleSettled(layer, m);
  if (!settled || span * m.a > ctx.canvas.width) {
    for (let i = -1; i <= last; i++) {
      drawSkylineLayer(ctx, off + i * span, horizon, span, index + i, style);
    }
    return;
  }
  const viewX0 = -m.e / m.a;
  const viewX1 = (ctx.canvas.width - m.e) / m.a;

  // Tiles are painted at the device scale: repaint them all if it changed.
  const key = `${m.a}|${m.d}|${horizon}`;
  if (layer.key !== key) {
    for (const entry of layer.tiles.values()) {
      if (entry.canvas) layer.spare.push(entry.canvas);
    }
    layer.tiles.clear();
    layer.key = key;
  }

  layer.frame++;
  for (let i = -1; i <= last; i++) {
    stampSkylineTile(ctx, layer, m, off + i * span, viewX0, viewX1, horizon, span, index + i, style);
  }

  // Drop tiles that weren't drawn this frame and keep their canvases for reuse.
  for (const [tile, entry] of layer.tiles) {
    if (entry.frame !== layer.frame) {
      if (entry.canvas) layer.spare.push(entry.canvas);
      layer.tiles.delete(tile);
    }
  }
}

const farLayer = createTileLayer();
const midLayer = createTileLayer();
const nearLayer = createTileLayer();

const FAR_SKYLINE = {
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
};

const MID_SKYLINE = {
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
};

const NEAR_SKYLINE = {
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
};

export function drawParallax(ctx, W, H, distance) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const horizon = world.GROUND_Y - 26;
  drawSkylineTiles(ctx, farLayer, W, horizon, 520, distance * 0.06, FAR_SKYLINE);
  drawSkylineTiles(ctx, midLayer, W, horizon, 360, distance * 0.11, MID_SKYLINE);
  drawSkylineTiles(ctx, nearLayer, W, horizon, 300, distance * 0.18, NEAR_SKYLINE);

  // Sparse signal lights.
  ctx.fillStyle = "rgba(120,205,255,0.20)";
  for (let i = 0; i < 18; i++) {
    // Move opposite the travel direction to match background drift.
    const sx = ((i * 137 - distance * 0.6) % W + W) % W;
    const sy = 30 + ((i * 67) % 120);
    ctx.fillRect(sx, sy, 2, 2);
  }

  if (!canCache || !stampScanlines(ctx, W, H)) {
    drawScanlinesDirect(ctx, W, H);
  }

  ctx.restore();
}

// Subtle scanline noise.
function drawScanlinesDirect(ctx, W, H) {
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;
}

// Every column of the scanlines is identical, so the cache is a narrow strip that gets
// stretched across the screen. The key only depends on the vertical part of the
// transform, so the horizontal parallax shift never forces a repaint.
const SCAN_STRIP_W = 1;
const scanCache = { canvas: null, key: "", lastScaleKey: "", lastKey: "" };

// Returns false if it couldn't use the cache this frame.
function stampScanlines(ctx, W, H) {
  const m = ctx.getTransform();
  if (!scaleSettled(scanCache, m)) return false;

  const x0 = Math.max(0, Math.round(m.e));
  const x1 = Math.min(ctx.canvas.width, Math.round(m.a * W + m.e));
  const y0 = Math.max(0, Math.floor(m.f));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(m.d * H + m.f));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return true;

  const ty = quantize(m.f - y0);
  const key = `${m.d}|${ty}|${h}|${H}`;
  const steady = key === scanCache.lastKey;
  scanCache.lastKey = key;

  if (scanCache.key !== key) {
    if (!steady) return false;
    if (!scanCache.canvas) scanCache.canvas = createCanvas();
    const canvas = scanCache.canvas;
    if (canvas.width !== SCAN_STRIP_W || canvas.height !== h) {
      canvas.width = SCAN_STRIP_W;
      canvas.height = h;
    }
    const pctx = canvas.getContext("2d");
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, SCAN_STRIP_W, h);
    pctx.setTransform(1, 0, 0, m.d, 0, ty);
    drawScanlinesDirect(pctx, SCAN_STRIP_W, H);
    scanCache.key = key;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scanCache.canvas, 0, 0, SCAN_STRIP_W, h, x0, y0, w, h);
  return true;
}
