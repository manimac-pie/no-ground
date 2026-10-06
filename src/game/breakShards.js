// src/game/breakShards.js
// Bob breaking up on the lethal ground: shards thrown out from the impact, pulled by gravity and drag.
// His wheel pops off and some screws shake loose too. Those land: they bounce on the ground, roll to a
// stop and stay there (left behind when the claw drags Bob away) until the next run.
// They're spawned and moved here, in the game update, at the fixed 60 Hz step (DRAG is applied once
// per step, so it's only right at a fixed step). render/effects.js only draws them.

import { BREAK_SHARDS, GROUND_Y } from "./constants.js";

// A landed piece stops bouncing once it hits the ground slower than this (px/s).
const SETTLE_VY = 90;

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
      kind: i % 3 === 0 ? "spark" : "plate",
    });
  }

  // Screws and nuts: a low fan up and out, so they land near Bob.
  for (let i = 0; i < BREAK_SHARDS.SCREW_COUNT; i++) {
    const nut = i % 3 === 2;
    const ang = -Math.PI * (0.12 + 0.76 * Math.random());
    const speed = 160 + Math.random() * 220;
    state.breakShards.push({
      x: base.x + (Math.random() - 0.5) * p.w * 0.5,
      y: base.y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 30,
      r: nut ? 1.5 : 1, // half its height lying flat: what rests on the ground
      life: Infinity,
      bounce: BREAK_SHARDS.SCREW_BOUNCE,
      kind: nut ? "nut" : "screw",
    });
  }

  // The wheel: pops off forward from under him. Same size as the wheel drawn in render/player/body.js.
  const r = Math.max(6, p.w * 0.70 * 0.22);
  state.breakShards.push({
    x: base.x,
    y: Math.min(p.y + p.h - 1, GROUND_Y - r),
    vx: BREAK_SHARDS.WHEEL_POP_VX * (0.85 + Math.random() * 0.3),
    vy: -BREAK_SHARDS.WHEEL_POP_VY * (0.9 + Math.random() * 0.2),
    rot: 0,
    vr: 14,
    r,
    life: Infinity,
    bounce: BREAK_SHARDS.WHEEL_BOUNCE,
    kind: "wheel",
  });
}

// Move the shards one step, and drop the ones that have faded out.
export function updateBreakShards(state, dt) {
  const shards = state.breakShards;
  if (!Array.isArray(shards) || shards.length === 0) return;

  let alive = 0;
  for (const s of shards) {
    if (!s) continue;
    s.vy += BREAK_SHARDS.GRAVITY * dt;
    if (!s.bounce) {
      s.vx *= BREAK_SHARDS.DRAG;
      s.vy *= BREAK_SHARDS.DRAG;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.bounce) landPiece(s, dt);
    s.rot += (s.vr || 0) * dt;
    s.life -= dt;
    if (s.life > 0) shards[alive++] = s; // compact in place, keeping the order
  }
  shards.length = alive;
}

// The wheel, a screw or a nut: bounce on the ground, then roll or lie still. Like Bob below a roof,
// they're in front of the buildings, so walls don't stop them.
function landPiece(s, dt) {
  const r = s.r;
  if (s.y + r < GROUND_Y) return; // still in the air
  s.y = GROUND_Y - r;
  if (s.vy > SETTLE_VY) {
    s.vy = -s.vy * s.bounce;
    s.vx *= 0.8;
    s.vr *= 0.6;
    return;
  }

  // On the ground.
  s.vy = 0;
  const wheel = s.kind === "wheel";
  s.vx *= Math.exp(-(wheel ? BREAK_SHARDS.ROLL_FRICTION : BREAK_SHARDS.SLIDE_FRICTION) * dt);
  if (Math.abs(s.vx) < 4) s.vx = 0;
  if (wheel) {
    s.vr = s.vx / r; // rolls without slipping
  } else {
    // Screws and nuts slide to a stop lying flat.
    s.vr = 0;
    const flat = Math.round(s.rot / Math.PI) * Math.PI;
    s.rot += (flat - s.rot) * Math.min(1, 18 * dt);
  }
}
