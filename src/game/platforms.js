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
  PLAYER_H,
  BILLBOARD_FIRST_AT,
  BILLBOARD_SPACING_EASY,
  BILLBOARD_SPACING_HARD,
  BILLBOARD_INTRO,
  BILLBOARD_WEIGHTS_EASY,
  BILLBOARD_WEIGHTS_HARD,
  BILLBOARD_REPEAT_DAMP,
  LOW_BILLBOARD_LEAD_SEC,
  SPEED_START,
  BREAK_JUMP_GRACE_SEC,
} from "./constants.js";
import { clamp } from "../shared/math.js";
import { randRange, pick } from "./utils.js";

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

// ---------------- billboard director ----------------
// Billboards are placed by distance along the level, not by building count, so they don't fall
// into a fixed rhythm. The gap to the next one shrinks with difficulty. The first three teach one
// lesson each (BILLBOARD_INTRO); after that the kind is a weighted pick that leans toward low
// billboards as the run gets harder, with the kind just used damped so the same kind rarely repeats.
// A roof that can't carry one fairly (moving roof, the landing of a forced dive/slowfall gap)
// pushes it to the next building instead of skipping it.

function lerpRange(easy, hard, d) {
  const lo = easy[0] + (hard[0] - easy[0]) * d;
  const hi = easy[1] + (hard[1] - easy[1]) * d;
  return randRange(lo, hi);
}

function pickBillboardKind(state, d) {
  const n = state._bbCount || 0;
  if (n < BILLBOARD_INTRO.length) return BILLBOARD_INTRO[n];
  const weights = {};
  let total = 0;
  for (const kind of Object.keys(BILLBOARD_WEIGHTS_EASY)) {
    let wt = BILLBOARD_WEIGHTS_EASY[kind] + (BILLBOARD_WEIGHTS_HARD[kind] - BILLBOARD_WEIGHTS_EASY[kind]) * d;
    if (kind === state._bbLastKind) wt *= BILLBOARD_REPEAT_DAMP;
    weights[kind] = wt;
    total += wt;
  }
  let r = Math.random() * total;
  for (const kind of Object.keys(weights)) {
    r -= weights[kind];
    if (r <= 0) return kind;
  }
  return "high-glass";
}

export function spawnNextPlatform(state) {
  const d = difficulty01(state);
  const lastRight = rightmostPlatformX(state);

  const gapMax = GAP_MAX_EASY + (GAP_MAX_HARD - GAP_MAX_EASY) * d;

  // Occasionally enforce a slowfall/dive requirement by shaping gap + height.
  state._nextAirReq = state._nextAirReq ?? "none"; // "none" | "slowfall" | "dive"
  state._nextAirReqDist = state._nextAirReqDist ?? 0;

  const wantReq = state.distance > state._nextAirReqDist;
  if (wantReq && state._nextAirReq === "none") {
    const chance = 0.10 + 0.18 * d;
    if (Math.random() < chance) {
      state._nextAirReq = Math.random() < 0.5 ? "slowfall" : "dive";
    }
  }

  let gap = randRange(GAP_MIN, gapMax);

  const wMin = PLATFORM_MIN_W + 10 * d;
  const wMax = PLATFORM_MAX_W + 20 * d;
  let w = randRange(wMin, wMax);

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

  let airReqLanding = false; // this roof is the landing of a forced slowfall/dive gap
  if (prev && state._nextAirReq !== "none") {
    airReqLanding = true;
    const prevY = Number.isFinite(prev.baseY) ? prev.baseY : prev.y;
    if (state._nextAirReq === "slowfall") {
      // Longer gap + mild drop: slowfall extends airtime to reach the far platform.
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
  // Where this roof starts along the level (px), for billboard spacing.
  const worldLeft = (Number.isFinite(state._worldRight) ? state._worldRight : 0) + gap;
  state._worldRight = worldLeft + w;

  // Dynamic rooftops: some platforms rise up (from below) or crumble (sink) while you're mid-air.
  // We *arm* motion on spawn, but we only *start* it once the player is airborne and the platform is approaching.
  const motionChance = 0.10 + 0.18 * d; // ramps with difficulty
  const hasMotion = Math.random() < motionChance;
  const motionKind = hasMotion ? (Math.random() < 0.5 ? "rise" : "crumble") : "none";

  const breakableChance = 0.6 + 0.35 * d; // not all buildings can break
  let breakable = Math.random() < breakableChance;
  const streak = Number.isFinite(state._breakableStreak) ? state._breakableStreak : 0;
  if (streak >= 2) breakable = false;
  if (streak <= -2) breakable = true;

  // Some CRUMBLE platforms will fully "break" (fall away) while you're mid-air.
  // This is distinct from roof stress collapse (standing too long).
  const breakChance = (breakable && motionKind === "crumble") ? (0.16 + 0.22 * d) : 0;
  const prevBreakArmed = !!(prev && prev.breakArmed);
  let breakArmed = breakable && !prevBreakArmed && Math.random() < breakChance;

  // How quickly the break triggers once the platform starts crumbling (seconds-ish)
  let breakDelay = breakArmed ? (0.22 + 0.32 * Math.random()) : 0;

  // Amplitude in px
  const amp = hasMotion ? (18 + 44 * (0.35 + 0.65 * d) * Math.random()) : 0;

  // How quickly it reaches the target (seconds-ish)
  const motionRate = hasMotion ? (0.65 + 0.95 * Math.random()) : 0;

  // For fairness, platforms never go too close to lethal ground.
  const yMin = 160;
  const yMax = GROUND_Y - 40;
  let lowSpawnBreakY = GROUND_Y - 50;

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

  const buildingIndex = Number.isFinite(state._buildingCount)
    ? state._buildingCount + 1
    : 1;
  state._buildingCount = buildingIndex;

  let billboard = null;
  // Low billboards hang at head height: duck under (hold S). They're much taller than the regular
  // ones (top ~187 px above the roof vs a ~110 px single jump), so only a double jump clears them.
  // On the highest roofs they're shortened so the top stays on screen.
  // Kept toward the right of the roof so there's room to land and react.
  const LOW_BB_W = 110;
  const LOW_BB_TOP_MARGIN = 12; // min gap between the sign's top and the top of the screen
  // Min roof run before a low billboard: time to land and react, so it grows with speed.
  const speedNow = Number.isFinite(state.speed) ? state.speed : SPEED_START;
  const LOW_BB_LEAD = clamp(speedNow * LOW_BILLBOARD_LEAD_SEC, 110, 200);
  const LOW_BB_CLEAR = 27; // roof -> billboard bottom (standing collides, ducking clears)
  // baseYRest is the highest this roof ever sits (moving roofs rise to it or sink from it).
  const LOW_BB_H = Math.min(160, baseYRest - LOW_BB_CLEAR - LOW_BB_TOP_MARGIN);

  if (!Number.isFinite(state._bbNextAt)) state._bbNextAt = BILLBOARD_FIRST_AT;
  const fairRoof = !hasMotion && !airReqLanding;
  const wantBillboard = worldLeft >= state._bbNextAt && fairRoof;
  let bbKind = wantBillboard ? pickBillboardKind(state, d) : null;
  // A low billboard needs a run-up plus its own width: widen a roof that's too short for one.
  const lowMinW = LOW_BB_LEAD + LOW_BB_W + 6;
  if (bbKind && bbKind.startsWith("low") && w < lowMinW) {
    w = lowMinW + 40 * Math.random();
    state._worldRight = worldLeft + w;
  }
  if (bbKind) {
    state._bbCount = (state._bbCount || 0) + 1;
    state._bbLastKind = bbKind;
    state._bbNextAt = worldLeft + lerpRange(BILLBOARD_SPACING_EASY, BILLBOARD_SPACING_HARD, d);
    // The billboard's material follows its building: glass on breakable, steel on unbreakable.
    breakable = bbKind.endsWith("glass");
  }

  if (bbKind && bbKind.startsWith("low")) {
    const bbX = LOW_BB_LEAD + (w - LOW_BB_LEAD - LOW_BB_W - 6) * Math.random();
    billboard = {
      offsetX: bbX,
      offsetY: LOW_BB_H + LOW_BB_CLEAR,
      w: LOW_BB_W,
      h: LOW_BB_H,
      low: true,
      reinforced: !breakable,
      duckLeadSec: -1, // how long Bob had been ducking when he reached it (-1 until he does)
      resolved: false,
      broken: false,
      hit: false,
      breaking: false,
      breakT: 0,
    };
  } else if (bbKind) {
    const maxW = Math.max(70, w - 24);
    const bbW = clamp(160, 70, maxW);
    const bbH = 96;
    const xPad = Math.max(8, Math.floor((w - bbW) * 0.08));
    const bbX = clamp(
      xPad + (w - bbW - xPad * 2) * Math.random(),
      6,
      Math.max(6, w - bbW - 6)
    );
    const minOffsetY = bbH + PLAYER_H + 25;
    const bbOffsetY = Math.max(minOffsetY, 84 + 26 * Math.random());
    billboard = {
      offsetX: bbX,
      offsetY: bbOffsetY,
      w: bbW,
      h: bbH,
      reinforced: !breakable,
      duckLeadSec: -1,
      resolved: false,
      broken: false,
      hit: false,
      breaking: false,
      breakT: 0,
    };
  }

  if (billboard && breakable) {
    // Billboards shouldn't auto-trigger roof breaking; only stress from standing should.
    breakArmed = false;
    breakDelay = 0;
    lowSpawnBreakY = Number.POSITIVE_INFINITY;
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
    lowSpawnBreak: breakable && baseYRest >= lowSpawnBreakY,
    breakable,

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

    billboard,
  });

  if (breakable) {
    state._breakableStreak = streak >= 0 ? streak + 1 : 1;
  } else {
    state._breakableStreak = streak <= 0 ? streak - 1 : -1;
  }
}

export function resetPlatforms(state) {
  state.platforms.length = 0;

  const startY = GROUND_Y - SAFE_CLEARANCE;
  // Billboard director: a fresh run starts its intro again.
  state._worldRight = INTERNAL_WIDTH * 1.35; // right edge of the starter roof below
  state._bbNextAt = BILLBOARD_FIRST_AT;
  state._bbCount = 0;
  state._bbLastKind = null;

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
    lowSpawnBreak: false,
    breakable: false,

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

    billboard: null,
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
