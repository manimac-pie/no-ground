// src/render/hud/flyby.js
// The restart fly-by between RESET and the next run.

import {
  RESTART_FLYBY_FADE_SEC,
  RESTART_FLYBY_HOLD_SEC,
  RESTART_FLYBY_SEC,
} from "../../game/constants.js";
import { clamp } from "../../shared/math.js";
import { formatIteration } from "../../ui/iteration.js";

export function drawRestartFlyby(ctx, state, COLORS, W, H) {
  if (!state.restartFlybyActive) return false;

  const w = Number.isFinite(W) ? W : 800;
  const h = Number.isFinite(H) ? H : 450;
  const flybyT = state.restartFlybyT || 0;
  const flybyK = clamp(flybyT / RESTART_FLYBY_SEC, 0, 1);
  const fadeOutStart = RESTART_FLYBY_SEC + RESTART_FLYBY_HOLD_SEC;
  const fadeOutK = clamp((flybyT - fadeOutStart) / RESTART_FLYBY_FADE_SEC, 0, 1);
  const fade = 1 - fadeOutK;

  ctx.save();
  ctx.globalAlpha = 0.9 * fade;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "rgba(10,12,18,0.95)");
  sky.addColorStop(0.55, "rgba(18,20,28,0.90)");
  sky.addColorStop(1, "rgba(8,9,14,0.95)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const speed = (flybyK * 1.8 + 0.2);
  const layers = [
    { y: h * 0.10, h: h * 0.28, parallax: 0.35, alpha: 0.25 },
    { y: h * 0.30, h: h * 0.34, parallax: 0.6, alpha: 0.35 },
    { y: h * 0.54, h: h * 0.46, parallax: 1.0, alpha: 0.48 },
  ];

  layers.forEach((layer, li) => {
    const base = (speed * 900 * layer.parallax) % 320;
    ctx.fillStyle = `rgba(22,24,34,${layer.alpha})`;
    for (let i = -2; i < 10; i++) {
      const bw = 120 + ((i + li * 3) % 5) * 40;
      const bx = i * 220 + base;
      const bh = layer.h * (0.55 + 0.35 * ((i + 2) % 3));
      const by = layer.y + layer.h - bh;
      ctx.fillRect(bx, by, bw, bh);
    }

    ctx.globalAlpha = 0.35 * fade;
    ctx.fillStyle = "rgba(120,205,255,0.18)";
    for (let i = -2; i < 8; i++) {
      const lineW = 80 + (i % 4) * 30;
      const lx = i * 240 + base * 1.1 + 40;
      const ly = layer.y + (i % 3) * 18 + 8;
      ctx.fillRect(lx, ly, lineW, 2);
    }
    ctx.globalAlpha = 0.9 * fade;
  });

  ctx.globalAlpha = 0.55 * fade;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, h * 0.72, w, h * 0.28);

  // The simulation announces the next iteration while it rebuilds the world (flickers on).
  const textIn = clamp(flybyT / 0.25, 0, 1);
  const flicker = textIn < 1 && Math.floor(flybyT * 40) % 3 === 0 ? 0.25 : 1;
  ctx.globalAlpha = fade * textIn * flicker;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillStyle = "rgba(150,170,190,0.8)";
  ctx.fillText("REINITIALIZING", w / 2, h * 0.42);
  ctx.font = "700 30px Share Tech Mono, Menlo, monospace";
  ctx.shadowColor = "rgba(120,220,255,0.85)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "rgba(170,235,255,1)";
  ctx.fillText(`ITERATION ${formatIteration((state.iteration || 0) + 1)}`, w / 2, h * 0.42 + 36);

  ctx.restore();
  return true;
}
