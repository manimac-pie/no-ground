// src/render/ui.js
// HUD + menus + small popups. Pure rendering; no DOM.

import {
  DASH_COOLDOWN,
  PLAYER_X,
  RESTART_FLYBY_SEC,
  RESTART_FLYBY_HOLD_SEC,
  RESTART_FLYBY_FADE_SEC,
  RUN_SUMMARY_DROP_SEC,
  LEADERBOARD_SLIDE_DELAY_SEC,
  LEADERBOARD_SLIDE_SEC,
} from "../game/constants.js";
import { airMultiplier, buildSummaryRows, formatMult, tallyRowSec } from "../game/score.js";
import {
  getLeaderboardState,
  LEADERBOARD_MAX_ENTRIES,
} from "../ui/leaderboardState.js";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Ease out with a small overshoot, so a dropped panel settles into place.
function easeOutBack(t, overshoot = 1.2) {
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
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

// ---------------- cached panels ----------------
// Static UI pieces are painted once into an offscreen canvas at the exact device
// scale and stamped with drawImage each frame. A piece is repainted only when its
// content key, the scale, or its device-pixel offset changes (resize, hover, new data).
const PANEL_PAD_DEVICE = 40; // device px around the box, for shadows and glows
const panelCache = new Map(); // slot -> { key, canvas, result }

// Paint state a piece may inherit from the caller (e.g. a shadow left on by earlier
// drawing). Fill and stroke styles aren't included: every cached piece sets its own.
const INHERITED_PROPS = [
  "lineWidth", "lineCap", "lineJoin", "miterLimit", "font", "textAlign", "textBaseline",
  "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY",
];

// box: the piece's bounds in UI units. draw(ctx) paints it at its normal coordinates.
// Returns whatever draw returned when the piece was last painted.
function drawCachedPanel(ctx, slot, contentKey, box, draw) {
  const m = ctx.getTransform();
  // A cached image can't reproduce per-shape alpha, blend modes or filters: draw directly.
  const plain =
    ctx.globalAlpha === 1 &&
    ctx.globalCompositeOperation === "source-over" &&
    (ctx.filter === undefined || ctx.filter === "none");
  if (!plain || m.b !== 0 || m.c !== 0 || m.a <= 0 || m.d <= 0) return draw(ctx);

  // Device-pixel bounds of the piece plus padding, clipped to the canvas.
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  const intX = Math.max(0, Math.floor(m.a * box.x + m.e) - PANEL_PAD_DEVICE);
  const intY = Math.max(0, Math.floor(m.d * box.y + m.f) - PANEL_PAD_DEVICE);
  const right = Math.min(canvasW, Math.ceil(m.a * (box.x + box.w) + m.e) + PANEL_PAD_DEVICE);
  const bottom = Math.min(canvasH, Math.ceil(m.d * (box.y + box.h) + m.f) + PANEL_PAD_DEVICE);
  const width = right - intX;
  const height = bottom - intY;
  if (width <= 0 || height <= 0) return draw(ctx);
  const tx = m.e - intX;
  const ty = m.f - intY;
  const inherited = INHERITED_PROPS.map((prop) => ctx[prop]);
  const key = `${contentKey}|${m.a}|${m.d}|${tx}|${ty}|${width}|${height}|${inherited.join("|")}`;

  let entry = panelCache.get(slot);
  if (!entry) {
    entry = { key: "", canvas: document.createElement("canvas"), result: undefined };
    panelCache.set(slot, entry);
  }
  if (entry.key !== key) {
    const canvas = entry.canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const pctx = canvas.getContext("2d");
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, width, height);
    pctx.save();
    INHERITED_PROPS.forEach((prop, i) => {
      pctx[prop] = inherited[i];
    });
    pctx.setTransform(m.a, 0, 0, m.d, tx, ty);
    entry.result = draw(pctx);
    pctx.restore();
    entry.key = key;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = "transparent"; // any inherited shadow is already baked in
  ctx.shadowBlur = 0;
  ctx.drawImage(entry.canvas, intX, intY);
  ctx.restore();
  return entry.result;
}

export function drawLeaderboardPanel(ctx, entries, myBest, x, y, w, h, alpha = 1, opts = {}) {
  if (alpha <= 0 || !Number.isFinite(w) || !Number.isFinite(h)) return;
  // Fading in: draw directly (group alpha on a cached image would blend differently).
  if (alpha < 1) return drawLeaderboardPanelDirect(ctx, entries, myBest, x, y, w, h, alpha, opts);

  const list = Array.isArray(entries) ? entries : [];
  const key = [
    x, y, w, h, myBest,
    opts.glow, opts.arrow, opts.arrowDirection, opts.rowCount, opts.rowHeight, opts.bestLabel, opts.collapsedLayout,
    ...list.map((e) => `${e?.name}:${e?.score}`),
  ].join("|");
  return drawCachedPanel(ctx, "leaderboard", key, { x, y, w, h }, (pctx) =>
    drawLeaderboardPanelDirect(pctx, entries, myBest, x, y, w, h, 1, opts)
  );
}

function drawLeaderboardPanelDirect(
  ctx,
  entries,
  myBest,
  x,
  y,
  w,
  h,
  alpha = 1,
  opts = {}
) {

  ctx.save();
  ctx.globalAlpha = alpha;
  const {
    glow = false,
    arrow = false,
    arrowDirection = "down",
    rowCount = 3,
    rowHeight = 24,
    bestLabel = "Best Score",
    collapsedLayout = false,
  } = opts;

  // Base panel (dark with soft bevel like run summary)
  ctx.fillStyle = "rgba(4,8,20,0.96)";
  roundRect(ctx, x, y, w, h, 18);

  if (glow) {
    ctx.shadowColor = "rgba(120,205,255,0.45)";
    ctx.shadowBlur = 20;
  }
  const panelBorder = ctx.createLinearGradient(x, y, x, y + h);
  panelBorder.addColorStop(0, "rgba(120,205,255,0.25)");
  panelBorder.addColorStop(0.6, "rgba(15,25,38,0.1)");
  panelBorder.addColorStop(1, "rgba(8,12,18,0.6)");
  ctx.strokeStyle = panelBorder;
  ctx.lineWidth = 4;
  roundedRectPath(ctx, x + 2, y + 2, w - 4, h - 4, 14);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(120,205,255,0.12)";
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, x + 8, y + 8, w - 16, h - 16, 10);
  ctx.stroke();

  const headerHeight = 36;
  const headerY = y + 10;
  const headerLeft = x + 10;
  const headerWidth = w - 20;
  ctx.fillStyle = "rgba(8,14,28,0.72)";
  roundRect(ctx, headerLeft, headerY, headerWidth, headerHeight, 10);

  ctx.fillStyle = "rgba(160,245,255,0.95)";
  ctx.font = "700 14px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText("LEADERBOARD", x + w / 2, headerY + 24);

  const entryYStart = headerY + headerHeight + 6;
  const rowHeightVal = Number.isFinite(rowHeight) ? rowHeight : 24;
  const maxRows = Math.max(
    Math.ceil(rowCount),
    Math.max(3, Math.floor((h - entryYStart - 70) / rowHeightVal))
  );
  const desiredRows = Math.max(1, Math.min(Math.floor(rowCount), maxRows));
  const visibleRows = Math.min(LEADERBOARD_MAX_ENTRIES, desiredRows);
  const sourceEntries = Array.isArray(entries) ? entries : [];
  const fetchedRows = sourceEntries.slice(0, visibleRows);
  const rows = [];
  for (let i = 0; i < visibleRows; i += 1) {
    if (i < fetchedRows.length) {
      rows.push(fetchedRows[i]);
    } else {
      rows.push(null);
    }
  }

  const labelX = x + 16;
  const scoreX = x + w - 12;
  ctx.font = "600 14px Share Tech Mono, Orbitron, Menlo, monospace";

  rows.forEach((entry, idx) => {
    const rowY = entryYStart + idx * rowHeightVal;
    const name = entry && typeof entry.name === "string" ? entry.name : "—";
    const hasScore = entry && Number.isFinite(entry.score);
    const scoreText = hasScore ? formatNumber(entry.score) : "—";

    ctx.textAlign = "left";
    ctx.fillStyle = idx === 0 ? "rgba(255,235,220,0.95)" : "rgba(220,240,255,0.82)";
    ctx.fillText(`${idx + 1}. ${name}`, labelX, rowY);

    ctx.textAlign = "right";
    ctx.fillText(scoreText, scoreX, rowY);
  });

  const baseRowsBottom = entryYStart + rows.length * rowHeightVal;
  const buttonSpacing = collapsedLayout ? 8 : 4;
  const dividerSpacing = collapsedLayout ? 12 : 6;
  let arrowRect = null;
  let buttonY = 0;
  const buttonHeight = arrow ? 20 : 0;
  if (arrow) {
    const buttonWidth = Math.min(220, w - 24);
    buttonY = baseRowsBottom + buttonSpacing;
    arrowRect = {
      x: x + (w - buttonWidth) / 2,
      y: buttonY,
      w: buttonWidth,
      h: buttonHeight,
    };

    ctx.fillStyle = "rgba(8,12,20,0.95)";
    roundRect(ctx, arrowRect.x, arrowRect.y, arrowRect.w, arrowRect.h, arrowRect.h / 2);
    ctx.strokeStyle = "rgba(120,205,255,0.6)";
    ctx.lineWidth = 1.5;
    roundedRectPath(
      ctx,
      arrowRect.x + 0.5,
      arrowRect.y + 0.5,
      arrowRect.w - 1,
      arrowRect.h - 1,
      arrowRect.h / 2
    );
    ctx.stroke();

    ctx.font = "600 10px Orbitron, Share Tech Mono, monospace";
    ctx.fillStyle = "rgba(170,210,230,0.85)";
    const label = arrowDirection === "down" ? "Top 10" : "Collapse";
    const labelWidth = ctx.measureText(label).width;
    const arrowSize = 10;
    const spacing = 8;
    const totalWidth = labelWidth + spacing + arrowSize;
    const textX = arrowRect.x + (arrowRect.w - totalWidth) / 2;
    const textY = arrowRect.y + arrowRect.h / 2 + 4;
    ctx.textAlign = "left";
    ctx.fillText(label, textX, textY);

    const arrowX = textX + labelWidth + spacing;
    const arrowCenterY = arrowRect.y + arrowRect.h / 2 + 1;
    ctx.fillStyle = "rgba(120,205,255,0.95)";
    ctx.beginPath();
    if (arrowDirection === "down") {
      ctx.moveTo(arrowX, arrowCenterY - arrowSize / 4);
      ctx.lineTo(arrowX + arrowSize, arrowCenterY - arrowSize / 4);
      ctx.lineTo(arrowX + arrowSize / 2, arrowCenterY + arrowSize / 3);
    } else {
      ctx.moveTo(arrowX, arrowCenterY + arrowSize / 4);
      ctx.lineTo(arrowX + arrowSize, arrowCenterY + arrowSize / 4);
      ctx.lineTo(arrowX + arrowSize / 2, arrowCenterY - arrowSize / 3);
    }
    ctx.closePath();
    ctx.fill();
  }

  const dividerY = arrow
    ? buttonY + buttonHeight + dividerSpacing
    : baseRowsBottom + dividerSpacing;

  ctx.strokeStyle = "rgba(120,205,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const linePad = 24;
  ctx.moveTo(x + linePad, dividerY);
  ctx.lineTo(x + w - linePad, dividerY);
  ctx.stroke();

  const bestLabelY = dividerY + (collapsedLayout ? 14 : 16);
  const bestScoreY = Math.min(
    bestLabelY + (collapsedLayout ? 28 : 20),
    y + h - 10
  );
  ctx.font = "600 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillStyle = "rgba(150,210,230,0.7)";
  ctx.textAlign = "left";
  ctx.fillText(bestLabel, labelX, bestLabelY);

  ctx.font = "800 28px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(240,255,255,0.9)";
  ctx.fillText(formatNumber(myBest), scoreX, bestScoreY);

  ctx.restore();

  return { arrowRect };
}

function drawControlsRow(ctx, cx, y, COLORS, activeKey = null) {
  const controls = [
    { label: "SPACE", caption: "Jump / Double Jump" },
    { label: "W", caption: "Slowfall" },
    { label: "D", caption: "Dash" },
    { label: "S", caption: "Duck/Dive" },
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

// ---------------- HUD feedback ----------------
const SCORE_PULSE_SEC = 0.3;
const BEST_FLASH_SEC = 1.2;
const LOW_FUEL_FRAC = 0.2;
const JUMP_DOTS = 2;              // jumps per landing
const DASH_READY_FLASH_SEC = 0.6; // READY flash when the dash cooldown ends
const POPUP_LIFE_SEC = 0.9;
let _hudBestValue = -1;
let _hudBestText = "";
let _hudComboValue = -1;
let _hudComboText = "";
let _hudDashWasReady = true; // for the READY flash when the dash cooldown ends
let _hudDashReadyT = -1;     // uiTime the cooldown last ended
let _hudDashSeenT = -1;      // uiTime the HUD last checked it (skips a stale flash on a new run)
let _hudDanger = 0;
let _hudDangerT = -1;
let _vignette = null; // { w, h, gradient }

// True when a roof is under (or just ahead of) Bob's feet, so a fall isn't fatal.
function hasRoofBelow(state, p) {
  const feet = p.y + p.h;
  const reachX = p.x + p.w + 40; // roofs scroll toward Bob
  for (const plat of state.platforms) {
    if (plat.collapsing) continue;
    if (plat.y + 1 < feet) continue;
    if (plat.x < reachX && plat.x + plat.w > p.x) return true;
  }
  return false;
}

// Ground danger for the HUD (0..1, smoothed). Only while actually falling toward the
// ground with nothing to land on, so standing on a low roof doesn't light it up.
export function computeHudDanger(state, danger01) {
  const p = state.player;
  const now = state.uiTime || 0;
  const dt = _hudDangerT >= 0 ? clamp(now - _hudDangerT, 0, 0.1) : 0;
  _hudDangerT = now;

  let target = 0;
  if (state.running && p && !p.onGround && (p.vy || 0) > 0 && danger01 > 0 && !hasRoofBelow(state, p)) {
    target = danger01;
  }
  const rate = target > _hudDanger ? 12 : 4;
  _hudDanger += (target - _hudDanger) * (1 - Math.exp(-rate * dt));
  if (_hudDanger < 0.002) _hudDanger = 0;
  return _hudDanger;
}

// Faint red edge vignette (screen space), scaled by danger.
export function drawDangerVignette(ctx, W, H, danger) {
  if (!(danger > 0.01)) return;
  if (!_vignette || _vignette.w !== W || _vignette.h !== H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, "rgba(255,40,70,0)");
    g.addColorStop(1, "rgba(255,40,70,1)");
    _vignette = { w: W, h: H, gradient: g };
  }
  ctx.save();
  ctx.globalAlpha = 0.32 * danger;
  ctx.fillStyle = _vignette.gradient;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Rising "+130 AD BREAK" text above Bob (world space). Reads state.scoreEvents only.
export function drawScorePopups(ctx, state) {
  const events = state.scoreEvents;
  if (!events) return;
  const now = state.uiTime || 0;
  // Ride up with Bob while he's rising so the text never sits on top of him.
  const playerTop = state.player ? state.player.y : Infinity;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "800 13px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.shadowColor = "rgba(80,255,220,0.7)";
  ctx.shadowBlur = 10;
  for (const ev of events) {
    if (ev.t < 0) continue;
    const age = now - ev.t;
    if (age < 0 || age > POPUP_LIFE_SEC) continue;
    const k = age / POPUP_LIFE_SEC;
    const rise = 34 * easeOutCubic(k);
    const pop = age < 0.12 ? 1.3 - 0.3 * (age / 0.12) : 1;
    ctx.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
    ctx.save();
    ctx.translate(ev.x, Math.min(ev.y, playerTop) - 10 - rise - ev.stack * 15);
    ctx.scale(pop, pop);
    ctx.fillStyle = ev.amount >= 100 ? "rgba(255,215,120,0.98)" : "rgba(220,255,255,0.98)";
    ctx.fillText(ev.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function drawHUD(ctx, state, danger01, COLORS) {
  const player = state.player;
  const introT = state.hudIntroT || 0;
  const introK = clamp(introT / 0.55, 0, 1);
  const introEase = 1 - Math.pow(1 - introK, 3);

  ctx.save();
  // Retro neon HUD: score module along the top, pinned just right of Bob's column
  // (he always runs at PLAYER_X, so a top-left panel hid him at the top of high jumps).
  // Pinned rather than centred so it stays the same distance from Bob on wide screens.
  const x = PLAYER_X + 140;
  const y = 12;
  const w = 272;
  const h = 74;
  const statX = x + w - 88;
  const statW = 74;
  const barY1 = y + 34;
  const barY2 = y + 50;
  const slideY = -(h + y + 24) * (1 - introEase);

  // Static frame: cached, except while sliding in/out (from the top).
  if (slideY) {
    ctx.translate(0, slideY);
    drawHudFrame(ctx, x, y, w, h, statX, statW, barY1, barY2);
  } else {
    drawCachedPanel(ctx, "hud", "hud", { x, y, w, h }, (pctx) =>
      drawHudFrame(pctx, x, y, w, h, statX, statW, barY1, barY2)
    );
  }

  const uiTime = state.uiTime || 0;

  // Ground danger: red rim over the cached frame.
  if (danger01 > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, danger01 * 1.1);
    ctx.shadowColor = "rgba(255,60,90,0.9)";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "rgba(255,70,100,0.95)";
    ctx.lineWidth = 2;
    roundedRectPath(ctx, x + 2, y + 2, w - 4, h - 4, 12);
    ctx.stroke();
    ctx.restore();
  }

  // Live values
  ctx.globalAlpha = 0.95;
  const baseScore = Number.isFinite(state.score) ? state.score : (state.distance || 0);
  const hudScore = Math.floor(baseScore);
  const scoreText = String(hudScore).padStart(6, "0");

  // Short pulse when a bonus lands.
  const lastEventT = Number.isFinite(state.scoreEventLastT) ? state.scoreEventLastT : -1;
  const pulseAge = lastEventT >= 0 ? uiTime - lastEventT : Infinity;
  const pulseK = pulseAge >= 0 && pulseAge < SCORE_PULSE_SEC
    ? 1 - easeOutCubic(pulseAge / SCORE_PULSE_SEC)
    : 0;
  ctx.fillStyle = "rgba(220,255,255,0.98)";
  ctx.font = "800 28px Share Tech Mono, Orbitron, Menlo, monospace";
  if (pulseK > 0) {
    ctx.save();
    ctx.translate(x + 14, y + 52);
    ctx.scale(1 + 0.12 * pulseK, 1 + 0.12 * pulseK);
    ctx.shadowColor = "rgba(80,255,220,0.9)";
    ctx.shadowBlur = 14 * pulseK;
    ctx.fillStyle = "rgba(245,255,255,1)";
    ctx.fillText(scoreText, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(scoreText, x + 14, y + 52);
  }

  // Air pot: points riding on this jump (paid out on a safe landing), plus its multiplier
  // (backflips + combo, on distance).
  const airPot = state.airActive === true ? Math.floor(state.airPot || 0) : 0;
  if (airPot > 0) {
    const mult = airMultiplier(state);
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(160,235,255,0.85)";
    ctx.font = "800 12px Share Tech Mono, Orbitron, Menlo, monospace";
    ctx.fillText(`+${airPot}`, x + 112, y + 42);
    if (mult > 1) {
      ctx.font = "800 11px Share Tech Mono, Orbitron, Menlo, monospace";
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255,170,80,0.8)";
      ctx.fillStyle = "rgba(255,200,120,0.98)";
      ctx.fillText(formatMult(mult), x + 112, y + 55);
    }
    ctx.restore();
  }

  // Combo chain (clean tricked landings in a row). Stays up between jumps.
  const combo = Math.max(0, state.combo || 0);
  if (combo > 0) {
    if (combo !== _hudComboValue) {
      _hudComboValue = combo;
      _hudComboText = `CHAIN ×${combo}`;
    }
    ctx.save();
    ctx.textAlign = "left";
    ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(255,170,80,0.7)";
    ctx.fillStyle = "rgba(255,200,120,0.95)";
    ctx.fillText(_hudComboText, x + 112, y + 66);
    ctx.restore();
  }

  // Personal-best target (top row, right of SCORE).
  const bestTarget = Number.isFinite(state.runBestTarget) ? state.runBestTarget : 0;
  if (bestTarget > 0) {
    const passed = state.passedBest === true;
    if (bestTarget !== _hudBestValue) {
      _hudBestValue = bestTarget;
      _hudBestText = `BEST ${formatNumber(bestTarget)}`;
    }
    const passedAge = passed ? uiTime - (state.passedBestT || 0) : 0;
    const flashing = passed && passedAge >= 0 && passedAge < BEST_FLASH_SEC;
    ctx.save();
    ctx.textAlign = "right";
    ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
    if (passed) {
      ctx.globalAlpha = flashing && Math.floor(passedAge * 10) % 2 === 1 ? 0.35 : 1;
      ctx.shadowColor = "rgba(255,190,90,0.8)";
      ctx.shadowBlur = flashing ? 12 : 6;
      ctx.fillStyle = "rgba(255,215,120,0.98)";
      ctx.fillText("NEW BEST", statX - 14, y + 22);
    } else {
      ctx.fillStyle = "rgba(150,245,255,0.6)";
      ctx.fillText(_hudBestText, statX - 14, y + 22);
    }
    ctx.restore();
  }

  // Distance line
  const hudDistance = Math.floor(state.distance || 0);
  ctx.fillStyle = "rgba(120,220,255,0.75)";
  ctx.font = "600 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText(`DIST ${hudDistance}`, x + 14, y + 66);

  // Jumps left: two dots that empty as jumps are used.
  const jumpsLeft = clamp(player.jumpsRemaining || 0, 0, JUMP_DOTS);
  for (let i = 0; i < JUMP_DOTS; i++) {
    const dx = statX + 38 + i * 12;
    const dy = y + 20;
    ctx.beginPath();
    ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
    if (i < jumpsLeft) {
      ctx.fillStyle = "rgba(240,255,255,0.95)";
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(180,250,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  const fuelMax = Number.isFinite(player.slowfallFuelMax) ? player.slowfallFuelMax : 0.38;
  const fuel01 = Number.isFinite(player.slowfallFuel)
    ? clamp(fuelMax > 0 ? player.slowfallFuel / fuelMax : 0, 0, 1)
    : 0;
  const dashCd = Number.isFinite(player.dashCooldown) ? player.dashCooldown : 0;
  const dash01 = clamp(1 - (dashCd / Math.max(0.001, DASH_COOLDOWN)), 0, 1);

  // Low fuel: blink the bar while slowfalling on the last ~20%.
  const slowfalling =
    !player.onGround && state.slowfallHeld === true && player.diving !== true && fuel01 > 0;
  const fuelLow = slowfalling && fuel01 < LOW_FUEL_FRAC;
  const blinkOff = fuelLow && Math.floor(uiTime * 8) % 2 === 1;
  ctx.fillStyle = fuelLow
    ? (blinkOff ? "rgba(255,70,100,0.55)" : "rgba(255,120,140,0.95)")
    : "rgba(0,255,208,0.85)";
  ctx.fillRect(statX, barY1, Math.floor(statW * fuel01), 6);
  ctx.fillStyle = dash01 >= 1 ? "rgba(255,110,180,0.9)" : "rgba(120,120,255,0.75)";
  ctx.fillRect(statX, barY2, Math.floor(statW * dash01), 6);

  // Dash cooldown just ended: flash the bar white and show READY, both fading out.
  const dashReady = dash01 >= 1;
  const hudWasHidden = Math.abs(uiTime - _hudDashSeenT) > 0.25;
  _hudDashSeenT = uiTime;
  if (dashReady && !_hudDashWasReady && !hudWasHidden) _hudDashReadyT = uiTime;
  _hudDashWasReady = dashReady;
  const readyAge = _hudDashReadyT >= 0 ? uiTime - _hudDashReadyT : Infinity;
  if (dashReady && readyAge >= 0 && readyAge < DASH_READY_FLASH_SEC) {
    const k = 1 - readyAge / DASH_READY_FLASH_SEC;
    ctx.save();
    ctx.globalAlpha = 0.9 * k;
    ctx.shadowColor = "rgba(255,150,210,0.9)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(255,240,250,1)";
    ctx.fillRect(statX, barY2, statW, 6);
    ctx.textAlign = "right";
    ctx.font = "700 8px Orbitron, Share Tech Mono, Menlo, monospace";
    ctx.fillText("READY", statX + statW, barY2 - 2);
    ctx.restore();
  }

  ctx.restore();
}

// Everything in the HUD that doesn't change during a run: bezel, labels, bar tracks.
function drawHudFrame(ctx, x, y, w, h, statX, statW, barY1, barY2) {
  ctx.save();
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

  ctx.fillStyle = "rgba(150,245,255,0.75)";
  ctx.font = "700 11px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("SCORE", x + 14, y + 22);

  // Right-side status strip
  ctx.fillStyle = "rgba(8,12,20,0.65)";
  roundRect(ctx, statX - 6, y + 10, statW + 10, 52, 8);

  ctx.fillStyle = "rgba(180,250,255,0.8)";
  ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("JMP", statX, y + 24);

  ctx.fillStyle = "rgba(16,22,34,0.9)";
  ctx.fillRect(statX, barY1, statW, 6);
  ctx.fillRect(statX, barY2, statW, 6);

  ctx.fillStyle = "rgba(160,230,255,0.65)";
  ctx.font = "700 8px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("FUEL", statX, barY1 - 2);
  ctx.fillText("DASH", statX, barY2 - 2);
  ctx.restore();
}

// Run summary rows: where the score came from, tallied one row at a time.
// Row data comes from buildSummaryRows (game/score.js); this adds the look.
const SUMMARY_ROW_H = 24;
const SUMMARY_PANEL_BASE_H = 204; // panel height without rows
const SUMMARY_ROW_LOOK = {
  distance:   { label: "DISTANCE",          rgb: "120,220,255" },
  multiplier: { label: "TRICK MULTIPLIER",  rgb: "255,215,110" },
  backflip:   { label: "BACKFLIPS",         rgb: "255,165,80" },
  smash:      { label: "BILLBOARDS BROKEN", rgb: "255,110,180" },
  closeCall:  { label: "CLOSE CALLS",       rgb: "120,255,170" },
  other:      { label: "OTHER BONUSES",     rgb: "190,150,255" },
};
const TALLY_COUNT_FRAC = 0.65; // share of a row's time spent counting; the rest flies to the total
const TALLY_PULSE_SEC = 0.25;  // total score pulse when a row lands in it
const ZERO_RGB = "120,130,150";

// Row geometry shared by the cached frame and the live (counting) values.
function summaryRowGeom(panelX, panelY, panelW, idx) {
  const left = panelX + 26;
  const right = panelX + panelW - 26;
  const baseY = panelY + 64 + SUMMARY_ROW_H * idx - 6; // text baseline
  const valueW = 112;
  return { left, right, baseY, valueX: right - valueW + 4, valueW };
}

// Everything about the rows that only changes when a row finishes: backgrounds, labels,
// count chips, dot leaders and the values of finished rows. The counting row's value is drawn live.
function drawSummaryRows(ctx, summary) {
  const { panelX, panelY, panelW, rows } = summary;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  rows.forEach((row, idx) => {
    const { left, right, baseY, valueX, valueW } = summaryRowGeom(panelX, panelY, panelW, idx);
    const reached = row.phase !== "pending";
    const rgb = reached && row.points === 0 ? ZERO_RGB : row.rgb;
    const dim = row.phase === "pending" ? 0.4 : row.points === 0 ? 0.55 : 1;

    // Row background; the counting row gets a glowing edge in its colour.
    ctx.fillStyle = "rgba(8,12,18,0.78)";
    roundRect(ctx, left - 8, baseY - 10, panelW - 36, 24, 8);
    if (row.phase === "active") {
      ctx.save();
      ctx.shadowColor = `rgba(${rgb},0.8)`;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(${rgb},0.85)`;
      ctx.lineWidth = 1.5;
      roundedRectPath(ctx, left - 8.5, baseY - 10.5, panelW - 35, 25, 8);
      ctx.stroke();
      ctx.restore();
    }

    // Label
    ctx.globalAlpha = dim;
    ctx.textAlign = "left";
    ctx.fillStyle = `rgba(${rgb},0.95)`;
    ctx.font = "700 11px Orbitron, Share Tech Mono, Menlo, monospace";
    ctx.fillText(row.label, left + 2, baseY);
    let leaderX = left + 2 + ctx.measureText(row.label).width + 8;

    // Count chip: "x6", or metres for distance.
    if (row.count !== null) {
      const chip = row.key === "distance" ? `${formatNumber(row.count)} m` : `×${formatNumber(row.count)}`;
      ctx.font = "800 11px Share Tech Mono, Orbitron, Menlo, monospace";
      const chipW = ctx.measureText(chip).width + 12;
      ctx.fillStyle = `rgba(${rgb},0.16)`;
      roundRect(ctx, leaderX, baseY - 11, chipW, 15, 5);
      ctx.strokeStyle = `rgba(${rgb},0.55)`;
      ctx.lineWidth = 1;
      roundedRectPath(ctx, leaderX + 0.5, baseY - 10.5, chipW - 1, 14, 5);
      ctx.stroke();
      ctx.fillStyle = `rgba(${rgb},0.95)`;
      ctx.textAlign = "center";
      ctx.fillText(chip, leaderX + chipW / 2, baseY);
      leaderX += chipW + 8;
    }

    // Dot leaders up to the value
    ctx.fillStyle = `rgba(${rgb},0.3)`;
    for (let dx = leaderX; dx < valueX - 8; dx += 6) ctx.fillRect(dx, baseY - 2, 2, 2);

    // Value pill; finished rows show their points, pending rows "···".
    ctx.fillStyle = "rgba(12,18,28,0.92)";
    roundRect(ctx, valueX, baseY - 16, valueW, 20, 8);
    ctx.strokeStyle = `rgba(${rgb},0.3)`;
    roundedRectPath(ctx, valueX + 0.5, baseY - 15.5, valueW - 1, 19, 8);
    ctx.stroke();
    ctx.textAlign = "right";
    if (row.phase === "done") {
      ctx.font = "800 13px Share Tech Mono, Orbitron, Menlo, monospace";
      ctx.fillStyle = row.points > 0 ? `rgba(${rgb},1)` : `rgba(${rgb},0.8)`;
      ctx.fillText(row.points > 0 ? `+${formatNumber(row.points)}` : "0", right - 6, baseY);
    } else if (row.phase === "pending") {
      ctx.font = "800 13px Share Tech Mono, Orbitron, Menlo, monospace";
      ctx.fillStyle = "rgba(160,190,220,0.5)";
      ctx.fillText("···", right - 6, baseY);
    }
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

// The counting row's value, and its points flying into the total once counted.
function drawTallyLive(ctx, row, idx, rowK, geom, target) {
  const { right, baseY } = summaryRowGeom(geom.panelX, geom.panelY, geom.panelW, idx);
  const countK = easeOutCubic(clamp(rowK / TALLY_COUNT_FRAC, 0, 1));
  const shown = Math.round(row.points * countK);
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = "800 13px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.shadowColor = `rgba(${row.rgb},0.9)`;
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillText(row.points > 0 ? `+${formatNumber(shown)}` : "0", right - 6, baseY);

  if (row.points > 0 && rowK > TALLY_COUNT_FRAC) {
    const f = (rowK - TALLY_COUNT_FRAC) / (1 - TALLY_COUNT_FRAC);
    const e = f * f; // ease in: speeds up into the total
    const x = right - 30 + (target.x - (right - 30)) * e;
    const y = baseY + (target.y - baseY) * e;
    const scale = 1.25 - 0.45 * e;
    ctx.globalAlpha = 1 - 0.5 * e;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(${row.rgb},1)`;
    ctx.fillText(`+${formatNumber(row.points)}`, 0, 0);
  }
  ctx.restore();
}

// touchUi: touch screen, so RESET shows no key hint.
export function drawCenterScore(ctx, state, W, H, pointerUi = null, buttonReady = false, touchUi = false) {
  const w = Number.isFinite(W) ? W : 800;
  const h = Number.isFinite(H) ? H : 450;
  const baseScore = Number.isFinite(state.score) ? state.score : (state.distance || 0);
  const displayScore = Number.isFinite(state.scoreTally) ? state.scoreTally : baseScore;
  const hudScore = Math.floor(displayScore);
  const scoreText = String(hudScore).padStart(6, "0");
  // Rows with their tally phase: done (banked), active (counting) or pending.
  const tallying = state.scoreTallyActive === true && state.tallyRows.length > 0;
  const tallyRow = tallying ? state.tallyRow : -1;
  const rows = (tallying ? state.tallyRows : buildSummaryRows(state)).map((row, idx) => ({
    ...row,
    ...SUMMARY_ROW_LOOK[row.key],
    phase: tallyRow < 0 || idx > tallyRow ? "pending" : idx < tallyRow ? "done" : "active",
  }));
  const activeRow = tallyRow >= 0 && tallyRow < rows.length ? rows[tallyRow] : null;
  const activeK = activeRow ? clamp(state.tallyRowT / tallyRowSec(activeRow), 0, 1) : 0;
  // Pulse the total when a scoring row lands in it (at the start of the next row, or at the end).
  const lastRow = tallyRow > 0 ? rows[tallyRow - 1] : null;
  const bankAge = lastRow && lastRow.points > 0
    ? (activeRow ? state.tallyRowT : state.scoreTallyDoneT || 0)
    : Infinity;
  const pulseK = bankAge < TALLY_PULSE_SEC ? 1 - easeOutCubic(bankAge / TALLY_PULSE_SEC) : 0;
  const boardT = Number.isFinite(state.scoreBoardT) ? state.scoreBoardT : 0;
  // Intro progress: summary drop, then leaderboard slide (each 0..1).
  const dropK = clamp(boardT / RUN_SUMMARY_DROP_SEC, 0, 1);
  const slideK = clamp((boardT - LEADERBOARD_SLIDE_DELAY_SEC) / LEADERBOARD_SLIDE_SEC, 0, 1);
  const uiT = Number.isFinite(state.uiTime) ? state.uiTime : 0;
  const rowHeightVal = 18;
  const leaderboardRowCount = LEADERBOARD_MAX_ENTRIES;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const cx = w * 0.5;
  const cy = h * 0.5;

  const panelW = Math.min(460, w * 0.74);
  const panelH = SUMMARY_PANEL_BASE_H + SUMMARY_ROW_H * rows.length;
  const leaderboardW = Math.min(220, w * 0.24);
  const spacing = Math.min(32, w * 0.04);
  const totalBlockW = panelW + spacing + leaderboardW;
  const blockX = cx - totalBlockW / 2;
  const panelX = blockX;
  const finalPanelY = cy - panelH / 2 - 6;
  const startPanelY = -panelH - 40;
  const panelY = startPanelY + (finalPanelY - startPanelY) * easeOutBack(dropK);
  // Leaderboard: straight in from off-screen right, at its final height.
  const leaderboardFinalX = panelX + panelW + spacing;
  const leaderboardStartX = w + 24;
  const leaderboardX = leaderboardStartX + (leaderboardFinalX - leaderboardStartX) * easeOutCubic(slideK);
  const panelCenterX = panelX + panelW * 0.5;
  const leaderboardH = panelH;
  const leaderboardY = finalPanelY;

  const sway = 0;
  const stringTop = -200;
  const stringLeftX = panelX + panelW * 0.26 + sway;
  const stringRightX = panelX + panelW * 0.74 + sway;

  const summary = {
    panelX, panelY, panelW, panelH, panelCenterX, stringTop, stringLeftX, stringRightX, rows,
  };

  // Rig, panel and stat rows: drawn directly while dropping in, cached once landed.
  if (dropK < 1) {
    drawRunSummaryFrame(ctx, summary);
  } else {
    const key = [panelX, panelY, panelW, panelH, tallyRow, ...rows.map((r) => `${r.points}/${r.count}`)].join("|");
    const top = stringTop - 22;
    const box = { x: panelX - 30, y: top, w: panelW + 60, h: panelY + panelH - top + 4 };
    drawCachedPanel(ctx, "runSummary", key, box, (pctx) => drawRunSummaryFrame(pctx, summary));
  }

  ctx.textAlign = "center";
  const dividerY = panelY + 64 + SUMMARY_ROW_H * rows.length + 6;

  // Total score capsule: cached once the tally has finished counting.
  const pillX = panelX + 40;
  const pillY = dividerY + 16;
  const pillW2 = panelW - 80;
  const pillH2 = 54;
  const capsule = { pillX, pillY, pillW2, pillH2, panelCenterX, scoreText, pulseK };
  if (state.scoreTallyDone === true && dropK >= 1 && pulseK === 0) {
    const key = [pillX, pillY, pillW2, scoreText].join("|");
    drawCachedPanel(ctx, "runScore", key, { x: pillX, y: pillY, w: pillW2, h: pillH2 }, (pctx) =>
      drawScoreCapsule(pctx, capsule)
    );
  } else {
    drawScoreCapsule(ctx, capsule);
  }
  if (state.passedBest === true && state.scoreTallyDone === true && dropK >= 1) {
    drawNewBestStamp(ctx, pillX + pillW2 - 50, pillY + 2, state.scoreTallyDoneT || 0);
  }
  // The counting row and its points flying into the total (over the capsule).
  if (activeRow) {
    const target = { x: panelCenterX, y: pillY + 40 };
    drawTallyLive(ctx, activeRow, tallyRow, activeK, { panelX, panelY, panelW }, target);
  }

  // The score glow stays on for what follows (RESET and the leaderboard pick it up).
  ctx.shadowColor = "rgba(80,255,220,0.7)";
  ctx.shadowBlur = 16;

  const buttonEnabled = Boolean(buttonReady);
  const resetButtonWidth = Math.min(pillW2, panelW - 90);
  const resetButtonHeight = 44;
  const resetButtonX = panelCenterX - resetButtonWidth / 2;
  const resetButtonY = pillY + pillH2 + 24;
  let resetHover = false;

  if (buttonEnabled && pointerUi) {
    resetHover =
      pointerUi.x >= resetButtonX &&
      pointerUi.x <= resetButtonX + resetButtonWidth &&
      pointerUi.y >= resetButtonY &&
      pointerUi.y <= resetButtonY + resetButtonHeight;
  }
  state.restartHover = buttonEnabled ? resetHover : false;

  if (buttonEnabled) {
    const button = { x: resetButtonX, y: resetButtonY, w: resetButtonWidth, h: resetButtonHeight, panelCenterX };
    const keyHint = touchUi ? "" : "SPACE";
    const key = [resetButtonX, resetButtonY, resetButtonWidth, resetHover, keyHint].join("|");
    if (dropK >= 1) {
      drawCachedPanel(ctx, "resetButton", key, button, (pctx) => drawResetButton(pctx, button, resetHover, keyHint));
    } else {
      drawResetButton(ctx, button, resetHover, keyHint);
    }
  }

  // Leaderboard: drawn directly while sliding, cached once in place.
  if (slideK > 0) {
    const leaderboardState = getLeaderboardState();
    const draw = slideK < 1 ? drawLeaderboardPanelDirect : drawLeaderboardPanel;
    draw(
      ctx,
      leaderboardState.entries,
      leaderboardState.myBest,
      leaderboardX,
      leaderboardY,
      leaderboardW,
      leaderboardH,
      1,
      {
        rowCount: leaderboardRowCount,
        rowHeight: rowHeightVal,
        glow: true,
        arrow: false,
        bestLabel: "Best Score",
      }
    );
  }

  ctx.restore();
}

// Run summary pieces that are fixed once the run has ended: hanging rig, panel,
// header and the four stat rows.
function drawRunSummaryFrame(ctx, summary) {
  const { panelX, panelY, panelW, panelH, panelCenterX, stringTop, stringLeftX, stringRightX, rows } = summary;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.save();
  ctx.globalAlpha = 0.98;
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

  ctx.fillStyle = "rgba(160,245,255,0.9)";
  ctx.font = "700 12px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("RUN SUMMARY", panelCenterX, panelY + 35);

  drawSummaryRows(ctx, summary);

  // Divider
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(120,205,255,0.22)";
  ctx.lineWidth = 1;
  const dividerY = panelY + 64 + SUMMARY_ROW_H * rows.length + 6;
  ctx.beginPath();
  ctx.moveTo(panelX + 20, dividerY);
  ctx.lineTo(panelX + panelW - 20, dividerY);
  ctx.stroke();

  ctx.restore();
}

// Total score pill + score. Leaves the score glow (shadow) set on ctx, as callers expect.
function drawScoreCapsule(ctx, capsule) {
  const { pillX, pillY, pillW2, pillH2, panelCenterX, scoreText, pulseK = 0 } = capsule;
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
  const scoreWidth = ctx.measureText(scoreText).width;
  if (scoreWidth > maxScoreWidth) {
    scoreFontSize = Math.max(28, Math.floor(scoreFontSize * (maxScoreWidth / scoreWidth)));
    ctx.font = `800 ${scoreFontSize}px Share Tech Mono, Orbitron, Menlo, monospace`;
  }

  ctx.shadowColor = "rgba(80,255,220,0.7)";
  ctx.shadowBlur = 16 + 14 * pulseK;
  ctx.fillStyle = "rgba(240,255,255,0.98)";
  ctx.textAlign = "center";
  const textY = pillY + 40 + (40 - scoreFontSize) * 0.3;
  if (pulseK > 0) {
    // A row just landed in the total: punch the number up and let it settle.
    const scale = 1 + 0.14 * pulseK;
    ctx.save();
    ctx.translate(panelCenterX, textY - scoreFontSize * 0.35);
    ctx.scale(scale, scale);
    ctx.fillText(scoreText, 0, scoreFontSize * 0.35);
    ctx.restore();
  } else {
    ctx.fillText(scoreText, panelCenterX, textY);
  }
}

// Tilted "NEW BEST" stamp on the score capsule; slams in once the tally finishes.
function drawNewBestStamp(ctx, x, y, t) {
  const k = clamp(t / 0.22, 0, 1);
  const scale = 1.8 - 0.8 * easeOutCubic(k);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(x, y);
  ctx.rotate(-0.14);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(20,14,6,0.92)";
  roundRect(ctx, -44, -11, 88, 22, 6);
  ctx.shadowColor = "rgba(255,190,90,0.85)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = "rgba(255,210,110,0.95)";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, -44, -11, 88, 22, 6);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,222,140,0.98)";
  ctx.font = "800 11px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NEW BEST", 0, 1);
  ctx.restore();
}

// keyHint: optional key name drawn as a small key cap after RESET (e.g. "SPACE").
function drawResetButton(ctx, button, resetHover, keyHint = "") {
  const { x: resetButtonX, y: resetButtonY, w: resetButtonWidth, h: resetButtonHeight, panelCenterX } = button;
  const baseGradient = ctx.createLinearGradient(
    resetButtonX,
    resetButtonY,
    resetButtonX,
    resetButtonY + resetButtonHeight
  );
  if (resetHover) {
    baseGradient.addColorStop(0, "rgba(255,120,120,0.98)");
    baseGradient.addColorStop(1, "rgba(240,60,60,0.96)");
  } else {
    baseGradient.addColorStop(0, "rgba(255,255,255,0.98)");
    baseGradient.addColorStop(0.6, "rgba(228,236,248,0.96)");
    baseGradient.addColorStop(1, "rgba(210,230,250,0.92)");
  }

  ctx.save();
  ctx.shadowColor = resetHover ? "rgba(255,80,80,0.8)" : "rgba(120,205,255,0.45)";
  ctx.shadowBlur = resetHover ? 28 : 18;
  ctx.fillStyle = baseGradient;
  roundRect(ctx, resetButtonX, resetButtonY, resetButtonWidth, resetButtonHeight, 18);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = resetHover ? "rgba(255,210,210,0.7)" : "rgba(12,16,22,0.4)";
  ctx.lineWidth = 1.5;
  roundedRectPath(
    ctx,
    resetButtonX + 0.7,
    resetButtonY + 0.7,
    resetButtonWidth - 1.4,
    resetButtonHeight - 1.4,
    16
  );
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.25;
  const highlight = ctx.createLinearGradient(
    resetButtonX,
    resetButtonY,
    resetButtonX,
    resetButtonY + resetButtonHeight * 0.35
  );
  highlight.addColorStop(0, "rgba(255,255,255,0.9)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.moveTo(resetButtonX + 6, resetButtonY + 4);
  ctx.lineTo(resetButtonX + resetButtonWidth - 6, resetButtonY + 4);
  ctx.lineTo(resetButtonX + resetButtonWidth - 8, resetButtonY + 12);
  ctx.lineTo(resetButtonX + 8, resetButtonY + 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const ink = resetHover ? "rgba(24,18,18,0.98)" : "rgba(24,26,32,0.94)";
  const midY = resetButtonY + resetButtonHeight / 2;
  ctx.font = "800 24px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.fillStyle = ink;
  if (!keyHint) {
    ctx.fillText("RESET", panelCenterX, midY + 2);
    ctx.restore();
    return;
  }

  // RESET plus a small key cap, centred together.
  const labelW = ctx.measureText("RESET").width;
  ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
  const capW = ctx.measureText(keyHint).width + 14;
  const capH = 18;
  const gap = 12;
  const startX = panelCenterX - (labelW + gap + capW) / 2;
  ctx.font = "800 24px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.fillText("RESET", startX + labelW / 2, midY + 2);

  const capX = startX + labelW + gap;
  const capY = midY - capH / 2;
  ctx.strokeStyle = resetHover ? "rgba(40,20,20,0.6)" : "rgba(24,26,32,0.45)";
  ctx.lineWidth = 1.25;
  roundedRectPath(ctx, capX + 0.5, capY + 0.5, capW - 1, capH - 1, 5);
  ctx.stroke();
  ctx.font = "700 10px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText(keyHint, capX + capW / 2, midY + 1);
  ctx.restore();
}

// drawMenus moved to src/render/menu.js

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
