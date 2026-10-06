// src/render/hud/controls.js
// The GAME CONTROLS button and the controls panel it opens.

import { roundedRectPath } from "../../shared/canvas.js";
import { drawCachedPanel } from "./panelCache.js";
import { drawGlow, roundRect } from "./primitives.js";

export function drawControlsButton(ctx, rect, active = false, hot = false) {
  drawMenuButton(ctx, "controlsButton", rect, "GAME CONTROLS", active, hot);
}

// A start-screen button (GAME CONTROLS, TRAINING). slot: its panel-cache slot.
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
const ROOF_MOVES = [
  { key: "SPACE", tap: "TAP", label: "Jump" },
  { key: "S", tap: "DUCK/DIVE", label: "Duck", hold: true },
  { key: "D", tap: "DASH", label: "Dash" },
];
const AIR_MOVES = [
  { key: "SPACE", tap: "TAP", label: "Jump again" },
  { key: "W", tap: "SLOWFALL", label: "Slowfall", hold: true },
  { key: "S", tap: "DUCK/DIVE", label: "Dive" },
  { key: "A", tap: "BACKFLIP", label: "Backflip" },
  { key: "D", tap: "DASH", label: "Dash" },
];
// The two materials, in the colours the world draws them (render/world/billboards.js, facades.js).
const MATERIALS = [
  { name: "PINK GLASS", rgb: "255,80,150", text: "Dash through its ads. Roofs crumble." },
  { name: "BLUE STEEL", rgb: "120,205,255", text: "Duck or jump its ads. Roofs hold." },
];

const SECTION_FONT = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
const CHIP_FONT = "700 13px Share Tech Mono, Menlo, monospace";
const LABEL_FONT = "600 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
const HOLD_FONT = "600 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
const CHIP_H = 20;
const ROW_H = 26;
const ITEM_GAP = 14;

// touchUi: show the mobile button names instead of keys.
export function drawControlsPanel(ctx, rect, COLORS, touchUi = false) {
  if (!rect) return;
  const key = `${rect.x}|${rect.y}|${rect.w}|${rect.h}|${touchUi}`;
  drawCachedPanel(ctx, "controlsPanel", key, rect, (pctx) =>
    drawControlsPanelDirect(pctx, rect, touchUi)
  );
}

function drawControlsPanelDirect(ctx, rect, touchUi) {
  const { x, y, w, h } = rect;
  ctx.save();
  // Neon sci-fi glass panel
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "rgba(14,18,28,0.96)");
  body.addColorStop(1, "rgba(6,8,14,0.96)");
  ctx.fillStyle = body;
  roundRect(ctx, x, y, w, h, 14);

  ctx.strokeStyle = "rgba(0,255,225,0.35)";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 14);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 6, y + 6, w - 12, h - 12, 10);
  ctx.stroke();

  // Header bar
  ctx.fillStyle = "rgba(8,12,20,0.75)";
  roundRect(ctx, x + 16, y + 14, w - 32, 22, 8);
  ctx.strokeStyle = "rgba(0,255,225,0.45)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 16, y + 14, w - 32, 22, 8);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(160,245,255,0.95)";
  ctx.font = "700 11px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("GAME CONTROLS", x + 26, y + 29);

  const left = x + 20;
  const right = x + w - 20;
  let cy = y + 56;
  cy = drawMoveSection(ctx, "ON A ROOF", ROOF_MOVES, left, right, cy, touchUi);
  cy = drawMoveSection(ctx, "IN THE AIR", AIR_MOVES, left, right, cy + 14, touchUi);

  // Materials: what breaks and what doesn't.
  cy += 4;
  ctx.fillStyle = "rgba(120,205,255,0.18)";
  ctx.fillRect(left, cy, right - left, 1);
  cy += 18;
  for (const m of MATERIALS) {
    ctx.fillStyle = `rgba(${m.rgb},0.9)`;
    ctx.shadowColor = `rgba(${m.rgb},0.8)`;
    ctx.shadowBlur = 6;
    roundRect(ctx, left, cy - 9, 10, 10, 2);
    ctx.shadowBlur = 0;
    ctx.font = SECTION_FONT;
    ctx.fillStyle = `rgba(${m.rgb},1)`;
    ctx.fillText(m.name, left + 16, cy);
    ctx.font = LABEL_FONT;
    ctx.fillStyle = "rgba(200,225,240,0.92)";
    ctx.fillText(m.text, left + 98, cy);
    cy += 20;
  }

  ctx.restore();
}

// A section title, then its moves as key chips with labels, wrapping onto more rows as needed.
// A mobile button already named for its move (DASH) gets no label. Returns the y below the section.
function drawMoveSection(ctx, title, moves, left, right, top, touchUi) {
  ctx.font = SECTION_FONT;
  ctx.fillStyle = "rgba(0,255,225,0.7)";
  ctx.fillText(title, left, top);

  let cx = left;
  let rowTop = top + 8;
  for (const move of moves) {
    const chip = touchUi ? move.tap : move.key;
    const label = chip === move.label.toUpperCase() ? "" : move.label;
    ctx.font = CHIP_FONT;
    const chipW = Math.ceil(ctx.measureText(chip).width) + 14;
    ctx.font = LABEL_FONT;
    const labelW = label ? Math.ceil(ctx.measureText(label).width) : 0;
    ctx.font = HOLD_FONT;
    const holdW = move.hold ? Math.ceil(ctx.measureText(" HOLD").width) + 2 : 0;
    const itemW = chipW + (label ? 6 : 0) + labelW + holdW;
    if (cx > left && cx + itemW > right) {
      cx = left;
      rowTop += ROW_H;
    }

    ctx.fillStyle = "rgba(120,205,255,0.1)";
    roundRect(ctx, cx, rowTop, chipW, CHIP_H, 5);
    ctx.strokeStyle = "rgba(120,205,255,0.7)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, cx + 0.5, rowTop + 0.5, chipW - 1, CHIP_H - 1, 5);
    ctx.stroke();
    ctx.font = CHIP_FONT;
    ctx.fillStyle = "rgba(240,255,255,0.98)";
    ctx.fillText(chip, cx + 7, rowTop + 15);

    const lx = cx + chipW + (label ? 6 : 0);
    if (label) {
      ctx.font = LABEL_FONT;
      ctx.fillStyle = "rgba(220,240,250,0.95)";
      ctx.fillText(label, lx, rowTop + 15);
    }
    if (move.hold) {
      ctx.font = HOLD_FONT;
      ctx.fillStyle = "rgba(255,200,110,0.9)";
      ctx.fillText(" HOLD", lx + labelW + 2, rowTop + 15);
    }
    cx += itemW + ITEM_GAP;
  }
  return rowTop + ROW_H;
}
