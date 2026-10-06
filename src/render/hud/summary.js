// src/render/hud/summary.js
// Run summary: the hanging panel, the row-by-row tally, the score capsule and NEW BEST.

import {
  LEADERBOARD_SLIDE_DELAY_SEC,
  LEADERBOARD_SLIDE_SEC,
  RUN_SUMMARY_DROP_SEC,
} from "../../game/constants.js";
import { buildSummaryRows, tallyRowSec } from "../../game/score.js";
import { weeklyResetIn } from "../../leaderboard/reset.js";
import { LEADERBOARD_MAX_ENTRIES, getLeaderboardState } from "../../leaderboard/state.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { clamp, easeOutCubic } from "../../shared/math.js";
import { formatIteration } from "../../ui/iteration.js";
import { hitAreas } from "../../ui/layout.js";
import { drawLeaderboardPanel, drawLeaderboardPanelDirect } from "./leaderboardPanel.js";
import { drawCachedPanel } from "./panelCache.js";
import { easeOutBack, formatNumber, roundRect } from "./primitives.js";
import { RESET_TYPE_SEC, drawResetButton, drawResetCursor } from "./reset.js";

// Run summary rows: where the score came from, tallied one row at a time.
// Row data comes from buildSummaryRows (game/score.js); this adds the look.
const SUMMARY_ROW_H = 24;
const SUMMARY_PANEL_BASE_H = 204; // panel height without rows
const SUMMARY_ROW_LOOK = {
  distance:   { label: "DISTANCE",          rgb: "120,220,255" },
  multiplier: { label: "TRICK MULTIPLIER",  rgb: "255,215,110" },
  backflip:   { label: "BACKFLIPS",         rgb: "255,165,80" },
  smash:      { label: "BILLBOARDS BROKEN", rgb: "255,110,180" },
  dodge:      { label: "ADS AVOIDED",       rgb: "200,240,100" },
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

  const iterText = `ITERATION ${formatIteration(state.iteration)}`;
  const summary = {
    panelX, panelY, panelW, panelH, panelCenterX, stringTop, stringLeftX, stringRightX, rows,
    title: iterText,
  };

  // Rig, panel and stat rows: drawn directly while dropping in, cached once landed.
  if (dropK < 1) {
    drawRunSummaryFrame(ctx, summary);
  } else {
    const key = [panelX, panelY, panelW, panelH, iterText, tallyRow, ...rows.map((r) => `${r.points}/${r.count}`)].join("|");
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
  hitAreas.resetHovered = buttonEnabled ? resetHover : false;

  if (buttonEnabled) {
    // The simulation's RESET command: types itself in once ready, then idles with a blinking cursor.
    const button = { x: resetButtonX, y: resetButtonY, w: resetButtonWidth, h: resetButtonHeight };
    const keyHint = touchUi ? "[TAP]" : "[SPACE]";
    const subline = `${iterText} TERMINATED`;
    const typedK = clamp((state.restartReadyT || 0) / RESET_TYPE_SEC, 0, 1);
    const red = resetHover || state.restartSmashRed === true;
    if (typedK >= 1 && dropK >= 1) {
      const key = [resetButtonX, resetButtonY, resetButtonWidth, red, keyHint, subline].join("|");
      drawCachedPanel(ctx, "resetButton", key, button, (pctx) => drawResetButton(pctx, button, red, keyHint, subline, 1));
    } else {
      drawResetButton(ctx, button, red, keyHint, subline, typedK);
    }
    if (typedK >= 1 && Math.floor((state.uiTime || 0) * 2.5) % 2 === 0) {
      drawResetCursor(ctx, button, red);
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
        resetIn: weeklyResetIn(),
      }
    );
  }

  ctx.restore();
}

// Run summary pieces that are fixed once the run has ended: hanging rig, panel,
// header and the four stat rows.
function drawRunSummaryFrame(ctx, summary) {
  const { panelX, panelY, panelW, panelH, panelCenterX, stringTop, stringLeftX, stringRightX, rows, title } = summary;
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
  ctx.fillText(title || "RUN SUMMARY", panelCenterX, panelY + 35);

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
