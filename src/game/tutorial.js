// src/game/tutorial.js
// TRAINING: a fixed course, started from the start screen (the TRAINING button, T, or
// index.html?tutorial), that teaches one move per lesson at a steady speed.
//
// Each lesson runs from a runway roof, over the gap or past the ad that needs its move, to a goal
// roof, which is also the next lesson's runway. Landing on the goal after doing the move clears the
// lesson. Falling, crashing into an ad, or reaching the goal without the move rebuilds the course
// from a fresh runway before that lesson: no death cinematic, and nothing goes to the leaderboard.
// After the last lesson, TRAINING COMPLETE shows, then the screen glitches back to the start screen.
//
// The whole course is built up front (game/platforms.js spawns no random roofs during training).
// Gaps are sized with game/reach.js at the training speed (SPEED_START):
//   jump 120 (one jump reaches ~200), double jump / slowfall 280 (one jump ~240, a double jump or
//   slowfall ~370). The dive drop is forgiving: any dive lands. Ducking, the dash and the backflip
//   aren't forced by the roofs, so every lesson checks its move was done.

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

// key/action: the prompt on a keyboard; tap/tapAction: on a touch screen (the mobile button names).
// roofs: after the runway, in order; the last one is the goal. ad: "steel" | "glass" on the goal.
// did(state): the lesson's move is happening this step.
export const LESSONS = [
  {
    key: "SPACE", action: "TO JUMP THE GAP",
    tap: "TAP", tapAction: "TO JUMP THE GAP",
    why: "THE GROUND IS LETHAL",
    roofs: [{ gap: 120, y: 300, w: GOAL_W }],
    did: (state) => !state.player.onGround && state.player.jumpsRemaining < 2,
  },
  {
    key: "SPACE", action: "AGAIN IN THE AIR: DOUBLE JUMP",
    tap: "TAP", tapAction: "AGAIN IN THE AIR: DOUBLE JUMP",
    why: "TOO FAR FOR ONE JUMP",
    roofs: [{ gap: 280, y: 285, w: GOAL_W }],
    did: (state) => !state.player.onGround && state.player.jumpsRemaining === 0,
  },
  {
    key: "W", action: "JUMP, THEN HOLD TO SLOWFALL",
    tap: "SLOWFALL", tapAction: "JUMP, THEN HOLD",
    why: "FALL SLOWER, FLY FARTHER",
    roofs: [{ gap: 280, y: 290, w: GOAL_W }],
    did: (state) => !state.player.onGround && state.slowfallHeld === true && !state.player.diving,
  },
  {
    key: "S", action: "HOLD TO DUCK UNDER THE AD",
    tap: "DUCK/DIVE", tapAction: "HOLD TO DUCK UNDER THE AD",
    why: "STEEL ADS DON'T BREAK",
    roofs: [{ gap: 100, y: 270, w: AD_X + 110 + AD_RUNOUT, ad: "steel" }],
    did: (state) => state.player.onGround && state.player.ducking === true,
  },
  {
    key: "D", action: "DASH THROUGH THE GLASS",
    tap: "DASH", tapAction: "DASH THROUGH THE GLASS",
    why: "GLASS ADS SHATTER",
    roofs: [{ gap: 100, y: 250, w: AD_X + 110 + DASH_RUNOUT, ad: "glass" }],
    did: (state) => state.platforms.some((plat) => plat.trainingGoal === state.tutorial.lesson && plat.billboard?.broken),
  },
  {
    key: "S", action: "IN THE AIR TO DIVE",
    tap: "DUCK/DIVE", tapAction: "IN THE AIR TO DIVE",
    why: "DROP FAST ONTO LOW ROOFS",
    roofs: [{ gap: 80, y: 345, w: GOAL_W }],
    did: (state) => state.player.diving === true,
  },
  {
    key: "A", action: "IN THE AIR TO BACKFLIP",
    tap: "BACKFLIP", tapAction: "IN THE AIR",
    why: "FLIPS MULTIPLY A JUMP'S POINTS",
    roofs: [{ gap: 130, y: 320, w: FINAL_W }],
    did: (state) => state.player.spinning === true && state.player.trickKind === "flip",
  },
];

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
    moveDone: false,    // its move has been done since its runway
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

  tut.moveDone = false;
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

  if (!tut.moveDone && LESSONS[tut.lesson].did(state)) tut.moveDone = true;

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
