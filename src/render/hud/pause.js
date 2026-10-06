// src/render/hud/pause.js
// Pause overlay and the resume countdown.

import { roundedRectPath } from "../../shared/canvas.js";
import { clamp, easeOutCubic } from "../../shared/math.js";
import { drawCachedPanel } from "./panelCache.js";
import { drawGlow, easeOutBack, roundRect } from "./primitives.js";

// ---------------- pause ----------------
const PAUSE_PANEL_W = 260;
const PAUSE_PANEL_H = 84;
const PAUSE_DIM_ALPHA = 0.55;
const COUNTDOWN_DIM_ALPHA = 0.22; // lighter, so the player can find Bob before play resumes

// PAUSED panel with a blinking resume hint, or the 3-2-1 resume countdown.
// Drawn last, over the HUD. touchUi picks "TAP" or key wording for the hint.
export function drawPauseOverlay(ctx, state, W, H, touchUi = false) {
  const counting = !state.paused && state.resumeCountdownT > 0;
  if (!state.paused && !counting) return;

  ctx.save();
  ctx.fillStyle = `rgba(4,6,10,${counting ? COUNTDOWN_DIM_ALPHA : PAUSE_DIM_ALPHA})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (counting) {
    drawResumeCountdown(ctx, state.resumeCountdownT, W, H);
    return;
  }

  const rect = {
    x: Math.round((W - PAUSE_PANEL_W) / 2),
    y: Math.round(H / 2 - PAUSE_PANEL_H / 2 - 16),
    w: PAUSE_PANEL_W,
    h: PAUSE_PANEL_H,
  };
  drawCachedPanel(ctx, "pausePanel", `${rect.x}|${rect.y}`, rect, (pctx) =>
    drawPausePanelDirect(pctx, rect)
  );

  // Blinking hint (changes every frame, so drawn directly, not cached).
  const blink = 0.55 + 0.45 * Math.sin((state.pauseT || 0) * 4);
  ctx.save();
  ctx.globalAlpha = 0.1 + 0.9 * blink;
  ctx.textAlign = "center";
  ctx.font = "700 12px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.shadowColor = "rgba(120,205,255,0.7)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(200,235,255,0.95)";
  ctx.fillText(touchUi ? "TAP TO RESUME" : "SPACE / P TO RESUME", W / 2, rect.y + rect.h + 30);
  ctx.restore();
}

function drawPausePanelDirect(ctx, rect) {
  const { x, y, w, h } = rect;
  ctx.save();
  drawGlow(ctx, x + 8, y + 8, w - 16, h - 16, "rgba(120,205,255,0.2)", 22);

  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "rgba(16,20,30,0.96)");
  body.addColorStop(1, "rgba(8,10,16,0.96)");
  ctx.fillStyle = body;
  roundRect(ctx, x, y, w, h, 14);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(120,205,255,0.6)";
  roundedRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 14);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  roundedRectPath(ctx, x + 4, y + 4, w - 8, h - 8, 11);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.font = "800 32px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.shadowColor = "rgba(0,255,225,0.6)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "rgba(235,255,255,0.98)";
  ctx.fillText("PAUSED", x + w / 2, y + h / 2 + 12);
  ctx.restore();
}

// Each digit pops in (overshoot), holds, then fades out over its second.
function drawResumeCountdown(ctx, t, W, H) {
  const digit = Math.ceil(t);
  const k = 1 - (t - (digit - 1)); // 0 -> 1 through this digit
  const pop = easeOutBack(clamp(k / 0.3, 0, 1), 1.6);
  const scale = 0.4 + 0.6 * pop;
  const fade = k < 0.7 ? 1 : 1 - easeOutCubic((k - 0.7) / 0.3);

  ctx.save();
  ctx.globalAlpha = clamp(fade, 0, 1);
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 96px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.shadowColor = "rgba(0,255,225,0.75)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "rgba(235,255,255,0.98)";
  ctx.fillText(String(digit), 0, 0);
  ctx.restore();
}
