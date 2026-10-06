// src/game/score.js
// Bonus scoring, the per-jump air pot, the combo chain, and pop-up events for the renderer.
//
// Bonuses are measured in seconds of running (runPoints), so they keep their weight as speed rises.
// Distance always counts straight away (you ran it). While Bob is airborne, bonuses go into
// state.airPot instead of the score; a safe landing pays them out plus the air multiplier's extra
// copies of this jump's distance, where the multiplier is 1 + one step per backflip + one step
// per combo link, capped (see airMultiplier).
// A clean tricked landing (a backflip, none still spinning) adds a combo link; any other landing resets it.
// Dying before landing loses the pot.
//
// Run summary breakdown: points per source (plus counts for some), kept the same way as the pot.
// Airborne points collect in state.airBreakdown and move to state.scoreBreakdown on a safe landing,
// so the breakdown only holds banked points and adds up to the score.

import { getConst } from "./utils.js";

const SPEED_START = getConst("SPEED_START", 260);
const SPEED_MAX = getConst("SPEED_MAX", 480);
const FLIP_MULT_STEP = getConst("FLIP_MULT_STEP", 0.5);
const COMBO_MULT_STEP = getConst("COMBO_MULT_STEP", 0.5);
const AIR_MULT_MAX = getConst("AIR_MULT_MAX", 4);
const SCORE_PX_PER_POINT = getConst("SCORE_PX_PER_POINT", 2);
const BACKFLIP_BONUS_SEC = getConst("BACKFLIP_BONUS_SEC", 0.25);
const CLUTCH_FLIP_BONUS_SEC = getConst("CLUTCH_FLIP_BONUS_SEC", 0.3);
const CLUTCH_FLIP_WINDOW_SEC = getConst("CLUTCH_FLIP_WINDOW_SEC", 0.12);
const BYPASS_POINTS_FRAC = getConst("BYPASS_POINTS_FRAC", 0.3);

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

// Sources: distance, multiplier (the air multiplier's extra distance), backflip, smash,
// dodge (ducking under a billboard), closeCall, buildings (BYPASS: jumping clean over buildings), other.
// The *N fields count events for the sources the summary shows a count for (buildingsN: buildings bypassed).
export function createBreakdown() {
  return {
    distance: 0, multiplier: 0, backflip: 0, smash: 0, dodge: 0, closeCall: 0, buildings: 0, other: 0,
    backflipN: 0, smashN: 0, dodgeN: 0, closeCallN: 0, buildingsN: 0,
  };
}

export function clearBreakdown(b) {
  for (const k in b) b[k] = 0;
}

// The breakdown points go into right now: pending while airborne, banked on a roof.
function liveBreakdown(state) {
  return state.airActive ? state.airBreakdown : state.scoreBreakdown;
}

// Count an event (e.g. a billboard broken) for the summary without adding points.
export function countEvent(state, kind) {
  const b = liveBreakdown(state);
  const key = `${kind}N`;
  if (b && key in b) b[key] += 1;
}

// Seconds of running at the current speed, in points. The dash boost is left out,
// so a bonus earned mid-dash isn't inflated.
export function runPoints(state, sec) {
  if (!(sec > 0)) return 0;
  const speed = Math.min(SPEED_MAX, Math.max(SPEED_START, state.speed || 0));
  return Math.round((sec * speed) / SCORE_PX_PER_POINT);
}

// Add points: into the air pot while airborne, straight to the score on a roof.
// kind: the breakdown source they count towards.
export function addPoints(state, amount, kind = "other") {
  if (!(amount > 0)) return;
  if (state.airActive) state.airPot += amount;
  else state.score += amount;
  const b = liveBreakdown(state);
  if (b && kind in b) b[kind] += amount;
}

// Distance points (px run / SCORE_PX_PER_POINT): always banked at once, so the summary's distance
// points equal the distance run. Airborne distance is also tracked for the air multiplier, whose
// extra copies wait for the landing.
export function addDistancePoints(state, px) {
  if (!(px > 0)) return;
  const amount = px / SCORE_PX_PER_POINT;
  state.score += amount;
  if (state.scoreBreakdown) state.scoreBreakdown.distance += amount;
  if (state.airActive) state.airDistance += amount;
}

// The multiplier's extra copies of this jump's distance (paid on a safe landing).
function airExtra(state, mult) {
  return Math.round((state.airDistance || 0) * (mult - 1));
}

// Points riding on this jump right now: lost if Bob dies before landing.
export function airPotAtRisk(state) {
  if (!state.airActive) return 0;
  return Math.floor((state.airPot || 0) + airExtra(state, airMultiplier(state)));
}

// A named bonus worth `sec` seconds of running: adds points and shows a pop-up.
// kind: the breakdown source (counted once per award). mult: e.g. 2 for a PERFECT (exactly double).
export function awardBonus(state, sec, label, kind = "other", mult = 1) {
  const amount = runPoints(state, sec) * mult;
  if (!(amount > 0)) return;
  addPoints(state, amount, kind);
  countEvent(state, kind);
  pushScoreEvent(state, amount, `+${amount} ${label}`);
  if (!state.airActive) state.scoreEventLastT = state.uiTime || 0;
}

// BYPASS: landing after jumping clean over n whole buildings (the ones he left from and landed on
// don't count) pays this jump's distance × n × BYPASS_POINTS_FRAC. Banked at once (it's the
// landing), not put in the pot, so the trick multiplier doesn't multiply it.
export function awardBuildingsCleared(state, n) {
  const b = state.scoreBreakdown;
  if (!state.airActive || !(n > 0) || !b) return;
  b.buildingsN += n;
  const amount = Math.round((state.airDistance || 0) * n * BYPASS_POINTS_FRAC);
  if (!(amount > 0)) return;
  b.buildings += amount;
  state.score += amount;
  pushScoreEvent(state, amount, `+${amount} ${n > 1 ? `${n} BUILDINGS` : "BUILDING"} BYPASSED`);
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
  addPoints(state, amount, "backflip");
  countEvent(state, "backflip");
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
  const extra = airExtra(state, mult);
  const payout = (state.airPot || 0) + extra;
  state.combo = clean ? (state.combo || 0) + 1 : 0;
  // Bank this jump's breakdown; the multiplier's extra copies of distance get their own row.
  const banked = state.scoreBreakdown;
  const pending = state.airBreakdown;
  if (banked && pending) {
    for (const k in pending) banked[k] += pending[k];
    banked.multiplier += extra;
  }
  loseAir(state);
  if (payout <= 0) return;

  state.score += payout;
  let text = `+${payout}`;
  if (mult > 1) text += ` ${formatMult(mult)}`;
  if (midFlip) text += " SLOPPY";
  else if (state.combo >= 2) text += ` CHAIN ×${state.combo}`;
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
  if (state.airBreakdown) clearBreakdown(state.airBreakdown);
}

// ---------------- run summary tally ----------------
// The summary counts up row by row, like an arcade end-of-level bonus tally.
export const TALLY_ROW_SEC = 0.3;       // per row that scored
export const TALLY_EMPTY_ROW_SEC = 0.1; // rows worth nothing pass quickly

export function tallyRowSec(row) {
  return row.points > 0 ? TALLY_ROW_SEC : TALLY_EMPTY_ROW_SEC;
}

// Summary rows in tally order: { key, points, count } (count is null for rows without one).
// Bonus points are whole numbers and DISTANCE takes the rest, so the rows add up to the shown
// total and DISTANCE's points equal the distance shown next to it.
// The "other" bonuses (double jump, dive, vault, ...) have no row of their own: they count
// towards TRICK MULTIPLIER.
export function buildSummaryRows(state) {
  const b = state.scoreBreakdown || {};
  const pts = (k) => Math.max(0, Math.round(b[k] || 0));
  const rows = [
    { key: "multiplier", points: pts("multiplier") + pts("other"), count: null },
    { key: "backflip", points: pts("backflip"), count: b.backflipN || 0 },
    { key: "smash", points: pts("smash"), count: b.smashN || 0 },
    { key: "dodge", points: pts("dodge"), count: b.dodgeN || 0 },
    { key: "closeCall", points: pts("closeCall"), count: b.closeCallN || 0 },
    { key: "buildings", points: pts("buildings"), count: b.buildingsN || 0 },
  ];
  const bonusTotal = rows.reduce((sum, r) => sum + r.points, 0);
  const score = Number.isFinite(state.score) ? state.score : 0;
  // One distance point per metre run, so the distance chip shows the same number as the points.
  const distancePts = Math.max(0, Math.floor(score) - bonusTotal);
  rows.unshift({ key: "distance", points: distancePts, count: distancePts });
  return rows;
}
