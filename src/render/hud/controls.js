// src/render/hud/controls.js
// What each key does (the start screen shell's CONTROLS sheet lists it, render/hud/shell.js), and the
// menu button TRAINING's EXIT and SKIP use.

import { roundedRectPath } from "../../shared/canvas.js";
import { drawCachedPanel } from "./panelCache.js";
import { drawGlow, roundRect } from "./primitives.js";

// A menu button (TRAINING's EXIT and SKIP). slot: its panel-cache slot.
export function drawMenuButton(ctx, slot, rect, label, active = false, hot = false) {
  if (!rect) return;
  const key = `${rect.x}|${rect.y}|${rect.w}|${rect.h}|${label}|${active}|${hot}`;
  drawCachedPanel(ctx, slot, key, rect, (pctx) =>
    drawMenuButtonDirect(pctx, rect, label, active, hot)
  );
}

function drawMenuButtonDirect(ctx, rect, label, active, hot) {
  const { x, y, w, h } = rect;
  ctx.save();
  const glow = active ? "rgba(0,255,225,0.28)" : "rgba(120,205,255,0.18)";
  drawGlow(ctx, x + 8, y + 8, w - 16, h - 16, glow, 20);

  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "rgba(16,20,30,0.98)");
  body.addColorStop(1, "rgba(8,10,16,0.98)");
  ctx.fillStyle = body;
  roundRect(ctx, x, y, w, h, 12);

  // Neon edge
  ctx.lineWidth = 2;
  ctx.strokeStyle = active
    ? "rgba(0,255,225,0.85)"
    : hot
      ? "rgba(120,205,255,0.7)"
      : "rgba(80,120,160,0.45)";
  roundedRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 12);
  ctx.stroke();

  // Inner glow rim
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  roundedRectPath(ctx, x + 4, y + 4, w - 8, h - 8, 10);
  ctx.stroke();

  // Scanline sheen
  ctx.save();
  roundedRectPath(ctx, x + 2, y + 2, w - 4, h - 4, 10);
  ctx.clip();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let sy = y + 6; sy < y + h; sy += 4) {
    ctx.fillRect(x + 4, sy, w - 8, 1);
  }
  ctx.restore();

  // Accent sliver
  ctx.fillStyle = active ? "rgba(0,255,225,0.75)" : "rgba(120,205,255,0.55)";
  roundRect(ctx, x + 10, y + 8, 6, h - 16, 4);

  // Label plate
  const labelX = x + 22;
  const labelW = w - 44;
  ctx.fillStyle = "rgba(6,10,16,0.9)";
  roundRect(ctx, labelX, y + 6, labelW, h - 12, 8);

  ctx.fillStyle = "rgba(210,245,255,0.95)";
  let fontSize = 11;
  ctx.font = `800 ${fontSize}px Orbitron, Share Tech Mono, Menlo, monospace`;
  const maxW = labelW - 12;
  let textW = ctx.measureText(label).width;
  if (textW > maxW) {
    fontSize = Math.max(9, Math.floor(fontSize * (maxW / textW)));
    ctx.font = `800 ${fontSize}px Orbitron, Share Tech Mono, Menlo, monospace`;
    textW = ctx.measureText(label).width;
  }
  ctx.fillText(label, labelX + (labelW - textW) / 2, y + h / 2 + 4);

  ctx.restore();
}

// What each key does, grouped by when it's used: the same key can do one thing on a roof and
// another in the air. key: the keyboard key; tap: the mobile button. hold: a hold, not a press.
export const ROOF_MOVES = [
  { key: "SPACE", tap: "TAP", label: "Jump" },
  { key: "S", tap: "DUCK/DIVE", label: "Duck", hold: true },
  { key: "D", tap: "DASH", label: "Dash" },
];
export const AIR_MOVES = [
  { key: "SPACE", tap: "TAP", label: "Jump again" },
  { key: "W", tap: "SLOWFALL", label: "Slowfall", hold: true },
  { key: "S", tap: "DUCK/DIVE", label: "Dive" },
  { key: "A", tap: "BACKFLIP", label: "Backflip" },
  { key: "D", tap: "DASH", label: "Dash" },
];
// The two materials, in the colours the world draws them (render/world/billboards.js, facades.js).
export const MATERIALS = [
  { name: "PINK GLASS", rgb: "255,80,150", text: "Dash through its ads. Roofs crumble." },
  { name: "BLUE STEEL", rgb: "120,205,255", text: "Duck or jump its ads. Roofs hold." },
];
