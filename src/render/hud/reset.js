// src/render/hud/reset.js
// The RESET prompt and the glitch that wipes the screen.

import { roundedRectPath } from "../../shared/canvas.js";
import { hash01 } from "../../shared/math.js";
import { roundRect } from "./primitives.js";

// ---------------- RESET (the simulation's command) ----------------
// Bob is trying to escape a simulation; RESET is the system putting him back. So the button is a
// terminal prompt rather than a friendly arcade button: "> RESET" with a blinking cursor, the
// iteration it just ended, and the key that confirms it.
export const RESET_TYPE_SEC = 0.35;   // "> RESET" types in over this long once RESET is ready
const RESET_PROMPT = "> RESET";
const RESET_PROMPT_FONT = "700 20px Share Tech Mono, Menlo, monospace";

function resetPromptX(button) {
  return button.x + 18;
}

// typedK 0..1: how much of the prompt has typed in; the sub-line and key hint follow it.
export function drawResetButton(ctx, button, red, keyHint, subline, typedK) {
  const { x, y, w, h } = button;
  const rgb = red ? "255,110,120" : "120,220,255";
  ctx.save();

  // Terminal panel
  ctx.shadowColor = `rgba(${rgb},${red ? 0.75 : 0.45})`;
  ctx.shadowBlur = red ? 22 : 14;
  ctx.fillStyle = red ? "rgba(26,8,12,0.94)" : "rgba(6,10,16,0.94)";
  roundRect(ctx, x, y, w, h, 10);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = `rgba(${rgb},0.85)`;
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 10);
  ctx.stroke();

  // Faint scanlines
  ctx.save();
  roundedRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 9);
  ctx.clip();
  ctx.fillStyle = `rgba(${rgb},0.05)`;
  for (let sy = y + 3; sy < y + h; sy += 3) ctx.fillRect(x, sy, w, 1);
  ctx.restore();

  // "> RESET", typed in
  const shown = RESET_PROMPT.slice(0, Math.ceil(RESET_PROMPT.length * typedK));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = RESET_PROMPT_FONT;
  ctx.shadowColor = `rgba(${rgb},0.9)`;
  ctx.shadowBlur = 10;
  ctx.fillStyle = `rgba(${rgb},1)`;
  ctx.fillText(shown, resetPromptX(button), y + 24);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (typedK >= 1) {
    // What just happened, in the system's words
    ctx.font = "700 8px Orbitron, Share Tech Mono, Menlo, monospace";
    ctx.fillStyle = "rgba(150,170,190,0.75)";
    ctx.fillText(subline, resetPromptX(button), y + 37);

    // The key that confirms it
    ctx.textAlign = "right";
    ctx.font = "700 12px Share Tech Mono, Menlo, monospace";
    ctx.fillStyle = `rgba(${rgb},0.8)`;
    ctx.fillText(keyHint, x + w - 16, y + h / 2 + 4);
  }
  ctx.restore();
}

// Block cursor after "> RESET" (drawn live so the cached button doesn't rebuild on every blink).
export function drawResetCursor(ctx, button, red) {
  ctx.save();
  ctx.font = RESET_PROMPT_FONT;
  const cx = resetPromptX(button) + ctx.measureText(RESET_PROMPT).width + 4;
  ctx.fillStyle = red ? "rgba(255,110,120,0.95)" : "rgba(120,220,255,0.95)";
  ctx.fillRect(cx, button.y + 10, 9, 16);
  ctx.restore();
}

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
