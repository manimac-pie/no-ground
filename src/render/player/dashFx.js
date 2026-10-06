// src/render/player/dashFx.js
// Dash effects. On a roof, Bob's wheel throws sparks. Wind lines sweep across the whole screen while the
// speed boost lasts, on a roof or in the air. Everything follows the boost (state.speedImpulse), so it
// starts on the press and fades as the boost decays (half every 0.3 s). The wind comes in as a gust:
// it fades in and rolls across from the right instead of filling the screen in one frame.
// A dive landing (the game's heavy landing) also knocks a small burst of sparks off the wheel.
// Purely visual: the particles live here and move on the game's clock (dt is 0 while paused).

import { DASH_SPEED_BOOST } from "../../game/constants.js";
import { clamp, hash01 } from "../../shared/math.js";
import { allocParticle, createParticlePool, freeParticle } from "../particles.js";

const SPAWN_PER_SEC = 140;   // particles per second at full boost
const SPAWN_MIN_K = 0.12;    // below this much boost, nothing new spawns
const MAX_PARTICLES = 140;
const SPARK_GRAVITY = 1100;
const SPARK_BOUNCE = 0.35;   // vertical speed kept when a spark hits the roof
const BLUR_SEC = 0.022;      // streak length, in seconds of travel
const GLOW_MIN_K = 0.08;
const WIND_MIN_K = 0.03;
const WIND_LINES_PER_PX = 60 / 800; // 60 lines across the base 800 px view
const WIND_MAX_LINES = 90;
const WIND_FADE_IN_SEC = 0.15; // a gust's lines brighten from nothing over this long
const WIND_SWEEP_SEC = 0.3;    // a gust's front takes this long to cross the view, right to left
const WIND_EDGE_FRAC = 0.3;    // the front's soft edge, as a share of the view's width
const LANDING_SPARKS = 10;   // sparks in a dive landing's burst

// Spark colours, white-hot to amber, picked by age.
// Opacity goes through globalAlpha, so no colour strings are built per frame.
function ramp(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(`rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`);
  }
  return out;
}
// Also used by the death drag sparks (render/effects.js).
export const SPARK_COLORS = ramp([242, 242, 242], [255, 180, 70], 8);
export const SPARK_GLOW_COLOR = "rgb(255,180,70)";
const WIND_WHITE = "rgb(242,242,242)";
const WIND_CYAN = "rgb(120,205,255)";

// x is in the world layer's coordinates, where Bob stays put and the roofs scroll left.
// ox is where the spark was made (the back of the wheel); floorY is the roof it bounces on.
const pool = createParticlePool(() => ({ x: 0, y: 0, vx: 0, vy: 0, ox: 0, floorY: 0, age: 0, life: 1 }));
let spawnAcc = 0;
let lastHeavyLandT = 0;
let gusting = false; // wind is showing; a dash while it shows carries on the same gust
let gustStartT = 0;  // game time the current gust began

// 0..1: how much of a dash's speed boost is left.
function dashFxStrength(view) {
  const impulse = Number.isFinite(view.speedImpulse) ? view.speedImpulse : 0;
  return clamp(impulse / DASH_SPEED_BOOST, 0, 1);
}

// A spark from Bob's wheel, where it meets the roof. ox: its x, relative to the wheel's centre.
// vx is world velocity (the roofs scroll at `speed`).
function spawn(player, offsetX, ox, vx, vy, life) {
  if (pool.count >= MAX_PARTICLES) return;
  const s = allocParticle(pool);
  s.ox = player.x + player.w / 2 + offsetX + ox;
  s.floorY = player.y + player.h;
  s.x = s.ox;
  s.y = s.floorY;
  s.vx = vx;
  s.vy = vy;
  s.age = 0;
  s.life = life;
}

// Dash: thrown back off the rear of the wheel.
function spawnDashSpark(player, speed, offsetX) {
  spawn(player, offsetX, -3 - Math.random() * 4, speed * (0.05 + Math.random() * 0.5),
    -(70 + Math.random() * 240), 0.18 + Math.random() * 0.3);
}

// Dive landing: a small, low burst both ways from under the wheel.
function spawnLandingSpark(player, speed, offsetX) {
  spawn(player, offsetX, (Math.random() - 0.5) * 8, speed + (Math.random() * 2 - 1) * 160,
    -(60 + Math.random() * 160), 0.15 + Math.random() * 0.2);
}

// Moves the sparks, then spawns new ones (when `active`): while a dash's boost lasts and Bob is on a
// roof, and once on a dive landing. New ones come after the move, so on their first frame they sit
// exactly where they were made.
export function updateDashSparks(view, dt, offsetX, active) {
  if (!(dt > 0)) return;
  const speed = Number.isFinite(view.speed) ? view.speed : 0;
  for (let i = pool.count - 1; i >= 0; i--) {
    const s = pool.items[i];
    s.age += dt;
    if (s.age >= s.life) {
      freeParticle(pool, i);
      continue;
    }
    s.vy += SPARK_GRAVITY * dt;
    s.x += (s.vx - speed) * dt;
    s.y += s.vy * dt;
    if (s.y > s.floorY && s.vy > 0) {
      s.y = s.floorY;
      s.vy *= -SPARK_BOUNCE;
      s.vx *= 0.8;
    }
  }

  // A dive landing sets the heavy-landing timer, so a jump in it is a new landing.
  const heavyLandT = Number.isFinite(view.heavyLandT) ? view.heavyLandT : 0;
  if (active && view.player.onGround && heavyLandT > lastHeavyLandT) {
    for (let i = 0; i < LANDING_SPARKS; i++) spawnLandingSpark(view.player, speed, offsetX);
  }
  lastHeavyLandT = heavyLandT;

  const k = active && view.player.onGround ? dashFxStrength(view) : 0;
  if (k <= SPAWN_MIN_K) {
    spawnAcc = 0;
    return;
  }
  spawnAcc += SPAWN_PER_SEC * k * dt;
  while (spawnAcc >= 1) {
    spawnAcc -= 1;
    spawnDashSpark(view.player, speed, offsetX);
  }
}

// Sparks and the glow where the wheel grinds the roof. World layer, behind Bob.
export function drawDashSparks(ctx, view, offsetX, active) {
  const player = view.player;
  const k = dashFxStrength(view);
  const glow = active && player.onGround && k > GLOW_MIN_K;
  if (pool.count === 0 && !glow) return;
  const speed = Number.isFinite(view.speed) ? view.speed : 0;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (glow) {
    ctx.globalAlpha = 0.22 * k;
    ctx.fillStyle = SPARK_GLOW_COLOR;
    ctx.beginPath();
    ctx.ellipse(player.x + player.w / 2 + offsetX - 4, player.y + player.h, 12, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineCap = "round";
  ctx.lineWidth = 1.3;
  for (let i = 0; i < pool.count; i++) {
    const s = pool.items[i];
    const u = s.age / s.life;
    // Motion blur points back along the path, cut off at the origin so it never reaches past the wheel.
    let tx = -(s.vx - speed) * BLUR_SEC;
    let ty = -s.vy * BLUR_SEC;
    const room = s.ox - s.x;
    if (tx !== 0 && (tx > 0 ? tx > room : tx < room)) {
      const f = Math.max(0, room / tx);
      tx *= f;
      ty *= f;
    }
    ctx.strokeStyle = SPARK_COLORS[Math.min(7, Math.floor((u / 0.3) * 7))];
    ctx.globalAlpha = 1 - u;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + tx, s.y + ty);
    ctx.stroke();
  }
  ctx.restore();
}

// Starts a gust when the wind comes back from nothing. Call every frame, even when the wind isn't
// drawn (active false), so the next dash after a death or the start screen gets a fresh gust.
// t: game time.
export function updateDashWind(view, t, active) {
  const on = active && dashFxStrength(view) > WIND_MIN_K;
  if (on && (!gusting || t < gustStartT)) gustStartT = t;
  gusting = on;
}

// Speed lines sweeping across the whole view while the boost lasts. Each line gets a new height
// every time it wraps around, so the pattern doesn't repeat.
// viewLeft/viewW/viewH: the visible area in the world layer's coordinates. t: game time.
export function drawDashWind(ctx, view, t, viewLeft, viewW, viewH) {
  const k = dashFxStrength(view);
  if (k <= WIND_MIN_K || !gusting) return;
  const span = viewW * 1.5;
  const n = Math.min(WIND_MAX_LINES, Math.round(viewW * WIND_LINES_PER_PX));
  // Gust: fade in (eased), and a front rolling in from the right; lines ahead of it aren't drawn yet.
  const age = Math.max(0, t - gustStartT);
  const fade = clamp(age / WIND_FADE_IN_SEC, 0, 1);
  const strength = k * fade * fade * (3 - 2 * fade);
  const edge = viewW * WIND_EDGE_FRAC;
  const front = (age / WIND_SWEEP_SEC) * (viewW + 20 + edge);

  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const speed = 700 + hash01(i + 50) * 700;
    const travel = t * speed + hash01(i + 90) * span;
    const pass = Math.floor(travel / span);
    const dist = travel - pass * span; // how far in from the right this line is
    const reveal = clamp((front - dist) / edge, 0, 1);
    if (reveal <= 0) continue;
    const x = viewLeft + viewW + 20 - dist;
    const y = hash01(i * 7.3 + pass * 13.1) * viewH;
    const len = (24 + 80 * hash01(i + 20)) * (0.35 + 0.65 * k);
    ctx.globalAlpha = (0.14 + 0.3 * hash01(i + 70)) * strength * reveal;
    ctx.strokeStyle = i % 3 ? WIND_WHITE : WIND_CYAN;
    ctx.lineWidth = i % 4 === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.restore();
}
