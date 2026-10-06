// src/render/index.js
// Single render orchestrator (prevents duplicate draws + state leaks).

import { isSummaryShowing } from "../game/state.js";
import {
  world,
  DASH_MAX_CAM_LAG,
  DASH_CAM_SMOOTH,
  DASH_PARALLAX_CAM_FACTOR,
  PLAYER_W,
  PLAYER_H,
  MENU_START_ZOOM,
  RESET_GLITCH_SEC,
} from "../game/constants.js";

import {
  drawBackground,
  drawParallax,
  drawLethalGround,
  drawBuildingsAndRoofs,
} from "./world/index.js";

import { drawPlayerShadow, drawPlayer } from "./player/index.js";
import { drawDashSparks, drawDashWind, updateDashSparks } from "./player/dashFx.js";
import { drawControlsButton, drawControlsPanel } from "./hud/controls.js";
import { drawRestartFlyby } from "./hud/flyby.js";
import { computeHudDanger, drawDangerVignette, drawHUD, drawScorePopups } from "./hud/hud.js";
import { drawLeaderboardPanel, hasWeeklyLabel, leaderboardPanelHeight, leaderboardRowHeight } from "./hud/leaderboardPanel.js";
import { drawPauseOverlay } from "./hud/pause.js";
import { drawResetGlitch } from "./hud/reset.js";
import { drawCenterScore } from "./hud/summary.js";
import { drawStartPrompt } from "./menu.js";
import { billboardFallK, billboardFallPose, computeDeathCinematic, computeStartPush } from "./camera.js";
import { drawBreakShards, drawDeathDragSparks, drawRobotArm } from "./effects.js";
import { applyViewportTransform, ensureCanvasSize, getCanvasRect, isTouchViewport, resetCtx } from "./viewport.js";
import {
  getControlsButtonRect,
  getControlsPanelRect,
  hitAreas,
  pointInRect,
} from "../ui/layout.js";
import { clamp } from "../shared/math.js";
import { getBoards, getMyBest } from "../leaderboard/state.js";
import { maybePromptForPendingClaim } from "../leaderboard/claimFlow.js";
import { weeklyResetIn } from "../leaderboard/reset.js";

export const COLORS = {
  bgTop: "#0f1116",
  bgBottom: "#07080b",
  fog: "rgba(242,242,242,0.035)",
  accent: "rgba(120,205,255,0.95)",
  platform: "#2a2a2a",
  platformShadow: "rgba(0,0,0,0.22)",
  platformEdge: "rgba(242,242,242,0.12)",
  roofTop: "rgba(56,58,64,0.85)",
  roofSide: "rgba(32,34,40,0.95)",
  roofDetail: "rgba(242,242,242,0.10)",
  warning: "rgba(255,180,70,0.65)",
  gantry: "rgba(20,22,28,0.85)",
  player: "#f2f2f2",
  hudBg: "rgba(0,0,0,0.35)",
  hudText: "#f2f2f2",
  overlay: "rgba(0,0,0,0.55)",
  menuPanel: "rgba(0,0,0,0.42)",
  groundCore: "rgba(255,85,110,0.95)",
  groundGlow: "rgba(255,85,110,0.22)",
  dangerTint: "rgba(255,85,110,0.10)",
};

// Render-side motion (camera lag, scrape dust, building debris, pose smoothing) runs on the game's
// clock, not the wall clock: each frame it moves exactly as far as the game advanced since the
// last one, so it freezes while paused and keeps time with the game on any screen.
let _lastUiTime = null;
let _camX = 0;

// Bob's drawn pose: usually the game state itself, but dead or on the start screen a few fields
// are overridden. Both objects are reused, so drawing Bob allocates nothing per frame.
// poseView has every field of the state that drawPlayer and the dash effects read (render/player/).
const poseView = { player: null, slowfallHeld: false, heavyLandT: 0, speedImpulse: 0, running: false, speed: 0 };
const posePlayer = {};
const LIMP = { vy: 0, diving: false, divePhase: "", divePhaseT: 0, ducking: false, spinning: false }; // in the claw
const STANDING = { onGround: true, ducking: false }; // on the starter roof

function poseFor(state, deathActive, onStartScreen) {
  if (!deathActive && !onStartScreen) return state;
  Object.assign(posePlayer, state.player, deathActive ? LIMP : STANDING);
  if (onStartScreen) {
    const starter = state.platforms && state.platforms[0];
    posePlayer.groundPlat = starter && starter.invulnerable ? starter : null;
  }
  poseView.player = posePlayer;
  poseView.slowfallHeld = deathActive ? false : state.slowfallHeld;
  poseView.heavyLandT = deathActive ? 0 : state.heavyLandT;
  poseView.speedImpulse = onStartScreen ? 0 : state.speedImpulse;
  poseView.running = state.running;
  poseView.speed = state.speed;
  return poseView;
}

// START smash screen shake
const SMASH_SHAKE_SEC = 0.22;
const SMASH_SHAKE_PX = 4;

// Touch screen or not (main.js decides): picks "TAP" or key wording in on-screen hints.
let touchUi = false;

export function setTouchUi(value) {
  touchUi = value === true;
}

export function render(ctx, state) {
  const W = world.INTERNAL_WIDTH;
  const H = world.INTERNAL_HEIGHT;

  // Ensure the canvas backing resolution and establish a stable transform.
  const { dpr, cw, ch, cssW, cssH } = ensureCanvasSize(ctx, W, H);

  const player = state.player;
  const deathActive = state.deathCinematicActive === true;
  const freezeOnDeath = state.gameOver === true && state.deathCinematicDone === true && !deathActive;

  // Dying: the camera holds on where Bob died (the game's snapshot of him).
  const deathSnap = deathActive || state.deathCinematicDone ? (state.deathSnapshot || player) : null;
  const deathFocusX = deathSnap ? deathSnap.x + deathSnap.w / 2 : null;
  const deathFocusY = deathSnap ? deathSnap.y + deathSnap.h / 2 : null;

  const deathInfo = (deathActive || state.deathCinematicDone)
    ? computeDeathCinematic(state, deathFocusX)
    : null;

  const bottom = player.y + player.h;
  const distToGround = Math.max(0, world.GROUND_Y - bottom);
  const danger01 = 1 - Math.max(0, Math.min(1, distToGround / 140));

  const uiTime = state.uiTime || 0;
  const animTime = state.animTime || 0;

  // Game time since the last drawn frame. 0 while paused or counting down (uiTime stands still),
  // and for the frame after a reset sets uiTime back to 0.
  const dt = _lastUiTime === null ? 0 : clamp(uiTime - _lastUiTime, 0, 0.1);
  _lastUiTime = uiTime;
  const frozen = state.paused === true || state.resumeCountdownT > 0;

  if (!Number.isFinite(_camX)) _camX = 0;

  // Camera lag is driven continuously by world speed + dash impulse.
  // This avoids step changes and feels weighty at high speed.
  let camLag;
  if (!freezeOnDeath) {
    const speed = Number.isFinite(state.speed) ? state.speed : 0;
    const impulse = Number.isFinite(state.speedImpulse) ? state.speedImpulse : 0;

    // Map speed to a forward camera lag (clamped).
    // Base speed contributes gently; dash impulse contributes strongly.
    const targetCamX = deathActive
      ? 0
      : clamp(
          speed * 0.015 + impulse * 0.08,
          0,
          DASH_MAX_CAM_LAG
        );

    // Smoothly ease camera toward target using exponential smoothing.
    const k = 1 - Math.exp(-DASH_CAM_SMOOTH * dt);
    _camX += (targetCamX - _camX) * k;
    camLag = deathActive ? 0 : _camX;
  } else {
    camLag = 0;
  }

  const safeOffsetX = isTouchViewport() ? Math.min(W * 0.12, 140) : 0;
  // Subtract to push the player further right on screen for mobile-safe UI space.
  const camShift = camLag - safeOffsetX;

  // Hard reset paint state
  resetCtx(ctx);

  // Clear in device pixels with identity transform.
  {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.restore();
  }

  // Establish internal-coordinate viewport transform for all subsequent draws.
  ctx.save();
  applyViewportTransform(ctx, W, H, cssW, cssH, dpr);

  // Menu zoom (start/restart): zoomed-in on player, easing to 1x when play begins.
  const zoomK = clamp(state.menuZoomK ?? 1, 0, 1);
  let zoom = MENU_START_ZOOM - (MENU_START_ZOOM - 1) * zoomK;
  if (deathActive || freezeOnDeath) {
    zoom *= 1 + (deathInfo?.zoomBoost || 0);
  }

  const focusBobOffset = (deathActive || freezeOnDeath) ? (deathInfo?.bobOffsetX || 0) : 0;
  const freezeSnap = freezeOnDeath ? (state.deathSnapshot || player) : null;
  const focusX = deathActive && Number.isFinite(deathFocusX)
    ? deathFocusX
    : freezeSnap
      ? (freezeSnap.x + freezeSnap.w / 2) - camShift
      : ((player?.x ?? W * 0.35) + (player?.w ?? PLAYER_W) / 2 + focusBobOffset) - camShift;
  const focusY = deathActive && Number.isFinite(deathFocusY)
    ? deathFocusY
    : freezeSnap
      ? (freezeSnap.y + freezeSnap.h / 2)
      : (player?.y ?? world.GROUND_Y - PLAYER_H) + (player?.h ?? PLAYER_H) / 2;

  let pointerWorld = null;
  if (state.pointerInside && ctx.canvas) {
    const rect = getCanvasRect(ctx.canvas);
    const pxCss = (state.pointerX ?? 0) - rect.left;
    const pyCss = (state.pointerY ?? 0) - rect.top;
    const sx = cssW / W;
    const sy = cssH / H;
    const s = Math.max(sx, sy);
    const oxCss = (cssW - W * s) * 0.5;
    const oyCss = (cssH - H * s) * 0.5;
    const insideViewport =
      pxCss >= oxCss &&
      pxCss <= oxCss + W * s &&
      pyCss >= oyCss &&
      pyCss <= oyCss + H * s;
    if (insideViewport) {
      const internalX = (pxCss - oxCss) / s;
      const internalY = (pyCss - oyCss) / s;
      const invZoom = 1 / Math.max(0.001, zoom);
      pointerWorld = {
        x: focusX + (internalX - focusX) * invZoom,
        y: focusY + (internalY - focusY) * invZoom,
      };
    }
  }

  const startPush = computeStartPush(state, focusX);

  ctx.save();
  // START smash: a short, decaying screen shake (driven by the game's smash timer, so it pauses too).
  const smashT = state.menuSmashT || 0;
  if (state.menuSmashActive && smashT < SMASH_SHAKE_SEC) {
    const k = 1 - smashT / SMASH_SHAKE_SEC;
    const amp = SMASH_SHAKE_PX * k * k;
    ctx.translate(Math.sin(smashT * 97) * amp, Math.cos(smashT * 83) * amp * 0.7);
  }
  ctx.translate(focusX, focusY);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);

  // ---- BACKGROUND ----
  resetCtx(ctx);
  drawBackground(ctx, W, H, COLORS);

  // Parallax layer tracks a reduced camera offset to avoid forward drift.
  ctx.save();
  ctx.translate(-camShift * DASH_PARALLAX_CAM_FACTOR, 0);
  resetCtx(ctx);
  drawParallax(ctx, W, H, state.distance || 0);
  ctx.restore();

  // Ground stays anchored to screen space to avoid forward/back jitter.
  if (!state.restartFlybyActive) {
    resetCtx(ctx);
    drawLethalGround(ctx, W, H, animTime, danger01, COLORS);
  }

  // ---- WORLD ----
  ctx.save();
  ctx.translate(-camShift, 0);
  resetCtx(ctx);
  drawBuildingsAndRoofs(ctx, state, W, animTime, COLORS, undefined, dt);

  // ---- PLAYER ----
  let playerOffsetX = deathInfo
    ? deathInfo.bobOffsetX
    : (startPush ? startPush.bobOffsetX : 0);
  const playerAlpha = deathInfo ? deathInfo.bobAlpha : 1;
  let playerTilt = deathInfo ? deathInfo.bobTilt : 0;
  let playerLift = deathInfo ? deathInfo.bobLift : 0;
  let playerScale = deathInfo ? deathInfo.bobScale : 1;
  // Falling back off a billboard. Once he's dead the death cinematic carries on this pose itself.
  if (!deathInfo && state.player && state.player.billboardDeath === true) {
    const fall = billboardFallPose(billboardFallK(state.player));
    playerTilt += fall.tilt;
    playerOffsetX += fall.x;
    playerLift += fall.lift;
  }

  const startLookAround = startPush ? startPush.done === true : false;
  const onStartScreen =
    !state.running &&
    !state.gameOver &&
    state.startReady === true &&
    !state.menuZooming &&
    (state.menuZoomK ?? 0) <= 0.001;
  const pose = poseFor(state, deathActive, onStartScreen);
  const renderPlayer = pose.player;

  // Dash: wind lines and wheel sparks, behind Bob. None in the claw or on the start screen.
  const dashFxOn = !deathActive && !freezeOnDeath && !onStartScreen;
  updateDashSparks(pose, dt, playerOffsetX, dashFxOn);
  if (dashFxOn) {
    resetCtx(ctx);
    drawDashWind(ctx, pose, animTime, camShift, W, H);
  }
  resetCtx(ctx);
  drawDashSparks(ctx, pose, playerOffsetX, dashFxOn);

  resetCtx(ctx);
  ctx.save();
  if (playerOffsetX || playerLift) ctx.translate(playerOffsetX, playerLift * 0.25);
  ctx.globalAlpha *= playerAlpha;
  drawPlayerShadow(ctx, renderPlayer);
  ctx.restore();

  resetCtx(ctx);
  ctx.save();
  if (playerOffsetX || playerLift || playerAlpha !== 1 || playerScale !== 1 || playerTilt !== 0) {
    ctx.translate(playerOffsetX, playerLift);
  const pcx = renderPlayer.x + renderPlayer.w / 2;
  const pcy = renderPlayer.y + renderPlayer.h / 2;
    ctx.translate(pcx, pcy);
    if (playerTilt) ctx.rotate(playerTilt);
    if (playerScale !== 1) ctx.scale(playerScale, playerScale);
    ctx.translate(-pcx, -pcy);
    ctx.globalAlpha *= playerAlpha;
  }
  drawPlayer(ctx, pose, animTime, false, COLORS, {
    noGlow: deathActive,
    noFx: deathActive,
    eyes: startLookAround ? { t: uiTime || 0 } : null,
    noWheel: deathInfo !== null, // it came off in the crash
    dt,
  });
  ctx.restore();

  if (!deathActive) {
    resetCtx(ctx);
    drawScorePopups(ctx, state);
  }

  resetCtx(ctx);
  drawBreakShards(ctx, state.breakShards);

  if (deathActive) {
    resetCtx(ctx);
    drawDeathDragSparks(ctx, deathInfo, dt);
  }

  // Start prompt stays in-world (moves with camera/zoom, fixed world size).
  resetCtx(ctx);
  hitAreas.startPaneHovered = drawStartPrompt(ctx, state, uiTime, COLORS, W, H, pointerWorld) === true;

  const restartPromptReady = state.restartReady === true;

  if (deathActive) {
    resetCtx(ctx);
    drawRobotArm(ctx, deathInfo, COLORS, animTime || 0, "all");
  }

  if (!deathActive && startPush && !startPush.offscreen) {
    resetCtx(ctx);
    drawRobotArm(ctx, startPush, COLORS, animTime || 0, "all");
  }

  ctx.restore();

  // ---- UI ----
  // Remove zoom for overlay/UI layers.
  ctx.restore();

  // The summary drops in while the arm is still dragging Bob away.
  const onRestartScreen = isSummaryShowing(state);
  // Suppress HUD during start zoom; allow slide-out on death.
  const showHUD =
    !state.restartFlybyActive &&
    !onRestartScreen &&
    !state.menuZooming &&
    (state.running || (state.hudIntroT || 0) > 0);

  const hudDanger = computeHudDanger(state, danger01);
  if (showHUD) {
    resetCtx(ctx);
    drawDangerVignette(ctx, W, H, hudDanger);
    resetCtx(ctx);
    drawHUD(ctx, state, hudDanger, COLORS);
  }

  if (onRestartScreen) {
    maybePromptForPendingClaim({ allowPrompt: restartPromptReady });
    resetCtx(ctx);
    const pointerUi =
      state.pointerInViewport === true
        ? { x: state.pointerUiX, y: state.pointerUiY }
        : null;
    drawCenterScore(ctx, state, W, H, pointerUi, restartPromptReady, touchUi);
  } else {
    hitAreas.resetHovered = false;
  }

  if (state.restartFlybyActive) {
    resetCtx(ctx);
    drawRestartFlyby(ctx, state, COLORS, W, H);
  }

  if (onStartScreen) {
    resetCtx(ctx);
    const btnRect = getControlsButtonRect(W, H);
    const panelRect = getControlsPanelRect(W, H);
    const hover =
      state.pointerInViewport === true
      && pointInRect(state.pointerUiX, state.pointerUiY, btnRect);
    const boards = getBoards();
    // THIS WEEK expands the board once there's a weekly rank to show.
    const canExpand = boards.weekly.length > 0;
    const weeklyRows = state.leaderboardExpanded ? boards.weeklySlots : 0;
    const boardW = Math.min(300, W * 0.32);
    const boardX = W - boardW - 16;
    const boardY = 18;
    // As tall as its rows need, but clear of the GAME CONTROLS button below it (rows shrink to fit).
    const maxH = btnRect.y - 10 - boardY;
    const weeklyLabel = hasWeeklyLabel(boards, weeklyRows, canExpand);
    const rowHeight = leaderboardRowHeight(maxH, weeklyRows, weeklyLabel, 22);
    const boardH = leaderboardPanelHeight(weeklyRows, rowHeight, weeklyLabel);
    const meta = drawLeaderboardPanel(ctx, boards, getMyBest(), boardX, boardY, boardW, boardH, 1, {
      glow: true,
      toggle: canExpand,
      expanded: state.leaderboardExpanded === true,
      rowHeight,
      resetIn: weeklyResetIn(),
    });

    hitAreas.leaderboardToggle = meta?.toggleRect ?? null;
    drawControlsButton(ctx, btnRect, state.controlsPanelOpen === true, hover);
    if (state.controlsPanelOpen) {
      drawControlsPanel(ctx, panelRect, COLORS);
    }
  } else {
    hitAreas.leaderboardToggle = null;
  }

  // Pressing RESET: glitch the finished frame out, until the fly-by takes over.
  if (state.restartSmashActive && !state.restartFlybyActive) {
    drawResetGlitch(ctx, clamp((state.restartSmashT || 0) / RESET_GLITCH_SEC, 0, 1));
  }

  // Pause screen / resume countdown covers everything, HUD included.
  if (frozen) {
    resetCtx(ctx);
    drawPauseOverlay(ctx, state, W, H, touchUi);
  }

  // Restore viewport transform
  ctx.restore();
}
