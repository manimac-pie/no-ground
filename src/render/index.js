// src/render/index.js
// Single render orchestrator (prevents duplicate draws + state leaks).

import { world } from "../game.js";
import {
  DASH_MAX_CAM_LAG,
  DASH_CAM_SMOOTH,
  DASH_PARALLAX_CAM_FACTOR,
  PLAYER_W,
  PLAYER_H,
  DEATH_CINEMATIC,
  DEATH_CINEMATIC_TOTAL,
} from "../game/constants.js";

import {
  drawBackground,
  drawParallax,
  drawLethalGround,
  drawBuildingsAndRoofs,
} from "./world.js";

import { drawPlayerShadow, drawPlayer } from "./player.js";
import { drawHUD, drawLandingPopup } from "./ui.js";
import { drawMenus, drawStartPrompt } from "./menu.js";
import { clamp } from "./playerKit.js";

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
  crack: "rgba(0,0,0,0.38)",
  crackHi: "rgba(255,85,110,0.35)",
  buildingA: "rgba(26,28,34,0.95)",
  buildingB: "rgba(20,22,28,0.95)",
  buildingRib: "rgba(12,14,18,0.65)",
  buildingPanel: "rgba(70,74,86,0.20)",
  buildingPanelDark: "rgba(8,10,14,0.40)",
  neonLine: "rgba(120,205,255,0.25)",
  signal: "rgba(255,85,110,0.55)",
  concreteStain: "rgba(0,0,0,0.18)",
  concreteDust: "rgba(242,242,242,0.06)",
  patchPanel: "rgba(32,36,44,0.85)",
  warning: "rgba(255,180,70,0.65)",
  gantry: "rgba(20,22,28,0.85)",
  coreShadow: "rgba(0,0,0,0.22)",
  ledge: "rgba(0,0,0,0.25)",
  ledgeLite: "rgba(242,242,242,0.06)",
  windowOn: "rgba(120,205,255,0.22)",
  windowOff: "rgba(242,242,242,0.06)",
  player: "#f2f2f2",
  hudBg: "rgba(0,0,0,0.35)",
  hudText: "#f2f2f2",
  overlay: "rgba(0,0,0,0.55)",
  menuPanel: "rgba(0,0,0,0.42)",
  groundCore: "rgba(255,85,110,0.95)",
  groundGlow: "rgba(255,85,110,0.22)",
  dangerTint: "rgba(255,85,110,0.10)",
};

function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutCubic(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function computeDeathCinematic(state) {
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
  const retractK = clamp(retractKRaw, 0, 1);

  const zoomBoost = 0.65 * easeOutCubic(
    DEATH_CINEMATIC.ZOOM_IN > 0
      ? t / DEATH_CINEMATIC.ZOOM_IN
      : 1
  );

  // Arm targets Bob's torso; base hides off-screen to the left.
  const baseX = -160;
  const baseY = snap.y + snap.h * 0.22;

  const targetX = snap.x + snap.w * 0.35;
  const targetY = snap.y + snap.h * 0.38;

  const reachX = baseX + (targetX - baseX) * reachK;
  const reachY = baseY + (targetY - baseY) * reachK;

  const dragDistance = -(snap.x + snap.w * 2.5 + 520);
  const dragOffsetX = dragDistance * dragK;

  const tipX = reachX + dragOffsetX - retractK * 70;
  const tipY = reachY - dragK * 8 - retractK * 6;

  const bobOffsetX = dragOffsetX;
  const bobAlpha = clamp(1 - 0.65 * retractK, 0, 1);

  const gripK = clamp(reachK * 0.9 + dragK * 0.6, 0, 1);

  const armAlpha = clamp(1 - 0.7 * retractK, 0, 1);

  return {
    active: state.deathCinematicActive === true,
    t,
    snap,
    zoomBoost,
    bobOffsetX,
    bobAlpha,
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

function drawRobotArm(ctx, info, _COLORS, animTime) {
  if (!info || !info.arm) return;
  const arm = info.arm;
  const wobble = Math.sin((animTime || 0) * 6) * (1 - arm.dragK) * 4;

  // Simple 2-segment arm with a soft elbow bend.
  const elbowX = arm.baseX + (arm.tipX - arm.baseX) * 0.55;
  const elbowY = arm.baseY - 28 + (arm.tipY - arm.baseY) * 0.20 + wobble;

  ctx.save();
  ctx.globalAlpha = arm.alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Ceiling rail / mount
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(arm.baseX - 26, arm.baseY + 8);
  ctx.lineTo(arm.baseX + 52, arm.baseY + 8);
  ctx.stroke();

  ctx.strokeStyle = "rgba(120,205,255,0.38)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(arm.baseX - 18, arm.baseY + 6);
  ctx.lineTo(arm.baseX + 46, arm.baseY + 6);
  ctx.stroke();

  // Arm body
  ctx.strokeStyle = "rgba(36,40,50,0.95)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(arm.baseX, arm.baseY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(arm.tipX, arm.tipY);
  ctx.stroke();

  ctx.strokeStyle = "rgba(120,205,255,0.55)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(arm.baseX, arm.baseY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(arm.tipX, arm.tipY);
  ctx.stroke();

  // Grapple cable to Bob
  if (info.snap) {
    const gx = info.snap.x + info.snap.w * 0.40 + (info.bobOffsetX || 0);
    const gy = info.snap.y + info.snap.h * 0.55;
    ctx.strokeStyle = "rgba(120,205,255,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arm.tipX, arm.tipY);
    ctx.lineTo(gx, gy);
    ctx.stroke();

    ctx.fillStyle = "rgba(120,205,255,0.30)";
    ctx.beginPath();
    ctx.arc(gx, gy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Claw
  const clawLen = 12;
  const spread = 16 - 8 * arm.gripK;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(arm.tipX, arm.tipY);
  ctx.lineTo(arm.tipX + clawLen, arm.tipY - spread);
  ctx.moveTo(arm.tipX, arm.tipY);
  ctx.lineTo(arm.tipX + clawLen, arm.tipY + spread);
  ctx.stroke();

  ctx.restore();
}

let prevOnGround = true;
let prevGameOver = false;

let _prevFrameT = 0;
let _camX = 0;
const MENU_START_ZOOM = 2.8;

function ensureCanvasSize(ctx, W, H) {
  // Renderer owns backing store sizing; main.js only sets CSS size.
  const canvas = ctx.canvas;
  if (!canvas) {
    return { dpr: 1, cw: W, ch: H, cssW: W, cssH: H };
  }

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));

  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const targetW = Math.max(1, Math.floor(cssW * dpr));
  const targetH = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  const cw = Math.max(1, canvas.width);
  const ch = Math.max(1, canvas.height);

  return { dpr, cw, ch, cssW, cssH };
}

function applyViewportTransform(ctx, W, H, cssW, cssH, dpr) {
  // Draw in INTERNAL coords (W/H) and scale to fit the canvas while preserving aspect.
  const sx = cssW / W;
  const sy = cssH / H;
  const s = Math.min(sx, sy);

  const oxCss = (cssW - W * s) * 0.5;
  const oyCss = (cssH - H * s) * 0.5;

  // Transform maps internal units -> device pixels.
  if (!Number.isFinite(dpr) || dpr <= 0) dpr = 1;
  ctx.setTransform(s * dpr, 0, 0, s * dpr, oxCss * dpr, oyCss * dpr);
}

function resetCtx(ctx) {
  // Reset paint state, but DO NOT touch the transform.
  // The transform is owned by the renderer to scale internal coords to the canvas.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  // Also reset common stroke/text state so a single draw call can't poison later frames.
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 10;

  // Reset text defaults (some UI calls may change these).
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Keep pixel-art/rect FX crisp by default.
  if ("imageSmoothingEnabled" in ctx) ctx.imageSmoothingEnabled = false;
}

export function render(ctx, state) {
  const W = world.INTERNAL_WIDTH;
  const H = world.INTERNAL_HEIGHT;

  // Ensure the canvas backing resolution and establish a stable transform.
  const { dpr, cw, ch, cssW, cssH } = ensureCanvasSize(ctx, W, H);

  const player = state.player;
  const deathInfo = computeDeathCinematic(state);
  const deathActive = !!(deathInfo && state.deathCinematicActive);

  const bottom = player.y + player.h;
  const distToGround = Math.max(0, world.GROUND_Y - bottom);
  const danger01 = 1 - Math.max(0, Math.min(1, distToGround / 140));

  const landed = !prevOnGround && player.onGround;
  const justDied = !prevGameOver && state.gameOver;
  prevOnGround = player.onGround;
  prevGameOver = state.gameOver;

  const uiTime = state.uiTime || 0;
  const animTime = state.animTime || 0;

  const now = (typeof performance !== "undefined" && performance.now)
    ? performance.now()
    : Date.now();

  let dt = 1 / 60;
  if (_prevFrameT > 0) dt = (now - _prevFrameT) / 1000;
  _prevFrameT = now;
  dt = Math.max(0, Math.min(1 / 20, dt));

  if (!Number.isFinite(_camX)) _camX = 0;

  // Camera lag is driven continuously by world speed + dash impulse.
  // This avoids step changes and feels weighty at high speed.
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
  const camLag = deathActive ? 0 : _camX;

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
  if (deathActive) {
    zoom *= 1 + (deathInfo?.zoomBoost || 0);
  }

  const focusBobOffset = deathActive ? (deathInfo?.bobOffsetX || 0) : 0;
  const focusX =
    ((player?.x ?? W * 0.35) + (player?.w ?? PLAYER_W) / 2 + focusBobOffset) -
    camLag;
  const focusY = (player?.y ?? world.GROUND_Y - PLAYER_H) + (player?.h ?? PLAYER_H) / 2;

  ctx.save();
  ctx.translate(focusX, focusY);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);

  // ---- BACKGROUND ----
  resetCtx(ctx);
  drawBackground(ctx, W, H, COLORS);

  // Parallax layer tracks a reduced camera offset to avoid forward drift.
  ctx.save();
  ctx.translate(-camLag * DASH_PARALLAX_CAM_FACTOR, 0);
  resetCtx(ctx);
  drawParallax(ctx, W, H, state.distance || 0);
  ctx.restore();

  // Ground stays anchored to screen space to avoid forward/back jitter.
  resetCtx(ctx);
  drawLethalGround(ctx, W, H, animTime, danger01, COLORS);

  // ---- WORLD ----
  ctx.save();
  ctx.translate(-camLag, 0);
  resetCtx(ctx);
  drawBuildingsAndRoofs(ctx, state, W, animTime, COLORS, undefined, dt);

  // ---- PLAYER ----
  const playerOffsetX = deathInfo ? deathInfo.bobOffsetX : 0;
  const playerAlpha = deathInfo ? deathInfo.bobAlpha : 1;

  resetCtx(ctx);
  ctx.save();
  if (playerOffsetX) ctx.translate(playerOffsetX, 0);
  ctx.globalAlpha *= playerAlpha;
  drawPlayerShadow(ctx, player);
  ctx.restore();

  resetCtx(ctx);
  ctx.save();
  if (playerOffsetX || playerAlpha !== 1) {
    ctx.translate(playerOffsetX, 0);
    ctx.globalAlpha *= playerAlpha;
  }
  drawPlayer(ctx, state, animTime, landed || justDied, COLORS);
  ctx.restore();

  // Start prompt stays in-world (moves with camera/zoom, fixed world size).
  resetCtx(ctx);
  drawStartPrompt(ctx, state, uiTime, COLORS, W, H, {
    onSmashTrigger: () => {
      if (!state.menuSmashActive) {
        state.menuSmashActive = true;
        state.menuSmashBroken = true;
        state.menuSmashT = 0;
      }
    },
  });

  if (deathActive) {
    resetCtx(ctx);
    drawRobotArm(ctx, deathInfo, COLORS, animTime || 0);
  }

  ctx.restore();

  // ---- UI ----
  // Remove zoom for overlay/UI layers.
  ctx.restore();

  // Suppress HUD during start zoom; keep it for game + game over.
  const showHUD = !deathActive && ((state.running && !state.menuZooming) || state.gameOver);

  if (showHUD) {
    resetCtx(ctx);
    drawHUD(ctx, state, danger01, COLORS);
  }

  if (!deathActive) {
    resetCtx(ctx);
    drawLandingPopup(ctx, state, COLORS);
  }

  if (!deathActive) {
    resetCtx(ctx);
    drawMenus(ctx, state, uiTime, COLORS, W, H, { skipStart: true });
  }

  // Restore viewport transform
  ctx.restore();
}
