// src/ui/training.js
// Whether TRAINING has been finished on this device: until it has, the start screen's
// TRAINING button pulses. Kept in localStorage; without storage it just keeps pulsing.
// Read once at load, so the renderer can ask every frame.

const TRAINING_DONE_KEY = "ng_training_done";

let trainingDone = false;
try {
  trainingDone = localStorage.getItem(TRAINING_DONE_KEY) === "1";
} catch {}

export function isTrainingDone() {
  return trainingDone;
}

export function saveTrainingDone() {
  trainingDone = true;
  try {
    localStorage.setItem(TRAINING_DONE_KEY, "1");
  } catch {}
}
