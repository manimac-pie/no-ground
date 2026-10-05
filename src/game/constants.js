// src/game/constants.js

export const BASE_INTERNAL_WIDTH = 800;
export const BASE_INTERNAL_HEIGHT = 450;
export const BASE_ASPECT = BASE_INTERNAL_WIDTH / BASE_INTERNAL_HEIGHT;
export const MAX_INTERNAL_WIDTH = 1600;

export let INTERNAL_WIDTH = BASE_INTERNAL_WIDTH;
export let INTERNAL_HEIGHT = BASE_INTERNAL_HEIGHT;

export function setInternalSizeFromViewport(cssW, cssH) {
  const safeW = Math.max(1, Math.floor(cssW || 0));
  const safeH = Math.max(1, Math.floor(cssH || 0));
  const aspect = safeW / safeH;
  if (!Number.isFinite(aspect) || aspect <= 0) {
    INTERNAL_WIDTH = BASE_INTERNAL_WIDTH;
    INTERNAL_HEIGHT = BASE_INTERNAL_HEIGHT;
    return { width: INTERNAL_WIDTH, height: INTERNAL_HEIGHT };
  }

  if (aspect > BASE_ASPECT) {
    const targetW = Math.round(BASE_INTERNAL_HEIGHT * aspect);
    INTERNAL_WIDTH = Math.min(MAX_INTERNAL_WIDTH, Math.max(BASE_INTERNAL_WIDTH, targetW));
    INTERNAL_HEIGHT = BASE_INTERNAL_HEIGHT;
  } else if (aspect < BASE_ASPECT) {
    const targetH = Math.round(BASE_INTERNAL_WIDTH / aspect);
    INTERNAL_WIDTH = BASE_INTERNAL_WIDTH;
    INTERNAL_HEIGHT = Math.max(BASE_INTERNAL_HEIGHT, targetH);
  } else {
    INTERNAL_WIDTH = BASE_INTERNAL_WIDTH;
    INTERNAL_HEIGHT = BASE_INTERNAL_HEIGHT;
  }

  return { width: INTERNAL_WIDTH, height: INTERNAL_HEIGHT };
}

// World layout
export const GROUND_Y = 390; // lethal ground level
export const PLATFORM_H = 16;

// Physics tuning
export const GRAVITY = 1800;
export const JUMP_VELOCITY = -630;
export const MAX_FALL_SPEED = 1800;

// Feel adjustments
export const FALL_GRAVITY_MULT = 1.20;
export const JUMP_CUT_MULT = 2.0;

export const JUMP_CUT_RAMP_PER_SEC = 18;
export const JUMP_IMPULSE_FX_SEC = 0.18; // jump trail burst duration

// Air control (W = slowfall, S = dive)
export const SLOWFALL_FUEL_MAX = 0.55;           // seconds of slowfall available
export const SLOWFALL_FUEL_REGEN_PER_SEC = 0.70; // fuel/sec regained while grounded
export const SLOWFALL_GRAVITY_MULT = 0.30;       // gravity multiplier while slowfalling
export const DIVE_GRAVITY_MULT = 4.2;            // extra gravity while diving (faster descent)
export const DIVE_MAX_FALL_SPEED = 4200;         // faster terminal speed when diving

// Duck (S held on a roof; a dive landing flows into it)
export const DUCK_HEIGHT_FRAC = 0.5;    // hitbox height while ducking (fraction of PLAYER_H)
export const DUCK_LAND_SQUAT_SEC = 0.2; // brief squat after a dive landing when S is already released

export const LAND_GRACE_SEC = 0.06;

// Runner speed
export const SPEED_START = 260;
export const SPEED_MAX = 480;
export const SPEED_RAMP_PER_SEC = 6;
export const SPEED_SMOOTH = 7.5;

// Platform generation
export const SAFE_CLEARANCE = 80;

export const PLATFORM_MIN_W = 160;
export const PLATFORM_MAX_W = 360;

export const GAP_MIN = 56;
export const GAP_MAX_EASY = 150;
export const GAP_MAX_HARD = 220;

export const HEIGHT_LEVELS = [0, 30, 60, 90, 120];
export const MAX_PLATFORM_STEP = 60;

// Collapsing rooftops
export const ROOF_COLLAPSE_TIME_EASY = 1.05;
export const ROOF_COLLAPSE_TIME_HARD = 0.55;
export const ROOF_FALL_GRAVITY = 2400;

// Tricks / spins + style
export const SPIN_DURATION = 0.30;
export const SPIN_COOLDOWN = 0.08;

// Player
export const PLAYER_W = 34;
export const PLAYER_H = 34;
export const PLAYER_X = 160;

// Dash (D)
export const DASH_DISTANCE = 140;       // how far the player jumps ahead (px)
export const DASH_CATCHUP_SPEED = 520;  // how fast the camera catches up after landing (px/sec)
export const DASH_COOLDOWN = 0.45;      // seconds between dashes
export const DASH_SPEED_BOOST = 820;    // added to world speed on dash (keep peak speed)
export const DASH_IMPULSE_DECAY = 2.4;  // decay rate for dash impulse (lower = longer)
export const DASH_OFFSET_SNAP_SPEED = 1800; // max dash offset speed (px/sec)
export const DASH_OFFSET_SMOOTH = 18;   // smoothing rate for dash offset
export const DASH_CAM_SMOOTH = 12;      // smoothing rate for camera offset
export const DASH_CAM_CATCHUP_BOOST = 3.0; // multiplier for camera smooth after landing
export const DASH_CAM_CATCHUP_SEC = 0.10;  // duration of post-landing catchup boost
export const DASH_PARALLAX_CAM_FACTOR = 0.2; // parallax camera influence (0 = fixed)
export const DASH_SLOWFALL_GRAVITY_BOOST = 0.18; // slight slowfall weakening during dash
export const DASH_CATCHUP_DELAY = 0.08; // delay after landing before camera catches up
export const DASH_MAX_CAM_LAG = 160;    // cap camera lag while airborne
export const DASH_VY_SCALE_START = 200; // start reducing dash distance above this |vy|
export const DASH_VY_SCALE_END = 1200;  // max reduction at this |vy|
export const DASH_VY_SCALE_MIN = 0.68;  // minimum dash scale at high |vy|
export const DASH_IMPULSE_FX_SEC = 0.20; // quick burst used to scale dash streaks

// Scoring
// Bonuses are measured in seconds of running: points = seconds x current speed (dash boost
// not counted), so they keep the same weight against distance as the run speeds up.
// (At 260 px/s 0.1 s = 26 points; at 480 px/s it is 48.)
export const DOUBLE_JUMP_BONUS_SEC = 0.05;     // air pot
export const BACKFLIP_BONUS_SEC = 0.25;        // air pot
export const DIVE_BONUS_SEC = 0.10;            // air pot
export const AIR_DASH_BONUS_SEC = 0.12;        // air pot; a dash on a roof scores nothing
export const BREAK_JIT_BONUS_SEC = 0.25;       // jump off a collapsing roof at the last moment
export const BILLBOARD_OVER_BONUS_SEC = 0.15;
export const BILLBOARD_DUCK_BONUS_SEC = 0.25;
export const BILLBOARD_SMASH_BONUS_SEC = 0.40;
export const CLOSE_CALL_BONUS_SEC = 0.30;      // land with only the front of Bob on the roof
export const CLOSE_CALL_OVERLAP_FRAC = 0.6;    // ...at most this share of his width
export const CLUTCH_FLIP_BONUS_SEC = 0.30;     // a backflip that finishes just before landing
export const CLUTCH_FLIP_WINDOW_SEC = 0.12;    // ...within this many seconds

// Air multiplier on a jump's distance (paid on a safe landing):
// 1 + FLIP_MULT_STEP per backflip + COMBO_MULT_STEP per combo link, capped at AIR_MULT_MAX.
// A combo link is a clean tricked landing (at least one backflip, none still spinning).
// A plain or mid-flip landing resets the combo.
export const FLIP_MULT_STEP = 1;
export const COMBO_MULT_STEP = 0.5;
export const AIR_MULT_MAX = 4;
export const BILLBOARD_BOUNCE_VY = 900; // downward kick when bouncing off a billboard
export const LOW_BILLBOARD_CHANCE = 0.45; // share of billboards hung at head height (duck under / jump over)

// Input grace
export const COYOTE_TIME_SEC = 0.2;
export const JUMP_BUFFER_SEC = 0.13;
export const BREAK_JUMP_GRACE_SEC = 0.3;

// Death cinematic (game over) timing
export const DEATH_CINEMATIC = {
  ZOOM_IN: 0.70,      // seconds to zoom toward Bob
  ARM_DELAY: 0.28,    // wait before the arm starts moving
  ARM_REACH: 0.70,    // extend across to Bob
  DRAG: 0.90,         // pull Bob off-screen
  ARM_RETRACT: 0.45,  // arm slides back out
};

// Skipping the death cinematic: a jump press skips it once it has played this long
// (so a player still mashing jump at the moment of death doesn't skip by accident).
export const DEATH_SKIP_UNLOCK_SEC = 1.0;
// After a skip, the run summary (drop-in, score count-up, wait before RESET) runs this many times faster.
export const SKIP_SUMMARY_SPEED = 3;

export const DEATH_CINEMATIC_TOTAL =
  DEATH_CINEMATIC.ARM_DELAY +
  DEATH_CINEMATIC.ARM_REACH +
  DEATH_CINEMATIC.DRAG +
  DEATH_CINEMATIC.ARM_RETRACT;

export const BREAK_SHARDS = {
  COUNT: 18,
  LIFE: 1.1,
  GRAVITY: 2600,
  DRAG: 0.93,
};

export const RESTART_FLYBY_SEC = 0.9;
export const RESTART_FLYBY_HOLD_SEC = 0.18;
export const RESTART_FLYBY_FADE_SEC = 0.22;

// Game-over screen intro: the run summary drops in from the top, then the
// leaderboard slides in from the right. The score count-up starts once the summary lands.
export const RUN_SUMMARY_DROP_SEC = 0.45;
export const LEADERBOARD_SLIDE_DELAY_SEC = 0.15;
export const LEADERBOARD_SLIDE_SEC = 0.4;

// Start screen push-in (arm nudges Bob into place)
export const START_PUSH = {
  ARM_DELAY: 0.0,
  ARM_REACH: 0.12,
  PUSH: 0.8,
  ARM_RETRACT: 0.8,
};

export const START_PUSH_TOTAL =
  START_PUSH.ARM_DELAY +
  START_PUSH.ARM_REACH +
  START_PUSH.PUSH +
  START_PUSH.ARM_RETRACT;

// Menu zoom factor (menu view -> gameplay view)
export const MENU_START_ZOOM = 2.8;


// Dive feel / animation timing
// Used by game/player.js for phase timing, and by render/player.js for stable pose targets.
export const DIVE_ANTICIPATION_SEC = 0.035; // seconds of anticipation before full dive commit
export const DIVE_SPIKE_ANGLE_RAD = 0.82;  // visual target angle for dive commit (~47 degrees)

// Render-only pose tuning (keep here so it’s easy to tweak without hunting values)
export const DIVE_SILHOUETTE_SHOULDER_W = 0.74;
export const DIVE_SILHOUETTE_MID_W = 0.54;
export const DIVE_SILHOUETTE_TIP_W = 0.14;
