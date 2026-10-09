// src/ui/layout.js
// Shared UI layout helpers (render + input hit-testing).

// Pointer targets that only the renderer can place, because they move with animations. The
// renderer fills these in every frame as it draws; the game reads them to handle clicks.
// They're kept out of the game state so the renderer never writes to it.
export const hitAreas = {
  resetHovered: false,     // the pointer is over RESET on the run summary
  startPaneHovered: false, // the pointer is over the START firewall
  // The start screen's camera, to turn a click into world px: { focusX, focusY, zoom, camShift }.
  startView: null,
  // SPACE OR TAP TO BREAK OUT, under the firewall: { x, y, w, h } in UI units, or null.
  startHint: null,
};

// The start screen's shell (render/hud/shell.js; docs/start-screen-terminal-variations.html, 03 Split
// clear): text on the sky, in two pieces.
// - Top left: the title (SIMULATION ONLINE · ITERATION, NO GROUND, the tagline) and the TRAINING and
//   CONTROLS chips. Under them the operator's column, all above the starter roof (its top edge sits
//   at y ~341 at the start zoom, whatever the screen size): the operator's line, the log, YOUR BEST and
//   the operator's buttons (TERMINATE BOB, CHANGE OPERATOR). Those two print their confirm in place
//   of the log; TRAINING and CONTROLS open a sheet over the column.
// - Top right, above the START firewall (its top edge is at y ~223): the records.
// The BREAK OUT hint under the firewall moves with the camera, so the renderer places it
// (hitAreas.startHint). The rest are fixed, so the game can hit-test them without knowing what the
// log says.
const SHELL_X = 18;
const SHELL_COL_W = 230;   // the operator's column
const SHELL_SHEET_W = 290; // TRAINING and CONTROLS sheets
const SHELL_ROOF_Y = 341;  // the starter roof's top edge on screen at the start zoom
const SHELL_RECORDS_W = 190;
const SHELL_OP_BTN_Y = 280;

export function getShellLayout(W = 800, H = 450) {
  const x = SHELL_X;
  const sheet = { x, y: 124, w: SHELL_SHEET_W, h: SHELL_ROOF_Y - 6 - 124 };
  const sheetRight = x + SHELL_SHEET_W;
  return {
    // The left side: a press anywhere on it is UI, never a jump.
    panel: { x: 0, y: 0, w: sheetRight + 10, h: SHELL_ROOF_Y },
    title: { x, y: 10, w: 320, h: 78 },
    training: { x, y: 94, w: 96, h: 22 },
    controls: { x: x + 102, y: 94, w: 104, h: 22 },
    // "> operator NAME @ sector-00", then the log (six lines) and YOUR BEST.
    operator: { x, y: 128, w: SHELL_COL_W, h: 14 },
    log: { x, y: 148, w: SHELL_COL_W, h: 78 },
    best: { x, y: 232, w: SHELL_COL_W, h: 38 },
    // Shown while an operator is signed in.
    terminate: { x, y: SHELL_OP_BTN_Y, w: 106, h: 16 },
    changeOperator: { x: x + 112, y: SHELL_OP_BTN_Y, w: 118, h: 16 },
    // TERMINATE BOB / CHANGE OPERATOR's confirm: HOLD TO TERMINATE BOB / QUEUE CHANGE, and esc · cancel.
    hold: { x, y: 250, w: SHELL_COL_W, h: 22 },
    cancel: { x: x + SHELL_COL_W - 64, y: 276, w: 64, h: 14 },
    records: { x: W - 18 - SHELL_RECORDS_W, y: 16, w: SHELL_RECORDS_W, h: 204 },
    sheet,
    // In an open sheet: ✕ CLOSE on its header row, and TRAINING's BEGIN button at the bottom.
    close: { x: sheetRight - 54, y: sheet.y, w: 54, h: 16 },
    begin: { x, y: sheet.y + sheet.h - 24, w: 222, h: 24 },
    // Where Bob stands (his centre on screen): clear of the column, the firewall still in view.
    bobX: 352 + Math.max(0, (W - 800) * 0.3),
  };
}

// During TRAINING, top left (clear of the HUD): EXIT to the start screen, SKIP the lesson.
export function getTrainingExitRect() {
  return { x: 16, y: 18, w: 84, h: 30 };
}

export function getTrainingSkipRect() {
  return { x: 108, y: 18, w: 84, h: 30 };
}

export function pointInRect(px, py, rect) {
  if (!rect) return false;
  return (
    px >= rect.x &&
    px <= rect.x + rect.w &&
    py >= rect.y &&
    py <= rect.y + rect.h
  );
}
