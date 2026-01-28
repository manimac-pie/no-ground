// src/render/ui.js
// HUD + menus + small popups. Pure rendering; no DOM.

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

function drawMenuPanel(ctx, x, y, w, h, COLORS) {
  // Dark underlay prevents world elements (gates/buildings) from reading through.
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
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(10, 10, 240, 54);

  ctx.fillStyle = COLORS.hudText;
  ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const hudDist = Math.floor(state.distance || 0);
  ctx.fillText(`Distance ${hudDist}`, 20, 32);

  ctx.font = "500 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(`Jumps ${player.jumpsRemaining}`, 20, 52);

  // Float fuel meter (W)
  if (Number.isFinite(player.floatFuel)) {
    const max = Number.isFinite(player.floatFuelMax) ? player.floatFuelMax : 0.38;
    const fuel01 = clamp(max > 0 ? player.floatFuel / max : 0, 0, 1);

    const bx = 200;
    const by = 42;
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

export function drawMenus(ctx, state, uiTime, COLORS, W, H) {
  // Use logical internal size.
  const w = Number.isFinite(W) ? W : 800;
  const h = Number.isFinite(H) ? H : 450;

  // Start menu
  if (!state.running && !state.gameOver) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, w, h);

    const cardW = 420;
    const cardH = 232;
    const cardX = (w - cardW) / 2;
    const cardY = (h - cardH) / 2 - 10;

    drawMenuPanel(ctx, cardX, cardY, cardW, cardH, COLORS);

    const cx0 = w / 2;

    ctx.fillStyle = COLORS.hudText;
    ctx.font = "900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    centerText(ctx, "NO GROUND", cx0, cardY + 70);

    ctx.font = "500 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.78)";
    centerText(ctx, "Keep Bob off the ground.", cx0, cardY + 100);

    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin((uiTime || 0) * 3.2));

    const ctaText = "Tap / Space to start";
    ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const tw = ctx.measureText(ctaText).width;

    const chipW = tw + 46;
    const chipH = 44;
    const chipX = cx0 - chipW / 2;
    const chipY = cardY + 132;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "rgba(120,205,255,0.14)";
    roundRect(ctx, chipX, chipY, chipW, chipH, 14);

    ctx.strokeStyle = "rgba(120,205,255,0.35)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, chipX + 0.5, chipY + 0.5, chipW - 1, chipH - 1, 14);
    ctx.stroke();

    ctx.fillStyle = COLORS.hudText;
    centerText(ctx, ctaText, cx0, chipY + 28);
    ctx.restore();

    ctx.font = "500 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.55)";
    centerText(ctx, "Space jump • A/D corkscrew • X/Shift spin", cx0, cardY + 194);

    ctx.font = "500 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.46)";
    centerText(ctx, "W float • S dive • Air gates: match the label", cx0, cardY + 212);

    ctx.restore();
    return;
  }

  // Game over menu
  if (state.gameOver) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.68)";
    ctx.fillRect(0, 0, w, h);

    const cardW = 420;
    const cardH = 230;
    const cardX = (w - cardW) / 2;
    const cardY = (h - cardH) / 2 - 10;

    drawMenuPanel(ctx, cardX, cardY, cardW, cardH, COLORS);

    const cx0 = w / 2;
    const dist = Math.floor(state.distance || 0);

    ctx.fillStyle = COLORS.hudText;
    ctx.font = "900 32px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    centerText(ctx, "Bob touched the ground :[", cx0, cardY + 70);

    ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.80)";
    centerText(ctx, `Distance ${dist}`, cx0, cardY + 110);

    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin((uiTime || 0) * 3.2));
    const ctaText = "Tap / Space to retry";

    ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const tw = ctx.measureText(ctaText).width;

    const chipW = tw + 46;
    const chipH = 44;
    const chipX = cx0 - chipW / 2;
    const chipY = cardY + 142;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "rgba(120,205,255,0.14)";
    roundRect(ctx, chipX, chipY, chipW, chipH, 14);

    ctx.strokeStyle = "rgba(120,205,255,0.35)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, chipX + 0.5, chipY + 0.5, chipW - 1, chipH - 1, 14);
    ctx.stroke();

    ctx.fillStyle = COLORS.hudText;
    centerText(ctx, ctaText, cx0, chipY + 28);
    ctx.restore();

    ctx.restore();
  }
}
