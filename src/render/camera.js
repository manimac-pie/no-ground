// src/render/camera.js
// Camera moves: the death cinematic zoom and the start-screen push.
// They return numbers; nothing is drawn here.

import {
  DEATH_CINEMATIC,
  DEATH_CINEMATIC_TOTAL,
  START_PUSH,
  START_PUSH_TOTAL,
  world,
} from "../game/constants.js";
import { clamp, easeOutCubic, smoothstep01 } from "../shared/math.js";
import { torsoShape } from "./player/body.js";

// Bob falling back after hitting a billboard he couldn't break (render/index.js draws it).
const BILLBOARD_FALL_SEC = 0.35;
const BILLBOARD_FALL_TILT = -Math.PI / 2;
const BILLBOARD_FALL_X = -18;
const BILLBOARD_FALL_LIFT = -4;

// On a crash Bob topples onto his side this fast, as the wheel pops off.
const DEATH_TOPPLE_SEC = 0.18;
// Gap between Bob and the claw's palm, and how much of his length the jaws cover.
const CLAW_PALM_GAP = 2;
const CLAW_JAW_REACH = 0.7;

function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// 0 → 1 as Bob falls back off a billboard he couldn't break.
export function billboardFallK(player) {
  if (!player || player.billboardDeath !== true) return 0;
  const t = clamp((player.billboardDeathT || 0) / BILLBOARD_FALL_SEC, 0, 1);
  return 1 - Math.pow(1 - t, 2);
}

// The billboard fall-back pose at k (0..1): tilt, x offset and lift.
export function billboardFallPose(k) {
  return { tilt: BILLBOARD_FALL_TILT * k, x: BILLBOARD_FALL_X * k, lift: BILLBOARD_FALL_LIFT * k };
}

// Where the claw grips Bob: his body capsule (render/player/body.js) as a box in the world, for Bob
// drawn at tilt (0 upright, ±90° on his side) around his hitbox centre (cx, cy).
// Returns the palm's spot on his back end and the jaw size that fits him.
function clawGrip(snap, cx, cy, tilt) {
  const torso = torsoShape(snap.w, snap.h);
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  // The capsule's centre sits torso.centerY above the hitbox centre; turn that offset with him.
  const torsoX = cx - torso.centerY * sin;
  const torsoY = cy + torso.centerY * cos;
  const halfX = Math.abs(cos) * torso.w / 2 + Math.abs(sin) * torso.h / 2;
  const halfY = Math.abs(sin) * torso.w / 2 + Math.abs(cos) * torso.h / 2;
  return {
    x: torsoX - halfX - CLAW_PALM_GAP,
    y: torsoY,
    jawLen: halfX * 2 * CLAW_JAW_REACH + CLAW_PALM_GAP,
    jawGap: halfY + 0.5,
  };
}

export function computeDeathCinematic(state, focusX) {
  if (!state || (!state.deathCinematicActive && !state.deathCinematicDone)) return null;

  const snap = state.deathSnapshot || state.player;
  if (!snap) return null;

  const t = clamp(state.deathCinematicT || 0, 0, DEATH_CINEMATIC_TOTAL);

  const reachKRaw =
    (t - DEATH_CINEMATIC.ARM_DELAY) /
    Math.max(0.001, DEATH_CINEMATIC.ARM_REACH);
  const dragKRaw =
    (t - DEATH_CINEMATIC.ARM_DELAY - DEATH_CINEMATIC.ARM_REACH) /
    Math.max(0.001, DEATH_CINEMATIC.DRAG);
  const retractKRaw =
    (t -
      DEATH_CINEMATIC.ARM_DELAY -
      DEATH_CINEMATIC.ARM_REACH -
      DEATH_CINEMATIC.DRAG) /
    Math.max(0.001, DEATH_CINEMATIC.ARM_RETRACT);

  const reachK = easeOutCubic(reachKRaw);
  const dragK = easeInOutCubic(dragKRaw);
  const retractK = easeOutCubic(retractKRaw);

  const zoomBoost = 1.25 * easeOutCubic(
    DEATH_CINEMATIC.ZOOM_IN > 0
      ? t / DEATH_CINEMATIC.ZOOM_IN
      : 1
  );

  // Bob's pose: he topples onto his side. After a billboard he was already falling back (head
  // first toward the claw), so he finishes that fall instead and drops the lift onto the ground.
  const toppleK = easeOutCubic(t / DEATH_TOPPLE_SEC);
  let bobTilt;
  let poseX = 0;
  let bobLift = 0;
  if (state.player && state.player.billboardDeath === true) {
    const fallK = billboardFallK(state.player);
    const fall = billboardFallPose(fallK + (1 - fallK) * toppleK);
    bobTilt = fall.tilt;
    poseX = fall.x;
    bobLift = billboardFallPose(fallK).lift * (1 - toppleK);
  } else {
    bobTilt = (Math.PI / 2) * toppleK;
  }
  const bobScale = 1;

  // The claw grips his torso. The arm only sets off after he has toppled (ARM_DELAY > DEATH_TOPPLE_SEC).
  const grip = clawGrip(snap, snap.x + snap.w / 2 + poseX, snap.y + snap.h / 2 + bobLift, bobTilt);

  // Base hides off-screen to the left relative to current focus.
  const baseX = (Number.isFinite(focusX) ? focusX : snap.x) - world.INTERNAL_WIDTH * 0.7;
  const baseY = grip.y - snap.h * 0.16;

  const reachX = baseX + (grip.x - baseX) * reachK;
  const reachY = baseY + (grip.y - baseY) * reachK;

  // Bob moves with the claw once it has him: dragged off, then pulled back with the arm.
  const dragDistance = -(snap.x + snap.w * 2.5 + 520);
  const holdOffsetX = dragDistance * dragK - retractK * 70;

  const tipX = reachX + holdOffsetX;
  const tipY = reachY;

  const bobOffsetX = poseX + holdOffsetX;
  const bobAlpha = clamp(1 - 0.65 * retractK, 0, 1);

  // Jaws open on the way in and close as the palm reaches him.
  const gripK = smoothstep01(clamp((reachKRaw - 0.7) / 0.3, 0, 1));

  const armAlpha = clamp(1 - 0.7 * retractK, 0, 1);

  return {
    active: state.deathCinematicActive === true,
    t,
    snap,
    zoomBoost,
    bobOffsetX,
    bobAlpha,
    bobTilt,
    bobLift,
    bobScale,
    arm: {
      baseX,
      baseY,
      tipX,
      tipY,
      reachK,
      dragK,
      retractK,
      gripK,
      jawLen: grip.jawLen,
      jawGap: grip.jawGap,
      alpha: armAlpha,
    },
  };
}

export function computeStartPush(state, focusX) {
  if (!state) return null;
  if (state.running || state.gameOver || state.menuZooming) return null;
  if (!(state.startReady === true)) return null;
  if ((state.menuZoomK ?? 0) > 0.001) return null;

  const snap = state.player;
  if (!snap) return null;

  const t = clamp(state.startPushT || 0, 0, START_PUSH_TOTAL);
  const reachKRaw =
    (t - START_PUSH.ARM_DELAY) /
    Math.max(0.001, START_PUSH.ARM_REACH);
  const pushKRaw =
    (t - START_PUSH.ARM_DELAY - START_PUSH.ARM_REACH) /
    Math.max(0.001, START_PUSH.PUSH);
  const retractKRaw =
    (t -
      START_PUSH.ARM_DELAY -
      START_PUSH.ARM_REACH -
      START_PUSH.PUSH) /
    Math.max(0.001, START_PUSH.ARM_RETRACT);

  const reachK = easeOutCubic(reachKRaw);
  const pushK = easeInOutCubic(pushKRaw);
  const retractK = easeInOutCubic(retractKRaw);

  // The claw carries Bob in upright by his torso, then lets go and pulls away.
  const grip = clawGrip(snap, snap.x + snap.w / 2, snap.y + snap.h / 2, 0);

  const baseX = (Number.isFinite(focusX) ? focusX : snap.x) - world.INTERNAL_WIDTH * 0.75;
  const baseY = snap.y + snap.h * 0.28;

  const reachX = baseX + (grip.x - baseX) * reachK;
  const reachY = baseY + (grip.y - baseY) * reachK;

  const pushDist = snap.x + snap.w + 120;
  const bobOffsetX = -pushDist + pushDist * pushK;

  const retractOffset = -retractK * (world.INTERNAL_WIDTH * 0.55);
  const tipX = reachX + bobOffsetX + retractOffset;
  const tipY = reachY;
  const gripK = 1 - smoothstep01(clamp(retractKRaw * 4, 0, 1));

  const armAlpha = 1;
  const baseXFinal = baseX + retractOffset;
  const armOffscreen = Math.max(baseXFinal, tipX) < -120;

  return {
    active: t > 0 && t < START_PUSH_TOTAL,
    done: t >= START_PUSH_TOTAL - 0.001,
    t,
    snap,
    bobOffsetX,
    offscreen: armOffscreen,
    arm: {
      baseX: baseXFinal,
      baseY,
      tipX,
      tipY,
      reachK,
      dragK: 0,
      retractK,
      gripK,
      jawLen: grip.jawLen,
      jawGap: grip.jawGap,
      alpha: armAlpha,
    },
  };
}
