// src/render/menu.js
// Menu-only rendering (start + game over). Pure drawing; no state mutation.
import { PLAYER_H } from "../game/constants.js";
import {
  START_PANE_H as PANE_H,
  START_PANE_W as PANE_W,
  START_PANE_Y,
  startPaneX,
} from "../game/firewall.js";
import {
  cutGlass,
  drawScanBar,
  drawShards,
  paintGlassPane,
  paintSprite,
  stampSprite,
  viewScale,
} from "./glass.js";

// ---------------- START firewall ----------------
// START is a pane of the simulation's firewall: a thin glass barrier standing on the starter roof.
// Bob breaks out by crashing through it, and it shatters into glass shards (render/glass.js).
//
// Cost: the intact pane is painted once into a sprite (glow included) and stamped with drawImage,
// at rest and while the camera zooms out. The shards are cut from that sprite ahead of time, so
// the impact frame only stamps images. Its size, place and the smash itself are in game/firewall.js.
const PANE_FONT_PX = 15;
const PANE_LETTER_GAP = 3;
const PANE_FONT = `800 ${PANE_FONT_PX}px Orbitron, "Share Tech Mono", system-ui, sans-serif`;
const PANE_LABEL_FONT = '600 4.5px "Share Tech Mono", Menlo, monospace';
const PANE_MARGIN = 6;      // world px around the pane for its glow
const PANE_MAX_SCALE = 12;  // device px per world px, upper bound for the sprite

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


// pointer: the pointer in world px, or null. Returns whether it's over the pane (the game smashes
// the glass red if it is).
export function drawStartPrompt(ctx, state, uiTime, COLORS, W, H, pointer = null) {
  const smashActive = state.menuSmashActive === true;
  const smashBroken = state.menuSmashBroken === true;
  const smashT = smashActive ? Math.max(0, state.menuSmashT || 0) : 0;
  const showPane = !state.gameOver && (!smashBroken || smashActive);
  if (!showPane) return false;

  // Stands on the starter roof, a little ahead of Bob, scrolling with the world.
  const paneX = startPaneX(state);
  const paneY = START_PANE_Y;
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
  return hover;
}
