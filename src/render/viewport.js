// src/render/viewport.js
// Canvas sizing: backing-store resolution, the internal-to-device transform, and paint-state resets.

export function isTouchViewport() {
  if (typeof window === "undefined") return false;
  const touchLike = (navigator.maxTouchPoints || 0) > 0
    || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const phoneish = Math.min(window.innerWidth || 0, window.innerHeight || 0) < 900;
  return touchLike && phoneish;
}

// Canvas CSS box. main.js measures it on resize and passes it in, because
// calling getBoundingClientRect every frame can force a layout.
let canvasRect = null;

export function setCanvasRect(rect) {
  canvasRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function getCanvasRect(canvas) {
  if (!canvasRect) setCanvasRect(canvas.getBoundingClientRect());
  return canvasRect;
}

// Backing-store resolution cap (device pixels per CSS pixel).
// main.js lowers it to 1 on devices that can't keep up.
let maxDpr = 1.5;

export function setMaxDpr(value) {
  maxDpr = value;
}


export function ensureCanvasSize(ctx, W, H) {
  // Renderer owns backing store sizing; main.js only sets CSS size.
  const canvas = ctx.canvas;
  if (!canvas) {
    return { dpr: 1, cw: W, ch: H, cssW: W, cssH: H };
  }

  const rect = getCanvasRect(canvas);
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));

  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const targetW = Math.max(1, Math.floor(cssW * dpr));
  const targetH = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  const cw = Math.max(1, canvas.width);
  const ch = Math.max(1, canvas.height);

  return { dpr, cw, ch, cssW, cssH };
}

export function applyViewportTransform(ctx, W, H, cssW, cssH, dpr) {
  // Draw in INTERNAL coords (W/H) and scale to cover the canvas while preserving aspect.
  // This fills the screen on mobile and crops offscreen edges instead of letterboxing.
  const sx = cssW / W;
  const sy = cssH / H;
  const s = Math.max(sx, sy);

  const oxCss = (cssW - W * s) * 0.5;
  const oyCss = (cssH - H * s) * 0.5;

  // Transform maps internal units -> device pixels.
  if (!Number.isFinite(dpr) || dpr <= 0) dpr = 1;
  ctx.setTransform(s * dpr, 0, 0, s * dpr, oxCss * dpr, oyCss * dpr);
}

export function resetCtx(ctx) {
  // Reset paint state, but DO NOT touch the transform.
  // The transform is owned by the renderer to scale internal coords to the canvas.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  // Also reset common stroke/text state so a single draw call can't poison later frames.
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 10;

  // Reset text defaults (some UI calls may change these).
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Keep pixel-art/rect FX crisp by default.
  if ("imageSmoothingEnabled" in ctx) ctx.imageSmoothingEnabled = false;
}
