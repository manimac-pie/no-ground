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

// Paint styles for the neon tiles. Built once per frame (or per sprite), not per tile.
function neonTileStyle(useRed, glow, fade) {
  const alpha = 0.92 * fade;
  return {
    shadowColor: useRed ? `rgba(255,120,120,${0.75 * glow})` : `rgba(120,205,255,${0.65 * glow})`,
    shadowBlur: 10 + 12 * glow,
    fill: useRed ? `rgba(255,90,90,${alpha})` : `rgba(140,220,255,${alpha})`,
    base: `rgba(30,40,52,${0.4 * fade})`,
    core: useRed ? `rgba(255,190,190,${0.7 * alpha})` : `rgba(230,250,255,${0.7 * alpha})`,
  };
}

// ---------------- START smash ----------------
// The word breaks into chunks (SHARD_CELL px squares of its tiles, so each keeps a piece of a
// letter). Chunks burst away from where Bob hit, carried forward with him, spinning as they fall.
// The break spreads outward from the impact like a crack, so far letters go a beat later.
const SHARD_CELL = 6;            // px; chunk size
const SMASH_CRACK_SPEED = 900;   // px/s the break spreads from the impact point
const SMASH_GRAVITY = 900;
const SMASH_FLASH_SEC = 0.07;    // a chunk glows white-hot this long after it breaks

// Group the word's tiles into chunks once per tile cache.
function getShards(cache) {
  if (cache.shards) return cache.shards;
  const cells = new Map();
  for (const t of cache.tiles) {
    const key = `${Math.floor(t.x / SHARD_CELL)},${Math.floor(t.y / SHARD_CELL)}`;
    let shard = cells.get(key);
    if (!shard) {
      shard = { tiles: [], cx: 0, cy: 0, seed: cells.size };
      cells.set(key, shard);
    }
    shard.tiles.push(t);
  }
  const shards = [...cells.values()];
  for (const shard of shards) {
    let sx = 0;
    let sy = 0;
    for (const t of shard.tiles) {
      sx += t.x + t.w / 2;
      sy += t.y + t.h / 2;
    }
    shard.cx = sx / shard.tiles.length;
    shard.cy = sy / shard.tiles.length;
  }
  cache.shards = shards;
  return shards;
}

// Chunks of one line of text. impact is relative to this line's top-left.
function drawSmashShards(ctx, cache, lineX, lineY, impact, tSec, styles) {
  for (const shard of getShards(cache)) {
    const dx = shard.cx - impact.x;
    const dy = shard.cy - impact.y;
    const dist = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, tSec - dist / SMASH_CRACK_SPEED);
    const r1 = hash01(shard.seed * 13.7 + 1);
    const r2 = hash01(shard.seed * 97.3 + 2);
    const r3 = hash01(shard.seed * 41.9 + 3);
    const life = 0.8 + 0.45 * r2;
    const k = t / life;
    if (k >= 1) continue;

    // Burst away from the impact (harder up close), plus Bob's forward carry and a pop upward.
    const push = 240 * (0.5 + r1) * Math.min(1.4, Math.max(0.4, 1.4 - dist / 120));
    const vx = (dx / dist) * push + 130 + 120 * r2;
    const vy = (dy / dist) * push - (110 + 150 * r3);
    const px = lineX + shard.cx + vx * t;
    const py = lineY + shard.cy + vy * t + 0.5 * SMASH_GRAVITY * t * t;
    const rot = (r1 - 0.5) * 14 * t;
    const scale = 1 - 0.45 * k;
    const hot = (t > 0 && t < SMASH_FLASH_SEC) || tSec < SMASH_FLASH_SEC;
    const style = hot ? styles.hot : styles.normal;

    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.translate(px, py);
    if (rot) ctx.rotate(rot);
    if (scale !== 1) ctx.scale(scale, scale);
    // One glowing fill per chunk (its tiles as one path), then the hot core lines.
    ctx.beginPath();
    for (const tile of shard.tiles) ctx.rect(tile.x - shard.cx, tile.y - shard.cy, tile.w, tile.h);
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowBlur;
    ctx.fillStyle = style.fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.fillStyle = style.core;
    for (const tile of shard.tiles) ctx.fillRect(tile.x - shard.cx, tile.y - shard.cy, tile.w, 1);
    ctx.restore();
  }
}

// One neon tile: glowing body, dark base line, hot core line. Leaves shadows off.
function drawNeonTile(ctx, px, py, t, style) {
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = style.shadowBlur;
  ctx.fillStyle = style.fill;
  ctx.fillRect(px, py, t.w, t.h);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  ctx.fillStyle = style.base;
  ctx.fillRect(px, py + t.h - 1, t.w, 1);

  ctx.fillStyle = style.core;
  ctx.fillRect(px, py, t.w, 1);
}

// While the text is at rest, every tile is static and shares one style, so the whole
// word is painted once into a device-resolution sprite and stamped with drawImage.
// The pulsing glow is quantized so the sprite is only rebuilt when the level changes.
const GLOW_MIN = 0.55;
const GLOW_RANGE = 0.45;
const GLOW_LEVELS = 16;
const SPRITE_MARGIN = 40; // device px; covers the widest shadow (blur 22)
const _textSprites = new Map(); // "red" | "blue" -> { key, canvas }

function quantizeGlow(glow) {
  const level = Math.round(((glow - GLOW_MIN) / GLOW_RANGE) * GLOW_LEVELS);
  return GLOW_MIN + (GLOW_RANGE * level) / GLOW_LEVELS;
}

// fracX/fracY: sub-pixel part of the text's device position, baked in so edges
// antialias exactly as when the tiles are drawn directly.
function getTextSprite(cache, useRed, glow, scaleX, scaleY, fracX, fracY) {
  const slot = useRed ? "red" : "blue";
  const key = `${cache.key}|${glow}|${scaleX}|${scaleY}|${fracX}|${fracY}`;
  let entry = _textSprites.get(slot);
  if (entry && entry.key === key) return entry.canvas;

  const width = Math.ceil(cache.width * scaleX) + SPRITE_MARGIN * 2 + 1;
  const height = Math.ceil(cache.height * scaleY) + SPRITE_MARGIN * 2 + 1;
  if (!entry) {
    entry = { key: "", canvas: document.createElement("canvas") };
    _textSprites.set(slot, entry);
  }
  const canvas = entry.canvas;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const sctx = canvas.getContext("2d");
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, width, height);
  sctx.setTransform(scaleX, 0, 0, scaleY, SPRITE_MARGIN + fracX, SPRITE_MARGIN + fracY);

  const style = neonTileStyle(useRed, glow, 1);
  for (const t of cache.tiles) drawNeonTile(sctx, t.x, t.y, t, style);

  entry.key = key;
  return canvas;
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
    { label: "W", caption: "Slowfall" },
    { label: "D", caption: "Dash" },
    { label: "S", caption: "Duck/Dive" },
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
  const glow = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin((uiTime || 0) * 1.2));

  // At rest: stamp the cached sprite. Needs an axis-aligned transform to map
  // the sprite 1:1 onto device pixels, and a steady zoom (the zoom-out changes
  // scale every frame); otherwise fall back to per-tile drawing.
  const m = ctx.getTransform();
  const useSprite =
    !smashActive && !state.menuZooming && m.b === 0 && m.c === 0 && m.a > 0 && m.d > 0;

  if (useSprite) {
    const glowLevel = quantizeGlow(glow);
    caches.forEach((c) => {
      const lineY = baseY + accY;
      const devX = m.a * baseX + m.e;
      const devY = m.d * lineY + m.f;
      const intX = Math.floor(devX);
      const intY = Math.floor(devY);
      const sprite = getTextSprite(c, useRed, glowLevel, m.a, m.d, devX - intX, devY - intY);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sprite, intX - SPRITE_MARGIN, intY - SPRITE_MARGIN);
      ctx.setTransform(m);
      accY += c.height + lineGap;
    });
  } else if (smashActive) {
    // Smashed: chunks burst from where Bob hit (default: middle of the left edge).
    const impact = state.menuSmashImpact || { x: 0, y: totalHeight / 2 };
    const styles = {
      normal: neonTileStyle(useRed, 1, 1),
      hot: { shadowColor: "rgba(255,255,255,0.95)", shadowBlur: 18, fill: "rgba(255,255,255,1)", core: "rgba(255,255,255,1)" },
    };
    caches.forEach((c) => {
      const lineY = baseY + accY;
      drawSmashShards(ctx, c, baseX, lineY, { x: impact.x, y: impact.y - accY }, smashT, styles);
      accY += c.height + lineGap;
    });
  } else {
    // At rest but zooming (scale changes every frame): draw the tiles directly.
    const style = neonTileStyle(useRed, glow, pulse);
    caches.forEach((c) => {
      const lineY = baseY + accY;
      c.tiles.forEach((t) => drawNeonTile(ctx, baseX + t.x, lineY + t.y, t, style));
      accY += c.height + lineGap;
    });
  }

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
    if (hit) {
      // Impact point relative to the text: Bob's front edge, at his middle height.
      const impact = {
        x: Math.min(maxWidth, Math.max(0, px + pw - baseX)),
        y: Math.min(totalHeight, Math.max(0, py + ph / 2 - baseY)),
      };
      onSmashTrigger(hover, impact);
    }
  }

  ctx.restore();
  return hover;
}
