export const LEADERBOARD_MAX_ENTRIES = 10;
const MAX_ENTRIES = LEADERBOARD_MAX_ENTRIES;

let cachedEntries = [];
let cachedMyBest = 0;
let pendingClaim = null;
const listeners = new Set();

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

export function setLeaderboardState(state = {}) {
  if (Array.isArray(state.entries)) {
    cachedEntries = state.entries.slice(0, MAX_ENTRIES).map((entry) => ({
      name: typeof entry?.name === "string" && entry.name.length > 0 ? entry.name : "—",
      score: Number.isFinite(entry?.score) ? entry.score : 0,
    }));
  }

  if (Number.isFinite(state.myBest)) {
    cachedMyBest = state.myBest;
  }

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
