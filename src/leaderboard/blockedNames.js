// src/leaderboard/blockedNames.js
// Names the leaderboard won't accept. The list is in blocked-names.json (repo root): edit it freely.
// The game checks it here; the leaderboard Worker reads the same file from the live site
// (https://manimac-pie.github.io/no-ground/blocked-names.json, re-read every 5 minutes) and refuses
// those names on /api/claim too, so a push is all a change needs.
//
// Each entry is either:
//   "name"                                       blocked, shows DEFAULT_BLOCKED_MESSAGE
//   { "name": "name", "message": "..." }         blocked, shows its own pop-up message
//   { "name": "name", "contains": true, ... }    also blocks any name with it inside ("xbobx")
//
// Matching ignores case, spaces and _ - . so "Ad_Min" and "a d m i n" both match "admin".
// The Worker matches the same way (worker/src/worker.js), so keep the two in step.

import BLOCKED_NAMES from "../../blocked-names.json";

export { BLOCKED_NAMES };

export const DEFAULT_BLOCKED_MESSAGE = "This name is reserved by the system. Pick another.";

function normalize(name) {
  return String(name || "").toLowerCase().replace(/[\s_.-]/g, "");
}

// Returns the pop-up message if the name is blocked, or null if it's allowed.
export function blockedNameMessage(name) {
  const value = normalize(name);
  if (!value) return null;
  for (const entry of BLOCKED_NAMES) {
    const rule = typeof entry === "string" ? { name: entry } : entry;
    const blocked = normalize(rule?.name);
    if (!blocked) continue;
    const hit = rule.contains === true ? value.includes(blocked) : value === blocked;
    if (hit) return rule.message || DEFAULT_BLOCKED_MESSAGE;
  }
  return null;
}
