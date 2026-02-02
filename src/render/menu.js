// src/render/menu.js
// Menu-only rendering (start + game over). Pure drawing; no state mutation.
import { world } from "../game.js";
import { SAFE_CLEARANCE, PLAYER_H } from "../game/constants.js";

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

function hash01(n) {
  const x = Math.sin(n * 999.123) * 43758.5453;
  return x - Math.floor(x);
}

// Cache for voxelized text tiles so we don't rebuild every frame.
let _tileCache = null;
function getTextTiles(text, font, tileSize, letterSpacing = 0) {
  const key = `${text}|${font}|${tileSize}|${letterSpacing}`;
  if (_tileCache && _tileCache.key === key) return _tileCache;

  // Draw text to an offscreen canvas.
  const off = document.createElement("canvas");
  const offCtx = off.getContext("2d");
  offCtx.font = font;
  // Manually layout characters to control spacing (avoids kerning collisions).
  let totalWidth = 0;
  const glyphs = [];
  for (const ch of text) {
    const m = offCtx.measureText(ch);
    const w = Math.ceil(m.width);
    glyphs.push({ ch, w });
    totalWidth += w + letterSpacing;
  }
  if (glyphs.length > 0) totalWidth -= letterSpacing; // remove trailing spacing

  const padding = tileSize * 2;
  const ascent = offCtx.measureText("M").actualBoundingBoxAscent || tileSize * 6;
  const descent = offCtx.measureText("g").actualBoundingBoxDescent || tileSize * 2;
  const width = Math.ceil(totalWidth + padding * 2);
  const height = Math.ceil(ascent + descent + padding * 2);
  off.width = width;
  off.height = height;
  offCtx.font = font;
  offCtx.fillStyle = "#fff";
  offCtx.textBaseline = "top";
  let penX = padding;
  for (const g of glyphs) {
    offCtx.fillText(g.ch, penX, padding);
    penX += g.w + letterSpacing;
  }

  const data = offCtx.getImageData(0, 0, width, height).data;
  const tiles = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      // Sample center of the tile
      const sx = Math.min(width - 1, x + Math.floor(tileSize / 2));
      const sy = Math.min(height - 1, y + Math.floor(tileSize / 2));
      const idx = (sy * width + sx) * 4 + 3; // alpha channel
      if (data[idx] > 32) {
        tiles.push({ x, y, w: tileSize, h: tileSize });
      }
    }
  }

  _tileCache = { key, tiles, width, height };
  return _tileCache;
}

function drawKeyChip(ctx, label, caption, x, y, COLORS, opts = {}) {
  const active = opts.active === true;
  const padX = 14;

  ctx.save();
  ctx.font = "800 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const lw = ctx.measureText(label).width;
  const w = Math.max(64, lw + padX * 2);
  const h = 40;
  const r = 12;

  // Outer glow + frame
  const glow = active ? "rgba(120,205,255,0.55)" : "rgba(120,205,255,0.22)";
  ctx.shadowColor = glow;
  ctx.shadowBlur = active ? 16 : 10;
  ctx.fillStyle = "rgba(8,10,16,0.85)";
  roundRect(ctx, x, y, w, h, r);
  ctx.shadowBlur = 0;

  // Body gradient
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "rgba(24,28,40,0.95)");
  body.addColorStop(1, "rgba(10,12,20,0.92)");
  ctx.fillStyle = body;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);

  // Stroke
  ctx.strokeStyle = active ? "rgba(120,205,255,0.9)" : "rgba(120,205,255,0.35)";
  ctx.lineWidth = active ? 2 : 1.25;
  roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();

  // Inner line
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 2.5, y + 2.5, w - 5, h - 5, r - 2);
  ctx.stroke();

  // Top scanline
  const scan = ctx.createLinearGradient(x, y, x + w, y);
  scan.addColorStop(0, "rgba(120,205,255,0)");
  scan.addColorStop(0.35, "rgba(120,205,255,0.12)");
  scan.addColorStop(0.65, "rgba(120,205,255,0.12)");
  scan.addColorStop(1, "rgba(120,205,255,0)");
  ctx.fillStyle = scan;
  ctx.fillRect(x + 6, y + 6, w - 12, 2);

  // Left notch
  ctx.fillStyle = active ? "rgba(120,205,255,0.35)" : "rgba(120,205,255,0.18)";
  ctx.fillRect(x + 6, y + 8, 3, h - 16);

  // Label
  ctx.fillStyle = "rgba(240,255,255,0.98)";
  ctx.font = "800 15px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  centerText(ctx, label, x + w / 2, y + 23);

  if (caption) {
    ctx.font = "600 11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(170,210,230,0.9)";
    centerText(ctx, caption, x + w / 2, y + 37);
  }

  ctx.restore();
  return w + 10; // width plus gap suggestion
}

function drawControlsRow(ctx, cx, y, COLORS, activeKey = null) {
  const controls = [
    { label: "SPACE", caption: "Jump / Double Jump" },
    { label: "W", caption: "Float" },
    { label: "D", caption: "Dash" },
    { label: "S", caption: "Dive" },
    { label: "A", caption: "Backflip" },
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

export function drawStartPrompt(ctx, state, uiTime, COLORS, W, H, opts = {}) {
  const onSmashTrigger = typeof opts.onSmashTrigger === "function" ? opts.onSmashTrigger : null;
  const onBounds = typeof opts.onBounds === "function" ? opts.onBounds : null;
  // Use logical internal size.
  const w = Number.isFinite(W) ? W : 800;
  const h = Number.isFinite(H) ? H : 450;

  const smashActive = state.menuSmashActive === true;
  const smashBroken = state.menuSmashBroken === true;
  const smashT = smashActive ? Math.max(0, state.menuSmashT || 0) : 0;
  const showStartText = !state.gameOver && (!smashBroken || smashActive);
  if (!showStartText) return false;

  ctx.save();

  const pulse = 1;

  // Text as physical tiles near Bob; crumbles when smashed.
  const lines = ["START"];
  const margin = 12;

  const tileSize = 2; // finer tiles for cleaner letter shapes
  let headingSize = 32; // slightly larger but crisper with smaller tiles
  let font = `800 ${headingSize}px "Inter Tight", "Inter", "Segoe UI", "Helvetica Neue", system-ui, sans-serif`;

  const letterSpacing = 2; // more spacing to prevent merged glyphs
  const caches = lines.map((text) => getTextTiles(text, font, tileSize, letterSpacing));

  // Position near Bob on the starter roof; X still scrolls with world via state.
  const player = state.player || {};
  const defaultX = (Number.isFinite(player.x) ? player.x : w * 0.22) + (Number.isFinite(player.w) ? player.w : 34) + 6;
  const roofY = world.GROUND_Y - SAFE_CLEARANCE; // top of starter platform

  const lineGap = Math.floor(headingSize * 0.10);
  const totalHeight =
    caches.reduce((sum, c) => sum + c.height, 0) + lineGap * Math.max(0, caches.length - 1);

  const baseX = Number.isFinite(state.startPromptX) ? state.startPromptX : defaultX;
  // Sit on the roof: place text so its bottom touches the roof, with a small lift.
  const baseY = roofY - totalHeight - 2;

  // Impact sim: deterministic velocities per tile, no per-frame allocations.
  const gravity = 720;
  const smashDuration = 1.4;

  // Compute overall bounds and draw line by line.
  let accY = 0;
  const maxWidth = Math.max(...caches.map((c) => c.width));
  if (onBounds) onBounds({ x: baseX, y: baseY, w: maxWidth, h: totalHeight });
  const pointer = opts.pointer || null;
  const hover =
    pointer &&
    pointer.x >= baseX &&
    pointer.x <= baseX + maxWidth &&
    pointer.y >= baseY &&
    pointer.y <= baseY + totalHeight;
  const useRed = hover || (smashActive && state.menuSmashRed === true);
  caches.forEach((c, idx) => {
    const lineY = baseY + accY;
    c.tiles.forEach((t, i) => {
      const globalIndex = idx * 10000 + i; // stable-ish hash index
      const h1 = hash01(globalIndex * 13.7);
      const h2 = hash01(globalIndex * 97.3);

      let px = baseX + (maxWidth - c.width) * 0.0 + t.x; // left aligned
      let py = lineY + t.y;
      let fade = 1;

      if (smashActive) {
        const tSec = Math.min(smashDuration, smashT);
        const vx = 80 + 220 * h1;
        const vy = -(90 + 160 * h2);
        px += vx * tSec;
        py += vy * tSec + 0.5 * gravity * tSec * tSec;
        fade = Math.max(0, 1 - tSec / smashDuration);
      }

      const alpha = 0.92 * fade * pulse;
      const glow = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((uiTime || 0) * 1.2));

      ctx.save();
      ctx.shadowColor = useRed
        ? `rgba(255,120,120,${0.75 * glow})`
        : `rgba(120,205,255,${0.65 * glow})`;
      ctx.shadowBlur = 10 + 12 * glow;
      ctx.fillStyle = useRed
        ? `rgba(255,90,90,${alpha})`
        : `rgba(140,220,255,${alpha})`;
      ctx.fillRect(px, py, t.w, t.h);
      ctx.restore();

      ctx.fillStyle = `rgba(30,40,52,${0.4 * fade})`;
      ctx.fillRect(px, py + t.h - 1, t.w, 1);

      // Hot core line to sell neon tubing.
      ctx.fillStyle = useRed
        ? `rgba(255,190,190,${0.7 * alpha})`
        : `rgba(230,250,255,${0.7 * alpha})`;
      ctx.fillRect(px, py, t.w, 1);
    });
    accY += c.height + lineGap;
  });

  // Trigger smash when Bob overlaps the combined text box.
  if (onSmashTrigger && !smashActive) {
    const player = state.player || {};
    const px = Number.isFinite(player.x) ? player.x : 0;
    const py = Number.isFinite(player.y) ? player.y : 0;
    const pw = Number.isFinite(player.w) ? player.w : 0;
    const ph = Number.isFinite(player.h) ? player.h : 0;
    const hit =
      px < baseX + maxWidth &&
      px + pw > baseX &&
      py < baseY + totalHeight &&
      py + ph > baseY;
    if (hit) onSmashTrigger(hover);
  }

  ctx.restore();
  return hover;
}
