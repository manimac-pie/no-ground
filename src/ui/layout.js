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
};

// The start screen's shell (render/hud/shell.js): text on the sky, in two pieces.
// - Down the left side, top to bottom: the header (status, NO GROUND), the operator's line, the log,
//   YOUR BEST and the operator's buttons (TERMINATE BOB, CHANGE OPERATOR), all above the starter roof
//   (its top edge sits at y ~341 at the start zoom, whatever the screen size); then the menu, below
//   the roof line, over the building's face.
// - Top right, above the START firewall (its top edge is at y ~223): the records.
// TRAINING, CONTROLS, TERMINATE BOB and CHANGE OPERATOR open a sheet over the left column.
// Fixed rows, so the game can hit-test them without knowing what the log says.
const SHELL_X = 14;
const SHELL_W = 304;       // the text column
const SHELL_MENU_W = 222;
const SHELL_ROW_H = 21;
const SHELL_ROOF_Y = 341;  // the starter roof's top edge on screen at the start zoom
const SHELL_MENU_TOP = 356;
const SHELL_RECORDS_W = 236;
const SHELL_OP_BTN_Y = 224;

export function getShellLayout(W = 800, H = 450) {
  const x = SHELL_X;
  const row = (i) => ({ x, y: SHELL_MENU_TOP + i * (SHELL_ROW_H + 1), w: SHELL_MENU_W, h: SHELL_ROW_H });
  const menuBottom = SHELL_MENU_TOP + 3 * (SHELL_ROW_H + 1);
  const sheet = { x, y: 70, w: SHELL_W, h: SHELL_ROOF_Y - 8 - 70 };
  const right = x + SHELL_W;
  return {
    // The column: a press anywhere on it is UI, never a jump.
    panel: { x: 0, y: 0, w: right + 14, h: menuBottom + 6 },
    header: { x, y: 6, w: SHELL_W, h: 60 },
    // "> operator NAME @ sector-00", then the log (seven lines) and YOUR BEST.
    operator: { x, y: 68, w: SHELL_W, h: 14 },
    log: { x, y: 86, w: SHELL_W, h: 84 },
    best: { x, y: 176, w: 250, h: 40 },
    // Shown while an operator is signed in.
    terminate: { x, y: SHELL_OP_BTN_Y, w: 112, h: 17 },
    changeOperator: { x: x + 118, y: SHELL_OP_BTN_Y, w: 132, h: 17 },
    records: { x: W - 14 - SHELL_RECORDS_W, y: 8, w: SHELL_RECORDS_W, h: 206 },
    breakOut: row(0),
    training: row(1),
    controls: row(2),
    sheet,
    // In an open sheet: ✕ CLOSE on its header row, and the button at the bottom (TRAINING's BEGIN,
    // HOLD TO TERMINATE BOB, QUEUE CHANGE).
    close: { x: right - 54, y: sheet.y, w: 54, h: 16 },
    begin: { x, y: sheet.y + sheet.h - 24, w: SHELL_MENU_W, h: 24 },
    // Where Bob stands (his centre on screen): clear of the column, the firewall still in view.
    bobX: right + 60 + Math.max(0, (W - 800) * 0.3),
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
