// src/game/breakShards.js
// Bob breaking up on the lethal ground: shards thrown out from the impact, pulled by gravity and drag.
// They're spawned and moved here, in the game update, at the fixed 60 Hz step (DRAG is applied once
// per step, so it's only right at a fixed step). render/effects.js only draws them.

import { BREAK_SHARDS } from "./constants.js";

export function spawnBreakShards(state, p) {
  state.breakShards = [];
  if (!p) return;
  const base = {
    x: p.x + p.w / 2,
    y: p.y + p.h * 0.7,
  };
  for (let i = 0; i < BREAK_SHARDS.COUNT; i++) {
    const ang = (Math.PI * 2 * i) / BREAK_SHARDS.COUNT + Math.random() * 0.9;
    const speed = 220 + Math.random() * 320 + Math.abs(p.vy || 0) * 0.18;
    state.breakShards.push({
      x: base.x,
      y: base.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - Math.abs(p.vy || 0) * 0.5,
      rot: (Math.random() - 0.5) * 0.9,
      vr: (Math.random() - 0.5) * 8,
      w: 4 + Math.random() * 10,
      h: 3 + Math.random() * 8,
      life: BREAK_SHARDS.LIFE,
      kind: i % 5 === 0 ? "spark" : i % 2 === 0 ? "plate" : "chip",
    });
  }
}

// Move the shards one step, and drop the ones that have faded out.
export function updateBreakShards(state, dt) {
  const shards = state.breakShards;
  if (!Array.isArray(shards) || shards.length === 0) return;

  let alive = 0;
  for (const s of shards) {
    if (!s) continue;
    s.vy += BREAK_SHARDS.GRAVITY * dt;
    s.vx *= BREAK_SHARDS.DRAG;
    s.vy *= BREAK_SHARDS.DRAG;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += (s.vr || 0) * dt;
    s.life -= dt;
    if (s.life > 0) shards[alive++] = s; // compact in place, keeping the order
  }
  shards.length = alive;
}
