// src/render/ui.js
// HUD + menus + small popups. Pure rendering; no DOM.

import {
  DASH_COOLDOWN,
  RESTART_FLYBY_SEC,
  RESTART_FLYBY_HOLD_SEC,
  RESTART_FLYBY_FADE_SEC,
  FLOAT_SCORE_MULT,
  DIVE_SCORE_BONUS,
} from "../game/constants.js";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

function centerText(ctx, text, x, y) {
  const m = ctx.measureText(text);
  ctx.fillText(text, x - m.width / 2, y);
}

function drawKeyChip(ctx, label, caption, x, y, COLORS, opts = {}) {
  const active = opts.active === true;
  const padX = 14;

  ctx.save();
  ctx.font = "800 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const lw = ctx.measureText(label).width;
  const w = Math.max(64, lw + padX * 2);
  const h = 40;
  const r = 12;

  // Outer glow + frame
  const glow = active ? "rgba(120,205,255,0.55)" : "rgba(120,205,255,0.22)";
  ctx.shadowColor = glow;
  ctx.shadowBlur = active ? 16 : 10;
  ctx.fillStyle = "rgba(8,10,16,0.85)";
  roundRect(ctx, x, y, w, h, r);
  ctx.shadowBlur = 0;

  // Body gradient
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "rgba(24,28,40,0.95)");
  body.addColorStop(1, "rgba(10,12,20,0.92)");
  ctx.fillStyle = body;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);

  // Stroke
  ctx.strokeStyle = active ? "rgba(120,205,255,0.9)" : "rgba(120,205,255,0.35)";
  ctx.lineWidth = active ? 2 : 1.25;
  roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();

  // Inner line
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 2.5, y + 2.5, w - 5, h - 5, r - 2);
  ctx.stroke();

  // Top scanline
  const scan = ctx.createLinearGradient(x, y, x + w, y);
  scan.addColorStop(0, "rgba(120,205,255,0)");
  scan.addColorStop(0.35, "rgba(120,205,255,0.12)");
  scan.addColorStop(0.65, "rgba(120,205,255,0.12)");
  scan.addColorStop(1, "rgba(120,205,255,0)");
  ctx.fillStyle = scan;
  ctx.fillRect(x + 6, y + 6, w - 12, 2);

  // Left notch
  ctx.fillStyle = active ? "rgba(120,205,255,0.35)" : "rgba(120,205,255,0.18)";
  ctx.fillRect(x + 6, y + 8, 3, h - 16);

  // Label
  ctx.fillStyle = "rgba(240,255,255,0.98)";
  ctx.font = "800 15px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  centerText(ctx, label, x + w / 2, y + 23);

  if (caption) {
    ctx.font = "600 11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(170,210,230,0.9)";
    centerText(ctx, caption, x + w / 2, y + 37);
  }

  ctx.restore();
  return w + 10; // width plus gap suggestion
}

function drawGlassPanel(ctx, x, y, w, h, radius = 18, alpha = 0.82) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, "rgba(15,17,24,0.92)");
  grd.addColorStop(1, "rgba(6,8,12,0.88)");

  ctx.fillStyle = grd;
  roundRect(ctx, x, y, w, h, radius);

  ctx.strokeStyle = "rgba(120,205,255,0.28)";
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, radius);
  ctx.stroke();

  // Inner highlight
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  roundedRectPath(ctx, x + 2.5, y + 2.5, w - 5, h - 5, radius - 2);
  ctx.stroke();

  ctx.restore();
}

function drawGlow(ctx, x, y, w, h, color = "rgba(120,205,255,0.25)", blur = 26) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawPillButton(ctx, label, x, y, w, h, active = false) {
  ctx.save();
  const radius = h / 2;
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, active ? "rgba(120,205,255,0.22)" : "rgba(255,255,255,0.10)");
  body.addColorStop(1, active ? "rgba(120,205,255,0.12)" : "rgba(255,255,255,0.08)");
  ctx.fillStyle = body;
  roundRect(ctx, x, y, w, h, radius);

  ctx.lineWidth = active ? 2 : 1.25;
  ctx.strokeStyle = active ? "rgba(120,205,255,0.85)" : "rgba(255,255,255,0.35)";
  roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();

  ctx.fillStyle = "rgba(242,242,242,0.95)";
  ctx.font = "800 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  centerText(ctx, label, x + w / 2, y + h / 2 + 6);
  ctx.restore();
}

function drawPortal(ctx, cx, cy, r, COLORS, pulseT = 0) {
  const ring = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  ring.addColorStop(0, "rgba(120,205,255,0.0)");
  ring.addColorStop(0.55, "rgba(120,205,255,0.28)");
  ring.addColorStop(0.78, "rgba(120,205,255,0.10)");
  ring.addColorStop(1, "rgba(0,0,0,0.0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Outer glow
  ctx.strokeStyle = "rgba(120,205,255,0.55)";
  ctx.lineWidth = 6 + 2 * Math.sin(pulseT * 2.5);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();

  // Inner particles
  const dots = 24;
  ctx.fillStyle = "rgba(120,205,255,0.65)";
  for (let i = 0; i < dots; i++) {
    const t = (i / dots) * Math.PI * 2 + pulseT * 1.2;
    const rr = r * (0.18 + 0.14 * Math.sin(t * 3.3 + pulseT));
    const x = cx + Math.cos(t) * rr * 0.6;
    const y = cy + Math.sin(t) * rr * 0.8;
    const s = 1.5 + 1.2 * Math.sin(t * 2.7 + pulseT * 1.7);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return "0";
  return Math.floor(n).toLocaleString("en-US");
}

function drawControlsRow(ctx, cx, y, COLORS, activeKey = null) {
  const controls = [
    { label: "SPACE", caption: "Jump / Double Jump" },
    { label: "W", caption: "Float" },
    { label: "D", caption: "Dash" },
    { label: "S", caption: "Dive" },
    { label: "A", caption: "Backflip" },
  ];

  // Measure total width
  ctx.save();
  ctx.font = "800 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  let total = -10; // initial gap offset
  const widths = controls.map((c) => {
    const lw = ctx.measureText(c.label).width;
    return Math.max(64, lw + 28);
  });
  widths.forEach((w) => total += w + 10);
  ctx.restore();

  let x = cx - total / 2;
  controls.forEach((c, i) => {
    const w = widths[i];
    drawKeyChip(ctx, c.label, c.caption, x, y, COLORS, { active: activeKey === c.label });
    x += w + 10;
  });
}

function drawHudPanelBezel(ctx, x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = "rgba(10,12,18,0.94)";
  roundRect(ctx, x, y, w, h, 14);

  ctx.strokeStyle = "rgba(20,24,34,0.92)";
  ctx.lineWidth = 6;
  roundedRectPath(ctx, x + 3, y + 3, w - 6, h - 6, 12);
  ctx.stroke();

  ctx.strokeStyle = "rgba(80,90,110,0.55)";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, x + 7, y + 7, w - 14, h - 14, 10);
  ctx.stroke();

  const bezel = ctx.createLinearGradient(x, y, x, y + h);
  bezel.addColorStop(0, "rgba(40,48,62,0.85)");
  bezel.addColorStop(0.5, "rgba(18,22,32,0.9)");
  bezel.addColorStop(1, "rgba(10,12,18,0.95)");
  ctx.fillStyle = bezel;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 12);

  ctx.fillStyle = "rgba(160,175,200,0.5)";
  const boltR = 2.2;
  const boltPts = [
    [x + 14, y + 14],
    [x + w - 14, y + 14],
    [x + 14, y + h - 14],
    [x + w - 14, y + h - 14],
  ];
  boltPts.forEach(([bx, by]) => {
    ctx.beginPath();
    ctx.arc(bx, by, boltR, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.save();
  roundedRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 11);
  ctx.clip();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let sy = y + 6; sy < y + h - 4; sy += 4) {
    ctx.fillRect(x + 2, sy, w - 4, 1);
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "rgba(0,255,208,0.16)";
  ctx.lineWidth = 1;
  for (let i = -1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 20 + i * 48, y + h);
    ctx.lineTo(x + 30 + i * 48, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

export function drawControlsButton(ctx, rect, active = false, hot = false) {
  if (!rect) return;
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
  const infoGap = 8;
  const available = h - topPad - warnH - infoH - warnGap - infoGap - 12;
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
  drawKeyChip(ctx, "W", "Float", rowX, rowY, COLORS);
  rowX += wW + gap;
  drawKeyChip(ctx, "A", "Backflip", rowX, rowY, COLORS);
  rowX += aW + gap;
  drawKeyChip(ctx, "S", "Dive", rowX, rowY, COLORS);
  rowX += sW + gap;
  drawKeyChip(ctx, "D", "Dash", rowX, rowY, COLORS);

  // Warning capsule
  const warnY = y + h - warnH - 10;
  const infoY = warnY - infoGap - infoH;
  ctx.fillStyle = "rgba(10,14,20,0.85)";
  roundRect(ctx, x + 16, infoY, w - 32, infoH, 6);
  ctx.strokeStyle = "rgba(120,205,255,0.65)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 16, infoY, w - 32, infoH, 6);
  ctx.stroke();
  ctx.fillStyle = "rgba(180,235,255,0.95)";
  ctx.font = "700 9px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("JUMP BOOST: HOLD W + JUMP + DASH.", x + 22, infoY + 11);

  ctx.fillStyle = "rgba(10,14,20,0.85)";
  roundRect(ctx, x + 16, warnY, w - 32, warnH, 6);
  ctx.strokeStyle = "rgba(255,160,120,0.65)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 16, warnY, w - 32, warnH, 6);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,210,170,0.95)";
  ctx.font = "700 9px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("WARNING: NON-REINFORCED BUILDINGS BREAK.", x + 22, warnY + 11);

  ctx.restore();
}

function drawMenuPanel(ctx, x, y, w, h, COLORS) {
  // Dark underlay prevents world elements from reading through.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  roundRect(ctx, x, y, w, h, 16);

  ctx.fillStyle = COLORS.menuPanel;
  roundRect(ctx, x, y, w, h, 16);

  ctx.strokeStyle = "rgba(242,242,242,0.10)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 16);
  ctx.stroke();
  ctx.restore();
}

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

  ctx.restore();
  return true;
}

export function drawHUD(ctx, state, danger01, COLORS) {
  const player = state.player;
  const uiT = state.uiTime || 0;
  const introT = state.hudIntroT || 0;
  const introK = clamp(introT / 0.55, 0, 1);
  const introEase = 1 - Math.pow(1 - introK, 3);

  ctx.save();
  // Retro neon HUD: score module top-left
  const x = 14;
  const y = 12;
  const w = 272;
  const h = 74;
  const slideX = -(w + x + 24) * (1 - introEase);
  if (slideX) ctx.translate(slideX, 0);
  const pulse = 0.55 + 0.45 * Math.sin(uiT * 2.4);
  const neon = `rgba(0,255,208,${0.55 + 0.25 * pulse})`;
  const neonSoft = "rgba(0,255,208,0.18)";

  // Chunky arcade bezel
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(10,12,18,0.92)";
  roundRect(ctx, x, y, w, h, 14);

  // Outer thick border
  ctx.strokeStyle = "rgba(20,24,34,0.9)";
  ctx.lineWidth = 6;
  roundedRectPath(ctx, x + 3, y + 3, w - 6, h - 6, 12);
  ctx.stroke();

  // Inner lip
  ctx.strokeStyle = "rgba(80,90,110,0.55)";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, x + 7, y + 7, w - 14, h - 14, 10);
  ctx.stroke();

  // Bezel gradient band
  const bezel = ctx.createLinearGradient(x, y, x, y + h);
  bezel.addColorStop(0, "rgba(40,48,62,0.85)");
  bezel.addColorStop(0.5, "rgba(18,22,32,0.9)");
  bezel.addColorStop(1, "rgba(10,12,18,0.95)");
  ctx.fillStyle = bezel;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 12);

  // Bolt details
  ctx.fillStyle = "rgba(160,175,200,0.5)";
  const boltR = 2.2;
  const boltPts = [
    [x + 14, y + 14],
    [x + w - 14, y + 14],
    [x + 14, y + h - 14],
    [x + w - 14, y + h - 14],
  ];
  boltPts.forEach(([bx, by]) => {
    ctx.beginPath();
    ctx.arc(bx, by, boltR, 0, Math.PI * 2);
    ctx.fill();
  });

  // Scanlines + diagonal shimmer
  ctx.save();
  roundedRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 11);
  ctx.clip();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let sy = y + 6; sy < y + h; sy += 4) {
    ctx.fillRect(x, sy, w, 1);
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "rgba(0,255,208,0.18)";
  ctx.lineWidth = 1;
  for (let i = -1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 20 + i * 48, y + h);
    ctx.lineTo(x + 30 + i * 48, y);
    ctx.stroke();
  }
  ctx.restore();

  // Score
  const baseScore = Number.isFinite(state.score) ? state.score : (state.distance || 0);
  const hudScore = Math.floor(baseScore);
  const scoreText = String(hudScore).padStart(6, "0");
  ctx.fillStyle = "rgba(150,245,255,0.75)";
  ctx.font = "700 11px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("SCORE", x + 14, y + 22);

  ctx.fillStyle = "rgba(220,255,255,0.98)";
  ctx.font = "800 28px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.fillText(scoreText, x + 14, y + 52);

  // Distance line
  const hudDistance = Math.floor(state.distance || 0);
  ctx.fillStyle = "rgba(120,220,255,0.75)";
  ctx.font = "600 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText(`DIST ${hudDistance}`, x + 14, y + 66);

  // Right-side status strip
  const statX = x + w - 88;
  const statW = 74;
  ctx.fillStyle = "rgba(8,12,20,0.65)";
  roundRect(ctx, statX - 6, y + 10, statW + 10, 52, 8);

  ctx.fillStyle = "rgba(180,250,255,0.8)";
  ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("JMP", statX, y + 24);
  ctx.fillStyle = "rgba(240,255,255,0.95)";
  ctx.font = "800 12px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.fillText(`${player.jumpsRemaining}`, statX + 32, y + 24);

  const fuelMax = Number.isFinite(player.floatFuelMax) ? player.floatFuelMax : 0.38;
  const fuel01 = Number.isFinite(player.floatFuel)
    ? clamp(fuelMax > 0 ? player.floatFuel / fuelMax : 0, 0, 1)
    : 0;
  const dashCd = Number.isFinite(player.dashCooldown) ? player.dashCooldown : 0;
  const dash01 = clamp(1 - (dashCd / Math.max(0.001, DASH_COOLDOWN)), 0, 1);

  const barY1 = y + 34;
  const barY2 = y + 50;
  ctx.fillStyle = "rgba(16,22,34,0.9)";
  ctx.fillRect(statX, barY1, statW, 6);
  ctx.fillRect(statX, barY2, statW, 6);

  ctx.fillStyle = "rgba(0,255,208,0.85)";
  ctx.fillRect(statX, barY1, Math.floor(statW * fuel01), 6);
  ctx.fillStyle = dash01 >= 1 ? "rgba(255,110,180,0.9)" : "rgba(120,120,255,0.75)";
  ctx.fillRect(statX, barY2, Math.floor(statW * dash01), 6);

  ctx.fillStyle = "rgba(160,230,255,0.65)";
  ctx.font = "700 8px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("FUEL", statX, barY1 - 2);
  ctx.fillText("DASH", statX, barY2 - 2);

  ctx.restore();
}

export function drawCenterScore(ctx, state, W, H) {
  const w = Number.isFinite(W) ? W : 800;
  const h = Number.isFinite(H) ? H : 450;
  const baseScore = Number.isFinite(state.score) ? state.score : (state.distance || 0);
  const displayScore = Number.isFinite(state.scoreTally) ? state.scoreTally : baseScore;
  const hudScore = Math.floor(displayScore);
  const scoreText = String(hudScore).padStart(6, "0");
  const glide = Math.floor(state.glideDistance || 0);
  const dives = Math.floor(state.diveCount || 0);
  const dist = Math.floor(state.distance || 0);
  const boardIntro = 0.25;
  const boardT = Number.isFinite(state.scoreBoardT) ? state.scoreBoardT : 0;
  const boardK = Math.max(0, Math.min(1, boardT / boardIntro));
  const uiT = Number.isFinite(state.uiTime) ? state.uiTime : 0;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const cx = w * 0.5;
  const cy = h * 0.5;

  const panelW = Math.min(460, w * 0.74);
  const panelH = 230;
  const panelX = cx - panelW / 2;
  const finalPanelY = cy - panelH / 2 - 6;
  const startPanelY = -panelH - 40;
  const panelY = startPanelY + (finalPanelY - startPanelY) * boardK;

  const sway = 0;
  const stringTop = -200;
  const stringLeftX = panelX + panelW * 0.26 + sway;
  const stringRightX = panelX + panelW * 0.74 + sway;

  ctx.save();
  ctx.globalAlpha = 0.98 * boardK;
  // Cyberpunk hanging rig: top rail, chains, clamps.
  // Heavy steel rail
  const railGrad = ctx.createLinearGradient(panelX, stringTop - 6, panelX, stringTop + 6);
  railGrad.addColorStop(0, "rgba(55,65,78,0.95)");
  railGrad.addColorStop(0.5, "rgba(95,110,128,0.95)");
  railGrad.addColorStop(1, "rgba(40,50,62,0.95)");
  ctx.strokeStyle = railGrad;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(panelX + panelW * 0.18, stringTop);
  ctx.lineTo(panelX + panelW * 0.82, stringTop);
  ctx.stroke();

  // Twin metal rods with inner highlight
  ctx.strokeStyle = "rgba(120,140,160,0.95)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(stringLeftX, stringTop);
  ctx.lineTo(stringLeftX, panelY + 6);
  ctx.moveTo(stringRightX, stringTop);
  ctx.lineTo(stringRightX, panelY + 6);
  ctx.stroke();

  ctx.strokeStyle = "rgba(190,210,230,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(stringLeftX - 1, stringTop + 6);
  ctx.lineTo(stringLeftX - 1, panelY + 2);
  ctx.moveTo(stringRightX - 1, stringTop + 6);
  ctx.lineTo(stringRightX - 1, panelY + 2);
  ctx.stroke();

  // Off-screen mount edge + brackets
  ctx.fillStyle = "rgba(18,22,30,0.98)";
  ctx.fillRect(panelX - 26, stringTop - 16, panelW + 52, 22);
  ctx.fillStyle = "rgba(90,100,116,0.95)";
  ctx.fillRect(panelX - 26, stringTop - 16, panelW + 52, 4);
  ctx.fillStyle = "rgba(40,48,60,0.95)";
  ctx.fillRect(panelX - 26, stringTop - 2, panelW + 52, 2);

  ctx.fillStyle = "rgba(120,135,150,0.85)";
  ctx.fillRect(stringLeftX - 9, stringTop - 6, 18, 12);
  ctx.fillRect(stringRightX - 9, stringTop - 6, 18, 12);
  ctx.fillStyle = "rgba(160,180,200,0.9)";
  ctx.fillRect(stringLeftX - 7, stringTop - 4, 14, 2);
  ctx.fillRect(stringRightX - 7, stringTop - 4, 14, 2);

  // Bolts
  ctx.fillStyle = "rgba(50,60,75,0.9)";
  ctx.beginPath();
  ctx.arc(stringLeftX - 5, stringTop - 2, 2, 0, Math.PI * 2);
  ctx.arc(stringLeftX + 5, stringTop - 2, 2, 0, Math.PI * 2);
  ctx.arc(stringRightX - 5, stringTop - 2, 2, 0, Math.PI * 2);
  ctx.arc(stringRightX + 5, stringTop - 2, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(24,32,44,0.98)";
  ctx.fillRect(stringLeftX - 9, panelY + 1, 18, 9);
  ctx.fillRect(stringRightX - 9, panelY + 1, 18, 9);
  ctx.fillStyle = "rgba(120,205,255,0.40)";
  ctx.fillRect(stringLeftX - 7, panelY + 4, 14, 2);
  ctx.fillRect(stringRightX - 7, panelY + 4, 14, 2);

  // Panel body: HUD-matched chunky bezel + scanlines
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(10,12,18,0.94)";
  roundRect(ctx, panelX, panelY, panelW, panelH, 14);

  // Outer thick border
  ctx.strokeStyle = "rgba(20,24,34,0.92)";
  ctx.lineWidth = 6;
  roundedRectPath(ctx, panelX + 3, panelY + 3, panelW - 6, panelH - 6, 12);
  ctx.stroke();

  // Inner lip
  ctx.strokeStyle = "rgba(80,90,110,0.55)";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, panelX + 7, panelY + 7, panelW - 14, panelH - 14, 10);
  ctx.stroke();

  // Bezel gradient band
  const bezel = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
  bezel.addColorStop(0, "rgba(40,48,62,0.85)");
  bezel.addColorStop(0.5, "rgba(18,22,32,0.9)");
  bezel.addColorStop(1, "rgba(10,12,18,0.95)");
  ctx.fillStyle = bezel;
  roundRect(ctx, panelX + 2, panelY + 2, panelW - 4, panelH - 4, 12);

  // Bolt details
  ctx.fillStyle = "rgba(160,175,200,0.5)";
  const boltR = 2.3;
  const boltPts = [
    [panelX + 16, panelY + 16],
    [panelX + panelW - 16, panelY + 16],
    [panelX + 16, panelY + panelH - 16],
    [panelX + panelW - 16, panelY + panelH - 16],
  ];
  boltPts.forEach(([bx, by]) => {
    ctx.beginPath();
    ctx.arc(bx, by, boltR, 0, Math.PI * 2);
    ctx.fill();
  });

  // Scanlines + diagonal shimmer
  ctx.save();
  roundedRectPath(ctx, panelX + 1, panelY + 1, panelW - 2, panelH - 2, 11);
  ctx.clip();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  for (let sy = panelY + 8; sy < panelY + panelH - 6; sy += 4) {
    ctx.fillRect(panelX + 2, sy, panelW - 4, 1);
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "rgba(0,255,208,0.16)";
  ctx.lineWidth = 1;
  for (let i = -1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(panelX - 20 + i * 48, panelY + panelH);
    ctx.lineTo(panelX + 30 + i * 48, panelY);
    ctx.stroke();
  }
  ctx.restore();

  // Header bar
  ctx.fillStyle = "rgba(8,12,20,0.7)";
  roundRect(ctx, panelX + 18, panelY + 18, panelW - 36, 24, 8);
  ctx.strokeStyle = "rgba(120,205,255,0.35)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, panelX + 18, panelY + 18, panelW - 36, 24, 8);
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = boardK;
  ctx.fillStyle = "rgba(160,245,255,0.9)";
  ctx.font = "700 12px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("RUN SUMMARY", cx, panelY + 35);

  ctx.textAlign = "left";
  const left = panelX + 26;
  const right = panelX + panelW - 26;
  const rowY = panelY + 66;
  const rowH = 26;
  const pillH = 20;
  const pillW = 160;

  // Row backgrounds
  ctx.fillStyle = "rgba(8,12,18,0.78)";
  roundRect(ctx, left - 8, rowY - 16, panelW - 36, 24, 8);
  roundRect(ctx, left - 8, rowY + rowH - 16, panelW - 36, 24, 8);
  roundRect(ctx, left - 8, rowY + rowH * 2 - 16, panelW - 36, 24, 8);

  // Left label chips
  const labelGrad = ctx.createLinearGradient(left, 0, left + pillW, 0);
  labelGrad.addColorStop(0, "rgba(120,200,255,0.26)");
  labelGrad.addColorStop(1, "rgba(90,120,160,0.18)");
  ctx.fillStyle = labelGrad;
  roundRect(ctx, left - 2, rowY - 22, pillW, pillH, 8);
  roundRect(ctx, left - 2, rowY + rowH - 22, pillW, pillH, 8);
  roundRect(ctx, left - 2, rowY + rowH * 2 - 22, pillW, pillH, 8);

  ctx.fillStyle = "rgba(160,235,255,0.95)";
  ctx.font = "700 11px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("HOVER DISTANCE", left + 8, rowY - 6);
  ctx.fillText("DIVE COUNT", left + 8, rowY + rowH - 6);
  ctx.fillText("DISTANCE RAN", left + 8, rowY + rowH * 2 - 6);

  // Right values
  ctx.textAlign = "right";
  const valuePillW = 156;
  const valuePillH = 20;
  const valueX = right - valuePillW + 4;
  const valueGrad = ctx.createLinearGradient(valueX, 0, valueX + valuePillW, 0);
  valueGrad.addColorStop(0, "rgba(12,18,28,0.92)");
  valueGrad.addColorStop(1, "rgba(20,28,42,0.92)");
  ctx.fillStyle = valueGrad;
  roundRect(ctx, valueX, rowY - 22, valuePillW, valuePillH, 8);
  roundRect(ctx, valueX, rowY + rowH - 22, valuePillW, valuePillH, 8);
  roundRect(ctx, valueX, rowY + rowH * 2 - 22, valuePillW, valuePillH, 8);

  ctx.strokeStyle = "rgba(120,205,255,0.25)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, valueX + 0.5, rowY - 21.5, valuePillW - 1, valuePillH - 1, 8);
  ctx.stroke();
  roundedRectPath(ctx, valueX + 0.5, rowY + rowH - 21.5, valuePillW - 1, valuePillH - 1, 8);
  ctx.stroke();
  roundedRectPath(ctx, valueX + 0.5, rowY + rowH * 2 - 21.5, valuePillW - 1, valuePillH - 1, 8);
  ctx.stroke();

  ctx.fillStyle = "rgba(240,255,255,0.98)";
  ctx.font = "800 13px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.fillText(`${formatNumber(glide)}  x${FLOAT_SCORE_MULT}`, right, rowY - 6);
  ctx.fillText(`${formatNumber(dives)}  x${DIVE_SCORE_BONUS}`, right, rowY + rowH - 6);
  ctx.fillText(`${formatNumber(dist)}`, right, rowY + rowH * 2 - 6);

  // Divider
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(120,205,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelX + 20, panelY + 146);
  ctx.lineTo(panelX + panelW - 20, panelY + 146);
  ctx.stroke();

  // Total score capsule
  const pillX = panelX + 40;
  const pillY = panelY + 162;
  const pillW2 = panelW - 80;
  const pillH2 = 54;
  ctx.fillStyle = "rgba(8,12,18,0.8)";
  roundRect(ctx, pillX, pillY, pillW2, pillH2, 14);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(120,205,255,0.12)";
  roundRect(ctx, pillX + 4, pillY + 4, pillW2 - 8, 16, 10);
  ctx.restore();
  ctx.strokeStyle = "rgba(120,205,255,0.45)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, pillX, pillY, pillW2, pillH2, 14);
  ctx.stroke();

  // Total score label inside the pill (HUD style)
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(150,245,255,0.75)";
  ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("TOTAL SCORE", pillX + 16, pillY + 17);

  // Auto-scale score to fit the pill width
  const maxScoreWidth = pillW2 - 34;
  let scoreFontSize = 40;
  ctx.font = `800 ${scoreFontSize}px Share Tech Mono, Orbitron, Menlo, monospace`;
  let scoreWidth = ctx.measureText(scoreText).width;
  if (scoreWidth > maxScoreWidth) {
    scoreFontSize = Math.max(28, Math.floor(scoreFontSize * (maxScoreWidth / scoreWidth)));
    ctx.font = `800 ${scoreFontSize}px Share Tech Mono, Orbitron, Menlo, monospace`;
    scoreWidth = ctx.measureText(scoreText).width;
  }

  ctx.shadowColor = "rgba(80,255,220,0.7)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "rgba(240,255,255,0.98)";
  ctx.textAlign = "center";
  ctx.fillText(scoreText, cx, pillY + 40 + (40 - scoreFontSize) * 0.3);

  ctx.restore();
}

// drawMenus moved to src/render/menu.js
