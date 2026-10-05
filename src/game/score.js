// src/game/score.js
// Bonus scoring, the per-jump air pot, the combo chain, and pop-up events for the renderer.
//
// Bonuses are measured in seconds of running (runPoints), so they keep their weight as speed rises.
// While Bob is airborne, distance and bonuses go into state.airPot instead of the score.
// A safe landing pays out air distance x air multiplier + bonuses, where the air multiplier is
// 1 + one step per backflip + one step per combo link, capped (see airMultiplier).
// A clean tricked landing (a backflip, none still spinning) adds a combo link; any other landing resets it.
// Dying before landing loses the pot.

import * as C from "./constants.js";

function getConst(name, fallback) {
  const v = C[name];
  return Number.isFinite(v) ? v : fallback;
}

const SPEED_START = getConst("SPEED_START", 260);
const SPEED_MAX = getConst("SPEED_MAX", 480);
const FLIP_MULT_STEP = getConst("FLIP_MULT_STEP", 1);
const COMBO_MULT_STEP = getConst("COMBO_MULT_STEP", 0.5);
const AIR_MULT_MAX = getConst("AIR_MULT_MAX", 4);
const BACKFLIP_BONUS_SEC = getConst("BACKFLIP_BONUS_SEC", 0.25);
const CLUTCH_FLIP_BONUS_SEC = getConst("CLUTCH_FLIP_BONUS_SEC", 0.3);
const CLUTCH_FLIP_WINDOW_SEC = getConst("CLUTCH_FLIP_WINDOW_SEC", 0.12);

// Pop-ups: fixed ring of reusable slots (no per-event allocation beyond the text).
const SCORE_EVENT_SLOTS = 6;
const SCORE_EVENT_STACK_SEC = 0.25; // events closer together than this stack vertically

export function createScoreEvents() {
  return Array.from({ length: SCORE_EVENT_SLOTS }, () => ({
    text: "", amount: 0, t: -1, x: 0, y: 0, stack: 0,
  }));
}

function pushScoreEvent(state, amount, text) {
  const events = state.scoreEvents;
  const p = state.player;
  if (!events || !p) return;
  const now = state.uiTime || 0;
  const prev = events[(state.scoreEventHead + events.length - 1) % events.length];
  const ev = events[state.scoreEventHead];
  state.scoreEventHead = (state.scoreEventHead + 1) % events.length;

  ev.text = text;
  ev.amount = amount;
  ev.t = now;
  ev.x = p.x + p.w / 2;
  ev.y = p.y;
  ev.stack = prev.t >= 0 && now - prev.t < SCORE_EVENT_STACK_SEC ? (prev.stack + 1) % 4 : 0;
}

// Seconds of running at the current speed, in points. The dash boost is left out,
// so a bonus earned mid-dash isn't inflated.
export function runPoints(state, sec) {
  if (!(sec > 0)) return 0;
  const speed = Math.min(SPEED_MAX, Math.max(SPEED_START, state.speed || 0));
  return Math.round(sec * speed);
}

// Add points: into the air pot while airborne, straight to the score on a roof.
export function addPoints(state, amount) {
  if (!(amount > 0)) return;
  if (state.airActive) state.airPot += amount;
  else state.score += amount;
}

// Distance points: like addPoints, but airborne distance is also tracked for the air multiplier.
export function addDistancePoints(state, amount) {
  if (!(amount > 0)) return;
  if (state.airActive) state.airDistance += amount;
  addPoints(state, amount);
}

// A named bonus worth `sec` seconds of running: adds points and shows a pop-up.
export function awardBonus(state, sec, label) {
  const amount = runPoints(state, sec);
  if (!(amount > 0)) return;
  addPoints(state, amount);
  pushScoreEvent(state, amount, `+${amount} ${label}`);
  if (!state.airActive) state.scoreEventLastT = state.uiTime || 0;
}

// Takeoff: start a fresh pot. Safe to call repeatedly.
export function beginAir(state) {
  if (state.airActive) return;
  state.airActive = true;
  state.airPot = 0;
  state.airDistance = 0;
  state.airFlips = 0;
  state.airFlipEndT = -1;
}

// Backflip: bonus into the pot and one more step on the air multiplier.
export function awardBackflip(state) {
  if (state.airActive) state.airFlips = (state.airFlips || 0) + 1;
  const amount = runPoints(state, BACKFLIP_BONUS_SEC);
  addPoints(state, amount);
  pushScoreEvent(state, amount, `+${amount} BACKFLIP ${formatMult(airMultiplier(state))}`);
  if (!state.airActive) state.scoreEventLastT = state.uiTime || 0;
}

// A backflip finished its rotation (for the clutch bonus on landing).
export function noteFlipDone(state) {
  if (state.airActive) state.airFlipEndT = state.uiTime || 0;
}

// Multiplier on this jump's distance. Only a tricked jump is multiplied, so the combo
// pays nothing on a plain jump. Flips and combo add together, then the cap applies.
export function airMultiplier(state, withCombo = true) {
  const flips = Math.max(0, state.airFlips || 0);
  if (flips <= 0) return 1;
  const combo = withCombo ? Math.max(0, state.combo || 0) : 0;
  return Math.min(AIR_MULT_MAX, 1 + flips * FLIP_MULT_STEP + combo * COMBO_MULT_STEP);
}

export function formatMult(mult) {
  return Number.isInteger(mult) ? `×${mult}` : `×${mult.toFixed(1)}`;
}

// Safe landing: pay the pot out with the air multiplier and update the combo.
export function landAir(state) {
  if (!state.airActive) return;
  const p = state.player;
  const flips = Math.max(0, state.airFlips || 0);
  const midFlip = flips > 0 && p && p.spinning === true && p.trickKind === "flip";
  const clean = flips > 0 && !midFlip;

  const now = state.uiTime || 0;
  if (clean && state.airFlipEndT >= 0 && now - state.airFlipEndT <= CLUTCH_FLIP_WINDOW_SEC) {
    awardBonus(state, CLUTCH_FLIP_BONUS_SEC, "CLUTCH");
  }

  // A mid-flip landing still pays its flips, but not the combo.
  const mult = airMultiplier(state, clean);
  // airPot already holds the distance once; the multiplier adds (mult - 1) more copies.
  const payout = Math.round((state.airPot || 0) + (state.airDistance || 0) * (mult - 1));
  state.combo = clean ? (state.combo || 0) + 1 : 0;
  loseAir(state);
  if (payout <= 0) return;

  state.score += payout;
  let text = `+${payout}`;
  if (mult > 1) text += ` ${formatMult(mult)}`;
  if (midFlip) text += " SLOPPY";
  else if (state.combo >= 2) text += ` COMBO ${state.combo}`;
  pushScoreEvent(state, payout, text);
  state.scoreEventLastT = now;
}

// Clear the pot: after a payout, or on death before landing (the pot is lost).
export function loseAir(state) {
  state.airActive = false;
  state.airPot = 0;
  state.airDistance = 0;
  state.airFlips = 0;
  state.airFlipEndT = -1;
}
