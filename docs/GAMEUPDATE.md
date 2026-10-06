## Updates

1. [x] The wind effect while dashing seems jarring. like it suddenly appears. is there a way to make it look more seamless?
    > ✅ Done: the wind used to go from nothing to full on the press frame, with ~60 lines all over the screen at once. It now comes in as a gust: the lines fade in over 0.15 s and a soft front sweeps them in from the right, crossing the screen in 0.3 s. A dash while the wind is still showing carries on the same gust. Fading out is unchanged (it follows the boost). Tune with `WIND_FADE_IN_SEC`, `WIND_SWEEP_SEC` and `WIND_EDGE_FRAC` in `src/render/player/dashFx.js`.

4. [ ] After pressing spacebar to start or clicking on the start button, automatically implement Dash on Bob. and player should not be able to interact until after zoomed out.
    > Ask if unclear

5. [ ] Can you make Slowfall smoother? like glide better?
    > To discuss

6. [ ] Can make game controls menu better?
    > ![Game Controls Menu](image.png)
    > Something easier to understand

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

14. [ ] how can we make the dive better?
