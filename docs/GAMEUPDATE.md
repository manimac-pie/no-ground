## Updates

1. [x] The wind effect while dashing seems jarring. like it suddenly appears. is there a way to make it look more seamless?
    > ✅ Done: the wind used to go from nothing to full on the press frame, with ~60 lines all over the screen at once. It now comes in as a gust: the lines fade in over 0.15 s and a soft front sweeps them in from the right, crossing the screen in 0.3 s. A dash while the wind is still showing carries on the same gust. Fading out is unchanged (it follows the boost). Tune with `WIND_FADE_IN_SEC`, `WIND_SWEEP_SEC` and `WIND_EDGE_FRAC` in `src/render/player/dashFx.js`.

4. [ ] After pressing spacebar to start or clicking on the start button, automatically implement Dash on Bob. and player should not be able to interact until after zoomed out.
    > Ask if unclear

5. [ ] Can you make Slowfall smoother? like glide better?
    > To discuss

6. [x] Can make game controls menu better?
    > ![Game Controls Menu](image.png)
    > Something easier to understand
    > ✅ Done: the panel now groups moves by when you use them, ON A ROOF (Space jump, hold S duck, D dash) and IN THE AIR (Space jump again, hold W slowfall, S dive, A backflip, D dash), so a key that does two things reads naturally. Holds are marked HOLD. The bottom explains the two materials in the colours the world uses: pink glass (dash through its ads, roofs crumble) and blue steel (duck or jump its ads, roofs hold). This replaces "non-reinforced", which the game never shows. On touch screens the chips show the button names. Text is 10–13 px, up from 9. Code: `src/render/hud/controls.js`.

9. [ ] (POTENTIAL) Smoother motion on 120 Hz screens
    > Physics runs at 60 Hz, and `main.js` only redraws after a physics step, so a 120 Hz screen shows about 60 fps.
    > Fix: pass `acc / FIXED_DT` to the renderer and blend between the previous and current positions.
    > Not measured on a 120 Hz screen yet.

11. [ ] Mix and match billboards to buildings
    > allow blue billboards on red buildings (if the building collapses, the billboard stays on the ground still standing)
    > red billboards should still work the same on blue 

14. [ ] how can we make the dive better?
