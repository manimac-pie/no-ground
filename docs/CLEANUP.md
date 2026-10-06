# No Ground: Code Cleanup

*As of 2026-10-06. Based on the code in `main`.*

Drawing speed is in good shape: all 11 items in `PERFORMANCE.md` are done and measured. What's left is mostly **organisation**. Helpers are copied between files, two render files do far too many jobs, and the renderer quietly runs a bit of game logic. The items below fix that. They're grouped into six batches, in the order they're safest to do. Every item in Batches A, C and D moves code without changing behaviour, so play-test after each one: the game should look and feel exactly the same.

## Checklist

Each item gives where the change goes, its impact and its effort. Details are in the numbered sections below.

**Batch A: Housekeeping**
- [x] **1. Add a `.gitignore`** · root · Impact: Low · Effort: Low · *Done 2026-10-06*
- [x] **2. Move the docs into `docs/`** · root · Impact: Low · Effort: Low · *Done 2026-10-06*
- [x] **3. Delete dead code** · `render/worldBackdrop.js`, `render/world.js` · Impact: Low · Effort: Low · *Done 2026-10-06*
- [x] **4. Move the CSS out of `index.html`** · `index.html` → `styles.css` · Impact: Medium · Effort: Low · *Done 2026-10-06*

**Batch B: Tooling (optional, but do it before Batch C)**
- [x] **5. Set up Vite locally** · new `package.json`, `vite.config.js` · Impact: Medium (safety net for C–E) · Effort: Low–Medium · *Done 2026-10-06*
- [x] **6. Add ESLint** · `package.json`, new `eslint.config.js` · Impact: Medium · Effort: Low · *Done 2026-10-06*

**Batch C: Shared code**
- [x] **7. One home for the small helpers** · new `src/shared/`, 13 files · Impact: High · Effort: Low–Medium · *Done 2026-10-06*
- [x] **8. Stop importing `game.js` from the renderer** · `game.js`, `game/constants.js`, 6 render files · Impact: Medium · Effort: Low · *Done 2026-10-06*

**Batch D: Folders**
- [x] **9. Give the leaderboard its own folder** · `src/ui/` → `src/leaderboard/` · Impact: Medium · Effort: Low · *Done 2026-10-06*
- [x] **10. Group the render files** · `src/render/` · Impact: Medium · Effort: Low–Medium · *Done 2026-10-06*
- [x] **11. Move `game.js` into `game/`** · `src/game.js` · Impact: Low · Effort: Low · *Done 2026-10-06*
- [x] **12. Split `render/ui.js`** · `render/ui.js` (1834 lines) · Impact: High · Effort: Medium · *Done 2026-10-06*
- [x] **13. Split `render/index.js`** · `render/index.js` (982 lines) · Impact: High · Effort: Medium · *Done 2026-10-06*

**Batch E: Runtime**
- [x] **14. Take the game logic out of the renderer** · `render/effects.js`, `render/index.js`, `game/index.js` · Impact: Medium (correctness) · Effort: Medium · *Done 2026-10-06*
- [x] **15. Stop copying the state every frame** · `render/index.js` · Impact: Low–Medium · Effort: Medium · *Done 2026-10-06*

**Batch F: Ship (optional)**
- [ ] **16. Deploy the Vite build** · hosting, `dist/` · Impact: Medium (first load on mobile) · Effort: Medium

### Target layout

How Batches A, C and D organised the project. Use it a map.

```
no-ground/
  index.html            markup only
  styles.css
  manifest.webmanifest
  assets/
  docs/                 GAME_DESIGN.html, PERFORMANCE.md, UI_UPDATE.md, WORKER_TODO.md, CLEANUP.md, notes/
  src/
    main.js
    input.js
    shared/             math.js, canvas.js
    game/               index.js (was src/game.js), constants, state, score, platforms, player, tricks
    leaderboard/        api, state, view, claimFlow, blockedNames, reset
    ui/                 layout.js, iteration.js
    render/
      index.js          render(): orchestration only
      camera.js         death cinematic, start push
      effects.js        robot arm, shards, dust
      viewport.js       canvas sizing and transform
      glass.js          shared by menu.js and world/
      menu.js           START firewall
      world/            index, backdrop, ground, buildings, cracks, facades, billboards
      player/           index, body, fx
      hud/              primitives, panelCache, leaderboardPanel, controls, flyby, hud, summary, reset, pause
```

### Before you move anything

The browser loads `src/` as plain ES modules. A wrong import path doesn't give a build error. The page just goes blank. Until Batch B is done, open the DevTools console after every move and look for a red **404** or *"does not provide an export named…"*. That message tells you which file and which import.

After Batch B, `npm run build` checks every import in the project at once (see item 5). Run it after every move.

---

## Batch A: Housekeeping

### 1. Add a `.gitignore`

`src/.DS_Store` is committed. macOS drops these files into every folder Finder opens, so more will keep showing up in `git status`.

Make a `.gitignore` at the root, then remove the tracked file from git without deleting it from disk.

<details><summary>Hint</summary>

`git rm --cached <path>` untracks a file but leaves it on disk. Batch B is next and makes `node_modules/` and `dist/`, so add both to the ignore list now too.
</details>

**Done when:** `git status` doesn't list `.DS_Store` anywhere.

### 2. Move the docs into `docs/`

The root holds 6 planning and design files next to `index.html`. Move them, and this file, into `docs/`. `Update_5oct.md` is a dated note, so it can go in `docs/notes/`.

**Watch out:** some code comments point at these files by name. For example, `src/ui/blockedNames.js:11` mentions `WORKER_TODO.md`. Search for `.md` and `.html` in `src/` and update the paths.

**Done when:** the root holds only `index.html`, `manifest.webmanifest`, `assets/`, `src/` and `docs/` (plus `styles.css` after item 4, and `package.json` and the config files after Batch B).

### 3. Delete dead code

`drawVignette` (`render/worldBackdrop.js:615`) is exported and re-exported by `render/world.js:2`, but nothing calls it. `PERFORMANCE.md` item 1 says the same.

**Question:** before you delete a function, how do you prove nothing uses it? Searching for the name isn't quite enough. Why not?

<details><summary>Hint</summary>

A search finds the definition and the re-export, and both are "uses" that aren't real calls. Look for a call, `drawVignette(`, outside the file that defines it. Also check `index.html` and `GAME_DESIGN.html`, in case a script there reaches it.
</details>

**Done when:** the game runs, and searching for `drawVignette` finds nothing.

### 4. Move the CSS out of `index.html`

`index.html` is 759 lines, and lines 21–571 are one `<style>` block. Moving it to `styles.css` makes the markup readable. It also lets the browser cache the CSS separately from the HTML.

**Watch out:** relative `url(...)` paths inside the CSS (such as the cursor in `assets/`) are resolved from the **CSS file's** location, not the page's. If `styles.css` sits at the root next to `index.html`, nothing changes. If it ever moves into a folder, those paths break.

**Done when:** `index.html` has a `<link rel="stylesheet">` instead of a `<style>` block, and the menu, buttons, leaderboard prompt and custom cursor all look the same.

---

## Batch B: Tooling

Both items add a `package.json` and `node_modules/` (item 1 should already ignore them). Neither changes how the game runs or how it's deployed: the live site keeps serving the plain files until item 16.

> **Set up (2026-10-06).** After cloning, run `npm install` once. Then:
> - `npm run dev`: the game with live reload, at the address it prints.
> - `npm run build`: checks every import and writes `dist/`. Run it after every file move in Batches C and D.
> - `npm run preview`: plays the built `dist/`.
> - `npm run lint`: ESLint over the project.
>
> `vite.config.js` copies `manifest.webmanifest` and `assets/favicon.svg` into `dist/` unchanged. The manifest's `<link>` in `index.html` has a `vite-ignore` attribute so Vite doesn't rename it. Nothing moved into `public/`, so the plain-file site still works as before.
>
> ESLint's first run, with the knock-on deletions it led to, removed 22 unused functions, variables and imports (about 300 lines). Two rules are relaxed in `eslint.config.js`: unused function **arguments** are allowed, because draw functions share signatures, and empty `catch {}` blocks are allowed, because storage calls fail on purpose.

### 5. Set up Vite locally

Batches C and D move a lot of files, and the main risk is a broken import that only shows up as a blank page. Vite turns that into a clear error:
- **`vite build` refuses to build** if an import path doesn't resolve, or names an export the file doesn't have. It prints the file and the import. One build checks the whole project, including screens you didn't think to open.
- **`vite` (the dev server)** shows an error over the page when an import path doesn't resolve, instead of a blank page.

`index.html` already loads `src/main.js` as a module, which is what Vite expects, so very little has to change. You need a `package.json` with Vite as a dev dependency and three scripts: `dev`, `build` and `preview`.

**Question:** `manifest.webmanifest`, the favicon and the cursor in `assets/` are referenced from `index.html` and `styles.css`. When Vite builds, which of them does it process and rename, and which need to go in `public/` to be copied unchanged?

<details><summary>Hint</summary>

Vite follows what it can see from `index.html`: `<script>`, `<link rel="stylesheet">`, and `url(...)` inside CSS it processes. Those files get hashed names in `dist/`. Anything that must keep its exact path, such as the manifest, which browsers fetch by name, goes in `public/`. Check by opening `dist/` after a build and looking for each file.
</details>

**Question:** the leaderboard API address is hard-coded at `src/ui/leaderboard.js:1`. Now that there's a build step, how could local runs point at a fake API so test deaths don't post real scores?

<details><summary>Hint</summary>

Vite reads `.env` files and exposes variables that start with `VITE_` as `import.meta.env.VITE_…`. A `.env.development` can hold a local or fake address while production keeps the real one. This is optional, but it fixes the "test deaths post real scores" problem for good.
</details>

**Done when:** `npm run dev` plays the game, `npm run build` passes, `npm run preview` plays the built `dist/` the same way, and a deliberately broken import (rename a file, then put it back) makes the build fail with the file's name.

### 6. Add ESLint

A linter would have caught item 3 automatically, and it catches the same kind of thing as you go: unused imports, unused variables and helpers that shadow one another. Running it before Batch C gives you a list of unused code to delete *before* you start moving it, so there's less to move. `eslint.config.js` with the recommended rules plus `no-unused-vars` is enough to start.

**Expect noise at first.** The first run will flag things you decide to keep. Fix the real ones, and turn off rules you disagree with in the config instead of sprinkling `// eslint-disable` comments.

**Done when:** `npx eslint src` passes, and you've decided whether to run it before each commit.

---

## Batch C: Shared code

### 7. One home for the small helpers

The same tiny functions are copied into many files:

| Helper | Copies |
|---|---|
| `hash01` | 8 render files |
| `clamp` | `game/utils.js`, `render/playerKit.js`, `render/ui.js`, `render/worldBuildings.js`, `render/worldCracks.js`, `ui/layout.js` |
| `roundedRectPath`, `roundRect` | `render/playerKit.js`, `render/ui.js` |
| `smoothstep01` | `render/playerKit.js`, `game/player.js` |
| `easeOutCubic` | `render/ui.js`, `render/index.js` |

When one copy gets a fix and the others don't, you get bugs that are hard to trace. Make `src/shared/math.js` (numbers only, no canvas) and `src/shared/canvas.js` (path helpers that take a `ctx`). Then make each file import from them.

**The trap:** `render/worldBackdrop.js:14` has a `hash01` that *looks* the same but uses `731.13` where the others use `999.123`. **Question:** what would you see in the game if you swapped it for the shared version? How can you keep it while still sharing the code?

<details><summary>Hint</summary>

Every building, window and antenna in the skyline is placed from `hash01`. A different constant gives a different but equally valid city, so nothing crashes. The skyline just quietly changes. Either give the shared function a seed parameter with `999.123` as the default, or keep the backdrop's version under a different name.
</details>

**Why split math and canvas?** `game/` should never need anything that draws. Keeping them apart means `game/` code can import `math.js` without dragging in canvas code.

**Done when:** each helper is defined exactly once, and the skyline looks identical. Compare a screenshot from before and after.

> **Done (2026-10-06).** `src/shared/math.js` has `clamp`, `smoothstep01`, `easeOutCubic` and `hash01(n, k = 999.123)`, and `src/shared/canvas.js` has `roundedRectPath`. The skyline passes its own `SKYLINE_K = 731.13` as the second argument. `render/playerKit.js` only held copies, so it's gone. `getConst`, copied in `game/player.js` and `game/score.js`, now lives once in `game/utils.js`.
> - The two `easeOutCubic`s differed: one clamped its input and one didn't. Every caller of the unclamped one already passed 0..1, so the clamped one replaced both.
> - Names that still appear twice are different functions that share a name: `fontReady` and `getShards` in `menu.js` and `worldBillboards.js`, and `randRange` (random in `game/utils.js`, seeded in `worldBackdrop.js`).
> - **Verified:** a scripted run in headless Chrome reached the same score as before, and the skyline, HUD, Bob and his building were pixel-identical to the Batch B screenshot.

### 8. Stop importing `game.js` from the renderer

Six render files do `import { world } from "../game.js"`: `index.js`, `menu.js`, `player.js`, `worldBackdrop.js`, `worldBuildings.js` and `worldGround.js`. `world` (`game.js:612`) is just four values from `constants.js`. So the renderer depends on the whole game orchestrator, and through it on the leaderboard code, only to read the screen size.

**Question:** `world` uses getters for `INTERNAL_WIDTH` and `INTERNAL_HEIGHT` but plain values for the other two. Why? What would break if you replaced the getters with plain values?

<details><summary>Hint</summary>

`INTERNAL_WIDTH` and `INTERNAL_HEIGHT` are `let`s that `setInternalSizeFromViewport` changes on resize. A plain value would copy the size at load time and never update. The getters read the live value each time. Keep them when you move `world` into `constants.js`.
</details>

**Done when:** nothing under `src/render/` imports `game.js`, and resizing the window (ultrawide, then phone-sized) still works.

> **Done (2026-10-06).** `world` is in `game/constants.js` with its getters, and the six render files import it from there. **Verified:** at 2560×1080 and 844×390 the canvas follows the new size, and the run summary and leaderboard lay out correctly.

---

## Batch D: Folders

Do these in this order. Each one is mostly dragging files and fixing import paths. Your editor may update imports for you when you move a file, but run `npm run build` after each one anyway.

### 9. Give the leaderboard its own folder

Six of the eight files in `src/ui/` are the leaderboard: `leaderboard.js`, `leaderboardState.js`, `leaderboardView.js`, `leaderboardClaimFlow.js`, `leaderboardReset.js` and `blockedNames.js`. Move them into `src/leaderboard/`. Once they're inside a folder called `leaderboard`, the `leaderboard` prefix is redundant, so you can drop it (`leaderboard/state.js`, `leaderboard/view.js`). `leaderboard.js` does the network calls, so `api.js` describes it better.

What's left in `ui/`: `layout.js` (hit-test rectangles) and `iteration.js` (the run counter in localStorage).

**Done when:** you can post a score, see it on the board, and the blocked-name pop-up still appears. Remember the memory note: **block the leaderboard API in browser tests**, or test deaths post real scores.

> **Done (2026-10-06).** `src/leaderboard/` holds `api.js`, `state.js`, `view.js`, `claimFlow.js`, `reset.js` and `blockedNames.js`. Path mentions in `styles.css`, `docs/WORKER_TODO.md` and the code comments were updated too.

### 10. Group the render files

`src/render/` has 14 files side by side, and the names already show the groups: `world*`, `player*`, `glass`. Make `render/world/` and `render/player/` and move the files in, dropping the prefixes. `render/world.js` (a 4-line file of re-exports) becomes `render/world/index.js`.

**Question:** `glass.js` is used by `menu.js`, `worldFacades.js` and `worldBillboards.js`. Does it belong in `world/` or somewhere else?

<details><summary>Hint</summary>

There's no single right answer. Ask yourself who owns it. If the menu's glass panels and the buildings' glass are really the same material, it's shared: `render/glass.js` or `shared/`. If the menu only borrowed it, put it in `world/`.
</details>

**Done when:** `render/` has `index.js`, `menu.js`, `world/`, `player/` and the soon-to-be-split `ui.js`. Everything draws the same.

> **Done (2026-10-06).** `glass.js` stays at `render/glass.js`: the START firewall and the billboards are the same glass, so it's shared rather than owned by `world/`.

### 11. Move `game.js` into `game/`

`src/game.js` sits next to a `src/game/` folder, which makes "where's the game code?" a two-place answer. Move it to `src/game/index.js`. Its imports change from `./game/x.js` to `./x.js`, and `main.js` imports `./game/index.js`.

**Done when:** there's no `src/game.js`, and a full run works: start, die, summary, restart.

> **Done (2026-10-06).** `main.js` imports `./game/index.js`.

### 12. Split `render/ui.js`

At 1834 lines, it's the biggest file in the project. Reading its function list shows separate screens that share almost nothing except a few drawing primitives:

| Lines (approx.) | What it is | Suggested file |
|---|---|---|
| 25–122 | `easeOutBack`, `roundRect`, `centerText`, `drawKeyChip`, `drawGlow`, `formatNumber` | `hud/primitives.js` (`clamp`, `hash01`, `easeOutCubic` and `roundedRectPath` already come from `shared/`) |
| 124–191 | `drawCachedPanel` + its constants | `hud/panelCache.js` |
| 193–403 | Leaderboard panel | `hud/leaderboardPanel.js` |
| 404–627 | Controls button and panel | `hud/controls.js` |
| 628–701 | Restart flyby | `hud/flyby.js`, or with the summary |
| 702–1085 | In-run HUD: danger, popups, meters, frame | `hud/hud.js` |
| 1086–1621 | Run summary, tally, score capsule, new-best stamp | `hud/summary.js` |
| 1622–1740 | Reset button and glitch | `hud/reset.js` |
| 1741–end | Pause overlay and countdown | `hud/pause.js` |

**Order matters:** move the primitives and `panelCache` first. Every other section imports them, so once they exist, each later section can be cut out and only needs its imports fixed.

**Question:** the constants just above each section (`SCORE_PULSE_SEC`, `SUMMARY_ROW_H`, `PAUSE_PANEL_W`…) are only used inside that section. Should they move with their section, or into `game/constants.js`?

<details><summary>Hint</summary>

Move them with their section. `game/constants.js` is for values the game rules depend on. These are purely about looks and belong next to the code that draws them.
</details>

**Done when:** no file in `hud/` is over about 550 lines, `render/index.js` imports from `hud/`, and every screen looks the same: HUD, pause, summary, leaderboard, controls panel and reset.

> **Done (2026-10-06).** Nine files in `render/hud/`; the largest is `summary.js` at 552 lines. Each file's imports were worked out from ESLint's `no-undef` results, so every name comes from exactly one place. `summary.js` imports the RESET button pieces from `reset.js`, because the button sits inside the summary panel. The stale `// drawMenus moved to src/render/menu.js` comment was dropped.

### 13. Split `render/index.js`

`render()` is the orchestrator, but the file also holds about 400 lines of self-contained pieces:

- **Camera moves:** `computeDeathCinematic` (`:84`) and `computeStartPush` (`:166`), plus `easeInOutCubic`, which only they use. They return numbers and don't draw anything → `render/camera.js`.
- **Effects:** `drawRobotArm` (`:234`), `updateAndDrawBreakShards` (`:344`), `drawDeathScrapeDust` (`:390`) → `render/effects.js`.
- **Canvas sizing:** `setCanvasRect`, `setMaxDpr`, `ensureCanvasSize`, `applyViewportTransform`, `resetCtx` (`:479–568`) → `render/viewport.js` if you want. This one is optional.

**Watch out:** `drawDeathScrapeDust` reads and writes `dragTrail` and `dragTrailEmitT`, which are module-level variables (`:461`). When the function moves, those variables need to move with it. Leave them as they are for now: item 14 deals with them properly.

**Done when:** `render/index.js` is mostly `render()` itself, and the death sequence (robot arm, shards, dust, zoom) plays exactly as before.

> **Done (2026-10-06).** `render/index.js` is down to 502 lines: `COLORS`, the per-frame state, `setTouchUi` and `render()`. `camera.js`, `effects.js` and `viewport.js` hold the rest, and `main.js` imports `setCanvasRect` and `setMaxDpr` from `viewport.js`. The build caught the one import that broke (`main.js` still asking `render/index.js` for `setCanvasRect`).
>
> **Verified (whole batch):** lint clean and build passing after every step. A scripted run in headless Chrome, with the leaderboard API blocked, went through the start screen, running, pause, the resume countdown, death, the run summary with bonus rows, the leaderboard, RESET, a second run, and resizes to 2560×1080 and 844×390, with no errors. The controls panel was drawn from the new `hud/controls.js` directly, because the scripted click doesn't open it on the old code either.

---

## Batch E: Runtime

These two items change how the code runs, not just where it lives. Do them after Batch D, when the pieces are small enough to see clearly.

### 14. Take the game logic out of the renderer

Some of the simulation happens inside the draw code:
- `updateAndDrawBreakShards` (`render/effects.js:122`) applies gravity and drag to the shards, then draws them. Dead shards are skipped but never removed from `state.breakShards`.
- The scrape dust (`render/effects.js:168`) spawns, ages and deletes particles in `dragTrail` (`:9`), inside the renderer.
- `prevDeathActive`, `deathFocusX` and `_camX` (`render/index.js:71–76`) remember the last frame's state at module level.

**Why it matters:** `PERFORMANCE.md` item 5 skips drawing frames where nothing changed. Anything that *moves* during drawing only advances when a frame is drawn, so it's tied to the frame rate instead of the game's `dt`. It works today mostly by luck.

**Question:** which of these are really *game* state, and which are fine where they are? (The camera's smoothing lag is a good one to think about.)

<details><summary>Hint</summary>

A useful test is to ask: "if I paused the game, should this keep moving?" Shards and dust should freeze, so they're game state. Move their physics into the game update and keep only the drawing in the renderer. `prevDeathActive` detects "death just started", which is something the game already knows, so it can set a flag instead. Camera smoothing is a fair thing for the renderer to keep, because it's purely about the view.
</details>

**Done when:** `render/` only *reads* `state`. Searching for `state.` followed by `=` in `render/` finds nothing except the start-prompt bounds (or move those too). Pausing during the death shards freezes them.

> **Done (2026-10-06).** The renderer wrote to the game state in more places than the list above: it also triggered the START smash, reported the RESET hover and two hit-test rectangles, corrected `leaderboardExpanded`, and marked billboards `breakSpawned`. One rule now covers all of it: **the renderer never writes `state`, and anything it animates moves on the game's clock.**
> - **Shards** are spawned and moved in `game/breakShards.js`, at the fixed 60 Hz step, and dead ones are removed. `render/effects.js` only draws them.
> - **The START smash** moved into the game: `game/firewall.js` holds the pane's size and place, and `checkStartSmash` runs after each step. `render/menu.js` and the game's click hit-test both use the same geometry, so `state.startPromptBounds` is gone.
> - **Hit-test results** the renderer works out while drawing (RESET hovered, START hovered, the board's expand arrow) go to `hitAreas` in `ui/layout.js`, not the game state. The game reads them to handle clicks.
> - **`leaderboardExpanded`** is un-set by the game when the list shrinks to 3 rows or fewer.
> - **Billboard shatters** are tracked by a `WeakMap` in `render/world/buildings.js` (the same "did it just start?" pattern as the collapse effects), so `breakSpawned` is gone from the game.
> - **Death focus:** `prevDeathActive` and `deathFocusX/Y` are gone. Nothing moves Bob after `endGame()`, so the focus is just the centre of `state.deathSnapshot`.
> - **The game clock:** `render()` takes its `dt` from `state.uiTime` instead of `performance.now()`, so camera lag, scrape dust, building debris, billboard glass and Bob's pose smoothing all move exactly as far as the game did, and stop while paused (`uiTime` stands still).
> - **Scrape dust stays in the renderer**, unlike the hint above: it follows the claw, which only `render/camera.js` places, and it's purely visual. On the game clock it already freezes and keeps time, which is what the hint was after.
> - **A lint rule** (`no-restricted-syntax` in `eslint.config.js`) fails `npm run lint` on `state.x = …` or `state.player.x = …` anywhere in `render/`. It can't catch writes through another name (`const p = state.player; p.x = 1`).
> - **About the last check:** the game can't be paused during the death cinematic (`canPause`), so it's checked more broadly: two screenshots taken 1.2 s apart while paused mid-run differ only in the blinking "SPACE / P TO RESUME" hint.

### 15. Stop copying the state every frame

On the death screen and the start screen, `render/index.js:285–317` builds new copies of `state` and `player` with `{...state}` and `{...player}` on **every frame**, just to override a few fields such as `vy: 0` and `ducking: false`. `state` is a big object, so that's a lot of short-lived garbage at 120 Hz. It's the kind that causes a small stutter when the garbage collector runs.

**Question:** the draw functions read things like `player.ducking`. How can they be told "pretend he isn't ducking" without a new `player` object?

<details><summary>Hint</summary>

Pass a small, reused "view overrides" object alongside the state (for example `{ frozen: true, onStartScreen: true }`) and let the few draw functions that care check it. Or keep one preallocated `menuPlayer` object at module level and copy just the fields that change into it, instead of making a new one.
</details>

**Done when:** no spread of `state` or `player` remains in `render()`, and the death freeze and the start-screen pose look the same.

> **Done (2026-10-06).** `render/index.js` keeps two objects for the whole session, `poseView` and `posePlayer`, and `poseFor()` fills them in place on the death and start screens (`Object.assign` with the constant overrides `LIMP` and `STANDING`). Every other frame passes `state` straight through. `drawPlayer` only reads six fields of the state it's given (`player`, `slowfallHeld`, `heavyLandT`, `speedImpulse`, `running`, `speed`), and its comment now says so, so `poseView` carries just those instead of a copy of the whole state.

---

## Batch F: Ship (optional)

### 16. Deploy the Vite build

Right now the browser downloads 33 module files, and it only finds out about each one after the file that imports it has arrived. On a phone with slow round-trips, that waterfall is most of the first-load time. The build from item 5 joins them into one minified file and adds a content hash to the name, so updates are never stuck behind an old cache.

It comes last because it's the only item that changes what players get. Everything before it can be tested locally and undone.

**Questions to answer first:**
- Where is the game hosted, and can that host run `npm run build` and serve `dist/` instead of the repo as-is? If not, can you build locally and upload `dist/`?
- Does the leaderboard Worker check the page's origin (CORS)? If the deployed address changes, the Worker has to allow the new one.

**Done when:** the deployed site serves `dist/`, the Network tab shows a handful of requests instead of 33, and a score posted from the live site appears on the board.
