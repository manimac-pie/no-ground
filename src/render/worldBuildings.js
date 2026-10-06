// src/render/worldBuildings.js

import { world } from "../game.js";
import { drawFractures } from "./worldCracks.js";
import { beginFacadeFrame, drawCrown, drawFacade, facadeRoofColors } from "./worldFacades.js";
import {
  beginBillboardFrame,
  drawBillboard,
  drawBillboardShatters,
  spawnBillboardShatter,
} from "./worldBillboards.js";

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




// ---------------- particle pools ----------------
// Particles are reused instead of allocated per burst. Live particles sit at
// the front of `items`; a dead one is swapped with the last live one, so
// nothing is spliced mid-array and breaks don't create garbage.
function createParticlePool() {
  return { items: [], count: 0 };
}

function allocParticle(pool) {
  if (pool.count === pool.items.length) {
    pool.items.push({ x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, w: 0, h: 0, c: "" });
  }
  return pool.items[pool.count++];
}

function freeParticle(pool, i) {
  const last = --pool.count;
  if (i !== last) {
    const dead = pool.items[i];
    pool.items[i] = pool.items[last];
    pool.items[last] = dead;
  }
}

// Iterates backwards, so the particle swapped into slot i has already been stepped.
function stepParticles(pool, dt, gravity, drag, maxY) {
  for (let i = pool.count - 1; i >= 0; i--) {
    const d = pool.items[i];
    d.age += dt;
    if (d.age >= d.life) {
      freeParticle(pool, i);
      continue;
    }
    d.vy += gravity * dt;
    d.vx *= drag;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.y > maxY) freeParticle(pool, i);
  }
}

function drawParticles(ctx, pool, alphaBase, alphaFade) {
  if (pool.count === 0) return;
  ctx.save();
  for (let i = 0; i < pool.count; i++) {
    const d = pool.items[i];
    ctx.globalAlpha = alphaBase + alphaFade * (1 - d.age / d.life);
    ctx.fillStyle = d.c;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
  ctx.restore();
}

// ---------------- rubble (roof impacts) ----------------
const rubble = createParticlePool();
let prevHeavyLandT = 0;
let prevRoofJumpT = 0;

// ---------------- debris (whole-building breaks) ----------------
const debris = createParticlePool();

// ---------------- crumble chunks (whole-building break) ----------------
const buildingChunks = createParticlePool();

const GLASS_CHUNK = ["rgb(43,34,52)", "rgb(26,21,34)", "rgba(255,170,210,0.55)"]; // glass body, dark glass, lit pane

function spawnBuildingChunks(plat, COLORS) {
  if (!plat) return;

  const seed = getPlatformSeed(plat);
  const bodyX = plat.x;
  const bodyY = plat.y + plat.h;
  const bodyW = plat.w;
  const bodyH = clamp(world.GROUND_Y - bodyY, 0, world.GROUND_Y);

  // Only breakable (magenta glass) buildings collapse: dark glass, now and then a lit pane.
  const baseColor = GLASS_CHUNK[0];
  const altColor = GLASS_CHUNK[1];

  const sizeBase = clamp(Math.sqrt(Math.max(1, bodyW * Math.max(1, bodyH)) / 38), 10, 20);
  const step = sizeBase * 0.9;
  let count = 0;
  const maxCount = 70;

  for (let y = bodyY; y < bodyY + bodyH && count < maxCount; y += step) {
    for (let x = bodyX; x < bodyX + bodyW && count < maxCount; x += step) {
      const cell = count + Math.floor((x - bodyX) / step) + Math.floor((y - bodyY) / step) * 7;
      const keep = hash01(seed * 19.7 + cell * 2.3);
      if (keep < 0.28) continue;
      const w = sizeBase * (0.75 + 0.4 * hash01(seed * 5.1 + cell * 3.7));
      const h = sizeBase * (0.75 + 0.4 * hash01(seed * 7.9 + cell * 4.1));
      const cx = x + (hash01(seed * 11.7 + cell * 5.9) * step * 0.45);
      const cy = y + (hash01(seed * 13.3 + cell * 6.7) * step * 0.45);
      const d = allocParticle(buildingChunks);
      d.x = cx;
      d.y = cy;
      d.w = w;
      d.h = h;
      d.vx = (hash01(seed * 23.1 + cell * 7.1) * 2 - 1) * (60 + 140 * hash01(seed * 29.7 + cell * 2.1));
      d.vy = -(60 + 220 * hash01(seed * 31.9 + cell * 3.3));
      d.life = 0.9 + 0.7 * hash01(seed * 37.7 + cell * 4.7);
      d.age = 0;
      const pick = hash01(seed * 9.7 + count * 1.7);
      d.c = pick < 0.12 ? GLASS_CHUNK[2] : pick < 0.56 ? baseColor : altColor;
      count++;
    }
  }

  // Sprinkle a few roof chunks so the top breaks too.
  const roofColor = facadeRoofColors(COLORS, false).roofTop;
  const roofCount = Math.min(14, Math.floor(6 + bodyW / 40));
  for (let i = 0; i < roofCount; i++) {
    const w = 6 + 10 * hash01(seed * 41.3 + i * 3.9);
    const h = 3 + 4 * hash01(seed * 43.7 + i * 5.1);
    const d = allocParticle(buildingChunks);
    d.x = bodyX + hash01(seed * 47.9 + i * 2.7) * bodyW;
    d.y = plat.y + hash01(seed * 53.1 + i * 3.1) * Math.max(1, plat.h);
    d.w = w;
    d.h = h;
    d.vx = (hash01(seed * 59.9 + i * 4.3) * 2 - 1) * (70 + 130 * hash01(seed * 61.7 + i * 2.9));
    d.vy = -(80 + 200 * hash01(seed * 67.3 + i * 3.7));
    d.life = 0.7 + 0.6 * hash01(seed * 71.9 + i * 5.3);
    d.age = 0;
    d.c = roofColor;
  }
}

function stepBuildingChunks(dt) {
  stepParticles(buildingChunks, dt, 1900, 0.988, world.GROUND_Y + 140);
}

function drawBuildingChunks(ctx) {
  drawParticles(ctx, buildingChunks, 0.18, 0.50);
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



// Roof slab. Its cracks are drawn with the building's (drawFractures).
function drawRoof(ctx, plat, COLORS) {
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
}

// ---------------- debris helpers ----------------
function spawnBuildingDebrisBurst(plat, COLORS) {
  const seed = getPlatformSeed(plat);
  const x0 = plat.x;
  const y0 = plat.y + plat.h;
  const w0 = plat.w;

  const cA = GLASS_CHUNK[0];
  const cB = GLASS_CHUNK[1];

  const n = 26;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / (n + 1);
    const px = x0 + w0 * u + (Math.random() * 10 - 5);
    const py = y0 + Math.random() * 24;

    const a = Math.PI * (0.15 + 0.70 * Math.random());
    const sp = 220 + 360 * Math.random();
    const dir = Math.random() < 0.5 ? -1 : 1;

    const d = allocParticle(debris);
    d.x = px;
    d.y = py;
    d.vx = Math.cos(a) * sp * dir;
    d.vy = -Math.sin(a) * sp;
    d.life = 0.7 + Math.random() * 0.4;
    d.age = 0;
    d.w = d.h = 2 + Math.random() * 3;
    d.c = hash01(seed * 19.7 + i * 7.1) < 0.5 ? cA : cB;
  }
}


function stepDebris(dt) {
  stepParticles(debris, dt, 1700, 0.985, world.GROUND_Y + 120);
}


function drawDebris(ctx) {
  drawParticles(ctx, debris, 0.18, 0.32);
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

    const d = allocParticle(rubble);
    d.x = baseX + (Math.random() * 10 - 5);
    d.y = baseY + 1;
    d.vx = Math.cos(a) * sp * dir;
    d.vy = -Math.sin(a) * sp;
    d.life = 0.55 + Math.random() * 0.25;
    d.age = 0;
    d.w = d.h = 2 + Math.random() * 2;
    d.c = getColor(COLORS, "roofDetail", "rgba(242,242,242,0.12)");
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

    const d = allocParticle(rubble);
    d.x = baseX + (Math.random() * 10 - 5);
    d.y = baseY + 1;
    d.vx = Math.cos(a) * sp * dir;
    d.vy = -Math.sin(a) * sp;
    d.life = 0.35 + Math.random() * 0.25;
    d.age = 0;
    d.w = d.h = 2 + Math.random() * 1.5;
    d.c = getColor(COLORS, "roofDetail", "rgba(242,242,242,0.12)");
  }
}

function stepRubble(dt) {
  // Rubble has no air drag.
  stepParticles(rubble, dt, 1400, 1, world.GROUND_Y + 80);
}

function drawRubble(ctx) {
  drawParticles(ctx, rubble, 0.18, 0.32);
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
  beginBillboardFrame(ctx);
  beginFacadeFrame(ctx);
  const warningColor = getColor(COLORS, "warning", "rgba(255,180,70,0.65)");
  const billboardFrame = getColor(COLORS, "billboardFrame", "rgba(10,12,16,0.85)");

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
    // A heavy (dive) landing makes this roof's cracks flare for a moment.
    const flash = impact01 > 0 && player && player.groundPlat === plat ? impact01 : 0;

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

    if (plat.billboard && plat.billboard.breaking && !plat.billboard.breakSpawned) {
      spawnBillboardShatter(state, plat, plat.billboard, seed, warningColor);
      plat.billboard.breakSpawned = true;
    }

    const bodyX = plat.x;
    const bodyY = plat.y + plat.h;
    const bodyW = plat.w;
    const bodyH = clamp(world.GROUND_Y - bodyY, 0, world.GROUND_Y);

    // Cracks: stress, plus a boost while the roof is breaking
    const crackBase = clamp(plat.crack01 ?? 0, 0, 1);
    const breakBoost = clamp((plat.break01 ?? 0) * 0.55, 0, 0.55);
    const crack01 = clamp(crackBase + breakBoost, 0, 1);
    const safe = plat.breakable === false || plat.invulnerable === true;

    // Neon Glass building, its roof, then the cracks over both
    drawFacade(ctx, seed, bodyX, bodyY, bodyW, bodyH, safe, animTime, W);
    drawRoof(ctx, plat, facadeRoofColors(COLORS, safe));
    drawCrown(ctx, plat, seed, safe, animTime);
    drawFractures(ctx, plat.x, plat.y, plat.w, bodyH, seed, crack01, animTime, flash);
    drawBillboard(ctx, plat, plat.billboard, seed, animTime, warningColor, billboardFrame);
  }

  drawRubble(ctx);
  drawDebris(ctx);
  drawBillboardShatters(ctx, dt);
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
