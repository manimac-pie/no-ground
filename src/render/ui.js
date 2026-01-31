// src/render/ui.js
// HUD + menus + small popups. Pure rendering; no DOM.

import {
  DASH_COOLDOWN,
  RESTART_FLYBY_SEC,
  RESTART_FLYBY_HOLD_SEC,
  RESTART_FLYBY_FADE_SEC,
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

  // Chip body
  ctx.fillStyle = active ? "rgba(120,205,255,0.24)" : "rgba(255,255,255,0.12)";
  roundRect(ctx, x, y, w, h, 12);

  // Stroke
  ctx.strokeStyle = active ? "rgba(120,205,255,0.8)" : "rgba(255,255,255,0.28)";
  ctx.lineWidth = active ? 2 : 1;
  roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12);
  ctx.stroke();

  // Label
  ctx.fillStyle = COLORS.hudText;
  ctx.font = "800 15px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  centerText(ctx, label, x + w / 2, y + 23);

  if (caption) {
    ctx.font = "600 11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.78)";
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

function drawControlsRow(ctx, cx, y, COLORS, activeKey = null) {
  const controls = [
    { label: "SPACE", caption: "Jump / Start" },
    { label: "W", caption: "Float" },
    { label: "D", caption: "Dash" },
    { label: "S", caption: "Dive" },
    { label: "A", caption: "Flip" },
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
  const hudScore = Math.floor(baseScore);
  const scoreText = String(hudScore).padStart(6, "0");

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const cx = w * 0.5;
  const cy = h * 0.5;

  ctx.fillStyle = "rgba(140,245,255,0.6)";
  ctx.font = "700 14px Orbitron, Share Tech Mono, Menlo, monospace";
  ctx.fillText("SCORE", cx, cy - 26);

  ctx.shadowColor = "rgba(0,255,208,0.6)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "rgba(240,255,255,0.98)";
  ctx.font = "800 56px Share Tech Mono, Orbitron, Menlo, monospace";
  ctx.fillText(scoreText, cx, cy + 18);

  ctx.restore();
}

export function drawLandingPopup(ctx, state, COLORS) {
  if (!state.lastLandQuality || !(state.lastLandQualityT > 0)) return;

  const t = state.lastLandQualityT; // seconds left
  const a = clamp(t / 0.55, 0, 1);

  let label = "CLEAN";
  let color = "rgba(120,205,255,0.92)";
  if (state.lastLandQuality === "perfect") {
    label = "PERFECT";
    color = "rgba(255,230,160,0.92)";
  }

  ctx.save();
  ctx.globalAlpha = 0.25 + 0.75 * a;
  ctx.fillStyle = "rgba(0,0,0,0.40)";
  roundRect(ctx, 320, 70, 160, 44, 14);

  ctx.fillStyle = color;
  ctx.font = "900 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  centerText(ctx, label, 400, 98);

  ctx.restore();
}

// drawMenus moved to src/render/menu.js
