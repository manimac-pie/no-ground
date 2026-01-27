// No Ground — rendering only
// Draws the current game state to the provided 2D context.
// Visual polish:
// - cohesive palette + subtle gradient
// - simple parallax layers (no images)
// - platform highlight + shadow
// - smoother camera shake
// - landing dust particles
// - player squash/stretch retained

import { world } from "./game.js";

// Palette (flat, minimal)
const COLORS = {
  bgTop: "#0f1116",
  bgBottom: "#07080b",
  fog: "rgba(242,242,242,0.05)",
  platform: "#2a2a2a",
  platformShadow: "rgba(0,0,0,0.22)",
  platformEdge: "rgba(242,242,242,0.12)",
  player: "#f2f2f2",
  hudBg: "rgba(0,0,0,0.35)",
  hudText: "#f2f2f2",
  overlay: "rgba(0,0,0,0.55)",
};

// Simple internal renderer state (kept here so game logic stays clean)
let prevOnGround = true;
let prevGameOver = false;

// Smooth-ish camera shake state
let shakeT = 0; // seconds left
let shakeAmp = 0; // px
let shakePhase = 0;

// Particles (landing dust)
const particles = [];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function triggerShake(seconds, amplitudePx) {
  shakeT = Math.max(shakeT, seconds);
  shakeAmp = Math.max(shakeAmp, amplitudePx);
}

function spawnDust(x, y) {
  // A few tiny rectangles that fly out and fade quickly
  const count = 10;
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() * 2 - 1) * 140,
      vy: -Math.random() * 220,
      life: 0.22 + Math.random() * 0.10,
      age: 0,
      size: 2 + Math.random() * 2,
    });
  }
}

function stepParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }

    // simple gravity
    p.vy += 900 * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    const a = 1 - p.age / p.life;
    ctx.fillStyle = `rgba(242,242,242,${(0.28 * a).toFixed(3)})`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
}

function drawBackground(ctx, W, H) {
  // Vertical gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Very subtle fog band near horizon
  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, world.GROUND_Y - 120, W, 120);
}

function drawParallax(ctx, W, H, distance) {
  // Very simple abstract silhouettes: bands of rectangles that drift.
  // Uses distance to create slow movement; no dependence on game speed.

  // Layer 1 (far)
  const off1 = -((distance * 0.12) % (W + 240));
  ctx.fillStyle = "rgba(242,242,242,0.04)";
  for (let x = off1; x < W + 240; x += 240) {
    const h = 90;
    ctx.fillRect(x, world.GROUND_Y - 210, 180, h);
  }

  // Layer 2 (mid)
  const off2 = -((distance * 0.22) % (W + 200));
  ctx.fillStyle = "rgba(242,242,242,0.06)";
  for (let x = off2; x < W + 200; x += 200) {
    const h = 120;
    ctx.fillRect(x, world.GROUND_Y - 165, 140, h);
  }

  // Subtle scanline accent (very faint)
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(0, 0, W, 1);
}

function drawVignette(ctx, W, H) {
  // Lightweight vignette: darken edges with rectangles
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(0, 0, W, 18);
  ctx.fillRect(0, H - 18, W, 18);
  ctx.fillRect(0, 0, 18, H);
  ctx.fillRect(W - 18, 0, 18, H);
}

export function render(ctx, state) {
  const W = world.INTERNAL_WIDTH;
  const H = world.INTERNAL_HEIGHT;

  const player = state.player;

  // Timing for purely visual effects: approximate 60fps
  // (Kept here so we don't have to thread dt through render.)
  const dt = 1 / 60;

  // Detect events for feel
  const landed = !prevOnGround && player.onGround;
  const justDied = !prevGameOver && state.gameOver;

  if (landed) {
    triggerShake(0.10, 4.0);
    // Dust at feet
    spawnDust(player.x + player.w * 0.5, player.y + player.h);
  }
  if (justDied) {
    triggerShake(0.12, 6.0);
  }

  prevOnGround = player.onGround;
  prevGameOver = state.gameOver;

  // Update particle sim
  stepParticles(dt);

  // Compute smoother camera shake offset (sin/cos instead of random jitter)
  let ox = 0;
  let oy = 0;
  if (shakeT > 0) {
    shakeT = Math.max(0, shakeT - dt);
    shakePhase += dt * 48;

    const t01 = clamp(shakeT / 0.12, 0, 1);
    const amp = shakeAmp * t01;

    ox = Math.sin(shakePhase) * amp;
    oy = Math.cos(shakePhase * 1.13) * amp;

    // decay amplitude
    shakeAmp *= 0.92;
    if (shakeT === 0) shakeAmp = 0;
  }

  // Background
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H);
  drawParallax(ctx, W, H, state.distance || 0);

  // Apply camera offset for world objects
  ctx.save();
  ctx.translate(ox, oy);

  // Platforms
  if (Array.isArray(state.platforms)) {
    // Shadow pass
    ctx.fillStyle = COLORS.platformShadow;
    for (const plat of state.platforms) {
      ctx.fillRect(plat.x, plat.y + 6, plat.w, plat.h);
    }

    // Main platforms
    ctx.fillStyle = COLORS.platform;
    for (const plat of state.platforms) {
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

      // top edge highlight
      ctx.fillStyle = COLORS.platformEdge;
      ctx.fillRect(plat.x, plat.y, plat.w, 2);
      ctx.fillStyle = COLORS.platform;
    }

    // Baseline to help readability
    ctx.fillStyle = "rgba(242,242,242,0.06)";
    ctx.fillRect(0, world.GROUND_Y + world.PLATFORM_H, W, 1);
  } else {
    // Fallback solid ground
    ctx.fillStyle = COLORS.platformShadow;
    ctx.fillRect(0, world.GROUND_Y + 6, W, H - world.GROUND_Y);
    ctx.fillStyle = COLORS.platform;
    ctx.fillRect(0, world.GROUND_Y, W, H - world.GROUND_Y);
    ctx.fillStyle = COLORS.platformEdge;
    ctx.fillRect(0, world.GROUND_Y, W, 2);
  }

  // Particles (world space)
  drawParticles(ctx);

  // Player (squash/stretch)
  const vy = player.vy ?? 0;
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

  sx = clamp(sx, 0.82, 1.18);
  sy = clamp(sy, 0.82, 1.22);

  const cx = player.x + player.w / 2;
  const cy = player.y + player.h / 2;

  // Slight tilt based on velocity (subtle)
  const rot = clamp(vy / 1800, -1, 1) * 0.08;

  // Player with subtle outline/glow
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sx, sy);

  // Soft glow (works well on flat backgrounds)
  ctx.shadowColor = "rgba(242,242,242,0.20)";
  ctx.shadowBlur = 10;

  // Fill
  ctx.fillStyle = COLORS.player;
  ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);

  // Crisp 1px outline (disable shadow so it stays sharp)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(242,242,242,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-player.w / 2 + 0.5, -player.h / 2 + 0.5, player.w - 1, player.h - 1);

  ctx.restore();

  // End world transform
  ctx.restore();

  // HUD (no shake)
  ctx.save();
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(10, 10, 190, 54);

  ctx.fillStyle = COLORS.hudText;
  ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const dist = Math.floor(state.distance || 0);
  ctx.fillText(`Distance ${dist}`, 20, 32);

  ctx.font = "500 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(`Jumps ${player.jumpsRemaining}`, 20, 52);
  ctx.restore();

  // Vignette on top
  drawVignette(ctx, W, H);

  // Overlays
  if (!state.running && !state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.hudText;
    ctx.font = "800 40px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("NO GROUND", 24, 78);

    ctx.font = "500 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("Tap / click / Space to start", 24, 114);
    ctx.fillText("Double jump enabled", 24, 140);
  }

  if (state.gameOver) {
    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = COLORS.hudText;
    ctx.font = "800 38px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("You fell.", 24, 78);

    ctx.font = "500 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(`Distance ${dist}`, 24, 114);
    ctx.fillText("Tap / click / Space to restart", 24, 140);
  }
}
