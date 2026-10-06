// src/render/worldCracks.js
// Building fractures. Each building gets a fixed crack network (from its seed and size) that grows
// with stress, instead of a set of cracks that fade in all at once:
//   - Main cracks start at the roof edge, chipping a notch out of it, and run down the facade.
//     They start one after another as stress rises, so a lightly stressed roof has one short crack
//     and a roof about to go is split all over.
//   - Every crack grows over its own stress range, and branches only once its parent has reached
//     them, so the network spreads instead of popping in.
//   - Concrete spalls off along the cracks.
//   - Past HOT_FROM the cracks glow red from inside (the simulation leaking through) and pulse
//     faster toward collapse. Dust trickles out of them, and at the very end the roof edge
//     flashes red.
// Coordinates inside a network are relative to the roof's top-left; the roof slab is the first
// PLATFORM_H px, the building body below it.

const PLATFORM_H = 16;
const WARM_FROM = 0.2; // a faint glow starts here, so mid-stress cracks read on dark facades
const HOT_FROM = 0.55; // ...and turns hot from here
const CORE_RGB = "255,70,105";
const WIDTHS = [1.8, 1.1, 0.7]; // main crack, branch, twig
const NET_CACHE_MAX = 48;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hash01(n) {
  const x = Math.sin(n * 999.123) * 43758.5453;
  return x - Math.floor(x);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One crack: a wandering polyline that leans downward, with branches. It grows from nothing to its
// full length while stress goes from t0 to t1.
function growCrack(rnd, net, x, y, heading, length, depth, t0, t1) {
  const pts = [{ x, y, d: 0 }];
  const crack = { pts, len: 0, depth, t0, t1 };
  net.cracks.push(crack);
  let d = 0;
  let a = heading;
  while (d < length) {
    const step = 5 + rnd() * 6;
    a += (rnd() - 0.5) * 0.9;        // wander
    a += (Math.PI / 2 - a) * 0.15;   // and lean back toward straight down
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    d += step;
    pts.push({ x, y, d });
    const frac = d / length;
    const at = t0 + (t1 - t0) * frac; // stress at which the crack has grown this far
    if (rnd() < 0.12) {
      net.chips.push({ x, y, r: 1.2 + rnd() * 2, a: rnd() * 6.28, at: at + 0.05 });
    }
    if (depth < 2 && frac > 0.2 && rnd() < (depth === 0 ? 0.22 : 0.12)) {
      const side = rnd() < 0.5 ? -1 : 1;
      const branchLen = (length - d) * (0.35 + rnd() * 0.35) + 10;
      growCrack(rnd, net, x, y, a + side * (0.5 + rnd() * 0.6), branchLen, depth + 1, at, Math.min(1, at + 0.25 + rnd() * 0.15));
    }
  }
  crack.len = d;
  return crack;
}

function buildNet(seed, w, h) {
  const rnd = mulberry32(seed * 7919 + Math.round(w) * 13 + h);
  const net = { cracks: [], chips: [], notches: [], mains: [] };
  const count = clamp(Math.round(w / 60), 2, 6);
  // Which main crack opens first, second, ... (shuffled so it isn't always left to right)
  const order = Array.from({ length: count }, (_, i) => i).sort(() => rnd() - 0.5);
  for (let i = 0; i < count; i++) {
    const rank = order.indexOf(i);
    const x0 = w * (i + 0.5) / count + (rnd() - 0.5) * (w / count) * 0.6;
    const t0 = 0.04 + rank * 0.16;
    const t1 = Math.min(1, t0 + 0.35);
    const length = Math.max(20, (PLATFORM_H + h) * (0.5 + 0.5 * rnd()));
    const main = growCrack(rnd, net, x0, 0, Math.PI / 2 + (rnd() - 0.5) * 0.6, length, 0, t0, t1);
    net.mains.push(main);
    net.notches.push({ x: x0, w: 3 + rnd() * 3, depth: 2 + rnd() * 2, at: t0 + 0.02 });
  }
  return net;
}

const _nets = new Map();

function getNet(seed, w, h) {
  // Height is rounded so a slowly moving roof doesn't rebuild its network every frame.
  const hq = Math.round(h / 20) * 20;
  const key = `${seed}|${Math.round(w)}|${hq}`;
  let net = _nets.get(key);
  if (!net) {
    net = buildNet(seed, w, hq);
    _nets.set(key, net);
    if (_nets.size > NET_CACHE_MAX) _nets.delete(_nets.keys().next().value);
  }
  return net;
}

// Path of a crack from its start up to `upTo` px along it.
function traceCrack(ctx, pts, upTo) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.d >= upTo) {
      const q = pts[i - 1];
      const f = (upTo - q.d) / Math.max(1e-6, p.d - q.d);
      ctx.lineTo(q.x + (p.x - q.x) * f, q.y + (p.y - q.y) * f);
      return;
    }
    ctx.lineTo(p.x, p.y);
  }
}

function grown(crack, c) {
  return crack.len * clamp((c - crack.t0) / Math.max(1e-6, crack.t1 - crack.t0), 0, 1);
}

// Strokes every grown crack of one depth as a single path.
function strokeDepth(ctx, net, c, depth, frac = 1) {
  ctx.beginPath();
  let any = false;
  for (const crack of net.cracks) {
    if (crack.depth !== depth) continue;
    const len = Math.min(grown(crack, c), crack.len * frac);
    if (len <= 0.5) continue;
    traceCrack(ctx, crack.pts, len);
    any = true;
  }
  if (any) ctx.stroke();
}

// Draw a building's cracks. (x, roofY): the roof's top-left; w: its width; bodyH: the height of
// the building below the roof slab (0 for a bare roof). crack01: 0 = sound .. 1 = collapsing.
// flash: 0..1, a heavy landing just hit this roof: its cracks flare hot for a moment.
export function drawFractures(ctx, x, roofY, w, bodyH, seed, crack01, t, flash = 0) {
  const c = clamp(crack01, 0, 1);
  if (c <= 0.01 || w < 20) return;
  const h = Math.max(0, bodyH);
  const net = getNet(seed, w, h);
  const hot = Math.max(clamp((c - HOT_FROM) / (1 - HOT_FROM), 0, 1), 0.7 * clamp(flash, 0, 1));
  const warm = clamp((c - WARM_FROM) / (HOT_FROM - WARM_FROM), 0, 1);
  const pulse = hot > 0 ? 0.6 + 0.4 * Math.sin(t * (5 + 12 * hot) + seed) : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, roofY, w, PLATFORM_H + h);
  ctx.clip();
  ctx.translate(x, roofY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Notches chipped out of the roof edge where the main cracks start
  ctx.fillStyle = "rgba(4,4,8,0.9)";
  for (const n of net.notches) {
    if (c < n.at) continue;
    const k = clamp((c - n.at) / 0.15, 0, 1);
    ctx.beginPath();
    ctx.moveTo(n.x - (n.w / 2) * k, 0);
    ctx.lineTo(n.x + (n.w / 2) * k, 0);
    ctx.lineTo(n.x + 0.5, n.depth * k);
    ctx.closePath();
    ctx.fill();
  }

  // The crack openings: dark, widest at the top of the main cracks
  ctx.strokeStyle = "rgba(4,4,8,0.85)";
  for (let depth = 0; depth < WIDTHS.length; depth++) {
    ctx.lineWidth = WIDTHS[depth];
    strokeDepth(ctx, net, c, depth);
  }
  ctx.lineWidth = WIDTHS[0] * 1.6;
  strokeDepth(ctx, net, c, 0, 0.4);

  // Lit lip along the upper edge of each crack: broken concrete catching the light
  ctx.save();
  ctx.translate(-0.7, -0.7);
  ctx.strokeStyle = "rgba(255,238,228,0.3)";
  ctx.lineWidth = 0.8;
  for (let depth = 0; depth < 2; depth++) strokeDepth(ctx, net, c, depth);
  ctx.restore();

  // Spalled concrete
  for (const chip of net.chips) {
    if (c < chip.at) continue;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = chip.a + i * 1.57 + hash01(chip.x + i) * 0.6;
      const r = chip.r * (0.7 + 0.5 * hash01(chip.y + i));
      const px = chip.x + Math.cos(a) * r;
      const py = chip.y + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(6,6,10,0.8)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Warm glow: the first sign that something's coming through
  if (warm > 0 && hot < 1) {
    ctx.strokeStyle = `rgba(${CORE_RGB},${0.3 * warm * (1 - hot)})`;
    ctx.lineWidth = 2.6;
    strokeDepth(ctx, net, c, 0);
    strokeDepth(ctx, net, c, 1);
  }

  // Hot cores: the simulation leaking through, pulsing faster toward collapse
  if (hot > 0) {
    ctx.strokeStyle = `rgba(${CORE_RGB},${0.12 * hot * (0.5 + pulse)})`;
    ctx.lineWidth = 5;
    strokeDepth(ctx, net, c, 0);
    ctx.strokeStyle = `rgba(${CORE_RGB},${0.35 * hot})`;
    ctx.lineWidth = 2;
    strokeDepth(ctx, net, c, 0);
    strokeDepth(ctx, net, c, 1);
    ctx.strokeStyle = `rgba(255,190,205,${(0.4 + 0.5 * pulse) * hot})`;
    ctx.lineWidth = 0.6;
    strokeDepth(ctx, net, c, 0);
    strokeDepth(ctx, net, c, 1);
  }

  // Dust trickling out of the main cracks
  if (c > 0.3 && net.mains.length) {
    const n = Math.floor(4 + 10 * c);
    ctx.fillStyle = "rgb(205,200,195)";
    for (let k = 0; k < n; k++) {
      const main = net.mains[k % net.mains.length];
      const along = grown(main, c) * hash01(seed * 3.3 + k * 7.1);
      let sx = main.pts[0].x;
      let sy = main.pts[0].y;
      for (const p of main.pts) {
        if (p.d > along) break;
        sx = p.x;
        sy = p.y;
      }
      const phase = (t * (0.6 + 0.5 * hash01(k * 5.7 + seed)) + hash01(k * 9.1 + seed)) % 1;
      ctx.globalAlpha = (1 - phase) * 0.5 * c;
      ctx.fillRect(sx + (hash01(k * 2.9) - 0.5) * 4 + phase * 3, sy + phase * 26, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // About to go: the roof edge flashes red
  if (c > 0.8) {
    const k = (c - 0.8) / 0.2;
    ctx.fillStyle = `rgba(${CORE_RGB},${(0.35 + 0.35 * pulse) * k})`;
    ctx.fillRect(0, 0, w, 2);
  }

  ctx.restore();
}
