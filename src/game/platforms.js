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
    y = clamp(y, prev.y - step, prev.y + step);
  }

  y = clamp(y, 180, GROUND_Y - 40);

  state.platforms.push({
    x: lastRight + gap,
    y,
    w,
    h: PLATFORM_H,
    stress: 0,
    crack01: 0,
    collapsing: false,
    vy: 0,
  });
}

export function resetPlatforms(state, maybeSpawnGateAhead) {
  state.platforms.length = 0;

  state.platforms.push({
    x: 0,
    y: GROUND_Y - SAFE_CLEARANCE,
    w: INTERNAL_WIDTH * 0.65,
    h: PLATFORM_H,
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

  for (const plat of state.platforms) {
    if (plat.collapsing) {
      plat.vy += ROOF_FALL_GRAVITY * dt;
      plat.y += plat.vy * dt;
      continue;
    }

    if (state.running && p.onGround && p.groundPlat === plat) {
      plat.stress += dt;
    }

    plat.crack01 = clamp(plat.stress / collapseTime, 0, 1);

    if (plat.stress >= collapseTime) {
      plat.collapsing = true;
      plat.vy = 0;
      plat.crack01 = 1;

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
