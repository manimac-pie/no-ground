// src/render/hud/leaderboardPanel.js
// The leaderboard panel: start screen and run summary.
//
// Top to bottom: the title; ALL-TIME (ranks 1-3, kept forever); THIS WEEK (ranks 4-10, wiped
// every Monday, with the countdown), which is also the expand/collapse toggle on the start screen;
// and the player's best, with what it takes to climb, pinned to the bottom.

import { RESET_FIRST_RANK } from "../../leaderboard/reset.js";
import { LEADERBOARD_MAX_ENTRIES } from "../../leaderboard/state.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { drawCachedPanel } from "./panelCache.js";
import { formatNumber, roundRect } from "./primitives.js";

const ALL_TIME_ROWS = RESET_FIRST_RANK - 1; // ranks 1-3 never reset; the weekly reset starts at 4

// Layout, in UI units.
const TITLE_TOP = 10;
const TITLE_H = 28;
const LIST_TOP = TITLE_TOP + TITLE_H + 8;
const SECTION_H = 16;   // the ALL-TIME label row
const WEEKLY_H = 20;    // the THIS WEEK label row: a bit taller, since it's the toggle
const FOOTER_H = 64;    // gap + divider + your best + the goal line
const PAD_LEFT = 16;
const PAD_RIGHT = 12;

const TITLE_FONT = "700 14px Orbitron, Share Tech Mono, Menlo, monospace";
const SECTION_FONT = "600 9px Share Tech Mono, Menlo, monospace";
const ROW_FONT = "600 14px Share Tech Mono, Orbitron, Menlo, monospace";
const BEST_LABEL_FONT = "600 10px Orbitron, Share Tech Mono, Menlo, monospace";
const BEST_FONT = "800 20px Share Tech Mono, Orbitron, Menlo, monospace";
const GOAL_FONT = "600 9px Share Tech Mono, Menlo, monospace";

// Warm for the permanent top 3, cool for the weekly ranks.
const ALL_TIME_LOOK = { label: "255,190,120", name: "rgba(255,235,220,0.95)", rank: "rgba(255,205,150,0.55)" };
const WEEKLY_LOOK = { label: "120,205,255", name: "rgba(220,240,255,0.82)", rank: "rgba(150,195,225,0.5)" };

function hasWeeklyRow(rowCount, toggle) {
  return rowCount > ALL_TIME_ROWS || toggle;
}

// Height the panel needs for `rowCount` rows (the start screen sizes its board with this).
export function leaderboardPanelHeight(rowCount, rowHeight, toggle = false) {
  const weekly = hasWeeklyRow(rowCount, toggle) ? WEEKLY_H : 0;
  return LIST_TOP + SECTION_H + rowCount * rowHeight + weekly + FOOTER_H;
}

// opts: glow; toggle (THIS WEEK expands/collapses the list, start screen only);
// rowCount (3 collapsed, 10 expanded); rowHeight; resetIn (countdown text, "5D 20H").
// Returns { toggleRect }: where to click to expand/collapse, or null.
export function drawLeaderboardPanel(ctx, entries, myBest, x, y, w, h, alpha = 1, opts = {}) {
  if (alpha <= 0 || !Number.isFinite(w) || !Number.isFinite(h)) return;
  // Fading in: draw directly (group alpha on a cached image would blend differently).
  if (alpha < 1) return drawLeaderboardPanelDirect(ctx, entries, myBest, x, y, w, h, alpha, opts);

  const list = Array.isArray(entries) ? entries : [];
  const key = [
    x, y, w, h, myBest,
    opts.glow, opts.toggle, opts.rowCount, opts.rowHeight, opts.resetIn,
    ...list.map((e) => `${e?.name}:${e?.score}`),
  ].join("|");
  return drawCachedPanel(ctx, "leaderboard", key, { x, y, w, h }, (pctx) =>
    drawLeaderboardPanelDirect(pctx, entries, myBest, x, y, w, h, 1, opts)
  );
}

export function drawLeaderboardPanelDirect(ctx, entries, myBest, x, y, w, h, alpha = 1, opts = {}) {
  const {
    glow = false,
    toggle = false,
    rowCount = ALL_TIME_ROWS,
    rowHeight = 22,
    resetIn = "",
  } = opts;
  const list = Array.isArray(entries) ? entries : [];
  const visibleRows = Math.max(1, Math.min(LEADERBOARD_MAX_ENTRIES, Math.floor(rowCount)));

  ctx.save();
  ctx.globalAlpha = alpha;
  drawFrame(ctx, x, y, w, h, glow);

  ctx.fillStyle = "rgba(8,14,28,0.72)";
  roundRect(ctx, x + 10, y + TITLE_TOP, w - 20, TITLE_H, 10);
  ctx.fillStyle = "rgba(160,245,255,0.95)";
  ctx.font = TITLE_FONT;
  ctx.textAlign = "center";
  ctx.fillText("LEADERBOARD", x + w / 2, y + TITLE_TOP + 19);

  // Columns: ranks right-aligned (so "10" lines up with "9"), then names, then scores.
  const left = x + PAD_LEFT;
  const right = x + w - PAD_RIGHT;
  ctx.font = ROW_FONT;
  const rankRight = left + ctx.measureText(String(LEADERBOARD_MAX_ENTRIES)).width;
  const cols = { rankRight, nameX: rankRight + 9, right };

  let top = y + LIST_TOP;
  drawSectionLabel(ctx, "ALL-TIME", left, right, top, SECTION_H, ALL_TIME_LOOK.label);
  top += SECTION_H;
  for (let i = 0; i < Math.min(visibleRows, ALL_TIME_ROWS); i++) {
    drawRow(ctx, list[i], i + 1, top, rowHeight, cols, ALL_TIME_LOOK);
    top += rowHeight;
  }

  let toggleRect = null;
  if (hasWeeklyRow(visibleRows, toggle)) {
    const label = resetIn ? `THIS WEEK · RESETS IN ${resetIn}` : "THIS WEEK";
    const chevronW = toggle ? 14 : 0;
    drawSectionLabel(ctx, label, left, right - chevronW, top, WEEKLY_H, WEEKLY_LOOK.label);
    if (toggle) {
      drawChevron(ctx, right - 5, top + WEEKLY_H / 2, visibleRows > ALL_TIME_ROWS);
      toggleRect = { x: x + 10, y: top, w: w - 20, h: WEEKLY_H };
    }
    top += WEEKLY_H;
    for (let i = ALL_TIME_ROWS; i < visibleRows; i++) {
      drawRow(ctx, list[i], i + 1, top, rowHeight, cols, WEEKLY_LOOK);
      top += rowHeight;
    }
  }

  drawFooter(ctx, list, myBest, x, w, left, right, y + h);

  ctx.restore();
  return { toggleRect };
}

// Base panel (dark with a soft bevel, like the run summary).
function drawFrame(ctx, x, y, w, h, glow) {
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
}

// "ALL-TIME ─────────": a small label with a rule running to the right edge.
function drawSectionLabel(ctx, text, left, right, top, height, rgb) {
  const midY = top + height / 2;
  ctx.font = SECTION_FONT;
  ctx.textAlign = "left";
  ctx.fillStyle = `rgba(${rgb},0.85)`;
  ctx.fillText(text, left, midY + 3);

  const lineX = left + ctx.measureText(text).width + 6;
  if (lineX < right) {
    ctx.strokeStyle = `rgba(${rgb},0.22)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lineX, Math.round(midY) + 0.5);
    ctx.lineTo(right, Math.round(midY) + 0.5);
    ctx.stroke();
  }
}

// Points down to expand, up to collapse.
function drawChevron(ctx, cx, cy, up) {
  const s = 4;
  ctx.fillStyle = "rgba(120,205,255,0.95)";
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx - s, cy + s * 0.5);
    ctx.lineTo(cx + s, cy + s * 0.5);
    ctx.lineTo(cx, cy - s * 0.6);
  } else {
    ctx.moveTo(cx - s, cy - s * 0.5);
    ctx.lineTo(cx + s, cy - s * 0.5);
    ctx.lineTo(cx, cy + s * 0.6);
  }
  ctx.closePath();
  ctx.fill();
}

function drawRow(ctx, entry, rank, top, rowHeight, cols, look) {
  const baseline = top + Math.round(rowHeight / 2 + 5);
  const hasScore = entry && Number.isFinite(entry.score);
  const scoreText = hasScore ? formatNumber(entry.score) : "—";
  const name = entry && typeof entry.name === "string" ? entry.name : "—";

  ctx.font = ROW_FONT;
  ctx.textAlign = "right";
  ctx.fillStyle = look.rank;
  ctx.fillText(String(rank), cols.rankRight, baseline);

  ctx.fillStyle = look.name;
  ctx.fillText(scoreText, cols.right, baseline);

  ctx.textAlign = "left";
  const nameRoom = cols.right - ctx.measureText(scoreText).width - 10 - cols.nameX;
  ctx.fillText(fitText(ctx, name, nameRoom), cols.nameX, baseline);
}

// Trim `text` with "…" until it fits in maxW (names are capped at 10 characters, so this is a
// safety net for wide fallback fonts and narrow panels).
function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

// Your best, pinned to the bottom, with what it takes to climb.
function drawFooter(ctx, entries, myBest, x, w, left, right, bottom) {
  const best = Number.isFinite(myBest) ? myBest : 0;
  const dividerY = bottom - (FOOTER_H - 8);

  ctx.strokeStyle = "rgba(120,205,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 24, dividerY);
  ctx.lineTo(x + w - 24, dividerY);
  ctx.stroke();

  const lineY = dividerY + 21;
  ctx.font = BEST_LABEL_FONT;
  ctx.fillStyle = "rgba(150,210,230,0.7)";
  ctx.textAlign = "left";
  ctx.fillText("YOUR BEST", left, lineY);

  ctx.font = BEST_FONT;
  ctx.fillStyle = "rgba(240,255,255,0.9)";
  ctx.textAlign = "right";
  ctx.fillText(formatNumber(best), right, lineY);

  const goal = bestGoal(entries, best);
  if (!goal) return;
  const goalY = dividerY + 38;
  ctx.font = GOAL_FONT;
  ctx.textAlign = "left";
  let gx = left;
  if (goal.rank) {
    ctx.fillStyle = "rgba(240,255,255,0.95)";
    ctx.fillText(goal.rank, gx, goalY);
    gx += ctx.measureText(goal.rank).width;
  }
  ctx.fillStyle = "rgba(255,200,140,0.85)";
  ctx.fillText(goal.text, gx, goalY);
}

// Where your best stands, and what it takes to climb: "#4 · 25,731 TO BEAT #3".
// The board doesn't say which entry is yours, so it's found by score. Returns null when there's
// nothing useful to say (board not loaded, or you qualify but aren't listed yet).
function bestGoal(entries, best) {
  const n = entries.length;
  if (n === 0) return null;

  let ahead = 0;
  let listed = false;
  for (const e of entries) {
    const s = e?.score;
    if (s > best) ahead++;
    else if (s === best && best > 0) listed = true;
  }

  if (listed) {
    const rank = ahead + 1;
    if (rank === 1) return { rank: "#1", text: " · TOP OF THE BOARD" };
    const gap = entries[rank - 2].score - best + 1;
    return { rank: `#${rank}`, text: ` · ${formatNumber(gap)} TO BEAT #${rank - 1}` };
  }
  if (n < LEADERBOARD_MAX_ENTRIES) return { rank: "", text: "ANY RUN MAKES THE BOARD" };
  const last = entries[n - 1].score;
  if (best >= last) return null;
  return { rank: "", text: `${formatNumber(last - best + 1)} TO MAKE THE BOARD` };
}
