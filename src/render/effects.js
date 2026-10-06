// src/render/effects.js
// Death effects: the robot arm (the claw), break shards (with Bob's wheel and screws) and the drag sparks.

import { BREAK_SHARDS, world } from "../game/constants.js";
import { clamp } from "../shared/math.js";
import { allocParticle, createParticlePool, freeParticle } from "./particles.js";
import { drawWheel } from "./player/body.js";
import { SPARK_COLORS, SPARK_GLOW_COLOR } from "./player/dashFx.js";

// The claw's jaws: thickness, how far they open past Bob before gripping, and how far the fingertips bite.
const CLAW_JAW = 4;
const CLAW_OPEN = 6;
const CLAW_BITE = 2.5;
const CLAW_PALM = 4;  // palm plate thickness
const CLAW_WRIST = 7; // wrist to palm (the arm's stroke is 14 wide, so its round end reaches 7 past the wrist)

// Drag sparks (drawDeathDragSparks): Bob's body grinding along the ground as the claw drags him off.
// Purely visual, and they follow the claw, which only the renderer places (camera.js), so they live
// here. They move on the game clock: render() passes the game time since the last frame as dt.
const DRAG_SPARKS_PER_SEC = 360; // at full drag speed
const DRAG_SPARK_MAX = 220;
const DRAG_FULL_SPEED = 1200;    // drag speed (px/s) that throws the most sparks
const DRAG_MIN_K = 0.35;         // share of the sparks he throws as soon as he's moving at all
const DRAG_SPARK_GRAVITY = 1100;
const DRAG_SPARK_BOUNCE = 0.35;  // vertical speed kept when a spark hits the ground
const DRAG_SPARK_BLUR_SEC = 0.022; // streak length, in seconds of travel
const DRAG_CONTACT_HALF = 10;    // half the length of his side that scrapes the ground
const dragSparks = createParticlePool(() => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1 }));
let dragSpawnAcc = 0;
let dragLastX = null; // where he scraped last frame, to tell how fast he's going
let dragK = 0;        // 0..1: how hard he's grinding right now (drives the glow)

export function drawRobotArm(ctx, info, COLORS, animTime, mode = "all") {
  if (!info || !info.arm) return;
  const arm = info.arm;
  const wobble = Math.sin((animTime || 0) * 6) * (1 - arm.dragK) * 4;

  // arm.tipX/tipY is where the palm's face presses on Bob; the arm itself ends at the wrist behind it,
  // so its thick rounded end doesn't poke past the palm.
  const wristX = arm.tipX - CLAW_PALM - CLAW_WRIST;

  // Simple 2-segment arm with a soft elbow bend.
  const elbowX = arm.baseX + (arm.tipX - arm.baseX) * 0.55;
  const elbowY = arm.baseY - 28 + (arm.tipY - arm.baseY) * 0.20 + wobble;

  ctx.save();
  // Keep the arm fully opaque so it doesn't show Bob through it.
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const steelDark = COLORS?.gantry || "rgba(20,22,28,0.85)";
  const steelMid = "rgba(44,48,58,0.95)";
  const steelHi = "rgba(120,205,255,0.55)";
  const warning = COLORS?.warning || "rgba(255,180,70,0.65)";
  const coreGlow = COLORS?.groundGlow || "rgba(255,85,110,0.22)";

  if (mode !== "claw") {
    // Ceiling rail / mount
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(arm.baseX - 26, arm.baseY + 8);
    ctx.lineTo(arm.baseX + 52, arm.baseY + 8);
    ctx.stroke();

    // No cyan highlight on the rail (opaque arm look)

    // Rail brackets
    ctx.fillStyle = steelDark;
    ctx.fillRect(arm.baseX - 34, arm.baseY + 2, 12, 14);
    ctx.fillRect(arm.baseX + 40, arm.baseY + 2, 12, 14);

    // Arm body
    ctx.strokeStyle = steelMid;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(arm.baseX, arm.baseY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(wristX, arm.tipY);
    ctx.stroke();

    // Cyan highlight on the arm body
    ctx.strokeStyle = steelHi;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(arm.baseX, arm.baseY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(wristX, arm.tipY);
    ctx.stroke();

    // Joint caps + bolts
    ctx.fillStyle = steelDark;
    ctx.beginPath();
    ctx.arc(arm.baseX, arm.baseY, 8, 0, Math.PI * 2);
    ctx.arc(elbowX, elbowY, 7, 0, Math.PI * 2);
    ctx.arc(wristX, arm.tipY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = warning;
    ctx.beginPath();
    ctx.arc(arm.baseX + 3, arm.baseY + 1, 2, 0, Math.PI * 2);
    ctx.arc(elbowX - 2, elbowY + 1, 2, 0, Math.PI * 2);
    ctx.fill();

    // Small power conduit along the underside
    ctx.strokeStyle = coreGlow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(arm.baseX + 4, arm.baseY + 6);
    ctx.lineTo(elbowX + 4, elbowY + 6);
    ctx.lineTo(wristX + 4, arm.tipY + 6);
    ctx.stroke();
  }

  if (mode !== "body") {
    // Clamp: a palm at the wrist and two jaws that close onto Bob's outline. camera.js fits them to him:
    // jawLen is how far along him they reach, jawGap is half the space between them once closed.
    const jawLen = Number.isFinite(arm.jawLen) ? arm.jawLen : 16;
    const gap = (Number.isFinite(arm.jawGap) ? arm.jawGap : 12) + CLAW_OPEN * (1 - clamp(arm.gripK || 0, 0, 1));
    const palmX = arm.tipX; // the palm's face; the jaws start here
    const top = arm.tipY - gap - CLAW_JAW; // outer edge of the top jaw
    const bottom = arm.tipY + gap + CLAW_JAW; // outer edge of the bottom jaw
    const tipX = palmX + jawLen;

    // Jaws, in mid steel so they stand out against Bob's white body and the dark sky
    ctx.fillStyle = "rgba(104,112,128,1)";
    ctx.fillRect(palmX, top, jawLen, CLAW_JAW);
    ctx.fillRect(palmX, bottom - CLAW_JAW, jawLen, CLAW_JAW);

    // Fingertips hook in and bite into him a little
    ctx.beginPath();
    ctx.moveTo(tipX - 4, top + CLAW_JAW);
    ctx.lineTo(tipX, top + CLAW_JAW);
    ctx.lineTo(tipX - 1, top + CLAW_JAW + CLAW_BITE);
    ctx.closePath();
    ctx.moveTo(tipX - 4, bottom - CLAW_JAW);
    ctx.lineTo(tipX, bottom - CLAW_JAW);
    ctx.lineTo(tipX - 1, bottom - CLAW_JAW - CLAW_BITE);
    ctx.closePath();
    ctx.fill();

    // Cyan edge on the outside, dark grip pads on the inside
    ctx.fillStyle = steelHi;
    ctx.fillRect(palmX, top, jawLen, 1);
    ctx.fillRect(palmX, bottom - 1, jawLen, 1);
    ctx.fillStyle = steelDark;
    ctx.fillRect(palmX + 3, top + CLAW_JAW - 1, jawLen - 7, 1);
    ctx.fillRect(palmX + 3, bottom - CLAW_JAW, jawLen - 7, 1);

    // Palm plate joining the jaws, with a warning light
    ctx.fillStyle = steelMid;
    ctx.fillRect(palmX - CLAW_PALM, top, CLAW_PALM, bottom - top);
    ctx.fillStyle = warning;
    ctx.beginPath();
    ctx.arc(palmX - CLAW_PALM / 2, arm.tipY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Bob's breakup shards, wheel and screws. They move in the game update (game/breakShards.js); this only
// draws them. They stay where they fell: the claw drags Bob away without them.
export function drawBreakShards(ctx, shards) {
  if (!Array.isArray(shards) || shards.length === 0) return;

  for (const s of shards) {
    if (!s || s.life <= 0) continue;
    const a = clamp(s.life / BREAK_SHARDS.LIFE, 0, 1);
    ctx.save();
    ctx.translate(s.x, s.y);

    if (s.kind === "wheel") {
      drawWheel(ctx, s.r, s.rot || 0);
      ctx.restore();
      continue;
    }

    ctx.globalAlpha = a * 0.9;
    ctx.rotate(s.rot || 0);
    const w = s.w || 8;
    const h = s.h || 6;
    if (s.kind === "spark") {
      ctx.fillStyle = "rgba(255,120,80,0.9)";
      ctx.fillRect(-w * 0.4, -1, w * 0.8, 2);
    } else if (s.kind === "plate") {
      ctx.fillStyle = "rgba(230,234,240,0.92)";
      ctx.fillRect(-w * 0.6, -h * 0.6, w * 1.2, h * 0.9);
      ctx.fillStyle = "rgba(20,22,28,0.45)";
      ctx.fillRect(-w * 0.6, h * 0.2, w * 1.2, 1);
    } else if (s.kind === "screw") {
      // Thread, then the head with its slot
      ctx.fillStyle = "rgba(196,202,212,0.95)";
      ctx.fillRect(-3, -1, 5, 2);
      ctx.fillStyle = "rgba(150,156,168,0.95)";
      ctx.fillRect(2, -2, 2, 4);
      ctx.fillStyle = "rgba(20,22,28,0.6)";
      ctx.fillRect(3.5, -1, 0.5, 2);
    } else if (s.kind === "nut") {
      ctx.fillStyle = "rgba(170,176,188,0.95)";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2;
        const px = Math.cos(t) * 1.75;
        const py = Math.sin(t) * 1.5;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(20,22,28,0.6)";
      ctx.fillRect(-0.5, -0.5, 1, 1);
    }
    ctx.restore();
  }
}

// The claw drags Bob along the ground on his side: sparks fly up where he scrapes and trail behind him,
// more the faster he goes. Drawn over Bob, in the world layer.
export function drawDeathDragSparks(ctx, info, dt = 1 / 60) {
  if (!info || !info.snap) return;
  if (!((info.arm?.dragK || 0) > 0)) {
    // Not dragging yet: start each death clean.
    dragSparks.count = 0;
    dragSpawnAcc = 0;
    dragLastX = null;
    dragK = 0;
    return;
  }

  const floorY = world.GROUND_Y;
  const contactX = info.snap.x + info.snap.w / 2 + (info.bobOffsetX || 0);
  if (dt > 0) {
    const v = dragLastX === null ? 0 : (contactX - dragLastX) / dt; // negative: dragged left
    dragLastX = contactX;

    for (let i = dragSparks.count - 1; i >= 0; i--) {
      const s = dragSparks.items[i];
      s.age += dt;
      if (s.age >= s.life) {
        freeParticle(dragSparks, i);
        continue;
      }
      s.vy += DRAG_SPARK_GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y > floorY && s.vy > 0) {
        s.y = floorY;
        s.vy *= -DRAG_SPARK_BOUNCE;
        s.vx *= 0.8;
      }
    }

    // New sparks go his way but slower, so he pulls ahead of them and they trail behind.
    dragK = -v > 30 ? DRAG_MIN_K + (1 - DRAG_MIN_K) * clamp(-v / DRAG_FULL_SPEED, 0, 1) : 0;
    dragSpawnAcc += DRAG_SPARKS_PER_SEC * dragK * dt;
    while (dragSpawnAcc >= 1) {
      dragSpawnAcc -= 1;
      if (dragSparks.count >= DRAG_SPARK_MAX) continue;
      const s = allocParticle(dragSparks);
      s.x = contactX + (Math.random() * 2 - 1) * DRAG_CONTACT_HALF;
      s.y = floorY - 1;
      s.vx = v * (0.05 + Math.random() * 0.3) + (Math.random() * 2 - 1) * 160;
      s.vy = -(80 + Math.random() * 300);
      s.age = 0;
      s.life = 0.25 + Math.random() * 0.3;
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (dragK > 0.05) {
    // Hot spot where he grinds the ground
    ctx.globalAlpha = 0.3 * dragK;
    ctx.fillStyle = SPARK_GLOW_COLOR;
    ctx.beginPath();
    ctx.ellipse(contactX, floorY, DRAG_CONTACT_HALF + 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // White-hot to amber with age, with motion blur back along the path
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < dragSparks.count; i++) {
    const s = dragSparks.items[i];
    const u = s.age / s.life;
    ctx.strokeStyle = SPARK_COLORS[Math.min(SPARK_COLORS.length - 1, Math.floor((u / 0.3) * (SPARK_COLORS.length - 1)))];
    ctx.globalAlpha = 1 - u;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * DRAG_SPARK_BLUR_SEC, s.y - s.vy * DRAG_SPARK_BLUR_SEC);
    ctx.stroke();
  }
  ctx.restore();
}
