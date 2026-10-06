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
import { clamp, easeOutCubic } from "../shared/math.js";

function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
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

  // Arm targets Bob's torso; base hides off-screen to the left relative to current focus.
  const baseX = (Number.isFinite(focusX) ? focusX : snap.x) - world.INTERNAL_WIDTH * 0.7;
  const baseY = snap.y + snap.h * 0.22;

  const targetX = snap.x + snap.w * -0.02;
  const targetY = snap.y + snap.h * 0.38;

  const reachX = baseX + (targetX - baseX) * reachK;
  const reachY = baseY + (targetY - baseY) * reachK;

  const dragDistance = -(snap.x + snap.w * 2.5 + 520);
  const dragOffsetX = dragDistance * dragK;

  const tipX = reachX + dragOffsetX - retractK * 70;
  const tipY = reachY - dragK * 8 - retractK * 6;

  const bobOffsetX = dragOffsetX;
  const bobAlpha = clamp(1 - 0.65 * retractK, 0, 1);

  const bobTilt = Math.PI / 2;
  const bobLift = 0;
  const bobScale = 1;

  const gripK = clamp(reachK * 0.9 + dragK * 0.6, 0, 1);

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

  const baseX = (Number.isFinite(focusX) ? focusX : snap.x) - world.INTERNAL_WIDTH * 0.75;
  const baseY = snap.y + snap.h * 0.28;

  const targetX = snap.x + snap.w * 0.05;
  const targetY = snap.y + snap.h * 0.45;

  const reachX = baseX + (targetX - baseX) * reachK;
  const reachY = baseY + (targetY - baseY) * reachK;

  const pushDist = snap.x + snap.w + 120;
  const bobOffsetX = -pushDist + pushDist * pushK;

  const retractOffset = -retractK * (world.INTERNAL_WIDTH * 0.55);
  const tipX = reachX + bobOffsetX + retractOffset;
  const tipY = reachY;

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
      gripK: 0,
      alpha: armAlpha,
    },
  };
}
