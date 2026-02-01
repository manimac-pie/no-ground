// src/game/tricks.js

import {
  SPIN_DURATION,
  SPIN_COOLDOWN,
} from "./constants.js";
import { clamp } from "./utils.js";

export function startSpin(state, intent = "neutral") {
  const p = state.player;

  // Diving cancels tricks and should not allow new ones until after landing.
  if (p.diving === true) return false;

  if (p.onGround) return false;
  if (p.spinning) return false;
  if (p.spinCooldown > 0) return false;

  // Flip-only mapping (A = backflip):
  // - "backflip" => flip, dir -1
  // Anything else: default to a simple spin (dir alternates).
  const i = intent || "neutral";
  p.spinning = true;
  p.spinT = SPIN_DURATION;
  p.spinProg = 0;
  p.trickIntent = i;

  if (i === "backflip") {
    p.trickKind = "flip";
    p.spinDir = -1;
    if (!Number.isFinite(state.backflipCount)) state.backflipCount = 0;
    state.backflipCount += 1;
  } else {
    p.trickKind = "spin";
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
