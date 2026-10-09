// src/leaderboard/operator.js
// The operator: the player, who runs the simulation (Bob is its subject). One name per operator: the
// first record that makes a board asks for it, and every record after that is filed under it
// without asking (claimFlow.js).
// - CHANGE OPERATOR queues a new name: the next record that makes a board asks for it again.
// - TERMINATE BOB signs the operator out (and the start screen's iteration count starts over).
//   There's no name again until a record makes a board.
// Kept in localStorage; without storage there's no operator, so every record asks.

const OPERATOR_KEY = "ng_operator";     // { name, changeQueued }
const TERMINATED_KEY = "ng_terminated"; // { name, at }: the last TERMINATE BOB, for the start screen's log

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {}
}

const saved = load(OPERATOR_KEY);
let operator = saved && typeof saved.name === "string" && saved.name
  ? { name: saved.name, changeQueued: saved.changeQueued === true }
  : null;
const savedEnd = load(TERMINATED_KEY);
let terminated = savedEnd && typeof savedEnd.name === "string" && Number.isFinite(savedEnd.at) ? savedEnd : null;

// The operator's name, or "" when no one is signed in.
export function getOperatorName() {
  return operator ? operator.name : "";
}

export function isOperatorChangeQueued() {
  return !!operator && operator.changeQueued;
}

// A claim went through under this name: it's the operator now (any queued change is done).
export function setOperator(name) {
  operator = { name, changeQueued: false };
  store(OPERATOR_KEY, operator);
  terminated = null;
  store(TERMINATED_KEY, null);
}

export function queueOperatorChange(queued) {
  if (!operator) return;
  operator.changeQueued = queued === true;
  store(OPERATOR_KEY, operator);
}

// TERMINATE BOB: sign the operator out. (The caller resets the iteration count.)
export function terminateOperator(nowMs = Date.now()) {
  terminated = { name: operator ? operator.name : "", at: nowMs };
  store(TERMINATED_KEY, terminated);
  operator = null;
  store(OPERATOR_KEY, null);
}

// The last TERMINATE BOB ({ name, at }) while no one has signed in since, or null.
export function getTermination() {
  return terminated;
}
