// src/render/hud/controls.js
// The GAME CONTROLS button and the controls panel it opens.

import { roundedRectPath } from "../../shared/canvas.js";
import { drawCachedPanel } from "./panelCache.js";
import { drawGlow, drawKeyChip, roundRect } from "./primitives.js";

export function drawControlsButton(ctx, rect, active = false, hot = false) {
  if (!rect) return;
  const key = `${rect.x}|${rect.y}|${rect.w}|${rect.h}|${active}|${hot}`;
  drawCachedPanel(ctx, "controlsButton", key, rect, (pctx) =>
    drawControlsButtonDirect(pctx, rect, active, hot)
  );
}

function drawControlsButtonDirect(ctx, rect, active, hot) {
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
  const label = "GAME CONTROLS";
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

export function drawControlsPanel(ctx, rect, COLORS) {
  if (!rect) return;
  const key = `${rect.x}|${rect.y}|${rect.w}|${rect.h}`;
  drawCachedPanel(ctx, "controlsPanel", key, rect, (pctx) =>
    drawControlsPanelDirect(pctx, rect, COLORS)
  );
}

function drawControlsPanelDirect(ctx, rect, COLORS) {
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

  // Diagonal light grid
  ctx.save();
  roundedRectPath(ctx, x + 4, y + 4, w - 8, h - 8, 12);
  ctx.clip();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(120,205,255,0.12)";
  ctx.lineWidth = 1;
  for (let gx = x + 20; gx < x + w + 40; gx += 28) {
    ctx.beginPath();
    ctx.moveTo(gx, y + 8);
    ctx.lineTo(gx - 40, y + h - 8);
    ctx.stroke();
  }
  ctx.restore();

  // Header bar
  ctx.fillStyle = "rgba(8,12,20,0.75)";
  roundRect(ctx, x + 16, y + 14, w - 32, 22, 8);
  ctx.strokeStyle = "rgba(0,255,225,0.45)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 16, y + 14, w - 32, 22, 8);
  ctx.stroke();

  ctx.fillStyle = "rgba(160,245,255,0.95)";
  ctx.font = "700 11px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("GAME CONTROLS", x + 26, y + 29);

  // Controls layout (centered Space row, centered W/S/D row)
  const topPad = 48;
  const warnH = 16;
  const warnGap = 10;
  const infoH = 16;
  const infoGap = 6;
  const info2H = 16;
  const info2Gap = 6;
  const available =
    h - topPad - warnH - infoH - info2H - warnGap - infoGap - info2Gap - 12;
  const rowGap = Math.max(44, Math.min(56, Math.floor(available / 2)));
  let rowY = y + topPad;

  ctx.save();
  ctx.font = "800 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const spaceW = Math.max(64, ctx.measureText("SPACE / LMB").width + 28);
  const wW = Math.max(64, ctx.measureText("W").width + 28);
  const aW = Math.max(64, ctx.measureText("A").width + 28);
  const sW = Math.max(64, ctx.measureText("S").width + 28);
  const dW = Math.max(64, ctx.measureText("D").width + 28);
  ctx.restore();

  const spaceX = x + (w - spaceW) / 2;
  drawKeyChip(ctx, "SPACE / LMB", "Jump / Double Jump", spaceX, rowY, COLORS);

  rowY += rowGap;
  const gap = 12;
  const rowWidth = wW + aW + sW + dW + gap * 3;
  let rowX = x + (w - rowWidth) / 2;
  drawKeyChip(ctx, "W", "Slowfall", rowX, rowY, COLORS);
  rowX += wW + gap;
  drawKeyChip(ctx, "A", "Backflip", rowX, rowY, COLORS);
  rowX += aW + gap;
  drawKeyChip(ctx, "S", "Duck/Dive", rowX, rowY, COLORS);
  rowX += sW + gap;
  drawKeyChip(ctx, "D", "Dash", rowX, rowY, COLORS);

  // Warning capsule
  const warnY = y + h - warnH - 10;
  const infoY = warnY - infoGap - infoH;
  const info2Y = infoY - info2Gap - info2H;
  ctx.fillStyle = "rgba(10,14,20,0.85)";
  roundRect(ctx, x + 16, info2Y, w - 32, info2H, 6);
  ctx.strokeStyle = "rgba(120,205,255,0.65)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 16, info2Y, w - 32, info2H, 6);
  ctx.stroke();
  ctx.font = "700 9px Orbitron, Share Tech Mono, Menlo, monospace";
  const dashPrefix = "DASH THROUGH ";
  const dashHot = "NON-REINFORCED";
  const dashSuffix = " BILLBOARDS.";
  let dashX = x + 22;
  const dashY = info2Y + 11;
  ctx.fillStyle = "rgba(180,235,255,0.95)";
  ctx.fillText(dashPrefix, dashX, dashY);
  dashX += ctx.measureText(dashPrefix).width;
  ctx.fillStyle = "rgba(255,120,120,0.98)";
  ctx.fillText(dashHot, dashX, dashY);
  dashX += ctx.measureText(dashHot).width;
  ctx.fillStyle = "rgba(180,235,255,0.95)";
  ctx.fillText(dashSuffix, dashX, dashY);

  ctx.fillStyle = "rgba(10,14,20,0.85)";
  roundRect(ctx, x + 16, infoY, w - 32, infoH, 6);
  ctx.strokeStyle = "rgba(120,205,255,0.65)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 16, infoY, w - 32, infoH, 6);
  ctx.stroke();
  ctx.fillStyle = "rgba(180,235,255,0.95)";
  ctx.font = "700 9px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("JUMP BOOST: HOLD W + JUMP + DASH.", x + 22, infoY + 11);

  ctx.fillStyle = "rgba(36,8,10,0.88)";
  roundRect(ctx, x + 16, warnY, w - 32, warnH, 6);
  ctx.strokeStyle = "rgba(255,120,120,0.75)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 16, warnY, w - 32, warnH, 6);
  ctx.stroke();
  ctx.font = "700 9px Orbitron, Share Tech Mono, Menlo, monospace";
  const warnPrefix = "WARNING: ";
  const warnHot = "NON-REINFORCED";
  const warnSuffix = " BUILDINGS BREAK.";
  let warnX = x + 22;
  const warnTextY = warnY + 11;
  ctx.fillStyle = "rgba(255,160,160,0.98)";
  ctx.fillText(warnPrefix, warnX, warnTextY);
  warnX += ctx.measureText(warnPrefix).width;
  ctx.fillStyle = "rgba(255,90,90,0.98)";
  ctx.fillText(warnHot, warnX, warnTextY);
  warnX += ctx.measureText(warnHot).width;
  ctx.fillStyle = "rgba(255,160,160,0.98)";
  ctx.fillText(warnSuffix, warnX, warnTextY);

  ctx.restore();
}
