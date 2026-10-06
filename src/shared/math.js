// src/shared/math.js
// Small number helpers shared by game/ and render/. No canvas or DOM here.

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 0..1 ease with zero slope at both ends; t is clamped.
export function smoothstep01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// Fast start, slow finish; t is clamped.
export function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

// Deterministic 0..1 noise from a number. Everything procedural (buildings, windows, cracks, ads)
// is placed from this, so changing `k` changes the whole city. The skyline uses its own k
// (see render/world/backdrop.js), so it doesn't line up with the buildings in front of it.
export function hash01(n, k = 999.123) {
  const x = Math.sin(n * k) * 43758.5453;
  return x - Math.floor(x);
}
