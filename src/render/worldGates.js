// src/render/worldGates.js

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

function gateLabel(kind) {
  switch (kind) {
    case "corkscrew":
      return "A/D";
    default:
      return "SPIN";
  }
}

function gateSubLabel(kind) {
  switch (kind) {
    case "corkscrew":
      return "CORKSCREW";
    default:
      return "SPIN";
  }
}

export function drawGates(ctx, state, W, animTime) {
  // Don't show gates behind the start menu.
  if (!state.running && !state.gameOver) return;
  if (!Array.isArray(state.gates)) return;

  for (const g of state.gates) {
    if (g.x + g.w < -120 || g.x > W + 120) continue;

    const x = g.x;
    const y = g.y;
    const w = g.w;
    const h = g.h;

    const pulse = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(animTime * 6.0));

    let stroke = "rgba(120,205,255,0.65)";
    let fill = "rgba(120,205,255,0.08)";

    if (g.hit) {
      stroke = "rgba(120,205,255,0.95)";
      fill = "rgba(120,205,255,0.18)";
    } else if (g.missed) {
      stroke = "rgba(242,242,242,0.10)";
      fill = "rgba(0,0,0,0.10)";
    }

    ctx.save();
    ctx.globalAlpha *= g.hit ? 1 : (g.missed ? 0.45 : pulse);

    // outer ring
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    roundedRectPath(ctx, x, y, w, h, 14);
    ctx.stroke();

    // inner ring
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(242,242,242,0.16)";
    roundedRectPath(ctx, x + 8, y + 8, w - 16, h - 16, 10);
    ctx.stroke();

    // fill
    ctx.fillStyle = fill;
    roundedRectPath(ctx, x + 2, y + 2, w - 4, h - 4, 14);
    ctx.fill();

    // label (two lines) + subtle backing so it reads clearly
    const label = gateLabel(g.requiredKind);
    const sub = gateSubLabel(g.requiredKind);

    ctx.font = "900 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const tw = ctx.measureText(label).width;

    ctx.font = "700 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    const sw = ctx.measureText(sub).width;

    const padX = 10;
    const boxW = Math.max(tw, sw) + padX * 2;
    const boxH = 32;
    const bx = x + w / 2 - boxW / 2;
    const by = y + h / 2 - boxH / 2 + 1;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    roundedRectPath(ctx, bx, by, boxW, boxH, 10);
    ctx.fill();

    ctx.fillStyle = "rgba(242,242,242,0.88)";
    ctx.font = "900 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(label, x + w / 2 - tw / 2, by + 15);

    ctx.fillStyle = "rgba(242,242,242,0.55)";
    ctx.font = "700 10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(sub, x + w / 2 - sw / 2, by + 28);

    ctx.restore();
  }
}
