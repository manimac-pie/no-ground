// No Ground — input abstraction
// Exposes:
// - Jump: Space / ArrowUp, pointer down (click/tap)
// - Jump hold: used for variable jump height
// - Float: W held (mid-air control)
// - Dive: S press (one-shot pulse), plus optional held flag
// - Dash: D press (one-shot pulse)
// - Flip: A (backflip)

export function createInput(canvas) {
  if (!canvas) throw new Error("createInput(canvas): canvas is required.");

  const state = {
    // One-frame pulses
    jumpPressed: false,
    trickPressed: false,
    divePressed: false,
    dashPressed: false,

    // Holds
    jumpHeld: false,
    floatHeld: false, // W
    diveHeld: false,  // S (kept for UI/debug; gameplay uses divePressed -> latched)

    // One-frame flip intent
    trickIntent: null, // "backflip"|null

    // Pointer tracking
    pointerDown: false,
    _activePointer: false,
    _pointerDownAt: 0,
  };

  function pressJump() {
    state.jumpPressed = true;
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
      pressJump();
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

  function onPointerDown(e) {
    // Mouse: primary button only.
    if (e.pointerType === "mouse" && e.button !== 0) return;

    state.pointerDown = true;
    state._activePointer = isEventInsideCanvas(e);

    // Prevent scrolling/zooming while playing.
    e.preventDefault();

    if (state._activePointer) {
      state._pointerDownAt = performance.now();
      state.jumpHeld = true;
      pressJump();
    }
  }

  function onPointerUp(e) {
    const wasActive = state._activePointer;
    const downAt = state._pointerDownAt;

    state.jumpHeld = false;
    state.pointerDown = false;
    state._activePointer = false;
    state._pointerDownAt = 0;

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
  }

  function resetInputs() {
    state.jumpPressed = false;
    state.trickPressed = false;
    state.divePressed = false;
    state.dashPressed = false;
    state.jumpHeld = false;
    state.floatHeld = false;
    state.diveHeld = false;
    state.trickIntent = null;
    state.pointerDown = false;
    state._activePointer = false;
    state._pointerDownAt = 0;
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
  window.addEventListener("pointerup", onPointerUp, { passive: false });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });

  return {
    consumeJumpPressed() {
      const v = state.jumpPressed;
      state.jumpPressed = false;
      return v;
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

    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", resetInputs);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    },
  };
}
