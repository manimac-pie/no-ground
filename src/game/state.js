// src/game/state.js

import {
  GROUND_Y,
  SAFE_CLEARANCE,
  PLAYER_X,
  PLAYER_W,
  PLAYER_H,
  SPEED_START,
  COYOTE_TIME_SEC,
  FLOAT_FUEL_MAX,
} from "./constants.js";

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

    styleScore: 0,
    styleCombo: 0,

    score: 0,
    glideDistance: 0,
    diveCount: 0,
    scoreTally: 0,
    scoreTallyT: 0,
    scoreTallyActive: false,
    scoreTallyDone: false,
    scoreTallyDoneT: 0,
    scoreBoardT: 0,

  speed: SPEED_START,
  // Start prompt world position (moves with scroll)
    startPromptX: PLAYER_X + PLAYER_W + 24,
    // Y will be derived each frame to sit on the starter roof.
    startPromptY: null,

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

    player: {
      x: PLAYER_X,
      y: GROUND_Y - SAFE_CLEARANCE - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      vy: 0,
      onGround: true,
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
      floatFuel: FLOAT_FUEL_MAX,
      floatFuelMax: FLOAT_FUEL_MAX,

      trickKind: "spin",
      trickIntent: "neutral",

      dashCooldown: 0,
      dashOffset: 0,
      dashTarget: 0,
      dashOffsetV: 0,
      dashImpulseT: 0,
      jumpImpulseT: 0,
    },

    platforms: [],

    heavyLandT: 0,
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

  state.styleScore = 0;
  state.styleCombo = 0;
  state.score = 0;
  state.glideDistance = 0;
  state.diveCount = 0;
  state.scoreTally = 0;
  state.scoreTallyT = 0;
  state.scoreTallyActive = false;
  state.scoreTallyDone = false;
  state.scoreTallyDoneT = 0;
  state.scoreBoardT = 0;

  state.speed = SPEED_START;
  state.startPromptX = PLAYER_X + PLAYER_W + 24;
  state.startPromptY = null;

  state.jumpBuffer = 0;
  state.jumpHeld = false;
  state.jumpCut = 0;
  state.dashPressed = false;
  state.pointerUiX = 0;
  state.pointerUiY = 0;
  state.pointerInViewport = false;
  state.controlsPanelOpen = false;

  state.heavyLandT = 0;

  const p = state.player;
  p.x = PLAYER_X;
  p.y = GROUND_Y - SAFE_CLEARANCE - PLAYER_H;
  p.vy = 0;
  p.onGround = true;
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
  p.floatFuel = FLOAT_FUEL_MAX;
  p.floatFuelMax = FLOAT_FUEL_MAX;
  p.dashCooldown = 0;
  p.dashOffset = 0;
  p.dashTarget = 0;
  p.dashOffsetV = 0;
  p.dashImpulseT = 0;
  p.jumpImpulseT = 0;
}
