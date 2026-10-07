// src/ui/layout.js
// Shared UI layout helpers (render + input hit-testing).

import { clamp } from "../shared/math.js";

// Pointer targets that only the renderer can place, because they move with animations. The
// renderer fills these in every frame as it draws; the game reads them to handle clicks.
// They're kept out of the game state so the renderer never writes to it.
export const hitAreas = {
  leaderboardToggle: null, // { x, y, w, h } of the start-screen board's THIS WEEK toggle, in UI units
  resetHovered: false,     // the pointer is over RESET on the run summary
  startPaneHovered: false, // the pointer is over the START firewall
};

export function getControlsButtonRect(W = 800, H = 450) {
  const btnW = 176;
  const btnH = 30;
  const margin = 12;
  const x = clamp(W - btnW - margin, margin, Math.max(margin, W - btnW - margin));
  const y = clamp(H - btnH - margin, margin, Math.max(margin, H - btnH - margin));
  return { x, y, w: btnW, h: btnH };
}

// Start screen, top left (the leaderboard has the top right, GAME CONTROLS the bottom right).
export function getTrainingButtonRect() {
  return { x: 16, y: 18, w: 150, h: 30 };
}

// During TRAINING, top left (clear of the HUD): EXIT to the start screen, SKIP the lesson.
export function getTrainingExitRect() {
  return { x: 16, y: 18, w: 84, h: 30 };
}

export function getTrainingSkipRect() {
  return { x: 108, y: 18, w: 84, h: 30 };
}

export function getControlsPanelRect(W = 800, H = 450) {
  const btn = getControlsButtonRect(W, H);
  const panelW = Math.min(380, Math.max(350, W * 0.45));
  const panelH = 228;
  const x = clamp(
    btn.x + btn.w - panelW,
    8,
    Math.max(8, W - panelW - 8)
  );
  const y = clamp(
    btn.y - panelH - 10,
    8,
    Math.max(8, H - panelH - 8)
  );
  return { x, y, w: panelW, h: panelH };
}

export function pointInRect(px, py, rect) {
  if (!rect) return false;
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}
