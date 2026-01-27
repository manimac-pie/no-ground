// No Ground — rendering only
// Draws the current game state to the provided 2D context.
// Includes subtle camera shake + squash/stretch for feel.

import { world } from "./game.js";

// Simple internal renderer state (kept here so game logic stays clean)
let prevOnGround = true;
let prevGameOver = false;

let shakeTime = 0;
let shakeAmp = 0;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function triggerShake(seconds, amplitudePx) {
  shakeTime = Math.max(shakeTime, seconds);
  shakeAmp = Math.max(shakeAmp, amplitudePx);
}

export function render(ctx, state) {
  const W = world.INTERNAL_WIDTH;
  const H = world.INTERNAL_HEIGHT;

  const p = state.player;

  // Detect events for feel
  const landed = !prevOnGround && p.onGround;
  const justDied = !prevGameOver && state.gameOver;

  if (landed) {
    // Tiny landing impact
    triggerShake(0.08, 3.0);
  }

  if (justDied) {
    // Slightly stronger hit on death
    triggerShake(0.12, 5.0);
  }

  prevOnGround = p.onGround;
  prevGameOver = state.gameOver;

  // Compute camera shake offset
  let ox = 0;
  let oy = 0;
  if (shakeTime > 0) {
    // Decay
    shakeTime = Math.max(0, shakeTime - 1 / 60);
    const t = shakeTime;

    // Ease-out amplitude
    const a = shakeAmp * clamp(t / 0.12, 0, 1);

    // Small random jitter (fine for this minimalist style)
    ox = (Math.random() * 2 - 1) * a;
    oy = (Math.random() * 2 - 1) * a;

    // Fade amplitude down over time
    shakeAmp *= 0.92;
    if (shakeTime === 0) shakeAmp = 0;
  }

  // Background
  ctx.setTransform(ctx.getTransform()); // keep current transform from main.js
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W, H);

  // Apply camera offset for world objects
  ctx.save();
  ctx.translate(ox, oy);

  // Platforms (preferred). Fallback: solid ground.
  if (Array.isArray(state.platforms)) {
    ctx.fillStyle = "#2a2a2a";
    for (const plat of state.platforms) {
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }

    // Optional faint baseline for readability
    ctx.fillStyle = "rgba(242,242,242,0.08)";
    ctx.fillRect(0, world.GROUND_Y + world.PLATFORM_H, W, 1);
  } else {
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, world.GROUND_Y, W, H - world.GROUND_Y);
  }

  // Player (squash/stretch)
  // - Stretch a bit while moving up
  // - Squash a bit while moving down
  // - Extra squash on landing
  const vy = p.vy ?? 0;

  const up01 = clamp(-vy / 900, 0, 1);
  const down01 = clamp(vy / 900, 0, 1);

  let sx = 1;
  let sy = 1;

  // Base stretch/squash
  sy += up01 * 0.14;
  sx -= up01 * 0.08;

  sy -= down01 * 0.12;
  sx += down01 * 0.08;

  // Landing punch
  if (landed) {
    sy -= 0.10;
    sx += 0.10;
  }

  // Clamp to avoid extreme distortion
  sx = clamp(sx, 0.82, 1.18);
  sy = clamp(sy, 0.82, 1.22);

  // Draw scaled around player center
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;

  ctx.fillStyle = "#f2f2f2";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx, sy);
  ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  ctx.restore();

  // End world transform
  ctx.restore();

  // Minimal HUD (no camera shake)
  ctx.fillStyle = "#f2f2f2";
  ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const dist = Math.floor(state.distance);
  ctx.fillText(`Distance: ${dist}`, 16, 28);

  ctx.font = "400 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(`Jumps: ${p.jumpsRemaining}`, 16, 50);

  // Overlays
  if (!state.running && !state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f2f2f2";
    ctx.font = "700 34px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("NO GROUND", 24, 70);

    ctx.font = "400 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("Tap / click / Space to start", 24, 104);
    ctx.fillText("Double jump enabled", 24, 128);
  }

  if (state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f2f2f2";
    ctx.font = "700 34px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("You fell.", 24, 70);

    ctx.font = "400 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(`Distance: ${dist}`, 24, 104);
    ctx.fillText("Tap / click / Space to restart", 24, 128);
  }
}
