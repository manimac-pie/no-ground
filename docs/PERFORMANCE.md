# No Ground: Performance Review

*As of 2026-09-30. Based on the code in `main`.*

> File paths and line numbers here are from before the 2026-10-06 cleanup, which moved and split most of `src/`. See `CLEANUP.md` for where things went (for example, `render/ui.js` is now `render/hud/`).

Almost all the per-frame cost is in drawing. The game logic only handles about 10 platforms and a few particles per step, so tuning it won't change much. The items below are ranked by expected impact.

## Checklist

Each item gives where the change goes, its impact and its effort. Details are in the numbered sections below.

- [x] **1. Draw the static background once** · `render/worldBackdrop.js` · Impact: High · Effort: Low · *Done 2026-10-04*
- [x] **2. Cache skyline tiles** · `render/worldBackdrop.js` · Impact: High · Effort: Medium · *Done 2026-10-04*
- [x] **3. Pre-render the scanlines** · `render/worldBackdrop.js` · Impact: Medium–High · Effort: Low · *Done 2026-10-04*
- [x] **4. Stop blurring on the fly** · `render/playerFx.js`, `render/worldBuildings.js` · Impact: High (mobile) · Effort: Medium · *Done 2026-10-04*
- [x] **5. Don't redraw frames where nothing changed** · `main.js` · Impact: High on 120 Hz screens · Effort: Low–Medium · *Done 2026-10-04*
- [x] **6. Stop reading the layout every frame** · `render/index.js` · Impact: Medium · Effort: Low · *Done 2026-09-30*
- [x] **7. Cache UI panels** · `render/ui.js` · Impact: Medium · Effort: Medium · *Done 2026-09-30*
- [x] **8. Stamp the START text as one image** · `render/menu.js` · Impact: Medium (start screen) · Effort: Low · *Done 2026-09-30*
- [x] **9. Reuse particle objects** · `render/worldBuildings.js` · Impact: Medium (stutter) · Effort: Medium · *Done 2026-09-30*
- [x] **10. Remove per-frame "ensure defaults" checks** · `game/platforms.js`, `game/player.js` · Impact: Low · Effort: Low · *Done 2026-09-30*
- [x] **11. Scale resolution down on slow devices** · `render/index.js` · Impact: Medium (low-end) · Effort: Low · *Done 2026-10-04*

## Biggest wins

### 1. Draw the static background once

`drawBackground` (`src/render/worldBackdrop.js:187`) redraws the sky gradient, low sun, aurora, fog bands and distant ridges every frame. None of them move.

**Fix:** draw them once to an offscreen canvas whenever the window resizes, then copy it each frame with a single `drawImage`. The vignette (`worldBackdrop.js:404`) builds a new radial gradient every frame and can be cached the same way.

**Done (2026-10-04).** In `worldBackdrop.js`, `stampBackground` paints the background once into a canvas-sized offscreen canvas at the current device scale and sub-pixel offset. It then stamps it 1:1 with `drawImage`.
- It repaints when the scale, offset, internal size, ground height or colours change.
- Offsets are rounded to 1/64 px, so float noise in the camera transform doesn't force a repaint.
- While the zoom animates (menu zoom-in, death cinematic) or the camera pans while zoomed, it draws directly. It repaints only once the view has held still for a frame, so it never repaints every frame.
- The vignette was left alone: `drawVignette` isn't called anywhere.

**Verified:** old and new were drawn side by side in Chrome (Apple M2 GPU), at the gameplay view and the 2.8× start-screen zoom. The background differs by at most 5–6/255, on about 0.001% of values. Gameplay backdrop cost, background and skyline together: 0.096 → 0.039 ms per frame.

### 2. Cache skyline tiles

`drawSkylineLayer` (`worldBackdrop.js:27`) rebuilds each parallax tile from scratch every frame: buildings, rooftops, antennas, cranes and windows, each with several `hash01` calls. The tiles are fixed for a given tile index.

**Fix:** draw each tile to a small offscreen canvas once and keep it in a `Map` keyed by layer and tile index. Drop tiles that have scrolled off screen. The parallax pass then becomes a few `drawImage` calls per layer instead of hundreds of `fillRect`s.

**Done (2026-10-04).** In `worldBackdrop.js`, `drawSkylineTiles` keeps one `Map` per layer from tile index to an offscreen canvas.
- A tile's exact bounds come from a dry run of `drawSkylineLayer` against a bounds-recording stand-in, so each canvas is as small as possible. Crane arms and accents overhang the tile edges, and those are included.
- A tile is painted only once it's on screen, then stamped with `drawImage` at its sub-pixel position.
- Tiles that leave the drawn range are dropped, and their canvases are reused for new tiles.
- All tiles are repainted when the device scale or horizon changes (resize).
- The three layer styles are now constants (`FAR_SKYLINE`, `MID_SKYLINE`, `NEAR_SKYLINE`).
- When the scale is still changing, or a tile would be wider than the screen (2.8× start-screen zoom, death zoom), it draws directly as before. A first version cached at zoom too, which made the start screen 3× slower and used far more memory.

**Verified:** 240 scrolling frames were compared with the camera shift drifting by fractions of a pixel. The difference is at most 12–17/255, on about 0.1% of values. That's stamping pre-drawn tiles at sub-pixel positions, which softens 2 px windows and antennas very slightly, and it isn't visible in side-by-side crops. At the start-screen zoom the cost is unchanged (0.085 → 0.073 ms).

### 3. Pre-render the scanlines

`worldBackdrop.js:397` does one `fillRect` for every 3 px of screen height, which is 150 or more calls per frame.

**Fix:** draw the pattern once to an offscreen canvas, or move it to a CSS overlay on top of the canvas so the canvas doesn't draw it at all.

**Done (2026-10-04).** In `worldBackdrop.js`, `stampScanlines` paints the scanlines once into a 1-device-pixel-wide strip, at the current vertical scale and sub-pixel offset. It then stretches the strip across the screen with a single `drawImage`.
- A CSS overlay was ruled out: the scanlines are drawn between the parallax and the world, so an overlay would also darken the platforms, player and UI.
- Every column of the pattern is the same, so the cache key only uses the vertical part of the transform. The horizontal parallax shift never forces a repaint.
- It uses the same rules as the background cache. While the zoom animates it draws directly, and it repaints only once the view has held still for a frame.
- Wider strips (32 and 256 px) were tried in case Chrome doesn't GPU-back tiny canvases. They were no faster than 1 px.

**Verified:** in headless Chrome (ANGLE Metal, Apple M2), old and new were drawn side by side for 40 frames each with a drifting parallax shift. Views tested: the 2× screen gameplay view, 1280×720 at 1×, a phone landscape view, and the 2.8× start-screen zoom. The difference is at most 1–2/255, from 8-bit alpha rounding of the faint lines. While the zoom animates, it falls back to drawing directly and the output is identical. `drawParallax` cost: 0.089 → 0.036 ms per frame at the gameplay view and 0.085 → 0.060 ms at the start-screen zoom.

### 4. Stop blurring on the fly

`ctx.filter = "blur(...)"` in `playerFx.js:24`, `:109` and `:275`, and `shadowBlur` on roof cracks (`worldBuildings.js:495`, `:582`), are among the most expensive things a 2D canvas can do. Mobile Safari is especially slow here, or ignores `ctx.filter`.

**Fix (either):**
- Draw the blurred trail and glow shapes once to small offscreen sprites and stamp them with `drawImage`.
- Fake the glow with two or three strokes at lower alpha and increasing width.

**Done (2026-10-04), faked with layered strokes.** Measurement showed that Chrome's `blur()` and `shadowBlur` are both in device pixels, so each replacement converts its radius into local units from the current transform.
- **Flip ribbon and slowfall halo** (`playerFx.js`): `strokeSoft` draws a wider stroke at 30% under the core at 75%.
- **Trick afterimage** (`playerFx.js`): blended additively, each ghost is drawn as four nested copies, grown or shrunk by ±0.5σ and ±1.5σ, at a quarter strength each. Together they build the blur's edge ramp.
- **Roof and wall crack glow** (`worldBuildings.js`): `strokeWithGlow` draws three round-joined bands sized to the shadow's Gaussian falloff. They're scaled by the line width and the colour's alpha, which is how a real shadow's strength works.

**Verified:** each effect was drawn old and new in Chrome (M2 GPU) at the gameplay scale. Max difference is 7–12/255, with at most 1% of values more than 4/255 off. Side-by-side crops look the same. The afterimage's faint dark wheel comes out slightly fainter.

| Effect | Old (ms/draw) | New (ms/draw) |
| --- | --- | --- |
| Flip ribbon | 0.71 | 0.009 |
| Afterimage | 1.98 | 0.029 |
| Slowfall halo | 0.20 | 0.006 |
| Roof cracks (one roof) | 1.90 | 0.045 |
| Wall cracks (one building) | 2.74 | 0.033 |

**Still blurring every frame:** the player body glow (`shadowBlur = 12` in `render/player.js`) is applied to every shape of the runner whenever it's on screen. The `ui.js` and `menu.js` shadows are now cached, so they no longer run every frame.

### 5. Don't redraw frames where nothing changed

In `main.js`, the loop rendered on every `requestAnimationFrame` even when no physics step ran. On a 120 Hz phone or ProMotion screen, half the frames redraw the exact same state.

**Fix (either):**
- **Simple:** skip `render()` when `steps === 0`. This roughly halves the render cost on those screens.
- **Better:** pass `acc / FIXED_DT` to the renderer and blend between the previous and current positions. The game then looks smooth at 120 fps while physics stays at 60 Hz.

**Done (2026-10-04), simple version.** `main.js` calls `render()` only when `steps > 0`. The canvas keeps the last frame in between. Render-side animation (camera smoothing, shards, debris, drag trail) is already scaled by the real time between draws, so nothing slows down. Blending between physics steps is still open if 120 Hz motion should look smoother.

**Verified:** in Chrome on a 60 Hz screen, there were 60.6 frames and 57 renders a second. The skipped frames are timing jitter where no step was due and the picture would have been identical. A run starts and plays normally, with no console errors. Not yet measured on a 120 Hz screen.

## Medium wins

### 6. Stop reading the layout every frame — Done (2026-09-30)

`ensureCanvasSize` (`render/index.js`) and the pointer mapping called `getBoundingClientRect()` every frame, which can force the browser to recalculate layout.

**Fix:** `main.js` already knows the size in `onResize`. Store it there and pass it to the renderer.

**What changed:**
- `render/index.js`: new `setCanvasRect(rect)`. The renderer keeps the canvas box and uses it for both the backing-store size and the pointer mapping. If nothing has been set yet, it measures once.
- `main.js`: `setCanvasSize` (run from `onResize` on resize, orientation change, fullscreen change and visual-viewport resize) measures the canvas once after sizing it and passes the result in.
- The pointer maths is unchanged. Using `input.js`'s own `pointerInViewport` flag instead would have been simpler, but `input.js` clears that flag on every pointer-up, so the START and RESET hover would switch off after each click.
- The remaining `getBoundingClientRect` calls are in `input.js` and run only on pointer events.

### 7. Cache UI panels — Done (2026-09-30)

`src/render/ui.js` built about 16 gradients, set `font` about 30 times, called `measureText` about 17 times and drew glow shadows every frame, for panels that barely change: the leaderboard, the controls panel, the HUD bezel and the run summary.

**Fix:** draw each panel's static parts to an offscreen canvas. Redraw it only when its data changes (a new leaderboard, a resize, a hover state). Draw only the changing numbers live.

**What changed (`src/render/ui.js`):**
- **Shared helper.** `drawCachedPanel(ctx, slot, contentKey, box, draw)` paints a piece once into an offscreen canvas at the exact device scale and sub-pixel offset, clipped to the visible canvas. It then stamps the piece 1:1 with `drawImage`. It repaints when the content key, scale, offset or inherited paint state changes.
  - It copies the caller's inherited paint state into the offscreen canvas. This matters on the restart screen, where the score glow is left on and RESET and the leaderboard pick it up. That state is part of the cache key.
  - While stamping it turns the shadow off, so the glow isn't applied twice.
  - It draws directly whenever group alpha, a blend mode or a filter is active.
- **Start screen.** The leaderboard is cached, keyed on its entries, best score, layout and expanded state. The clickable arrow area is cached along with it. The controls button is cached per open/hover state, and the controls panel is cached.
- **HUD.** It's split into `drawHudFrame` (bezel, scanlines, labels, bar tracks), which is cached, and a live layer (score, distance, jump count, bar fills). While it slides in or out, it's drawn directly.
- **Run summary.** Once the panel has slid in, `drawRunSummaryFrame` (rig, panel, header, stat rows) is cached. The score capsule is cached once the tally finishes, and the RESET button is cached per hover state. While sliding or fading, everything is drawn directly as before.

**Verified:** old vs new `ui.js` were drawn side by side in Chrome (GPU on) at a real UI scale with a sub-pixel offset, over an opaque busy background. The cases were: HUD settled and sliding; leaderboard collapsed, expanded and fading; controls button idle, hover and open; controls panel; run summary sliding, mid-tally, settled and with RESET hover.
- **Pixels:** the sliding and fading cases are pixel-identical. Settled cases differ by at most 2–3/255 almost everywhere. Worst cases: 5 pixels at 6/255 in the run summary, and 3 isolated text-edge pixels at up to 14/255 (leaderboard) and 21/255 (controls panel). The leaderboard's clickable arrow area is identical, and the real start screen looks the same side by side.
- **Cost per frame:** start screen UI 3.08 → 0.08 ms; HUD 0.14 → 0.04 ms; settled run summary 2.90 → 0.20 ms.

### 8. Stamp the START text as one image — Done (2026-09-30)

The START text in `menu.js` is built from 2 px tiles. The tile data was already cached, but every frame on the start screen drew each tile with its own `save`/`restore` and a 10–22 px `shadowBlur`, which meant hundreds of blur operations per frame for one word.

**Fix:** keep a pre-drawn image of the whole word and use `drawImage`. Switch to per-tile drawing only when it's smashed.

**What changed (`src/render/menu.js`):**
- At rest, the word is painted once into an offscreen canvas at the exact on-screen scale. It's drawn 1:1 onto device pixels, with the sub-pixel offset baked in so edges antialias exactly as before.
- The pulsing glow is rounded to 16 levels, so the image only rebuilds when the level changes (about 6 times a second). Blue and red (hover) are cached separately, and the image rebuilds on resize.
- The per-tile path is still used while the word is smashing, during the zoom-out (the scale changes every frame), or if the transform isn't axis-aligned. Its per-tile `save`/`restore` and style strings are now set once per frame.
- The shared `neonTileStyle` / `drawNeonTile` helpers draw the tiles for both paths, so the pixels come from the same code.

**Verified:** the old and new `drawStartPrompt` were drawn side by side in Chrome with the GPU on, at 4 scales, with glow on and between levels, hover, smashing and zooming.
- **Smashing and zooming:** pixel-identical.
- **At rest, at the real start-screen zoom:** at most 4/255 per channel (mean 1.0), all in the faint glow. That comes from building the glow on a transparent canvas and compositing it once.
- **At an unusually small scale:** at most 12/255. Side-by-side crops of the real game look the same.
- **Cost at rest:** about 0.46 ms → 0.03 ms per frame, roughly 15× cheaper.

With Chrome's software renderer (`--disable-gpu`, used by some older or blocklisted GPUs), the faint glow halo can come out slightly weaker or stronger. Its 8-bit rounding of very faint layers behaves differently there.

### 9. Reuse particle objects — Done (2026-09-30)

Debris, billboard debris, rubble and building chunks (`worldBuildings.js`) created new objects with `push` and removed them with `splice` in the middle of the array. That creates garbage-collection pauses during roof breaks, which is exactly when a stutter is most noticeable.

**Fix:** use a pool per particle type. Remove dead particles by swapping them with the last element and popping, instead of `splice`.

**What changed (`src/render/worldBuildings.js`):**
- A small pool (`createParticlePool` / `allocParticle` / `freeParticle`) keeps live particles at the front of an array. A dead particle is swapped with the last live one. Pools grow when needed, so bursts are never dropped. Objects are reused, not reallocated.
- The four separate step and draw loops now share `stepParticles` and `drawParticles`. Drawing does one `save`/`restore` per pool instead of one per particle.
- Spawns assign fields in the original order, so `Math.random` is called in exactly the same sequence as before.

**Verified:** the real game ran in Node for 5 seeds × 20,000 frames with a scripted bot. A fake canvas recorded every `fillRect` (position, size, colour, alpha) from `drawBuildingsAndRoofs`, and the old and new code were compared.
- **Rectangles:** the set drawn was identical in every frame (about 17.6 million in total), and the random-number sequence stayed in sync.
- **Coverage:** all four particle types were exercised. Pools peaked at about 60 rubble, 26 debris, 36 billboard debris and 75 chunks, then were reused.
- **Draw order:** within a frame, particles can now draw in a different order. Overlaps between translucent particles can blend in a slightly different order, which isn't noticeable.

## Small cleanups

### 10. Remove per-frame "ensure defaults" checks — Done (2026-09-30)

`updatePlatforms` (`platforms.js`) and `integratePlayer` (`player.js`) checked every field with `Number.isFinite` and `typeof` every step. The platform and player objects are always created with full fields in `spawnNextPlatform` and `createInitialState`, so these checks could go. It's a small speed gain but makes the code much easier to read.

**What changed:**
- `game/state.js`: added the fields that previously only existed because of the checks. These are `speedImpulse` on the game state, and `diving`, `divePhase` and `divePhaseT` on the player. Both `createInitialState` and `resetRunState` now set them.
- `game/platforms.js`: the starter roof now has `lowSpawnBreak: false` and `breakable: false`. It's still protected by `invulnerable`. Removed the defaults blocks, the `?? 0` fallbacks and the `p ?` guards from `updatePlatforms`. Also removed a duplicate `inWindow` declaration.
- `game/player.js`: removed the defaults block in `integratePlayer`, the dive and dash field checks, the `Array.isArray`, `!plat` and `Number.isFinite` guards around billboards, and the `score` / `diveCount` / `billboardDashCount` checks. Also removed the now-unused `PLAYER_X` constant.
- Kept on purpose: `getConst` fallbacks (they run once at load), fallbacks in `spawnNextPlatform` (not per frame) and the `endGame` fallback.

**Small side effects:** a restart now clears two values that used to carry over from the previous run.
- Any dash speed boost still active at death (`speedImpulse`). Before, it could give the next run a small speed boost at the start.
- A dive left active at death (`diving`). Before, it could stay set on the start screen until the next update.

**Verified:** old and new code were run side by side in Node with seeded randomness and a scripted bot, for 11 seeds × 40,000 frames. That covered about 800 deaths and restarts, 4,500 dives, 4,500 dashes, 5,800 flips, roof collapses, billboards and break-jump graces. Game state matched in every snapshot (about 4,500), once the two reset values above were aligned. The page also loads in Chrome with no console errors.

### 11. Scale resolution down on slow devices

Resolution is already capped at `devicePixelRatio` 1.5 (`index.js:507`), which is good. On slow phones, drop to 1.0 automatically if average frame time goes over about 20 ms.

**Done (2026-10-04).**
- `render/index.js`: the 1.5 cap is now `maxDpr`, changed with the new `setMaxDpr(value)`.
- `main.js`: `watchFrameTime` skips the first 3 seconds, then averages the time between frames over 2-second windows. If a window averages over 20 ms (under about 50 fps), it calls `setMaxDpr(1)` once, for the rest of the session, and logs `[perf] … rendering at 1x resolution.` Gaps over 250 ms (tab switches, debugger pauses) are ignored. Returning to the tab restarts the window with a 1-second warm-up. The cached UI panels and START image rebuild by themselves, because they are keyed on scale.
- iPhone Low Power Mode limits Safari to 30 fps, so it also triggers the drop.

**Verified:** in Chrome on a 2× screen, adding 25 ms of busy work per frame (about 40 fps) dropped the canvas from 1453×984 to 969×656 within one window. A normal 8-second run at 60 fps stayed at 1453×984.

## How to measure

1. Record about 10 seconds of play in the Chrome DevTools **Performance** panel, ideally with **4× CPU throttling** to mimic a phone.
2. Add a debug overlay showing average `game.update` and `render` times, toggled with a key.
3. Measure before and after each change. Items 1, 2, 4 and 5 are expected to account for most of the render cost.
