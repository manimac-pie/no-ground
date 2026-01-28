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

// Air gates
export const GATE_SPAWN_CHANCE_EASY = 0.10;
export const GATE_SPAWN_CHANCE_HARD = 0.22;
export const GATE_W = 58;
export const GATE_H = 58;

// Landing quality
export const CLEAN_MIN_PROG = 0.82;
export const PERFECT_MIN_PROG = 0.93;
export const STYLE_CLEAN_BONUS = 20;
export const STYLE_PERFECT_BONUS = 45;

// Player
export const PLAYER_W = 34;
export const PLAYER_H = 34;
export const PLAYER_X = 160;

// Input grace
export const COYOTE_TIME_SEC = 0.13;
export const JUMP_BUFFER_SEC = 0.13;