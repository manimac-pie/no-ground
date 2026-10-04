# No Ground: UI Update

*As of 2026-10-04. Based on the code in `main`.*

The game looks good: the neon city, the hanging run summary and the robot-arm death all land. What's missing is **feedback**. The game often doesn't tell the player what just happened, what state they're in, or how they're doing against their best. The items below fix that. They're grouped into four batches and ranked by impact within each batch.

## Checklist

Each item gives where the change goes, its impact and its effort. Details are in the numbered sections below.

**Batch A: Feel**
- [x] **1. Bonus score pop-ups** · `game/player.js`, `game/state.js`, `render/ui.js` · Impact: High · Effort: Low–Medium
- [x] **2. Ground-danger and low-fuel warnings** · `render/ui.js` · Impact: High · Effort: Low
- [x] **3. Personal-best target** · `render/ui.js` · Impact: High · Effort: Low
- [x] **4. One name for Slowfall, plus mobile button labels** · `render/menu.js`, `render/ui.js`, `index.html` · Impact: Medium · Effort: Low

**Batch B: Flow**
- [ ] **5. Pause and resume countdown** · `main.js`, `input.js`, `game.js`, `render/ui.js`, `index.html` · Impact: High (mobile) · Effort: Medium
- [ ] **6. Faster restart** · `game.js`, `input.js`, `render/ui.js` · Impact: High · Effort: Low–Medium

**Batch C: State at a glance**
- [ ] **7. Clearer HUD meters** · `render/ui.js`, `render/playerFx.js` · Impact: Medium · Effort: Medium
- [ ] **8. Fuel and cooldown on the mobile buttons** · `main.js`, `index.html` · Impact: Medium–High (mobile) · Effort: Low–Medium

**Batch D: Polish**
- [ ] **9. Run summary shows points** · `render/ui.js`, `game/state.js` · Impact: Medium · Effort: Low–Medium
- [ ] **10. First-run move hints** · `game/platforms.js`, `render/ui.js` · Impact: Medium (new players) · Effort: Medium
- [ ] **11. Reduced motion and readable text** · `index.html`, `render/index.js`, `render/ui.js` · Impact: Medium (accessibility) · Effort: Low

## Batch A: Feel

### 1. Bonus score pop-ups

Bonuses go straight into `state.score` with no visible sign:
- the roof-break bonus at `src/game/player.js:83`
- the dive bonus at `src/game/player.js:119`
- billboard smashes (+130) at `src/game/player.js:229` and `:277`
- billboard over (+50) and under (+60) at `src/game/player.js:356` and `:359`
- the dash bonus at `src/game/player.js:402`

Players never find out that these moves are worth points, so the "expressive air" pillar doesn't come across.

**Fix:**
- Add `state.scoreEvents`, a small fixed-size ring buffer of `{ label, amount, t, x, y }` that is reset in `state.js`. Push to it at each bonus site. The renderer stays read-only.
- In the UI layer, draw rising, fading text above Bob ("+130 SMASH", "+50 OVER", "+60 UNDER"), in Share Tech Mono with the HUD glow. Reuse the objects so nothing is allocated per frame (same approach as `PERFORMANCE.md` item 9).
- Give the HUD score a short pulse (scale or brightness) when an event lands.

**Verify:** smash, go over and under billboards, and dive. Each pop-up's amount should match the change in the HUD score.

### 2. Ground-danger and low-fuel warnings

`drawHUD(ctx, state, danger01, COLORS)` (`src/render/ui.js:880`) is passed `danger01` (`src/render/index.js:604`, which reaches 1 as Bob nears the ground) but never reads it. The slowfall fuel bar also gives no warning before it runs out.

**Fix:**
- Tint the HUD border red, and add a faint red edge vignette, scaled by `danger01`.
- Make the FUEL bar blink when it's below about 20% while Bob is slowfalling.

**Verify:** drop toward the ground and watch the tint grow. Slowfall until empty and check that the bar blinks before it runs out.

### 3. Personal-best target

The HUD shows only the current score. Your best is visible only on the leaderboard panel, and the run summary never says when you've beaten it.

**Fix:**
- In the HUD, add `BEST 012,345` under `DIST`, taken from `getLeaderboardState().myBest`. Flash it once when the run passes it.
- In the run summary, add a "NEW BEST" stamp on the score capsule (`drawScoreCapsule`, `src/render/ui.js:1391`) when the run beats the stored best.
- Optional: a thin in-world marker at the distance of your best run.

*Done 2026-10-04:* `BEST` sits on the top row, right of `SCORE`, because the HUD has no room under `DIST`. Once passed it turns into a gold `NEW BEST`. The in-world marker isn't built.

**Verify:** beat your best and check the HUD flash and the summary stamp. On a run that doesn't beat it, neither should appear.

### 4. One name for Slowfall, plus mobile button labels

The same move has two names:
- "Float" on the start screen (`src/render/menu.js:233`)
- "Drift" in the controls panel (`src/render/ui.js:739`), on the mobile button (`index.html`, `data-control="drift"`) and in the run summary ("DRIFT DISTANCE", `src/render/ui.js:1078`)

The mobile buttons are icon-only pixel art, and the Drift and Backflip icons are hard to recognise.

**Fix:**
- Use **Slowfall** everywhere: the player-facing text (start screen, controls panel, mobile button, run summary) and the code (`slowfallFuel`, `SLOWFALL_*`, `data-control="slowfall"`, `slowfallDistance`), replacing float, drift and glide.
- Add a small text label under each mobile button. Show labels for the first few runs only (a `localStorage` counter wrapped in try/catch), or always. Decide once it's been tried on a device.

**Verify:** search `src/` and `index.html` for "float", "drift" and "glide" and expect only unrelated hits. Check the labels in mobile emulation.

## Batch B: Flow

### 5. Pause and resume countdown

There is no pause. When you come back to the tab, `src/main.js:225` resets the frame timing and play continues straight away, often mid-air. A phone notification can end a run.

**Fix:**
- Add `state.paused`. While it's set, `tick` keeps rendering but skips the logic steps.
- Pause automatically on `visibilitychange` (hidden) and `blur` during a run. Pause with Esc or P on desktop, and add a small pause button at the top right on mobile.
- Draw a pause overlay ("PAUSED · tap to resume"). Resuming runs a 3-2-1 countdown before play continues.

**Verify:** switch tabs mid-run. The game should be paused on return, and nothing should move until the countdown ends. The mobile pause button should work in emulation.

### 6. Faster restart

It takes about 3.5 s from touching the ground to the RESET button, plus a 1.3 s fly-by. That's long for an "instant restart" arcade game.

**Fix:**
- After about 1 s of the death cinematic, a tap or Space skips straight to the run summary. Input is still locked before that, so a mistaken tap doesn't skip it.
- Show the key on the button: "RESET · SPACE" (`drawResetButton`, `src/render/ui.js:1428`).

**Verify:** time from death to the next run with and without skipping. Check that the leaderboard claim prompt still opens when a run qualifies.

## Batch C: State at a glance

### 7. Clearer HUD meters

- `JMP` is a bare 12 px number (`src/render/ui.js:925`).
- FUEL and DASH are 74×6 px bars with 8 px labels in the top-left corner (`src/render/ui.js:934`), far from where the player is looking.

**Fix:**
- Replace the jump number with two dots that empty as jumps are used.
- While slowfalling, draw a thin fuel ring around Bob that drains with `slowfallFuel`.
- Flash the DASH bar and show "READY" when the cooldown ends.

**Verify:** double jump and watch both dots empty, then refill on landing. Slowfall and watch the ring drain. Dash and watch the READY flash after the 0.45 s cooldown.

### 8. Fuel and cooldown on the mobile buttons

On mobile, thumbs are on the buttons and eyes are on Bob, so the top-left HUD bars are rarely seen.

**Fix:** each frame, `main.js` sets CSS variables on the buttons: `--fuel` on Slowfall and `--cd` on Dash. Only write them when the value changes. In `index.html`, the Slowfall button gets a fill that drops with fuel, and the Dash button dims with a conic sweep while cooling down.

**Verify:** in mobile emulation, slowfall and dash and check that the buttons track the HUD bars.

## Batch D: Polish

### 9. Run summary shows points

The summary rows show counts but not points (`src/render/ui.js:1077`), so players can't see what earned their score. Backflips are counted but score nothing (an open question in `GAME_DESIGN.html`).

**Fix:**
- Track points per source (`state.scoreBreakdown`, filled at the same places as item 1).
- Show each row as "BILLBOARDS BROKEN 3 · +390".
- Backflips: either give them points or drop the row. This needs a design decision before it's built.

**Verify:** the per-row points plus the slowfall-adjusted distance points add up to the total score.

### 10. First-run move hints

New players are never taught Slowfall or Dive, even though the generator already builds slowfall gaps and dive gaps (`GAME_DESIGN.html`, "Guided air challenges").

**Fix:**
- When a guided gap is about to appear and that hint hasn't been shown yet, show a one-off prompt near Bob ("HOLD W TO SLOWFALL", or "SLOWFALL" on mobile).
- Record each hint in `localStorage` once it has been shown, and add a "reset hints" option in the controls panel.

**Verify:** clear storage and play. Each hint should appear once, before its gap. Reload and play again: the hints should not reappear.

### 11. Reduced motion and readable text

**Fix:**
- Under `@media (prefers-reduced-motion: reduce)`, turn off the `kinetic-float` button bob and the cursor sparks. In `render/index.js`, tone down the death zoom and the camera shake.
- Raise the 8–9 px text in the HUD and the controls panel (`src/render/ui.js:1022`, `:779`, `:789`) to at least 10–11 px. Check contrast against the dark panels.

**Verify:** turn on reduced motion in the OS or devtools and check that nothing bobs or shakes. Check that the small text is readable on a phone-sized screen.

## Testing all of it

- Serve locally (`python3 -m http.server`) and play on desktop. Then use Chrome devtools mobile emulation in landscape.
- Compare frame time before and after with the perf watch in `main.js`. New HUD chrome should go through `drawCachedPanel`, so the `PERFORMANCE.md` numbers don't get worse.
