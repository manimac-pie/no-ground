

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

    // Whether pointer is currently down (useful later, e.g., for hold-to-slide).
    pointerDown: false,

    // Tracks whether we should ignore a press because it started outside canvas.
    _activePointer: false,
  };

  function pressJump() {
    state.jumpPressed = true;
  }

  function onKeyDown(e) {
    // Prevent page scroll on space/arrow keys.
    const key = e.code;
    const isJumpKey = key === "Space" || key === "ArrowUp" || key === "KeyW";
    if (!isJumpKey) return;

    e.preventDefault();

    // Avoid repeating jump when key is held.
    if (e.repeat) return;

    pressJump();
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
      pressJump();
    }
  }

  function onPointerUp(e) {
    state.pointerDown = false;
    state._activePointer = false;
    e.preventDefault();
  }

  function onPointerCancel() {
    state.pointerDown = false;
    state._activePointer = false;
  }

  // Attach listeners
  window.addEventListener("keydown", onKeyDown, { passive: false });

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

    // Read-only state if needed later.
    get pointerDown() {
      return state.pointerDown;
    },

    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    },
  };
}