// src/game/score.js
// Bonus scoring, the per-jump air pot, and pop-up events for the renderer.
//
// While Bob is airborne, distance and bonuses go into state.airPot instead of the score.
// A safe landing pays out (air distance x flip multiplier + bonuses) x slowfall multiplier:
// - flip multiplier: 1 + backflips this airtime
// - slowfall multiplier: 1 + share of fuel used (full tank = x2)
// Dying before landing loses the pot.

import * as C from "./constants.js";

function getConst(name, fallback) {
  const v = C[name];
  return Number.isFinite(v) ? v : fallback;
}

const SLOWFALL_FUEL_MAX = getConst("SLOWFALL_FUEL_MAX", 0.55);

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

// Add points: into the air pot while airborne, straight to the score on a roof.
export function addPoints(state, amount) {
  if (!(amount > 0)) return;
  if (state.airActive) state.airPot += amount;
  else state.score += amount;
}

// Distance points: like addPoints, but airborne distance is also tracked for the flip multiplier.
export function addDistancePoints(state, amount) {
  if (!(amount > 0)) return;
  if (state.airActive) state.airDistance += amount;
  addPoints(state, amount);
}

// A named bonus: adds points and shows a pop-up.
export function awardBonus(state, amount, label) {
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
  state.airSlowfallUsed = 0;
}

// Backflip: bonus into the pot and one more step on the distance multiplier.
export function awardBackflip(state, amount) {
  if (state.airActive) state.airFlips = (state.airFlips || 0) + 1;
  const flipMult = flipMultiplier(state);
  addPoints(state, amount);
  pushScoreEvent(state, amount, `+${amount} BACKFLIP ×${flipMult}`);
  if (!state.airActive) state.scoreEventLastT = state.uiTime || 0;
}

export function flipMultiplier(state) {
  return 1 + Math.max(0, state.airFlips || 0);
}

export function airMultiplier(state) {
  const used = Math.max(0, state.airSlowfallUsed || 0);
  return 1 + Math.min(1, used / Math.max(0.001, SLOWFALL_FUEL_MAX));
}

// Safe landing: pay the pot out with the flip and slowfall multipliers.
export function landAir(state) {
  if (!state.airActive) return;
  const flipMult = flipMultiplier(state);
  const mult = airMultiplier(state);
  // airPot already holds the distance once; the flip multiplier adds (flipMult - 1) more copies.
  const raw = (state.airPot || 0) + (state.airDistance || 0) * (flipMult - 1);
  const payout = Math.round(raw * mult);
  loseAir(state);
  if (payout <= 0) return;

  state.score += payout;
  let text = `+${payout}`;
  if (flipMult > 1) text += ` ×${flipMult}`;
  if (mult > 1.005) text += ` ×${mult.toFixed(1)}`;
  pushScoreEvent(state, payout, text);
  state.scoreEventLastT = state.uiTime || 0;
}

// Death before landing: the pot is lost.
export function loseAir(state) {
  state.airActive = false;
  state.airPot = 0;
  state.airDistance = 0;
  state.airFlips = 0;
  state.airSlowfallUsed = 0;
}
