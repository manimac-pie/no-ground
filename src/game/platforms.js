// src/game/platforms.js

import {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  GROUND_Y,
  PLATFORM_H,
  SAFE_CLEARANCE,
  PLATFORM_MIN_W,
  PLATFORM_MAX_W,
  GAP_MIN,
  GAP_MAX_EASY,
  GAP_MAX_HARD,
  HEIGHT_LEVELS,
  MAX_PLATFORM_STEP,
  ROOF_COLLAPSE_TIME_EASY,
  ROOF_COLLAPSE_TIME_HARD,
  ROOF_FALL_GRAVITY,
} from "./constants.js";
import { clamp, randRange, pick } from "./utils.js";

function easeInOut01(t) {
  // smoothstep
  return t * t * (3 - 2 * t);
}

export function rightmostPlatformX(state) {
  let best = -Infinity;
  for (const p of state.platforms) best = Math.max(best, p.x + p.w);
  return best;
}

export function difficulty01(state) {
  return clamp(state.distance / 10000, 0, 1);
}

export function spawnNextPlatform(state) {
  const d = difficulty01(state);
  const lastRight = rightmostPlatformX(state);

  const gapMax = GAP_MAX_EASY + (GAP_MAX_HARD - GAP_MAX_EASY) * d;
  const gap = randRange(GAP_MIN, gapMax);

  const wMin = PLATFORM_MIN_W + 10 * d;
  const wMax = PLATFORM_MAX_W + 20 * d;
  const w = randRange(wMin, wMax);

  const baseY = GROUND_Y - SAFE_CLEARANCE;

  const levels = d < 0.35 ? [0, 30] : HEIGHT_LEVELS;
  const level = d < 0.15 ? 0 : pick(levels);

  let y = baseY - level;

  const prev = state.platforms.length ? state.platforms[state.platforms.length - 1] : null;
  if (prev) {
    const step = MAX_PLATFORM_STEP + d * 50;
    const prevY = Number.isFinite(prev.baseY) ? prev.baseY : prev.y;
    y = clamp(y, prevY - step, prevY + step);
  }

  y = clamp(y, 180, GROUND_Y - 40);

  // Dynamic rooftops: some platforms slowly rise or crumble (sink) after spawning.
  // Keep subtle and fair; clamp so they never approach the lethal ground too closely.
  const motionChance = 0.10 + 0.18 * d; // ramps with difficulty
  const hasMotion = Math.random() < motionChance;
  const motionKind = hasMotion ? (Math.random() < 0.5 ? "rise" : "crumble") : "none";

  // Amplitude in px (rise = negative direction, crumble = positive direction)
  const amp = hasMotion ? (14 + 30 * (0.35 + 0.65 * d) * Math.random()) : 0;
  const motionTargetY = motionKind === "rise" ? -amp : (motionKind === "crumble" ? amp : 0);

  // How quickly it reaches the target
  const motionRate = hasMotion ? (0.55 + 0.85 * Math.random()) : 0;

  state.platforms.push({
    x: lastRight + gap,
    y,
    w,
    h: PLATFORM_H,

    // Motion state
    baseY: y,
    motion: motionKind, // "rise" | "crumble" | "none"
    motionT: hasMotion ? 0 : 1,
    motionRate,
    motionTargetY,

    // Collapse state
    heavyBumped: false,
    stress: 0,
    crack01: 0,
    collapsing: false,
    vy: 0,
  });
}

export function resetPlatforms(state, maybeSpawnGateAhead) {
  state.platforms.length = 0;

  const startY = GROUND_Y - SAFE_CLEARANCE;

  state.platforms.push({
    x: 0,
    y: startY,
    w: INTERNAL_WIDTH * 0.65,
    h: PLATFORM_H,

    // Motion (none for start)
    baseY: startY,
    motion: "none",
    motionT: 1,
    motionRate: 0,
    motionTargetY: 0,

    // Collapse state
    heavyBumped: false,
    stress: 0,
    crack01: 0,
    collapsing: false,
    vy: 0,
  });

  while (rightmostPlatformX(state) < INTERNAL_WIDTH + 600) {
    spawnNextPlatform(state);
  }

  if (typeof maybeSpawnGateAhead === "function") {
    // Cap attempts so a low random chance can't lock the main thread.
    for (let i = 0; i < 20 && state.gates.length < 3; i++) {
      maybeSpawnGateAhead(state);
      if (rightmostPlatformX(state) < INTERNAL_WIDTH + 620) break;
    }
  }
}

export function scrollWorld(state, dt, maybeSpawnGateAhead) {
  const dx = state.speed * dt;
  for (const p of state.platforms) p.x -= dx;
  for (const g of state.gates) g.x -= dx;

  while (state.platforms.length > 0) {
    const first = state.platforms[0];
    if (first.x + first.w < -200) state.platforms.shift();
    else break;
  }

  while (rightmostPlatformX(state) < INTERNAL_WIDTH + 600) {
    spawnNextPlatform(state);
    if (typeof maybeSpawnGateAhead === "function") {
      maybeSpawnGateAhead(state);
    }
  }

  while (state.gates.length > 0) {
    const firstG = state.gates[0];
    if (firstG.x + firstG.w < -220) state.gates.shift();
    else break;
  }
}

export function updatePlatforms(state, dt) {
  const p = state.player;
  const d = difficulty01(state);

  const collapseTime =
    ROOF_COLLAPSE_TIME_EASY + (ROOF_COLLAPSE_TIME_HARD - ROOF_COLLAPSE_TIME_EASY) * d;

  // Dive -> faster collapse tuning
  // - Holding S while on a roof accelerates stress gain.
  // - A heavy dive landing applies a one-time stress bump (not an instant break).
  const DIVE_STRESS_MULT = 2.25; // extra stress rate while S is held on a roof
  const HEAVY_BUMP_FRAC_EASY = 0.22; // fraction of collapseTime added on heavy landing (easy)
  const HEAVY_BUMP_FRAC_HARD = 0.34; // fraction of collapseTime added on heavy landing (hard)

  for (const plat of state.platforms) {
    if (plat.collapsing) {
      plat.vy += ROOF_FALL_GRAVITY * dt;
      plat.y += plat.vy * dt;
      continue;
    }

    // Apply gentle rise/crumble motion (non-collapsing only).
    if (plat.motion && plat.motion !== "none" && plat.motionT < 1) {
      plat.motionT = clamp(plat.motionT + plat.motionRate * dt, 0, 1);
      const e = easeInOut01(plat.motionT);
      let newY = plat.baseY + plat.motionTargetY * e;

      // Fairness clamps: never too close to lethal ground and never too high.
      newY = clamp(newY, 160, GROUND_Y - 40);

      // If we hit the clamp, finish motion to avoid jitter.
      if (newY === 160 || newY === GROUND_Y - 40) {
        plat.motionT = 1;
      }

      plat.y = newY;

      // If the player is standing on this platform, keep them glued to the top.
      if (state.running && p.onGround && p.groundPlat === plat) {
        p.y = plat.y - p.h;
        p.vy = 0;
      }
    }

    // Stress only the roof you're currently standing on.
    if (state.running && p.onGround && p.groundPlat === plat) {
      // Base stress rate
      let add = dt;

      // Dive mode (one-press latch) accelerates cracking.
      // This makes dive landings "burn" roofs faster without instantly breaking them.
      if (p.diving === true) {
        add += dt * DIVE_STRESS_MULT;
      }

      plat.stress += add;

      // One-time heavy landing bump (set by game logic via state.heavyLandT)
      // Apply only once per platform so you can't farm bumps by lingering.
      if ((state.heavyLandT || 0) > 0 && !plat.heavyBumped) {
        const bumpFrac = HEAVY_BUMP_FRAC_EASY + (HEAVY_BUMP_FRAC_HARD - HEAVY_BUMP_FRAC_EASY) * d;
        plat.stress += collapseTime * bumpFrac;
        plat.heavyBumped = true;
      }
    }

    plat.crack01 = clamp(plat.stress / collapseTime, 0, 1);

    if (plat.stress >= collapseTime) {
      plat.collapsing = true;
      plat.vy = 0;
      plat.crack01 = 1;

      plat.heavyBumped = false;

      // Freeze motion so it doesn't fight the fall.
      plat.motion = "none";
      plat.motionT = 1;
      plat.baseY = plat.y;
      plat.motionTargetY = 0;
      plat.motionRate = 0;

      if (p.groundPlat === plat) {
        p.onGround = false;
        p.groundPlat = null;
        p.coyote = Math.max(p.coyote, 0.06);
      }
    }
  }

  for (let i = state.platforms.length - 1; i >= 0; i--) {
    const plat = state.platforms[i];
    if (plat.collapsing && plat.y > INTERNAL_HEIGHT + 500) {
      state.platforms.splice(i, 1);
    }
  }
}