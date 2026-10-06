// No Ground (Canvas) — main entrypoint
// Responsibilities:
// - Create a consistent internal coordinate system (16:9 base, expands on ultrawide)
// - Scale the canvas to fit the viewport (PC + mobile)
// - Drive the main loop (requestAnimationFrame)
import { createInput } from "./input.js";
import { createGame } from "./game/index.js";
import { setInternalSizeFromViewport, DASH_COOLDOWN } from "./game/constants.js";
import { render, setTouchUi } from "./render/index.js";
import { setCanvasRect, setMaxDpr } from "./render/viewport.js";

//Leaderboard API udpate
import { refreshLeaderboard } from "./leaderboard/view.js";
import {
  initLeaderboardPromptOverlay,
  onLeaderboardPromptStateChange,
} from "./leaderboard/claimFlow.js";
initLeaderboardPromptOverlay();
refreshLeaderboard().catch(console.error);

const canvas = document.getElementById("game");
const shell = document.getElementById("game-shell");
if (!canvas || !shell) {
  throw new Error("Canvas '#game' or shell '#game-shell' not found.");
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

const input = createInput(canvas, {
  buttons: {
    jump: document.querySelector('[data-control="jump"]'),
    slowfall: document.querySelector('[data-control="slowfall"]'),
    dive: document.querySelector('[data-control="dive"]'),
    dash: document.querySelector('[data-control="dash"]'),
    backflip: document.querySelector('[data-control="backflip"]'),
    pause: document.querySelector('[data-control="pause"]'),
  },
});
onLeaderboardPromptStateChange((open) => {
  if (open) input.blockInput();
  else input.unblockInput();
});
setInternalSizeFromViewport(window.innerWidth, window.innerHeight);
const game = createGame();
let cursorRunning = false;

// A link to index.html?tutorial opens straight into TRAINING.
if (new URLSearchParams(window.location.search).has("tutorial")) game.requestTraining();

// Focus canvas on first interaction (helps desktop keyboard + some mobile browsers).
const focusCanvas = () => {
  try { canvas.focus({ preventScroll: true }); } catch { try { canvas.focus(); } catch {} }
};

function tryEnterFullscreen() {
  if (document.fullscreenElement) return;
  const el = shell || canvas;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (typeof req === "function") {
    try { req.call(el); } catch {}
  }
}

canvas.addEventListener("pointerdown", () => {
  focusCanvas();
  tryEnterFullscreen();
}, { passive: true });
canvas.addEventListener("mousedown", () => {
  focusCanvas();
  tryEnterFullscreen();
}, { passive: true });

// Also focus on key press, but avoid stealing focus from form controls.
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  focusCanvas();
  tryEnterFullscreen();
});

// Prevent context menu on right click / long press.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function getViewportSize() {
  const vv = window.visualViewport;
  if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
    return { w: Math.floor(vv.width), h: Math.floor(vv.height) };
  }
  return { w: Math.floor(window.innerWidth), h: Math.floor(window.innerHeight) };
}

function setCanvasSize() {
  // CSS sizing only; renderer owns backing store sizing + transforms.
  const { w, h } = getViewportSize();
  const displayW = Math.max(1, w);
  const displayH = Math.max(1, h);
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
  setInternalSizeFromViewport(displayW, displayH);
  setCanvasRect(canvas.getBoundingClientRect());
}

function isTouchLike() {
  return (navigator.maxTouchPoints || 0) > 0
    || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
}

function updateOverlay() {
  if (!overlay) return;

  // Landscape-first guidance for phones.
  // Heuristic: portrait + small-ish + touch device to avoid desktop resize toggles.
  const portrait = window.matchMedia
    ? window.matchMedia("(orientation: portrait)").matches
    : window.innerHeight > window.innerWidth;
  const phoneish = Math.min(window.innerWidth, window.innerHeight) < 700;
  const touchLike = isTouchLike();

  overlay.style.display = portrait && phoneish && touchLike ? "flex" : "none";
}

function onResize() {
  setCanvasSize();
  updateOverlay();
  // Pause hint wording: "TAP" on touch screens, keys on desktop.
  setTouchUi(isTouchLike());
}

window.addEventListener("resize", onResize, { passive: true });
window.addEventListener("orientationchange", onResize, { passive: true });
document.addEventListener("fullscreenchange", onResize, { passive: true });
// Esc in fullscreen exits fullscreen without the page seeing the key, so leaving fullscreen pauses.
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) game.pause();
}, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onResize, { passive: true });
}

// Initial layout
onResize();

// Attempt to focus immediately (some browsers require user gesture; harmless if ignored)
focusCanvas();

// Mobile button text labels: shown until the player has finished LABEL_RUNS runs.
// Set LABEL_RUNS to Infinity to always show them.
const LABEL_RUNS = 3;
const LABEL_RUNS_KEY = "ng_control_label_runs";
let labelRunsDone = 0;
try {
  labelRunsDone = parseInt(localStorage.getItem(LABEL_RUNS_KEY), 10) || 0;
} catch {}
let wasGameOver = false;
document.body.classList.toggle("show-control-labels", labelRunsDone < LABEL_RUNS);

function countFinishedRun() {
  labelRunsDone++;
  try { localStorage.setItem(LABEL_RUNS_KEY, String(labelRunsDone)); } catch {}
  if (labelRunsDone >= LABEL_RUNS) document.body.classList.remove("show-control-labels");
}

// Mobile button meters: Slowfall fills with fuel, Dash dims with a sweep while cooling down.
// Values are rounded so the style is only written when the meter visibly changes.
const slowfallBtn = document.querySelector('[data-control="slowfall"]');
const dashBtn = document.querySelector('[data-control="dash"]');
const METER_STEPS = 40;
const LOW_FUEL_FRAC = 0.2; // same threshold as the HUD's low-fuel blink
let shownFuel = -1;
let shownCd = -1;
let shownLow = false;

function updateButtonMeters(player) {
  if (!player) return;
  const fuelMax = player.slowfallFuelMax > 0 ? player.slowfallFuelMax : 1;
  const fuel = Math.round(Math.min(1, Math.max(0, (player.slowfallFuel || 0) / fuelMax)) * METER_STEPS) / METER_STEPS;
  const cd = Math.round(Math.min(1, Math.max(0, (player.dashCooldown || 0) / DASH_COOLDOWN)) * METER_STEPS) / METER_STEPS;
  if (slowfallBtn && fuel !== shownFuel) {
    shownFuel = fuel;
    slowfallBtn.style.setProperty("--fuel", String(fuel));
    const low = fuel < LOW_FUEL_FRAC;
    if (low !== shownLow) {
      shownLow = low;
      slowfallBtn.classList.toggle("is-low", low);
    }
  }
  if (dashBtn && cd !== shownCd) {
    if ((cd > 0) !== (shownCd > 0)) dashBtn.classList.toggle("is-cooling", cd > 0);
    shownCd = cd;
    dashBtn.style.setProperty("--cd", String(cd));
  }
}

// Main loop — fixed timestep for stable physics + smoother feel
let last = performance.now();
let acc = 0;
const FIXED_DT = 1 / 60;
const MAX_FRAME_DT = 0.10; // cap big jumps (tab switch, hitch)
const MAX_STEPS = 5; // avoid spiral of death on slow devices

// Slow-device fallback: if frames average over SLOW_FRAME_MS (under ~50 fps),
// drop the canvas to 1 device pixel per CSS pixel for the rest of the session.
const SLOW_FRAME_MS = 20;
const PERF_WARMUP_MS = 3000; // ignore load-time hitches
const PERF_WINDOW_MS = 2000;
const PERF_MAX_SAMPLE_MS = 250; // longer gaps are tab switches/debugger pauses
let perfWarmupLeft = PERF_WARMUP_MS;
let perfWindowMs = 0;
let perfWindowFrames = 0;
let lowRes = false;

function resetFrameTimeWatch(warmupMs) {
  perfWarmupLeft = warmupMs;
  perfWindowMs = 0;
  perfWindowFrames = 0;
}

function watchFrameTime(ms) {
  if (lowRes || !(ms >= 0) || ms > PERF_MAX_SAMPLE_MS) return;
  if (perfWarmupLeft > 0) {
    perfWarmupLeft -= ms;
    return;
  }

  perfWindowMs += ms;
  perfWindowFrames++;
  if (perfWindowMs < PERF_WINDOW_MS) return;

  const avgMs = perfWindowMs / perfWindowFrames;
  resetFrameTimeWatch(0);
  if (avgMs > SLOW_FRAME_MS && (window.devicePixelRatio || 1) > 1) {
    lowRes = true;
    setMaxDpr(1);
    console.info(`[perf] Average frame ${avgMs.toFixed(1)} ms; rendering at 1x resolution.`);
  }
}

function tick(now) {
  watchFrameTime(now - last);
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

  // Paused or counting down: show the cursor (and hide the pause button).
  const s = game.state;
  const running = s?.running === true && !s.paused && !(s.resumeCountdownT > 0);
  if (running !== cursorRunning) {
    cursorRunning = running;
    document.body.classList.toggle("is-running", running);
  }

  updateButtonMeters(game.state?.player);

  const hideControls = Boolean(game.state?.gameOver);
  document.body.classList.toggle("hide-controls", hideControls);
  if (hideControls !== wasGameOver) {
    wasGameOver = hideControls;
    if (hideControls && labelRunsDone < LABEL_RUNS) countFinishedRun();
  }

  // Physics runs at 60 Hz, so on faster screens (120 Hz) some frames run no step.
  // The state hasn't changed and the canvas keeps the last frame, so skip the redraw.
  if (steps > 0) render(ctx, game.state);

  requestAnimationFrame(tick);
}

window.addEventListener("beforeunload", () => {
  input.destroy();
});

// Leaving the tab or window pauses the run (game.pause() ignores it outside a live run).
window.addEventListener("blur", () => game.pause(), { passive: true });

window.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.pause();
    return;
  }
  // Reset timing when returning to the tab
  last = performance.now();
  acc = 0;
  resetFrameTimeWatch(1000);
});

requestAnimationFrame(tick);
