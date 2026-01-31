// No Ground — input abstraction
// Exposes:
// - Jump: Space / ArrowUp, pointer down (click/tap)
// - Jump hold: used for variable jump height
// - Float: W held (mid-air control)
// - Dive: S press (one-shot pulse), plus optional held flag
// - Dash: D press (one-shot pulse)
// - Flip: A (backflip)

import { INTERNAL_WIDTH, INTERNAL_HEIGHT } from "./game/constants.js";

export function createInput(canvas) {
  if (!canvas) throw new Error("createInput(canvas): canvas is required.");

  const state = {
    // One-frame pulses
    jumpPressed: false,
    trickPressed: false,
    divePressed: false,
    dashPressed: false,
    lastJumpSource: null,

    // Holds
    jumpHeld: false,
    floatHeld: false, // W
    diveHeld: false,  // S (kept for UI/debug; gameplay uses divePressed -> latched)

    // One-frame flip intent
    trickIntent: null, // "backflip"|"frontflip"|"neutral"|null

    // Pointer tracking
    pointerDown: false,
    _activePointer: false,
    _pointerDownAt: 0,
    pointerX: 0,
    pointerY: 0,
    pointerInside: false,
    pointerInternalX: 0,
    pointerInternalY: 0,
    pointerInViewport: false,
    pointerPressed: false,
    _pointerJumpSuppressed: false,
  };

  function pressJump(source = null) {
    state.jumpPressed = true;
    state.lastJumpSource = source;
  }

  function pressTrick(intent = "neutral") {
    state.trickPressed = true;
    state.trickIntent = intent;
  }

  function pressDive() {
    state.divePressed = true;
  }

  function pressDash() {
    state.dashPressed = true;
  }

  function onKeyDown(e) {
    const key = e.code;

    const isJumpKey = key === "Space" || key === "ArrowUp";
    const isFloatKey = key === "KeyW";
    const isDiveKey = key === "KeyS";
    const isDashKey = key === "KeyD";
    const isFlipKey = key === "KeyA";

    if (!isJumpKey && !isFloatKey && !isDiveKey && !isDashKey && !isFlipKey) return;

    // Prevent page scroll / browser shortcuts interfering.
    e.preventDefault();

    // Avoid repeat pulses when holding a key.
    if (e.repeat) {
      // Still allow held flags to remain true; we just don't pulse.
      if (isJumpKey) state.jumpHeld = true;
      if (isFloatKey) state.floatHeld = true;
      if (isDiveKey) state.diveHeld = true;
      return;
    }

    if (isJumpKey) {
      state.jumpHeld = true;
      pressJump(key);
      return;
    }

    if (isFloatKey) {
      state.floatHeld = true;
      return;
    }

    if (isDiveKey) {
      state.diveHeld = true;
      pressDive();
      return;
    }

    if (isDashKey) {
      pressDash();
      return;
    }

    if (isFlipKey) {
      pressTrick("backflip");
      return;
    }
  }

  function onKeyUp(e) {
    const key = e.code;

    const isJumpKey = key === "Space" || key === "ArrowUp";
    const isFloatKey = key === "KeyW";
    const isDiveKey = key === "KeyS";

    if (!isJumpKey && !isFloatKey && !isDiveKey) return;
    e.preventDefault();

    if (isJumpKey) state.jumpHeld = false;
    if (isFloatKey) state.floatHeld = false;
    if (isDiveKey) state.diveHeld = false;
  }

  function isEventInsideCanvas(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX ?? 0;
    const y = ev.clientY ?? 0;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function updatePointerInternal(ev) {
    const rect = canvas.getBoundingClientRect();
    const pxCss = (ev.clientX ?? 0) - rect.left;
    const pyCss = (ev.clientY ?? 0) - rect.top;
    const cssW = rect.width || 1;
    const cssH = rect.height || 1;
    const W = INTERNAL_WIDTH || 1;
    const H = INTERNAL_HEIGHT || 1;
    const sx = cssW / W;
    const sy = cssH / H;
    const s = Math.min(sx, sy);
    const ox = (cssW - W * s) * 0.5;
    const oy = (cssH - H * s) * 0.5;
    const inside =
      pxCss >= ox &&
      pxCss <= ox + W * s &&
      pyCss >= oy &&
      pyCss <= oy + H * s;
    state.pointerInternalX = (pxCss - ox) / s;
    state.pointerInternalY = (pyCss - oy) / s;
    state.pointerInViewport = inside;
  }

  function onPointerDown(e) {
    // Mouse: primary button only.
    if (e.pointerType === "mouse" && e.button !== 0) return;

    state.pointerDown = true;
    state._activePointer = isEventInsideCanvas(e);
    updatePointerInternal(e);
    if (state.pointerInViewport) state.pointerPressed = true;

    // Prevent scrolling/zooming while playing.
    e.preventDefault();

    if (state._activePointer && !state._pointerJumpSuppressed) {
      state._pointerDownAt = performance.now();
      state.jumpHeld = true;
      pressJump("pointer");
    }
  }

  function onPointerMove(e) {
    state.pointerX = e.clientX ?? 0;
    state.pointerY = e.clientY ?? 0;
    state.pointerInside = isEventInsideCanvas(e);
    updatePointerInternal(e);
  }

  function onPointerUp(e) {
    const wasActive = state._activePointer;
    const downAt = state._pointerDownAt;

    state.jumpHeld = false;
    state.pointerDown = false;
    state._activePointer = false;
    state._pointerDownAt = 0;
    state.pointerInViewport = false;
    state._pointerJumpSuppressed = false;

    e.preventDefault();

    // No pointer-based tricks; pointer is jump-only.
  }

  function onPointerCancel() {
    state.jumpHeld = false;
    state.floatHeld = false;
    state.diveHeld = false;
    state.pointerDown = false;
    state._activePointer = false;
    state._pointerDownAt = 0;
    state.pointerInside = false;
    state.pointerInViewport = false;
    state.pointerPressed = false;
    state._pointerJumpSuppressed = false;
  }

  function onPointerLeave() {
    state.pointerInside = false;
  }

  function resetInputs() {
    state.jumpPressed = false;
    state.trickPressed = false;
    state.divePressed = false;
    state.dashPressed = false;
    state.lastJumpSource = null;
    state.jumpHeld = false;
    state.floatHeld = false;
    state.diveHeld = false;
    state.trickIntent = null;
    state.pointerDown = false;
    state._activePointer = false;
    state._pointerDownAt = 0;
    state.pointerInside = false;
    state.pointerInViewport = false;
    state.pointerPressed = false;
    state._pointerJumpSuppressed = false;
  }

  function onVisibilityChange() {
    if (document.hidden) resetInputs();
  }

  // Attach listeners
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", resetInputs, { passive: true });
  window.addEventListener("visibilitychange", onVisibilityChange, { passive: true });

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: false });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });

  return {
    consumeJumpPress() {
      const pressed = state.jumpPressed;
      const source = state.lastJumpSource;
      state.jumpPressed = false;
      state.lastJumpSource = null;
      return { pressed, source };
    },

    // Back-compat convenience for callers that only care about the press bit.
    consumeJumpPressed() {
      return this.consumeJumpPress().pressed;
    },

    consumeDivePressed() {
      const v = state.divePressed;
      state.divePressed = false;
      return v;
    },

    consumeDashPressed() {
      const v = state.dashPressed;
      state.dashPressed = false;
      return v;
    },

    consumeTrickPressed() {
      const v = state.trickPressed;
      state.trickPressed = false;
      return v;
    },

    consumeTrickIntent() {
      const v = state.trickIntent;
      state.trickIntent = null;
      return v;
    },

    get jumpHeld() {
      return state.jumpHeld;
    },

    get floatHeld() {
      return state.floatHeld;
    },

    // Kept for UI/debug; gameplay uses consumeDivePressed() and player.diving latch.
    get diveHeld() {
      return state.diveHeld;
    },

    get pointerDown() {
      return state.pointerDown;
    },

    get pointerX() {
      return state.pointerX;
    },

    get pointerY() {
      return state.pointerY;
    },

    get pointerInside() {
      return state.pointerInside;
    },

    get pointerInternalX() {
      return state.pointerInternalX;
    },

    get pointerInternalY() {
      return state.pointerInternalY;
    },

    get pointerInViewport() {
      return state.pointerInViewport;
    },

    consumePointerPressed() {
      const v = state.pointerPressed;
      state.pointerPressed = false;
      return v;
    },

    suppressPointerJump() {
      state.jumpPressed = false;
      state.lastJumpSource = null;
      state.jumpHeld = false;
      state._pointerJumpSuppressed = true;
    },

    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", resetInputs);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    },
  };
}
