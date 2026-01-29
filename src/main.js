// No Ground (Canvas) — main entrypoint
// Responsibilities:
// - Create a consistent internal coordinate system (800x450)
// - Scale the canvas to fit the viewport (PC + mobile)
// - Drive the main loop (requestAnimationFrame)

import { createInput } from "./input.js";
import { createGame } from "./game.js";
import { render } from "./render/index.js";

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

// Also focus on key press, but avoid stealing focus from form controls.
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  focusCanvas();
});

// Prevent context menu on right click / long press.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function setCanvasSize() {
  // CSS sizing only; renderer owns backing store sizing + transforms.
  const displayW = Math.max(1, Math.floor(window.innerWidth));
  const displayH = Math.max(1, Math.floor(window.innerHeight));
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
}

function updateOverlay() {
  if (!overlay) return;

  // Landscape-first guidance for phones.
  // Heuristic: portrait + small-ish + touch device to avoid desktop resize toggles.
  const portrait = window.matchMedia
    ? window.matchMedia("(orientation: portrait)").matches
    : window.innerHeight > window.innerWidth;
  const phoneish = Math.min(window.innerWidth, window.innerHeight) < 700;
  const touchLike = (navigator.maxTouchPoints || 0) > 0
    || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  overlay.style.display = portrait && phoneish && touchLike ? "flex" : "none";
}

function onResize() {
  setCanvasSize();
  updateOverlay();
}

window.addEventListener("resize", onResize, { passive: true });
window.addEventListener("orientationchange", onResize, { passive: true });

// Initial layout
onResize();

// Attempt to focus immediately (some browsers require user gesture; harmless if ignored)
focusCanvas();

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
