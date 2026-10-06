// src/game/index.js
// Orchestrator that keeps the same public API.

import {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  GROUND_Y,
  SPEED_START,
  SPEED_MAX,
  SPEED_RAMP_PER_SEC,
  SPEED_SMOOTH,
  JUMP_BUFFER_SEC,
  DEATH_CINEMATIC_TOTAL,
  RESTART_FLYBY_SEC,
  RESTART_FLYBY_HOLD_SEC,
  RESTART_FLYBY_FADE_SEC,
  START_PUSH_TOTAL,
  MENU_START_ZOOM,
  RUN_SUMMARY_DROP_SEC,
  RESET_GLITCH_SEC,
  LEADERBOARD_SLIDE_DELAY_SEC,
  LEADERBOARD_SLIDE_SEC,
} from "./constants.js";

import { clamp } from "../shared/math.js";
import { createInitialState, isSummaryShowing, resetRunState } from "./state.js";
import { addDistancePoints, buildSummaryRows, tallyRowSec } from "./score.js";
import { resetPlatforms, scrollWorld, updatePlatforms } from "./platforms.js";
import {
  tryConsumeBufferedJump,
  integratePlayer,
  updateDash,
} from "./player.js";
import { startSpin, updateTricks } from "./tricks.js";
import { spawnBreakShards, updateBreakShards } from "./breakShards.js";
import { START_PANE_H, START_PANE_W, START_PANE_Y, checkStartSmash, startPaneX } from "./firewall.js";
import { getControlsButtonRect, getControlsPanelRect, hitAreas, pointInRect } from "../ui/layout.js";
import { onGameFinished } from "../leaderboard/view.js";
import { getLeaderboardEntryCount, getMyBest, LEADERBOARD_COLLAPSED_ROWS } from "../leaderboard/state.js";
import { loadIteration, saveIteration } from "../ui/iteration.js";

const MENU_ZOOM_DURATION = 0.85; // seconds for zoom-out transition
const START_DELAY = 0;          // no movement hold; Bob rolls immediately
const SMASH_VISIBLE = 1.4;      // how long shards stay visible after impact
const RESTART_SMASH_LEAD = RESET_GLITCH_SEC; // RESET glitches the screen out, then the fly-by starts
const HUD_SLIDE_SEC = 0.55;
const RESTART_READY_DELAY_SEC = 0.5; // pause after the score tally before RESET appears
const RESUME_COUNTDOWN_SEC = 3;      // 3-2-1 after unpausing

export function createGame() {
  const state = createInitialState();

  state.iteration = loadIteration();

  function reset() {
    resetRunState(state);
    resetPlatforms(state);
  }

  function reportRunEnd(runScore) {
    if (state.leaderboardReported) return;
    state.leaderboardReported = true;
    if (Number.isFinite(runScore)) state.sessionBest = Math.max(state.sessionBest || 0, runScore);
    onGameFinished(runScore).catch((error) => {
      console.error("Submitting final score failed:", error);
    });
  }

  // Personal-best target for the HUD and the run summary. Taken from the stored best
  // (or this session's best, if a submit is still in flight) and kept fixed for the run.
  // Retried while it's 0 in case the leaderboard loads after the run starts.
  function updateBestTarget() {
    if (state.passedBest) return;
    if (state.runBestTarget <= 0) {
      state.runBestTarget = Math.max(getMyBest() || 0, state.sessionBest || 0);
    }
    if (state.runBestTarget > 0 && state.score > state.runBestTarget) {
      state.passedBest = true;
      state.passedBestT = state.uiTime || 0;
    }
  }

  function updateScoreTally(dt) {
    if (!isSummaryShowing(state)) {
      state.scoreBoardT = 0;
      state.scoreTallyActive = false;
      state.scoreTallyT = 0;
      state.scoreTally = 0;
      state.scoreTallyDone = false;
      state.scoreTallyDoneT = 0;
      state.tallyRow = 0;
      state.tallyRowT = 0;
      state.restartReady = false;
      state.restartReadyT = 0;
      return;
    }

    // After a skipped cinematic the whole summary plays faster (drop-in, count-up, RESET wait).
    state.scoreBoardT = (state.scoreBoardT || 0) + dt;
    if ((state.scoreBoardT || 0) < RUN_SUMMARY_DROP_SEC) return;

    if (!state.scoreTallyActive) {
      state.scoreTallyActive = true;
      state.scoreTallyT = 0;
      state.tallyRows = buildSummaryRows(state);
    }
    state.scoreTallyT += dt;
    advanceTally();
    // RESET appears (and the leaderboard name prompt may open) once the tally has settled.
    state.restartReady = state.scoreTallyDone && state.scoreTallyDoneT >= RESTART_READY_DELAY_SEC;
    state.restartReadyT = state.restartReady ? state.scoreTallyDoneT - RESTART_READY_DELAY_SEC : 0;
  }

  // Walk the tally clock through the summary rows. Finished rows are banked into scoreTally;
  // once every row is in, the time left over is how long the tally has been done.
  function advanceTally() {
    const rows = state.tallyRows;
    let t = state.scoreTallyT;
    let banked = 0;
    let i = 0;
    for (; i < rows.length; i++) {
      const rowSec = tallyRowSec(rows[i]);
      if (t < rowSec) break;
      t -= rowSec;
      banked += rows[i].points;
    }
    state.tallyRow = i;
    state.tallyRowT = t;
    state.scoreTally = banked;
    state.scoreTallyDone = i >= rows.length;
    state.scoreTallyDoneT = state.scoreTallyDone ? t : 0;
  }

  // A press during the run summary: land the panels and finish the tally at once.
  function finishSummary() {
    state.scoreBoardT = Math.max(
      state.scoreBoardT || 0,
      RUN_SUMMARY_DROP_SEC,
      LEADERBOARD_SLIDE_DELAY_SEC + LEADERBOARD_SLIDE_SEC
    );
    if (!state.scoreTallyActive) {
      state.scoreTallyActive = true;
      state.tallyRows = buildSummaryRows(state);
    }
    // A hair past the end, so float rounding in advanceTally can't leave the last row unfinished.
    const total = state.tallyRows.reduce((sum, row) => sum + tallyRowSec(row), 0) + 1e-6;
    state.scoreTallyT = Math.max(state.scoreTallyT, total);
    advanceTally();
  }

  // End the death cinematic.
  function finishDeathCinematic() {
    state.deathCinematicT = DEATH_CINEMATIC_TOTAL;
    state.deathCinematicActive = false;
    state.deathCinematicDone = true;
    state.startReady = true;
    state.deathRestartT = 0;
  }

  function endGame() {
    const finalScore = Number.isFinite(state.score)
      ? state.score
      : (state.distance || 0);
    if (!state.gameOver) {
      const p = state.player;
      if (p) {
        // Keep Bob in view for the death cinematic.
        p.y = Math.min(p.y, GROUND_Y - p.h + 2);
      }
      state.deathSnapshot = p
        ? { x: p.x, y: p.y, w: p.w, h: p.h, vy: p.vy }
        : null;
      // Bob breaks up on lethal impact
      spawnBreakShards(state, p);
      state.deathCinematicActive = true;
      state.deathCinematicDone = false;
      state.deathCinematicT = 0;
      state.deathRestartT = 0;
      state.startReady = false;
      state.restartSmashActive = false;
      state.restartSmashBroken = false;
      state.restartSmashRed = false;
      state.restartSmashT = 0;
    }

    state.running = false;
    state.gameOver = true;
    state.menuSmashActive = false;
    reportRunEnd(finalScore);
  }

  

  // Only a live run can pause: not the start screen, the zoom-in, the death cinematic or the summary.
  function canPause() {
    return state.running === true
      && !state.gameOver
      && !state.deathCinematicActive
      && !state.menuZooming
      && !state.restartFlybyActive;
  }

  // Pause (or go back to PAUSED from the countdown). main.js also calls this when the player leaves.
  function pause() {
    if (!canPause()) return false;
    if (!state.paused) state.pauseT = 0;
    state.paused = true;
    state.resumeCountdownT = 0;
    return true;
  }

  // Throw away every press made while frozen, so none fires when play resumes.
  // Returns whether a jump (Space / tap) was pressed: the resume signal.
  function drainInput(input) {
    const jump = input?.consumeJumpPress?.();
    input?.consumePointerPressed?.();
    input?.consumeTrickPressed?.();
    input?.consumeTrickIntent?.();
    input?.consumeDashPressed?.();
    input?.consumeDivePressed?.();
    return jump?.pressed === true;
  }

  // Pause handling. Runs before the clocks advance, so pop-ups and flashes freeze too.
  // Returns true while the run is frozen (paused or counting down).
  function updatePause(dt, input) {
    const pausePressed = input?.consumePausePressed?.() === true;
    if (state.paused) {
      state.pauseT += dt;
      const jumpPressed = drainInput(input);
      if (jumpPressed || pausePressed) {
        state.paused = false;
        state.resumeCountdownT = RESUME_COUNTDOWN_SEC;
      }
      return true;
    }
    if (state.resumeCountdownT > 0) {
      drainInput(input);
      if (pausePressed) pause();
      else state.resumeCountdownT = Math.max(0, state.resumeCountdownT - dt);
      return true;
    }
    if (pausePressed && pause()) {
      drainInput(input);
      return true;
    }
    return false;
  }

  function update(dt, input) {
    if (updatePause(dt, input)) return state;
    state.uiTime += dt;
    if (state.running || state.menuZooming || state.startDelay > 0) state.animTime += dt;
    updateScoreTally(dt);
    updateBreakShards(state, dt);
    const billboardDeath = state.player && state.player.billboardDeath === true;
    if (billboardDeath) {
      state.speedImpulse = 0;
    }

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
      if (state.deathCinematicT >= DEATH_CINEMATIC_TOTAL) finishDeathCinematic();
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
    state.slowfallHeld = input?.slowfallHeld === true;
    state.pointerX = input?.pointerX ?? state.pointerX;
    state.pointerY = input?.pointerY ?? state.pointerY;
    state.pointerInside = input?.pointerInside === true;
    state.pointerUiX = input?.pointerInternalX ?? state.pointerUiX;
    state.pointerUiY = input?.pointerInternalY ?? state.pointerUiY;
    state.pointerInViewport = input?.pointerInViewport === true;

    // One-press pulses
    state.divePressed = input?.consumeDivePressed?.() === true;
    state.dashPressed = dashPressed;

    // Held S/dive button -> duck while on a roof
    state.diveHeld = input?.diveHeld === true;

    const onRestartScreen =
      state.gameOver && state.deathCinematicDone && !state.restartFlybyActive;

    if (!onStartScreen && state.controlsPanelOpen) {
      state.controlsPanelOpen = false;
    }

    // The start-screen board only stays expanded while it has more rows than it shows collapsed
    // (the list can shrink, e.g. at the weekly reset).
    if (state.leaderboardExpanded && getLeaderboardEntryCount() <= LEADERBOARD_COLLAPSED_ROWS) {
      state.leaderboardExpanded = false;
    }

    let startPromptPressed = false;
    if (pointerPressed && onStartScreen && state.pointerInViewport) {
      const toggleRect = hitAreas.leaderboardToggle;
      if (
        toggleRect &&
        pointInRect(state.pointerUiX, state.pointerUiY, toggleRect)
      ) {
        state.leaderboardExpanded = !state.leaderboardExpanded;
        jumpPressed = false;
        state.jumpBuffer = 0;
        input?.suppressPointerJump?.();
      } else {
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
        } else {
          const player = state.player || {};
          const focusX = (player.x ?? 0) + (player.w ?? 0) / 2;
          const focusY = (player.y ?? 0) + (player.h ?? 0) / 2;
          const zoomK = clamp(state.menuZoomK ?? 0, 0, 1);
          const zoom = MENU_START_ZOOM - (MENU_START_ZOOM - 1) * zoomK;
          const invZoom = 1 / Math.max(0.001, zoom);
          const pointerWorldX = focusX + (state.pointerUiX - focusX) * invZoom;
          const pointerWorldY = focusY + (state.pointerUiY - focusY) * invZoom;
          const paneX = startPaneX(state);
          const hitStart =
            pointerWorldX >= paneX &&
            pointerWorldX <= paneX + START_PANE_W &&
            pointerWorldY >= START_PANE_Y &&
            pointerWorldY <= START_PANE_Y + START_PANE_H;

          if (hitStart) {
            startPromptPressed = true;
            jumpPressed = false;
            state.jumpBuffer = 0;
            input?.suppressPointerJump?.();
          }
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
          // Until RESET is showing, a press only finishes the summary, so a run can't restart
          // before its summary lands or its leaderboard name prompt opens.
          if (!state.restartReady) {
            if (onRestartScreen) finishSummary();
            return state;
          }
          if (state.restartSmashActive) return state; // already resetting
          state.restartSmashActive = true;
          state.restartSmashBroken = true;
          state.restartSmashRed = hitAreas.resetHovered === true;
          state.restartSmashT = 0;
          return state;
        }
        // A new run: the simulation counts another iteration.
        state.iteration += 1;
        saveIteration(state.iteration);

        state.menuZooming = true;
        state.menuZoomK = 0;
        state.menuSmashT = 0;
        state.menuSmashActive = false;
        state.menuSmashArmed = false; // collision will trigger smash
        state.menuSmashBroken = false;
        state.menuSmashRed = false;
        state.menuSmashImpact = null;

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
    let movementHeld = state.startDelay > 0 || billboardDeath;
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
    if (billboardDeath) {
      state.speed = 0;
    } else {
      state.speed = clamp(
        state.speed + (desiredSpeed - state.speed) * alpha,
        SPEED_START,
        SPEED_MAX + impulse
      );
    }

    if (!movementHeld) {
      if (jumpPressed) state.jumpBuffer = JUMP_BUFFER_SEC;
      if (trickPressed) startSpin(state, trickIntent);
    }

    const deltaDist = state.speed * dt;
    const onBillboard = state.player && state.player.onBillboard === true;
    const distanceMult = onBillboard ? 1.2 : 1;
    const distanceDelta = deltaDist * distanceMult;
    state.distance += distanceDelta;

    scrollWorld(state, dt);
    updatePlatforms(state, dt);
    updateTricks(state, dt);
    integratePlayer(state, dt, endGame);
    // Bob died this frame: the final score was already submitted in endGame, so add nothing after it.
    if (state.gameOver) return state;
    checkStartSmash(state, hitAreas.startPaneHovered);

    if (!Number.isFinite(state.score)) state.score = 0;
    if (!Number.isFinite(state.slowfallDistance)) state.slowfallDistance = 0;
    const p = state.player;
    const airborne = p ? p.onGround === false : false;
    const slowfalling = airborne && state.slowfallHeld === true && !(p && p.diving);
    // Airborne distance goes into the air pot (x air multiplier, paid out on landing).
    addDistancePoints(state, distanceDelta);
    if (slowfalling) state.slowfallDistance += distanceDelta;
    updateBestTarget();

    tryConsumeBufferedJump(state);
    return state;
  }

  reset();
  return { state, reset, update, pause };
}
