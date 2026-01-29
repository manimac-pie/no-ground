// src/game/utils.js

// Clamp number v into [lo, hi].
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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
