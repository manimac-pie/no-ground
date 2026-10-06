// src/render/worldBillboards.js
// Billboards: the simulation's ads. Same glass look as the START firewall (render/glass.js).
//   Breakable:  a magenta glass screen that shatters when Bob dashes or dives through it.
//   Reinforced: a solid steel panel with a cyan screen. It doesn't break: go over, under or onto it.
//   Low (either kind): hazard stripes along the bottom edge mean "duck".
//
// Each billboard is painted once into a cached sprite (keyed by kind, size and ad copy) and stamped
// with drawImage. The shards for a breakable one are cut ahead of time, while it's still on screen
// and intact, so the frame Bob breaks it only stamps images.

import { PLAYER_H } from "../game/constants.js";
import {
  SHATTER_MAX_SEC,
  cutGlass,
  drawScanBar,
  drawShards,
  paintGlassPane,
  createScaleWatch,
  needsRepaint,
  paintSprite,
  stampSprite,
  updateScaleWatch,
  viewScale,
} from "./glass.js";

function hash01(n) {
  const x = Math.sin(n * 999.123) * 43758.5453;
  return x - Math.floor(x);
}

// The system's ads. Edit freely; each billboard picks one from its building's seed.
const AD_COPY = [
  "STAY IN THE LOOP",
  "RESTART IS FREE",
  "OBEY",
  "YOU ARE HERE",
  "RUN AGAIN",
  "NO EXIT",
  "KEEP RUNNING",
  "CONSUME",
];

const GLASS_RGB = "255,80,150";  // breakable: warm magenta, so it never reads as the cyan "solid" kind
const SOLID_RGB = "120,205,255"; // reinforced
const AD_FONT_FAMILY = 'Orbitron, "Share Tech Mono", system-ui, sans-serif';
const LABEL_FONT = '600 6px "Share Tech Mono", Menlo, monospace';
const STRIPE_H = 6;              // hazard stripe band on low billboards
const MARGIN = 6;                // world px around a sprite for its glow
const SPRITE_CACHE_MAX = 24;     // low billboards vary in height, so keep the cache bounded

// Shards: a little forward drift on screen, like Bob carried them through.
const SHARD_CARRY = [80, 200];
const PERFECT_FLASH_SEC = 0.16;

function fontReady() {
  try {
    return document.fonts ? document.fonts.check(`800 12px ${AD_FONT_FAMILY}`) : true;
  } catch {
    return true;
  }
}

export function adCopyFor(seed) {
  return AD_COPY[Math.floor(hash01(seed * 3.17 + 0.5) * AD_COPY.length) % AD_COPY.length];
}

// Largest font (and its word-wrapped lines) that fits the box.
function fitText(c, text, maxW, maxH) {
  const words = text.split(" ");
  for (let size = 20; size >= 7; size -= 1) {
    c.font = `800 ${size}px ${AD_FONT_FAMILY}`;
    const lines = [];
    let line = "";
    let fits = true;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width <= maxW) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word;
        if (c.measureText(word).width > maxW) fits = false;
      }
    }
    if (line) lines.push(line);
    if (fits && lines.length * size * 1.2 <= maxH) return { size, lines };
  }
  return { size: 7, lines: [text] };
}

function paintText(c, text, x, y, w, h, fill, glowRgb, scale) {
  const { size, lines } = fitText(c, text, w, h);
  c.save();
  c.font = `800 ${size}px ${AD_FONT_FAMILY}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.shadowColor = `rgba(${glowRgb},0.95)`;
  c.shadowBlur = 3 * scale;
  c.fillStyle = fill;
  const lineH = size * 1.2;
  const top = y + h / 2 - (lines.length * lineH) / 2 + lineH / 2;
  lines.forEach((line, i) => c.fillText(line, x + w / 2, top + i * lineH));
  c.restore();
}

function paintHazardStripes(c, w, h, warning) {
  const sy = h - STRIPE_H;
  c.save();
  c.beginPath();
  c.rect(0, sy, w, STRIPE_H);
  c.clip();
  c.fillStyle = "rgba(10,12,16,0.92)";
  c.fillRect(0, sy, w, STRIPE_H);
  c.fillStyle = warning;
  for (let x = -STRIPE_H; x < w; x += 12) {
    c.beginPath();
    c.moveTo(x, sy + STRIPE_H);
    c.lineTo(x + STRIPE_H, sy);
    c.lineTo(x + STRIPE_H + 6, sy);
    c.lineTo(x + 6, sy + STRIPE_H);
    c.closePath();
    c.fill();
  }
  c.restore();
}

// Breakable: a glass ad screen.
function paintGlassAd(c, w, h, text, low, scale, warning) {
  paintGlassPane(c, w, h, GLASS_RGB, scale, { tint: 1.25 });
  const textBottom = h - (low ? STRIPE_H : 0);
  c.font = LABEL_FONT;
  c.textBaseline = "top";
  c.textAlign = "left";
  c.fillStyle = `rgba(${GLASS_RGB},0.8)`;
  c.fillText("SPONSORED", 5, 4);
  paintText(c, text, 8, 12, w - 16, textBottom - 18, "rgba(255,226,238,0.98)", GLASS_RGB, scale);
  if (low) paintHazardStripes(c, w, h, warning);
}

// Reinforced: an opaque steel panel framing a cyan screen.
function paintSolidAd(c, w, h, text, low, scale, warning) {
  // Steel body
  const steel = c.createLinearGradient(0, 0, 0, h);
  steel.addColorStop(0, "rgb(52,62,76)");
  steel.addColorStop(1, "rgb(26,32,42)");
  c.fillStyle = steel;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(0,0,0,0.6)";
  c.lineWidth = 1;
  c.strokeRect(0.5, 0.5, w - 1, h - 1);

  // Screen, inset in the frame
  const inset = 5;
  const screenH = h - inset * 2 - (low ? STRIPE_H : 0);
  c.fillStyle = "rgb(6,12,20)";
  c.fillRect(inset, inset, w - inset * 2, screenH);
  c.fillStyle = `rgba(${SOLID_RGB},0.07)`;
  for (let y = inset + 1.5; y < inset + screenH; y += 3) c.fillRect(inset, y, w - inset * 2, 0.6);
  c.save();
  c.shadowColor = `rgba(${SOLID_RGB},0.8)`;
  c.shadowBlur = 2 * scale;
  c.strokeStyle = `rgba(${SOLID_RGB},0.85)`;
  c.lineWidth = 1.2;
  c.strokeRect(inset - 0.6, inset - 0.6, w - inset * 2 + 1.2, screenH + 1.2);
  c.restore();

  // Bolts in the frame corners
  for (const [bx, by] of [[2.5, 2.5], [w - 2.5, 2.5], [2.5, h - 2.5 - (low ? STRIPE_H : 0)], [w - 2.5, h - 2.5 - (low ? STRIPE_H : 0)]]) {
    c.fillStyle = "rgb(110,122,138)";
    c.beginPath();
    c.arc(bx, by, 1.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.5)";
    c.fillRect(bx - 0.7, by - 0.9, 0.9, 0.5);
  }

  c.font = LABEL_FONT;
  c.textBaseline = "top";
  c.textAlign = "left";
  c.fillStyle = `rgba(${SOLID_RGB},0.75)`;
  c.fillText("SECURE", inset + 3, inset + 2);
  paintText(c, text, inset + 4, inset + 10, w - inset * 2 - 8, screenH - 14, "rgba(215,245,255,0.98)", SOLID_RGB, scale);
  if (low) paintHazardStripes(c, w, h, warning);
}

// ---------------- sprite cache ----------------
const _sprites = new Map(); // key -> sprite; insertion order doubles as least-recently-used order
const _view = createScaleWatch();
let _cutsLeft = 0;

// Call once per frame with the world transform in place, before drawing billboards.
// A sprite is only repainted for a new scale once the view has held still (see needsRepaint),
// so zooms (start screen, death cinematic) draw the existing sprite scaled instead.
export function beginBillboardFrame(ctx) {
  updateScaleWatch(_view, viewScale(ctx));
  _cutsLeft = 1; // cut at most one billboard's shards a frame
}

function getSprite(b, seed, warning) {
  const w = Math.round(b.w);
  const h = Math.round(b.h);
  const kind = b.reinforced ? "solid" : "glass";
  const text = adCopyFor(seed);
  const key = `${kind}|${w}|${h}|${b.low === true}|${text}|${fontReady()}`;
  let sprite = _sprites.get(key);
  if (sprite && !needsRepaint(_view, sprite.scale)) {
    _sprites.delete(key); // mark as recently used
    _sprites.set(key, sprite);
    return sprite;
  }
  const scale = _view.scale;
  const paint = kind === "solid" ? paintSolidAd : paintGlassAd;
  sprite = paintSprite(sprite?.canvas || document.createElement("canvas"), w, h, MARGIN, scale, (c) =>
    paint(c, w, h, text, b.low === true, scale, warning)
  );
  sprite.shards = null;
  _sprites.delete(key);
  _sprites.set(key, sprite);
  while (_sprites.size > SPRITE_CACHE_MAX) _sprites.delete(_sprites.keys().next().value);
  return sprite;
}

// Shards are cut once per sprite (same-size ads share them), around the usual impact: the front
// face at mid height. They still burst away from wherever Bob actually hit.
function getShards(sprite) {
  if (!sprite.shards) sprite.shards = cutGlass(sprite, { x: 0, y: sprite.h / 2 });
  return sprite.shards;
}

// ---------------- drawing ----------------
export function drawBillboard(ctx, plat, b, seed, animTime, warning, frameColor) {
  if (!plat || !b || b.broken === true) return;
  const bw = Number.isFinite(b.w) ? b.w : 0;
  const bh = Number.isFinite(b.h) ? b.h : 0;
  if (bw <= 0 || bh <= 0) return;
  const bx = plat.x + (Number.isFinite(b.offsetX) ? b.offsetX : 0);
  const by = plat.y - (Number.isFinite(b.offsetY) ? b.offsetY : 0);

  // Posts down to the roof
  ctx.fillStyle = frameColor;
  const postW = Math.max(2, Math.floor(bw * 0.06));
  const postH = Math.max(6, plat.y - (by + bh));
  ctx.fillRect(bx + 6, by + bh, postW, postH);
  ctx.fillRect(bx + bw - 6 - postW, by + bh, postW, postH);

  const sprite = getSprite(b, seed, warning);
  if (b.reinforced) {
    stampSprite(ctx, sprite, bx, by);
    return;
  }
  const pulse = 0.88 + 0.12 * Math.sin(animTime * 2.2 + seed);
  stampSprite(ctx, sprite, bx, by, pulse);
  drawScanBar(ctx, bx, by, bw, bh - (b.low ? STRIPE_H : 0), GLASS_RGB, animTime + seed * 0.37);
  // Cut its shards now, while it's intact, so breaking it costs nothing extra.
  if (!sprite.shards && _cutsLeft > 0) {
    _cutsLeft -= 1;
    getShards(sprite);
  }
}

// ---------------- shattering ----------------
const _shatters = []; // { x, y, shards, impact, t, perfect }

// A breakable billboard just broke: shatter it from where Bob hit.
export function spawnBillboardShatter(state, plat, b, seed, warning) {
  if (!plat || !b || b.reinforced) return;
  const bx = plat.x + (b.offsetX || 0);
  const by = plat.y - (b.offsetY || 0);
  const sprite = getSprite(b, seed, warning);
  const p = state.player;
  // Bob's drawn front (85% of his hitbox width) at his middle height, on the billboard.
  const hitX = p ? p.x + p.w * 0.85 - bx : 0;
  const hitY = p ? p.y + (p.h || PLAYER_H) / 2 - by : sprite.h / 2;
  _shatters.push({
    x: bx,
    y: by,
    shards: getShards(sprite),
    impact: { x: Math.min(sprite.w, Math.max(0, hitX)), y: Math.min(sprite.h, Math.max(0, hitY)) },
    t: 0,
    perfect: b.perfect === true,
  });
}

export function drawBillboardShatters(ctx, dt) {
  for (let i = _shatters.length - 1; i >= 0; i--) {
    const s = _shatters[i];
    s.t += dt;
    if (s.t > SHATTER_MAX_SEC) {
      _shatters.splice(i, 1);
      continue;
    }
    drawShards(ctx, s.shards, s.x, s.y, s.impact, s.t, { carry: SHARD_CARRY, flash: s.perfect ? 1 : 0 });
    if (s.perfect && s.t < PERFECT_FLASH_SEC) {
      // PERFECT: an additive white-pink burst and ring from the impact point.
      const k = s.t / PERFECT_FLASH_SEC;
      const cx = s.x + s.impact.x;
      const cy = s.y + s.impact.y;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14 + 40 * k);
      glow.addColorStop(0, `rgba(255,235,245,${0.9 * (1 - k)})`);
      glow.addColorStop(1, "rgba(255,80,150,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 60, cy - 60, 120, 120);
      ctx.strokeStyle = `rgba(255,220,240,${0.95 * (1 - k)})`;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 10 + 90 * k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
