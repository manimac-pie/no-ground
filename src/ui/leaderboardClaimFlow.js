import { claimName, loadLeaderboard } from "./leaderboard.js";
import { getLeaderboardState, setLeaderboardState } from "./leaderboardState.js";
import { blockedNameMessage } from "./blockedNames.js";

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
  const denied = overlay.querySelector(".prompt-denied");
  const deniedName = overlay.querySelector(".prompt-denied-name");
  const deniedCopy = overlay.querySelector(".prompt-denied-copy");
  const deniedOk = overlay.querySelector("[data-action='denied-ok']");

  const elements = { overlay, input, error, submit, cancel, denied, deniedName, deniedCopy };
  promptElements = elements;

  deniedOk?.addEventListener("click", () => hideDenied());
  denied?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      hideDenied();
    }
  });
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
  if (elements.denied) elements.denied.hidden = true;
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
  const deniedMessage = blockedNameMessage(value);
  if (deniedMessage) {
    showDenied(value, deniedMessage);
    return;
  }
  finalizePrompt(value);
}

// Blocked name: a pop-up over the prompt with that name's message (src/ui/blockedNames.js).
function showDenied(name, message) {
  const { denied, deniedName, deniedCopy, error } = promptElements;
  if (!denied) {
    if (error) error.textContent = message;
    return;
  }
  if (error) error.textContent = "";
  if (deniedName) deniedName.textContent = `"${name}"`;
  if (deniedCopy) deniedCopy.textContent = message;
  denied.hidden = false;
  denied.querySelector("[data-action='denied-ok']")?.focus();
}

function hideDenied() {
  if (!promptElements?.denied || promptElements.denied.hidden) return;
  promptElements.denied.hidden = true;
  promptElements.input.focus();
  promptElements.input.select();
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
