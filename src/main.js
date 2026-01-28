// No Ground (Canvas) — main entrypoint
// Responsibilities:
// - Create a consistent internal coordinate system (800x450)
// - Scale the canvas to fit the viewport (PC + mobile)
// - Drive the main loop (requestAnimationFrame)

import { createInput } from "./input.js";
import { createGame } from "./game.js";
import { render } from "./render.js";

const INTERNAL_WIDTH = 800;
const INTERNAL_HEIGHT = 450;

const canvas = document.getElementById("game");
if (!canvas) {
  throw new Error("Canvas element '#game' not found.");
}

// Make canvas focusable so keyboard input is reliable after a click/tap.
canvas.tabIndex = 0;
canvas.setAttribute("aria-label", "No Ground game canvas");

// Reduce mobile browser gestures interfering with gameplay.
canvas.style.touchAction = "none";
canvas.style.webkitUserSelect = "none";
canvas.style.userSelect = "none";

const overlay = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("2D canvas context not available.");
}

const input = createInput(canvas);
const game = createGame();

// Focus canvas on first interaction (helps desktop keyboard + some mobile browsers).
const focusCanvas = () => {
  try { canvas.focus({ preventScroll: true }); } catch { try { canvas.focus(); } catch {} }
};

canvas.addEventListener("pointerdown", focusCanvas, { passive: true });
canvas.addEventListener("mousedown", focusCanvas, { passive: true });

// Prevent context menu on right click / long press.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

let scale = 1;
let dpr = 1;

function computeScale() {
  // Fit to viewport while preserving aspect ratio.
  // Keep scale >= 1 on desktop? No — allow shrinking for small screens.
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  return Math.min(vw / INTERNAL_WIDTH, vh / INTERNAL_HEIGHT);
}

function setCanvasSize() {
  scale = computeScale();
  // Cap DPR for performance on high-DPI screens.
  dpr = Math.min(1.5, window.devicePixelRatio || 1);

  const displayW = Math.floor(INTERNAL_WIDTH * scale);
  const displayH = Math.floor(INTERNAL_HEIGHT * scale);

  // CSS size (layout pixels)
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  // Backing store size (device pixels)
  canvas.width = Math.max(1, Math.floor(displayW * dpr));
  canvas.height = Math.max(1, Math.floor(displayH * dpr));

  // Map internal coordinates -> device pixels
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

  // Crisp lines for flat/minimal visuals
  ctx.imageSmoothingEnabled = false;
}

function updateOverlay() {
  if (!overlay) return;

  // Landscape-first guidance for phones.
  // Heuristic: if in portrait and screen is phone-ish, show overlay.
  const portrait = window.innerHeight > window.innerWidth;
  const phoneish = Math.min(window.innerWidth, window.innerHeight) < 700;

  overlay.style.display = portrait && phoneish ? "flex" : "none";
}

function onResize() {
  setCanvasSize();
  updateOverlay();
}

window.addEventListener("resize", onResize, { passive: true });
window.addEventListener("orientationchange", onResize, { passive: true });

// Initial layout
onResize();

// Main loop — fixed timestep for stable physics + smoother feel
let last = performance.now();
let acc = 0;
const FIXED_DT = 1 / 60;
const MAX_FRAME_DT = 0.10; // cap big jumps (tab switch, hitch)
const MAX_STEPS = 5; // avoid spiral of death on slow devices

function tick(now) {
  let frameDt = (now - last) / 1000;
  last = now;

  if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = 0;
  frameDt = Math.min(MAX_FRAME_DT, frameDt);

  acc += frameDt;

  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_STEPS) {
    game.update(FIXED_DT, input);
    acc -= FIXED_DT;
    steps++;
  }

  render(ctx, game.state);

  requestAnimationFrame(tick);
}

window.addEventListener("beforeunload", () => {
  input.destroy();
});

window.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  // Reset timing when returning to the tab
  last = performance.now();
  acc = 0;
});

requestAnimationFrame(tick);
