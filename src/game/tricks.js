// src/game/tricks.js

import {
  SPIN_DURATION,
  SPIN_COOLDOWN,
  GATE_SPAWN_CHANCE_EASY,
  GATE_SPAWN_CHANCE_HARD,
  GATE_W,
  GATE_H,
  GROUND_Y,
} from "./constants.js";
import { clamp, pick, trickFromIntent, aabbOverlap } from "./utils.js";
import { difficulty01 } from "./platforms.js";

// Gate spacing to prevent stacked labels/overlaps
const GATE_MIN_DX = 220; // minimum horizontal spacing between gates
const GATE_MIN_DY = 80;  // minimum vertical separation when x is close

export function startSpin(state, intent = "neutral") {
  const p = state.player;

  // Diving cancels tricks and should not allow new ones until after landing.
  if (p.diving === true) return false;

  if (p.onGround) return false;
  if (p.spinning) return false;
  if (p.spinCooldown > 0) return false;

  const info = trickFromIntent(intent);

  p.spinning = true;
  p.spinT = SPIN_DURATION;
  p.spinProg = 0;

  p.trickKind = info.kind;
  p.trickIntent = intent || "neutral";

  if (info.kind === "corkscrew") {
    p.spinDir = info.dir;
  } else {
    p.spinDir = p.spinDir === 1 ? -1 : 1;
  }

  p.spinCooldown = SPIN_DURATION + SPIN_COOLDOWN;
  return true;
}

export function updateTricks(state, dt) {
  const p = state.player;

  // Safety: if dive mode is active, ensure trick state is cleared.
  if (p.diving === true) {
    p.spinning = false;
    p.spinT = 0;
    p.spinProg = 0;
    return;
  }

  if (p.spinCooldown > 0) p.spinCooldown = Math.max(0, p.spinCooldown - dt);

  if (p.spinning) {
    p.spinT = Math.max(0, p.spinT - dt);
    p.spinProg = clamp(p.spinProg + dt / SPIN_DURATION, 0, 1);

    if (p.spinT <= 0) {
      p.spinning = false;
      p.spinT = 0;
      // keep spinProg for clean/perfect on landing
    }
  }
}

export function maybeSpawnGateAhead(state) {
  // Simple spawn cooldown: keep gates from appearing back-to-back.
  // Uses a dynamic property on state (no schema change required).
  state._nextGateDist = state._nextGateDist ?? 0;
  if (state.distance < state._nextGateDist) return;

  const d = difficulty01(state);
  const chance = GATE_SPAWN_CHANCE_EASY + (GATE_SPAWN_CHANCE_HARD - GATE_SPAWN_CHANCE_EASY) * d;
  if (Math.random() > chance) return;

  const ref = state.platforms.length ? state.platforms[state.platforms.length - 1] : null;
  if (!ref) return;

  // Current available trick kinds (A/D triggers corkscrew; neutral triggers spin).
  // W/S are reserved for float/dive and are not trick intents.
  const reqPool = ["spin", "corkscrew"];
  const requiredKind = (d > 0.45 && Math.random() < 0.62) ? "corkscrew" : pick(reqPool);

  const gx = ref.x + ref.w * (0.25 + 0.50 * Math.random());
  const gy = clamp(ref.y - 70 - 35 * Math.random(), 130, GROUND_Y - 140);

  // Don't spawn if too close to an existing upcoming gate (prevents stacked UI boxes).
  for (const existing of state.gates) {
    // Only consider gates that are still ahead/nearby (ignore those far behind).
    if (existing.x + existing.w < state.player.x - 40) continue;

    const dx = Math.abs(existing.x - gx);
    const dy = Math.abs(existing.y - gy);

    if (dx < GATE_MIN_DX && dy < GATE_MIN_DY) {
      return;
    }
  }

  // After placing a gate, wait a bit before allowing another spawn.
  state._nextGateDist = state.distance + 320 + 260 * Math.random();

  state.gates.push({
    x: gx,
    y: gy,
    w: GATE_W,
    h: GATE_H,
    requiredKind,
    hit: false,
    missed: false,
  });
}

export function checkGates(state) {
  if (state.gameOver || !state.gates.length) return;

  const px = state.player.x;
  const py = state.player.y;
  const pw = state.player.w;
  const ph = state.player.h;

  for (const g of state.gates) {
    if (g.hit || g.missed) continue;

    if (g.x + g.w < px - 6) {
      g.missed = true;
      continue;
    }

    if (aabbOverlap(px, py, pw, ph, g.x, g.y, g.w, g.h)) {
      const ok = state.player.spinning && state.player.trickKind === g.requiredKind;
      if (ok) {
        g.hit = true;
        const bonus = 40 + state.styleCombo * 10;
        state.styleScore += bonus;
        state.styleCombo += 1;
      } else {
        g.missed = true;
      }
    }
  }
}