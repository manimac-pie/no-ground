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

// ---------------- rubble (roof impacts) ----------------
const rubble = [];
let prevHeavyLandT = 0;

// ---------------- debris (whole-building breaks) ----------------
const debris = [];

function spawnBuildingDebrisBurst(plat, COLORS) {
  if (!plat) return;

  const seed = getPlatformSeed(plat);
  const x0 = plat.x;
  const y0 = plat.y;
  const w0 = plat.w;

  const cA = getColor(COLORS, "buildingA", "rgba(46,48,54,0.95)");
  const cB = getColor(COLORS, "buildingB", "rgba(34,36,41,0.95)");

  const n = 26;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / (n + 1);
    const px = x0 + w0 * u + (Math.random() * 10 - 5);
    const py = y0 + 2 + (Math.random() * 18);

    const a = Math.PI * (0.10 + 0.80 * Math.random());
    const sp = 200 + 320 * Math.random();
    const dir = Math.random() < 0.5 ? -1 : 1;

    debris.push({
      x: px,
      y: py,
      vx: Math.cos(a) * sp * dir,
      vy: -Math.sin(a) * sp,
      life: 0.70 + Math.random() * 0.35,
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

    if (d.y > world.GROUND_Y + 120) {
      debris.splice(i, 1);
    }
  }
}

function drawDebris(ctx) {
  for (const d of debris) {
    const a = 1 - d.age / d.life;
    ctx.save();
    ctx.globalAlpha = 0.14 + 0.26 * a;
    ctx.fillStyle = d.c;
    ctx.fillRect(d.x, d.y, d.s, d.s);
    ctx.restore();
  }
}

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
      c: Math.random() < 0.55
        ? getColor(COLORS, "roofDetail", "rgba(242,242,242,0.12)")
        : "rgba(242,242,242,0.12)",
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
  // break01 > 0 or breaking === true triggers break
  const prev = platformWasBreaking.get(plat) === true;
  const now = !!(plat && (plat.breaking === true || (plat.break01 ?? 0) > 0));
  platformWasBreaking.set(plat, now);
  return !prev && now;
}

function pickBuildingColor(seed, COLORS) {
  const a = getColor(COLORS, "buildingA", "rgba(46,48,54,0.95)");
  const b = getColor(COLORS, "buildingB", "rgba(34,36,41,0.95)");
  return hash01(seed) < 0.5 ? a : b;
}

// ---------------- main draw ----------------
export function drawBuildingsAndRoofs(ctx, state, W, animTime, COLORS, onCollapseStart, dt = 1 / 60) {
  if (!Array.isArray(state.platforms)) return;

  const heavyNow = Number.isFinite(state.heavyLandT) ? state.heavyLandT : 0;
  if (heavyNow > 0 && prevHeavyLandT <= 0) {
    spawnRubbleBurst(state, COLORS);
  }
  prevHeavyLandT = heavyNow;

  stepRubble(dt);
  stepDebris(dt);

  for (const plat of state.platforms) {
    if (!plat) continue;
    if (plat.x + plat.w < -120 || plat.x > W + 120) continue;

    const seed = getPlatformSeed(plat);

    if (didJustStartCollapsing(plat) && typeof onCollapseStart === "function") {
      onCollapseStart(plat);
    }

    if (didJustStartBreaking(plat)) {
      spawnBuildingDebrisBurst(plat, COLORS);
    }

    const bodyX = plat.x;
    const bodyY = plat.y + plat.h;
    const bodyW = plat.w;
    const bodyH = Math.max(0, world.GROUND_Y - bodyY);

    const break01 = clamp(plat.break01 ?? 0, 0, 1);

    // shadow
    ctx.fillStyle = getColor(COLORS, "platformShadow", "rgba(0,0,0,0.18)");
    ctx.fillRect(bodyX + 4, bodyY + 6, bodyW, bodyH);

    // facade (always draw, even if breaking)
    ctx.save();
    ctx.globalAlpha *= clamp(1 - break01 * 0.7, 0.2, 1);
    ctx.fillStyle = pickBuildingColor(seed, COLORS);
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.restore();
  }

  drawRubble(ctx);
  drawDebris(ctx);

  ctx.fillStyle = getColor(COLORS, "baseline", "rgba(242,242,242,0.06)");
  ctx.fillRect(0, world.GROUND_Y + world.PLATFORM_H, W, 1);
}