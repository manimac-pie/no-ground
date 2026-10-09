// src/render/hud/primitives.js
// Small drawing helpers shared by the HUD screens.

import { roundedRectPath } from "../../shared/canvas.js";

// Ease out with a small overshoot, so a dropped panel settles into place.
export function easeOutBack(t, overshoot = 1.2) {
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

export function roundRect(ctx, x, y, w, h, r) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

export function drawGlow(ctx, x, y, w, h, color = "rgba(120,205,255,0.25)", blur = 26) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// One formatter for every call: toLocaleString builds a new one each time, and the HUD formats every frame.
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

export function formatNumber(n) {
  if (!Number.isFinite(n)) return "0";
  return NUMBER_FORMAT.format(Math.floor(n));
}
