// src/game/platforms.js

import {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  GROUND_Y,
  PLATFORM_H,
  SAFE_CLEARANCE,
  PLATFORM_MIN_W,
  PLATFORM_MAX_W,
  GAP_MIN,
  GAP_MAX_EASY,
  GAP_MAX_HARD,
  HEIGHT_LEVELS,
  MAX_PLATFORM_STEP,
  ROOF_COLLAPSE_TIME_EASY,
  ROOF_COLLAPSE_TIME_HARD,
  ROOF_FALL_GRAVITY,
  GRAVITY,
  FALL_GRAVITY_MULT,
  JUMP_VELOCITY,
  SPEED_START,
} from "./constants.js";
import { clamp, randRange, pick } from "./utils.js";

function easeInOut01(t) {
  // smoothstep
  return t * t * (3 - 2 * t);
}

function fairGapMax(state, fromY, toY) {
  const v0 = JUMP_VELOCITY;
  const gUp = GRAVITY;
  const gDown = GRAVITY * FALL_GRAVITY_MULT;
  if (!Number.isFinite(v0) || !Number.isFinite(gUp) || gUp <= 0) return Infinity;

  const h = (v0 * v0) / (2 * gUp);
  const dy = toY - fromY;
  if (dy < -h) return 0;

  const tUp = -v0 / gUp;
  const distDown = h + dy;
  const tDown = Math.sqrt((2 * Math.max(0, distDown)) / Math.max(1, gDown));
  const tLand = tUp + tDown;
  const speed = Number.isFinite(state?.speed) ? state.speed : SPEED_START;

  return Math.max(0, speed * tLand * 0.9);
}

export function rightmostPlatformX(state) {
  let best = -Infinity;
  for (const p of state.platforms) best = Math.max(best, p.x + p.w);
  return best;
}

export function difficulty01(state) {
  return clamp(state.distance / 10000, 0, 1);
}

export function spawnNextPlatform(state) {
  const d = difficulty01(state);
  const lastRight = rightmostPlatformX(state);

  const gapMax = GAP_MAX_EASY + (GAP_MAX_HARD - GAP_MAX_EASY) * d;

  // Occasionally enforce a float/dive requirement by shaping gap + height.
  state._nextAirReq = state._nextAirReq ?? "none"; // "none" | "float" | "dive"
  state._nextAirReqDist = state._nextAirReqDist ?? 0;

  const wantReq = state.distance > state._nextAirReqDist;
  if (wantReq && state._nextAirReq === "none") {
    const chance = 0.10 + 0.18 * d;
    if (Math.random() < chance) {
      state._nextAirReq = Math.random() < 0.5 ? "float" : "dive";
    }
  }

  let gap = randRange(GAP_MIN, gapMax);

  const wMin = PLATFORM_MIN_W + 10 * d;
  const wMax = PLATFORM_MAX_W + 20 * d;
  const w = randRange(wMin, wMax);

  const baseY = GROUND_Y - SAFE_CLEARANCE;

  const levels = d < 0.35 ? [0, 30] : HEIGHT_LEVELS;
  const level = d < 0.15 ? 0 : pick(levels);

  let y = baseY - level;

  const prev = state.platforms.length ? state.platforms[state.platforms.length - 1] : null;
  const prevY = prev && Number.isFinite(prev.baseY) ? prev.baseY : prev?.y;
  if (prev) {
    const step = MAX_PLATFORM_STEP + d * 50;
    y = clamp(y, prevY - step, prevY + step);
  }

  y = clamp(y, 180, GROUND_Y - 40);

  if (prev && state._nextAirReq !== "none") {
    const prevY = Number.isFinite(prev.baseY) ? prev.baseY : prev.y;
    if (state._nextAirReq === "float") {
      // Longer gap + mild drop: float extends airtime to reach the far platform.
      gap = randRange(gapMax * 0.78, gapMax * 0.98);
      y = clamp(prevY + 8 + 10 * Math.random(), 190, GROUND_Y - 60);
    } else if (state._nextAirReq === "dive") {
      // Shorter gap + steep drop: dive accelerates descent to catch the low platform.
      gap = randRange(GAP_MIN + 10, GAP_MIN + 50);
      y = clamp(prevY + 90 + 80 * Math.random(), 220, GROUND_Y - 34);
    }

    // Set next requirement distance so this doesn't chain too often.
    state._nextAirReq = "none";
    state._nextAirReqDist = state.distance + 650 + 520 * Math.random();
  }

  if (prev && Number.isFinite(prevY)) {
    const maxFair = fairGapMax(state, prevY, y);
    const cap = Math.min(gapMax, Number.isFinite(maxFair) ? maxFair : gapMax);
    gap = clamp(gap, GAP_MIN, cap);
  }

  // Dynamic rooftops: some platforms rise up (from below) or crumble (sink) while you're mid-air.
  // We *arm* motion on spawn, but we only *start* it once the player is airborne and the platform is approaching.
  const motionChance = 0.10 + 0.18 * d; // ramps with difficulty
  const hasMotion = Math.random() < motionChance;
  const motionKind = hasMotion ? (Math.random() < 0.5 ? "rise" : "crumble") : "none";

  // Some CRUMBLE platforms will fully "break" (fall away) while you're mid-air.
  // This is distinct from roof stress collapse (standing too long).
  const breakChance = (motionKind === "crumble") ? (0.16 + 0.22 * d) : 0;
  const prevBreakArmed = !!(prev && prev.breakArmed);
  const breakArmed = !prevBreakArmed && Math.random() < breakChance;

  // How quickly the break triggers once the platform starts crumbling (seconds-ish)
  const breakDelay = breakArmed ? (0.22 + 0.32 * Math.random()) : 0;

  // Amplitude in px
  const amp = hasMotion ? (18 + 44 * (0.35 + 0.65 * d) * Math.random()) : 0;

  // How quickly it reaches the target (seconds-ish)
  const motionRate = hasMotion ? (0.65 + 0.95 * Math.random()) : 0;

  // For fairness, platforms never go too close to lethal ground.
  const yMin = 160;
  const yMax = GROUND_Y - 40;
  const lowSpawnBreakY = GROUND_Y - 50;

  // Motion path:
  // - "rise": start lower (closer to ground), move up to the resting baseY
  // - "crumble": start at baseY, sink downward by amp
  const baseYRest = y;
  const fromY = motionKind === "rise"
    ? clamp(baseYRest + amp, yMin, yMax)
    : baseYRest;
  const toY = motionKind === "crumble"
    ? clamp(baseYRest + amp, yMin, yMax)
    : baseYRest;

  // Apply initial y for the rise case so it visually “comes up from below”.
  if (motionKind === "rise") {
    y = fromY;
  }

  state.platforms.push({
    x: lastRight + gap,
    y,
    w,
    h: PLATFORM_H,
    invulnerable: false,

    // Motion state (armed on spawn; starts when player is airborne and the platform is approaching)
    baseY: baseYRest, // resting Y (where collision should be once motion completes)
    motion: motionKind, // "rise" | "crumble" | "none"
    motionArmed: hasMotion,
    motionStarted: false,
    motionT: 0,
    motionRate,
    motionFromY: fromY,
    motionToY: toY,
    lowSpawnBreak: baseYRest >= lowSpawnBreakY,

    // Break state (for some crumble platforms)
    breakArmed,
    breakDelay,
    breakT: 0,
    breakTriggered: false,
    breaking: false,
    break01: 0,

    // Collapse state
    heavyBumped: false,
    stress: 0,
    crack01: 0,
    collapsing: false,
    vy: 0,
  });
}

export function resetPlatforms(state) {
  state.platforms.length = 0;

  const startY = GROUND_Y - SAFE_CLEARANCE;

  state.platforms.push({
    x: 0,
    y: startY,
    // Extra-long initial stretch so Bob and the start text stay on solid building while zooming.
    w: INTERNAL_WIDTH * 1.35,
    h: PLATFORM_H,
    invulnerable: true,

    // Motion (none for start)
    baseY: startY,
    motion: "none",
    motionArmed: false,
    motionStarted: false,
    motionT: 0,
    motionRate: 0,
    motionFromY: startY,
    motionToY: startY,

    // Break state
    breakArmed: false,
    breakDelay: 0,
    breakT: 0,
    breakTriggered: false,
    breaking: false,
    break01: 0,

    // Collapse state
    heavyBumped: false,
    stress: 0,
    crack01: 0,
    collapsing: false,
    vy: 0,
  });

  while (rightmostPlatformX(state) < INTERNAL_WIDTH + 600) {
    spawnNextPlatform(state);
  }

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
    ROOF_COLLAPSE_TIME_EASY + (ROOF_COLLAPSE_TIME_HARD - ROOF_COLLAPSE_TIME_EASY) * d;

  // Dive -> faster collapse tuning
  // - Holding S while on a roof accelerates stress gain.
  // - A heavy dive landing applies a one-time stress bump (not an instant break).
  const DIVE_STRESS_MULT = 2.25; // extra stress rate while S is held on a roof
  const HEAVY_BUMP_FRAC_EASY = 0.22; // fraction of collapseTime added on heavy landing (easy)
  const HEAVY_BUMP_FRAC_HARD = 0.34; // fraction of collapseTime added on heavy landing (hard)

  for (let i = 0; i < state.platforms.length; i++) {
    const plat = state.platforms[i];
    const prevPlat = i > 0 ? state.platforms[i - 1] : null;
    const prevJustBroke = !!(prevPlat && (prevPlat.breakTriggered || prevPlat.breaking));
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

    // Ensure defaults (older platforms won’t crash if they lack new fields)
    if (typeof plat.breakArmed !== "boolean") plat.breakArmed = false;
    if (!Number.isFinite(plat.breakDelay)) plat.breakDelay = 0;
    if (!Number.isFinite(plat.breakT)) plat.breakT = 0;
    if (typeof plat.breakTriggered !== "boolean") plat.breakTriggered = false;
    if (typeof plat.breaking !== "boolean") plat.breaking = false;
    if (!Number.isFinite(plat.break01)) plat.break01 = 0;
    if (typeof plat.lowSpawnBreak !== "boolean") plat.lowSpawnBreak = false;
    if (typeof plat.invulnerable !== "boolean") plat.invulnerable = false;

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
      plat.baseY = Number.isFinite(plat.baseY) ? plat.baseY : plat.y;
      plat.motionFromY = plat.baseY;
      plat.motionToY = plat.baseY;
      plat.y = plat.baseY;
      if (state.running && p.onGround && p.groundPlat === plat) {
        p.y = plat.y - p.h;
        p.vy = 0;
      }
      continue;
    }

    const px = p ? p.x : 0;
    const ahead = plat.x - px;
    const inWindow = ahead > 40 && ahead < 520;
    const lowSpawnBreakY = GROUND_Y - 50;

    // If a platform spawns too low (danger zone), break it once it comes into view.
    if (
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
      plat.crack01 = Math.max(plat.crack01 ?? 0, 0.65);
      plat.motion = "none";
      plat.motionArmed = false;
      plat.motionStarted = false;
      plat.motionT = 0;

      if (p && p.groundPlat === plat) {
        p.onGround = false;
        p.groundPlat = null;
        p.coyote = Math.max(p.coyote ?? 0, 0.08);
      }
    }

    // Apply gentle rise/crumble motion (non-collapsing only).
    // Motion is ARMED on spawn but only STARTS once the player is airborne and the platform is approaching.
    if (plat.motion && plat.motion !== "none") {
      const yMin = 160;
      const yMax = GROUND_Y - 40;
      const lowBreakY = GROUND_Y - 160;

      // Ensure defaults (older platforms won’t crash if they lack new fields)
      if (!Number.isFinite(plat.baseY)) plat.baseY = plat.y;
      if (!Number.isFinite(plat.motionFromY)) plat.motionFromY = plat.y;
      if (!Number.isFinite(plat.motionToY)) plat.motionToY = plat.baseY;
      if (typeof plat.motionArmed !== "boolean") plat.motionArmed = false;
      if (typeof plat.motionStarted !== "boolean") plat.motionStarted = plat.motionT > 0;
      if (!Number.isFinite(plat.motionT)) plat.motionT = plat.motionStarted ? plat.motionT : 0;

      // Start condition: player is in the air AND the platform is in the near-ahead window.
      // (Avoid surprising movement far away off-screen.)
      const airborne = !(p && p.onGround);
      const inWindow = ahead > 40 && ahead < 520; // tune window as desired

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
          !plat.breaking &&
          !plat.collapsing &&
          !prevJustBroke &&
          plat.y >= lowBreakY
        ) {
          plat.breakTriggered = true;
          plat.breaking = true;
          plat.break01 = 0;
          plat.breakT = 0;
          plat.crack01 = Math.max(plat.crack01 ?? 0, 0.65);
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
          !plat.breakTriggered &&
          !prevJustBroke &&
          plat.breakArmed
        ) {
          const airborneNow = !(p && p.onGround);
          if (airborneNow) {
            // Delay break if the player is still close enough to plausibly land on it.
            const playerLeft = p ? p.x : 0;
            const playerRight = p ? p.x + p.w : 0;
            const aheadEdge = plat.x - playerRight;
            const passed = playerLeft > plat.x + plat.w;
            const safeToBreak = passed || aheadEdge > 90;

            // Start counting once the crumble is underway.
            const visibleCrumble = plat.motionT >= 0.55;
            if (visibleCrumble && safeToBreak) {
              plat.breakT += dt;
              if (plat.breakT >= plat.breakDelay) {
                // Instead of collapsing immediately, start breaking animation
                plat.breakTriggered = true;
                plat.breaking = true;
                plat.break01 = 0;
                plat.breakT = 0; // reuse as breaking timer
                plat.crack01 = Math.max(plat.crack01 ?? 0, 0.65);
              }
            }
          }
        }

      }
    }

    // Advance breaking animation and trigger collapse when done.
    if (plat.breaking === true && plat.collapsing !== true) {
      plat.breakT += dt;
      const BREAK_ANIM_SEC = 0.22;
      plat.break01 = clamp(plat.breakT / BREAK_ANIM_SEC, 0, 1);
      plat.crack01 = Math.max(plat.crack01 ?? 0, 0.65 + 0.35 * plat.break01);

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
        if (p && p.groundPlat === plat) {
          p.onGround = false;
          p.groundPlat = null;
          p.coyote = Math.max(p.coyote ?? 0, 0.08);
        }
      }
    }

    // Stress only the roof you're currently standing on.
    if (state.running && p.onGround && p.groundPlat === plat) {
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

    plat.crack01 = clamp(plat.stress / collapseTime, 0, 1);

    if (plat.stress >= collapseTime) {
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
