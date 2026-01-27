
import { world } from "./game.js";

// Palette (flat, minimal)
const COLORS = {
  bgTop: "#0f1116",
  bgBottom: "#07080b",
  fog: "rgba(242,242,242,0.035)",
  accent: "rgba(120,205,255,0.95)",
  platform: "#2a2a2a",
  platformShadow: "rgba(0,0,0,0.22)",
  platformEdge: "rgba(242,242,242,0.12)",
  roofTop: "rgba(56,58,64,0.85)",
  roofSide: "rgba(32,34,40,0.95)",
  roofDetail: "rgba(242,242,242,0.10)",
  buildingA: "rgba(26,28,34,0.95)",
  buildingB: "rgba(20,22,28,0.95)",
  windowOn: "rgba(120,205,255,0.22)",
  windowOff: "rgba(242,242,242,0.06)",
  player: "#f2f2f2",
  hudBg: "rgba(0,0,0,0.35)",
  hudText: "#f2f2f2",
  overlay: "rgba(0,0,0,0.55)",
  menuPanel: "rgba(0,0,0,0.42)",
  groundCore: "rgba(255,85,110,0.95)",
  groundGlow: "rgba(255,85,110,0.22)",
  dangerTint: "rgba(255,85,110,0.10)",
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

// Stable per-platform seeds so windows/details don't flicker as platforms scroll.
const platformSeed = new WeakMap();
let platformSeedCounter = 1;

function getPlatformSeed(plat) {
  let s = platformSeed.get(plat);
  if (s === undefined) {
    // Assign a stable seed for the lifetime of this platform object.
    s = platformSeedCounter++;
    platformSeed.set(plat, s);
  }
  return s;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hash01(n) {
  // Deterministic pseudo-random in [0,1)
  const x = Math.sin(n * 999.123) * 43758.5453;
  return x - Math.floor(x);
}

function pickBuildingColor(seed) {
  return hash01(seed) < 0.5 ? COLORS.buildingA : COLORS.buildingB;
}

function shadeRect(ctx, x, y, w, h, topColor, bottomColor) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, topColor);
  g.addColorStop(1, bottomColor);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawRoof(ctx, plat, seed) {
  // Roof is the platform surface (collision unchanged).
  // We add a cap/parapet and some details *within* the same bounds.
  const x = plat.x;
  const y = plat.y;
  const w = plat.w;
  const h = plat.h;

  // Cap thickness (visual only)
  const cap = Math.max(6, Math.min(12, h + 6));

  // Roof shadow (slightly offset)
  ctx.fillStyle = COLORS.platformShadow;
  ctx.fillRect(x, y + 6, w, h);

  // Roof base with subtle vertical shading
  shadeRect(ctx, x, y, w, h, "rgba(46,48,54,0.95)", COLORS.roofSide);

  // Top cap strip (reads as parapet/trim)
  ctx.fillStyle = COLORS.roofTop;
  ctx.fillRect(x, y, w, Math.min(3, h));

  // Crisp roof edge highlight (safe surface indicator)
  ctx.fillStyle = COLORS.platformEdge;
  ctx.fillRect(x, y, w, 2);

  // Parapet posts (sparse)
  if (w > 120 && hash01(seed * 3.1) > 0.25) {
    const postCount = Math.min(7, Math.max(2, Math.floor(w / 90)));
    ctx.fillStyle = "rgba(242,242,242,0.07)";
    for (let i = 0; i < postCount; i++) {
      const px = x + (w * (i + 1)) / (postCount + 1);
      ctx.fillRect(px, y - 6, 2, 6);
    }
  }

  // Rooftop details (vents/skylight) — keep inside roof area
  const r = hash01(seed * 8.7);
  if (w > 140 && r > 0.35) {
    ctx.fillStyle = COLORS.roofDetail;

    // Vent
    const vx = x + w * (0.20 + 0.55 * hash01(seed * 1.11));
    const vy = y + 3;
    const vw = Math.min(26, Math.max(14, w * 0.10));
    const vh = Math.max(6, h - 6);
    ctx.fillRect(vx, vy, vw, vh);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(vx, vy, vw, 2);

    // Optional skylight
    if (hash01(seed * 2.77) > 0.70 && w > 200) {
      const sx = x + w * (0.55 + 0.25 * hash01(seed * 6.13));
      const sw = Math.min(40, Math.max(18, w * 0.12));
      ctx.fillStyle = "rgba(120,205,255,0.10)";
      ctx.fillRect(sx, y + 4, sw, Math.max(6, h - 8));
      ctx.fillStyle = "rgba(242,242,242,0.10)";
      ctx.fillRect(sx, y + 4, sw, 1);
    }
  }

  // Occasional antenna stays (uses existing style)
  if (hash01(seed * 1.9) > 0.85) {
    ctx.fillStyle = "rgba(242,242,242,0.10)";
    const ax = x + w * (0.25 + 0.5 * hash01(seed * 2.3));
    ctx.fillRect(ax, y - 16, 2, 16);
    ctx.fillRect(ax - 4, y - 16, 10, 2);
  }
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
  // Abstract silhouettes, smaller and softer.
  // Use distance for drift; keep subtle so it doesn't read as "big rectangles".

  const horizon = world.GROUND_Y - 24;

  // Far layer
  const off1 = -((distance * 0.10) % (W + 320));
  ctx.fillStyle = "rgba(242,242,242,0.028)";
  for (let x = off1; x < W + 320; x += 320) {
    ctx.fillRect(x + 40, horizon - 190, 160, 70);
    ctx.fillRect(x + 10, horizon - 140, 220, 60);
  }

  // Mid layer
  const off2 = -((distance * 0.18) % (W + 260));
  ctx.fillStyle = "rgba(242,242,242,0.040)";
  for (let x = off2; x < W + 260; x += 260) {
    ctx.fillRect(x + 30, horizon - 150, 140, 60);
    ctx.fillRect(x + 0, horizon - 105, 200, 55);
  }

  // Tiny stars/dust (static-ish)
  ctx.fillStyle = "rgba(242,242,242,0.035)";
  for (let i = 0; i < 28; i++) {
    const sx = (i * 97) % W;
    const sy = 24 + ((i * 53) % 110);
    ctx.fillRect(sx, sy, 1, 1);
  }
}

function drawLethalGround(ctx, W, H, t, danger01) {
  // A hostile "energy" band that represents the lethal ground.
  const y = world.GROUND_Y;

  // Base dark area below ground
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, y, W, H - y);

  // Glow gradient rising above the ground line
  const g = ctx.createLinearGradient(0, y - 90, 0, y + 30);
  g.addColorStop(0, "rgba(255,85,110,0)");
  g.addColorStop(0.55, COLORS.groundGlow);
  g.addColorStop(1, "rgba(255,85,110,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 90, W, 120);

  // Bright ground line
  ctx.fillStyle = "rgba(255,85,110,0.55)";
  ctx.fillRect(0, y, W, 2);

  // Animated hazard stripes (subtle)
  const stripeH = 10;
  const speed = 60;
  const off = -((t * speed) % 40);
  ctx.save();
  ctx.globalAlpha = 0.22 + 0.28 * danger01;
  ctx.fillStyle = COLORS.groundCore;
  for (let x = off; x < W + 40; x += 40) {
    ctx.fillRect(x, y + 10, 20, stripeH);
    ctx.fillRect(x + 10, y + 26, 20, stripeH);
  }
  ctx.restore();

  // Proximity tint overlay (makes low altitude feel scary)
  if (danger01 > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.35 * danger01;
    ctx.fillStyle = COLORS.dangerTint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function drawVignette(ctx, W, H) {
  // Smooth vignette using a radial gradient.
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.20, W / 2, H / 2, Math.max(W, H) * 0.70);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawPlayerShadow(ctx, player) {
  // Soft ellipse under the player to anchor it to the world.
  const cx = player.x + player.w / 2;
  const y = (player.y + player.h) + 4;
  const w = player.w * 0.90;
  const h = 6;

  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(w / 2, h / 2);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

function drawMenuPanel(ctx, x, y, w, h) {
  // Soft rounded panel with subtle border
  ctx.save();
  ctx.fillStyle = COLORS.menuPanel;
  roundRect(ctx, x, y, w, h, 16);

  ctx.strokeStyle = "rgba(242,242,242,0.10)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 16);
  ctx.stroke();
  ctx.restore();
}

function centerText(ctx, text, x, y) {
  const m = ctx.measureText(text);
  ctx.fillText(text, x - m.width / 2, y);
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawRunner(ctx, player, t, landed, stateRunning, speed) {
  // Local space: origin at player center after transforms in caller.
  const w = player.w;
  const h = player.h;

  const vy = player.vy ?? 0;
  const onGround = player.onGround === true;
  const running = stateRunning && onGround;

  // Animation phase
  // Scale leg cadence with horizontal speed so it feels coherent.
  const s = Number.isFinite(speed) ? speed : 0;
  const runRate = clamp(6 + (s / 480) * 10, 6, 18); // steps/sec
  const phase = t * runRate * Math.PI * 2;

  // Body dimensions (kept inside hitbox)
  const bodyW = w * 0.70;
  const bodyH = h * 0.78;
  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;

  // Legs/feet
  const stride = running ? Math.sin(phase) : 0;
  const stride2 = running ? Math.sin(phase + Math.PI) : 0;

  // When airborne: tuck legs on ascent, extend slightly on fall
  const up01 = clamp(-vy / 900, 0, 1);
  const down01 = clamp(vy / 900, 0, 1);

  const legBaseY = bodyY + bodyH * 0.45;
  const legLift = running ? (Math.abs(stride) * h * 0.08) : 0;

  const airTuck = up01 * h * 0.10;
  const airExtend = down01 * h * 0.06;

  const footY = legBaseY + bodyH * 0.40 - legLift - airTuck + airExtend;

  const footSep = bodyW * 0.42;
  const footSwing = running ? (stride * bodyW * 0.18) : 0;
  const footSwing2 = running ? (stride2 * bodyW * 0.18) : 0;

  const footW = bodyW * 0.36;
  const footH = Math.max(3, h * 0.12);
  const footR = Math.min(footW, footH) * 0.45;

  // Landing impact: brief wider stance
  const landPunch = landed ? 0.10 : 0;

  // --- Draw order: shadow feet -> body -> details ---

  // Feet (slightly darker, subtle)
  ctx.fillStyle = "rgba(242,242,242,0.85)";

  // Left foot
  roundedRectPath(
    ctx,
    -footSep / 2 - footW / 2 + footSwing - bodyW * landPunch,
    footY,
    footW,
    footH,
    footR
  );
  ctx.fill();

  // Right foot
  roundedRectPath(
    ctx,
    footSep / 2 - footW / 2 + footSwing2 + bodyW * landPunch,
    footY,
    footW,
    footH,
    footR
  );
  ctx.fill();

  // Body capsule
  roundedRectPath(ctx, bodyX, bodyY, bodyW, bodyH, radius);
  ctx.fillStyle = COLORS.player;
  ctx.fill();

  // Visor/face stripe (gives "runner" identity)
  ctx.fillStyle = "rgba(15,17,22,0.58)";
  const visorW = bodyW * 0.62;
  const visorH = Math.max(3, bodyH * 0.18);
  const visorX = -visorW / 2;
  const visorY = bodyY + bodyH * 0.20;
  roundedRectPath(ctx, visorX, visorY, visorW, visorH, visorH * 0.6);
  ctx.fill();

  // Tiny highlight on visor + subtle accent pixel
  ctx.fillStyle = "rgba(242,242,242,0.16)";
  roundedRectPath(ctx, visorX + visorW * 0.10, visorY + visorH * 0.20, visorW * 0.35, Math.max(2, visorH * 0.25), visorH * 0.4);
  ctx.fill();
  // Accent dot
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(visorX + visorW * 0.78, visorY + visorH * 0.35, 2, 2);
}

export function render(ctx, state) {
  const W = world.INTERNAL_WIDTH;
  const H = world.INTERNAL_HEIGHT;

  const player = state.player;
  // Danger factor: 0 when safely high, 1 when near the lethal ground
  const bottom = (player.y + player.h);
  const distToGround = Math.max(0, world.GROUND_Y - bottom);
  const danger01 = 1 - clamp(distToGround / 140, 0, 1);

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
  drawLethalGround(ctx, W, H, state.time || 0, danger01);

  // Apply camera offset for world objects
  ctx.save();
  ctx.translate(ox, oy);

  // Platforms
  if (Array.isArray(state.platforms)) {
    // Buildings + rooftops
    for (const plat of state.platforms) {
      // Use a stable seed so windows don't flicker as x changes each frame.
      const seed = getPlatformSeed(plat);

      // Skip off-screen platforms/buildings to reduce per-frame drawing cost.
      if (plat.x + plat.w < -120 || plat.x > W + 120) continue;

      // Building body extends down to lethal ground
      const bodyX = plat.x;
      const bodyY = plat.y + plat.h;
      const bodyW = plat.w;
      const bodyH = Math.max(0, world.GROUND_Y - bodyY);

      // Soft building shadow (slight offset)
      ctx.fillStyle = COLORS.platformShadow;
      ctx.fillRect(bodyX + 4, bodyY + 6, bodyW, bodyH);

      // Building fill
      ctx.fillStyle = pickBuildingColor(seed);
      ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

      // Windows (procedural, stable, cheap)
      // Limit how many we draw per building to avoid frame drops.
      const pad = 10;
      const winW = 10;
      const winH = 14;
      const gapX = 12;
      const gapY = 14;

      const startX = bodyX + pad;
      const endX = bodyX + bodyW - pad;
      const startY = bodyY + pad;
      const endY = bodyY + bodyH - pad;

      if (bodyH > 56 && bodyW > 80) {
        const maxRows = 6;
        const maxCols = 8;

        let row = 0;
        for (let y = startY; y + winH <= endY && row < maxRows; y += winH + gapY) {
          let col = 0;
          for (let x = startX; x + winW <= endX && col < maxCols; x += winW + gapX) {
            // Deterministic on/off
            const r = hash01(seed * 13.7 + row * 101 + col * 17);
            const on = r > 0.74; // ~26% lit
            ctx.fillStyle = on ? COLORS.windowOn : COLORS.windowOff;
            ctx.fillRect(x, y, winW, winH);
            col++;
          }
          row++;
        }
      }

      // Rooftop (the actual platform surface)
      drawRoof(ctx, plat, seed);
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

  // Player shadow (world space)
  drawPlayerShadow(ctx, player);

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

  // Player (procedural runner with outline/glow)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(sx, sy);

  // Soft glow (works well on flat backgrounds)
  ctx.shadowColor = "rgba(242,242,242,0.18)";
  ctx.shadowBlur = 12;

  // Fill runner
  drawRunner(ctx, player, state.time || 0, landed, state.running, state.speed || 0);

  // Crisp outline (disable shadow so it stays sharp)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(242,242,242,0.30)";
  ctx.lineWidth = 1;

  // Outline around body only (approx: reuse body path)
  const bodyW = player.w * 0.70;
  const bodyH = player.h * 0.78;
  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 - player.h * 0.06;
  const radius = Math.min(bodyW, bodyH) * 0.45;
  roundedRectPath(ctx, bodyX + 0.5, bodyY + 0.5, bodyW - 1, bodyH - 1, radius);
  ctx.stroke();

  ctx.restore();

  // End world transform
  ctx.restore();

  // HUD (no shake)
  ctx.save();
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(10, 10, 190, 54);

  ctx.fillStyle = COLORS.hudText;
  ctx.font = "700 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const hudDist = Math.floor(state.distance || 0);
  ctx.fillText(`Distance ${hudDist}`, 20, 32);

  ctx.font = "500 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.fillText(`Jumps ${player.jumpsRemaining}`, 20, 52);
  if (danger01 > 0.55 && state.running && !state.gameOver) {
    ctx.fillStyle = "rgba(255,85,110,0.90)";
    ctx.font = "800 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("GROUND = DEATH", 112, 52);
  }
  ctx.restore();

  // Vignette on top
  drawVignette(ctx, W, H);

  // Overlays
  if (!state.running && !state.gameOver) {
    // Dim gameplay behind the menu
    ctx.fillStyle = "rgba(0,0,0,0.40)";
    ctx.fillRect(0, 0, W, H);

    // Centered card layout
    const cardW = 420;
    const cardH = 210;
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2 - 10;

    drawMenuPanel(ctx, cardX, cardY, cardW, cardH);

    const cx0 = W / 2;

    // Title
    ctx.fillStyle = COLORS.hudText;
    ctx.font = "900 44px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    centerText(ctx, "NO GROUND", cx0, cardY + 70);

    // Subtitle (meaning in 1 line)
    ctx.font = "500 16px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.78)";
    centerText(ctx, "Keep Bob off the ground.", cx0, cardY + 100);

    // CTA pulse
    const t = state.time || 0;
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.2));

    // CTA chip
    const ctaText = "Tap to start";
    ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const tw = ctx.measureText(ctaText).width;

    const chipW = tw + 46;
    const chipH = 44;
    const chipX = cx0 - chipW / 2;
    const chipY = cardY + 132;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "rgba(120,205,255,0.14)";
    roundRect(ctx, chipX, chipY, chipW, chipH, 14);

    ctx.strokeStyle = "rgba(120,205,255,0.35)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, chipX + 0.5, chipY + 0.5, chipW - 1, chipH - 1, 14);
    ctx.stroke();

    ctx.fillStyle = COLORS.hudText;
    centerText(ctx, ctaText, cx0, chipY + 28);
    ctx.restore();

    // Controls (minimal, secondary)
    ctx.font = "500 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.55)";
    centerText(ctx, "Double jump • Tap shorter for a low hop", cx0, cardY + 194);
  }

  if (state.gameOver) {
    // Dim gameplay behind the menu
    ctx.fillStyle = "rgba(0,0,0,0.48)";
    ctx.fillRect(0, 0, W, H);

    const cardW = 420;
    const cardH = 230;
    const cardX = (W - cardW) / 2;
    const cardY = (H - cardH) / 2 - 10;

    drawMenuPanel(ctx, cardX, cardY, cardW, cardH);

    const cx0 = W / 2;
    const dist = Math.floor(state.distance || 0);

    ctx.fillStyle = COLORS.hudText;
    ctx.font = "900 32px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    centerText(ctx, "Bob touched grass", cx0, cardY + 70);

    ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.80)";
    centerText(ctx, `Distance ${dist}`, cx0, cardY + 110);

    // CTA pulse
    const t = state.time || 0;
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3.2));

    const ctaText = "Tap to retry";
    ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const tw = ctx.measureText(ctaText).width;

    const chipW = tw + 46;
    const chipH = 44;
    const chipX = cx0 - chipW / 2;
    const chipY = cardY + 142;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = "rgba(120,205,255,0.14)";
    roundRect(ctx, chipX, chipY, chipW, chipH, 14);

    ctx.strokeStyle = "rgba(120,205,255,0.35)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, chipX + 0.5, chipY + 0.5, chipW - 1, chipH - 1, 14);
    ctx.stroke();

    ctx.fillStyle = COLORS.hudText;
    centerText(ctx, ctaText, cx0, chipY + 28);
    ctx.restore();

    ctx.font = "500 13px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillStyle = "rgba(242,242,242,0.52)";
    centerText(ctx, "Tip: tap shorter for a low hop", cx0, cardY + 212);
  }
}
