// src/render/index.js
// Single render orchestrator (prevents duplicate draws).

import { world } from "../game.js";

import {
  drawBackground,
  drawParallax,
  drawLethalGround,
  drawBuildingsAndRoofs,
  drawGates,
  drawVignette,
} from "./world.js";

import { drawPlayerShadow, drawPlayer } from "./player.js";

import { drawHUD, drawLandingPopup, drawMenus } from "./ui.js";

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

// Internal renderer state for "events" (landing / death) without requiring dt threading.
let prevOnGround = true;
let prevGameOver = false;

// Frame dt for render-only effects (rubble/particles). Kept local so game logic stays dt-driven elsewhere.
let _prevFrameT = 0;

export function render(ctx, state) {
  const W = world.INTERNAL_WIDTH;
  const H = world.INTERNAL_HEIGHT;

  const player = state.player;

  // Danger factor: 0 when safely high, 1 when near the lethal ground
  const bottom = player.y + player.h;
  const distToGround = Math.max(0, world.GROUND_Y - bottom);
  const danger01 = 1 - Math.max(0, Math.min(1, distToGround / 140));

  // Detect events
  const landed = !prevOnGround && player.onGround;
  const justDied = !prevGameOver && state.gameOver;
  prevOnGround = player.onGround;
  prevGameOver = state.gameOver;

  // Time sources
  const uiTime = state.uiTime || 0;
  const animTime = state.animTime || 0;

  // Render dt (seconds) for purely visual sims; clamp to avoid huge jumps after tab switches.
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  let dt = 1 / 60;
  if (_prevFrameT > 0) {
    dt = (now - _prevFrameT) / 1000;
  }
  _prevFrameT = now;
  dt = Math.max(0, Math.min(1 / 20, dt)); // clamp to [0, 50ms]

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Background
  drawBackground(ctx, W, H, COLORS);
  drawParallax(ctx, W, H, state.distance || 0);
  drawLethalGround(ctx, W, H, animTime, danger01, COLORS);

  // World objects
  ctx.save();

  drawBuildingsAndRoofs(ctx, state, W, animTime, COLORS, undefined, dt);
  drawGates(ctx, state, W, animTime);

  drawPlayerShadow(ctx, player);
  drawPlayer(ctx, state, animTime, landed || justDied, COLORS);

  ctx.restore();

  // HUD + overlays
  drawHUD(ctx, state, danger01, COLORS);
  drawLandingPopup(ctx, state, COLORS);

  drawVignette(ctx, W, H);
  drawMenus(ctx, state, uiTime, COLORS, W, H);
}
