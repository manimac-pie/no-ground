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

    uiTime: 0,
    animTime: 0,

    distance: 0,

    styleScore: 0,
    styleCombo: 0,

    speed: SPEED_START,

    jumpBuffer: 0,
    jumpHeld: false,
    jumpCut: 0,
    dashPressed: false,

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
      groundPlat: null,

      spinning: false,
      spinT: 0,
      spinProg: 0,
      spinDir: 1,
      spinCooldown: 0,
      trickLandWindow: 0,
      floatFuel: FLOAT_FUEL_MAX,

      trickKind: "spin",
      trickIntent: "neutral",

      dashCooldown: 0,
      dashOffset: 0,
      dashTarget: 0,
      dashOffsetV: 0,
      dashImpulseT: 0,
    },

    platforms: [],

    lastLandQuality: null,
    lastLandQualityT: 0,
    heavyLandT: 0,
  };
}

export function resetRunState(state) {
  state.running = false;
  state.gameOver = false;

  state.uiTime = 0;
  state.animTime = 0;
  state.distance = 0;

  state.styleScore = 0;
  state.styleCombo = 0;

  state.speed = SPEED_START;

  state.jumpBuffer = 0;
  state.jumpHeld = false;
  state.jumpCut = 0;
  state.dashPressed = false;

  state.lastLandQuality = null;
  state.lastLandQualityT = 0;
  state.heavyLandT = 0;

  const p = state.player;
  p.x = PLAYER_X;
  p.y = GROUND_Y - SAFE_CLEARANCE - PLAYER_H;
  p.vy = 0;
  p.onGround = true;
  p.jumpsRemaining = 2;
  p.coyote = COYOTE_TIME_SEC;
  p.landGrace = 0;
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
  p.dashCooldown = 0;
  p.dashOffset = 0;
  p.dashTarget = 0;
  p.dashOffsetV = 0;
  p.dashImpulseT = 0;
}
