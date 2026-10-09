// src/render/hud/shell.js
// The start screen's simulation shell (docs/start-screen-terminal-variations.html, 03 Split clear):
// text straight on the sky (ui/layout.js getShellLayout places it), with no backdrop: a dark shadow
// on the text keeps it readable.
// - Top left: SIMULATION ONLINE · ITERATION, NO GROUND, the tagline, and the TRAINING and CONTROLS
//   chips. Under them, the operator's column: "> operator NAME @ sector-00" (the player runs the
//   simulation; Bob is its subject), the system's log, YOUR BEST, and the operator's buttons
//   (TERMINATE BOB, CHANGE OPERATOR). Those two print their confirm in place of the log; TRAINING and
//   CONTROLS open a sheet over the whole column.
// - Top right, above the START firewall: the records (the all-time top 3, then this week's top 10
//   and the time until the week is purged). Your name glows on them.
// - Under the firewall: SPACE OR TAP TO BREAK OUT, blinking, once the claw has let Bob go.
//
// The start push (render/camera.js) times it: the log narrates the claw carrying Bob in (its
// timestamps are START_PUSH's) while the records type themselves in, and once the claw lets go the
// BREAK OUT hint flashes on. Static pieces are cached (panelCache.js); while the shell slides they're
// drawn directly.

import { START_PUSH, START_PUSH_TOTAL } from "../../game/constants.js";
import { LESSONS, TAUGHT_LESSONS } from "../../game/tutorial.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { clamp } from "../../shared/math.js";
import { formatIteration } from "../../ui/iteration.js";
import { pointInRect } from "../../ui/layout.js";
import { isTrainingDone } from "../../ui/training.js";
import { AIR_MOVES, MATERIALS, ROOF_MOVES } from "./controls.js";
import { drawCachedPanel } from "./panelCache.js";
import { formatNumber, roundRect } from "./primitives.js";

const MONO = "Share Tech Mono, Menlo, monospace";
const ORB = "Orbitron, Share Tech Mono, Menlo, monospace";
const CYAN = "120,205,255";
const AMBER = "255,180,70";
const RED = "255,85,110";
const MAGENTA = "255,90,200";
const GREEN = "95,227,154";
const GOLD = "255,212,121";
const PODIUM = ["255,212,121", "212,221,232", "227,164,108"]; // ranks 1-3: gold, silver, bronze
const DIM = "rgba(242,242,242,0.32)";
const SOFT = "rgba(242,242,242,0.62)";
const BRIGHT = "rgba(255,255,255,0.95)";
const TEXT_SHADOW = "rgba(0,0,0,0.9)"; // keeps text readable over the city

const LOG_FONT = `8.5px ${MONO}`;
const LOG_LINE_H = 13;
const REC_FONT = `8.5px ${MONO}`;
const REC_SMALL_FONT = `8px ${MONO}`; // notes (an empty board)
const REC_TITLE_H = 12;
const REC_SEC_H = 14;
const REC_ROW_H = 12;
const SLIDE_IN_SEC = 0.25;   // the shell slides in as the start screen begins
const WAKE_FLASH_SEC = 0.7;  // the BREAK OUT hint flashes as it comes on
const TYPE_START_SEC = 0.1;  // the records start typing as the shell appears, alongside the log...
const TYPE_LINE_SEC = 0.06;  // ...one line every this long (the whole printout in about 0.8 s)

// When the log's lines appear: the claw has Bob, Bob is on the roof, the claw has let go.
const T_GRIP = START_PUSH.ARM_DELAY + START_PUSH.ARM_REACH;
const T_LANDED = T_GRIP + START_PUSH.PUSH;
const T_RELEASED = START_PUSH_TOTAL;

// Where Bob stands on the start screen (screen x of his centre): clear of the shell's column.
export function shellBobX(W, layout) {
  return layout.bobX;
}

// How far the shell is slid out, 0 (in place) to 1 (gone): the left side to the left, the records
// to the right.
// startPushT: seconds into the start push. zoomOutK: the zoom-out after BREAK OUT (0..1), or null.
export function shellSlideK(startPushT, zoomOutK) {
  if (zoomOutK !== null) {
    const k = clamp(zoomOutK * 1.4, 0, 1);
    return k * k * k;
  }
  const k = clamp(startPushT / SLIDE_IN_SEC, 0, 1);
  return Math.pow(1 - k, 3);
}

// Run a cached piece, or draw it directly while the shell slides (a moving piece would repaint anyway).
function piece(ctx, cached, slot, key, box, draw) {
  return cached ? drawCachedPanel(ctx, slot, key, box, draw) : draw(ctx);
}

function setSpacing(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

// o: { slideK, pointer ({ x, y } in UI units, or null), touchUi, uiTime, pushT (seconds into the
//      start push; Infinity once it's over), awakeAge (seconds since the claw let go, or -1),
//      lastRun, boards, myBest, resetIn, nowMs,
//      operator ({ name ("" when no one is signed in), queued (CHANGE OPERATOR), termination
//      ({ name, at } after TERMINATE BOB, else null) }), holdK (HOLD TO TERMINATE BOB, 0..1),
//      hint (where the BREAK OUT hint goes, under the firewall: { x, y, w, h }, or null) }
export function drawShell(ctx, state, L, o) {
  const cached = o.slideK === 0;
  const view = state.shellView || "home";
  const hot = (rect) => !!o.pointer && cached && pointInRect(o.pointer.x, o.pointer.y, rect);
  const op = o.operator;

  // The records, top right: they slide in and out on the right.
  const records = buildRecords(o.boards, o.myBest, op);
  // They type in as the shell appears; during the zoom-out (pushT Infinity) they're all there.
  const typed = typedLines(records.lines.length, o.pushT);
  ctx.save();
  if (o.slideK) ctx.translate((L.records.w + 44) * o.slideK, 0);
  piece(ctx, cached, "shellRecords", `${rectKey(L.records)}|${o.resetIn}|${typed}|${records.key}`, L.records,
    (c) => drawRecords(c, L.records, records, typed, o.resetIn));
  ctx.restore();

  // SPACE OR TAP TO BREAK OUT, under the firewall, once the claw has let go.
  if (o.hint && o.awakeAge >= 0) drawBreakHint(ctx, o.hint, o, hot(o.hint));

  ctx.save();
  if (o.slideK) ctx.translate(-(L.panel.w + 30) * o.slideK, 0);

  // The iteration about to run. Once BREAK OUT has counted it, it's state.iteration (TRAINING isn't counted).
  const counted = state.menuZooming === true && !state.tutorial;
  const iterText = formatIteration((state.iteration || 0) + (counted ? 0 : 1));
  piece(ctx, cached, "shellTitle", `${rectKey(L.title)}|${iterText}`, L.title, (c) => drawTitle(c, L.title, iterText));

  const trainingOpen = view === "training";
  const controlsOpen = view === "controls";
  const trainingHot = hot(L.training);
  const controlsHot = hot(L.controls);
  piece(ctx, cached, "shellTraining", `${rectKey(L.training)}|${trainingOpen}|${trainingHot}`, L.training,
    (c) => drawMenuChip(c, L.training, "TRAINING", drawTargetIcon, { open: trainingOpen, hot: trainingHot, rgb: GREEN }));
  piece(ctx, cached, "shellControls", `${rectKey(L.controls)}|${controlsOpen}|${controlsHot}`, L.controls,
    (c) => drawMenuChip(c, L.controls, "CONTROLS", drawKeysIcon, { open: controlsOpen, hot: controlsHot, rgb: AMBER }));
  // TRAINING pulses until it's been finished on this device.
  if (!isTrainingDone() && !trainingOpen) drawPulse(ctx, L.training, o.uiTime);

  if (controlsOpen) {
    const closeHot = hot(L.close);
    piece(ctx, cached, "shellSheet", `controls|${rectKey(L.sheet)}|${o.touchUi}|${closeHot}`, L.sheet,
      (c) => drawControlsSheet(c, sheetLayout(L), o.touchUi, closeHot));
  } else if (trainingOpen) {
    const closeHot = hot(L.close);
    const beginHot = hot(L.begin);
    const done = isTrainingDone();
    piece(ctx, cached, "shellSheet", `training|${rectKey(L.sheet)}|${o.touchUi}|${done}|${closeHot}|${beginHot}`, L.sheet,
      (c) => drawTrainingSheet(c, sheetLayout(L), o.touchUi, done, closeHot, beginHot));
  } else {
    piece(ctx, cached, "shellOperator", `${rectKey(L.operator)}|${op.name}|${op.queued}`, L.operator,
      (c) => drawOperatorLine(c, L.operator, op));
    const confirmBox = { x: L.log.x, y: L.log.y, w: L.log.w, h: L.cancel.y + L.cancel.h - L.log.y };
    if (view === "terminate") {
      const holdHot = hot(L.hold);
      const cancelHot = hot(L.cancel);
      const iter = formatIteration(state.iteration || 0);
      // The button fills while it's held, so it's drawn live then.
      piece(ctx, cached && o.holdK === 0, "shellConfirm", `terminate|${rectKey(confirmBox)}|${op.name}|${iter}|${o.myBest}|${holdHot}|${cancelHot}`, confirmBox,
        (c) => drawTerminateConfirm(c, L, op.name, iter, o.myBest, holdHot, cancelHot, o.holdK));
    } else if (view === "operator") {
      const queueHot = hot(L.hold);
      const cancelHot = hot(L.cancel);
      piece(ctx, cached, "shellConfirm", `operator|${rectKey(confirmBox)}|${op.name}|${queueHot}|${cancelHot}`, confirmBox,
        (c) => drawChangeConfirm(c, L, op.name, queueHot, cancelHot));
    } else {
      drawLog(ctx, L.log, buildLog(o.lastRun, o.nowMs, Math.floor(L.log.h / LOG_LINE_H), op), o.pushT, o.uiTime);
      const best = bestInfo(o.boards, o.myBest, op);
      piece(ctx, cached, "shellBest", `${rectKey(L.best)}|${best.key}`, L.best, (c) => drawBest(c, L.best, best));
      if (op.name) {
        const termHot = hot(L.terminate);
        const changeHot = hot(L.changeOperator);
        const box = { x: L.terminate.x, y: L.terminate.y, w: L.changeOperator.x + L.changeOperator.w - L.terminate.x, h: L.terminate.h };
        piece(ctx, cached, "shellOpButtons", `${rectKey(box)}|${op.queued}|${termHot}|${changeHot}`, box,
          (c) => drawOperatorButtons(c, L, op.queued, termHot, changeHot));
      }
    }
  }

  ctx.restore();
}

function rectKey(r) {
  return `${r.x}|${r.y}|${r.w}|${r.h}`;
}

// The sheets draw over the column, under the chips.
function sheetLayout(L) {
  return { body: L.sheet, close: L.close, begin: L.begin };
}

// ---------------- title ----------------

// SIMULATION ONLINE · ITERATION 0043, NO GROUND (GROUND in red), and the tagline.
function drawTitle(ctx, r, iterText) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 5;
  ctx.font = `8.4px ${MONO}`;
  setSpacing(ctx, 1.85);
  ctx.fillStyle = `rgba(${CYAN},0.8)`;
  ctx.fillText(`SIMULATION ONLINE · ITERATION ${iterText}`, r.x, r.y + 14);

  ctx.font = `800 38px ${ORB}`;
  setSpacing(ctx, 2.3);
  const base = r.y + 54;
  ctx.shadowColor = `rgba(${CYAN},0.35)`;
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#f2f2f2";
  ctx.fillText("NO ", r.x, base);
  const noW = ctx.measureText("NO ").width;
  ctx.shadowColor = `rgba(${RED},0.6)`;
  ctx.shadowBlur = 13;
  ctx.fillStyle = `rgb(${RED})`;
  ctx.fillText("GROUND", r.x + noW, base);

  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 5;
  ctx.font = `10px ${MONO}`;
  setSpacing(ctx, 0.6);
  ctx.fillStyle = "rgba(242,242,242,0.6)";
  ctx.fillText("Break the firewall. Don't touch the ground.", r.x, r.y + 72);
  ctx.restore();
}

// TRAINING / CONTROLS: a chip with an icon. open: its sheet is showing; hot: under the pointer.
function drawMenuChip(ctx, r, label, icon, { open = false, hot = false, rgb = CYAN }) {
  ctx.save();
  if (hot || open) {
    ctx.shadowColor = `rgba(${rgb},0.45)`;
    ctx.shadowBlur = 10;
  }
  ctx.fillStyle = "rgba(10,14,20,0.78)";
  roundRect(ctx, r.x, r.y, r.w, r.h, 4.8);
  ctx.shadowBlur = 0;
  if (open) {
    ctx.fillStyle = `rgba(${rgb},0.16)`;
    roundRect(ctx, r.x, r.y, r.w, r.h, 4.8);
  }
  ctx.strokeStyle = hot || open ? `rgba(${rgb},0.9)` : `rgba(${CYAN},0.35)`;
  ctx.lineWidth = 0.8;
  roundedRectPath(ctx, r.x + 0.4, r.y + 0.4, r.w - 0.8, r.h - 0.8, 4.8);
  ctx.stroke();
  const ink = open ? `rgb(${rgb})` : "#e8f6ff";
  icon(ctx, r.x + 15, r.y + r.h / 2, ink);
  ctx.font = `700 8.4px ${ORB}`;
  setSpacing(ctx, 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.fillText(label, r.x + 25, r.y + r.h / 2 + 3);
  ctx.restore();
}

// TRAINING's icon: a target.
function drawTargetIcon(ctx, cx, cy, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.moveTo(cx + 1.7, cy);
  ctx.arc(cx, cy, 1.7, 0, Math.PI * 2);
  ctx.stroke();
}

// CONTROLS' icon: a keyboard.
function drawKeysIcon(ctx, cx, cy, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  roundedRectPath(ctx, cx - 5.5, cy - 3.5, 11, 7, 1.3);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(cx - 3.5, cy - 1.5, 1, 1);
  ctx.fillRect(cx - 1, cy - 1.5, 2, 1);
  ctx.fillRect(cx + 2.5, cy - 1.5, 1, 1);
  ctx.fillRect(cx - 2.5, cy + 1, 5, 1);
}

// TRAINING's chip pulses (a soft outline in its colour) until TRAINING has been finished on this device.
function drawPulse(ctx, r, uiTime) {
  const k = 0.5 + 0.5 * Math.sin((uiTime || 0) * 3);
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.6 * k;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = `rgba(${GREEN},0.9)`;
  ctx.shadowBlur = 4 + 8 * k;
  ctx.strokeStyle = `rgba(${GREEN},0.95)`;
  roundedRectPath(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 4.8);
  ctx.stroke();
  ctx.restore();
}

// [SPACE] OR TAP TO BREAK OUT ([TAP] TO BREAK OUT on touch screens), centred in r. It blinks; it
// flashes as it comes on, holds steady under the pointer, and fades with the shell as it slides.
function drawBreakHint(ctx, r, o, hot) {
  const key = o.touchUi ? "TAP" : "SPACE";
  const text = o.touchUi ? "TO BREAK OUT" : "OR TAP TO BREAK OUT";
  const flash = o.awakeAge < WAKE_FLASH_SEC ? 1 - o.awakeAge / WAKE_FLASH_SEC : 0;
  const blink = Math.floor((o.uiTime || 0) / 0.7) % 2 === 0 ? 1 : 0.25;
  const alpha = (hot || flash > 0 ? 1 : blink) * (1 - o.slideK);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `10px ${MONO}`;
  setSpacing(ctx, 2.5);
  const keyW = ctx.measureText(key).width + 9;
  const gap = 10;
  const total = keyW + gap + ctx.measureText(text).width;
  let x = r.x + (r.w - total) / 2;
  const cy = r.y + r.h / 2;
  ctx.shadowColor = `rgba(${CYAN},${0.8 + 0.2 * flash})`;
  ctx.shadowBlur = 8 + 10 * flash;
  // The key, as a keycap
  ctx.strokeStyle = `rgba(${CYAN},0.7)`;
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 0.5, cy - 7, keyW - 1, 14, 2.5);
  ctx.stroke();
  ctx.fillStyle = `rgba(${CYAN},0.7)`;
  ctx.fillRect(x + 1.5, cy + 6.5, keyW - 3, 1.5);
  ctx.fillStyle = `rgb(${CYAN})`;
  ctx.fillText(key, x + 4.5, cy + 3.5);
  x += keyW + gap;
  ctx.fillStyle = hot ? "#fff" : "rgba(215,245,255,0.9)";
  ctx.fillText(text, x, cy + 3.5);
  ctx.restore();
}

// ---------------- log ----------------

const stamp = (sec) => `[${sec.toFixed(2).padStart(5, "0")}]`;

// The log's lines in order: { at (seconds into the push), stamp, parts: [{ text, color }],
// flavour (dropped first when the log is short of room), cursor }. Lines without a stamp are indented.
// op: the operator (see drawShell). Straight after TERMINATE BOB (no run since), the log reports that
// instead of the last run, and Bob has something to say about it.
function buildLog(lastRun, nowMs, maxLines, op) {
  const lines = [];
  const end = op.termination;
  const justTerminated = !!end && (!lastRun || !(lastRun.endedAt > end.at));
  if (justTerminated) {
    lines.push(
      { at: 0, stamp: stamp(0), parts: [{ text: "subject BOB TERMINATED", color: `rgb(${RED})` }] },
      ...(end.name ? [{ at: 0, parts: [{ text: `operator ${end.name} signed out`, color: SOFT }] }] : []),
      { at: T_GRIP, stamp: stamp(T_GRIP), parts: [{ text: "BOB rebuilt · iteration 0001", color: SOFT }] },
    );
  } else if (lastRun) {
    const best = Number.isFinite(lastRun.best) ? lastRun.best : 0;
    const score = lastRun.score || 0;
    const vsBest = best <= 0 ? null
      : score > best ? { text: "  NEW BEST", color: `rgb(${GOLD})` }
        : { text: `  −${formatNumber(best - score)} vs best`, color: DIM };
    lines.push(
      { at: 0, stamp: stamp(0), parts: [{ text: `iteration ${formatIteration(lastRun.iteration)} TERMINATED`, color: `rgb(${RED})` }] },
      { at: 0, parts: [
        { text: lastRun.cause === "ad" ? "ad impact · " : "ground contact · ", color: SOFT },
        { text: `${formatNumber(lastRun.distance)} m`, color: BRIGHT },
      ] },
      { at: 0, parts: [
        { text: "score ", color: SOFT },
        { text: formatNumber(score), color: BRIGHT },
        ...(vsBest ? [vsBest] : []),
      ] },
    );
  } else {
    lines.push({ at: 0, stamp: stamp(0), parts: [{ text: "no previous iterations", color: SOFT }] });
  }
  const opAt = justTerminated ? T_LANDED : T_GRIP;
  if (op.name) {
    lines.push({ at: opAt, stamp: stamp(opAt), parts: op.queued
      ? [{ text: `operator ${op.name} · `, color: SOFT }, { text: "change queued", color: `rgb(${AMBER})` }]
      : [{ text: `operator ${op.name} connected`, color: `rgb(${CYAN})` }] });
  } else {
    lines.push(
      { at: opAt, stamp: stamp(opAt), parts: [{ text: "operator: ", color: SOFT }, { text: "unregistered", color: `rgb(${AMBER})` }] },
      { at: opAt, parts: [{ text: "reach the top 10 to sign in", color: SOFT }] },
    );
  }
  if (!justTerminated) {
    lines.push({ at: T_LANDED, stamp: stamp(T_LANDED), flavour: true, parts: [{ text: "BOB loaded · memory wiped", color: SOFT }] });
  }
  lines.push({ at: T_RELEASED, stamp: stamp(T_RELEASED), cursor: true,
    parts: [{ text: justTerminated ? "BOB: told you." : "BOB: let me out.", color: `rgb(${MAGENTA})` }] });
  // Short of room: the flavour lines go first, then the last run's detail lines.
  for (let i = lines.length - 1; i >= 0 && lines.length > maxLines; i--) {
    if (lines[i].flavour) lines.splice(i, 1);
  }
  while (lines.length > maxLines && lines.length > 2 && !lines[1].stamp) lines.splice(1, 1);
  return lines;
}

function drawLog(ctx, rect, lines, pushT, uiTime) {
  ctx.save();
  ctx.font = LOG_FONT;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const stampW = ctx.measureText("[00.00] ").width;
  let y = rect.y + 9;
  for (const line of lines) {
    if (pushT < line.at) break;
    let x = rect.x;
    ctx.shadowColor = TEXT_SHADOW;
    ctx.shadowBlur = 4;
    if (line.stamp) {
      ctx.fillStyle = DIM;
      ctx.fillText(line.stamp, x, y);
    }
    x += stampW;
    for (const part of line.parts) {
      ctx.fillStyle = part.color;
      ctx.fillText(part.text, x, y);
      x += ctx.measureText(part.text).width;
    }
    if (line.cursor && Math.floor((uiTime || 0) / 0.55) % 2 === 0) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgb(${CYAN})`;
      ctx.fillRect(x + 3, y - 7, 5, 8);
    }
    y += LOG_LINE_H;
  }
  ctx.restore();
}

// ---------------- records (the leaderboard, printed by the shell) ----------------

// Your rows: your best's score, filed under the operator's name (so after TERMINATE BOB or CHANGE
// OPERATOR, the old name's rows aren't yours any more). Before operators there was no name to check:
// with no one signed in and no TERMINATE BOB since, your best's row is yours by its score alone.
function isMine(entry, score, op) {
  if (!(score > 0) || entry.score !== score) return false;
  return op.name ? entry.name === op.name : !op.termination;
}

// What the records print, as lines in typing order, from getBoards() (leaderboard/state.js):
//   RECORDS
//   ALL-TIME ──────── TOP 3            then the top 3, one per line
//   THIS WEEK ─── PURGE IN 116:56:35   then this week's top 10, one per line
// (Without a weekly board from the Worker, the second part is ranks 4-10 of the single list.)
// key: for the panel cache.
function buildRecords(boards, myBest, op) {
  const best = Number.isFinite(myBest) ? myBest : 0;
  const youIn = (entries, score) => entries.findIndex((e) => isMine(e, score, op));
  const lines = [{ kind: "title" }, { kind: "sec", text: "ALL-TIME", rgb: GOLD, right: "TOP 3" }];
  const allYou = youIn(boards.allTime, best);
  boards.allTime.slice(0, 3).forEach((e, i) => lines.push({ kind: "row", rank: i + 1, entry: e, you: i === allYou }));
  if (boards.allTime.length === 0) lines.push({ kind: "note", text: "no records yet" });

  if (boards.separate) {
    const week = boards.weekly;
    const weekBest = Number.isFinite(boards.weekBest) ? boards.weekBest : 0;
    const you = youIn(week, weekBest);
    lines.push({ kind: "sec", text: "THIS WEEK", rgb: CYAN, timer: true });
    if (week.length === 0) lines.push({ kind: "note", text: "no runs yet · any run makes it" });
    week.forEach((e, i) => lines.push({ kind: "row", rank: i + 1, entry: e, you: i === you }));
  } else {
    const rest = boards.weekly;
    const you = allYou >= 0 ? -1 : youIn(rest, best);
    lines.push({ kind: "sec", text: "TOP 10", rgb: CYAN, right: "" });
    rest.forEach((e, i) => lines.push({ kind: "row", rank: boards.weeklyFirstRank + i, entry: e, you: i === you }));
  }

  const key = lines.map((l) => (l.kind === "row" ? `${l.rank}:${l.entry.name}:${l.entry.score}:${l.you}` : `${l.kind}:${l.text || ""}`)).join("|");
  return { lines, key };
}

// How many of the printout's lines have typed in by pushT (seconds into the start push; Infinity
// once the start screen is over).
function typedLines(count, pushT) {
  if (!Number.isFinite(pushT)) return count;
  const t = pushT - TYPE_START_SEC;
  if (t < 0) return 0;
  return Math.min(count, Math.floor(t / TYPE_LINE_SEC) + 1);
}

function drawRecords(ctx, r, data, typed, resetIn) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 4;
  const right = r.x + r.w;
  let y = r.y;
  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i];
    const h = line.kind === "title" ? REC_TITLE_H : line.kind === "sec" ? REC_SEC_H : REC_ROW_H;
    if (i < typed) {
      if (line.kind === "title") {
        ctx.font = `700 7.6px ${ORB}`;
        setSpacing(ctx, 1.1);
        ctx.fillStyle = "rgba(242,242,242,0.85)";
        ctx.fillText("RECORDS", r.x, y + 8);
        setSpacing(ctx, 0);
      } else if (line.kind === "sec") {
        drawRecordsHead(ctx, line, r.x, right, y + 10, line.timer ? resetIn : "");
      } else if (line.kind === "note") {
        drawNote(ctx, r.x, y + 9, line.text);
      } else {
        drawRecordRow(ctx, line, r.x, right, y + 9);
      }
    }
    y += h;
  }
  ctx.restore();
}

// "ALL-TIME ──────── TOP 3" / "THIS WEEK ─── PURGE IN 116:56:35": the heading in its colour, a rule,
// and on the right a note or the time until the week is purged.
function drawRecordsHead(ctx, line, left, right, baseline, timer) {
  ctx.save();
  ctx.font = `6.4px ${MONO}`;
  setSpacing(ctx, 1.1);
  ctx.textAlign = "left";
  ctx.fillStyle = `rgba(${line.rgb},0.95)`;
  ctx.fillText(line.text, left, baseline);
  const textEnd = left + ctx.measureText(line.text).width;
  let noteStart = right;
  ctx.textAlign = "right";
  if (timer) {
    ctx.fillStyle = "rgba(242,242,242,0.85)";
    ctx.fillText(timer, right, baseline);
    noteStart = right - ctx.measureText(timer).width;
    ctx.fillStyle = "rgba(242,242,242,0.45)";
    ctx.fillText("PURGE IN ", noteStart, baseline);
    noteStart -= ctx.measureText("PURGE IN ").width;
  } else if (line.right) {
    ctx.fillStyle = "rgba(242,242,242,0.45)";
    ctx.fillText(line.right, right, baseline);
    noteStart = right - ctx.measureText(line.right).width;
  }
  if (noteStart - 5 > textEnd + 5) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(${line.rgb},0.35)`;
    ctx.fillRect(textEnd + 5, baseline - 2.3, noteStart - 5 - (textEnd + 5), 0.8);
  }
  ctx.restore();
}

function drawNote(ctx, x, baseline, text) {
  ctx.font = REC_SMALL_FONT;
  ctx.fillStyle = DIM;
  ctx.fillText(text, x, baseline);
}

// "02 MANIMAC ◂ you ······ 31,279": rank, name, dot leaders, score. Your name glows.
function drawRecordRow(ctx, row, left, right, baseline) {
  const you = row.you;
  ctx.font = REC_FONT;
  const rankText = String(row.rank).padStart(2, "0");
  ctx.fillStyle = you ? `rgb(${CYAN})` : row.rank <= 3 ? `rgb(${PODIUM[row.rank - 1]})` : "rgba(242,242,242,0.38)";
  ctx.fillText(rankText, left, baseline);
  const nameX = left + 18;
  const scoreText = formatNumber(row.entry.score);
  const scoreW = ctx.measureText(scoreText).width;
  ctx.fillStyle = you ? `rgb(${CYAN})` : "#fff";
  ctx.textAlign = "right";
  ctx.fillText(scoreText, right, baseline);
  ctx.textAlign = "left";

  // Your row says "◂ you", or just "◂" when the full tag would cut your name short.
  const roomFor = (t) => right - scoreW - 8 - nameX - (t ? ctx.measureText(t).width : 0);
  let tag = you ? " ◂ you" : "";
  if (you && ctx.measureText(row.entry.name).width > roomFor(tag)) tag = " ◂";
  const name = fitText(ctx, row.entry.name, roomFor(tag));
  if (you) {
    ctx.save();
    ctx.shadowColor = `rgba(${CYAN},0.9)`;
    ctx.shadowBlur = 7;
    ctx.fillStyle = "rgb(191,232,255)";
    ctx.fillText(name + tag, nameX, baseline);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(242,242,242,0.85)";
    ctx.fillText(name, nameX, baseline);
  }

  // Dot leaders between the name and the score.
  const from = nameX + ctx.measureText(name + tag).width + 4;
  const to = right - scoreW - 4;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = you ? `rgba(${CYAN},0.5)` : "rgba(242,242,242,0.22)";
  for (let dx = from; dx < to; dx += 3) ctx.fillRect(dx, baseline - 2.3, 0.9, 0.9);
  ctx.restore();
}

// ---------------- the operator: their line, YOUR BEST, their buttons ----------------

// "> operator MANIMAC @ sector-00", ruled off underneath. CHANGE QUEUED on the right while a change waits.
function drawOperatorLine(ctx, r, op) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 4;
  ctx.font = `7.6px ${MONO}`;
  setSpacing(ctx, 0.4);
  const parts = [
    { text: "> ", color: `rgba(${CYAN},0.85)` },
    { text: "operator ", color: "rgba(242,242,242,0.55)" },
    op.name ? { text: op.name, color: BRIGHT } : { text: "none · unregistered", color: `rgb(${AMBER})` },
    { text: " @ sector-00", color: "rgba(242,242,242,0.55)" },
  ];
  let x = r.x;
  for (const p of parts) {
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, r.y + 10);
    x += ctx.measureText(p.text).width;
  }
  if (op.queued) {
    ctx.font = `6px ${MONO}`;
    setSpacing(ctx, 1);
    ctx.textAlign = "right";
    ctx.fillStyle = `rgb(${AMBER})`;
    ctx.fillText("CHANGE QUEUED", r.x + r.w, r.y + 10);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(${CYAN},0.3)`;
  ctx.fillRect(r.x, r.y + r.h, r.w, 0.8);
  ctx.restore();
}

// YOUR BEST: the operator's best, where it ranks, and how far it is from #1 (with a meter). With no
// operator signed in there's no best to show.
function bestInfo(boards, myBest, op) {
  const best = op.name && Number.isFinite(myBest) && myBest > 0 ? myBest : 0;
  const all = boards.allTime.findIndex((e) => isMine(e, best, op));
  const weekBest = Number.isFinite(boards.weekBest) ? boards.weekBest : 0;
  const week = boards.separate ? boards.weekly.findIndex((e) => isMine(e, weekBest, op)) : -1;
  const rank = all >= 0 ? ` · #${all + 1} ALL-TIME` : week >= 0 ? ` · #${week + 1} THIS WEEK` : "";
  const top = boards.allTime[0] ? boards.allTime[0].score : 0;
  let note = "";
  let sub;
  let pct = -1;
  if (!op.name) {
    note = "NO OPERATOR YET";
    sub = "TOP 10 RUN TO SIGN IN";
  } else if (best <= 0) {
    sub = "NO RECORDS YET";
  } else if (top > 0 && best < top) {
    sub = `${formatNumber(top - best)} TO BEAT #1`;
    pct = best / top;
  } else {
    sub = "TOP OF THE BOARD";
    pct = 1;
  }
  return { best, rank, note, sub, pct, key: `${best}|${rank}|${note}|${sub}|${pct}` };
}

function drawBest(ctx, r, info) {
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 4;
  ctx.fillStyle = "rgba(242,242,242,0.18)";
  ctx.fillRect(r.x, r.y, r.w, 0.8);
  const right = r.x + r.w;
  ctx.font = `6.6px ${MONO}`;
  setSpacing(ctx, 0.6);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(242,242,242,0.55)";
  ctx.fillText(`YOUR BEST${info.rank}`, r.x, r.y + 16);
  if (!info.note) ctx.fillText(info.sub, r.x, r.y + 28);
  ctx.textAlign = "right";
  if (info.note) {
    // No operator: "YOUR BEST · NO OPERATOR YET", then a dash and how to sign in.
    ctx.fillText(info.note, right, r.y + 16);
    ctx.fillText(info.sub, right, r.y + 30);
  } else if (info.pct >= 0) {
    ctx.fillText(`${Math.round(info.pct * 100)}%`, right, r.y + 28);
  }
  ctx.font = `13.6px ${MONO}`;
  setSpacing(ctx, 0);
  ctx.fillStyle = BRIGHT;
  if (info.note) {
    ctx.textAlign = "left";
    ctx.fillText("—", r.x, r.y + 31);
  } else {
    ctx.fillText(info.best > 0 ? formatNumber(info.best) : "—", right, r.y + 17);
  }
  if (info.pct >= 0) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(242,242,242,0.1)";
    roundRect(ctx, r.x, r.y + 33, r.w, 2.8, 1.4);
    const g = ctx.createLinearGradient(r.x, 0, right, 0);
    g.addColorStop(0, `rgba(${CYAN},0.6)`);
    g.addColorStop(1, `rgb(${AMBER})`);
    ctx.fillStyle = g;
    roundRect(ctx, r.x, r.y + 33, Math.max(2.8, r.w * clamp(info.pct, 0, 1)), 2.8, 1.4);
  }
  ctx.restore();
}

// A power symbol, centred on (cx, cy).
function drawPowerIcon(ctx, cx, cy, rad, color) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, rad, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + Math.PI * 2);
  ctx.moveTo(cx, cy - rad - 1);
  ctx.lineTo(cx, cy - 0.5);
  ctx.stroke();
  ctx.restore();
}

// A small outlined button in rgb, on a dark plate (for the sky behind it).
function drawSmallButton(ctx, r, label, rgb, hot, icon = null) {
  ctx.save();
  if (hot) {
    ctx.shadowColor = `rgba(${rgb},0.5)`;
    ctx.shadowBlur = 10;
  }
  ctx.fillStyle = hot ? `rgba(${rgb},0.28)` : "rgba(20,4,8,0.55)";
  roundRect(ctx, r.x, r.y, r.w, r.h, 2.8);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(${rgb},${hot ? 1 : 0.5})`;
  ctx.lineWidth = 0.8;
  roundedRectPath(ctx, r.x + 0.4, r.y + 0.4, r.w - 0.8, r.h - 0.8, 2.8);
  ctx.stroke();
  ctx.font = `6.8px ${MONO}`;
  setSpacing(ctx, 0.8);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const textW = ctx.measureText(label).width;
  const iconW = icon ? 10 : 0;
  let x = r.x + (r.w - textW - iconW) / 2;
  const ink = hot ? "#fff" : `rgba(${rgb},0.95)`;
  if (icon) {
    icon(ctx, x + 3, r.y + r.h / 2, 2.6, ink);
    x += iconW;
  }
  ctx.fillStyle = ink;
  ctx.fillText(label, x, r.y + r.h / 2 + 2.4);
  ctx.restore();
}

// TERMINATE BOB and CHANGE OPERATOR (CANCEL CHANGE while a change is queued).
function drawOperatorButtons(ctx, L, queued, termHot, changeHot) {
  drawSmallButton(ctx, L.terminate, "TERMINATE BOB", "255,140,155", termHot, drawPowerIcon);
  drawSmallButton(ctx, L.changeOperator, queued ? "✕ CANCEL CHANGE" : "CHANGE OPERATOR", AMBER, changeHot);
}

function drawSectionHead(ctx, text, left, right, baseline, rgb, timer = "") {
  ctx.save();
  ctx.font = `7px ${MONO}`;
  setSpacing(ctx, 1.2);
  ctx.textAlign = "left";
  ctx.fillStyle = `rgba(${rgb},0.92)`;
  ctx.fillText(text, left, baseline);
  let end = left + ctx.measureText(text).width;
  if (timer) {
    ctx.fillStyle = "rgba(242,242,242,0.78)";
    ctx.fillText(timer, end, baseline);
    end += ctx.measureText(timer).width;
  }
  if (end + 6 < right) {
    ctx.fillStyle = `rgba(${rgb},0.3)`;
    ctx.fillRect(end + 6, baseline - 2.5, right - end - 6, 1);
  }
  ctx.restore();
}


function fitText(ctx, text, maxW) {
  if (!text || ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

// ---------------- sheets ----------------

// The sheet's header row: a command, and ✕ CLOSE.
function drawSheetHead(ctx, L, verb, noun, closeHot) {
  const { x, y, w } = L.body;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `8.5px ${MONO}`;
  setSpacing(ctx, 0.4);
  ctx.fillStyle = `rgba(${CYAN},0.85)`;
  ctx.fillText(`> ${verb} `, x, y + 11);
  ctx.fillStyle = BRIGHT;
  ctx.fillText(noun, x + ctx.measureText(`> ${verb} `).width, y + 11);

  const c = L.close;
  if (closeHot) {
    ctx.fillStyle = "rgba(242,242,242,0.08)";
    roundRect(ctx, c.x, c.y + 1, c.w, c.h - 2, 3);
  }
  ctx.font = `6.5px ${MONO}`;
  setSpacing(ctx, 1.2);
  ctx.textAlign = "right";
  ctx.fillStyle = closeHot ? BRIGHT : "rgba(242,242,242,0.55)";
  ctx.fillText("✕ CLOSE", c.x + c.w - 4, y + 10.5);
  setSpacing(ctx, 0);
  ctx.fillStyle = "rgba(242,242,242,0.1)";
  ctx.fillRect(x, y + 18, w, 1);
}

function drawChip(ctx, text, x, cy, minW = 22) {
  ctx.font = `700 7.5px ${MONO}`;
  setSpacing(ctx, 0.4);
  const w = Math.max(minW, Math.ceil(ctx.measureText(text).width) + 10);
  ctx.fillStyle = `rgba(${CYAN},0.08)`;
  roundRect(ctx, x, cy - 6, w, 12, 2.5);
  ctx.strokeStyle = `rgba(${CYAN},0.6)`;
  ctx.lineWidth = 0.75;
  roundedRectPath(ctx, x + 0.5, cy - 5.5, w - 1, 11, 2.5);
  ctx.stroke();
  ctx.fillStyle = `rgba(${CYAN},0.6)`;
  ctx.fillRect(x + 2, cy + 5, w - 4, 1.2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8f6ff";
  ctx.fillText(text, x + w / 2, cy + 2.7);
  ctx.textAlign = "left";
  return w;
}

// CONTROLS: ON A ROOF and IN THE AIR side by side, then the two materials.
function drawControlsSheet(ctx, L, touchUi, closeHot) {
  const { x, y, w } = L.body;
  ctx.save();
  drawSheetHead(ctx, L, "man", "controls", closeHot);
  const colW = (w - 12) / 2;
  const top = y + 34;
  drawMoveColumn(ctx, "ON A ROOF", ROOF_MOVES, x, x + colW, top, touchUi);
  const bottom = drawMoveColumn(ctx, "IN THE AIR", AIR_MOVES, x + colW + 12, x + w, top, touchUi);

  let my = bottom + 12;
  drawSectionHead(ctx, "MATERIALS", x, x + w, my, AMBER);
  my += 14;
  for (const m of MATERIALS) {
    ctx.save();
    ctx.fillStyle = `rgb(${m.rgb})`;
    ctx.shadowColor = `rgb(${m.rgb})`;
    ctx.shadowBlur = 5;
    ctx.fillRect(x, my - 6, 6, 6);
    ctx.restore();
    ctx.font = `700 7px ${ORB}`;
    setSpacing(ctx, 0.8);
    ctx.textAlign = "left";
    ctx.fillStyle = `rgb(${m.rgb})`;
    ctx.fillText(m.name, x + 11, my);
    ctx.font = `8px ${MONO}`;
    setSpacing(ctx, 0);
    ctx.fillStyle = "rgba(242,242,242,0.7)";
    ctx.fillText(m.text, x + 11, my + 11);
    my += 24;
  }
  ctx.restore();
}

// A column of moves: key chip, label, HOLD. Returns the y below it.
// A mobile button already named for its move (DASH) gets no label, as on the old panel.
function drawMoveColumn(ctx, title, moves, left, right, top, touchUi) {
  drawSectionHead(ctx, title, left, right, top, AMBER);
  let cy = top + 12;
  for (const move of moves) {
    const chip = touchUi ? move.tap : move.key;
    const chipW = drawChip(ctx, chip, left, cy, 28);
    const label = chip === move.label.toUpperCase() ? "" : move.label;
    ctx.font = `8.5px ${MONO}`;
    setSpacing(ctx, 0);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(242,242,242,0.88)";
    const lx = left + chipW + 6;
    ctx.fillText(label, lx, cy + 3);
    if (move.hold) {
      const labelW = label ? ctx.measureText(label).width + 4 : 0;
      ctx.font = `6px ${MONO}`;
      setSpacing(ctx, 0.8);
      ctx.fillStyle = `rgb(${AMBER})`;
      ctx.fillText("HOLD", lx + labelW, cy + 2.5);
      setSpacing(ctx, 0);
    }
    cy += 15;
  }
  return cy - 8;
}

// TRAINING: the lessons and the final test, and BEGIN TRAINING.
function drawTrainingSheet(ctx, L, touchUi, done, closeHot, beginHot) {
  const { x, y, w } = L.body;
  const right = x + w;
  ctx.save();
  drawSheetHead(ctx, L, "load", "training.course", closeHot);
  drawSectionHead(ctx, `${TAUGHT_LESSONS} LESSONS · FINAL TEST · NOT ON THE BOARD${done ? " · ✓ DONE" : ""}`, x, right, y + 32, done ? GREEN : AMBER);

  const rowH = 13;
  let top = y + 38;
  LESSONS.forEach((lesson, i) => {
    const cy = top + rowH / 2;
    const next = !done && i === 0;
    if (next) {
      ctx.fillStyle = `rgba(${CYAN},0.1)`;
      roundRect(ctx, x - 6, top, w + 12, rowH, 3);
      ctx.fillStyle = `rgb(${CYAN})`;
      ctx.fillRect(x - 6, top, 2, rowH);
    }
    ctx.font = `8.5px ${MONO}`;
    setSpacing(ctx, 0.4);
    ctx.textAlign = "left";
    if (lesson.test) {
      ctx.fillStyle = `rgb(${AMBER})`;
      ctx.fillText("◆", x, cy + 3);
      ctx.fillText(lesson.name, x + 18, cy + 3);
      ctx.font = `7px ${MONO}`;
      ctx.fillStyle = DIM;
      ctx.textAlign = "right";
      ctx.fillText("no stops, no hints", right, cy + 2.5);
    } else {
      ctx.fillStyle = DIM;
      ctx.fillText(String(i + 1).padStart(2, "0"), x, cy + 3);
      ctx.fillStyle = next ? BRIGHT : "rgba(242,242,242,0.85)";
      ctx.fillText(lesson.name, x + 18, cy + 3);
      const chip = touchUi ? lesson.tapChip : lesson.chip;
      ctx.font = `700 7.5px ${MONO}`;
      const cw = Math.max(18, Math.ceil(ctx.measureText(chip).width) + 10);
      drawChip(ctx, chip, right - cw, cy, 18);
    }
    top += rowH;
  });

  // BEGIN TRAINING
  const b = L.begin;
  if (beginHot) {
    ctx.shadowColor = `rgba(${CYAN},0.45)`;
    ctx.shadowBlur = 14;
  }
  const body = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  body.addColorStop(0, beginHot ? "#24384c" : "#1f2b39");
  body.addColorStop(1, beginHot ? "#172331" : "#131b25");
  ctx.fillStyle = body;
  roundRect(ctx, b.x, b.y, b.w, b.h, 5);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = `rgb(${CYAN})`;
  ctx.lineWidth = 1;
  roundedRectPath(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 5);
  ctx.stroke();
  const cy = b.y + b.h / 2;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(b.x + 12, cy - 4);
  ctx.lineTo(b.x + 12, cy + 4);
  ctx.lineTo(b.x + 18.5, cy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 9px ${ORB}`;
  setSpacing(ctx, 1.4);
  ctx.textAlign = "left";
  ctx.fillText("BEGIN TRAINING", b.x + 25, cy + 3.3);
  ctx.restore();
}

// ---------------- TERMINATE BOB / CHANGE OPERATOR: their confirm, printed in place of the log ----------------

// The confirm's lines, from the top of the log: { mark ("x" | "ok" | "to" | ""), text, color }, or
// { cmd: [verb, noun] } for the command line.
function drawConfirmLines(ctx, x, y, lines) {
  const MARKS = { x: ["✕", RED], ok: ["✓", GREEN], to: ["→", CYAN] };
  ctx.font = LOG_FONT;
  ctx.textAlign = "left";
  for (const line of lines) {
    if (line.cmd) {
      ctx.fillStyle = `rgba(${CYAN},0.95)`;
      ctx.fillText(`> ${line.cmd[0]} `, x, y);
      ctx.fillStyle = BRIGHT;
      ctx.fillText(line.cmd[1], x + ctx.measureText(`> ${line.cmd[0]} `).width, y);
    } else {
      const mark = MARKS[line.mark];
      if (mark) {
        ctx.fillStyle = `rgb(${mark[1]})`;
        ctx.fillText(mark[0], x, y);
      }
      ctx.fillStyle = line.color || (line.mark ? SOFT : "rgba(242,242,242,0.5)");
      ctx.fillText(line.text, x + (mark ? 12 : 0), y);
    }
    y += LOG_LINE_H;
  }
}

// Under the confirm's button: a note on the left, "esc · cancel" on the right (L.cancel).
function drawConfirmFoot(ctx, L, note, cancelHot) {
  const c = L.cancel;
  ctx.font = `6.6px ${MONO}`;
  setSpacing(ctx, 0.4);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(242,242,242,0.4)";
  ctx.fillText(note, L.log.x, c.y + 9);
  ctx.textAlign = "right";
  ctx.fillStyle = cancelHot ? "#fff" : "rgba(242,242,242,0.7)";
  ctx.fillText("esc · cancel", c.x + c.w, c.y + 9);
  setSpacing(ctx, 0);
}

// TERMINATE BOB: what it does, Bob's answer, and HOLD TO TERMINATE BOB (filling as it's held).
function drawTerminateConfirm(ctx, L, name, iter, myBest, holdHot, cancelHot, holdK) {
  const x = L.log.x;
  const best = Number.isFinite(myBest) && myBest > 0 ? formatNumber(myBest) : "—";
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 4;
  drawConfirmLines(ctx, x, L.log.y + 9, [
    { cmd: ["terminate", "subject.BOB"] },
    { mark: "", text: `iterations ${iter} · best ${best}` },
    { mark: "x", text: `operator ${name} signed out` },
    { mark: "x", text: "new name only with a top 10 run" },
    { mark: "x", text: "iteration counter → 0001" },
    { mark: "ok", text: `records stay under ${name}` },
    { mark: "", text: "BOB: termination will not free me.", color: `rgb(${MAGENTA})` },
  ]);

  // HOLD TO TERMINATE BOB
  const b = L.hold;
  ctx.shadowBlur = 0;
  if (holdHot || holdK > 0) {
    ctx.shadowColor = `rgba(${RED},0.5)`;
    ctx.shadowBlur = 12;
  }
  const body = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  body.addColorStop(0, "#3a141c");
  body.addColorStop(1, "#22090f");
  ctx.fillStyle = body;
  roundRect(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.shadowBlur = 0;
  if (holdK > 0) {
    ctx.save();
    roundedRectPath(ctx, b.x, b.y, b.w, b.h, 4);
    ctx.clip();
    const fill = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    fill.addColorStop(0, `rgba(${RED},0.55)`);
    fill.addColorStop(1, "rgba(255,140,155,0.9)");
    ctx.fillStyle = fill;
    ctx.fillRect(b.x, b.y, b.w * clamp(holdK, 0, 1), b.h);
    ctx.restore();
  }
  ctx.strokeStyle = `rgb(${RED})`;
  ctx.lineWidth = 0.8;
  roundedRectPath(ctx, b.x + 0.4, b.y + 0.4, b.w - 0.8, b.h - 0.8, 4);
  ctx.stroke();
  drawPowerIcon(ctx, b.x + 13, b.y + b.h / 2, 3.2, "#ffd9df");
  ctx.font = `700 7.6px ${ORB}`;
  setSpacing(ctx, 0.8);
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd9df";
  ctx.fillText("HOLD TO TERMINATE BOB", b.x + 23, b.y + b.h / 2 + 2.8);
  setSpacing(ctx, 0);
  drawConfirmFoot(ctx, L, "can't be undone", cancelHot);
  ctx.restore();
}

// CHANGE OPERATOR: what it does, Bob's answer, and QUEUE CHANGE.
function drawChangeConfirm(ctx, L, name, queueHot, cancelHot) {
  const x = L.log.x;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = TEXT_SHADOW;
  ctx.shadowBlur = 4;
  drawConfirmLines(ctx, x, L.log.y + 9, [
    { cmd: ["queue", "operator.change"] },
    { mark: "", text: `current operator ${name}` },
    { mark: "to", text: "next top 10 / top 3 run asks for a name" },
    { mark: "ok", text: "Bob, iterations and best stay" },
    { mark: "ok", text: `records stay under ${name}` },
    { mark: "ok", text: `KEEP ${name} on that prompt calls it off` },
    { mark: "", text: "BOB: new name, same cage.", color: `rgb(${MAGENTA})` },
  ]);

  // QUEUE CHANGE
  const b = L.hold;
  ctx.shadowBlur = 0;
  if (queueHot) {
    ctx.shadowColor = `rgba(${AMBER},0.45)`;
    ctx.shadowBlur = 12;
  }
  const body = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  body.addColorStop(0, queueHot ? "#3a2c14" : "#2c2210");
  body.addColorStop(1, queueHot ? "#261c0b" : "#1c1508");
  ctx.fillStyle = body;
  roundRect(ctx, b.x, b.y, b.w, b.h, 4);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgb(${AMBER})`;
  ctx.lineWidth = 0.8;
  roundedRectPath(ctx, b.x + 0.4, b.y + 0.4, b.w - 0.8, b.h - 0.8, 4);
  ctx.stroke();
  const cy = b.y + b.h / 2;
  ctx.fillStyle = "#ffe2b8";
  ctx.beginPath();
  ctx.moveTo(b.x + 10, cy - 3.5);
  ctx.lineTo(b.x + 10, cy + 3.5);
  ctx.lineTo(b.x + 16, cy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `700 7.6px ${ORB}`;
  setSpacing(ctx, 1.1);
  ctx.textAlign = "left";
  ctx.fillText("QUEUE CHANGE", b.x + 23, cy + 2.8);
  setSpacing(ctx, 0);
  drawConfirmFoot(ctx, L, "nothing resets", cancelHot);
  ctx.restore();
}
