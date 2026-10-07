// src/ui/bestRun.js
// The best run on this device: its score and how far it got. The end screen's black box marks that
// distance ("your best run 20,400 m"). Kept in localStorage; without storage there's no mark.

const BEST_RUN_KEY = "ng_best_run";

// { score, distance (m) } or null
let bestRun = null;
try {
  const parsed = JSON.parse(localStorage.getItem(BEST_RUN_KEY));
  if (parsed && Number.isFinite(parsed.score) && Number.isFinite(parsed.distance)) bestRun = parsed;
} catch {}

export function getBestRun() {
  return bestRun;
}

// Keep this run if it scored higher than the stored one.
export function saveBestRunIfBetter(score, distance) {
  if (!Number.isFinite(score) || !Number.isFinite(distance)) return;
  if (bestRun && bestRun.score >= score) return;
  bestRun = { score, distance };
  try {
    localStorage.setItem(BEST_RUN_KEY, JSON.stringify(bestRun));
  } catch {}
}
