// src/game/state.js

import {
  GROUND_Y,
  SAFE_CLEARANCE,
  PLAYER_X,
  PLAYER_W,
  PLAYER_H,
  SPEED_START,
  COYOTE_TIME_SEC,
  SLOWFALL_FUEL_MAX,
  DEATH_SUMMARY_START_SEC,
} from "./constants.js";
import { clearBreakdown, createBreakdown, createScoreEvents } from "./score.js";

// The run summary is showing: from the moment the death arm grabs Bob (it keeps dragging him
// away behind the panels) until the restart fly-by. Shared by the game logic and the renderer.
export function isSummaryShowing(state) {
  return state.gameOver === true
    && !state.restartFlybyActive
    && (state.deathCinematicDone === true || (state.deathCinematicT || 0) >= DEATH_SUMMARY_START_SEC);
}

export function createInitialState() {
  return {
    running: false,
    gameOver: false,
    startReady: true,
    menuZoomK: 0,         // 0 = fully zoomed in on menu, 1 = gameplay zoom
    menuZooming: false,
    startDelay: 0,        // reused as a brief movement hold after zoom-out
    menuSmashT: 0,        // timer for approach + smash
    menuSmashActive: false,
    menuSmashArmed: false,
    menuSmashBroken: false,
    menuSmashRed: false,
    menuSmashImpact: null, // where Bob hit the START text, relative to it: { x, y }
    restartSmashActive: false,
    restartSmashBroken: false,
    restartSmashRed: false,
    restartSmashT: 0,
    restartHover: false,

    deathCinematicActive: false,
    deathCinematicDone: false,
    deathCinematicT: 0,
    deathSnapshot: null,
    breakShards: [],
    deathRestartT: 0,
    restartFlybyActive: false,
    restartFlybyT: 0,
    restartFlybyResetDone: false,
    roofJumpT: 0,
    startPushT: 0,

    uiTime: 0,
    animTime: 0,
    hudIntroT: 0,

    distance: 0,
    _nextAirReq: "none",
    _nextAirReqDist: 0,
    _breakableStreak: 0,
    _buildingCount: 0,
    _worldRight: 0,      // billboard director (game/platforms.js): right edge of the last roof along the level
    _bbNextAt: 0,        // ...level position the next billboard may go at
    _bbCount: 0,         // ...billboards placed this run (the first few are the intro)
    _bbLastKind: null,   // ...kind of the last one

    combo: 0, // clean tricked landings in a row (adds to the air multiplier)

    score: 0,
    scoreEvents: createScoreEvents(),
    scoreEventHead: 0,
    scoreEventLastT: -1, // uiTime of the latest bonus (HUD score pulse)

    // Air pot: points earned since takeoff, paid out (x slowfall multiplier) on a safe landing.
    airActive: false,
    airPot: 0,
    airDistance: 0, // distance part of the pot (multiplied by backflips)
    airFlips: 0,    // backflips this airtime
    airFlipEndT: -1, // uiTime the latest backflip finished (clutch bonus), -1 if none
    scoreBreakdown: createBreakdown(), // banked points per source (run summary)
    airBreakdown: createBreakdown(),   // this jump's points per source, banked on landing

    // Personal best: snapshot taken as the run starts (the server value changes after submit).
    runBestTarget: 0,
    sessionBest: 0, // best finished run this session; survives resets
    passedBest: false,
    passedBestT: -1, // uiTime when this run passed the best

    slowfallDistance: 0,
    backflipCount: 0,
    billboardDashCount: 0,
    diveCount: 0,
    scoreTally: 0,
    scoreTallyT: 0,
    scoreTallyActive: false,
    scoreTallyDone: false,
    scoreTallyDoneT: 0,
    tallyRows: [], // run summary rows being tallied (see buildSummaryRows)
    tallyRow: 0,   // row counting now (tallyRows.length once done)
    tallyRowT: 0,  // seconds into that row
    restartReady: false, // RESET is showing and a press may restart
    restartReadyT: 0,    // seconds RESET has been showing (it types itself in)
    iteration: 0,        // simulation iteration: runs started on this device (persisted, not reset)

    // Pause: while paused or counting down, update() freezes the run.
    paused: false,
    pauseT: 0,           // seconds since the pause began (drives the blinking hint)
    resumeCountdownT: 0, // > 0: counting down to resume (3 -> 0)
    scoreBoardT: 0,

  speed: SPEED_START,
    speedImpulse: 0,
  // Start prompt world position (moves with scroll)
    startPromptX: PLAYER_X + PLAYER_W + 24,
    // Y will be derived each frame to sit on the starter roof.
    startPromptY: null,
    startPromptBounds: null,

  jumpBuffer: 0,
  jumpHeld: false,
    jumpCut: 0,
    dashPressed: false,
    pointerX: 0,
    pointerY: 0,
    pointerInside: false,
    pointerUiX: 0,
    pointerUiY: 0,
    pointerInViewport: false,
    controlsPanelOpen: false,
    leaderboardExpanded: false,
    leaderboardArrowRect: null,

    player: {
      x: PLAYER_X,
      y: GROUND_Y - SAFE_CLEARANCE - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      vy: 0,
      onGround: true,
      onBillboard: false,
      jumpsRemaining: 2,
      coyote: COYOTE_TIME_SEC,
      landGrace: 0,
      breakGrace: 0,
      breakJumpEligible: false,
      groundPlat: null,

      spinning: false,
      spinT: 0,
      spinProg: 0,
      spinDir: 1,
      spinCooldown: 0,
      trickLandWindow: 0,
      slowfallFuel: SLOWFALL_FUEL_MAX,
      slowfallFuelMax: SLOWFALL_FUEL_MAX,

      trickKind: "spin",
      trickIntent: "neutral",

      diving: false,
      divePhase: "",
      divePhaseT: 0,
      ducking: false,
      duckLandT: 0,
      duckingPrev: false,
      duckAgeSec: 0,          // how long the current duck has lasted
      unduckAgeSec: Infinity, // time since the last duck ended (duck jump)

      dashCooldown: 0,
      dashOffset: 0,
      dashTarget: 0,
      dashOffsetV: 0,
      dashImpulseT: 0,
      dashAgeSec: Infinity, // time since the last dash press (perfect ad break)
      jumpImpulseT: 0,
      billboardDeath: false,
      billboardDeathT: 0,
    },

    platforms: [],

    heavyLandT: 0,
    leaderboardReported: false,
  };
}

export function resetRunState(state) {
  state.running = false;
  state.gameOver = false;
  state.startReady = true;
  state.menuZoomK = 0;
  state.menuZooming = false;
  state.menuSmashT = 0;
  state.menuSmashActive = false;
  state.menuSmashArmed = false;
  state.menuSmashBroken = false;
  state.menuSmashRed = false;
  state.menuSmashImpact = null;
  state.restartSmashActive = false;
  state.restartSmashBroken = false;
  state.restartSmashRed = false;
  state.restartSmashT = 0;
  state.restartHover = false;

  state.deathCinematicActive = false;
  state.deathCinematicDone = false;
  state.deathCinematicT = 0;
  state.deathSnapshot = null;
  state.breakShards = [];
  state.deathRestartT = 0;
  state.restartFlybyActive = false;
  state.restartFlybyT = 0;
  state.restartFlybyResetDone = false;
  state.roofJumpT = 0;
  state.startPushT = 0;

  state.uiTime = 0;
  state.animTime = 0;
  state.hudIntroT = 0;
  state.distance = 0;
  state._nextAirReq = "none";
  state._nextAirReqDist = 0;
  state._breakableStreak = 0;
  state._buildingCount = 0;

  state.combo = 0;
  state.score = 0;
  for (const ev of state.scoreEvents) ev.t = -1;
  state.scoreEventHead = 0;
  state.scoreEventLastT = -1;
  state.airActive = false;
  state.airPot = 0;
  state.airDistance = 0;
  state.airFlips = 0;
  state.airFlipEndT = -1;
  clearBreakdown(state.scoreBreakdown);
  clearBreakdown(state.airBreakdown);
  state.runBestTarget = 0;
  state.passedBest = false;
  state.passedBestT = -1;
  state.slowfallDistance = 0;
  state.backflipCount = 0;
  state.billboardDashCount = 0;
  state.diveCount = 0;
  state.scoreTally = 0;
  state.scoreTallyT = 0;
  state.scoreTallyActive = false;
  state.scoreTallyDone = false;
  state.scoreTallyDoneT = 0;
  state.tallyRows = [];
  state.tallyRow = 0;
  state.tallyRowT = 0;
  state.restartReady = false;
  state.restartReadyT = 0;
  state.paused = false;
  state.pauseT = 0;
  state.resumeCountdownT = 0;
  state.scoreBoardT = 0;

  state.speed = SPEED_START;
  state.speedImpulse = 0;
  state.startPromptX = PLAYER_X + PLAYER_W + 24;
  state.startPromptY = null;
  state.startPromptBounds = null;

  state.jumpBuffer = 0;
  state.jumpHeld = false;
  state.jumpCut = 0;
  state.dashPressed = false;
  state.pointerUiX = 0;
  state.pointerUiY = 0;
  state.pointerInViewport = false;
  state.controlsPanelOpen = false;
  state.leaderboardExpanded = false;
  state.leaderboardArrowRect = null;

  state.heavyLandT = 0;
  state.leaderboardReported = false;

  const p = state.player;
  p.x = PLAYER_X;
  p.y = GROUND_Y - SAFE_CLEARANCE - PLAYER_H;
  p.vy = 0;
  p.onGround = true;
  p.onBillboard = false;
  p.jumpsRemaining = 2;
  p.coyote = COYOTE_TIME_SEC;
  p.landGrace = 0;
  p.breakGrace = 0;
  p.breakJumpEligible = false;
  p.groundPlat = null;

  p.spinning = false;
  p.spinT = 0;
  p.spinProg = 0;
  p.spinDir = 1;
  p.spinCooldown = 0;
  p.trickLandWindow = 0;
  p.trickKind = "spin";
  p.trickIntent = "neutral";
  p.diving = false;
  p.divePhase = "";
  p.divePhaseT = 0;
  p.ducking = false;
  p.duckLandT = 0;
  p.duckingPrev = false;
  p.duckAgeSec = 0;
  p.unduckAgeSec = Infinity;
  p.slowfallFuel = SLOWFALL_FUEL_MAX;
  p.slowfallFuelMax = SLOWFALL_FUEL_MAX;
  p.dashCooldown = 0;
  p.dashOffset = 0;
  p.dashTarget = 0;
  p.dashOffsetV = 0;
  p.dashImpulseT = 0;
  p.dashAgeSec = Infinity;
  p.jumpImpulseT = 0;
  p.billboardDeath = false;
  p.billboardDeathT = 0;
}
