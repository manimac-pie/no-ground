// src/ui/layout.js
// Shared UI layout helpers (render + input hit-testing).

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function getControlsButtonRect(W = 800, H = 450) {
  const hudY = 12;
  const hudH = 74;
  const gap = 8;
  const btnW = 176;
  const btnH = 30;
  const x = clamp(W - btnW - 14, 8, Math.max(8, W - btnW - 8));
  const y = clamp(hudY + gap, 8, Math.max(8, H - btnH - 8));
  return { x, y, w: btnW, h: btnH };
}

export function getControlsPanelRect(W = 800, H = 450) {
  const btn = getControlsButtonRect(W, H);
  const panelW = Math.min(360, Math.max(300, W * 0.42));
  const panelH = 222;
  const x = clamp(btn.x, 8, Math.max(8, W - panelW - 8));
  const y = clamp(btn.y + btn.h + 10, 8, Math.max(8, H - panelH - 8));
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
