// src/render/worldFacades.js
// Building facades: Neon Glass. Curtain-wall towers with sky reflections, lit offices and neon
// sign strips.
//   Breakable:   warm/magenta glass, a few dark or broken panes.
//   Unbreakable: cool cyan glass with steel X-bracing showing through (and the starter roof).
//
// Cost: a facade is painted once into image tiles TILE_W world px wide and stamped every frame.
// Tiles keep very wide buildings (the starter roof) from needing one huge image at the start-screen
// zoom, and only the tiles on screen are painted. A tile is painted taller than any building can be
// (PAINT_H) and clipped to the building, so roofs that rise or sink don't need repainting. Only the
// neon blink and the roof's crown LED change per frame.

import { GROUND_Y, PLATFORM_H } from "../game/constants.js";
import { createScaleWatch, needsRepaint, paintSprite, stampSprite, updateScaleWatch, viewScale } from "./glass.js";
import { hash01 } from "../shared/math.js";

const SAFE_RGB = "120,205,255";
const TILE_W = 192;
const ROOF_Y_MIN = 160; // highest a roof can sit (game/platforms.js clamps moving roofs to it)
const PAINT_H = GROUND_Y - (ROOF_Y_MIN + PLATFORM_H);
const FLOOR_H = 14;
const COL_W = 16;
const TILE_CACHE_MAX = 40;
const PAINTS_PER_FRAME = 3; // tiles painted per frame at most; the rest wait a frame, drawn scaled

function rand01(seed, k) {
  return hash01(seed * 17.31 + k * 3.733);
}

// Neon strip down one edge of some buildings (the same numbers at paint time and per frame).
function neonFor(seed, w, safe) {
  if (w <= 140 || rand01(seed, 2) <= 0.4) return null;
  const left = rand01(seed, 3) > 0.5;
  return {
    x: left ? 6 : w - 14,
    y: 8,
    h: 90,
    rgb: safe ? SAFE_RGB : (rand01(seed, 4) > 0.5 ? "255,90,170" : "255,170,90"),
    blinks: rand01(seed, 5) <= 0.3, // a faulty sign that cuts out now and then
  };
}

// Paints a facade at building-local coordinates (0,0 = top-left of the body, below the roof slab).
// [x0, x1]: the part a tile needs; cells outside it are skipped.
function paintFacade(c, w, h, seed, safe, x0, x1) {
  const visible = (a, b) => b >= x0 - 2 && a <= x1 + 2;

  const g = c.createLinearGradient(0, 0, 0, h);
  if (safe) { g.addColorStop(0, "#15364d"); g.addColorStop(1, "#08141e"); }
  else { g.addColorStop(0, "#2b2234"); g.addColorStop(1, "#110e17"); }
  c.fillStyle = g;
  c.fillRect(Math.max(0, x0 - 2), 0, Math.min(w, x1 + 2) - Math.max(0, x0 - 2), h);

  // Sky reflection: a broad diagonal band
  c.fillStyle = safe ? "rgba(160,220,255,0.07)" : "rgba(255,200,230,0.06)";
  const rx = w * (0.1 + 0.5 * rand01(seed, 1));
  const slope = 70 / 200; // the band leans left as it goes down
  c.beginPath();
  c.moveTo(rx, 0);
  c.lineTo(rx + 40, 0);
  c.lineTo(rx + 40 - h * slope, h);
  c.lineTo(rx - h * slope, h);
  c.closePath();
  c.fill();

  // Floors and offices
  const lit = safe ? ["255,214,150", "185,225,255", "185,225,255"] : ["255,200,140", "255,130,200", "255,170,120"];
  let f = 0;
  for (let fy = 4; fy < h - 4; fy += FLOOR_H, f++) {
    let col = 0;
    for (let fx = 3; fx < w - 3; fx += COL_W, col++) {
      if (!visible(fx, fx + COL_W)) continue;
      const k = f * 61 + col;
      const r = rand01(seed, 50 + k);
      const cw = Math.min(COL_W - 2, w - 3 - fx - 1);
      if (cw <= 2) continue;
      if (!safe && r < 0.06) {
        // Broken pane
        c.fillStyle = "#07060a";
        c.fillRect(fx + 1, fy + 2, cw, FLOOR_H - 5);
        c.strokeStyle = "rgba(255,255,255,0.18)";
        c.lineWidth = 0.5;
        c.beginPath();
        const mx = fx + 1 + cw * 0.5;
        const my = fy + 2 + (FLOOR_H - 5) * 0.4;
        c.moveTo(mx, my); c.lineTo(fx + 1, fy + 2);
        c.moveTo(mx, my); c.lineTo(fx + 1 + cw, fy + 4);
        c.moveTo(mx, my); c.lineTo(fx + 3, fy + FLOOR_H - 3);
        c.stroke();
        continue;
      }
      if (r > (safe ? 0.68 : 0.72)) {
        c.fillStyle = `rgba(${lit[Math.floor(rand01(seed, 200 + k) * lit.length)]},0.32)`;
        c.fillRect(fx + 1, fy + 2, cw, FLOOR_H - 5);
      }
    }
    // Spandrel
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(0, fy + FLOOR_H - 3, w, 3);
  }
  // Mullions
  c.fillStyle = safe ? "rgba(150,210,240,0.10)" : "rgba(230,200,230,0.08)";
  for (let fx = 3; fx < w - 2; fx += COL_W) if (visible(fx, fx + 1)) c.fillRect(fx, 0, 1, h);

  if (safe) {
    // Steel X-bracing behind the glass, every three floors
    c.strokeStyle = `rgba(${SAFE_RGB},0.22)`;
    c.lineWidth = 1.4;
    const span = FLOOR_H * 3;
    const spanW = span * 1.4;
    c.beginPath();
    for (let sy = 4; sy < h; sy += span) {
      for (let sx = 0; sx < w; sx += spanW) {
        if (!visible(sx, sx + spanW)) continue;
        c.moveTo(sx, sy); c.lineTo(sx + spanW, sy + span);
        c.moveTo(sx + spanW, sy); c.lineTo(sx, sy + span);
      }
    }
    c.stroke();
  }

  // Neon sign strip, painted lit (a blinking one is dimmed per frame)
  const neon = neonFor(seed, w, safe);
  if (neon && visible(neon.x - 1, neon.x + 9)) {
    c.fillStyle = "rgba(0,0,0,0.6)";
    c.fillRect(neon.x - 1, neon.y - 1, 10, neon.h + 2);
    for (let gy = neon.y + 2; gy < neon.y + neon.h - 6; gy += 9) {
      const glyph = Math.floor(rand01(seed, 600 + gy) * 4);
      const nx = neon.x;
      c.fillStyle = `rgba(${neon.rgb},0.25)`;
      c.fillRect(nx - 1, gy - 1, 10, 8);
      c.fillStyle = `rgba(${neon.rgb},0.95)`;
      if (glyph === 0) { c.fillRect(nx + 1, gy, 6, 1.2); c.fillRect(nx + 3.4, gy, 1.2, 6); }
      else if (glyph === 1) { c.fillRect(nx + 1, gy, 1.2, 6); c.fillRect(nx + 1, gy + 4.8, 6, 1.2); c.fillRect(nx + 5.8, gy + 2, 1.2, 4); }
      else if (glyph === 2) { c.fillRect(nx + 1, gy + 2.4, 6, 1.2); c.fillRect(nx + 1, gy, 6, 1.2); c.fillRect(nx + 1, gy + 4.8, 6, 1.2); }
      else { c.fillRect(nx + 1, gy, 1.2, 6); c.fillRect(nx + 5.8, gy, 1.2, 6); c.fillRect(nx + 1, gy + 2.4, 6, 1.2); }
    }
  }

  // Frame edges
  c.fillStyle = safe ? `rgba(${SAFE_RGB},0.35)` : "rgba(255,170,210,0.18)";
  c.fillRect(0, 0, 1.5, h);
  c.fillRect(w - 1.5, 0, 1.5, h);
}

// ---------------- tile cache ----------------
const _tiles = new Map(); // key -> sprite; insertion order doubles as least-recently-used order
const _spare = [];        // canvases of evicted tiles, reused
const _view = createScaleWatch();
let _paintsLeft = 0;

// Call once per frame with the world transform in place, before drawing facades.
// Tiles are only repainted for a new scale once the view has held still (see needsRepaint), so
// zooms (start screen, death cinematic) draw the existing tiles scaled instead.
export function beginFacadeFrame(ctx) {
  updateScaleWatch(_view, viewScale(ctx));
  _paintsLeft = PAINTS_PER_FRAME;
}

function getTile(seed, w, safe, i) {
  const key = `${seed}|${Math.round(w)}|${safe ? 1 : 0}|${i}`;
  let tile = _tiles.get(key);
  const stale = !tile || needsRepaint(_view, tile.scale);
  if (stale && (_paintsLeft > 0 || !tile)) {
    _paintsLeft -= 1;
    const canvas = tile?.canvas || _spare.pop() || document.createElement("canvas");
    const x0 = i * TILE_W;
    const tw = Math.min(TILE_W + 1, w - x0); // 1 px overlap so neighbouring tiles never leave a seam
    tile = paintSprite(canvas, tw, PAINT_H, 0, _view.scale, (c) => {
      c.translate(-x0, 0);
      c.beginPath();
      c.rect(x0, 0, tw, PAINT_H);
      c.clip();
      paintFacade(c, w, PAINT_H, seed, safe, x0, x0 + tw);
    });
  }
  _tiles.delete(key);
  _tiles.set(key, tile);
  while (_tiles.size > TILE_CACHE_MAX) {
    const oldest = _tiles.keys().next().value;
    _spare.push(_tiles.get(oldest).canvas);
    _tiles.delete(oldest);
  }
  return tile;
}

// The building body below a roof. (bodyX, bodyY): its top-left; viewW: the internal view width,
// so only tiles on screen are drawn.
export function drawFacade(ctx, seed, bodyX, bodyY, bodyW, bodyH, safe, t, viewW) {
  if (bodyW <= 0 || bodyH <= 0) return;
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(bodyX + 4, bodyY + 6, bodyW, bodyH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(bodyX, bodyY, bodyW, bodyH);
  ctx.clip();
  const first = Math.max(0, Math.floor((-bodyX - 40) / TILE_W));
  const last = Math.min(Math.ceil(bodyW / TILE_W) - 1, Math.floor((viewW + 40 - bodyX) / TILE_W));
  for (let i = first; i <= last; i++) {
    stampSprite(ctx, getTile(seed, bodyW, safe, i), bodyX + i * TILE_W, bodyY);
  }
  // A faulty neon sign cutting out
  const neon = neonFor(seed, bodyW, safe);
  if (neon && neon.blinks && Math.sin(t * 9 + seed) < -0.6) {
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(bodyX + neon.x - 1, bodyY + neon.y - 1, 10, neon.h + 2);
  }
  ctx.restore();
}

// Roof colours for the glass style.
export function facadeRoofColors(COLORS, safe) {
  return safe
    ? { ...COLORS, roofTop: "rgba(44,60,72,0.98)", roofSide: "rgba(30,44,56,0.98)", platformEdge: "rgba(150,235,255,0.55)" }
    : { ...COLORS, roofTop: "rgba(62,52,70,0.95)", roofSide: "rgba(32,26,38,0.95)" };
}

// Crown LED strip just under the roof edge (drawn after the roof).
export function drawCrown(ctx, plat, seed, safe, t) {
  const rgb = safe ? SAFE_RGB : "255,140,200";
  ctx.fillStyle = `rgba(${rgb},${0.35 + 0.15 * Math.sin(t * 2 + seed)})`;
  ctx.fillRect(plat.x + 2, plat.y + PLATFORM_H - 3, plat.w - 4, 1.5);
}
