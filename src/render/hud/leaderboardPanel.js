// src/render/hud/leaderboardPanel.js
// The leaderboard panel: start screen and run summary.

import { LEADERBOARD_MAX_ENTRIES } from "../../leaderboard/state.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { drawCachedPanel } from "./panelCache.js";
import { formatNumber, roundRect } from "./primitives.js";

export function drawLeaderboardPanel(ctx, entries, myBest, x, y, w, h, alpha = 1, opts = {}) {
  if (alpha <= 0 || !Number.isFinite(w) || !Number.isFinite(h)) return;
  // Fading in: draw directly (group alpha on a cached image would blend differently).
  if (alpha < 1) return drawLeaderboardPanelDirect(ctx, entries, myBest, x, y, w, h, alpha, opts);

  const list = Array.isArray(entries) ? entries : [];
  const key = [
    x, y, w, h, myBest,
    opts.glow, opts.arrow, opts.arrowDirection, opts.rowCount, opts.rowHeight, opts.bestLabel, opts.collapsedLayout,
    opts.resetLabel,
    ...list.map((e) => `${e?.name}:${e?.score}`),
  ].join("|");
  return drawCachedPanel(ctx, "leaderboard", key, { x, y, w, h }, (pctx) =>
    drawLeaderboardPanelDirect(pctx, entries, myBest, x, y, w, h, 1, opts)
  );
}

export function drawLeaderboardPanelDirect(
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
    resetLabel = "", // weekly reset countdown under the title (empty: none)
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
  ctx.fillText("LEADERBOARD", x + w / 2, headerY + (resetLabel ? 18 : 24));
  if (resetLabel) {
    ctx.font = "600 9px Share Tech Mono, Menlo, monospace";
    ctx.fillStyle = "rgba(255,190,120,0.8)";
    ctx.fillText(resetLabel, x + w / 2, headerY + 30);
  }

  const entryYStart = headerY + headerHeight + (resetLabel ? 12 : 6);
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
