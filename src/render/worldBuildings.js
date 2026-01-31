// src/render/worldBuildings.js

import { world } from "../game.js";

// ---------------- small helpers ----------------
function getColor(COLORS, key, fallback) {
  const v = COLORS && COLORS[key];
  return (typeof v === "string" && v.length) ? v : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hash01(n) {
  const x = Math.sin(n * 999.123) * 43758.5453;
  return x - Math.floor(x);
}

function shadeRect(ctx, x, y, w, h, topColor, bottomColor) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, topColor);
  g.addColorStop(1, bottomColor);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawBrutalistFacade(ctx, x, y, w, h, seed, COLORS, crack01, animTime) {
  if (w < 60 || h < 40) return;

  const rib = getColor(COLORS, "buildingRib", "rgba(10,12,16,0.65)");
  const panelLite = getColor(COLORS, "buildingPanel", "rgba(70,74,86,0.20)");
  const panelDark = getColor(COLORS, "buildingPanelDark", "rgba(10,12,16,0.38)");
  const seam = getColor(COLORS, "neonLine", "rgba(120,205,255,0.25)");
  const winOn = getColor(COLORS, "windowOn", "rgba(120,205,255,0.22)");
  const winOff = getColor(COLORS, "windowOff", "rgba(242,242,242,0.06)");
  const signal = getColor(COLORS, "signal", "rgba(255,85,110,0.55)");
  const stain = getColor(COLORS, "concreteStain", "rgba(0,0,0,0.18)");
  const dust = getColor(COLORS, "concreteDust", "rgba(242,242,242,0.06)");
  const patch = getColor(COLORS, "patchPanel", "rgba(32,36,44,0.85)");
  const warning = getColor(COLORS, "warning", "rgba(255,180,70,0.65)");
  const gantry = getColor(COLORS, "gantry", "rgba(20,22,28,0.85)");
  const coreShadow = getColor(COLORS, "coreShadow", "rgba(0,0,0,0.22)");
  const ledge = getColor(COLORS, "ledge", "rgba(0,0,0,0.25)");
  const ledgeLite = getColor(COLORS, "ledgeLite", "rgba(242,242,242,0.06)");

  const pad = 8;
  const ribCount = clamp(Math.floor(w / 32), 2, 8);
  const ribW = clamp(Math.floor(w / (ribCount * 6)), 4, 10);
  const ribGap = w / (ribCount + 1);

  ctx.save();

  // Depth layers: setbacks + terraces (simple block offsets).
  if (w > 120 && h > 90) {
    const tiers = 1 + Math.floor(hash01(seed * 51.7) * 2);
    for (let i = 0; i < tiers; i++) {
      const inset = 8 + i * 10;
      const ty = y + 10 + (h - 30) * (0.18 + 0.28 * hash01(seed * (53.1 + i * 7.3)));
      const tw = w - inset * 2;
      const th = 10 + 8 * hash01(seed * (55.9 + i * 9.1));
      ctx.fillStyle = ledge;
      ctx.fillRect(x + inset + 2, ty + 2, tw, th);
      ctx.fillStyle = ledgeLite;
      ctx.fillRect(x + inset, ty, tw, th);
    }
  }

  // External service core (structural logic).
  if (hash01(seed * 3.1) > 0.45 && w > 110) {
    const side = hash01(seed * 6.7) > 0.5 ? 0 : 1;
    const coreW = Math.max(18, Math.min(32, Math.floor(w * 0.16)));
    const coreX = side === 0 ? x - coreW + 6 : x + w - 6;
    ctx.fillStyle = coreShadow;
    ctx.fillRect(coreX - 3, y + 6, coreW + 6, h - 12);
    ctx.fillStyle = panelDark;
    ctx.fillRect(coreX, y + 6, coreW, h - 12);
    ctx.fillStyle = panelLite;
    for (let i = 0; i < 4; i++) {
      const sy = y + 14 + i * (h - 28) / 3;
      ctx.fillRect(coreX + 4, sy, coreW - 8, 3);
    }
  }

  // Vertical ribs (brutalist buttresses).
  ctx.fillStyle = rib;
  for (let i = 0; i < ribCount; i++) {
    const rx = Math.round(x + ribGap * (i + 1) - ribW * 0.5);
    ctx.fillRect(rx, y + 4, ribW, h - 8);
  }

  // Horizontal banding for poured concrete seams.
  ctx.fillStyle = panelLite;
  const bandH = 8;
  const bandGap = 18;
  for (let by = y + 10; by + bandH < y + h - 8; by += bandH + bandGap) {
    ctx.fillRect(x + 6, by, w - 12, bandH);
  }

  // Gantry / service walkway (structural + life).
  if (hash01(seed * 9.9) > 0.52 && w > 120) {
    const gy = y + h * (0.28 + 0.22 * hash01(seed * 8.1));
    ctx.fillStyle = gantry;
    ctx.fillRect(x + 6, gy, w - 12, 4);
    ctx.fillStyle = "rgba(242,242,242,0.08)";
    for (let gx = x + 10; gx < x + w - 14; gx += 18) {
      ctx.fillRect(gx, gy - 6, 2, 6);
    }
  }

  // Recessed bays.
  const bayCount = clamp(Math.floor(w / 140), 1, 3);
  for (let i = 0; i < bayCount; i++) {
    const bw = Math.max(34, Math.floor(w * (0.18 + 0.08 * hash01(seed * 7.9 + i * 2.1))));
    const bx = x + pad + Math.floor((w - bw - pad * 2) * hash01(seed * 4.3 + i * 9.1));
    const by = y + 14 + Math.floor((h - 36) * hash01(seed * 12.1 + i * 5.7));
    const bh = Math.max(26, Math.floor(h * 0.45));

    ctx.fillStyle = panelDark;
    ctx.fillRect(bx, by, bw, bh);

    ctx.fillStyle = "rgba(242,242,242,0.08)";
    ctx.fillRect(bx, by, bw, 2);
  }

  // Narrow slit windows, sparse.
  const rows = clamp(Math.floor(h / 70), 2, 4);
  const cols = clamp(Math.floor(w / 120), 2, 4);
  const winW = 14;
  const winH = 5;
  for (let r = 0; r < rows; r++) {
    const wy = y + 18 + r * (h - 36) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const wx = x + 18 + c * (w - 36) / (cols - 1);
      const t = hash01(seed * 23.7 + r * 19.1 + c * 11.3);
      ctx.fillStyle = t > 0.72 ? winOn : winOff;
      ctx.fillRect(wx, wy, winW, winH);
    }
  }

  // Material variation: stains and dust flecks.
  const stainCount = clamp(Math.floor(h / 80), 2, 6);
  ctx.fillStyle = stain;
  for (let i = 0; i < stainCount; i++) {
    const sx = x + 8 + (w - 16) * hash01(seed * 14.7 + i * 2.3);
    const sy = y + 6 + (h - 12) * hash01(seed * 15.9 + i * 3.1);
    const sh = 16 + 28 * hash01(seed * 18.1 + i * 4.7);
    ctx.globalAlpha = 0.12 + 0.20 * hash01(seed * 21.3 + i * 6.1);
    ctx.fillRect(sx, sy, 3, sh);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = dust;
  const flecks = clamp(Math.floor((w * h) / 8000), 6, 24);
  for (let i = 0; i < flecks; i++) {
    const fx = x + 4 + (w - 8) * hash01(seed * 25.1 + i * 7.9);
    const fy = y + 4 + (h - 8) * hash01(seed * 27.7 + i * 5.3);
    ctx.fillRect(fx, fy, 1, 1);
  }

  // Story beat: patched panel with rivets.
  if (hash01(seed * 33.3) > 0.6 && w > 90) {
    const pw = Math.max(18, w * 0.18);
    const ph = 10 + h * 0.08;
    const px = x + 10 + (w - pw - 20) * hash01(seed * 35.9);
    const py = y + 18 + (h - ph - 36) * hash01(seed * 37.1);
    ctx.fillStyle = patch;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "rgba(242,242,242,0.10)";
    for (let rx = px + 3; rx < px + pw - 2; rx += 6) {
      ctx.fillRect(rx, py + 2, 1, 1);
      ctx.fillRect(rx, py + ph - 3, 1, 1);
    }
  }

  // Activity: blinking signal lights.
  const blink = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(animTime * (2.2 + hash01(seed * 2.3)) + seed));
  if (blink > 0.72) {
    const sx = x + w * (0.12 + 0.75 * hash01(seed * 11.1));
    const sy = y + h * (0.08 + 0.18 * hash01(seed * 13.9));
    ctx.fillStyle = signal;
    ctx.fillRect(sx, sy, 3, 3);
  }

  // Activity: occasional vent glow.
  if (hash01(seed * 17.7) > 0.5) {
    const vx = x + w * (0.18 + 0.6 * hash01(seed * 3.9));
    const vy = y + h * (0.68 + 0.2 * hash01(seed * 6.1));
    const vw = Math.max(12, w * 0.12);
    const vh = 4;
    const pulse = 0.35 + 0.35 * Math.sin(animTime * (1.3 + hash01(seed * 8.7)));
    ctx.globalAlpha = 0.35 + 0.35 * pulse;
    ctx.fillStyle = winOn;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.globalAlpha = 1;
  }

  // Life signal: micro signage panel.
  if (hash01(seed * 41.7) > 0.62 && w > 120) {
    const signW = Math.max(18, Math.min(42, w * 0.2));
    const signH = 8;
    const sx = x + 10 + (w - signW - 20) * hash01(seed * 43.3);
    const sy = y + h * (0.12 + 0.08 * hash01(seed * 45.1));
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(sx - 2, sy - 2, signW + 4, signH + 4);
    ctx.fillStyle = warning;
    ctx.fillRect(sx, sy, signW, signH);
  }

  // Occasional neon seam, dim when cracked.
  if (hash01(seed * 31.3) > 0.45) {
    const seamX = x + w * (0.18 + 0.64 * hash01(seed * 2.7));
    ctx.globalAlpha = 0.85 - 0.5 * clamp(crack01, 0, 1);
    ctx.fillStyle = seam;
    ctx.fillRect(seamX, y + 6, 2, h - 12);
  }

  ctx.restore();
}

// ---------------- rubble (roof impacts) ----------------
const rubble = [];
let prevHeavyLandT = 0;
let prevRoofJumpT = 0;

// ---------------- debris (whole-building breaks) ----------------
const debris = [];

// ---------------- crumble chunks (whole-building break) ----------------
const buildingChunks = [];

function spawnBuildingChunks(plat, COLORS) {
  if (!plat) return;

  const seed = getPlatformSeed(plat);
  const bodyX = plat.x;
  const bodyY = plat.y + plat.h;
  const bodyW = plat.w;
  const bodyH = clamp(world.GROUND_Y - bodyY, 0, world.GROUND_Y);

  const baseColor = pickBuildingColor(seed, COLORS);
  const altColor = getColor(COLORS, "buildingB", "rgba(34,36,41,0.95)");

  const sizeBase = clamp(Math.sqrt(Math.max(1, bodyW * Math.max(1, bodyH)) / 38), 10, 20);
  const step = sizeBase * 0.9;
  let count = 0;
  const maxCount = 70;

  for (let y = bodyY; y < bodyY + bodyH && count < maxCount; y += step) {
    for (let x = bodyX; x < bodyX + bodyW && count < maxCount; x += step) {
      if (Math.random() < 0.32) continue;
      const w = sizeBase * (0.65 + 0.5 * Math.random());
      const h = sizeBase * (0.65 + 0.5 * Math.random());
      const cx = x + (Math.random() * step * 0.5);
      const cy = y + (Math.random() * step * 0.5);
      buildingChunks.push({
        x: cx,
        y: cy,
        w,
        h,
        vx: (Math.random() * 2 - 1) * (60 + 140 * Math.random()),
        vy: -(60 + 220 * Math.random()),
        life: 0.9 + 0.7 * Math.random(),
        age: 0,
        c: hash01(seed * 9.7 + count * 1.7) < 0.5 ? baseColor : altColor,
      });
      count++;
    }
  }

  // Sprinkle a few roof chunks so the top breaks too.
  const roofColor = getColor(COLORS, "roofTop", "rgba(46,48,54,0.95)");
  const roofCount = Math.min(14, Math.floor(6 + bodyW / 40));
  for (let i = 0; i < roofCount; i++) {
    const w = 6 + 10 * Math.random();
    const h = 3 + 4 * Math.random();
    buildingChunks.push({
      x: bodyX + Math.random() * bodyW,
      y: plat.y + Math.random() * Math.max(1, plat.h),
      w,
      h,
      vx: (Math.random() * 2 - 1) * (70 + 130 * Math.random()),
      vy: -(80 + 200 * Math.random()),
      life: 0.7 + 0.6 * Math.random(),
      age: 0,
      c: roofColor,
    });
  }
}

function stepBuildingChunks(dt) {
  const G = 1900;
  const DRAG = 0.988;

  for (let i = buildingChunks.length - 1; i >= 0; i--) {
    const c = buildingChunks[i];
    c.age += dt;
    if (c.age >= c.life) {
      buildingChunks.splice(i, 1);
      continue;
    }
    c.vy += G * dt;
    c.vx *= DRAG;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (c.y > world.GROUND_Y + 140) buildingChunks.splice(i, 1);
  }
}

function drawBuildingChunks(ctx) {
  for (const c of buildingChunks) {
    const a = 1 - c.age / c.life;
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.50 * a;
    ctx.fillStyle = c.c;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.restore();
  }
}

// ---------------- per-platform seed ----------------
const platformSeed = new WeakMap();
let platformSeedCounter = 1;

function getPlatformSeed(plat) {
  if (!plat || typeof plat !== "object") return 0;
  let s = platformSeed.get(plat);
  if (s === undefined) {
    s = platformSeedCounter++;
    platformSeed.set(plat, s);
  }
  return s;
}

function pickBuildingColor(seed, COLORS) {
  const a = getColor(COLORS, "buildingA", "rgba(46,48,54,0.95)");
  const b = getColor(COLORS, "buildingB", "rgba(34,36,41,0.95)");
  return hash01(seed) < 0.5 ? a : b;
}

function drawBuildingCracks(ctx, x, y, w, h, seed, crack01, impact01 = 0, impactX, impactY) {
  if (crack01 <= 0.01 || h < 40 || w < 60) return;

  const count = 2 + Math.floor(crack01 * 4);

  ctx.save();
  const boost = 1 + 1.25 * impact01;
  const baseAlpha = clamp(crack01 * 0.90 * boost, 0, 1);
  ctx.strokeStyle = "rgba(255,85,110,0.55)";

  for (let i = 0; i < count; i++) {
    const a = hash01(seed * 17.3 + i * 9.7);
    const b = hash01(seed * 29.1 + i * 6.1);
    const x0 = x + w * (0.15 + 0.70 * a);
    const y0 = y + h * (0.05 + 0.25 * b);
    const len = h * (0.35 + 0.45 * hash01(seed * 3.7 + i * 5.9));

    const segs = 5 + Math.floor(crack01 * 4);
    const lw = 0.9 + 1.1 * hash01(seed * 44.7 + i * 7.1);

    // Localize impact intensity near the landing site.
    let local = 1;
    if (Number.isFinite(impactX) && Number.isFinite(impactY)) {
      const dx = x0 - impactX;
      const dy = y0 - impactY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.max(28, Math.min(110, Math.max(w, h) * 0.34));
      const t = clamp(1 - dist / radius, 0, 1);
      local = 1 + 1.15 * t;
    }

    ctx.globalAlpha = clamp(baseAlpha * local, 0, 1);
    ctx.lineWidth = lw * (0.9 + 0.25 * local);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let s = 1; s <= segs; s++) {
      const tt = s / segs;
      const jx = (hash01(seed * 77.7 + i * 13.3 + s * 5.1) - 0.5) * (6 + 10 * crack01);
      const jy = (hash01(seed * 21.9 + i * 19.7 + s * 3.7) - 0.5) * (2 + 6 * crack01);
      ctx.lineTo(x0 + jx, y0 + len * tt + jy);
    }
    ctx.stroke();

  }

  ctx.restore();
}

function drawRoof(ctx, plat, seed, animTime, COLORS, crack01, hasBody, impact01 = 0, impactX, impactY) {
  const x = plat.x;
  const y = plat.y;
  const w = plat.w;
  const h = plat.h;

  // roof shadow
  ctx.fillStyle = getColor(COLORS, "platformShadow", "rgba(0,0,0,0.18)");
  ctx.fillRect(x, y + 6, w, h);

  // roof base
  shadeRect(
    ctx,
    x,
    y,
    w,
    h,
    getColor(COLORS, "roofTop", "rgba(46,48,54,0.95)"),
    getColor(COLORS, "roofSide", "rgba(34,36,41,0.95)")
  );

  // edge highlight
  ctx.fillStyle = getColor(COLORS, "platformEdge", "rgba(242,242,242,0.18)");
  ctx.fillRect(x, y, w, 2);

  // cracks on roof surface
  if (crack01 > 0.01) {
    const pulse = crack01 > 0.70 ? (0.65 + 0.35 * (0.5 + 0.5 * Math.sin(animTime * 16))) : 1;
    const baseCount = 2 + Math.floor(crack01 * 5);
    const count = Math.max(1, Math.floor(baseCount * (hasBody ? 0.6 : 1)));

    ctx.save();
    const boost = 1 + 1.35 * impact01;
    const baseAlpha = clamp(crack01 * 0.92 * boost, 0, 1) * pulse;
    ctx.strokeStyle = getColor(COLORS, "crackHi", "rgba(255,85,110,0.55)");

    for (let i = 0; i < count; i++) {
      const a = hash01(seed * 21.3 + i * 11.7);
      const b = hash01(seed * 41.9 + i * 19.1);

      const x0 = x + w * (0.10 + 0.80 * a);
      const y0 = y + 1 + (h - 2) * (0.12 + 0.76 * b);
      const len = Math.max(h * (0.9 + 1.1 * hash01(seed * 9.9 + i * 3.1)), w * 0.16);
      const tilt = (hash01(seed * 61.1 + i * 4.3) - 0.5) * (0.25 + 0.25 * crack01);

      const segs = 4 + Math.floor(crack01 * 4);
      const lw = 0.9 + 0.9 * hash01(seed * 55.1 + i * 7.9);

      // Localize impact intensity near the landing site on the roof.
      let local = 1;
      if (Number.isFinite(impactX) && Number.isFinite(impactY)) {
        const dx = x0 - impactX;
        const dy = y0 - impactY;
        const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = Math.max(22, Math.min(90, Math.max(w, h) * 0.30));
      const t = clamp(1 - dist / radius, 0, 1);
      local = 1 + 1.25 * t;
      }

      ctx.globalAlpha = clamp(baseAlpha * local, 0, 1);
      ctx.lineWidth = lw * (0.9 + 0.3 * local);
      ctx.beginPath();
      ctx.moveTo(x0, y0);

      for (let s = 1; s <= segs; s++) {
        const tt = s / segs;
        const jx = (hash01(seed * 77.7 + i * 13.3 + s * 5.1) - 0.5) * (5 + 8 * crack01);
        const jy = (hash01(seed * 15.7 + i * 8.3 + s * 4.9) - 0.5) * (4 + 10 * crack01);
        const dx = (hash01(seed * 31.3 + i * 6.7) - 0.5) * (6 + 12 * crack01);
        const slant = tilt * (tt - 0.5) * w;
        ctx.lineTo(x0 + slant + dx + jx, y0 + len * tt + jy);
      }
      ctx.stroke();

      // Occasional short branch for a more natural fracture.
      if (crack01 > 0.3 && hash01(seed * 81.7 + i * 12.9) > 0.55) {
        const mid = 0.35 + 0.35 * hash01(seed * 27.1 + i * 2.9);
        const bx = x0 + tilt * (mid - 0.5) * w;
        const by = y0 + len * mid;
        const dir = (hash01(seed * 19.9 + i * 9.1) - 0.5) * (18 + 22 * crack01);
        ctx.lineWidth = lw * 0.7;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + dir, by + (8 + 12 * crack01));
        ctx.stroke();
      }
    }

    // danger band when near collapse
    if (crack01 > 0.70) {
      ctx.globalAlpha = 0.35 * pulse;
      ctx.fillStyle = "rgba(255,85,110,0.55)";
      ctx.fillRect(x, y, w, 2);
    }

    ctx.restore();
  }
}

// ---------------- debris helpers ----------------
function spawnBuildingDebrisBurst(plat, COLORS) {
  const seed = getPlatformSeed(plat);
  const x0 = plat.x;
  const y0 = plat.y + plat.h;
  const w0 = plat.w;

  const cA = getColor(COLORS, "buildingA", "rgba(46,48,54,0.95)");
  const cB = getColor(COLORS, "buildingB", "rgba(34,36,41,0.95)");

  const n = 26;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / (n + 1);
    const px = x0 + w0 * u + (Math.random() * 10 - 5);
    const py = y0 + Math.random() * 24;

    const a = Math.PI * (0.15 + 0.70 * Math.random());
    const sp = 220 + 360 * Math.random();
    const dir = Math.random() < 0.5 ? -1 : 1;

    debris.push({
      x: px,
      y: py,
      vx: Math.cos(a) * sp * dir,
      vy: -Math.sin(a) * sp,
      life: 0.7 + Math.random() * 0.4,
      age: 0,
      s: 2 + Math.random() * 3,
      c: hash01(seed * 19.7 + i * 7.1) < 0.5 ? cA : cB,
    });
  }
}

function stepDebris(dt) {
  const G = 1700;
  const DRAG = 0.985;

  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.age += dt;
    if (d.age >= d.life) {
      debris.splice(i, 1);
      continue;
    }
    d.vy += G * dt;
    d.vx *= DRAG;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.y > world.GROUND_Y + 120) debris.splice(i, 1);
  }
}

function drawDebris(ctx) {
  for (const d of debris) {
    const a = 1 - d.age / d.life;
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.32 * a;
    ctx.fillStyle = d.c;
    ctx.fillRect(d.x, d.y, d.s, d.s);
    ctx.restore();
  }
}

// ---------------- rubble helpers ----------------
function spawnRubbleBurst(state, COLORS) {
  const p = state.player;
  if (!p) return;

  const gp = p.groundPlat;
  const baseX = p.x + p.w * 0.5;
  const baseY = gp ? gp.y : (p.y + p.h);

  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.15 + 0.70 * Math.random());
    const sp = 160 + 260 * Math.random();
    const dir = Math.random() < 0.5 ? -1 : 1;

    rubble.push({
      x: baseX + (Math.random() * 10 - 5),
      y: baseY + 1,
      vx: Math.cos(a) * sp * dir,
      vy: -Math.sin(a) * sp,
      life: 0.55 + Math.random() * 0.25,
      age: 0,
      s: 2 + Math.random() * 2,
      c: getColor(COLORS, "roofDetail", "rgba(242,242,242,0.12)"),
    });
  }
}

function spawnJumpRubbleBurst(state, COLORS) {
  const p = state.player;
  if (!p) return;

  const gp = p.groundPlat;
  const baseX = p.x + p.w * 0.5;
  const baseY = gp ? gp.y : (p.y + p.h);

  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.2 + 0.6 * Math.random());
    const sp = 110 + 180 * Math.random();
    const dir = Math.random() < 0.5 ? -1 : 1;

    rubble.push({
      x: baseX + (Math.random() * 10 - 5),
      y: baseY + 1,
      vx: Math.cos(a) * sp * dir,
      vy: -Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.25,
      age: 0,
      s: 2 + Math.random() * 1.5,
      c: getColor(COLORS, "roofDetail", "rgba(242,242,242,0.12)"),
    });
  }
}

function stepRubble(dt) {
  const G = 1400;
  for (let i = rubble.length - 1; i >= 0; i--) {
    const r = rubble[i];
    r.age += dt;
    if (r.age >= r.life) {
      rubble.splice(i, 1);
      continue;
    }
    r.vy += G * dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    if (r.y > world.GROUND_Y + 80) rubble.splice(i, 1);
  }
}

function drawRubble(ctx) {
  for (const r of rubble) {
    const a = 1 - r.age / r.life;
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.32 * a;
    ctx.fillStyle = r.c;
    ctx.fillRect(r.x, r.y, r.s, r.s);
    ctx.restore();
  }
}

// ---------------- transition detectors ----------------
const platformWasCollapsing = new WeakMap();
const platformWasBreaking = new WeakMap();

function didJustStartCollapsing(plat) {
  const prev = platformWasCollapsing.get(plat) === true;
  const now = plat && plat.collapsing === true;
  platformWasCollapsing.set(plat, now);
  return !prev && now;
}

function didJustStartBreaking(plat) {
  const prev = platformWasBreaking.get(plat) === true;
  const now = !!(plat && (plat.breaking === true || (plat.break01 ?? 0) > 0));
  platformWasBreaking.set(plat, now);
  return !prev && now;
}

// ---------------- main draw ----------------
export function drawBuildingsAndRoofs(ctx, state, W, animTime, COLORS, onCollapseStart, dt = 1 / 60) {
  ctx.save();
  // Defensive: if another render pass forgot to restore its transform,
  // buildings can appear skewed/offset. Capture the intended base transform
  // (set by the main renderer) and re-apply it before drawing each platform.
  const baseTx = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;

  // The main renderer sets up the scale/translate to internal resolution.
  // Resetting it makes buildings render at the wrong size/position.

  if (!Array.isArray(state.platforms)) {
    ctx.restore();
    return;
  }

  // Avoid inheriting odd compositing/filters from other passes, but only for THIS module.
  // Do not force globalAlpha to 1 (caller may be intentionally fading the world).
  const prevComp = ctx.globalCompositeOperation;
  const prevFilter = ctx.filter;
  const prevShadowBlur = ctx.shadowBlur;
  const prevShadowColor = ctx.shadowColor;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const heavyNow = Number.isFinite(state.heavyLandT) ? state.heavyLandT : 0;
  const impact01 = clamp(heavyNow / 0.30, 0, 1);
  const player = state.player;
  if (heavyNow > 0 && prevHeavyLandT <= 0) {
    spawnRubbleBurst(state, COLORS);
  }
  prevHeavyLandT = heavyNow;

  const roofJumpNow = Number.isFinite(state.roofJumpT) ? state.roofJumpT : 0;
  if (roofJumpNow > 0 && prevRoofJumpT <= 0) {
    spawnJumpRubbleBurst(state, COLORS);
  }
  prevRoofJumpT = roofJumpNow;

  stepRubble(dt);
  stepDebris(dt);
  stepBuildingChunks(dt);

  for (const plat of state.platforms) {
    if (baseTx && typeof ctx.setTransform === "function") ctx.setTransform(baseTx);
    if (!plat) continue;
    if (plat.x + plat.w < -120 || plat.x > W + 120) continue;

    const seed = getPlatformSeed(plat);
    const impactHere = impact01 > 0 && player && player.groundPlat === plat;
    const impactX = impactHere ? (player.x + player.w * 0.5) : undefined;
    const impactY = impactHere ? (plat.y + plat.h * 0.5) : undefined;

    if (didJustStartCollapsing(plat)) {
      spawnBuildingChunks(plat, COLORS);
      if (typeof onCollapseStart === "function") onCollapseStart(plat);
    }

    if (didJustStartBreaking(plat)) {
      spawnBuildingDebrisBurst(plat, COLORS);
    }

    if (plat.collapsing) {
      continue;
    }

    const bodyX = plat.x;
    const bodyY = plat.y + plat.h;
    const bodyW = plat.w;
    const bodyH = clamp(world.GROUND_Y - bodyY, 0, world.GROUND_Y);

    if (bodyW <= 0 || bodyH <= 0) {
      // Still draw the roof so the platform surface remains visible.
      const crackBase = clamp(plat.crack01 ?? 0, 0, 1);
      const breakBoost = clamp((plat.break01 ?? 0) * 0.55, 0, 0.55);
      const crack01 = clamp(crackBase + breakBoost, 0, 1);
      drawRoof(ctx, plat, seed, animTime, COLORS, crack01, false, impact01, impactX, impactY);
      continue;
    }

    // Combined crack amount for whole-building visuals
    const crackBase = clamp(plat.crack01 ?? 0, 0, 1);
    const breakBoost = clamp((plat.break01 ?? 0) * 0.55, 0, 0.55);
    const crack01 = clamp(crackBase + breakBoost, 0, 1);

    // building shadow + facade
    ctx.fillStyle = getColor(COLORS, "platformShadow", "rgba(0,0,0,0.18)");
    ctx.fillRect(bodyX + 4, bodyY + 6, bodyW, bodyH);

    ctx.fillStyle = pickBuildingColor(seed, COLORS);
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

    drawBrutalistFacade(ctx, bodyX, bodyY, bodyW, bodyH, seed, COLORS, crack01, animTime);

    // whole-building cracks (not just roof)
    drawBuildingCracks(ctx, bodyX, bodyY, bodyW, bodyH, seed, crack01, impact01, impactX, impactY);

    // roof/platform surface (with cracks)
    drawRoof(ctx, plat, seed, animTime, COLORS, crack01, true, impact01, impactX, impactY);
  }

  drawRubble(ctx);
  drawDebris(ctx);
  drawBuildingChunks(ctx);

  // baseline
  ctx.fillStyle = getColor(COLORS, "baseline", "rgba(242,242,242,0.06)");
  ctx.fillRect(0, Math.floor(world.GROUND_Y + world.PLATFORM_H) + 0.5, W, 1);

  ctx.globalCompositeOperation = prevComp;
  ctx.filter = prevFilter;
  ctx.shadowBlur = prevShadowBlur;
  ctx.shadowColor = prevShadowColor;

  ctx.restore();
}
