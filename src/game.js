// src/game.js
// Orchestrator that keeps the same public API.

import {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  GROUND_Y,
  PLATFORM_H,
  SPEED_START,
  SPEED_MAX,
  SPEED_RAMP_PER_SEC,
  SPEED_SMOOTH,
  JUMP_BUFFER_SEC,
  FLOAT_SCORE_MULT,
  DEATH_CINEMATIC_TOTAL,
  BREAK_SHARDS,
  RESTART_FLYBY_SEC,
  RESTART_FLYBY_HOLD_SEC,
  RESTART_FLYBY_FADE_SEC,
  START_PUSH_TOTAL,
  MENU_START_ZOOM,
} from "./game/constants.js";

import { clamp } from "./game/utils.js";
import { createInitialState, resetRunState } from "./game/state.js";
import { resetPlatforms, scrollWorld, updatePlatforms } from "./game/platforms.js";
import {
  tryConsumeBufferedJump,
  integratePlayer,
  updateDash,
} from "./game/player.js";
import { startSpin, updateTricks } from "./game/tricks.js";
import { getControlsButtonRect, getControlsPanelRect, pointInRect } from "./ui/layout.js";

const MENU_ZOOM_DURATION = 0.85; // seconds for zoom-out transition
const START_DELAY = 0;          // no movement hold; Bob rolls immediately
const SMASH_APPROACH = 0.90;    // delay before smash to let Bob reach the text
const SMASH_VISIBLE = 1.4;      // how long shards stay visible after impact
const RESTART_SMASH_LEAD = 0.28; // delay before restart flyby after reset breaks
const HUD_SLIDE_SEC = 0.55;

export function createGame() {
  const state = createInitialState();

  function reset() {
    resetRunState(state);
    resetPlatforms(state);
  }

  function updateScoreTally(dt) {
    const onRestartScreen =
      state.gameOver && state.deathCinematicDone && !state.restartFlybyActive;
    if (!onRestartScreen) {
      state.scoreBoardT = 0;
      state.scoreTallyActive = false;
      state.scoreTallyT = 0;
      state.scoreTally = 0;
      state.scoreTallyDone = false;
      state.scoreTallyDoneT = 0;
      return;
    }

    state.scoreBoardT = (state.scoreBoardT || 0) + dt;
    const boardIntro = 0.25;
    if ((state.scoreBoardT || 0) < boardIntro) return;

    if (!state.scoreTallyActive) {
      state.scoreTallyActive = true;
      state.scoreTallyT = 0;
      state.scoreTally = 0;
      state.scoreTallyDone = false;
      state.scoreTallyDoneT = 0;
    }
    state.scoreTallyT += dt;
    const duration = 0.9;
    const t = clamp(state.scoreTallyT / duration, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const finalScore = Number.isFinite(state.score)
      ? state.score
      : (state.distance || 0);
    state.scoreTally = Math.floor(finalScore * ease);
    if (t >= 1) {
      state.scoreTally = Math.floor(finalScore);
      state.scoreTallyDone = true;
      state.scoreTallyDoneT += dt;
    }
  }

  function armStart() {
    if (state.gameOver) reset();
    state.startReady = true;
  }

  function endGame() {
    if (!state.gameOver) {
      const p = state.player;
      if (p) {
        // Keep Bob in view for the death cinematic.
        p.y = Math.min(p.y, GROUND_Y - p.h + 2);
      }
      state.deathSnapshot = p
        ? { x: p.x, y: p.y, w: p.w, h: p.h, vy: p.vy }
        : null;
      // Spawn breakup shards on lethal impact
      state.breakShards = [];
      if (p) {
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
      state.deathCinematicActive = true;
      state.deathCinematicDone = false;
      state.deathCinematicT = 0;
      state.deathRestartT = 0;
      state.startReady = false;
      state.restartSmashActive = false;
      state.restartSmashBroken = false;
      state.restartSmashRed = false;
      state.restartSmashT = 0;
      state.restartHover = false;
    }

    state.running = false;
    state.gameOver = true;
    state.menuSmashActive = false;
  }

  function update(dt, input) {
    state.uiTime += dt;
    if (state.running || state.menuZooming || state.startDelay > 0) state.animTime += dt;
    updateScoreTally(dt);

    if (state.restartSmashActive) {
      state.restartSmashT = (state.restartSmashT || 0) + dt;
      if (!state.restartFlybyActive && state.restartSmashT >= RESTART_SMASH_LEAD) {
        state.restartFlybyActive = true;
        state.restartFlybyT = 0;
        state.restartFlybyResetDone = false;
      }
      if (state.restartSmashT >= SMASH_VISIBLE) {
        state.restartSmashActive = false;
        state.restartSmashT = 0;
      }
    }

    if (state.restartFlybyActive) {
      state.restartFlybyT = (state.restartFlybyT || 0) + dt;
      const total =
        RESTART_FLYBY_SEC +
        RESTART_FLYBY_HOLD_SEC +
        RESTART_FLYBY_FADE_SEC;

      if (!state.restartFlybyResetDone && state.restartFlybyT >= RESTART_FLYBY_SEC) {
        const flybyT = state.restartFlybyT;
        reset();
        state.restartFlybyActive = true;
        state.restartFlybyT = flybyT;
        state.restartFlybyResetDone = true;
        return state;
      }

      if (state.restartFlybyT >= total) {
        state.restartFlybyActive = false;
        state.restartFlybyT = 0;
        state.restartFlybyResetDone = false;
      }
      return state;
    }

    if (state.deathCinematicActive) {
      state.deathCinematicT = Math.min(
        DEATH_CINEMATIC_TOTAL,
        state.deathCinematicT + dt
      );
      if (state.deathCinematicT >= DEATH_CINEMATIC_TOTAL) {
        state.deathCinematicActive = false;
        state.deathCinematicDone = true;
        state.startReady = true;
        state.deathRestartT = 0;
      }
    }

    if (state.roofJumpT > 0) {
      state.roofJumpT = Math.max(0, state.roofJumpT - dt);
    }

    if (state.deathCinematicDone && !state.deathCinematicActive) {
      state.deathRestartT = (state.deathRestartT || 0) + dt;
    }

    const onStartScreen =
      !state.running &&
      !state.gameOver &&
      state.startReady === true &&
      !state.menuZooming &&
      (state.menuZoomK ?? 0) <= 0.001;

    if (onStartScreen) {
      state.startPushT = Math.min(
        START_PUSH_TOTAL,
        (state.startPushT || 0) + dt
      );
    } else {
      state.startPushT = 0;
    }

    // Advance the zoom animation if the menu is zooming out.
    if (state.menuZoomK < 1 && state.menuZooming) {
      state.menuZoomK = Math.min(1, state.menuZoomK + dt / MENU_ZOOM_DURATION);
      if (state.menuZoomK >= 1) {
        state.menuZooming = false;
        // Keep Bob idle for a beat after the zoom finishes, but let the game keep ticking.
        state.startDelay = START_DELAY;
        state.hudIntroT = 0;
        state.running = true;
        state.gameOver = false;
        state.startReady = false;
        state.jumpBuffer = 0; // no auto jump
      }
    }

    // Drive smash timeline: fade shards once triggered externally (collision).
    if (state.menuSmashActive) {
      state.menuSmashT += dt;
      if (state.menuSmashT >= SMASH_VISIBLE) {
        state.menuSmashActive = false;
        state.menuSmashT = 0;
      }
    }

    if (!state.running && state.startDelay > 0) {
      state.startDelay = Math.max(0, state.startDelay - dt);
      if (state.startDelay === 0) {
        state.hudIntroT = 0;
        state.running = true;
        state.gameOver = false;
        state.startReady = false;
        state.jumpBuffer = 0; // no auto jump
      }
    }

    if (state.running) {
      state.hudIntroT = Math.min(HUD_SLIDE_SEC, (state.hudIntroT || 0) + dt);
    } else if (state.hudIntroT > 0) {
      state.hudIntroT = Math.max(0, (state.hudIntroT || 0) - dt);
    }

    state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
    state.player.coyote = Math.max(0, state.player.coyote - dt);
    state.player.landGrace = Math.max(0, state.player.landGrace - dt);
    state.player.breakGrace = Math.max(0, state.player.breakGrace - dt);
    if (state.player.breakGrace === 0) state.player.breakJumpEligible = false;

    const jumpPress = input?.consumeJumpPress?.() || { pressed: false, source: null };
    let jumpPressed = jumpPress.pressed === true;
    const jumpSource = jumpPress.source;
    const pointerPressed = input?.consumePointerPressed?.() === true;
    const trickPressed = input?.consumeTrickPressed?.() === true;
    const trickIntent = input?.consumeTrickIntent?.() || "neutral";
    const dashPressed = input?.consumeDashPressed?.() === true;

    state.jumpHeld = input?.jumpHeld === true;
    state.floatHeld = input?.floatHeld === true;
    state.pointerX = input?.pointerX ?? state.pointerX;
    state.pointerY = input?.pointerY ?? state.pointerY;
    state.pointerInside = input?.pointerInside === true;
    state.pointerUiX = input?.pointerInternalX ?? state.pointerUiX;
    state.pointerUiY = input?.pointerInternalY ?? state.pointerUiY;
    state.pointerInViewport = input?.pointerInViewport === true;

    // One-press pulses
    state.divePressed = input?.consumeDivePressed?.() === true;
    state.dashPressed = dashPressed;

    // Kept for UI/debug only
    state.diveHeld = input?.diveHeld === true;

    const onRestartScreen =
      state.gameOver && state.deathCinematicDone && !state.restartFlybyActive;

    if (!onStartScreen && state.controlsPanelOpen) {
      state.controlsPanelOpen = false;
    }

    let startPromptPressed = false;
    if (pointerPressed && onStartScreen && state.pointerInViewport) {
      const btnRect = getControlsButtonRect(INTERNAL_WIDTH, INTERNAL_HEIGHT);
      const panelRect = getControlsPanelRect(INTERNAL_WIDTH, INTERNAL_HEIGHT);
      const hitButton = pointInRect(state.pointerUiX, state.pointerUiY, btnRect);
      const hitPanel = state.controlsPanelOpen
        && pointInRect(state.pointerUiX, state.pointerUiY, panelRect);

      if (hitButton) {
        state.controlsPanelOpen = !state.controlsPanelOpen;
        jumpPressed = false;
        state.jumpBuffer = 0;
        input?.suppressPointerJump?.();
      } else if (hitPanel) {
        jumpPressed = false;
        state.jumpBuffer = 0;
        input?.suppressPointerJump?.();
      } else if (state.startPromptBounds) {
        const player = state.player || {};
        const focusX = (player.x ?? 0) + (player.w ?? 0) / 2;
        const focusY = (player.y ?? 0) + (player.h ?? 0) / 2;
        const zoomK = clamp(state.menuZoomK ?? 0, 0, 1);
        const zoom = MENU_START_ZOOM - (MENU_START_ZOOM - 1) * zoomK;
        const invZoom = 1 / Math.max(0.001, zoom);
        const pointerWorldX = focusX + (state.pointerUiX - focusX) * invZoom;
        const pointerWorldY = focusY + (state.pointerUiY - focusY) * invZoom;
        const bounds = state.startPromptBounds;
        const hitStart =
          pointerWorldX >= bounds.x &&
          pointerWorldX <= bounds.x + bounds.w &&
          pointerWorldY >= bounds.y &&
          pointerWorldY <= bounds.y + bounds.h;

        if (hitStart) {
          startPromptPressed = true;
          jumpPressed = false;
          state.jumpBuffer = 0;
          input?.suppressPointerJump?.();
        }
      }
    }

    if (!state.running) {
      // Freeze input while the death cinematic plays.
      if (state.deathCinematicActive) {
        return state;
      }

      const startRequest = onStartScreen
        ? (startPromptPressed || (jumpPressed && jumpSource !== "pointer"))
        : jumpPressed;

      // Start/restart flow: Spacebar or Start button triggers zoom-out.
      if (startRequest && !state.menuZooming && state.startDelay <= 0) {
        if (state.gameOver) {
          state.restartSmashActive = true;
          state.restartSmashBroken = true;
          state.restartSmashRed = state.restartHover === true;
          state.restartSmashT = 0;
          return state;
        }
        state.menuZooming = true;
        state.menuZoomK = 0;
        state.menuSmashT = 0;
        state.menuSmashActive = false;
        state.menuSmashArmed = false; // collision will trigger smash
        state.menuSmashBroken = false;
        state.menuSmashRed = false;

        // Let Bob move immediately during the zoom-out.
        state.running = true;
        state.gameOver = false;
        state.startReady = false;
        state.startDelay = START_DELAY;
        state.jumpBuffer = 0;
        // Consume the start press so it doesn't also trigger a jump.
        jumpPressed = false;
      }

      // If we're still idle (no start gesture), bail early.
      if (!state.running) return state;
    }

    // Hold movement briefly after zoom-out while still advancing timers/FX.
    let movementHeld = state.startDelay > 0;
    if (movementHeld) {
      state.startDelay = Math.max(0, state.startDelay - dt);
      movementHeld = state.startDelay > 0;
    }

    // DASH LOGIC (world-speed impulse)
    updateDash(state, dt);

    // Base world speed (difficulty ramp); zero while movement is held
    const baseSpeed = movementHeld
      ? 0
      : clamp(
        SPEED_START + SPEED_RAMP_PER_SEC * state.animTime,
        SPEED_START,
        SPEED_MAX
      );

    // Dash adds to world speed, not player position
    const impulse = state.speedImpulse || 0;
    const desiredSpeed = movementHeld ? 0 : baseSpeed + impulse;

    const alpha = 1 - Math.exp(-SPEED_SMOOTH * dt);
    state.speed = clamp(
      state.speed + (desiredSpeed - state.speed) * alpha,
      SPEED_START,
      SPEED_MAX + impulse
    );

    if (!movementHeld) {
      if (jumpPressed) state.jumpBuffer = JUMP_BUFFER_SEC;
      if (trickPressed) startSpin(state, trickIntent);
    }

    const deltaDist = state.speed * dt;
    state.distance += deltaDist;

    scrollWorld(state, dt);
    updatePlatforms(state, dt);
    updateTricks(state, dt);
    integratePlayer(state, dt, endGame);

    if (!Number.isFinite(state.score)) state.score = 0;
    if (!Number.isFinite(state.glideDistance)) state.glideDistance = 0;
    const p = state.player;
    const airborne = p ? p.onGround === false : false;
    const floating = airborne && state.floatHeld === true && !(p && p.diving);
    const scoreMult = floating ? FLOAT_SCORE_MULT : 1;
    state.score += deltaDist * scoreMult;
    if (floating) state.glideDistance += deltaDist;

    tryConsumeBufferedJump(state);
    return state;
  }

  reset();
  return { state, reset, update };
}

export const world = {
  get INTERNAL_WIDTH() { return INTERNAL_WIDTH; },
  get INTERNAL_HEIGHT() { return INTERNAL_HEIGHT; },
  GROUND_Y,
  PLATFORM_H,
};
