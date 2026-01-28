// No Ground — input abstraction
// Goal: expose a single action: "jump" that works on:
// - Keyboard (Space / ArrowUp / W)
// - Mouse (left click)
// - Touch (tap)
// This module should not know anything about player physics.

export function createInput(canvas) {
  if (!canvas) throw new Error("createInput(canvas): canvas is required.");

  const state = {
    // One-frame pulse set when the user presses jump.
    // Game loop should read then clear via consumeJumpPressed().
    jumpPressed: false,

    // True while the jump input is held (used for variable jump height).
    jumpHeld: false,

    // One-frame pulse set when the user triggers a trick/spin.
    // Game loop should read then clear via consumeTrickPressed().
    trickPressed: false,

    // One-frame directional intent for tricks ("up"|"down"|"left"|"right"|"neutral"|null)
    // Game loop should read then clear via consumeTrickIntent().
    trickIntent: null,

    // Whether pointer is currently down (useful later, e.g., for hold-to-slide).
    pointerDown: false,

    // Tracks whether we should ignore a press because it started outside canvas.
    _activePointer: false,

    // Timestamp for tap detection
    _pointerDownAt: 0,
  };

  function pressJump() {
    state.jumpPressed = true;
  }

  function pressTrick(intent = "neutral") {
    state.trickPressed = true;
    state.trickIntent = intent;
  }

  // If the user taps quickly, we emit a trick pulse on release.
  // Game logic can decide when it counts (e.g., only while airborne).
  const TAP_MAX_MS = 160;

  function onKeyDown(e) {
    const key = e.code;

    // Jump: Space / Up
    const isJumpKey = key === "Space" || key === "ArrowUp";

    // Directional tricks: WASD
    const isDirKey = key === "KeyW" || key === "KeyA" || key === "KeyS" || key === "KeyD";

    // Optional fallback trick key (keeps existing behavior for people who learned X/Shift)
    const isTrickKey = key === "KeyX" || key === "ShiftLeft" || key === "ShiftRight";

    if (!isJumpKey && !isDirKey && !isTrickKey) return;

    // Prevent page scroll on space/arrow keys and avoid focus/selection oddities.
    e.preventDefault();

    // Avoid repeating when key is held.
    if (e.repeat) return;

    if (isJumpKey) {
      state.jumpHeld = true;
      pressJump();
      return;
    }

    if (isDirKey) {
      const intent =
        key === "KeyW" ? "up" :
        key === "KeyS" ? "down" :
        key === "KeyA" ? "left" :
        "right";
      pressTrick(intent);
      return;
    }

    // Fallback (non-directional)
    if (isTrickKey) pressTrick("neutral");
  }

  function onKeyUp(e) {
    const key = e.code;
    const isJumpKey = key === "Space" || key === "ArrowUp";
    if (!isJumpKey) return;
    e.preventDefault();
    state.jumpHeld = false;
  }

  function isEventInsideCanvas(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX ?? 0);
    const y = (ev.clientY ?? 0);
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function onPointerDown(e) {
    // Unifies mouse/touch/pen. We only care about primary button.
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

    // Quick tap release => trick pulse.
    // (Game logic will ignore it when inappropriate.)
    if (wasActive && downAt) {
      const ms = performance.now() - downAt;
      if (ms <= TAP_MAX_MS) {
        pressTrick("neutral");
      }
    }
  }

  function onPointerCancel() {
    state.jumpHeld = false;
    state.pointerDown = false;
    state._activePointer = false;
    state._pointerDownAt = 0;
  }

  // Attach listeners
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });

  // Pointer events are best for cross-device input.
  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: false });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });

  // API for the game loop
  return {
    // Returns true once per press; resets the pulse.
    consumeJumpPressed() {
      const v = state.jumpPressed;
      state.jumpPressed = false;
      return v;
    },

    // Returns true once per trick press; resets the pulse.
    consumeTrickPressed() {
      const v = state.trickPressed;
      state.trickPressed = false;
      return v;
    },

    // Returns the trick intent once per press; resets the intent.
    // Possible values: "up"|"down"|"left"|"right"|"neutral"|null
    consumeTrickIntent() {
      const v = state.trickIntent;
      state.trickIntent = null;
      return v;
    },

    get jumpHeld() {
      return state.jumpHeld;
    },

    // Read-only state if needed later.
    get pointerDown() {
      return state.pointerDown;
    },

    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    },
  };
}