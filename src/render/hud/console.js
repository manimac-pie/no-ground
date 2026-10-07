// src/render/hud/console.js
// The end screen: one terminal window across the top of the screen, split into two panes (tmux
// style), with the world where Bob died left in view below it.
//   Left:  the log, then `blackbox --replay`: one track per kind of trick, a mark where each one
//          happened, and the run's length filling in along the rule underneath. Then `tally`, the
//          score counting up, and how the run compares to your best and the board.
//   Right: `records --week` (this week's top 10; a new entry of yours slides up to its rank) and
//          `records --all-time` (the top 3, names glowing gold).
// Under the panes, the prompt line: RESET once it's ready, or `register --subject` while the
// leaderboard name prompt is open. A status bar closes the window.
//
// The game drives the timing (game/index.js): the window slides down as the claw grabs Bob
// (scoreBoardT), the black box sweeps while the score counts up (scoreTallyT), the records print
// once the tally is done (scoreTallyDoneT), and the prompt shows with restartReady. Once it has all
// settled, the window is cached (panelCache.js); only the cursor and the CONTAINED light run live.

import { DEATH_SUMMARY_START_SEC, RUN_SUMMARY_DROP_SEC } from "../../game/constants.js";
import { buildSummaryRows, tallyRowSec } from "../../game/score.js";
import { getLastClaim } from "../../leaderboard/claimFlow.js";
import { weeklyResetIn } from "../../leaderboard/reset.js";
import { getBoards, getMyBest, getPendingClaim } from "../../leaderboard/state.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { clamp, easeOutCubic } from "../../shared/math.js";
import { formatIteration } from "../../ui/iteration.js";
import { hitAreas, pointInRect } from "../../ui/layout.js";
import { drawCachedPanel } from "./panelCache.js";
import { formatNumber, roundRect } from "./primitives.js";

const MONO = "Share Tech Mono, Menlo, monospace";
const CYAN = "120,205,255";
const RED = "255,85,110";
const AMBER = "255,180,70";
const GREEN = "95,227,154";
const GOLD = "255,212,121";
const PODIUM = ["255,212,121", "212,221,232", "227,164,108"]; // ranks 1-3: gold, silver, bronze
const DIM = "rgba(242,242,242,0.36)";
const SOFT = "rgba(242,242,242,0.62)";
const BRIGHT = "#fff";

// Layout, in UI units.
const TOP = 14;
const HEIGHT = 236;
const MAX_W = 1000;
const RIGHT_W = 262;   // the records pane
const BAR_H = 13;      // title bar
const PROMPT_H = 20;
const STATUS_H = 11;
const PAD_X = 12;
const PAD_Y = 7;
const LINE_H = 11;
const SCORE_H = 22;    // the score's line is taller
const STAMP_W = 34;    // "[00.98] "
const INDENT = 10;     // output under a command
const LABEL_W = 92;    // a track's name and count
const COLS = 72;       // black box columns
const MAX_CELL_W = 5.2;

const FONT = `8px ${MONO}`;
const SMALL_FONT = `6.5px ${MONO}`;
const PROMPT_FONT = `9.5px ${MONO}`;
const SCORE_FONT = `20px ${MONO}`;

const TYPE_LINE_SEC = 0.03; // the records print one line every this long
const CLIMB_RATE = 9;       // how fast a row eases to its rank (per second, exponential)

// The black box's tracks: the summary rows that count events, in the summary's colours.
const LANES = [
  { key: "backflip", label: "backflips", rgb: "255,165,80" },
  { key: "smash", label: "billboards broken", rgb: "255,110,180" },
  { key: "dodge", label: "ads avoided", rgb: "200,240,100" },
  { key: "closeCall", label: "close calls", rgb: "120,255,170" },
  { key: "buildings", label: "buildings bypassed", rgb: "150,170,255" },
];

const stamp = (sec) => `[${sec.toFixed(2).padStart(5, "0")}]`;

// ---------------- the run (fixed once Bob is dead) ----------------

let _run = null;

function getRunData(state) {
  // A new death snapshot is a new run's end screen.
  if (_run && _run.id === state.deathSnapshot) return _run;
  const rows = buildSummaryRows(state);
  const dist = rows[0].count;
  const prevM = state.prevBestRunM || 0;
  const span = Math.max(dist, prevM, 1) * 1.06;
  const col = (m) => clamp(Math.floor((m / span) * COLS), 0, COLS - 1);
  const lanes = LANES.map((lane) => {
    const row = rows.find((r) => r.key === lane.key);
    const cells = new Uint8Array(COLS);
    for (const ev of state.runEvents) if (ev.kind === lane.key) cells[col(Math.min(ev.m, dist))] = 1;
    return { ...lane, count: row ? row.count : 0, cells };
  });
  const step = span > 15000 ? 5000 : span > 6000 ? 2000 : span > 2500 ? 1000 : 500;
  const km = [];
  for (let m = 0; m <= span; m += step) km.push({ col: col(m), text: m ? `${m / 1000}km` : "0" });

  const score = Math.floor(state.score || 0);
  const prev = state.runBestTarget || 0;
  const verdict = prev <= 0
    ? [{ text: "FIRST RECORD", color: `rgb(${CYAN})`, glow: CYAN }]
    : score > prev
      ? [{ text: "NEW BEST", color: `rgb(${GOLD})`, glow: GOLD }, { text: ` +${formatNumber(score - prev)}`, color: DIM }]
      : [{ text: `−${formatNumber(prev - score)} vs best ${formatNumber(prev)}`, color: DIM }];

  _run = {
    id: state.deathSnapshot,
    iter: formatIteration(state.iteration),
    cause: state.player?.billboardDeath === true ? "ad impact" : "ground contact",
    dist, score, verdict, lanes, km,
    endCol: col(dist),
    ghostCol: prevM > 0 ? col(prevM) : -1,
    prevM,
  };
  _slots.clear();
  return _run;
}

// ---------------- the records ----------------

let _board = null;

// This week's rows as the console prints them, with your row marked. The board doesn't say which
// entry is yours, so it's found by score: this run's (once it has a name, or with a placeholder name
// while the name prompt is up), or else your best this week.
function getBoardData(run) {
  const boards = getBoards();
  const pending = getPendingClaim();
  const claim = getLastClaim();
  if (_board && _board.boards === boards && _board.pending === pending
    && _board.claimName === claim.name && _board.claimScore === claim.score && _board.run === run) {
    return _board;
  }
  const pendingThis = !!pending && pending.score === run.score;
  const claimedThis = claim.score === run.score && claim.name !== "";
  const newEntry = pendingThis || claimedThis;
  const best = boards.separate ? boards.weekBest : getMyBest();
  const youScore = newEntry ? run.score : Number.isFinite(best) && best > 0 ? best : -1;

  const rows = boards.weekly.map((e) => ({ name: e.name, score: e.score, you: false, key: "" }));
  let you = youScore > 0 ? rows.findIndex((r) => r.score === youScore) : -1;
  if (you < 0 && pendingThis) {
    // Not on the board until it has a name: hold its place with a blank one.
    let at = rows.findIndex((r) => r.score < run.score);
    if (at < 0) at = rows.length;
    if (at < boards.weeklySlots) {
      rows.splice(at, 0, { name: "— — —", score: run.score, you: false, key: "" });
      rows.length = Math.min(rows.length, boards.weeklySlots);
      you = at;
    }
  }
  const seen = new Map();
  rows.forEach((r, i) => {
    r.rank = boards.weeklyFirstRank + i;
    r.you = i === you;
    const base = `${r.name}|${r.score}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    r.key = r.you ? "you" : `${base}|${n}`;
    // Where a row starts when the records print: a new entry of yours climbs from below the list,
    // and the rows it passes start one place higher.
    r.from = r.you && newEntry ? rows.length : newEntry && you >= 0 && i > you ? i - 1 : i;
  });

  // "#2 this week · 8,638 to beat #1 Dev", or how far off the board you are.
  const week = boards.separate ? " this week" : "";
  let standing;
  if (you >= 0) {
    const r = rows[you];
    const above = rows[you - 1];
    standing = above
      ? `#${r.rank}${week} · ${formatNumber(above.score - r.score + 1)} to beat #${above.rank} ${above.name}`
      : `#${r.rank}${week} · top of the board`;
  } else if (rows.length >= boards.weeklySlots && rows.length > 0) {
    const last = rows[rows.length - 1];
    const mine = Math.max(run.score, youScore);
    standing = `${formatNumber(last.score - mine + 1)} to reach #${last.rank}`;
  } else {
    standing = "any run makes the board";
  }

  _board = {
    boards, pending, claimName: claim.name, claimScore: claim.score, run,
    rows, you, newEntry, standing, registered: claimedThis ? claim.name : "",
    pendingThis,
    allTime: boards.allTime.slice(0, 3),
    flag: boards.separate ? "--week" : "--top",
    key: rows.map((r) => `${r.key}:${r.rank}`).join(",") + `|${boards.allTime.map((e) => `${e.name}:${e.score}`).join(",")}|${standing}`,
  };
  return _board;
}

// Where each week row is drawn (in rows from the top), easing towards its rank.
const _slots = new Map();
let _lastT = null;

// Returns true once every row is in place.
function updateSlots(board, dt, snap) {
  let settled = true;
  const k = 1 - Math.exp(-CLIMB_RATE * dt);
  board.rows.forEach((r, i) => {
    let s = _slots.has(r.key) ? _slots.get(r.key) : r.from;
    s = snap ? i : s + (i - s) * k;
    if (Math.abs(i - s) < 0.01) s = i;
    else settled = false;
    _slots.set(r.key, s);
  });
  return settled;
}

// ---------------- layout ----------------

const _L = {
  x: 0, y: 0, w: 0, h: HEIGHT, splitX: 0, panesY: 0, panesH: 0, promptY: 0, statusY: 0,
  trackX: 0, cellW: 0,
};

function layout(W, offsetY) {
  const L = _L;
  L.w = Math.min(MAX_W, W - 36);
  L.x = Math.round((W - L.w) / 2);
  L.y = TOP + offsetY;
  L.splitX = L.x + L.w - RIGHT_W;
  L.panesY = L.y + BAR_H;
  L.statusY = L.y + L.h - STATUS_H;
  L.promptY = L.statusY - PROMPT_H;
  L.panesH = L.promptY - L.panesY;
  L.trackX = L.x + PAD_X + INDENT + LABEL_W;
  L.cellW = Math.min(MAX_CELL_W, (L.splitX - PAD_X - L.trackX) / COLS);
  return L;
}

// ---------------- drawing ----------------

// Text in parts, left to right. Returns where the next part would start.
function parts(ctx, list, x, y) {
  for (const p of list) {
    if (p.glow) {
      ctx.shadowColor = `rgba(${p.glow},0.6)`;
      ctx.shadowBlur = 5;
    }
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
    ctx.shadowBlur = 0;
    x += ctx.measureText(p.text).width;
  }
  return x;
}

// "> blackbox --replay 0042"
function command(ctx, x, y, cmd, flag, extra = "") {
  ctx.font = FONT;
  ctx.fillStyle = `rgb(${GREEN})`;
  ctx.fillText(">", x, y);
  x = parts(ctx, [{ text: `${cmd} `, color: BRIGHT }, { text: flag, color: `rgb(${CYAN})` }], x + INDENT, y);
  if (extra) parts(ctx, [{ text: extra, color: DIM }], x, y);
}

// Dot leaders between two x positions on a line.
function dots(ctx, from, to, y, color = "rgba(242,242,242,0.22)") {
  ctx.fillStyle = color;
  for (let dx = from + 3; dx < to - 3; dx += 3) ctx.fillRect(dx, y - 2.5, 1, 1);
}

// A trick's mark on its track.
function drawMark(ctx, key, cx, cy, rgb) {
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (key === "backflip") {
    ctx.arc(cx, cy, 2.2, -0.2 * Math.PI, 1.35 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 2.6, cy - 2.8);
    ctx.lineTo(cx + 2.4, cy - 0.2);
    ctx.lineTo(cx + 0.2, cy - 1.4);
    ctx.fill();
  } else if (key === "smash") {
    ctx.moveTo(cx, cy - 2.8);
    ctx.lineTo(cx + 2.4, cy);
    ctx.lineTo(cx, cy + 2.8);
    ctx.lineTo(cx - 2.4, cy);
    ctx.fill();
  } else if (key === "dodge") {
    ctx.moveTo(cx, cy - 2.6);
    ctx.lineTo(cx + 2.6, cy + 2);
    ctx.lineTo(cx - 2.6, cy + 2);
    ctx.fill();
  } else if (key === "closeCall") {
    ctx.fillRect(cx - 0.6, cy - 3, 1.3, 3.8);
    ctx.fillRect(cx - 0.6, cy + 1.6, 1.3, 1.3);
  } else {
    ctx.fillRect(cx - 1.2, cy - 2.4, 2.4, 4.8);
  }
}

// The black box: tracks, the rule with the run's length, the km labels. sweepK 0..1: how far the
// replay has got.
function drawBlackBox(ctx, L, run, top, sweepK) {
  const { trackX, cellW } = L;
  const reach = sweepK * (run.endCol + 1); // columns replayed so far
  const labelX = L.x + PAD_X + INDENT;

  // Names and counts
  ctx.font = FONT;
  run.lanes.forEach((lane, i) => {
    const y = top + i * LINE_H;
    ctx.textAlign = "left";
    ctx.fillStyle = `rgb(${lane.rgb})`;
    ctx.fillText(lane.label, labelX, y);
    ctx.textAlign = "right";
    ctx.fillStyle = BRIGHT;
    ctx.fillText(String(lane.count), trackX - 6, y);
  });
  ctx.textAlign = "left";

  // Empty cells as dots, up to where Bob died
  ctx.fillStyle = "rgba(242,242,242,0.2)";
  ctx.beginPath();
  run.lanes.forEach((lane, i) => {
    const cy = top + i * LINE_H - 3;
    for (let c = 0; c <= run.endCol; c++) {
      if (lane.cells[c] && c < reach) continue;
      ctx.rect(trackX + (c + 0.5) * cellW - 0.5, cy - 0.5, 1, 1);
    }
  });
  ctx.fill();

  // Your best run's distance, a dashed amber line through the tracks
  const ruleY = top + run.lanes.length * LINE_H - 4;
  if (run.ghostCol >= 0) {
    const gx = Math.round(trackX + (run.ghostCol + 0.5) * cellW) + 0.5;
    ctx.fillStyle = `rgba(${AMBER},0.8)`;
    for (let y = top - 8; y < ruleY + 3; y += 3) ctx.fillRect(gx - 0.5, y, 1, 1.6);
  }

  // The marks, as the replay reaches them
  ctx.save();
  run.lanes.forEach((lane, i) => {
    const cy = top + i * LINE_H - 3;
    ctx.shadowColor = `rgba(${lane.rgb},0.8)`;
    ctx.shadowBlur = 4;
    for (let c = 0; c < reach && c < COLS; c++) {
      if (lane.cells[c]) drawMark(ctx, lane.key, trackX + (c + 0.5) * cellW, cy, lane.rgb);
    }
  });
  ctx.restore();

  // The rule, filling in with the run's length
  const ruleW = COLS * cellW;
  ctx.fillStyle = "rgba(242,242,242,0.18)";
  ctx.fillRect(trackX, ruleY, ruleW, 1);
  ctx.save();
  ctx.shadowColor = `rgba(${CYAN},0.8)`;
  ctx.shadowBlur = 5;
  ctx.fillStyle = `rgb(${CYAN})`;
  ctx.fillRect(trackX, ruleY - 0.5, reach * cellW, 2);
  ctx.restore();

  // Where Bob died: a red line through the tracks once the replay gets there
  if (sweepK >= 1) {
    const ex = Math.round(trackX + (run.endCol + 0.5) * cellW) + 0.5;
    ctx.save();
    ctx.shadowColor = `rgba(${RED},0.9)`;
    ctx.shadowBlur = 4;
    ctx.fillStyle = `rgb(${RED})`;
    ctx.fillRect(ex - 0.5, top - 9, 1, ruleY - top + 12);
    ctx.restore();
  }

  // km labels
  ctx.font = `7px ${MONO}`;
  ctx.fillStyle = DIM;
  for (const k of run.km) ctx.fillText(k.text, trackX + k.col * cellW, ruleY + LINE_H);
}

// One printed record: rank, name, dot leaders, score. you: your row (cyan, highlighted).
function drawRecord(ctx, x, right, y, rank, rankRgb, name, score, opts = {}) {
  ctx.font = FONT;
  ctx.textAlign = "left";
  if (opts.you) {
    ctx.fillStyle = "rgb(6,9,13)";
    ctx.fillRect(x - 4, y - 8, right - x + 8, LINE_H);
    ctx.fillStyle = `rgba(${CYAN},0.13)`;
    ctx.fillRect(x - 4, y - 8, right - x + 8, LINE_H);
    ctx.fillStyle = `rgb(${CYAN})`;
    ctx.fillRect(x - 4, y - 8, 2, LINE_H);
  }
  ctx.fillStyle = opts.you ? `rgb(${CYAN})` : rankRgb ? `rgb(${rankRgb})` : "rgba(242,242,242,0.4)";
  ctx.fillText(rank, x, y);
  const nameX = x + 16;
  const label = opts.you ? `${name} ◂ you` : name;
  if (opts.fame) {
    ctx.save();
    ctx.shadowColor = `rgba(${GOLD},0.75)`;
    ctx.shadowBlur = 5;
    ctx.fillStyle = "rgb(255,236,190)";
    ctx.fillText(label, nameX, y);
    ctx.restore();
  } else {
    ctx.fillStyle = opts.you ? `rgb(${CYAN})` : "rgba(242,242,242,0.82)";
    ctx.fillText(label, nameX, y);
  }
  const scoreText = formatNumber(score);
  ctx.textAlign = "right";
  ctx.fillStyle = opts.you ? `rgb(${CYAN})` : BRIGHT;
  ctx.fillText(scoreText, right, y);
  ctx.textAlign = "left";
  dots(ctx, nameX + ctx.measureText(label).width, right - ctx.measureText(scoreText).width, y,
    opts.you ? `rgba(${CYAN},0.45)` : undefined);
}

function drawRecords(ctx, L, board, typed) {
  const x = L.splitX + PAD_X;
  const right = L.x + L.w - PAD_X;
  let y = L.panesY + PAD_Y + 8;
  if (typed < 1) return;
  command(ctx, x, y, "records", board.flag, board.flag === "--week" ? ` · purge ${weeklyResetIn()}` : "");
  y += LINE_H;

  // This week, each row at its eased slot. A row still climbing from below the list fades in.
  const n = Math.max(1, board.rows.length);
  if (board.rows.length === 0 && typed >= 2) {
    ctx.font = FONT;
    ctx.fillStyle = DIM;
    ctx.fillText("no runs yet this week · any run makes it", x, y);
  }
  // Printed in the order they start in, so a new entry of yours prints last, below the others;
  // yours is drawn last too, over the rows it climbs past.
  const drawRow = (r) => {
    if (typed < 2 + r.from) return;
    const slot = _slots.has(r.key) ? _slots.get(r.key) : r.from;
    ctx.save();
    ctx.globalAlpha = clamp(board.rows.length - slot, 0, 1);
    drawRecord(ctx, x, right, y + slot * LINE_H, String(r.rank).padStart(2, "0"), r.rank <= 3 ? PODIUM[r.rank - 1] : null,
      r.name, r.score, { you: r.you });
    ctx.restore();
  };
  for (const r of board.rows) if (!r.you) drawRow(r);
  if (board.you >= 0) drawRow(board.rows[board.you]);
  y += n * LINE_H + 5;

  if (typed < n + 2) return;
  command(ctx, x, y, "records", "--all-time");
  y += LINE_H;
  if (board.allTime.length === 0 && typed >= n + 3) {
    ctx.font = FONT;
    ctx.fillStyle = DIM;
    ctx.fillText("no records yet", x, y);
  }
  board.allTime.forEach((e, i) => {
    if (typed < n + 3 + i) return;
    drawRecord(ctx, x, right, y + i * LINE_H, `★${i + 1}`, GOLD, e.name, e.score, { fame: true });
  });
}

// Lines the records print: the week's command and rows, the all-time command and rows.
function recordLineCount(board) {
  return 1 + Math.max(1, board.rows.length) + 1 + Math.max(1, board.allTime.length);
}

// The prompt line. mode: "" (nothing yet), "register" or "reset". The cursor is drawn live.
function drawPrompt(ctx, L, mode, hot, touchUi, iter, registered) {
  const y = L.promptY;
  ctx.fillStyle = `rgba(${CYAN},0.18)`;
  ctx.fillRect(L.x, y, L.w, 1);
  if (!mode) return;
  if (hot) {
    ctx.fillStyle = `rgba(${RED},0.14)`;
    ctx.fillRect(L.x + 1, y + 1, L.w - 2, PROMPT_H - 1);
  }
  const base = y + 13.5;
  const x = L.x + PAD_X;
  ctx.font = PROMPT_FONT;
  ctx.textAlign = "left";
  ctx.fillStyle = `rgb(${GREEN})`;
  ctx.fillText(">", x, base);
  let key;
  if (mode === "register") {
    parts(ctx, [{ text: "register ", color: BRIGHT }, { text: "--subject", color: `rgb(${CYAN})` }], x + INDENT, base);
    key = "ENTER";
  } else {
    const ink = hot ? "rgb(255,110,120)" : `rgb(${CYAN})`;
    const cx = parts(ctx, [{ text: "reset", color: ink }], x + INDENT, base) + 4;
    ctx.font = `7px ${MONO}`;
    ctx.fillStyle = registered ? `rgb(${GREEN})` : DIM;
    ctx.fillText(registered ? `✓ subject registered · ${registered}` : `iteration ${iter} terminated`, cx + 14, base - 1);
    key = touchUi ? "TAP" : "SPACE";
  }

  // The key, as a little keycap on the right
  ctx.font = `7px ${MONO}`;
  const kw = ctx.measureText(key).width + 10;
  const kx = L.x + L.w - PAD_X - kw;
  const ky = y + 5;
  const rgb = hot ? "255,110,120" : CYAN;
  ctx.strokeStyle = `rgba(${rgb},0.7)`;
  ctx.lineWidth = 1;
  roundedRectPath(ctx, kx + 0.5, ky + 0.5, kw - 1, 10, 2.5);
  ctx.stroke();
  ctx.fillStyle = `rgba(${rgb},0.7)`;
  ctx.fillRect(kx + 2, ky + 10, kw - 4, 1);
  ctx.fillStyle = `rgb(${rgb})`;
  ctx.textAlign = "center";
  ctx.fillText(key, kx + kw / 2, ky + 7.5);
  ctx.textAlign = "left";
}

// Everything but the blinking bits. v: what has appeared so far (see drawEndConsole).
function drawWindow(ctx, L, run, board, v) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Body
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "rgba(6,9,13,0.95)";
  roundRect(ctx, L.x, L.y, L.w, L.h, 5);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.save();
  roundedRectPath(ctx, L.x, L.y, L.w, L.h, 5);
  ctx.clip();

  // Title bar
  ctx.fillStyle = `rgba(${CYAN},0.07)`;
  ctx.fillRect(L.x, L.y, L.w, BAR_H);
  ctx.fillStyle = `rgba(${CYAN},0.18)`;
  ctx.fillRect(L.x, L.y + BAR_H - 1, L.w, 1);
  ["#ff556e", "#ffb446", "#5fe39a"].forEach((c, i) => {
    ctx.fillStyle = c;
    roundRect(ctx, L.x + 8 + i * 7.5, L.y + 4.25, 4.5, 4.5, 1);
  });
  ctx.font = SMALL_FONT;
  ctx.fillStyle = "rgba(242,242,242,0.5)";
  ctx.fillText(`system://sector-00 · iteration ${run.iter}`, L.x + 38, L.y + 9);
  ctx.textAlign = "right";
  ctx.fillStyle = `rgb(${RED})`;
  ctx.fillText("CONTAINED", L.x + L.w - 8, L.y + 9);
  ctx.textAlign = "left";

  // Pane divider
  ctx.fillStyle = `rgba(${CYAN},0.18)`;
  ctx.fillRect(L.splitX, L.panesY, 1, L.panesH);

  // ---- left pane ----
  const x0 = L.x + PAD_X;
  const right = L.splitX - PAD_X;
  let y = L.panesY + PAD_Y + 8;
  ctx.font = FONT;
  ctx.fillStyle = DIM;
  ctx.fillText(stamp(0), x0, y);
  parts(ctx, [
    { text: run.cause, color: `rgb(${RED})` },
    { text: " · ", color: DIM },
    { text: `${formatNumber(run.dist)} m`, color: BRIGHT },
  ], x0 + STAMP_W, y);
  y += LINE_H;
  ctx.fillStyle = DIM;
  ctx.fillText(stamp(DEATH_SUMMARY_START_SEC), x0, y);
  ctx.fillStyle = SOFT;
  ctx.fillText("subject BOB retrieved", x0 + STAMP_W, y);
  y += LINE_H;

  if (v.tallyOn) {
    command(ctx, x0, y, "blackbox", `--replay ${run.iter}`);
    y += LINE_H;
    drawBlackBox(ctx, L, run, y, v.sweepK);
    y += (run.lanes.length + 2) * LINE_H;
    if (v.sweepK >= 1) {
      ctx.font = FONT;
      const after = parts(ctx, [{ text: `× ${run.cause} at ${formatNumber(run.dist)} m`, color: `rgb(${RED})` }], x0 + INDENT, y);
      if (run.prevM > 0) {
        parts(ctx, [{
          text: `   ¦ your best run ${formatNumber(run.prevM)} m${run.prevM < run.dist ? " · passed" : ""}`,
          color: `rgb(${AMBER})`,
        }], after, y);
      }
    }
    y += LINE_H;
    command(ctx, x0, y, "tally", `--iteration ${run.iter}`);
    y += LINE_H;

    // The score, counting up
    const sy = y + 8;
    ctx.font = FONT;
    ctx.fillStyle = SOFT;
    ctx.fillText("score", x0 + INDENT, sy);
    ctx.font = SCORE_FONT;
    ctx.textAlign = "right";
    const scoreText = formatNumber(v.score);
    ctx.save();
    ctx.shadowColor = "rgba(80,255,220,0.45)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = BRIGHT;
    ctx.fillText(scoreText, right, sy);
    ctx.restore();
    const scoreW = ctx.measureText(scoreText).width;
    ctx.textAlign = "left";
    ctx.font = FONT;
    dots(ctx, x0 + INDENT + ctx.measureText("score").width, right - scoreW - 4, sy);
    y += SCORE_H;

    if (v.done) {
      const after = parts(ctx, run.verdict, x0 + INDENT, y);
      parts(ctx, [{ text: "  ·  ", color: DIM }, { text: board.standing, color: `rgb(${AMBER})` }], after, y);
    }
  }

  // ---- right pane ----
  drawRecords(ctx, L, board, v.typed);

  // ---- prompt line and status bar ----
  drawPrompt(ctx, L, v.mode, v.hot, v.touchUi, run.iter, board.registered);
  ctx.fillStyle = `rgba(${CYAN},0.85)`;
  ctx.fillRect(L.x, L.statusY, L.w, STATUS_H);
  ctx.font = SMALL_FONT;
  const sb = L.statusY + 8;
  ctx.fillStyle = "#071018";
  ctx.fillText("[sim]", L.x + 6, sb);
  const tabX = L.x + 6 + ctx.measureText("[sim]").width + 8;
  const tabW = ctx.measureText("0:blackbox*").width + 8;
  ctx.fillRect(tabX, L.statusY, tabW, STATUS_H);
  ctx.fillStyle = `rgb(${CYAN})`;
  ctx.fillText("0:blackbox*", tabX + 4, sb);
  ctx.fillStyle = "#071018";
  ctx.fillText("1:records", tabX + tabW + 8, sb);
  ctx.textAlign = "right";
  ctx.fillText(`SECTOR-00 · SUBJECT BOB · ITERATION ${run.iter}`, L.x + L.w - 6, sb);
  ctx.textAlign = "left";
  ctx.restore(); // clip

  // Frame
  ctx.strokeStyle = `rgba(${CYAN},0.32)`;
  ctx.lineWidth = 1;
  roundedRectPath(ctx, L.x + 0.5, L.y + 0.5, L.w - 1, L.h - 1, 5);
  ctx.stroke();
  ctx.restore();
}

// The score as it counts up: the finished rows, plus the counting row easing in.
function shownScore(state) {
  const rows = state.tallyRows;
  if (!state.scoreTallyActive || !rows || rows.length === 0) return 0;
  const banked = state.scoreTally || 0;
  if (state.scoreTallyDone) return banked;
  const row = rows[state.tallyRow];
  if (!row) return banked;
  return banked + row.points * easeOutCubic((state.tallyRowT || 0) / (tallyRowSec(row) * 0.8));
}

const _view = { tallyOn: false, sweepK: 0, score: 0, done: false, typed: 0, mode: "", hot: false, touchUi: false };
const _box = { x: 0, y: 0, w: 0, h: 0 };
const _promptRect = { x: 0, y: 0, w: 0, h: 0 };

// pointerUi: { x, y } in UI units, or null. ready: RESET can be pressed.
export function drawEndConsole(ctx, state, W, pointerUi, ready, touchUi) {
  const run = getRunData(state);
  const board = getBoardData(run);
  const skipped = state.summarySkipped === true;

  const uiTime = state.uiTime || 0;
  const dt = _lastT === null ? 0 : clamp(uiTime - _lastT, 0, 0.1);
  _lastT = uiTime;

  // Slide down from above the screen as the claw grabs Bob.
  const dropK = skipped ? 1 : easeOutCubic((state.scoreBoardT || 0) / RUN_SUMMARY_DROP_SEC);
  const L = layout(W, -(TOP + HEIGHT + 20) * (1 - dropK));

  const v = _view;
  v.tallyOn = state.scoreTallyActive === true;
  const tallySec = v.tallyOn ? state.tallyRows.reduce((s, r) => s + tallyRowSec(r), 0) : 0;
  v.sweepK = !v.tallyOn ? 0 : tallySec > 0 ? clamp((state.scoreTallyT || 0) / tallySec, 0, 1) : 1;
  v.score = shownScore(state);
  v.done = state.scoreTallyDone === true;
  const lines = recordLineCount(board);
  v.typed = v.done ? Math.min(lines, Math.floor((state.scoreTallyDoneT || 0) / TYPE_LINE_SEC) + 1) : 0;
  // Rows ease to their ranks once the whole week has printed.
  const rowsSettled = v.typed > board.rows.length ? updateSlots(board, dt, skipped) : false;

  // The prompt: register while this run's name prompt is up, else RESET.
  v.mode = !ready ? "" : board.pendingThis ? "register" : "reset";
  _promptRect.x = L.x;
  _promptRect.y = L.promptY;
  _promptRect.w = L.w;
  _promptRect.h = PROMPT_H;
  v.hot = v.mode === "reset" && dropK >= 1 && !!pointerUi && pointInRect(pointerUi.x, pointerUi.y, _promptRect);
  v.touchUi = touchUi;
  hitAreas.resetHovered = v.hot;

  const settled = dropK >= 1 && v.sweepK >= 1 && v.done && v.typed >= lines && rowsSettled && v.mode !== "";
  if (settled) {
    _box.x = L.x;
    _box.y = L.y;
    _box.w = L.w;
    _box.h = L.h;
    const key = `${L.x}|${L.w}|${board.key}|${v.mode}|${v.hot}|${touchUi}|${board.registered}|${board.flag === "--week" ? weeklyResetIn() : ""}`;
    drawCachedPanel(ctx, "endConsole", key, _box, (c) => drawWindow(c, L, run, board, v));
  } else {
    drawWindow(ctx, L, run, board, v);
  }

  // Live: the CONTAINED light and the prompt's cursor.
  ctx.save();
  if (Math.floor(uiTime / 0.55) % 2 === 0) {
    ctx.font = SMALL_FONT;
    const lx = L.x + L.w - 8 - ctx.measureText("CONTAINED").width - 6;
    ctx.shadowColor = `rgb(${RED})`;
    ctx.shadowBlur = 5;
    ctx.fillStyle = `rgb(${RED})`;
    ctx.beginPath();
    ctx.arc(lx, L.y + 6.75, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (v.mode) {
      ctx.font = PROMPT_FONT;
      const word = v.mode === "register" ? "register --subject" : "reset";
      const cx = L.x + PAD_X + INDENT + ctx.measureText(word).width + (v.mode === "register" ? 5 : 4);
      ctx.fillStyle = v.hot ? "rgb(255,110,120)" : `rgb(${CYAN})`;
      ctx.fillRect(cx, L.promptY + 6, 5, 9);
    }
  }
  ctx.restore();
}
