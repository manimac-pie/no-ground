// src/render/hud/hud.js
// In-run HUD: score, jumps, fuel and dash meters, danger warnings and score pop-ups.

import { DASH_COOLDOWN, PLAYER_X } from "../../game/constants.js";
import { airMultiplier, airPotAtRisk, formatMult } from "../../game/score.js";
import { roundedRectPath } from "../../shared/canvas.js";
import { clamp, easeOutCubic } from "../../shared/math.js";
import { drawCachedPanel } from "./panelCache.js";
import { formatNumber, roundRect } from "./primitives.js";

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

// Rising "+52 AD BREAK" text above Bob (world space). Reads state.scoreEvents only.
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
  const airPot = airPotAtRisk(state);
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
