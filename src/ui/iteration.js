// src/ui/iteration.js
// The simulation's iteration counter: how many runs Bob has started on this device.
// Kept in localStorage; if storage is unavailable the count just starts from 0 each load.

const ITERATION_KEY = "ng_iteration";

export function loadIteration() {
  try {
    return Math.max(0, parseInt(localStorage.getItem(ITERATION_KEY), 10) || 0);
  } catch {
    return 0;
  }
}

export function saveIteration(n) {
  try {
    localStorage.setItem(ITERATION_KEY, String(n));
  } catch {}
}

// "0042"
export function formatIteration(n) {
  return String(Math.max(0, Math.floor(n || 0))).padStart(4, "0");
}
