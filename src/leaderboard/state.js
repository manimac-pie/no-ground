export const LEADERBOARD_MAX_ENTRIES = 10;
export const LEADERBOARD_ALL_TIME_ROWS = 3; // the panel shows the all-time top 3; they never reset
const MAX_ENTRIES = LEADERBOARD_MAX_ENTRIES;

let cachedEntries = [];   // the all-time board
let cachedWeekly = null;  // this week's top 10, once the Worker sends one (null until then)
let cachedMyBest = 0;
let cachedWeekBest = null;
let pendingClaim = null;
let boards = buildBoards();
const listeners = new Set();

// The two sections of the leaderboard panel. With a weekly list from the Worker, THIS WEEK is its
// own ranking, 1-10. Without one (the Worker before docs/WORKER_TODO.md item 2), it's ranks 4-10
// of the single list.
function buildBoards() {
  const separate = Array.isArray(cachedWeekly);
  return {
    allTime: cachedEntries.slice(0, LEADERBOARD_ALL_TIME_ROWS),
    weekly: separate ? cachedWeekly : cachedEntries.slice(LEADERBOARD_ALL_TIME_ROWS),
    weeklyFirstRank: separate ? 1 : LEADERBOARD_ALL_TIME_ROWS + 1,
    weeklySlots: separate ? MAX_ENTRIES : MAX_ENTRIES - LEADERBOARD_ALL_TIME_ROWS,
    separate,
    weekBest: cachedWeekBest,
  };
}

function cleanEntries(list) {
  return list.slice(0, MAX_ENTRIES).map((entry) => ({
    name: typeof entry?.name === "string" && entry.name.length > 0 ? entry.name : "—",
    score: Number.isFinite(entry?.score) ? entry.score : 0,
  }));
}

function notify() {
  const snapshot = {
    entries: cachedEntries.slice(),
    myBest: cachedMyBest,
    pendingClaim,
  };
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.error("Leaderboard listener errored:", err);
    }
  });
}

export function getLeaderboardState() {
  return {
    entries: cachedEntries.slice(),
    myBest: cachedMyBest,
    pendingClaim,
  };
}

// Allocation-free reads for per-frame callers.
export function getMyBest() {
  return cachedMyBest;
}

// The panel's two sections; rebuilt only when the data changes.
export function getBoards() {
  return boards;
}

// A score waiting for a name ({ deviceId, score, prompted }), or null. Allocation-free.
export function getPendingClaim() {
  return pendingClaim;
}

export function setLeaderboardState(state = {}) {
  if (Array.isArray(state.entries)) {
    cachedEntries = cleanEntries(state.entries);
  }
  if ("weekly" in state) {
    cachedWeekly = Array.isArray(state.weekly) ? cleanEntries(state.weekly) : null;
  }

  if (Number.isFinite(state.myBest)) {
    cachedMyBest = state.myBest;
  }
  if ("weekBest" in state) {
    cachedWeekBest = Number.isFinite(state.weekBest) ? state.weekBest : null;
  }
  boards = buildBoards();

  if ("pendingClaim" in state) {
    if (state.pendingClaim && typeof state.pendingClaim === "object") {
      pendingClaim = {
        deviceId: state.pendingClaim.deviceId,
        score: Number.isFinite(state.pendingClaim.score) ? state.pendingClaim.score : 0,
        prompted: Boolean(state.pendingClaim.prompted),
      };
    } else {
      pendingClaim = null;
    }
  }

  notify();
}

export function subscribeLeaderboardState(listener) {
  listeners.add(listener);
  listener(getLeaderboardState());
  return () => listeners.delete(listener);
}
