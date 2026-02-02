import {
  loadLeaderboard,
  submitFinalScore,
} from "./leaderboard.js";
import {
  getLeaderboardState,
  setLeaderboardState,
  subscribeLeaderboardState,
} from "./leaderboardState.js";

function el(id) {
  return document.getElementById(id);
}

function renderEntries(entries) {
  const list = el("leaderboard-list");
  if (!list) return;
  list.innerHTML = "";
  for (const e of entries) {
    const li = document.createElement("li");
    li.textContent = `${e.name} — ${e.score}`;
    list.appendChild(li);
  }
}

function updateLeaderboardDom(state) {
  renderEntries(state.entries || []);
  const my = el("my-best");
  if (my) my.textContent = String(Math.floor(state.myBest || 0));
}

subscribeLeaderboardState(updateLeaderboardDom);

export async function refreshLeaderboard() {
  const { entries, myBest } = await loadLeaderboard();
  setLeaderboardState({ entries, myBest });
  return { entries, myBest };
}

export async function onGameFinished(finalScore) {
  const result = await submitFinalScore(finalScore);
  setLeaderboardState({ myBest: result.my_best });

  if (result.qualified) {
    setLeaderboardState({
      pendingClaim: {
        deviceId: result.deviceId,
        score: result.score,
        prompted: false,
      },
    });
  }

  refreshLeaderboard().catch(console.error);
  return result;
}
