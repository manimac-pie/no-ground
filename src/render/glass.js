// src/render/glass.js
// Shared look for the simulation's glass: cached sprites, a glass-pane painter, and shattering.
// Used by the START firewall (menu.js) and the breakable billboards (worldBuildings.js).
//
// A sprite is a rectangle (w x h world px) painted once into a canvas at `scale` device px per
// world px, with `margin` world px around it for glows: { canvas, scale, margin, w, h }.

import { hash01 } from "../shared/math.js";

// ---------------- sprites ----------------
// paint(c) draws the piece at local coordinates (0,0 = its top-left), with c already scaled.
export function paintSprite(canvas, w, h, margin, scale, paint) {
  canvas.width = Math.ceil((w + margin * 2) * scale);
  canvas.height = Math.ceil((h + margin * 2) * scale);
  const c = canvas.getContext("2d");
  c.setTransform(scale, 0, 0, scale, margin * scale, margin * scale);
  paint(c);
  return { canvas, scale, margin, w, h };
}

// Tracks whether the view scale has held still: zooms (start screen, death cinematic) ease out so
// slowly that neighbouring frames can match closely, so it takes STEADY_FRAMES frames in a row.
// A cached image is only repainted for a new scale once it's steady and more than 2% off.
const STEADY_FRAMES = 8;
export function createScaleWatch() {
  return { scale: 0, still: 0 };
}
export function updateScaleWatch(watch, scale) {
  watch.still = Math.abs(scale - watch.scale) < 1e-4 ? watch.still + 1 : 0;
  watch.scale = scale;
}
export function needsRepaint(watch, spriteScale) {
  return watch.still >= STEADY_FRAMES && Math.abs(spriteScale - watch.scale) > watch.scale * 0.02;
}

// Device px per world px under the current transform.
export function viewScale(ctx) {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

// Stamp a sprite with its top-left at (x, y). When the view scale matches the sprite's it's
// snapped to device pixels and copied 1:1 (crisp); otherwise it's scaled with smoothing.
export function stampSprite(ctx, sprite, x, y, alpha = 1) {
  const m = ctx.getTransform();
  const S = sprite.scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (m.b === 0 && m.c === 0 && Math.abs(m.a - S) < 1e-3 && Math.abs(m.d - S) < 1e-3) {
    const devX = Math.round(m.a * (x - sprite.margin) + m.e);
    const devY = Math.round(m.d * (y - sprite.margin) + m.f);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sprite.canvas, devX, devY);
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      sprite.canvas,
      x - sprite.margin,
      y - sprite.margin,
      sprite.canvas.width / S,
      sprite.canvas.height / S
    );
  }
  ctx.restore();
}

// ---------------- glass pane ----------------
// A thin glass pane: tinted body, scanlines, glare, glowing frame with corner brackets.
// Text and extras are painted on top by the caller. rgb: "r,g,b".
export function paintGlassPane(c, w, h, rgb, scale, opts = {}) {
  const tint = opts.tint ?? 1;

  const body = c.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, `rgba(${rgb},${0.22 * tint})`);
  body.addColorStop(0.55, `rgba(${rgb},${0.10 * tint})`);
  body.addColorStop(1, `rgba(${rgb},${0.16 * tint})`);
  c.fillStyle = body;
  c.fillRect(0, 0, w, h);

  c.save();
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  // Scanlines
  c.fillStyle = `rgba(${rgb},0.10)`;
  for (let y = 1.5; y < h; y += 3) c.fillRect(0, y, w, 0.6);
  // Glare: two diagonal bands, slanted by the pane's height so tall panes keep the same angle.
  const slant = Math.min(w * 0.10, h * 0.24);
  const g0 = w * 0.16;
  c.fillStyle = "rgba(255,255,255,0.08)";
  c.beginPath();
  c.moveTo(g0, 0);
  c.lineTo(g0 + w * 0.14, 0);
  c.lineTo(g0 + w * 0.14 - slant, h);
  c.lineTo(g0 - slant, h);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.05)";
  c.beginPath();
  c.moveTo(g0 + w * 0.18, 0);
  c.lineTo(g0 + w * 0.22, 0);
  c.lineTo(g0 + w * 0.22 - slant, h);
  c.lineTo(g0 + w * 0.18 - slant, h);
  c.closePath();
  c.fill();
  c.restore();

  // Edges: a glowing frame with heavier corner brackets.
  c.save();
  c.shadowColor = `rgba(${rgb},0.9)`;
  c.shadowBlur = 2.2 * scale; // shadowBlur is in device px
  c.strokeStyle = `rgba(${rgb},0.75)`;
  c.lineWidth = 0.8;
  c.strokeRect(0.4, 0.4, w - 0.8, h - 0.8);
  c.strokeStyle = `rgba(${rgb},1)`;
  c.lineWidth = 1.6;
  const arm = Math.min(8, w * 0.12, h * 0.2);
  c.beginPath();
  for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]) {
    c.moveTo(cx + dx * arm, cy + dy * 0.8);
    c.lineTo(cx + dx * 0.8, cy + dy * 0.8);
    c.lineTo(cx + dx * 0.8, cy + dy * arm);
  }
  c.stroke();
  c.restore();
}

// A slow scan bar sweeping down a pane (one rect a frame).
export function drawScanBar(ctx, x, y, w, h, rgb, t, inset = 3) {
  const travel = h + 8;
  const sy = ((t * 16) % travel) - 4;
  const top = Math.max(0, sy);
  const bottom = Math.min(h - inset, sy + 2.5);
  if (bottom <= top) return;
  ctx.save();
  ctx.fillStyle = `rgba(${rgb},0.16)`;
  ctx.fillRect(x + 1, y + top, w - 2, bottom - top);
  ctx.restore();
}

// ---------------- shattering ----------------
const CRACK_SPEED = 900;  // px/s the break spreads from the impact point
const GRAVITY = 900;
const FLASH_SEC = 0.07;   // a shard glints white this long after it breaks off
const RADIAL = 16;        // cracks running out from the impact
const RING_FRACS = [0.05, 0.11, 0.2, 0.33, 0.52, 1]; // ring radii, as a share of the reach below

// Longest a shatter can last (crack delay across the biggest pane + longest shard life).
export const SHATTER_MAX_SEC = 1.6;

// Clip a polygon to the rectangle [0,w] x [0,h] (Sutherland–Hodgman, one edge at a time).
function clipToRect(points, w, h) {
  const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const edges = [
    [(p) => p.x >= 0, (a, b) => at(a, b, (0 - a.x) / (b.x - a.x))],
    [(p) => p.x <= w, (a, b) => at(a, b, (w - a.x) / (b.x - a.x))],
    [(p) => p.y >= 0, (a, b) => at(a, b, (0 - a.y) / (b.y - a.y))],
    [(p) => p.y <= h, (a, b) => at(a, b, (h - a.y) / (b.y - a.y))],
  ];
  let out = points;
  for (const [inside, cross] of edges) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i];
      const b = input[(i + 1) % input.length];
      const aIn = inside(a);
      const bIn = inside(b);
      if (aIn) out.push(a);
      if (aIn !== bIn) out.push(cross(a, b));
    }
  }
  return out;
}

// Cut a sprite into glass shards around an impact point (sprite-local): radial cracks from the
// impact, cut by rings. Each shard gets its own pre-cut image, so drawing one is a single drawImage.
export function cutGlass(sprite, impact) {
  const { w, h, scale: S, margin } = sprite;
  const reach = Math.hypot(w, h) * 1.25; // the outer ring covers the far corner even when jittered in
  const angles = [];
  for (let j = 0; j < RADIAL; j++) {
    angles.push(((j + 0.5 * (hash01(j * 7.3 + 1) - 0.5)) / RADIAL) * Math.PI * 2);
  }
  const ringAt = (i, j) => {
    if (i === 0) return impact;
    const jj = j % RADIAL; // the last cell wraps round to the first crack
    const r = RING_FRACS[i - 1] * reach * (0.82 + 0.36 * hash01(i * 31.7 + jj * 5.3));
    return { x: impact.x + Math.cos(angles[jj]) * r, y: impact.y + Math.sin(angles[jj]) * r };
  };

  const shards = [];
  for (let i = 0; i < RING_FRACS.length; i++) {
    for (let j = 0; j < RADIAL; j++) {
      const poly = clipToRect(
        i === 0
          ? [impact, ringAt(1, j), ringAt(1, j + 1)]
          : [ringAt(i, j), ringAt(i + 1, j), ringAt(i + 1, j + 1), ringAt(i, j + 1)],
        w,
        h
      );
      if (poly.length < 3) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
      for (const p of poly) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        cx += p.x; cy += p.y;
      }
      if (maxX - minX < 0.5 || maxY - minY < 0.5) continue;
      cx /= poly.length;
      cy /= poly.length;

      // Pre-cut image: the sprite clipped to this shard, with a glinting edge.
      const pad = 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil((maxX - minX + pad * 2) * S);
      canvas.height = Math.ceil((maxY - minY + pad * 2) * S);
      const c = canvas.getContext("2d");
      c.setTransform(S, 0, 0, S, (pad - minX) * S, (pad - minY) * S);
      c.beginPath();
      poly.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.save();
      c.clip();
      c.drawImage(sprite.canvas, -margin, -margin, sprite.canvas.width / S, sprite.canvas.height / S);
      c.restore();
      c.strokeStyle = "rgba(235,250,255,0.55)";
      c.lineWidth = 0.5;
      c.stroke();

      shards.push({
        poly: poly.map((p) => ({ x: p.x - cx, y: p.y - cy })),
        cx, cy,
        ox: minX - pad - cx, // image offset from the centroid
        oy: minY - pad - cy,
        w: canvas.width / S,
        h: canvas.height / S,
        canvas,
        seed: i * RADIAL + j,
      });
    }
  }
  return shards;
}

// Draw shards flying apart, tSec after the impact. (x, y): where the sprite's top-left was.
// The break spreads out from `impact` like a crack, so far shards go a beat later.
// carry: [base, range] forward speed (px/s) added to every shard. flash: 0..1 extra white-hot.
export function drawShards(ctx, shards, x, y, impact, tSec, opts = {}) {
  const [carryBase, carryRange] = opts.carry || [130, 120];
  const flashSec = FLASH_SEC * (1 + (opts.flash || 0) * 2);
  for (const shard of shards) {
    const dx = shard.cx - impact.x;
    const dy = shard.cy - impact.y;
    const dist = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, tSec - dist / CRACK_SPEED);
    const r1 = hash01(shard.seed * 13.7 + 1);
    const r2 = hash01(shard.seed * 97.3 + 2);
    const r3 = hash01(shard.seed * 41.9 + 3);
    const life = 0.8 + 0.45 * r2;
    const k = t / life;
    if (k >= 1) continue;

    // Burst away from the impact (harder up close), plus the forward carry and a pop upward.
    const push = 240 * (0.5 + r1) * Math.min(1.4, Math.max(0.4, 1.4 - dist / 120));
    const vx = (dx / dist) * push + carryBase + carryRange * r2;
    const vy = (dy / dist) * push - (110 + 150 * r3);
    const px = x + shard.cx + vx * t;
    const py = y + shard.cy + vy * t + 0.5 * GRAVITY * t * t;
    const rot = (r1 - 0.5) * 14 * t;
    const scale = 1 - 0.45 * k;

    ctx.save();
    ctx.globalAlpha *= 1 - k * k;
    ctx.translate(px, py);
    if (rot) ctx.rotate(rot);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(shard.canvas, shard.ox, shard.oy, shard.w, shard.h);
    if (t > 0 && t < flashSec) {
      // Just broke off: a white-hot glint.
      ctx.globalAlpha *= 1 - t / flashSec;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      shard.poly.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
