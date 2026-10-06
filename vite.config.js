// vite.config.js
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// The manifest is fetched by name, and its start_url and icon paths are relative
// to it, so it's copied to dist/ unchanged (its <link> in index.html has
// vite-ignore). The plain-file site keeps working, since nothing had to move.
const COPY_AS_IS = ["manifest.webmanifest", "assets/favicon.svg"];

function copyAsIs() {
  return {
    name: "copy-as-is",
    generateBundle() {
      for (const fileName of COPY_AS_IS) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(fileName) });
      }
    },
  };
}

export default defineConfig({
  base: "./", // relative URLs, so dist/ works from any folder on a host
  plugins: [copyAsIs()],
});
