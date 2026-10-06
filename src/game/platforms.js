// src/game/platforms.js
// Roofs at run time: scrolling, rising and crumbling, stress, breaking and collapsing.
// New roofs come from game/generator.js.

import {
  BREAK_JUMP_GRACE_SEC,
  GROUND_Y,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  LATE_COLLAPSE_CUT,
  ROOF_COLLAPSE_TIME_EASY,
  ROOF_COLLAPSE_TIME_HARD,
  ROOF_FALL_GRAVITY,
} from "./constants.js";
import { clamp } from "../shared/math.js";
import { difficulty01, lateDifficulty01, rightmostPlatformX, spawnNextPlatform } from "./generator.js";

function easeInOut01(t) {
  // smoothstep
  return t * t * (3 - 2 * t);
}

export function scrollWorld(state, dt) {
  const dx = state.speed * dt;
  for (const p of state.platforms) p.x -= dx;
  if (Number.isFinite(state.startPromptX)) state.startPromptX -= dx;

  while (state.platforms.length > 0) {
    const first = state.platforms[0];
    if (first.x + first.w < -200) state.platforms.shift();
    else break;
  }

  while (rightmostPlatformX(state) < INTERNAL_WIDTH + 600) {
    spawnNextPlatform(state);
  }
}

export function updatePlatforms(state, dt) {
  const p = state.player;
  const d = difficulty01(state);

  const collapseTime =
    ROOF_COLLAPSE_TIME_EASY + (ROOF_COLLAPSE_TIME_HARD - ROOF_COLLAPSE_TIME_EASY) * d
    - LATE_COLLAPSE_CUT * lateDifficulty01(state);

  // Dive -> faster collapse tuning
  // - Holding S while on a roof accelerates stress gain.
  // - A heavy dive landing applies a one-time stress bump (not an instant break).
  const DIVE_STRESS_MULT = 2.25; // extra stress rate while S is held on a roof
  const HEAVY_BUMP_FRAC_EASY = 0.22; // fraction of collapseTime added on heavy landing (easy)
  const HEAVY_BUMP_FRAC_HARD = 0.34; // fraction of collapseTime added on heavy landing (hard)

  for (let i = 0; i < state.platforms.length; i++) {
    const plat = state.platforms[i];
    plat.prevY = plat.y; // roof top before this step's motion (player landing checks use it)
    const prevPlat = i > 0 ? state.platforms[i - 1] : null;
    const prevJustBroke = !!(
      prevPlat &&
      (prevPlat.breakTriggered || prevPlat.breaking || prevPlat.collapsing)
    );
    if (plat.collapsing) {
      plat.vy += ROOF_FALL_GRAVITY * dt;
      plat.y += plat.vy * dt;

      // While falling, lock motion/break so nothing jitters.
      plat.motion = "none";
      plat.motionArmed = false;
      plat.motionStarted = false;
      plat.motionT = 0;
      plat.breakT = 0;
      plat.breaking = false;
      plat.break01 = 0;

      continue;
    }

    if (plat.billboard) {
      const b = plat.billboard;
      if (b.breaking && !b.broken) {
        b.breakT += dt;
        if (b.breakT >= 0.28) {
          b.breaking = false;
          b.broken = true;
        }
      }
    }

    // Keep the starter platform rock solid: no cracks, motion, or collapse.
    if (plat.invulnerable) {
      plat.breaking = false;
      plat.breakTriggered = false;
      plat.breakArmed = false;
      plat.collapsing = false;
      plat.stress = 0;
      plat.crack01 = 0;
      plat.motion = "none";
      plat.motionArmed = false;
      plat.motionStarted = false;
      plat.motionT = 0;
      plat.motionRate = 0;
      plat.motionFromY = plat.baseY;
      plat.motionToY = plat.baseY;
      plat.y = plat.baseY;
      if (state.running && p.onGround && p.groundPlat === plat) {
        p.y = plat.y - p.h;
        p.vy = 0;
      }
      continue;
    }

    const ahead = plat.x - p.x;
    const inWindow = ahead > 40 && ahead < 520;
    const billboardedBreakable = !!(plat.billboard && plat.breakable);
    const lowSpawnBreakY = GROUND_Y - 50;

    // If a platform spawns too low (danger zone), break it once it comes into view.
    if (
      plat.breakable &&
      !billboardedBreakable &&
      plat.lowSpawnBreak &&
      inWindow &&
      !plat.breaking &&
      !prevJustBroke &&
      plat.motion !== "rise" &&
      plat.y >= lowSpawnBreakY
    ) {
      plat.lowSpawnBreak = false;
      plat.breakTriggered = true;
      plat.breaking = true;
      plat.break01 = 0;
      plat.breakT = 0;
      plat.crack01 = Math.max(plat.crack01, 0.65);
      plat.motion = "none";
      plat.motionArmed = false;
      plat.motionStarted = false;
      plat.motionT = 0;

      if (p.groundPlat === plat) {
        p.onGround = false;
        p.groundPlat = null;
        p.coyote = Math.max(p.coyote, 0.08);
      }
    }

    // Apply gentle rise/crumble motion (non-collapsing only).
    // Motion is ARMED on spawn but only STARTS once the player is airborne and the platform is approaching.
    if (plat.motion && plat.motion !== "none") {
      const yMin = 160;
      const yMax = GROUND_Y - 40;
      const lowBreakY = GROUND_Y - 160;

      // Start condition: player is in the air AND the platform is in the near-ahead window.
      // (Avoid surprising movement far away off-screen.)
      const airborne = !p.onGround;

      if (plat.motionArmed && !plat.motionStarted && airborne && inWindow) {
        plat.motionStarted = true;
        plat.motionT = 0;

        // For crumble, start at the resting height (baseY) until it begins.
        if (plat.motion === "crumble") {
          plat.motionFromY = plat.baseY;
          plat.y = plat.baseY;

          // Arm the break timer only after motion starts (so far-off platforms don’t break off-screen)
          plat.breakT = 0;
          plat.breakTriggered = false;
        }

        // For rise, platform should already be at motionFromY from spawn.
      }

      // If not started, keep its initial position stable (rise sits low; crumble sits at base).
      if (!plat.motionStarted) {
        if (plat.motion === "rise") {
          plat.y = clamp(plat.motionFromY, yMin, yMax);
        } else {
          plat.y = clamp(plat.baseY, yMin, yMax);
        }
      } else if (plat.motionT < 1) {
        // Advance motion
        plat.motionT = clamp(plat.motionT + plat.motionRate * dt, 0, 1);
        const e = easeInOut01(plat.motionT);
        let newY = plat.motionFromY + (plat.motionToY - plat.motionFromY) * e;
        newY = clamp(newY, yMin, yMax);

        // If we hit the clamp, finish motion to avoid jitter.
        if (newY === yMin || newY === yMax) {
          plat.motionT = 1;
        }

        plat.y = newY;

        // If the player is standing on this platform, keep them glued to the top.
        if (state.running && p.onGround && p.groundPlat === plat) {
          p.y = plat.y - p.h;
          p.vy = 0;
        }

        // If a crumble platform sinks near the lethal zone, force a break instead of going lower.
        if (
          plat.motion === "crumble" &&
          plat.motionStarted &&
          plat.breakable &&
          !billboardedBreakable &&
          !plat.breaking &&
          !plat.collapsing &&
          !prevJustBroke &&
          plat.y >= lowBreakY
        ) {
          plat.breakTriggered = true;
          plat.breaking = true;
          plat.break01 = 0;
          plat.breakT = 0;
          plat.crack01 = Math.max(plat.crack01, 0.65);
        }

        // When motion completes, lock the resting baseY to the final position.
        if (plat.motionT >= 1) {
          plat.baseY = plat.y;
        }

        // If this is a CRUMBLE platform with break armed, let it fully break while you're mid-air.
        // We only trigger once the crumble is mostly visible and only while the player is airborne,
        // to avoid unfair breaks under a standing player.
        if (
          plat.motion === "crumble" &&
          plat.motionStarted &&
          plat.breakable &&
          !billboardedBreakable &&
          !plat.breakTriggered &&
          !prevJustBroke &&
          plat.breakArmed
        ) {
          const airborneNow = !p.onGround;
          if (airborneNow) {
            // Delay break if the player is still close enough to plausibly land on it.
            const playerLeft = p.x;
            const playerRight = p.x + p.w;
            const aheadEdge = plat.x - playerRight;
            const passed = playerLeft > plat.x + plat.w;
            const safeToBreak = passed || aheadEdge > 90;

            // Start counting once the crumble is underway.
            const visibleCrumble = plat.motionT >= 0.55;
            // Only allow break if the crumble sinks too low.
            if (visibleCrumble && safeToBreak && plat.y >= lowBreakY) {
              plat.breakT += dt;
              if (plat.breakT >= plat.breakDelay) {
                // Instead of collapsing immediately, start breaking animation
                plat.breakTriggered = true;
                plat.breaking = true;
                plat.break01 = 0;
                plat.breakT = 0; // reuse as breaking timer
                plat.crack01 = Math.max(plat.crack01, 0.65);
              }
            }
          }
        }

      }
    }

    // Advance breaking animation and trigger collapse when done.
    if (plat.breakable && plat.breaking === true && plat.collapsing !== true) {
      plat.breakT += dt;
      const BREAK_ANIM_SEC = 0.45; // long enough for the cracks to read before it drops
      plat.break01 = clamp(plat.breakT / BREAK_ANIM_SEC, 0, 1);
      plat.crack01 = Math.max(plat.crack01, 0.65 + 0.35 * plat.break01);

      if (plat.break01 >= 1) {
        plat.collapsing = true;
        plat.vy = 0;
        plat.crack01 = 1;

        // Freeze motion so it doesn't fight the fall.
        plat.motion = "none";
        plat.motionArmed = false;
        plat.motionStarted = false;
        plat.motionT = 0;
        plat.baseY = plat.y;
        plat.motionFromY = plat.y;
        plat.motionToY = plat.y;
        plat.motionRate = 0;

        plat.breaking = false;

        // If somehow the player is on it, drop them with a small grace.
        if (p.groundPlat === plat) {
          p.onGround = false;
          p.groundPlat = null;
          p.coyote = Math.max(p.coyote, 0.08);
          p.breakGrace = Math.max(p.breakGrace, BREAK_JUMP_GRACE_SEC);
          p.breakJumpEligible = true;
        }
      }
    }

    // Stress only the roof you're currently standing on.
    if (plat.breakable && state.running && p.onGround && p.groundPlat === plat) {
      // Base stress rate
      let add = dt;

      // Dive mode (one-press latch) accelerates cracking.
      // This makes dive landings "burn" roofs faster without instantly breaking them.
      if (p.diving === true) {
        add += dt * DIVE_STRESS_MULT;
      }

      plat.stress += add;

      // One-time heavy landing bump (set by game logic via state.heavyLandT)
      // Apply only once per platform so you can't farm bumps by lingering.
      if ((state.heavyLandT || 0) > 0 && !plat.heavyBumped) {
        const bumpFrac = HEAVY_BUMP_FRAC_EASY + (HEAVY_BUMP_FRAC_HARD - HEAVY_BUMP_FRAC_EASY) * d;
        plat.stress += collapseTime * bumpFrac;
        plat.heavyBumped = true;
      }
    }

    if (!plat.breakable) {
      plat.stress = 0;
      plat.crack01 = 0;
      plat.breaking = false;
      plat.breakTriggered = false;
      plat.breakArmed = false;
      plat.breakT = 0;
      plat.break01 = 0;
    } else {
      // Cracks follow stress, but a roof that's breaking keeps the cracks its break gave it
      // (otherwise this reset them to 0 every step and it fell away uncracked).
      const stressCrack = clamp(plat.stress / collapseTime, 0, 1);
      plat.crack01 = plat.breakTriggered ? Math.max(stressCrack, plat.crack01) : stressCrack;
    }

    if (plat.breakable && plat.stress >= collapseTime) {
      plat.collapsing = true;
      plat.vy = 0;
      plat.crack01 = 1;

      plat.heavyBumped = false;

      // Freeze motion so it doesn't fight the fall.
      plat.motion = "none";
      plat.motionArmed = false;
      plat.motionStarted = false;
      plat.motionT = 0;
      plat.baseY = plat.y;
      plat.motionFromY = plat.y;
      plat.motionToY = plat.y;
      plat.motionRate = 0;

      if (p.groundPlat === plat) {
        p.onGround = false;
        p.groundPlat = null;
        p.coyote = Math.max(p.coyote, 0.06);
        p.breakGrace = Math.max(p.breakGrace, BREAK_JUMP_GRACE_SEC);
        p.breakJumpEligible = true;
      }
    }
  }

  for (let i = state.platforms.length - 1; i >= 0; i--) {
    const plat = state.platforms[i];
    if (plat.collapsing && plat.y > INTERNAL_HEIGHT + 500) {
      state.platforms.splice(i, 1);
    }
  }
}
