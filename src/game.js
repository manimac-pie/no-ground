// No Ground — core game state and update logic
// Endless runner MVP:
// - Player stays at a fixed x; world scrolls left
// - Platforms with gaps are generated procedurally
// - Double jump + gravity
// - Quality-of-life: coyote time + jump buffer
// - Feel: variable jump height (jump-cut) + slightly faster falls
//
// This module owns game state + physics.
// It does NOT draw or read DOM events.

const INTERNAL_WIDTH = 800;
const INTERNAL_HEIGHT = 450;

// Physics tuning (flat, forgiving MVP values)
const GRAVITY = 1800; // px/s^2
const JUMP_VELOCITY = -800; // px/s (negative is up)
const MAX_FALL_SPEED = 1800;

// Feel adjustments
const FALL_GRAVITY_MULT = 1.25; // stronger gravity when falling
const JUMP_CUT_MULT = 2.2; // stronger gravity when jump is released early while rising

// Runner speed (world moves left)
const SPEED_START = 260; // px/s
const SPEED_MAX = 520;
const SPEED_RAMP_PER_SEC = 6; // px/s added per second of survival

// Platforms
const GROUND_Y = 390;
const PLATFORM_H = 24;

const PLATFORM_MIN_W = 140;
const PLATFORM_MAX_W = 320;

const GAP_MIN = 60;
const GAP_MAX_EASY = 160;
const GAP_MAX_HARD = 260;

// Height offsets from base ground (smaller = higher platform)
const HEIGHT_LEVELS = [0, 40, 80];

// Player
const PLAYER_W = 34;
const PLAYER_H = 34;
const PLAYER_X = 160;

// Feel-good helpers
const COYOTE_TIME_SEC = 0.11; // grace window after leaving a platform
const JUMP_BUFFER_SEC = 0.11; // grace window after pressing jump early

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

export function createGame() {
  const state = {
    running: false,
    gameOver: false,

    time: 0,
    distance: 0,

    // World scroll speed
    speed: SPEED_START,

    // Buffered input (set when jump is pressed, consumed when possible)
    jumpBuffer: 0,

    // For variable jump height
    jumpHeld: false,

    player: {
      x: PLAYER_X,
      y: GROUND_Y - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      vy: 0,
      onGround: true,
      jumpsRemaining: 2,
      coyote: 0,
    },

    // Platforms are axis-aligned rectangles:
    // { x, y, w, h }
    platforms: [],
  };

  function rightmostPlatformX() {
    let best = -Infinity;
    for (const p of state.platforms) {
      best = Math.max(best, p.x + p.w);
    }
    return best;
  }

  function difficulty01() {
    // 0 -> easy, 1 -> hard; ramps with distance
    // Tune: hits ~1 around 10k distance.
    return clamp(state.distance / 10000, 0, 1);
  }

  function spawnNextPlatform() {
    const d = difficulty01();
    const lastRight = rightmostPlatformX();

    // Gap grows with difficulty.
    const gapMax = GAP_MAX_EASY + (GAP_MAX_HARD - GAP_MAX_EASY) * d;
    const gap = randRange(GAP_MIN, gapMax);

    const w = randRange(PLATFORM_MIN_W, PLATFORM_MAX_W);

    // Height variation grows with difficulty.
    // Early: mostly ground level. Later: more varied.
    let y = GROUND_Y;
    if (d > 0.15) {
      const level = d < 0.45 ? pick([0, 40]) : pick(HEIGHT_LEVELS);
      y = GROUND_Y - level;
    }

    // Keep platforms within a safe vertical range.
    y = clamp(y, 220, GROUND_Y);

    state.platforms.push({
      x: lastRight + gap,
      y,
      w,
      h: PLATFORM_H,
    });
  }

  function resetPlatforms() {
    state.platforms.length = 0;

    // Start with a safe, long platform.
    state.platforms.push({
      x: 0,
      y: GROUND_Y,
      w: INTERNAL_WIDTH + 260,
      h: PLATFORM_H,
    });

    // Seed a few more platforms ahead so gameplay starts immediately.
    while (rightmostPlatformX() < INTERNAL_WIDTH + 600) {
      spawnNextPlatform();
    }
  }

  function reset() {
    state.running = false;
    state.gameOver = false;
    state.time = 0;
    state.distance = 0;
    state.speed = SPEED_START;
    state.jumpBuffer = 0;
    state.jumpHeld = false;

    state.player.x = PLAYER_X;
    state.player.y = GROUND_Y - PLAYER_H;
    state.player.vy = 0;
    state.player.onGround = true;
    state.player.jumpsRemaining = 2;
    state.player.coyote = COYOTE_TIME_SEC;

    resetPlatforms();
  }

  function start() {
    if (state.gameOver) reset();
    state.running = true;
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
  }

  function performJump() {
    const p = state.player;

    p.vy = JUMP_VELOCITY;
    p.onGround = false;
    p.coyote = 0; // consume coyote window once we jump
    p.jumpsRemaining -= 1;
  }

  function canJumpNow() {
    const p = state.player;

    // Rule:
    // - If you still have both jumps, treat it as the "first jump".
    //   It is allowed if grounded OR within coyote time.
    // - If you have 1 jump left, you can use it mid-air any time.
    if (p.jumpsRemaining <= 0) return false;

    if (p.jumpsRemaining === 2) {
      return p.onGround || p.coyote > 0;
    }

    return true;
  }

  function tryConsumeBufferedJump() {
    if (state.jumpBuffer <= 0) return false;
    if (!canJumpNow()) return false;

    state.jumpBuffer = 0;
    performJump();
    return true;
  }

  function scrollWorld(dt) {
    const dx = state.speed * dt;
    for (const p of state.platforms) {
      p.x -= dx;
    }

    // Remove platforms that are fully off-screen.
    while (state.platforms.length > 0) {
      const first = state.platforms[0];
      if (first.x + first.w < -200) state.platforms.shift();
      else break;
    }

    // Ensure we always have enough ahead.
    while (rightmostPlatformX() < INTERNAL_WIDTH + 600) {
      spawnNextPlatform();
    }
  }

  function integratePlayer(dt) {
    const p = state.player;
    const wasOnGround = p.onGround;

    // Gravity (with feel adjustments)
    // - Falling accelerates a bit faster (snappier landings)
    // - Releasing jump early increases gravity while rising (variable jump height)
    let g = GRAVITY;
    if (p.vy > 0) {
      g *= FALL_GRAVITY_MULT;
    } else if (p.vy < 0 && !state.jumpHeld) {
      g *= JUMP_CUT_MULT;
    }

    p.vy += g * dt;
    if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;

    const prevY = p.y;
    p.y += p.vy * dt;

    // Landing / platform collision (only from above)
    p.onGround = false;

    const px1 = p.x;
    const px2 = p.x + p.w;
    const prevBottom = prevY + p.h;
    const bottom = p.y + p.h;

    if (p.vy >= 0) {
      for (const plat of state.platforms) {
        const top = plat.y;
        const left = plat.x;
        const right = plat.x + plat.w;

        const overlapsX = px2 > left && px1 < right;
        const crossedTop = prevBottom <= top && bottom >= top;

        if (overlapsX && crossedTop) {
          p.y = top - p.h;
          p.vy = 0;
          p.onGround = true;
          p.jumpsRemaining = 2;
          p.coyote = COYOTE_TIME_SEC;
          break;
        }
      }
    }

    if (!p.onGround && wasOnGround) {
      p.coyote = COYOTE_TIME_SEC;
    }

    // Lose condition
    if (p.y > INTERNAL_HEIGHT + 200) {
      endGame();
    }
  }

  function update(dt, input) {
    state.time += dt;

    // Decay timers
    state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
    state.player.coyote = Math.max(0, state.player.coyote - dt);

    const jumpPressed = input?.consumeJumpPressed?.() === true;
    state.jumpHeld = input?.jumpHeld === true;

    if (!state.running) {
      if (jumpPressed) {
        if (state.gameOver) reset();
        start();

        // Responsive start
        state.jumpBuffer = JUMP_BUFFER_SEC;
        tryConsumeBufferedJump();
      }
      return state;
    }

    state.speed = clamp(state.speed + SPEED_RAMP_PER_SEC * dt, SPEED_START, SPEED_MAX);

    if (jumpPressed) {
      state.jumpBuffer = JUMP_BUFFER_SEC;
    }

    state.distance += state.speed * dt;

    scrollWorld(dt);
    integratePlayer(dt);

    // After integration, consume buffered jump if possible
    tryConsumeBufferedJump();

    return state;
  }

  // Initialize
  reset();

  return {
    state,
    reset,
    update,
  };
}

export const world = {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  GROUND_Y,
  PLATFORM_H,
};
