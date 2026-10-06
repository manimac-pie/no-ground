// src/game/utils.js
// Game-only helpers. Shared number helpers (clamp, easing, hash01) are in src/shared/math.js.

import * as C from "./constants.js";

// A tuning constant by name, or `fallback` if it isn't a finite number.
export function getConst(name, fallback) {
  const v = C[name];
  return Number.isFinite(v) ? v : fallback;
}

// Uniform random in [min, max).
export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// Pick a random element from a non-empty array.
// Returns undefined for empty/invalid arrays.
export function pick(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

// Axis-aligned bounding box overlap test.
export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
