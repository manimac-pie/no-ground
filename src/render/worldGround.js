// src/render/worldGround.js
import { world } from "../game.js";

export function drawLethalGround(ctx, W, H, animTime, danger01, COLORS) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const y = world.GROUND_Y;

  // Base dark below the ground line
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, y, W, H - y);

  // Glow gradient above the ground line
  const g = ctx.createLinearGradient(0, y - 90, 0, y + 30);
  g.addColorStop(0, "rgba(255,85,110,0)");
  g.addColorStop(0.55, COLORS.groundGlow);
  g.addColorStop(1, "rgba(255,85,110,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 90, W, 120);

  // Bright line
  ctx.fillStyle = "rgba(255,85,110,0.55)";
  ctx.fillRect(0, y, W, 2);

  // Animated hazard stripes (use animTime so it stops on game over)
  const stripeH = 10;
  const speed = 60;
  const off = -((animTime * speed) % 40);

  ctx.save();
  ctx.globalAlpha = 0.22 + 0.28 * danger01;
  ctx.fillStyle = COLORS.groundCore;
  for (let x = off; x < W + 40; x += 40) {
    ctx.fillRect(x, y + 10, 20, stripeH);
    ctx.fillRect(x + 10, y + 26, 20, stripeH);
  }
  ctx.restore();

  // Proximity tint
  if (danger01 > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.35 * danger01;
    ctx.fillStyle = COLORS.dangerTint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  ctx.restore();
}
