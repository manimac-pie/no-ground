// src/leaderboard/reset.js
// Weekly leaderboard reset: ranks 4–10 are wiped every Monday 00:00 UTC; the top 3 stay.
// This only drives the countdown on the leaderboard panel. The wipe itself runs on the
// Worker (a cron trigger at the same time, see docs/WORKER_TODO.md). Keep the two in sync.

export const RESET_WEEKDAY_UTC = 1; // 0 = Sunday, 1 = Monday, ...
export const RESET_HOUR_UTC = 0;
export const RESET_FIRST_RANK = 4;  // ranks from here to the bottom of the top 10 reset

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

// "RANKS 4-10 RESET IN 2D 14H", "... IN 14H 05M", "... IN 05M 33S".
export function weeklyResetLabel(nowMs = Date.now()) {
  const totalSec = Math.max(0, Math.floor(msUntilWeeklyReset(nowMs) / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const left = d > 0 ? `${d}D ${pad2(h)}H` : h > 0 ? `${h}H ${pad2(m)}M` : `${pad2(m)}M ${pad2(s)}S`;
  return `RANKS ${RESET_FIRST_RANK}-10 RESET IN ${left}`;
}
