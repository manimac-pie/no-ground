import { claimName, loadLeaderboard } from "./leaderboard.js";
import { getLeaderboardState, setLeaderboardState } from "./leaderboardState.js";

const NAME_PROMPT_MAX = 10;
const NAME_VALIDATION = /^[A-Za-z0-9 _\-.]{1,10}$/;

let promptActive = false;
let promptResolver = null;
let promptElements = null;
const promptStateListeners = new Set();

function emitPromptState(isOpen) {
  promptStateListeners.forEach((cb) => {
    try {
      cb(isOpen);
    } catch (error) {
      console.error("Leaderboard prompt listener error:", error);
    }
  });
}

function ensurePromptElements() {
  if (promptElements) return promptElements;
  const overlay = document.getElementById("leaderboard-prompt");
  if (!overlay) return null;
  const input = overlay.querySelector("#leaderboard-name-input");
  const error = overlay.querySelector(".leaderboard-prompt-error");
  const submit = overlay.querySelector("[data-action='submit']");
  const cancel = overlay.querySelector("[data-action='cancel']");
  if (!input || !submit || !cancel) return null;

  const elements = { overlay, input, error, submit, cancel };
  promptElements = elements;

  submit.addEventListener("click", () => submitName());
  cancel.addEventListener("click", () => submitCancel());
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) submitCancel();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitName();
    } else if (event.key === "Escape") {
      event.preventDefault();
      submitCancel();
    }
  });

  return elements;
}

function openNamePrompt() {
  const elements = ensurePromptElements();
  if (!elements) return Promise.resolve(null);
  elements.overlay.classList.add("active");
  elements.input.value = "";
  if (elements.error) elements.error.textContent = "";
  setTimeout(() => elements.input?.focus(), 10);
  emitPromptState(true);
  return new Promise((resolve) => {
    promptResolver = resolve;
  });
}

function finalizePrompt(value) {
  if (!promptResolver) return;
  const resolve = promptResolver;
  promptResolver = null;
  promptElements?.overlay?.classList.remove("active");
  emitPromptState(false);
  resolve(value);
}

export function onLeaderboardPromptStateChange(listener) {
  if (typeof listener !== "function") return () => {};
  promptStateListeners.add(listener);
  return () => promptStateListeners.delete(listener);
}

function submitName() {
  if (!promptResolver || !promptElements) return;
  const value = promptElements.input.value.trim().slice(0, NAME_PROMPT_MAX);
  if (!NAME_VALIDATION.test(value)) {
    if (promptElements.error) {
      promptElements.error.textContent =
        "Enter 1–10 chars: letters, numbers, space, _ - .";
    }
    return;
  }
  finalizePrompt(value);
}

function submitCancel() {
  if (!promptResolver) return;
  finalizePrompt(null);
}

async function refreshTop10() {
  try {
    const { entries, myBest } = await loadLeaderboard();
    setLeaderboardState({ entries, myBest });
  } catch (err) {
    console.error("Leaderboard refresh failed:", err);
  }
}

function markPendingClaim(pendingClaim) {
  setLeaderboardState({
    pendingClaim: pendingClaim ? { ...pendingClaim, prompted: true } : null,
  });
}

export function initLeaderboardPromptOverlay() {
  ensurePromptElements();
}

export async function maybePromptForPendingClaim({ allowPrompt = true } = {}) {
  if (!allowPrompt || promptActive) return;
  const { pendingClaim } = getLeaderboardState();
  if (!pendingClaim || pendingClaim.prompted) return;

  promptActive = true;
  markPendingClaim(pendingClaim);

  try {
    const name = await openNamePrompt();
    if (!name) {
      setLeaderboardState({ pendingClaim: null });
      return;
    }

    const claimed = await claimName(pendingClaim.deviceId, pendingClaim.score, name);
    if (Number.isFinite(claimed.my_best)) {
      const updates = {
        myBest: claimed.my_best,
        pendingClaim: null,
      };
      if (Array.isArray(claimed.entries)) updates.entries = claimed.entries;
      setLeaderboardState(updates);
      await refreshTop10();
    } else {
      setLeaderboardState({ pendingClaim: null });
    }
  } catch (error) {
    console.error("Claiming leaderboard name failed:", error);
    setLeaderboardState({ pendingClaim: null });
  } finally {
    promptActive = false;
  }
}
