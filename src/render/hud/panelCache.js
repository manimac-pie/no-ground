// src/render/hud/panelCache.js
// Cached UI panels, shared by every HUD screen.

// Static UI pieces are painted once into an offscreen canvas at the exact device
// scale and stamped with drawImage each frame. A piece is repainted only when its
// content key, the scale, or its device-pixel offset changes (resize, hover, new data).
const PANEL_PAD_DEVICE = 40; // device px around the box, for shadows and glows
const panelCache = new Map(); // slot -> { key, canvas, result }

// Paint state a piece may inherit from the caller (e.g. a shadow left on by earlier
// drawing). Fill and stroke styles aren't included: every cached piece sets its own.
const INHERITED_PROPS = [
  "lineWidth", "lineCap", "lineJoin", "miterLimit", "font", "textAlign", "textBaseline",
  "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY",
];

// box: the piece's bounds in UI units. draw(ctx) paints it at its normal coordinates.
// Returns whatever draw returned when the piece was last painted.
export function drawCachedPanel(ctx, slot, contentKey, box, draw) {
  const m = ctx.getTransform();
  // A cached image can't reproduce per-shape alpha, blend modes or filters: draw directly.
  const plain =
    ctx.globalAlpha === 1 &&
    ctx.globalCompositeOperation === "source-over" &&
    (ctx.filter === undefined || ctx.filter === "none");
  if (!plain || m.b !== 0 || m.c !== 0 || m.a <= 0 || m.d <= 0) return draw(ctx);

  // Device-pixel bounds of the piece plus padding, clipped to the canvas.
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  const intX = Math.max(0, Math.floor(m.a * box.x + m.e) - PANEL_PAD_DEVICE);
  const intY = Math.max(0, Math.floor(m.d * box.y + m.f) - PANEL_PAD_DEVICE);
  const right = Math.min(canvasW, Math.ceil(m.a * (box.x + box.w) + m.e) + PANEL_PAD_DEVICE);
  const bottom = Math.min(canvasH, Math.ceil(m.d * (box.y + box.h) + m.f) + PANEL_PAD_DEVICE);
  const width = right - intX;
  const height = bottom - intY;
  if (width <= 0 || height <= 0) return draw(ctx);
  const tx = m.e - intX;
  const ty = m.f - intY;
  const inherited = INHERITED_PROPS.map((prop) => ctx[prop]);
  const key = `${contentKey}|${m.a}|${m.d}|${tx}|${ty}|${width}|${height}|${inherited.join("|")}`;

  let entry = panelCache.get(slot);
  if (!entry) {
    entry = { key: "", canvas: document.createElement("canvas"), result: undefined };
    panelCache.set(slot, entry);
  }
  if (entry.key !== key) {
    const canvas = entry.canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const pctx = canvas.getContext("2d");
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, width, height);
    pctx.save();
    INHERITED_PROPS.forEach((prop, i) => {
      pctx[prop] = inherited[i];
    });
    pctx.setTransform(m.a, 0, 0, m.d, tx, ty);
    entry.result = draw(pctx);
    pctx.restore();
    entry.key = key;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = "transparent"; // any inherited shadow is already baked in
  ctx.shadowBlur = 0;
  ctx.drawImage(entry.canvas, intX, intY);
  ctx.restore();
  return entry.result;
}
