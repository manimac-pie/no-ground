// src/render/worldBackdrop.js
import { world } from "../game.js";

export function drawBackground(ctx, W, H, COLORS) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.bgTop);
  g.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = COLORS.fog;
  ctx.fillRect(0, world.GROUND_Y - 120, W, 120);

  ctx.restore();
}

export function drawParallax(ctx, W, H, distance) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const horizon = world.GROUND_Y - 24;

  const off1 = -((distance * 0.10) % (W + 320));
  ctx.fillStyle = "rgba(242,242,242,0.028)";
  for (let x = off1; x < W + 320; x += 320) {
    ctx.fillRect(x + 40, horizon - 190, 160, 70);
    ctx.fillRect(x + 10, horizon - 140, 220, 60);
  }

  const off2 = -((distance * 0.18) % (W + 260));
  ctx.fillStyle = "rgba(242,242,242,0.040)";
  for (let x = off2; x < W + 260; x += 260) {
    ctx.fillRect(x + 30, horizon - 150, 140, 60);
    ctx.fillRect(x + 0, horizon - 105, 200, 55);
  }

  ctx.fillStyle = "rgba(242,242,242,0.035)";
  for (let i = 0; i < 28; i++) {
    const sx = (i * 97) % W;
    const sy = 24 + ((i * 53) % 110);
    ctx.fillRect(sx, sy, 1, 1);
  }

  ctx.restore();
}

export function drawVignette(ctx, W, H) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  const g = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.20,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.70
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();
}
