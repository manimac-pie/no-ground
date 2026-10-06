// src/leaderboard/reset.js
// The leaderboard week: it starts every Monday 00:00 UTC, when THIS WEEK starts over.
// This only drives the countdown on the leaderboard panel. The Worker decides what counts as
// "this week" (see docs/WORKER_TODO.md), so keep the two in sync.

export const RESET_WEEKDAY_UTC = 1; // 0 = Sunday, 1 = Monday, ...
export const RESET_HOUR_UTC = 0;

const DAY_MS = 24 * 60 * 60 * 1000;

// Milliseconds until the next reset.
export function msUntilWeeklyReset(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC));
  const daysAhead = (RESET_WEEKDAY_UTC - now.getUTCDay() + 7) % 7;
  next.setTime(next.getTime() + daysAhead * DAY_MS);
  if (next.getTime() <= nowMs) next.setTime(next.getTime() + 7 * DAY_MS);
  return next.getTime() - nowMs;
}

const pad2 = (n) => String(n).padStart(2, "0");

// Time left until the reset: "2D 14H", "14H 05M", or "05M 33S" in the last hour.
export function weeklyResetIn(nowMs = Date.now()) {
  const totalSec = Math.max(0, Math.floor(msUntilWeeklyReset(nowMs) / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return d > 0 ? `${d}D ${pad2(h)}H` : h > 0 ? `${h}H ${pad2(m)}M` : `${pad2(m)}M ${pad2(s)}S`;
}
