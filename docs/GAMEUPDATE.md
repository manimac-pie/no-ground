## Updates
Numbered from lowest effort to highest.

1. [x] Can backflip slighly increase the length of slowfall?
    > discuss if unclear
    > ✅ Done: each backflip adds 0.08 s of slowfall fuel (about 15% of a tank), up to 0.16 s past full. Landing resets it to full. Tune with `BACKFLIP_SLOWFALL_SEC` and `SLOWFALL_FUEL_OVERFILL_SEC` in `src/game/constants.js`.

2. [x] Give some grace for dashing through billoards. 
    > Dash active time = x
    > if Bob touches the billboard and dash has been active >= x/2, it counts as a break
    > ✅ Done: x is 0.2 s. A dash now breaks ads for x + x/2 = 0.3 s after the press (`DASH_BREAK_GRACE_SEC`). PERFECT AD BREAK is unchanged (≤ 0.1 s).

3. [x] If there's still a jump left, jump cancels out dive
    > ✅ Done: the jump now gets its full height (it used to rise about 20% as high, because dive gravity kept going). Holding S doesn't restart the dive; press it again to dive.

4. [ ] After pressing spacebar to start or clicking on the start button, automatically implement Dash on Bob. and player should not be able to interact until after zoomed out.
    > Ask if unclear

5. [ ] Can you make Slowfall smoother? like glide better?
    > To discuss

6. [ ] Can make game controls menu better?
    > ![Game Controls Menu](image.png)
    > Something easier to understand

7. [x] Top three all time + Top 10 of the week (that resets every week). Allow the same person and score to be shown in both all time and this week

    > All Time
    > 1. Player 1 765432
    > 2. Player 2 654321
    > 3. Player 3 550909

    > This Week - Resets in 134:32:1
    > 1. Player 2 654321
    > 2. Player 4 543321
    > 3. Player 5 493829
    > 4. -
    > 5. -
    > etc. 
    > ✅ Done (2026-10-06): the leaderboard Worker now sends this week's top 10 separately, so THIS WEEK is its own 1–10 ranking (each player's best since Monday 00:00 UTC) next to the all-time top 3, and the same player can be on both. The board was wiped for the new score scale. Worker code: `worker/src/worker.js` (see `docs/WORKER_TODO.md`).

8. [ ] I notice that if i replay muptiple times in a row, it starts getting a bit laggy.
    > How to measure: record about 10 s of play in the Chrome DevTools Performance panel, with 4× CPU throttling to mimic a phone. Compare a first run with a run after several replays, and measure again after each fix.
    > If the console shows `[perf] Average frame … ms; rendering at 1x resolution.`, frames were slow enough that the game dropped to 1× resolution (`watchFrameTime` in `src/main.js`).
    > Optional: a debug overlay, toggled with a key, showing the average `game.update` and `render` times.


9. [ ] (POTENTIAL) Smoother motion on 120 Hz screens
    > Physics runs at 60 Hz, and `main.js` only redraws after a physics step, so a 120 Hz screen shows about 60 fps.
    > Fix: pass `acc / FIXED_DT` to the renderer and blend between the previous and current positions.
    > Not measured on a 120 Hz screen yet.

11. [ ] Mix and match billboards to buildings
    > allow blue billboards on red buildings (if the building collapses, the billboard stays on the ground still standing)
    > red billboards should still work the same on blue 
    
12. [x] Jumping right after releasing from duck (s) gives a bit of extra jump height
    > Already in the game: a jump while ducking, or up to 0.15 s after letting go of S, goes ×1.08 (about 17% higher). Should it be stronger or last longer? Tune `DUCK_JUMP_VELOCITY_MULT` and `DUCK_JUMP_WINDOW_SEC` in `src/game/constants.js`.

13. [ ] the claw that takes bob out of the ending scene seems a bit wierd. can you make it fit bob better. and maybe when bob crashes, the wheel bobs off and some screws get loose?

14. [ ] how can we make the dive better?

15. [x] better dash trail?
    > ✅ Done (option G from the demo): sparks from the wheel on a roof dash and wind lines across the whole screen (roof or air). No trail on Bob. The old streaks are gone. Code: `src/render/player/dashFx.js`.

## Also done (not on the list)
- [x] Landing from a dive throws a small burst of sparks off the wheel (`src/render/player/dashFx.js`).
- [x] Fixed: Bob could fall straight through an intact roof after smashing a low glass billboard with a dash or dive. A smash now lets him land on the roof in the same step (`src/game/player.js`).
- [x] Fixed: one landing on a roof's edge could give up to 4 CLOSE CALLs. The landing check also runs on every step Bob stands there, so it kept awarding until enough of him had scrolled onto the roof. Now only the landing step counts (`src/game/player.js`).
- [x] Checked: Bob can dash again in the air as soon as the dash bar refills (0.45 s cooldown). There's no limit on air dashes per jump.
