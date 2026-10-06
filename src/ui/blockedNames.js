// src/ui/blockedNames.js
// Names the leaderboard won't accept. Edit this list freely.
//
// Each entry is either:
//   "name"                                  blocked, shows DEFAULT_BLOCKED_MESSAGE
//   { name: "name", message: "..." }        blocked, shows its own pop-up message
//   { name: "name", contains: true, ... }   also blocks any name with it inside ("xbobx")
//
// Matching ignores case, spaces and _ - . so "Ad_Min" and "a d m i n" both match "admin".
//
// This check runs in the browser only. To also stop names sent straight to the API,
// the Worker's /api/claim needs the same list (see docs/WORKER_TODO.md).

export const DEFAULT_BLOCKED_MESSAGE = "This name is reserved by the system. Pick another.";

export const BLOCKED_NAMES = [
  { name: "admin", contains: true, message: "ADMIN is a system account. Bob doesn't get admin rights." },
  { name: "system", contains: true, message: "You are not the system. The system is watching you." },
  { name: "root", message: "Root access denied. Nice try." },
  { name: "67", contains: true,message: "There will be no 67s here." },
  { name: "69", message: "69. Nice. Try again." },
  { name: "Bob", contains: true, message: "You are all Bob to the system. Pick a different name."},
  "null",
  "undefined",
];


function normalize(name) {
  return String(name || "").toLowerCase().replace(/[\s_.\-]/g, "");
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
