// src/render/ui.js
// HUD + menus + small popups. Pure rendering; no DOM.

import { DASH_COOLDOWN } from "../game/constants.js";

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

export function drawHUD(ctx, state, danger01, COLORS) {
  const player = state.player;

  ctx.save();
  // Subtle glass HUD
  ctx.globalAlpha = 0.86;
  ctx.fillStyle = "rgba(8,10,14,0.58)";
  roundRect(ctx, 12, 12, 250, 64, 12);
  ctx.strokeStyle = "rgba(120,205,255,0.18)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, 12.5, 12.5, 249, 63, 12);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.hudText;
  ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const hudDist = Math.floor(state.distance || 0);
  ctx.fillText(`Distance ${hudDist}`, 22, 36);

  ctx.font = "500 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(`Jumps ${player.jumpsRemaining}`, 22, 58);

  // Float fuel meter (W)
  if (Number.isFinite(player.floatFuel)) {
    const max = Number.isFinite(player.floatFuelMax) ? player.floatFuelMax : 0.38;
    const fuel01 = clamp(max > 0 ? player.floatFuel / max : 0, 0, 1);

    const bx = 200;
    const by = 46;
    const bw = 40;
    const bh = 6;

    ctx.fillStyle = "rgba(242,242,242,0.18)";
    ctx.fillRect(bx, by, bw, bh);

    ctx.fillStyle = "rgba(120,205,255,0.65)";
    ctx.fillRect(bx, by, Math.floor(bw * fuel01), bh);

    ctx.fillStyle = "rgba(242,242,242,0.55)";
    ctx.font = "700 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("W", bx + bw + 6, by + 6);
  }

  // Dash cooldown meter (D)
  if (Number.isFinite(player.dashCooldown)) {
    const cd = clamp(player.dashCooldown, 0, DASH_COOLDOWN);
    const ready01 = clamp(1 - (cd / Math.max(0.001, DASH_COOLDOWN)), 0, 1);

    const bx = 200;
    const by = 30;
    const bw = 40;
    const bh = 6;

    ctx.fillStyle = "rgba(242,242,242,0.18)";
    ctx.fillRect(bx, by, bw, bh);

    ctx.fillStyle = ready01 >= 1 ? "rgba(120,205,255,0.85)" : "rgba(120,205,255,0.45)";
    ctx.fillRect(bx, by, Math.floor(bw * ready01), bh);

    ctx.fillStyle = "rgba(242,242,242,0.55)";
    ctx.font = "700 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("D", bx + bw + 6, by + 6);
  }

  // Style score if present
  if (Number.isFinite(state.styleScore)) {
    const s = Math.floor(state.styleScore || 0);
    const c = Math.floor(state.styleCombo || 0);
    ctx.fillStyle = "rgba(242,242,242,0.65)";
    ctx.fillText(`Style ${s}  Combo x${c}`, 118, 52);
  }

  if (danger01 > 0.55 && state.running && !state.gameOver) {
    ctx.fillStyle = "rgba(255,85,110,0.90)";
    ctx.font = "800 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("GROUND = DEATH", 150, 32);
  }

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
