// src/render.js
// Back-compat entrypoint: main.js imports this.
// Delegate to the single orchestrator in src/render/index.js to avoid double-render paths.

export { render, COLORS } from "./render/index.js";