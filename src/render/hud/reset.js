// src/render/hud/reset.js
// The glitch that wipes the screen when RESET is pressed (and when TRAINING ends).

import { hash01 } from "../../shared/math.js";

// Pressing RESET: the simulation glitches the frame out before the fly-by rebuilds the world.
// k 0..1 over RESET_GLITCH_SEC. Post-process in device pixels: shifted slices of the frame
// (copied from the canvas itself), colour-split bars, scanlines, then a cut to black.
export function drawResetGlitch(ctx, k) {
  const canvas = ctx.canvas;
  if (!canvas) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const step = Math.floor(k * 24); // re-roll the glitch ~24 times over its run, not every frame
  const r = (i) => hash01(step * 31.7 + i * 7.3);
  const strength = 0.35 + 0.65 * k;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Slice tears
  const slices = 6 + Math.floor(8 * k);
  for (let i = 0; i < slices; i++) {
    const sy = Math.floor(r(i) * ch);
    const sh = Math.max(2, Math.floor(ch * (0.008 + 0.05 * r(i + 50))));
    const dx = Math.round((r(i + 100) - 0.5) * cw * 0.14 * strength);
    ctx.drawImage(canvas, 0, sy, cw, sh, dx, sy, cw, sh);
  }

  // Colour-split bars along some tears
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 4; i++) {
    const by = Math.floor(r(i + 200) * ch);
    const bh = Math.max(1, Math.floor(ch * 0.006));
    ctx.fillStyle = i % 2 ? `rgba(255,60,120,${0.5 * strength})` : `rgba(60,220,255,${0.5 * strength})`;
    ctx.fillRect(Math.round((r(i + 300) - 0.5) * cw * 0.1), by, cw, bh);
  }

  // Scanlines, then the cut to black
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(0,0,0,${0.35 * strength})`;
  const line = Math.max(2, Math.round(ch / 150));
  for (let y = 0; y < ch; y += line * 2) ctx.fillRect(0, y, cw, line);
  ctx.fillStyle = `rgba(4,6,10,${k * k})`;
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
}
