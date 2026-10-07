// src/ui/lastRun.js
// The last finished run, for the start screen's log ("iteration 0041 TERMINATED"). Kept in
// localStorage so it survives a reload; without storage the log says there's no previous iteration.

const LAST_RUN_KEY = "ng_last_run";

// { iteration, cause: "ground" | "ad", distance (m), score, best (the best before this run), endedAt (ms) }
let lastRun = null;
try {
  const parsed = JSON.parse(localStorage.getItem(LAST_RUN_KEY));
  if (parsed && Number.isFinite(parsed.score)) lastRun = parsed;
} catch {}

export function getLastRun() {
  return lastRun;
}

export function saveLastRun(run) {
  lastRun = run;
  try {
    localStorage.setItem(LAST_RUN_KEY, JSON.stringify(run));
  } catch {}
}
