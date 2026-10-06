// src/game/generator.js
// The level generator: spawns the roofs (and their billboards) ahead of Bob.
//
// Most roofs are random within the rules below. Some are planned a few roofs ahead and queued
// (state.gen.queue), so a short run of roofs can be shaped as one piece:
//   - challenge gaps: a long gap (more than any plain jump) or a dive ledge (see constants.js);
//   - patterns: stairs, hops, and breathers (calm stretches after the hard bits).
// Every gap is checked with game/reach.js, which steps the same physics as game/player.js.
// game/platforms.js moves and breaks the roofs once they exist.

import {
  BILLBOARD_FIRST_AT,
  BILLBOARD_INTRO,
  BILLBOARD_REPEAT_DAMP,
  BILLBOARD_SPACING_EASY,
  BILLBOARD_SPACING_HARD,
  BILLBOARD_WEIGHTS_EASY,
  BILLBOARD_WEIGHTS_HARD,
  BREATHER_SPACING,
  CHALLENGE_CHANCE_EASY,
  CHALLENGE_CHANCE_HARD,
  CHALLENGE_SPACING,
  DIFFICULTY_FULL_AT,
  DIVE_LEDGE_FROM,
  DIVE_WINDOW_MIN_SEC,
  GAP_MAX_EASY,
  GAP_MAX_HARD,
  GAP_MIN,
  GROUND_Y,
  HEIGHT_LEVELS,
  INTERNAL_WIDTH,
  LATE_BILLBOARD_SQUEEZE,
  LATE_CHALLENGE_EXTRA,
  LATE_DIFFICULTY_FULL_AT,
  LATE_GAP_EXTRA,
  LATE_MOTION_EXTRA,
  LOW_BILLBOARD_LEAD_SEC,
  MAX_PLATFORM_STEP,
  PATTERN_SPACING,
  PLATFORM_H,
  PLATFORM_MAX_W,
  PLATFORM_MIN_W,
  PLAYER_H,
  PLAYER_W,
  PLAYER_X,
  ROOF_Y_BOTTOM,
  ROOF_Y_TOP,
  SAFE_CLEARANCE,
  SPEED_MAX,
  SPEED_RAMP_PER_SEC,
  SPEED_START,
} from "./constants.js";
import { clamp } from "../shared/math.js";
import { pick, randRange } from "./utils.js";
import {
  diveWindow,
  doubleJumpMax,
  edgeJumpReach,
  plainJumpMax,
  rollReach,
  slowfallReach,
} from "./reach.js";

const FAIR_GAP_FRAC = 0.8;   // a normal gap is at most this share of a plain jump's reach
const LONG_GAP_MARGIN = 1.08; // a long gap beats the farthest plain jump by at least 8%...
const LONG_GAP_FAIR = 0.85;   // ...and is at most 85% of a double jump or a slowfall jump
const LOW_BREAK_Y = GROUND_Y - 50; // breakable roofs resting this low break as they come into view
const MAX_STEP_UP = 90; // a single jump peaks about 105 px up at the 60 Hz step, so climbs stay below that

// ---------------- pacing ----------------
export function difficulty01(state) {
  return clamp(state.distance / DIFFICULTY_FULL_AT, 0, 1);
}

export function lateDifficulty01(state) {
  return clamp((state.distance - DIFFICULTY_FULL_AT) / (LATE_DIFFICULTY_FULL_AT - DIFFICULTY_FULL_AT), 0, 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRange(easy, hard, d) {
  return randRange(lerp(easy[0], hard[0], d), lerp(easy[1], hard[1], d));
}

// World speed for "can Bob clear it?" checks: the slowest he can be going (dash not counted).
function slowSpeed(state) {
  const ramp = clamp(SPEED_START + SPEED_RAMP_PER_SEC * (state.animTime || 0), SPEED_START, SPEED_MAX);
  const now = Number.isFinite(state.speed) && state.speed > 0 ? state.speed : SPEED_START;
  return Math.min(now, ramp);
}

// For "a plain jump must fall short" checks: the fastest he can be going by the time he reaches a
// gap `ahead` px away (the speed ramp is time-based; dash not counted).
function fastSpeed(state, ahead) {
  const v = slowSpeed(state);
  const t = (state.animTime || 0) + Math.max(0, ahead) / v;
  return clamp(SPEED_START + SPEED_RAMP_PER_SEC * t, v, SPEED_MAX);
}

// ---------------- generator state ----------------
export function createGenState(worldRight) {
  return {
    worldRight,          // right edge of the last roof, in px of level (for spacing things out)
    streak: 0,           // breakable roofs in a row (+) or solid ones (-)
    queue: [],           // planned roofs, spawned before any random ones
    challengeAt: 3000,   // level px the next challenge gap may start at (about 10 s in)
    patternAt: 1500,     // ...the next stairs/hops
    breatherAt: 3200,    // ...the next breather
    bbNextAt: BILLBOARD_FIRST_AT, // ...the next billboard
    bbCount: 0,          // billboards placed this run (the first few are the intro)
    bbLastKind: null,
  };
}

// Never three breakable or three solid roofs in a row.
function materialAllowed(gen, breakable) {
  return breakable ? gen.streak < 2 : gen.streak > -2;
}

function noteMaterial(gen, breakable) {
  gen.streak = breakable ? Math.max(gen.streak, 0) + 1 : Math.min(gen.streak, 0) - 1;
}

export function rightmostPlatformX(state) {
  let best = -Infinity;
  for (const p of state.platforms) best = Math.max(best, p.x + p.w);
  return best;
}

function restingY(plat) {
  return Number.isFinite(plat.baseY) ? plat.baseY : plat.y;
}

// The widest fair gap from a roof at fromY to one at toY: a share of a plain jump at the slowest speed.
function fairGapMax(state, fromY, toY) {
  return FAIR_GAP_FRAC * edgeJumpReach(slowSpeed(state), toY - fromY);
}

// ---------------- the roof object ----------------
export function makeRoof({
  x, y, w,
  baseY = y,
  invulnerable = false,
  breakable = false,
  motion = "none",
  motionRate = 0,
  motionFromY = y,
  motionToY = y,
  breakArmed = false,
  breakDelay = 0,
  lowSpawnBreak = false,
  billboard = null,
  challenge = null,
}) {
  return {
    x, y, w,
    h: PLATFORM_H,
    invulnerable,

    // Motion (armed on spawn; starts when the player is airborne and the roof is approaching)
    baseY, // resting Y (where collision should be once motion completes)
    motion, // "rise" | "crumble" | "none"
    motionArmed: motion !== "none",
    motionStarted: false,
    motionT: 0,
    motionRate,
    motionFromY,
    motionToY,
    lowSpawnBreak,
    breakable,

    // Break state (some crumbling roofs fall away while you're in the air)
    breakArmed,
    breakDelay,
    breakT: 0,
    breakTriggered: false,
    breaking: false,
    break01: 0,

    // Collapse state
    heavyBumped: false,
    stress: 0,
    crack01: 0,
    collapsing: false,
    vy: 0,

    billboard,
    challenge, // "long" | "ledge" on the landing roof of a challenge gap, else null
  };
}

// ---------------- reset ----------------
export function resetPlatforms(state) {
  state.platforms.length = 0;
  const startY = GROUND_Y - SAFE_CLEARANCE;
  // Extra-long first roof, so Bob and the START firewall stay on solid building while zooming out.
  const startW = INTERNAL_WIDTH * 1.35;
  state.gen = createGenState(startW);
  state.platforms.push(makeRoof({ x: 0, y: startY, w: startW, invulnerable: true }));
  while (rightmostPlatformX(state) < INTERNAL_WIDTH + 600) spawnNextPlatform(state);
}

// ---------------- spawning ----------------
export function spawnNextPlatform(state) {
  const gen = state.gen;
  const d = difficulty01(state);
  const late = lateDifficulty01(state);
  const prev = state.platforms[state.platforms.length - 1];
  const prevY = restingY(prev);
  const lastRight = rightmostPlatformX(state);

  if (gen.queue.length === 0) planAhead(state, d, late, prevY, lastRight);
  const plan = gen.queue.shift() || randomRoof(state, d, late, prevY);
  placeRoof(state, plan, d, late, prev, prevY, lastRight);
}

// A random roof: gap, height and width within the current difficulty.
function randomRoof(state, d, late, prevY) {
  const gapMax = lerp(GAP_MAX_EASY, GAP_MAX_HARD, d) + LATE_GAP_EXTRA * late;
  const levels = d < 0.35 ? [0, 30] : HEIGHT_LEVELS;
  const level = d < 0.15 ? 0 : pick(levels);
  const step = MAX_PLATFORM_STEP + d * 50;
  const y = clamp(clamp(GROUND_Y - SAFE_CLEARANCE - level, prevY - Math.min(step, MAX_STEP_UP), prevY + step), ROOF_Y_TOP, ROOF_Y_BOTTOM);
  return {
    gap: randRange(GAP_MIN, gapMax),
    y,
    w: randRange(PLATFORM_MIN_W + 10 * d, PLATFORM_MAX_W + 20 * d),
  };
}

// Builds the roof for a plan and pushes it. plan: { gap, y, w } plus, for planned roofs:
// exact (keep the gap even past a plain jump), still (no motion), noBillboard, breakable (forced
// material), challenge (tag for the landing roof).
function placeRoof(state, plan, d, late, prev, prevY, lastRight) {
  const gen = state.gen;
  let { gap, y, w } = plan;
  if (!plan.exact) gap = clamp(gap, GAP_MIN, Math.max(GAP_MIN, fairGapMax(state, prevY, y)));

  // Moving roofs: some rise up from below or crumble (sink) while Bob is in the air.
  const motionChance = 0.10 + 0.18 * d + LATE_MOTION_EXTRA * late;
  const motion = plan.still || Math.random() >= motionChance
    ? "none"
    : (Math.random() < 0.5 ? "rise" : "crumble");

  // Material: forced by the plan, else random, never three of a kind in a row.
  let breakable = plan.breakable ?? Math.random() < 0.6 + 0.35 * d;
  if (plan.breakable === undefined && !materialAllowed(gen, breakable)) breakable = !breakable;

  const worldLeft = gen.worldRight + gap;
  let billboard = null;
  if (!plan.noBillboard && motion === "none" && worldLeft >= gen.bbNextAt) {
    const placed = placeBillboard(state, d, late, w, y, worldLeft, breakable, plan.breakable !== undefined);
    if (placed) {
      ({ billboard, w } = placed);
      breakable = placed.breakable;
    }
  }
  gen.worldRight = worldLeft + w;
  noteMaterial(gen, breakable);

  // Motion path: "rise" starts lower and comes up to y; "crumble" starts at y and sinks.
  const amp = motion === "none" ? 0 : 18 + 44 * (0.35 + 0.65 * d) * Math.random();
  const fromY = motion === "rise" ? clamp(y + amp, 160, ROOF_Y_BOTTOM) : y;
  const toY = motion === "crumble" ? clamp(y + amp, 160, ROOF_Y_BOTTOM) : y;

  // Some breakable crumbling roofs fall away completely while Bob is in the air.
  const breakChance = breakable && motion === "crumble" ? 0.16 + 0.22 * d : 0;
  const breakArmed = !billboard && !prev.breakArmed && Math.random() < breakChance;

  state.platforms.push(makeRoof({
    x: lastRight + gap,
    y: fromY,
    w,
    baseY: y,
    breakable,
    motion,
    motionRate: motion === "none" ? 0 : 0.65 + 0.95 * Math.random(),
    motionFromY: fromY,
    motionToY: toY,
    breakArmed,
    breakDelay: breakArmed ? 0.22 + 0.32 * Math.random() : 0,
    lowSpawnBreak: breakable && !billboard && y >= LOW_BREAK_Y,
    billboard,
    challenge: plan.challenge || null,
  }));
}

// ---------------- planning ahead ----------------
// At most one plan starts per roof: a breather, then a challenge gap, then a pattern.
function planAhead(state, d, late, prevY, lastRight) {
  const gen = state.gen;
  const at = gen.worldRight;

  if (at >= gen.breatherAt && d >= 0.3 && gen.streak >= 0) {
    gen.breatherAt = at + randRange(BREATHER_SPACING[0], BREATHER_SPACING[1]);
    queueBreather(gen, prevY);
    return;
  }

  if (at >= gen.challengeAt) {
    const chance = lerp(CHALLENGE_CHANCE_EASY, CHALLENGE_CHANCE_HARD, d) + LATE_CHALLENGE_EXTRA * late;
    if (Math.random() < chance && queueChallenge(state, d, late, prevY, lastRight)) {
      gen.challengeAt = at + randRange(CHALLENGE_SPACING[0], CHALLENGE_SPACING[1]);
      return;
    }
  }

  if (at >= gen.patternAt && d >= 0.15) {
    gen.patternAt = at + randRange(PATTERN_SPACING[0], PATTERN_SPACING[1]);
    if (d >= 0.3 && Math.random() < 0.5) queueStairs(gen, prevY);
    else queueHops(gen, prevY);
  }
}

// Two wide, solid, still roofs with short gaps and nothing on them.
function queueBreather(gen, prevY) {
  const y = clamp(prevY + (Math.random() < 0.5 ? 0 : 30), ROOF_Y_TOP, ROOF_Y_BOTTOM);
  for (let i = 0; i < 2; i++) {
    gen.queue.push({
      gap: randRange(GAP_MIN, 100), y, w: randRange(320, 400),
      still: true, noBillboard: true, breakable: false,
    });
  }
}

// Three roofs, each one step up (or down when there's no room above).
function queueStairs(gen, prevY) {
  const dir = prevY - 3 * 40 >= ROOF_Y_TOP ? -1 : 1;
  let y = prevY;
  for (let i = 0; i < 3; i++) {
    y = clamp(y + dir * randRange(28, 40), ROOF_Y_TOP, ROOF_Y_BOTTOM);
    gen.queue.push({ gap: randRange(70, 110), y, w: randRange(170, 230), still: true, noBillboard: true });
  }
}

// Four short roofs with short gaps: hop, hop, hop, hop.
function queueHops(gen, prevY) {
  for (let i = 0; i < 4; i++) {
    const y = clamp(prevY + randRange(-10, 10), ROOF_Y_TOP, ROOF_Y_BOTTOM);
    gen.queue.push({ gap: randRange(GAP_MIN, 85), y, w: randRange(110, 140), still: true, noBillboard: true });
  }
}

// A challenge gap, if one fits here at the current speed. Returns whether one was queued.
function queueChallenge(state, d, late, prevY, lastRight) {
  const ahead = lastRight - PLAYER_X;
  const tryLedge = d >= DIVE_LEDGE_FROM && Math.random() < 0.5;
  return (tryLedge && queueDiveLedge(state, prevY, ahead)) || queueLongGap(state, late, prevY, ahead);
}

// Too far for any single jump (coyote time included) even at the fastest Bob can arrive,
// but well within a double jump or a slowfall jump at the slowest.
function queueLongGap(state, late, prevY, ahead) {
  const y = clamp(prevY + randRange(0, 30), ROOF_Y_TOP, ROOF_Y_BOTTOM);
  const drop = y - prevY;
  const vSlow = slowSpeed(state);
  const lo = LONG_GAP_MARGIN * plainJumpMax(fastSpeed(state, ahead), drop);
  const hi = LONG_GAP_FAIR * Math.min(doubleJumpMax(vSlow, drop), slowfallReach(vSlow, drop));
  if (lo > hi) return false;
  state.gen.queue.push({
    gap: lerp(lo, hi, randRange(0.1, 0.4 + 0.5 * late)), y, w: randRange(220, 320),
    exact: true, still: true, noBillboard: true, challenge: "long",
  });
  return true;
}

// A low, narrow, solid ledge: rolling off falls short of it, a plain jump at the edge overshoots it
// (into the gap after it, which the overshooting arc can't reach), and a dive lands on it.
function queueDiveLedge(state, prevY, ahead) {
  const gen = state.gen;
  if (!materialAllowed(gen, false)) return false; // the ledge is solid
  const y = clamp(prevY + randRange(110, 170), ROOF_Y_TOP, ROOF_Y_BOTTOM);
  const drop = y - prevY;
  if (drop < 100) return false;

  const vSlow = slowSpeed(state);
  const vFast = fastSpeed(state, ahead);
  const near = 1.12 * rollReach(vFast, drop);              // the ledge's left edge, past the takeoff edge
  const w = Math.min(randRange(90, 120), edgeJumpReach(vSlow, drop) - PLAYER_W - near - 8);
  if (w < 70) return false;                                 // too slow for a fair ledge yet
  const far = near + w;
  if (diveWindow(vSlow, drop, near, far) < DIVE_WINDOW_MIN_SEC) return false;
  if (diveWindow(vFast, drop, near, far) < DIVE_WINDOW_MIN_SEC) return false;

  // The climb out: a plain jump from the ledge clears it, but an arc that overshot the ledge
  // comes down in the gap before it.
  const up = randRange(30, 60);
  const nextY = y - up;
  const minGap2 = plainJumpMax(vFast, nextY - prevY) - far + 12;
  const maxGap2 = FAIR_GAP_FRAC * edgeJumpReach(vSlow, -up);
  if (minGap2 > maxGap2) return false;

  gen.queue.push({ gap: near, y, w, exact: true, still: true, noBillboard: true, breakable: false, challenge: "ledge" });
  gen.queue.push({
    gap: randRange(Math.max(minGap2, GAP_MIN), maxGap2), y: nextY, w: randRange(200, 300),
    exact: true, still: true, noBillboard: true,
  });
  return true;
}

// ---------------- billboards ----------------
// Billboards are placed by distance along the level, not by roof count, so they don't fall into a
// fixed rhythm. The gap to the next one shrinks with difficulty. The first three teach one lesson
// each (BILLBOARD_INTRO); after that the kind is a weighted pick that leans toward low billboards as
// the run gets harder, with the kind just used damped so the same kind rarely repeats. Glass goes on
// breakable roofs and steel on solid ones, so a billboard that would break the three-in-a-row rule
// (or clash with a planned roof's material) waits for the next roof, as it does on moving and
// planned roofs.

function pickBillboardKind(gen, d) {
  if (gen.bbCount < BILLBOARD_INTRO.length) return BILLBOARD_INTRO[gen.bbCount];
  const kinds = Object.keys(BILLBOARD_WEIGHTS_EASY);
  const weights = kinds.map((kind) => {
    const wt = lerp(BILLBOARD_WEIGHTS_EASY[kind], BILLBOARD_WEIGHTS_HARD[kind], d);
    return kind === gen.bbLastKind ? wt * BILLBOARD_REPEAT_DAMP : wt;
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) {
    r -= weights[i];
    if (r <= 0) return kinds[i];
  }
  return "high-glass";
}

// Returns { billboard, w, breakable } for a roof at y (w may grow to fit a low billboard), or null.
function placeBillboard(state, d, late, w, y, worldLeft, breakable, materialForced) {
  const gen = state.gen;
  const kind = pickBillboardKind(gen, d);
  const glass = kind.endsWith("glass");
  if (materialForced ? glass !== breakable : !materialAllowed(gen, glass)) return null;

  gen.bbCount += 1;
  gen.bbLastKind = kind;
  gen.bbNextAt = worldLeft + lerpRange(BILLBOARD_SPACING_EASY, BILLBOARD_SPACING_HARD, d) * (1 - LATE_BILLBOARD_SQUEEZE * late);

  const common = { reinforced: !glass, duckLeadSec: -1, resolved: false, broken: false, hit: false, breaking: false, breakT: 0 };
  if (kind.startsWith("low")) {
    // Hangs at head height: duck under (hold S), or double jump over. Much taller than a high one
    // (so a single jump can't clear it), shortened on the highest roofs so its top stays on screen.
    // Kept toward the right of the roof, after a run-up to land and react, which grows with speed.
    const LOW_W = 110;
    const LOW_CLEAR = 27; // roof -> billboard bottom (standing collides, ducking clears)
    const lead = clamp((state.speed || SPEED_START) * LOW_BILLBOARD_LEAD_SEC, 110, 200);
    const h = Math.min(160, y - LOW_CLEAR - 12);
    const minW = lead + LOW_W + 6;
    if (w < minW) w = minW + 40 * Math.random();
    return {
      w,
      breakable: glass,
      billboard: { ...common, offsetX: lead + (w - lead - LOW_W - 6) * Math.random(), offsetY: h + LOW_CLEAR, w: LOW_W, h, low: true },
    };
  }

  // High: above head height (Bob rolls under it), with 25-50 px of headroom, and its top kept at
  // least 12 px below the top of the screen.
  const bw = clamp(160, 70, Math.max(70, w - 24));
  const bh = 96;
  const pad = Math.max(8, Math.floor((w - bw) * 0.08));
  const offsetY = Math.min(bh + PLAYER_H + randRange(25, 50), y - 12);
  return {
    w,
    breakable: glass,
    billboard: {
      ...common,
      offsetX: clamp(pad + (w - bw - pad * 2) * Math.random(), 6, Math.max(6, w - bw - 6)),
      offsetY,
      w: bw,
      h: bh,
    },
  };
}
