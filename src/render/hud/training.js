// src/render/hud/training.js
// TRAINING on screen (game/tutorial.js): the start screen's TRAINING button, the lesson prompt
// under the HUD, CLEAR between lessons, TRAINING COMPLETE at the end, and the glitch on a retry.

import { CLEAR_FLASH_SEC, LESSONS } from "../../game/tutorial.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { clamp, easeOutCubic } from "../../shared/math.js";
import { isTrainingDone } from "../../ui/training.js";
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
const AD_BEHIND_ALPHA = 0.12; // the prompt fades to this while an ad passes under it...
const AD_FADE_RATE = 10;      // ...easing at this rate (per second)
let _adBehindK = 0;
let _adBehindT = -1;

// Start screen, top left. Pulses until TRAINING has been finished on this device.
export function drawTrainingButton(ctx, rect, hot, uiTime) {
  drawMenuButton(ctx, "trainingButton", rect, "TRAINING", false, hot);
  if (isTrainingDone()) return;
  const k = 0.5 + 0.5 * Math.sin((uiTime || 0) * 3);
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.6 * k;
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(0,255,225,0.9)";
  ctx.shadowBlur = 8 + 10 * k;
  ctx.strokeStyle = "rgba(0,255,225,0.9)";
  roundedRectPath(ctx, rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2, 12);
  ctx.stroke();
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

  const lesson = LESSONS[tut.lesson];
  const chip = touchUi ? lesson.tap : lesson.key;
  const action = touchUi ? lesson.tapAction : lesson.action;
  const done = tut.moveDone === true;
  const again = tut.retries > 0;

  ctx.save();
  ctx.font = `700 14px ${MONO}`;
  const chipW = Math.ceil(ctx.measureText(chip).width) + 18;
  ctx.font = `800 13px ${ORBITRON}`;
  const actionW = Math.ceil(ctx.measureText(action).width) + (done ? 22 : 0);
  ctx.restore();
  const w = Math.max(PROMPT_MIN_W, 20 + chipW + 12 + actionW + 20);
  const rect = { x: Math.round((W - w) / 2), y: PROMPT_Y, w, h: PROMPT_H };

  // Fade while an ad passes under the prompt, so the ad stays in view (on the game clock).
  const now = state.uiTime || 0;
  const dt = _adBehindT < 0 ? 0 : clamp(now - _adBehindT, 0, 0.1);
  _adBehindT = now;
  const target = adBehind(state, rect, camShift) ? 1 : 0;
  _adBehindK += (target - _adBehindK) * (1 - Math.exp(-AD_FADE_RATE * dt));

  ctx.save();
  ctx.globalAlpha = clamp(tut.promptT / PROMPT_FADE_SEC, 0, 1) * clamp(introK, 0, 1)
    * (1 - (1 - AD_BEHIND_ALPHA) * _adBehindK);
  if (ctx.globalAlpha > 0.999) ctx.globalAlpha = 1; // exactly 1 lets the cached panel be used
  if (ctx.globalAlpha > 0) {
    const key = `${tut.lesson}|${chip}|${action}|${done}|${again}|${rect.x}|${w}`;
    drawCachedPanel(ctx, "trainingPrompt", key, rect, (pctx) =>
      drawPromptDirect(pctx, rect, tut.lesson, chip, chipW, action, lesson.why, done, again)
    );
  }
  ctx.restore();
}

function drawPromptDirect(ctx, rect, lessonIndex, chip, chipW, action, why, done, again) {
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

  // Header: lesson count, and AGAIN after a retry.
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 10px ${ORBITRON}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(150,245,255,0.7)";
  ctx.fillText(`LESSON ${lessonIndex + 1}/${LESSONS.length}`, x + 20, y + 17);
  if (again) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,200,110,0.95)";
    ctx.fillText("AGAIN", x + w - 20, y + 17);
    ctx.textAlign = "left";
  }

  // Key (or button) chip, then what to do with it.
  const chipX = x + 20;
  const chipY = y + 24;
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

  const textX = chipX + chipW + 12;
  ctx.textAlign = "left";
  ctx.font = `800 13px ${ORBITRON}`;
  ctx.shadowColor = done ? `rgba(${DONE_RGB},0.7)` : "rgba(80,255,220,0.5)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = done ? `rgba(${DONE_RGB},0.98)` : "rgba(235,255,255,0.98)";
  ctx.fillText(action, textX, chipY + 16);
  if (done) ctx.fillText("✓", textX + ctx.measureText(action).width + 8, chipY + 16);
  ctx.shadowBlur = 0;

  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = "rgba(170,210,230,0.85)";
  ctx.fillText(why, textX, y + 59);
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
