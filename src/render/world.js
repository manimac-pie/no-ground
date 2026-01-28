// src/render/world.js
import { world } from "../game.js";

/*
  World rendering: background + parallax + lethal ground + buildings/roofs + air gates + vignette.

  Usage (Option B split):
    import {
      drawBackground,
      drawParallax,
      drawLethalGround,
      drawBuildingsAndRoofs,
      drawGates,
      drawVignette,
    } from "./render/world.js";

  Notes:
  - COLORS is passed in so this module stays decoupled from your palette location.
  - animTime should be the time that freezes when game ends (so ground/fx stop moving).
  - drawBuildingsAndRoofs() accepts an optional onCollapseStart(plat) callback so render.js
    can trigger shake/dust when a roof starts collapsing.
*/

// ---------------- utils (local) ----------------
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

// ---------------- background ----------------
export function drawBackground(ctx, W, H, COLORS) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, world.GROUND_Y - 120, W, 120);
}

export function drawParallax(ctx, W, H, distance) {
  const horizon = world.GROUND_Y - 24;

  const off1 = -((distance * 0.10) % (W + 320));
  ctx.fillStyle = "rgba(242,242,242,0.028)";
  for (let x = off1; x < W + 320; x += 320) {
    ctx.fillRect(x + 40, horizon - 190, 160, 70);
    ctx.fillRect(x + 10, horizon - 140, 220, 60);
  }

  const off2 = -((distance * 0.18) % (W + 260));
  ctx.fillStyle = "rgba(242,242,242,0.040)";
  for (let x = off2; x < W + 260; x += 260) {
    ctx.fillRect(x + 30, horizon - 150, 140, 60);
    ctx.fillRect(x + 0, horizon - 105, 200, 55);
  }

  ctx.fillStyle = "rgba(242,242,242,0.035)";
  for (let i = 0; i < 28; i++) {
    const sx = (i * 97) % W;
    const sy = 24 + ((i * 53) % 110);
    ctx.fillRect(sx, sy, 1, 1);
  }
}

export function drawLethalGround(ctx, W, H, animTime, danger01, COLORS) {
  const y = world.GROUND_Y;

  // Base dark below the ground line
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, y, W, H - y);

  // Glow gradient above the ground line
  const g = ctx.createLinearGradient(0, y - 90, 0, y + 30);
  g.addColorStop(0, "rgba(255,85,110,0)");
  g.addColorStop(0.55, COLORS.groundGlow);
  g.addColorStop(1, "rgba(255,85,110,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 90, W, 120);

  // Bright line
  ctx.fillStyle = "rgba(255,85,110,0.55)";
  ctx.fillRect(0, y, W, 2);

  // Animated hazard stripes (use animTime so it stops on game over)
  const stripeH = 10;
  const speed = 60;
  const off = -((animTime * speed) % 40);

  ctx.save();
  ctx.globalAlpha = 0.22 + 0.28 * danger01;
  ctx.fillStyle = COLORS.groundCore;
  for (let x = off; x < W + 40; x += 40) {
    ctx.fillRect(x, y + 10, 20, stripeH);
    ctx.fillRect(x + 10, y + 26, 20, stripeH);
  }
  ctx.restore();

  // Proximity tint
  if (danger01 > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.35 * danger01;
    ctx.fillStyle = COLORS.dangerTint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

export function drawVignette(ctx, W, H) {
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
}

// ---------------- rubble particles (heavy landings) ----------------
// Small roof chips spawned on heavy dive landings.
const rubble = [];
let prevHeavyLandT = 0;

function spawnRubbleBurst(state, COLORS) {
  const p = state.player;
  if (!p) return;

  // Spawn from the roof line if we have a supporting platform.
  const gp = p.groundPlat;
  const baseX = p.x + p.w * 0.5;
  const baseY = gp ? gp.y : (p.y + p.h);

  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.15 + 0.70 * Math.random()); // mostly sideways/up
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
      // Slight color variation for chips
      c: Math.random() < 0.55 ? COLORS.roofDetail : "rgba(242,242,242,0.12)",
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

    // If it falls below lethal ground, kill it.
    if (r.y > world.GROUND_Y + 80) {
      rubble.splice(i, 1);
    }
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

// ---------------- buildings / roofs ----------------

// stable per-platform seed so windows/details don't flicker
const platformSeed = new WeakMap();
let platformSeedCounter = 1;

function getPlatformSeed(plat) {
  let s = platformSeed.get(plat);
  if (s === undefined) {
    s = platformSeedCounter++;
    platformSeed.set(plat, s);
  }
  return s;
}

// collapse transition tracking for one-shot VFX hooks
const platformWasCollapsing = new WeakMap();
function didJustStartCollapsing(plat) {
  const prev = platformWasCollapsing.get(plat) === true;
  const now = plat && plat.collapsing === true;
  platformWasCollapsing.set(plat, now);
  return !prev && now;
}

function pickBuildingColor(seed, COLORS) {
  return hash01(seed) < 0.5 ? COLORS.buildingA : COLORS.buildingB;
}

function drawRoof(ctx, plat, seed, animTime, COLORS, state) {
  const x = plat.x;
  const y = plat.y;
  const w = plat.w;
  const h = plat.h;

  // shadow
  ctx.fillStyle = COLORS.platformShadow;
  ctx.fillRect(x, y + 6, w, h);

  // roof base
  shadeRect(ctx, x, y, w, h, "rgba(46,48,54,0.95)", COLORS.roofSide);

  // top strip
  ctx.fillStyle = COLORS.roofTop;
  ctx.fillRect(x, y, w, Math.min(3, h));

  // edge highlight
  ctx.fillStyle = COLORS.platformEdge;
  ctx.fillRect(x, y, w, 2);

  // Motion telegraph (for rising/crumbling roofs)
  // plat.motion: "rise" | "crumble" | "none" (set by game/platforms.js)
  const motion = plat.motion || "none";
  const motionT = clamp(plat.motionT ?? 1, 0, 1);
  if (motion !== "none" && motionT < 1) {
    const a = 0.25 + 0.55 * (1 - motionT);

    if (motion === "rise") {
      // cool glow + upward ticks
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(120,205,255,0.30)";
      ctx.fillRect(x, y - 1, w, 3);

      ctx.fillStyle = "rgba(120,205,255,0.18)";
      const tickN = Math.min(10, Math.max(3, Math.floor(w / 70)));
      for (let i = 0; i < tickN; i++) {
        const px = x + (w * (i + 0.5)) / tickN;
        ctx.fillRect(px, y - 7, 2, 6);
      }
      ctx.restore();
    } else if (motion === "crumble") {
      // warm warning band + falling specks
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(255,85,110,0.22)";
      ctx.fillRect(x, y - 1, w, 3);

      ctx.fillStyle = "rgba(242,242,242,0.08)";
      const specks = Math.min(14, Math.max(6, Math.floor(w / 35)));
      for (let i = 0; i < specks; i++) {
        const r = hash01(seed * 91.7 + i * 13.1);
        const px = x + w * r;
        const py = y + 4 + (hash01(seed * 33.3 + i * 7.7) * 10);
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.restore();
    }
  }

  // cracks based on plat.crack01 (+ impact boost on dive landing)
  const heavyT = Number.isFinite(state?.heavyLandT) ? state.heavyLandT : 0;
  const impact01 = clamp(heavyT / 0.22, 0, 1);
  const isImpactPlat = state?.player?.groundPlat === plat && impact01 > 0;
  const crackBoost = isImpactPlat ? (0.35 * impact01) : 0;
  const crack01 = clamp((plat.crack01 ?? 0) + crackBoost, 0, 1);
  if (crack01 > 0.01) {
    const pulseBase = crack01 > 0.70 ? (0.65 + 0.35 * (0.5 + 0.5 * Math.sin(animTime * 16))) : 1;
    const pulse = isImpactPlat ? pulseBase * (1.1 + 0.25 * impact01) : pulseBase;
    const count = 2 + Math.floor(crack01 * 5);

    ctx.save();
    ctx.globalAlpha = clamp(crack01 * 0.9, 0, 0.9) * pulse;
    ctx.strokeStyle = crack01 > 0.75 ? COLORS.crackHi : COLORS.crack;

    for (let i = 0; i < count; i++) {
      const a = hash01(seed * 21.3 + i * 11.7);
      const b = hash01(seed * 41.9 + i * 19.1);

      const x0 = x + w * (0.10 + 0.80 * a);
      const y0 = y + 2 + (h - 4) * (0.25 + 0.50 * b);
      const len = w * (0.18 + 0.45 * hash01(seed * 9.9 + i * 3.1));

      const segs = 4 + Math.floor(crack01 * 4);
      const lw = 0.8 + 0.7 * hash01(seed * 55.1 + i * 7.9);

      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x0, y0);

      for (let s = 1; s <= segs; s++) {
        const tt = s / segs;
        const j = (hash01(seed * 77.7 + i * 13.3 + s * 5.1) - 0.5) * (6 + 10 * crack01);
        ctx.lineTo(x0 + len * tt, y0 + j);
      }
      ctx.stroke();

      // Subtle highlight pass for depth
      ctx.globalAlpha *= 0.45;
      ctx.lineWidth = Math.max(0.6, lw - 0.3);
      ctx.strokeStyle = "rgba(255,255,255,0.20)";
      ctx.translate(0.6, -0.4);
      ctx.stroke();
      ctx.translate(-0.6, 0.4);
      ctx.globalAlpha /= 0.45;
      ctx.strokeStyle = crack01 > 0.75 ? COLORS.crackHi : COLORS.crack;
    }

    if (crack01 > 0.70) {
      ctx.globalAlpha = 0.35 * pulse;
      ctx.fillStyle = "rgba(255,85,110,0.55)";
      ctx.fillRect(x, y, w, 2);
    }

    ctx.restore();
  }

  // parapet posts
  if (w > 120 && hash01(seed * 3.1) > 0.25) {
    const postCount = Math.min(7, Math.max(2, Math.floor(w / 90)));
    ctx.fillStyle = "rgba(242,242,242,0.07)";
    for (let i = 0; i < postCount; i++) {
      const px = x + (w * (i + 1)) / (postCount + 1);
      ctx.fillRect(px, y - 6, 2, 6);
    }
  }

  // rooftop details
  const r = hash01(seed * 8.7);
  if (w > 140 && r > 0.35) {
    ctx.fillStyle = COLORS.roofDetail;

    const vx = x + w * (0.20 + 0.55 * hash01(seed * 1.11));
    const vy = y + 3;
    const vw = Math.min(26, Math.max(14, w * 0.10));
    const vh = Math.max(6, h - 6);
    ctx.fillRect(vx, vy, vw, vh);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(vx, vy, vw, 2);

    if (hash01(seed * 2.77) > 0.70 && w > 200) {
      const sx = x + w * (0.55 + 0.25 * hash01(seed * 6.13));
      const sw = Math.min(40, Math.max(18, w * 0.12));
      ctx.fillStyle = "rgba(120,205,255,0.10)";
      ctx.fillRect(sx, y + 4, sw, Math.max(6, h - 8));
      ctx.fillStyle = "rgba(242,242,242,0.10)";
      ctx.fillRect(sx, y + 4, sw, 1);
    }
  }

  // antenna
  if (hash01(seed * 1.9) > 0.85) {
    ctx.fillStyle = "rgba(242,242,242,0.10)";
    const ax = x + w * (0.25 + 0.5 * hash01(seed * 2.3));
    ctx.fillRect(ax, y - 16, 2, 16);
    ctx.fillRect(ax - 4, y - 16, 10, 2);
  }
}

function drawBuildingCracks(ctx, x, y, w, h, seed, crack01, impact01) {
  if (crack01 <= 0.01 || h < 40 || w < 60) return;

  const count = 1 + Math.floor(crack01 * 3) + (impact01 > 0 ? 1 : 0);
  const pulse = impact01 > 0 ? (1 + 0.3 * impact01) : 1;

  ctx.save();
  ctx.globalAlpha = clamp(crack01 * 0.55, 0, 0.55) * pulse;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";

  for (let i = 0; i < count; i++) {
    const a = hash01(seed * 17.3 + i * 9.7);
    const b = hash01(seed * 29.1 + i * 6.1);
    const x0 = x + w * (0.15 + 0.70 * a);
    const y0 = y + h * (0.15 + 0.10 * b);
    const len = h * (0.35 + 0.35 * hash01(seed * 3.7 + i * 5.9));

    const segs = 5 + Math.floor(crack01 * 4);
    const lw = 0.8 + 0.8 * hash01(seed * 44.7 + i * 7.1);

    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let s = 1; s <= segs; s++) {
      const tt = s / segs;
      const j = (hash01(seed * 77.7 + i * 13.3 + s * 5.1) - 0.5) * (6 + 8 * crack01);
      ctx.lineTo(x0 + j, y0 + len * tt);
    }
    ctx.stroke();

    // Subtle highlight for depth
    ctx.globalAlpha *= 0.45;
    ctx.lineWidth = Math.max(0.6, lw - 0.3);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.translate(0.4, -0.3);
    ctx.stroke();
    ctx.translate(-0.4, 0.3);
    ctx.globalAlpha /= 0.45;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
  }

  ctx.restore();
}

export function drawBuildingsAndRoofs(ctx, state, W, animTime, COLORS, onCollapseStart, dt = 1 / 60) {
  if (!Array.isArray(state.platforms)) return;

  // Spawn rubble when a heavy landing starts (edge-triggered)
  const heavyNow = Number.isFinite(state.heavyLandT) ? state.heavyLandT : 0;
  if (heavyNow > 0 && prevHeavyLandT <= 0) {
    spawnRubbleBurst(state, COLORS);
  }
  prevHeavyLandT = heavyNow;

  // Advance rubble sim here (keeps it self-contained)
  // Advance rubble sim here (keeps it self-contained)
// Use provided dt so rubble stays consistent under variable FPS.
  stepRubble(dt);

  for (const plat of state.platforms) {
    const seed = getPlatformSeed(plat);
    if (plat.x + plat.w < -120 || plat.x > W + 120) continue;

    if (didJustStartCollapsing(plat) && typeof onCollapseStart === "function") {
      onCollapseStart(plat);
    }

    // building body extends down to lethal ground
    const bodyX = plat.x;
    const bodyY = plat.y + plat.h;
    const bodyW = plat.w;
    const bodyH = Math.max(0, world.GROUND_Y - bodyY);

    // shadow
    ctx.fillStyle = COLORS.platformShadow;
    ctx.fillRect(bodyX + 4, bodyY + 6, bodyW, bodyH);

    // body fill
    ctx.fillStyle = pickBuildingColor(seed, COLORS);
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

    // Subtle facade cue while the roof is moving (helps readability)
    const motion = plat.motion || "none";
    const motionT = clamp(plat.motionT ?? 1, 0, 1);
    if (motion !== "none" && motionT < 1 && bodyH > 24) {
      const a = 0.06 + 0.14 * (1 - motionT);
      ctx.save();
      ctx.globalAlpha = a;
      if (motion === "rise") {
        const gg = ctx.createLinearGradient(0, bodyY, 0, bodyY + Math.min(bodyH, 140));
        gg.addColorStop(0, "rgba(120,205,255,0.20)");
        gg.addColorStop(1, "rgba(120,205,255,0)");
        ctx.fillStyle = gg;
        ctx.fillRect(bodyX, bodyY, bodyW, Math.min(bodyH, 140));
      } else {
        const gg = ctx.createLinearGradient(0, bodyY, 0, bodyY + Math.min(bodyH, 140));
        gg.addColorStop(0, "rgba(255,85,110,0.18)");
        gg.addColorStop(1, "rgba(255,85,110,0)");
        ctx.fillStyle = gg;
        ctx.fillRect(bodyX, bodyY, bodyW, Math.min(bodyH, 140));
      }
      ctx.restore();
    }

    // building cracks (react to dive impact)
    {
      const heavyT = Number.isFinite(state?.heavyLandT) ? state.heavyLandT : 0;
      const impact01 = clamp(heavyT / 0.22, 0, 1);
      const isImpactPlat = state?.player?.groundPlat === plat && impact01 > 0;
      const crackBoost = isImpactPlat ? (0.35 * impact01) : 0;
      const crack01 = clamp((plat.crack01 ?? 0) + crackBoost, 0, 1);
      drawBuildingCracks(ctx, bodyX, bodyY, bodyW, bodyH, seed, crack01, impact01);
    }

    // windows (stable + cheap)
    const pad = 10;
    const winW = 10;
    const winH = 14;
    const gapX = 12;
    const gapY = 14;

    const startX = bodyX + pad;
    const endX = bodyX + bodyW - pad;
    const startY = bodyY + pad;
    const endY = bodyY + bodyH - pad;

    if (bodyH > 56 && bodyW > 80) {
      const maxRows = 6;
      const maxCols = 8;

      let row = 0;
      for (let y = startY; y + winH <= endY && row < maxRows; y += winH + gapY) {
        let col = 0;
        for (let x = startX; x + winW <= endX && col < maxCols; x += winW + gapX) {
          const r = hash01(seed * 13.7 + row * 101 + col * 17);
          const on = r > 0.74;
          const dim = plat.collapsing ? 0.55 : 1;
          ctx.fillStyle = on
            ? `rgba(120,205,255,${(0.22 * dim).toFixed(3)})`
            : `rgba(242,242,242,${(0.06 * dim).toFixed(3)})`;
          ctx.fillRect(x, y, winW, winH);
          col++;
        }
        row++;
      }
    }

    // roof (platform surface)
    drawRoof(ctx, plat, seed, animTime, COLORS, state);
  }

  // rubble on top of roofs
  drawRubble(ctx);

  // baseline for readability
  ctx.fillStyle = "rgba(242,242,242,0.06)";
  ctx.fillRect(0, world.GROUND_Y + world.PLATFORM_H, W, 1);
}

// ---------------- air gates ----------------
function gateLabel(kind) {
  switch (kind) {
    case "corkscrew":
      return "A/D";
    default:
      return "SPIN";
  }
}

function gateSubLabel(kind) {
  switch (kind) {
    case "corkscrew":
      return "CORKSCREW";
    default:
      return "SPIN";
  }
}

export function drawGates(ctx, state, W, animTime) {
  // Don't show gates behind the start menu.
  if (!state.running && !state.gameOver) return;
  if (!Array.isArray(state.gates)) return;

  for (const g of state.gates) {
    if (g.x + g.w < -120 || g.x > W + 120) continue;

    const x = g.x;
    const y = g.y;
    const w = g.w;
    const h = g.h;

    const pulse = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(animTime * 6.0));

    let stroke = "rgba(120,205,255,0.65)";
    let fill = "rgba(120,205,255,0.08)";

    if (g.hit) {
      stroke = "rgba(120,205,255,0.95)";
      fill = "rgba(120,205,255,0.18)";
    } else if (g.missed) {
      stroke = "rgba(242,242,242,0.10)";
      fill = "rgba(0,0,0,0.10)";
    }

    ctx.save();
    ctx.globalAlpha *= g.hit ? 1 : (g.missed ? 0.45 : pulse);

    // outer ring
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    roundedRectPath(ctx, x, y, w, h, 14);
    ctx.stroke();

    // inner ring
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(242,242,242,0.16)";
    roundedRectPath(ctx, x + 8, y + 8, w - 16, h - 16, 10);
    ctx.stroke();

    // fill
    ctx.fillStyle = fill;
    roundedRectPath(ctx, x + 2, y + 2, w - 4, h - 4, 14);
    ctx.fill();

    // label (two lines) + subtle backing so it reads clearly
    const label = gateLabel(g.requiredKind);
    const sub = gateSubLabel(g.requiredKind);

    ctx.font = "900 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const tw = ctx.measureText(label).width;

    ctx.font = "700 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const sw = ctx.measureText(sub).width;

    const padX = 10;
    const boxW = Math.max(tw, sw) + padX * 2;
    const boxH = 32;
    const bx = x + w / 2 - boxW / 2;
    const by = y + h / 2 - boxH / 2 + 1;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    roundedRectPath(ctx, bx, by, boxW, boxH, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(242,242,242,0.88)";
    ctx.font = "900 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(label, x + w / 2 - tw / 2, by + 15);

    ctx.fillStyle = "rgba(242,242,242,0.55)";
    ctx.font = "700 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(sub, x + w / 2 - sw / 2, by + 28);

    ctx.restore();
  }
}
