import { claimName, loadLeaderboard } from "./api.js";
import { getLeaderboardState, setLeaderboardState } from "./state.js";
import { blockedNameMessage, DEFAULT_BLOCKED_MESSAGE } from "./blockedNames.js";
import { getOperatorName, isOperatorChangeQueued, setOperator } from "./operator.js";

const NAME_PROMPT_MAX = 10;
const NAME_VALIDATION = /^[A-Za-z0-9 _\-.]{1,10}$/;

let promptActive = false;
// The last name claimed this session and its score. auto: it was filed under the operator's name
// without asking (the end screen says "record filed" rather than "operator registered").
const lastClaim = { name: "", score: -1, auto: false };
let promptResolver = null;
// What SKIP gives back: null (no claim), or, while changing operator, the name to keep.
let promptKeepName = null;
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

  const title = overlay.querySelector(".prompt-title");
  const copy = overlay.querySelector(".prompt-copy");
  const note = overlay.querySelector(".prompt-note");

  const elements = { overlay, input, error, submit, cancel, denied, deniedName, deniedCopy, title, copy, note };
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

const NAME_RULES = "1–10 characters: letters, numbers, space, _ - .";

// The prompt's words. keepName: the operator's name while changing it (SKIP keeps it), else null.
function setPromptCopy(elements, keepName) {
  const set = (el, text) => { if (el) el.textContent = text; };
  if (keepName) {
    set(elements.title, "Change Operator");
    set(elements.copy, `This run made the board. File it under a new operator name (${NAME_RULES})`);
    set(elements.note, `Records already filed stay under ${keepName}.`);
    set(elements.submit, "Change");
    set(elements.cancel, `Keep ${keepName}`);
  } else {
    set(elements.title, "Register Operator");
    set(elements.copy, `This run made the board. Sign in as its operator (${NAME_RULES})`);
    set(elements.note, "One name per operator: every record after this is filed under it. To change it, use CHANGE OPERATOR on the start screen.");
    set(elements.submit, "Sign in");
    set(elements.cancel, "Skip");
  }
}

// denied: { name, message } to reopen with that name already refused (the server blocked it).
// keepName: the operator's name when this is a CHANGE OPERATOR prompt.
function openNamePrompt(denied = null, keepName = null) {
  const elements = ensurePromptElements();
  if (!elements) return Promise.resolve(null);
  promptKeepName = keepName;
  setPromptCopy(elements, keepName);
  elements.overlay.classList.add("active");
  elements.input.value = denied ? denied.name : "";
  if (elements.error) elements.error.textContent = "";
  if (elements.denied) elements.denied.hidden = true;
  if (denied) showDenied(denied.name, denied.message);
  else setTimeout(() => elements.input?.focus(), 10);
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
  // Give the keyboard back to the game. Left in the hidden name box, focus would take every key
  // (main.js doesn't pull focus out of a text box), and on a Mac holding W/A/S/D there opens the
  // accent pop-up.
  const focused = document.activeElement;
  if (focused && promptElements?.overlay?.contains(focused)) focused.blur();
  document.getElementById("game")?.focus({ preventScroll: true });
  emitPromptState(false);
  resolve(value);
}

export function getLastClaim() {
  return lastClaim;
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

// Blocked name: a pop-up over the prompt with that name's message (src/leaderboard/blockedNames.js).
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
  finalizePrompt(promptKeepName);
}

async function refreshTop10() {
  try {
    setLeaderboardState(await loadLeaderboard()); // both boards and both bests
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
    // A signed-in operator's record is filed under their name straight away. The prompt opens for
    // the first one, and for the one after CHANGE OPERATOR.
    const operator = getOperatorName();
    const changing = operator !== "" && isOperatorChangeQueued();
    let auto = operator !== "" && !changing;
    let name = auto ? operator : await openNamePrompt(null, changing ? operator : null);
    let claimed = null;
    // The Worker checks the same blocked names (blocked-names.json). If it refuses one this game
    // let through (an older copy of the list), show the pop-up and let the player pick again.
    while (name) {
      try {
        claimed = await claimName(pendingClaim.deviceId, pendingClaim.score, name);
        break;
      } catch (error) {
        if (error?.message !== "name_blocked") throw error;
        auto = false;
        name = await openNamePrompt({ name, message: blockedNameMessage(name) || DEFAULT_BLOCKED_MESSAGE });
      }
    }
    if (!name) {
      setLeaderboardState({ pendingClaim: null });
      return;
    }

    setOperator(name);
    lastClaim.name = name;
    lastClaim.score = pendingClaim.score;
    lastClaim.auto = auto;
    if (Number.isFinite(claimed.my_best)) {
      const updates = {
        myBest: claimed.my_best,
        pendingClaim: null,
      };
      if (Array.isArray(claimed.entries)) updates.entries = claimed.entries;
      if (Array.isArray(claimed.weekly)) updates.weekly = claimed.weekly;
      if (Number.isFinite(claimed.week_best)) updates.weekBest = claimed.week_best;
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
