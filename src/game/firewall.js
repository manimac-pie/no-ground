// src/game/firewall.js
// The START firewall: the glass pane on the starter roof that Bob smashes to begin a run.
// Its size and place live here, so the game (the smash, clicks on START) and the renderer
// (render/menu.js) agree on where it is.

import { GROUND_Y, SAFE_CLEARANCE } from "./constants.js";

export const START_PANE_W = 100; // world px
export const START_PANE_H = 42;  // world px; a bit taller than Bob
export const START_PANE_Y = GROUND_Y - SAFE_CLEARANCE - START_PANE_H; // stands on the starter roof

// Bob's drawn body ends short of his hitbox: the capsule is 70% of his width, centred
// (render/player/body.js), so its front is at 85% of the hitbox width.
const BOB_FRONT_FRAC = 0.85;

// The pane's left edge in world px: a little ahead of Bob, scrolling with the world.
export function startPaneX(state) {
  if (Number.isFinite(state.startPromptX)) return state.startPromptX;
  const p = state.player || {};
  return (Number.isFinite(p.x) ? p.x : 160) + (Number.isFinite(p.w) ? p.w : 34) + 24;
}

// Smash the pane once Bob's drawn front touches the glass (not his wider hitbox).
// `hovered`: the pointer is over the pane (render/menu.js reports it), which shatters it red.
export function checkStartSmash(state, hovered) {
  if (state.gameOver || state.menuSmashBroken || state.menuSmashActive) return;
  const p = state.player;
  if (!p) return;

  const paneX = startPaneX(state);
  const front = p.x + p.w * BOB_FRONT_FRAC;
  const hit =
    front >= paneX &&
    p.x < paneX + START_PANE_W &&
    p.y < START_PANE_Y + START_PANE_H &&
    p.y + p.h > START_PANE_Y;
  if (!hit) return;

  state.menuSmashActive = true;
  state.menuSmashBroken = true;
  state.menuSmashT = 0;
  state.menuSmashRed = hovered === true;
  // Impact point on the pane: Bob's front, at his middle height.
  state.menuSmashImpact = {
    x: Math.min(START_PANE_W, Math.max(0, front - paneX)),
    y: Math.min(START_PANE_H, Math.max(0, p.y + p.h / 2 - START_PANE_Y)),
  };
}
