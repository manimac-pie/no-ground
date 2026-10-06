// src/game/reach.js
// How far Bob gets across a gap, for the level generator (game/generator.js).
//
// Each function steps the same vertical physics as game/player.js, at the game's fixed 60 Hz step,
// while the world scrolls at a constant `speed`. It returns how far Bob's FRONT has travelled past
// the takeoff edge when his feet come down to a roof `drop` px below the takeoff roof (negative:
// a higher roof). Bob stays on a roof while any part of him overlaps it, so he leaves it with his
// back at the edge, and he lands on the next one if his front is past its left edge by then.
//
// Assumes the jump key is held (full-height jumps) and no dash. Returns 0 if Bob can't get that high.

import {
  COYOTE_TIME_SEC,
  DIVE_ANTICIPATION_SEC,
  DIVE_GRAVITY_MULT,
  DIVE_MAX_FALL_SPEED,
  FALL_GRAVITY_MULT,
  GRAVITY,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  PLAYER_W,
  SLOWFALL_FUEL_MAX,
  SLOWFALL_GRAVITY_MULT,
} from "./constants.js";
import { smoothstep01 } from "../shared/math.js";

const DT = 1 / 60;
const MAX_STEPS = 240; // 4 s in the air is far more than any jump lasts

// One flight. plan: jumps (times of presses after leaving the edge; 0 = a jump right at the edge),
// slowfallFrom (hold W from this time until the fuel runs out), diveAt (press S at this time).
// Returns the reach at the LAST time the feet come down through the roof's height: Bob can dip below
// it over the gap (falling in coyote time, or before a double jump) and still land after jumping again.
function flight(speed, drop, plan) {
  let y = 0;
  let vy = 0;
  let jumpsLeft = 2;
  let fuel = SLOWFALL_FUEL_MAX;
  let diveT = -1;
  const presses = plan.jumps || [];
  let next = 0;
  let reach = 0;

  for (let step = 1; step <= MAX_STEPS; step++) {
    const t = step * DT;
    // A press made during the previous step: the first jump only within coyote time.
    while (next < presses.length && presses[next] < t) {
      const at = presses[next++];
      if (jumpsLeft === 2 ? at <= COYOTE_TIME_SEC : jumpsLeft > 0) {
        vy = JUMP_VELOCITY;
        jumpsLeft--;
      }
    }
    if (plan.diveAt != null && diveT < 0 && t > plan.diveAt) diveT = 0;

    let g = GRAVITY;
    let maxFall = MAX_FALL_SPEED;
    if (vy > 0) g *= FALL_GRAVITY_MULT;
    if (plan.slowfallFrom != null && t > plan.slowfallFrom && diveT < 0 && fuel > 0) {
      g *= SLOWFALL_GRAVITY_MULT;
      fuel -= DT;
    }
    if (diveT >= 0) {
      const blend = smoothstep01(diveT / DIVE_ANTICIPATION_SEC);
      g *= 1 + (DIVE_GRAVITY_MULT - 1) * blend;
      maxFall = MAX_FALL_SPEED + (DIVE_MAX_FALL_SPEED - MAX_FALL_SPEED) * blend;
      diveT += DT;
    }

    const prevY = y;
    vy = Math.min(vy + g * DT, maxFall);
    y += vy * DT;
    if (vy > 0 && prevY < drop && y >= drop) reach = speed * t + PLAYER_W;
    if (y > drop + 200 && next >= presses.length) break; // far below the roof with no jumps left to use
  }
  return reach;
}

// Rolling off the edge without jumping.
export function rollReach(speed, drop) {
  return drop > 0 ? flight(speed, drop, {}) : 0;
}

// A single full jump right at the edge: what most players do.
export function edgeJumpReach(speed, drop) {
  return flight(speed, drop, { jumps: [0] });
}

// The farthest a single jump can go, including jumping late in coyote time.
export function plainJumpMax(speed, drop) {
  let best = 0;
  for (let at = 0; at <= COYOTE_TIME_SEC + 1e-9; at += DT) {
    best = Math.max(best, flight(speed, drop, { jumps: [at] }));
  }
  return best;
}

// A double jump with the second press at its best moment.
export function doubleJumpMax(speed, drop) {
  let best = 0;
  for (let at = DT; at <= 0.9; at += 2 * DT) {
    best = Math.max(best, flight(speed, drop, { jumps: [0, at] }));
  }
  return best;
}

// A jump with W held from takeoff (a full tank of slowfall).
export function slowfallReach(speed, drop) {
  return flight(speed, drop, { jumps: [0], slowfallFrom: 0 });
}

// How long a window there is to press S after an edge jump and come down with Bob overlapping
// [near, far] (front distances past the edge). Seconds; 0 if no dive timing lands there.
export function diveWindow(speed, drop, near, far) {
  let first = -1;
  let last = -1;
  for (let at = 0; at <= 1.2; at += DT) {
    const front = flight(speed, drop, { jumps: [0], diveAt: at });
    if (front > near && front - PLAYER_W < far) {
      if (first < 0) first = at;
      last = at;
    }
  }
  return first < 0 ? 0 : last - first + DT;
}
