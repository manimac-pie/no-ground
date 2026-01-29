// src/game/constants.js

export const INTERNAL_WIDTH = 800;
export const INTERNAL_HEIGHT = 450;

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

// Air control (W = float, S = dive)
export const FLOAT_FUEL_MAX = 0.38;            // seconds of float available
export const FLOAT_FUEL_REGEN_PER_SEC = 0.70;  // fuel/sec regained while grounded
export const FLOAT_GRAVITY_MULT = 0.30;        // gravity multiplier while floating
export const DIVE_GRAVITY_MULT = 2.35;         // extra gravity while diving (faster descent)
export const DIVE_MAX_FALL_SPEED = 2600;       // faster terminal speed when diving

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
export const STYLE_BASE = 25;
export const STYLE_COMBO_BONUS = 10;

// Landing quality
export const CLEAN_MIN_PROG = 0.82;
export const PERFECT_MIN_PROG = 0.93;
export const STYLE_CLEAN_BONUS = 20;
export const STYLE_PERFECT_BONUS = 45;

// Player
export const PLAYER_W = 34;
export const PLAYER_H = 34;
export const PLAYER_X = 160;

// Dash (D)
export const DASH_DISTANCE = 140;       // how far the player jumps ahead (px)
export const DASH_CATCHUP_SPEED = 520;  // how fast the camera catches up after landing (px/sec)
export const DASH_COOLDOWN = 0.45;      // seconds between dashes
export const DASH_OFFSET_SNAP_SPEED = 1800; // max dash offset speed (px/sec)
export const DASH_OFFSET_SMOOTH = 18;   // smoothing rate for dash offset
export const DASH_CAM_SMOOTH = 12;      // smoothing rate for camera offset
export const DASH_CAM_CATCHUP_BOOST = 3.0; // multiplier for camera smooth after landing
export const DASH_CAM_CATCHUP_SEC = 0.10;  // duration of post-landing catchup boost
export const DASH_PARALLAX_CAM_FACTOR = 0.2; // parallax camera influence (0 = fixed)
export const DASH_FLOAT_GRAVITY_BOOST = 0.18; // slight float weakening during dash
export const DASH_CATCHUP_DELAY = 0.08; // delay after landing before camera catches up
export const DASH_MAX_CAM_LAG = 160;    // cap camera lag while airborne
export const DASH_VY_SCALE_START = 200; // start reducing dash distance above this |vy|
export const DASH_VY_SCALE_END = 1200;  // max reduction at this |vy|
export const DASH_VY_SCALE_MIN = 0.68;  // minimum dash scale at high |vy|
export const DASH_IMPULSE_FX_SEC = 0.20; // quick burst used to scale dash streaks

// Input grace
export const COYOTE_TIME_SEC = 0.13;
export const JUMP_BUFFER_SEC = 0.13;

// Dive feel / animation timing
// Used by game/player.js for phase timing, and by render/player.js for stable pose targets.
export const DIVE_ANTICIPATION_SEC = 0.08; // seconds of anticipation before full dive commit
export const DIVE_SPIKE_ANGLE_RAD = 0.82;  // visual target angle for dive commit (~47 degrees)

// Render-only pose tuning (keep here so it’s easy to tweak without hunting values)
export const DIVE_SILHOUETTE_SHOULDER_W = 0.74;
export const DIVE_SILHOUETTE_MID_W = 0.54;
export const DIVE_SILHOUETTE_TIP_W = 0.14;
