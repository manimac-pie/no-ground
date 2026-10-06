// src/game/tutorial.js
// TRAINING: a fixed course, started from the start screen (the TRAINING button, or
// index.html?tutorial), that teaches one move per lesson at a steady speed.
//
// Each lesson runs from a runway roof, over the gap or past the ad that needs its move, to a goal
// roof, which is also the next lesson's runway. A lesson is a few steps (jump, then the new move).
// When a step's moment comes (the edge of the roof, the top of the jump, the ad just ahead), the game
// stops and waits until the player gives that step's input, then carries on with it.
// Landing on the goal with every step done clears the lesson. Falling, crashing into an ad, or
// reaching the goal without the move (say, jumping over the ad instead of ducking) rebuilds the course
// from a fresh runway before that lesson: no death cinematic, and nothing goes to the leaderboard.
// After the last lesson, TRAINING COMPLETE shows, then the screen glitches back to the start screen.
//
// The whole course is built up front (game/platforms.js spawns no random roofs during training).
// Gaps are sized with game/reach.js at the training speed (SPEED_START):
//   jump 120 (one jump reaches ~200), double jump / slowfall 280 (one jump ~240, a double jump or
//   slowfall ~370). The dive drop is forgiving: any dive lands.

import { GROUND_Y, PLAYER_X, SAFE_CLEARANCE } from "./constants.js";
import { makeRoof } from "./generator.js";
import { loseAir } from "./score.js";
import { resetPlayer } from "./state.js";
import { saveTrainingDone } from "../ui/training.js";

// Roof lengths leave about 1.5 s to read each prompt before its gap (checked by playing it through).
const START_RUNWAY = 760;    // starter roof ahead of Bob (~2.8 s, the zoom-out and HUD slide-in included)
const RETRY_RUNWAY = 560;    // fresh roof ahead of Bob after a retry (~2.1 s)
const GOAL_W = 800;          // a goal roof is the next lesson's runway (~3 s)
const AD_X = 330;            // a lesson's ad stands this far into its roof (~1 s after landing)
const AD_RUNOUT = 720;       // the roof runs on past its ad as the next runway...
const DASH_RUNOUT = 1000;    // ...longer after the glass, which Bob reaches at dash speed
const FINAL_W = 2600;        // the last roof outlasts the finish and the reset glitch
export const CLEAR_FLASH_SEC = 0.6; // CLEAR shows this long before the next prompt
const FINISH_HOLD_SEC = 2.4; // TRAINING COMPLETE stays up this long before the reset glitch

// A low ad at head height (duck under it, or dash through glass), as in game/generator.js.
function lowAd(roofY, glass) {
  const LOW_W = 110;
  const LOW_CLEAR = 27;
  const h = Math.min(160, roofY - LOW_CLEAR - 12);
  return {
    reinforced: !glass, duckLeadSec: -1, resolved: false, broken: false, hit: false, breaking: false, breakT: 0,
    offsetX: AD_X, offsetY: h + LOW_CLEAR, w: LOW_W, h, low: true,
  };
}

// Where Bob is against the current lesson's roofs.
function onRunwayEdge(state) {
  const p = state.player;
  const plat = p.onGround ? p.groundPlat : null;
  if (!plat || plat.trainingGoal === state.tutorial.lesson) return false;
  // At most one step's travel from leaving the roof, so even at dash speed it can't be skipped.
  return plat.x + plat.w - p.x <= Math.max(10, state.speed / 60 + 4);
}

function adAhead(state) {
  const p = state.player;
  for (const plat of state.platforms) {
    const b = plat.billboard;
    if (plat.trainingGoal === state.tutorial.lesson && b && !b.resolved) return plat.x + b.offsetX - (p.x + p.w);
  }
  return Infinity;
}

const airborne = (state) => !state.player.onGround && state.player.billboardDeath !== true;

// A step: key/action is the prompt on a keyboard, tap/tapAction on a touch screen (the mobile button
// names). need: the input that carries on after the stop ("jump" | "dash" | "dive" | "trick" presses,
// "slowfall" | "duck" holds). stopAt(state): the moment to stop. done(state): the step happened.
const JUMP_STEP = {
  key: "SPACE", action: "JUMP", tap: "TAP", tapAction: "JUMP", need: "jump",
  stopAt: onRunwayEdge,
  done: (state) => airborne(state) && state.player.jumpsRemaining < 2,
};

// roofs: after the runway, in order; the last one is the goal. ad: "steel" | "glass" on the goal.
export const LESSONS = [
  {
    why: "THE GROUND IS LETHAL",
    steps: [{ ...JUMP_STEP, action: "JUMP THE GAP", tapAction: "JUMP THE GAP" }],
    roofs: [{ gap: 120, y: 300, w: GOAL_W }],
  },
  {
    why: "TOO FAR FOR ONE JUMP",
    steps: [JUMP_STEP, {
      key: "SPACE", action: "AGAIN IN THE AIR: DOUBLE JUMP", tap: "TAP", tapAction: "AGAIN: DOUBLE JUMP", need: "jump",
      stopAt: (state) => airborne(state) && state.player.vy >= 0,
      done: (state) => airborne(state) && state.player.jumpsRemaining === 0,
    }],
    roofs: [{ gap: 280, y: 285, w: GOAL_W }],
  },
  {
    why: "FALL SLOWER, FLY FARTHER",
    steps: [JUMP_STEP, {
      key: "W", action: "HOLD TO SLOWFALL", tap: "SLOWFALL", tapAction: "HOLD", need: "slowfall",
      stopAt: (state) => airborne(state) && state.player.vy > -400, // once the jump is visibly underway
      done: (state) => airborne(state) && state.slowfallHeld === true && !state.player.diving,
    }],
    roofs: [{ gap: 280, y: 290, w: GOAL_W }],
  },
  {
    why: "STEEL ADS DON'T BREAK",
    steps: [JUMP_STEP, {
      key: "S", action: "HOLD TO DUCK UNDER THE AD", tap: "DUCK/DIVE", tapAction: "HOLD TO DUCK", need: "duck",
      stopAt: (state) => state.player.onGround && adAhead(state) <= 70,
      done: (state) => state.player.onGround && state.player.ducking === true,
    }],
    roofs: [{ gap: 100, y: 270, w: AD_X + 110 + AD_RUNOUT, ad: "steel" }],
  },
  {
    why: "GLASS ADS SHATTER",
    steps: [JUMP_STEP, {
      key: "D", action: "DASH THROUGH THE GLASS", tap: "DASH", tapAction: "THROUGH THE GLASS", need: "dash",
      stopAt: (state) => state.player.onGround && adAhead(state) <= 45,
      done: (state) => state.player.dashAgeSec < 0.05,
    }],
    roofs: [{ gap: 100, y: 250, w: AD_X + 110 + DASH_RUNOUT, ad: "glass" }],
  },
  {
    why: "DROP FAST ONTO LOW ROOFS",
    steps: [JUMP_STEP, {
      key: "S", action: "IN THE AIR TO DIVE", tap: "DUCK/DIVE", tapAction: "IN THE AIR: DIVE", need: "dive",
      stopAt: (state) => airborne(state) && state.player.vy >= 0,
      done: (state) => state.player.diving === true,
    }],
    roofs: [{ gap: 80, y: 345, w: GOAL_W }],
  },
  {
    why: "FLIPS MULTIPLY A JUMP'S POINTS",
    steps: [JUMP_STEP, {
      key: "A", action: "IN THE AIR TO BACKFLIP", tap: "BACKFLIP", tapAction: "IN THE AIR", need: "trick",
      stopAt: (state) => airborne(state) && state.player.vy > -350,
      done: (state) => state.player.spinning === true && state.player.trickKind === "flip",
    }],
    roofs: [{ gap: 130, y: 320, w: FINAL_W }],
  },
];

// The step the prompt shows: the current one, or the last once all are done.
export function currentStep(tut) {
  const steps = LESSONS[tut.lesson].steps;
  return steps[Math.min(tut.step, steps.length - 1)];
}

// The roof Bob starts a lesson from: the starter roof, then each lesson's goal.
function runwayY(lesson) {
  return lesson > 0 ? LESSONS[lesson - 1].roofs.at(-1).y : GROUND_Y - SAFE_CLEARANCE;
}

// Builds lessons `from` to the end, the first gap starting at x.
function buildCourse(state, from, x) {
  for (let i = from; i < LESSONS.length; i++) {
    const roofs = LESSONS[i].roofs;
    roofs.forEach((plan, n) => {
      x += plan.gap;
      const roof = makeRoof({
        x, y: plan.y, w: plan.w,
        billboard: plan.ad ? lowAd(plan.y, plan.ad === "glass") : null,
        seq: state.gen.roofCount++,
      });
      if (n === roofs.length - 1) roof.trainingGoal = i;
      state.platforms.push(roof);
      x += plan.w;
    });
  }
}

// From the start screen: swap the roofs ahead for the course. Bob is still on the starter roof.
export function startTraining(state) {
  const starter = state.platforms[0];
  state.platforms.length = 1;
  starter.w = PLAYER_X - starter.x + START_RUNWAY;
  state.gen.queue.length = 0;
  state.gen.roofCount = 1;
  state.tutorial = {
    lesson: 0,          // the lesson being taught
    step: 0,            // its step being waited for (steps.length once all are done)
    moveDone: false,    // every step done since its runway
    waiting: false,     // stopped until the player gives the step's input
    waitT: 0,           // seconds stopped
    promptT: 0,         // seconds its prompt has been up (negative while CLEAR shows)
    clearT: Infinity,   // seconds since a lesson was cleared
    retryT: Infinity,   // seconds since the last retry
    retries: 0,         // retries of this lesson (the prompt says AGAIN)
    finished: false,
    finishT: 0,
  };
  buildCourse(state, 0, starter.x + starter.w);
}

// Put Bob back on a fresh runway before the current lesson, and rebuild the rest of the course.
export function retryTraining(state) {
  const tut = state.tutorial;
  const p = state.player;
  const y = runwayY(tut.lesson);
  const runway = makeRoof({ x: -200, y, w: PLAYER_X + 200 + RETRY_RUNWAY, seq: state.gen.roofCount++ });
  state.platforms.length = 0;
  state.platforms.push(runway);
  buildCourse(state, tut.lesson, runway.x + runway.w);

  resetPlayer(p);
  p.y = y - p.h;
  p.groundPlat = runway;
  p.contactSeq = runway.seq;
  loseAir(state);
  state.combo = 0;
  state.speedImpulse = 0;
  state.jumpBuffer = 0;
  state.heavyLandT = 0;

  tut.step = 0;
  tut.moveDone = false;
  tut.waiting = false;
  tut.promptT = 0;
  tut.clearT = Infinity;
  tut.retryT = 0;
  tut.retries += 1;
}

// Each step of a training run, after Bob has moved. Returns true once TRAINING COMPLETE has had
// its time on screen: the caller then glitches back to the start screen.
export function updateTraining(state, dt) {
  const tut = state.tutorial;
  tut.promptT += dt;
  tut.clearT += dt;
  tut.retryT += dt;
  if (tut.finished) {
    tut.finishT += dt;
    return tut.finishT >= FINISH_HOLD_SEC;
  }

  // Steps happen in order; the next one stops the game when its moment comes.
  const steps = LESSONS[tut.lesson].steps;
  while (tut.step < steps.length && steps[tut.step].done(state)) {
    tut.step += 1;
    if (tut.step < steps.length) tut.promptT = 0; // the next step's prompt fades in
  }
  tut.moveDone = tut.step >= steps.length;
  if (!tut.moveDone && steps[tut.step].stopAt(state)) {
    tut.waiting = true;
    tut.waitT = 0;
  }

  // On the goal, and past its ad if it has one.
  const p = state.player;
  const goal = p.onGround && !p.billboardDeath ? p.groundPlat : null;
  if (!goal || goal.trainingGoal !== tut.lesson) return false;
  if (goal.billboard && !goal.billboard.resolved) return false;

  if (!tut.moveDone) {
    retryTraining(state);
    return false;
  }
  tut.lesson += 1;
  tut.step = 0;
  tut.moveDone = false;
  tut.promptT = -CLEAR_FLASH_SEC;
  tut.clearT = 0;
  tut.retries = 0;
  if (tut.lesson >= LESSONS.length) {
    tut.finished = true;
    tut.finishT = 0;
    saveTrainingDone();
  }
  return false;
}

// Each update while stopped, before anything moves. Presses are used up here; returns "wait" while
// still stopped, or the input that ended the stop (the step's `need`, for update() to carry out),
// or "" when not stopped.
export function waitForMove(state, dt, input) {
  const tut = state.tutorial;
  if (!tut || !tut.waiting) return "";
  tut.waitT += dt;
  tut.promptT += dt;
  const jump = input?.consumeJumpPress?.()?.pressed === true;
  input?.consumePointerPressed?.();
  const trick = input?.consumeTrickPressed?.() === true;
  input?.consumeTrickIntent?.();
  const dash = input?.consumeDashPressed?.() === true;
  const dive = input?.consumeDivePressed?.() === true;
  const need = currentStep(tut).need;
  const given =
    need === "jump" ? jump
      : need === "dash" ? dash
        : need === "dive" ? dive
          : need === "trick" ? trick
            : need === "slowfall" ? input?.slowfallHeld === true
              : need === "duck" ? input?.diveHeld === true
                : true;
  if (!given) return "wait";
  tut.waiting = false;
  return need;
}
