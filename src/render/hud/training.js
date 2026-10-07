// src/render/hud/training.js
// TRAINING on screen (game/tutorial.js): the lesson prompt under the HUD, EXIT and SKIP, CLEAR between
// lessons, TRAINING COMPLETE at the end, and the glitch on a retry. (The start screen's TRAINING
// button and lesson list are in hud/shell.js.)

import { CLEAR_FLASH_SEC, LESSONS, TAUGHT_LESSONS, currentStep, trainingButtonsLive } from "../../game/tutorial.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { clamp, easeOutCubic } from "../../shared/math.js";
import { getTrainingExitRect, getTrainingSkipRect, pointInRect } from "../../ui/layout.js";
import { drawMenuButton } from "./controls.js";
import { drawCachedPanel } from "./panelCache.js";
import { drawGlow, easeOutBack, roundRect } from "./primitives.js";
import { drawResetGlitch } from "./reset.js";

const PROMPT_Y = 96; // just under the HUD
const PROMPT_H = 66;
const PROMPT_MIN_W = 280;
const PROMPT_FADE_SEC = 0.25;
const RETRY_GLITCH_SEC = 0.3;
const MONO = "Share Tech Mono, Orbitron, Menlo, monospace";
const ORBITRON = "Orbitron, Share Tech Mono, Menlo, monospace";
const DONE_RGB = "90,255,170";
const HEADER_FONT = `700 10px ${ORBITRON}`;
const AGAIN_TEXT = " · AGAIN";
const PIP_W = 8;
const PIP_GAP = 3;
const PIPS_W = LESSONS.length * (PIP_W + PIP_GAP) - PIP_GAP + 4; // the final test's pip is 4 wider
const WAIT_DIM_ALPHA = 0.3; // the world dims while TRAINING is stopped for a move
const AD_BEHIND_ALPHA = 0.12; // the prompt fades to this while an ad passes under it...
const AD_FADE_RATE = 10;      // ...easing at this rate (per second)
let _adBehindK = 0;
let _adBehindT = -1;

// EXIT and SKIP, top left, sliding in with the HUD. Hidden once TRAINING is ending.
export function drawTrainingButtons(ctx, state, introK = 1) {
  if (!trainingButtonsLive(state)) return;
  const exitRect = getTrainingExitRect();
  const skipRect = getTrainingSkipRect();
  const pointer = state.pointerInViewport === true;
  ctx.save();
  ctx.globalAlpha = clamp(introK, 0, 1);
  if (ctx.globalAlpha > 0.999) ctx.globalAlpha = 1; // exactly 1 lets the cached panels be used
  if (ctx.globalAlpha > 0) {
    drawMenuButton(ctx, "trainingExit", exitRect, "EXIT", false,
      pointer && pointInRect(state.pointerUiX, state.pointerUiY, exitRect));
    drawMenuButton(ctx, "trainingSkip", skipRect, "SKIP", false,
      pointer && pointInRect(state.pointerUiX, state.pointerUiY, skipRect));
  }
  ctx.restore();
}

// An ad (in world px; the world is drawn shifted left by camShift) reaching up behind rect.
function adBehind(state, rect, camShift) {
  for (const plat of state.platforms) {
    const b = plat.billboard;
    if (!b || b.broken) continue;
    const x = plat.x + b.offsetX - camShift;
    if (x < rect.x + rect.w && x + b.w > rect.x && plat.y - b.offsetY < rect.y + rect.h) return true;
  }
  return false;
}

// The lesson prompt, CLEAR, or TRAINING COMPLETE. introK: the HUD's slide-in (0..1), so the
// first prompt arrives with the HUD after the zoom-out. camShift: the world's camera shift.
export function drawTrainingPrompt(ctx, state, W, H, touchUi, introK = 1, camShift = 0) {
  const tut = state.tutorial;
  if (!tut) return;
  if (tut.finished) {
    drawTrainingComplete(ctx, tut.finishT, W, H);
    return;
  }
  if (tut.promptT < 0) {
    drawClear(ctx, tut.promptT + CLEAR_FLASH_SEC, W);
    return;
  }

  // The final test names no key: just what to do.
  const lesson = LESSONS[tut.lesson];
  const step = currentStep(tut);
  const chip = step ? (touchUi ? step.tap : step.key) : "";
  const action = step ? (touchUi ? step.tapAction : step.action) : "GET TO THE LAST ROOF";
  const done = tut.moveDone === true && !lesson.test;
  const again = tut.retries > 0;
  const header = lesson.test ? "FINAL TEST" : `LESSON ${tut.lesson + 1}/${TAUGHT_LESSONS} · ${lesson.name}`;

  ctx.save();
  ctx.font = `700 14px ${MONO}`;
  const chipW = chip ? Math.ceil(ctx.measureText(chip).width) + 18 : -12; // -12: no chip, no gap
  ctx.font = `800 13px ${ORBITRON}`;
  const actionW = Math.ceil(ctx.measureText(action).width) + (done ? 22 : 0);
  ctx.font = HEADER_FONT;
  const headerW = Math.ceil(ctx.measureText(again ? `${header}${AGAIN_TEXT}` : header).width);
  ctx.restore();
  const w = Math.max(PROMPT_MIN_W, 20 + chipW + 12 + actionW + 20, 20 + headerW + 16 + PIPS_W + 20);
  const rect = { x: Math.round((W - w) / 2), y: PROMPT_Y, w, h: PROMPT_H };

  // Fade while an ad passes under the prompt, so the ad stays in view (on the game clock).
  const now = state.uiTime || 0;
  const dt = _adBehindT < 0 ? 0 : clamp(now - _adBehindT, 0, 0.1);
  _adBehindT = now;
  // Stopped for a move, the prompt is what matters: full strength.
  const target = adBehind(state, rect, camShift) ? 1 : 0;
  _adBehindK += (target - _adBehindK) * (1 - Math.exp(-AD_FADE_RATE * dt));
  if (tut.waiting) _adBehindK = 0;

  ctx.save();
  ctx.globalAlpha = clamp(tut.promptT / PROMPT_FADE_SEC, 0, 1) * clamp(introK, 0, 1)
    * (1 - (1 - AD_BEHIND_ALPHA) * _adBehindK);
  if (ctx.globalAlpha > 0.999) ctx.globalAlpha = 1; // exactly 1 lets the cached panel be used
  if (ctx.globalAlpha > 0) {
    const key = `${header}|${chip}|${action}|${done}|${again}|${rect.x}|${w}|${tut.lesson}`;
    drawCachedPanel(ctx, "trainingPrompt", key, rect, (pctx) =>
      drawPromptDirect(pctx, rect, header, chip, chipW, action, lesson.why, done, again, tut.lesson)
    );
  }
  ctx.restore();

  // Stopped for this move: the key chip pulses until it's given.
  if (tut.waiting && chip) {
    const k = 0.5 + 0.5 * Math.sin(tut.waitT * 6);
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.6 * k;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0,255,225,0.95)";
    ctx.shadowBlur = 6 + 12 * k;
    ctx.strokeStyle = "rgba(0,255,225,0.95)";
    roundedRectPath(ctx, rect.x + 17, rect.y + 21, chipW + 6, 28, 8);
    ctx.stroke();
    ctx.restore();
  }
}

// While TRAINING is stopped for a move, dim the world (drawn under the HUD and the prompt).
export function drawTrainingWaitDim(ctx, state, W, H) {
  const tut = state.tutorial;
  if (!tut || !tut.waiting) return;
  ctx.save();
  ctx.fillStyle = `rgba(4,6,10,${WAIT_DIM_ALPHA * clamp(tut.waitT / 0.15, 0, 1)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Progress pips, top right: lessons done, this one, the rest, and the final test (amber).
function drawPips(ctx, right, cy, lessonIdx) {
  for (let i = 0; i < LESSONS.length; i++) {
    const test = LESSONS[i].test === true;
    const pw = test ? PIP_W + 4 : PIP_W;
    const x = right - PIPS_W + i * (PIP_W + PIP_GAP);
    ctx.save();
    if (i < lessonIdx) ctx.fillStyle = `rgba(${DONE_RGB},0.9)`;
    else if (i === lessonIdx) {
      ctx.fillStyle = "rgba(120,205,255,1)";
      ctx.shadowColor = "rgba(120,205,255,0.9)";
      ctx.shadowBlur = 5;
    } else ctx.fillStyle = test ? "rgba(255,180,70,0.4)" : "rgba(242,242,242,0.15)";
    roundRect(ctx, x, cy - 1.5, pw, 3, 1.5);
    ctx.restore();
  }
}

function drawPromptDirect(ctx, rect, header, chip, chipW, action, why, done, again, lessonIdx) {
  const { x, y, w, h } = rect;
  const edge = done ? `rgba(${DONE_RGB},0.8)` : "rgba(120,205,255,0.6)";
  ctx.save();
  drawGlow(ctx, x + 8, y + 8, w - 16, h - 16, done ? `rgba(${DONE_RGB},0.18)` : "rgba(120,205,255,0.16)", 20);

  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "rgba(16,20,30,0.94)");
  body.addColorStop(1, "rgba(8,10,16,0.94)");
  ctx.fillStyle = body;
  roundRect(ctx, x, y, w, h, 12);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = edge;
  roundedRectPath(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 12);
  ctx.stroke();

  // Header: lesson count and name (or FINAL TEST), AGAIN after a retry, and the progress pips.
  ctx.textBaseline = "alphabetic";
  ctx.font = HEADER_FONT;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(150,245,255,0.7)";
  ctx.fillText(header, x + 20, y + 17);
  if (again) {
    ctx.fillStyle = "rgba(255,200,110,0.95)";
    ctx.fillText(AGAIN_TEXT, x + 20 + ctx.measureText(header).width, y + 17);
  }
  drawPips(ctx, x + w - 20, y + 13.5, lessonIdx);

  // Key (or button) chip, then what to do with it.
  const chipX = x + 20;
  const chipY = y + 24;
  if (chip) {
    ctx.fillStyle = done ? `rgba(${DONE_RGB},0.16)` : "rgba(120,205,255,0.1)";
    roundRect(ctx, chipX, chipY, chipW, 22, 6);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = done ? `rgba(${DONE_RGB},0.9)` : "rgba(120,205,255,0.75)";
    roundedRectPath(ctx, chipX + 0.5, chipY + 0.5, chipW - 1, 21, 6);
    ctx.stroke();
    ctx.font = `700 14px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(240,255,255,0.98)";
    ctx.fillText(chip, chipX + chipW / 2, chipY + 16);
  }

  const textX = chipX + chipW + 12;
  ctx.textAlign = "left";
  ctx.font = `800 13px ${ORBITRON}`;
  ctx.shadowColor = done ? `rgba(${DONE_RGB},0.7)` : "rgba(80,255,220,0.5)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = done ? `rgba(${DONE_RGB},0.98)` : "rgba(235,255,255,0.98)";
  ctx.fillText(action, textX, chipY + 16);
  if (done) ctx.fillText("✓", textX + ctx.measureText(action).width + 8, chipY + 16);
  ctx.shadowBlur = 0;

  // Why, as a line from the system.
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = "rgba(242,242,242,0.32)";
  ctx.fillText("[sys]", textX, y + 59);
  ctx.fillStyle = "rgba(170,210,230,0.85)";
  ctx.fillText(why, textX + ctx.measureText("[sys] ").width, y + 59);
  ctx.restore();
}

// Between lessons: CLEAR pops in where the prompt sits, then fades. t: seconds into the flash.
function drawClear(ctx, t, W) {
  const pop = easeOutBack(clamp(t / 0.2, 0, 1), 1.6);
  const fadeK = clamp((t - (CLEAR_FLASH_SEC - 0.25)) / 0.25, 0, 1);
  ctx.save();
  ctx.globalAlpha = 1 - easeOutCubic(fadeK);
  ctx.translate(W / 2, PROMPT_Y + PROMPT_H / 2);
  ctx.scale(0.5 + 0.5 * pop, 0.5 + 0.5 * pop);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 24px ${ORBITRON}`;
  ctx.shadowColor = `rgba(${DONE_RGB},0.85)`;
  ctx.shadowBlur = 16;
  ctx.fillStyle = `rgba(${DONE_RGB},1)`;
  ctx.fillText("✓ CLEAR", 0, 0);
  ctx.restore();
}

function drawTrainingComplete(ctx, t, W, H) {
  const pop = easeOutBack(clamp(t / 0.3, 0, 1), 1.4);
  ctx.save();
  ctx.globalAlpha = clamp(t / 0.15, 0, 1);
  ctx.translate(W / 2, H * 0.3);
  ctx.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 30px ${ORBITRON}`;
  ctx.shadowColor = `rgba(${DONE_RGB},0.85)`;
  ctx.shadowBlur = 18;
  ctx.fillStyle = `rgba(${DONE_RGB},1)`;
  ctx.fillText("TRAINING COMPLETE", 0, 0);
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(120,205,255,0.7)";
  ctx.font = `700 12px ${ORBITRON}`;
  ctx.fillStyle = "rgba(200,235,255,0.95)";
  ctx.fillText("RETURNING TO THE START", 0, 30);
  ctx.restore();
}

// A retry glitches the screen for a moment as the course rebuilds. Drawn last, over everything.
export function drawTrainingRetryGlitch(ctx, state) {
  const t = state.tutorial ? state.tutorial.retryT : Infinity;
  if (!(t < RETRY_GLITCH_SEC)) return;
  drawResetGlitch(ctx, 1 - t / RETRY_GLITCH_SEC);
}
