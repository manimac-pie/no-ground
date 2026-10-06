// src/render/menu.js
// Menu-only rendering (start + game over). Pure drawing; no state mutation.
import { world } from "../game.js";
import { SAFE_CLEARANCE, PLAYER_H } from "../game/constants.js";
import {
  cutGlass,
  drawScanBar,
  drawShards,
  paintGlassPane,
  paintSprite,
  stampSprite,
  viewScale,
} from "./glass.js";

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

// ---------------- START firewall ----------------
// START is a pane of the simulation's firewall: a thin glass barrier standing on the starter roof.
// Bob breaks out by crashing through it, and it shatters into glass shards (render/glass.js).
//
// Cost: the intact pane is painted once into a sprite (glow included) and stamped with drawImage,
// at rest and while the camera zooms out. The shards are cut from that sprite ahead of time, so
// the impact frame only stamps images.
const PANE_W = 100;         // world px
const PANE_H = 42;          // world px; a bit taller than Bob
const PANE_FONT_PX = 15;
const PANE_LETTER_GAP = 3;
const PANE_FONT = `800 ${PANE_FONT_PX}px Orbitron, "Share Tech Mono", system-ui, sans-serif`;
const PANE_LABEL_FONT = '600 4.5px "Share Tech Mono", Menlo, monospace';
const PANE_MARGIN = 6;      // world px around the pane for its glow
const PANE_MAX_SCALE = 12;  // device px per world px, upper bound for the sprite

// Bob's drawn body ends short of his hitbox: the capsule is 70% of his width, centred
// (render/playerBody.js), so its front is at 85% of the hitbox width.
const BOB_FRONT_FRAC = 0.85;

// Shards beat the world's scroll (~260 px/s) so the glass sprays ahead of Bob.
const PANE_SHARD_CARRY = [290, 150];

function paneRgb(red) {
  return red ? "255,110,130" : "120,205,255";
}

function fontReady() {
  try {
    return document.fonts ? document.fonts.check(PANE_FONT) : true;
  } catch {
    return true;
  }
}

// Paints the pane at pane-local coordinates (0,0 = top-left of the glass).
function paintPane(c, red, scale) {
  const W = PANE_W;
  const H = PANE_H;
  const rgb = paneRgb(red);

  paintGlassPane(c, W, H, rgb, scale);

  // Base rail where it stands on the roof
  c.fillStyle = "rgba(20,24,32,0.95)";
  c.fillRect(-2, H - 2.5, W + 4, 2.5);
  c.fillStyle = `rgba(${rgb},0.9)`;
  for (let x = 6; x < W - 4; x += 12) c.fillRect(x, H - 1.6, 2, 0.8);

  // System label
  c.font = PANE_LABEL_FONT;
  c.textBaseline = "top";
  c.textAlign = "left";
  c.fillStyle = `rgba(${rgb},0.75)`;
  c.fillText("FIREWALL", 4, 3.5);
  c.textAlign = "right";
  c.fillText(red ? "BREACH" : "SECTOR 00", W - 4, 3.5);

  // START, letter by letter so the spacing is the same in every browser.
  c.font = PANE_FONT;
  c.textAlign = "left";
  c.textBaseline = "middle";
  const letters = [..."START"];
  const widths = letters.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + PANE_LETTER_GAP * (letters.length - 1);
  let penX = (W - total) / 2;
  const textY = H * 0.56;
  c.shadowColor = `rgba(${rgb},0.95)`;
  c.shadowBlur = 3 * scale;
  c.fillStyle = red ? "rgba(255,215,222,0.98)" : "rgba(215,245,255,0.98)";
  letters.forEach((ch, i) => {
    c.fillText(ch, penX, textY);
    penX += widths[i] + PANE_LETTER_GAP;
  });
  c.shadowBlur = 0;
  c.shadowColor = "transparent";
}

// Intact pane sprites ("red" | "blue"). Painted at the largest scale seen so far, so the
// zoom-out (which only shrinks it) never forces a repaint.
const _paneSprites = new Map();

function getPaneSprite(red, wantScale) {
  const slot = red ? "red" : "blue";
  const font = fontReady();
  const prev = _paneSprites.get(slot);
  const scale = Math.min(PANE_MAX_SCALE, Math.max(prev?.scale || 0, wantScale));
  if (prev && prev.scale === scale && prev.font === font) return prev;

  const canvas = prev?.canvas || document.createElement("canvas");
  const sprite = paintSprite(canvas, PANE_W, PANE_H, PANE_MARGIN, scale, (c) => paintPane(c, red, scale));
  sprite.font = font;
  sprite.shards = new Map(); // impact key -> shards
  _paneSprites.set(slot, sprite);
  return sprite;
}

// Impact points are rounded so the start screen can cut the usual one ahead of time.
function getShards(sprite, impact) {
  const qx = Math.round(impact.x / 8) * 8;
  const qy = Math.round(impact.y / 8) * 8;
  const key = `${qx},${qy}`;
  let shards = sprite.shards.get(key);
  if (!shards) {
    shards = cutGlass(sprite, { x: qx, y: qy });
    sprite.shards.set(key, shards);
  }
  return shards;
}

// Where Bob usually hits: the pane's front face, at his middle height.
function defaultImpact() {
  return { x: 0, y: PANE_H - PLAYER_H / 2 };
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

  const smashActive = state.menuSmashActive === true;
  const smashBroken = state.menuSmashBroken === true;
  const smashT = smashActive ? Math.max(0, state.menuSmashT || 0) : 0;
  const showPane = !state.gameOver && (!smashBroken || smashActive);
  if (!showPane) return false;

  // Stands on the starter roof, a little ahead of Bob; X scrolls with the world via state.
  const player = state.player || {};
  const roofY = world.GROUND_Y - SAFE_CLEARANCE;
  const defaultX = (Number.isFinite(player.x) ? player.x : 160) + (Number.isFinite(player.w) ? player.w : 34) + 24;
  const paneX = Number.isFinite(state.startPromptX) ? state.startPromptX : defaultX;
  const paneY = roofY - PANE_H;

  if (onBounds) onBounds({ x: paneX, y: paneY, w: PANE_W, h: PANE_H });
  const pointer = opts.pointer || null;
  const hover =
    !!pointer &&
    pointer.x >= paneX &&
    pointer.x <= paneX + PANE_W &&
    pointer.y >= paneY &&
    pointer.y <= paneY + PANE_H;
  const red = hover || (smashActive && state.menuSmashRed === true);

  // Sprite scale: the device px per world px on screen now (largest at the start-screen zoom).
  const sprite = getPaneSprite(red, viewScale(ctx));

  if (smashActive) {
    const impact = state.menuSmashImpact || defaultImpact();
    drawShards(ctx, getShards(sprite, impact), paneX, paneY, impact, smashT, { carry: PANE_SHARD_CARRY });
    return hover;
  }

  const pulse = 0.9 + 0.1 * Math.sin((uiTime || 0) * 2.4);
  stampSprite(ctx, sprite, paneX, paneY, pulse);
  drawScanBar(ctx, paneX, paneY, PANE_W, PANE_H, paneRgb(red), uiTime || 0);
  // Cut the usual shards now, so the impact frame doesn't have to.
  if (!state.menuZooming) getShards(sprite, defaultImpact());

  // Smash once Bob's drawn front touches the glass (not his wider hitbox).
  if (onSmashTrigger) {
    const px = Number.isFinite(player.x) ? player.x : 0;
    const py = Number.isFinite(player.y) ? player.y : 0;
    const pw = Number.isFinite(player.w) ? player.w : 0;
    const ph = Number.isFinite(player.h) ? player.h : 0;
    const front = px + pw * BOB_FRONT_FRAC;
    const hit =
      front >= paneX &&
      px < paneX + PANE_W &&
      py < paneY + PANE_H &&
      py + ph > paneY;
    if (hit) {
      // Impact point on the pane: Bob's front, at his middle height.
      onSmashTrigger(hover, {
        x: Math.min(PANE_W, Math.max(0, front - paneX)),
        y: Math.min(PANE_H, Math.max(0, py + ph / 2 - paneY)),
      });
    }
  }
  return hover;
}
