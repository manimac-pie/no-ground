// src/render/index.js
// Single render orchestrator (prevents duplicate draws + state leaks).

import { world } from "../game.js";
import {
  DASH_MAX_CAM_LAG,
  DASH_CAM_SMOOTH,
  DASH_PARALLAX_CAM_FACTOR,
} from "../game/constants.js";

import {
  drawBackground,
  drawParallax,
  drawLethalGround,
  drawBuildingsAndRoofs,
  drawVignette,
} from "./world.js";

import { drawPlayerShadow, drawPlayer } from "./player.js";
import { drawHUD, drawLandingPopup, drawMenus } from "./ui.js";
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

let prevOnGround = true;
let prevGameOver = false;

let _prevFrameT = 0;
let _camX = 0;

function ensureCanvasSize(ctx, W, H) {
  // Match the backing store to the element size (prevents coordinate mismatch after refactors).
  const canvas = ctx.canvas;
  if (!canvas) return { dpr: 1, cw: W, ch: H };

  const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));

  const targetW = Math.max(1, Math.floor(cssW * dpr));
  const targetH = Math.max(1, Math.floor(cssH * dpr));

  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  return { dpr, cw: targetW, ch: targetH, cssW, cssH };
}

function applyViewportTransform(ctx, W, H, cssW, cssH, dpr) {
  // Draw in INTERNAL coords (W/H) and scale to fit the canvas while preserving aspect.
  const sx = cssW / W;
  const sy = cssH / H;
  const s = Math.min(sx, sy);

  const oxCss = (cssW - W * s) * 0.5;
  const oyCss = (cssH - H * s) * 0.5;

  // Transform maps internal units -> device pixels.
  ctx.setTransform(s * dpr, 0, 0, s * dpr, oxCss * dpr, oyCss * dpr);
}

function resetCtx(ctx) {
  // Reset paint state, but DO NOT touch the transform.
  // The transform is owned by the caller (main.js) to scale internal coords to the canvas.
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
  const targetCamX = clamp(
    speed * 0.015 + impulse * 0.08,
    0,
    DASH_MAX_CAM_LAG
  );

  // Smoothly ease camera toward target using exponential smoothing.
  const k = 1 - Math.exp(-DASH_CAM_SMOOTH * dt);
  _camX += (targetCamX - _camX) * k;

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

  // ---- BACKGROUND ----
  resetCtx(ctx);
  drawBackground(ctx, W, H, COLORS);

  // Parallax layer tracks a reduced camera offset to avoid forward drift.
  ctx.save();
  ctx.translate(-_camX * DASH_PARALLAX_CAM_FACTOR, 0);
  resetCtx(ctx);
  drawParallax(ctx, W, H, state.distance || 0);
  ctx.restore();

  // Ground stays anchored to screen space to avoid forward/back jitter.
  resetCtx(ctx);
  drawLethalGround(ctx, W, H, animTime, danger01, COLORS);

  // ---- WORLD ----
  ctx.save();
  ctx.translate(-_camX, 0);
  resetCtx(ctx);
  drawBuildingsAndRoofs(ctx, state, W, animTime, COLORS, undefined, dt);

  // ---- PLAYER ----
  resetCtx(ctx);
  drawPlayerShadow(ctx, player);
  drawPlayer(ctx, state, animTime, landed || justDied, COLORS);
  ctx.restore();

  // ---- UI ----
  resetCtx(ctx);
  drawHUD(ctx, state, danger01, COLORS);

  resetCtx(ctx);
  drawLandingPopup(ctx, state, COLORS);

  resetCtx(ctx);
  drawVignette(ctx, W, H);

  resetCtx(ctx);
  drawMenus(ctx, state, uiTime, COLORS, W, H);

  // Restore viewport transform
  ctx.restore();
}
