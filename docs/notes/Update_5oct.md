### Updates and fixes to do
1. the smash start scene kind of stutters at the start. i think there's an issue with rendering.
   - ✅ Done: START is now one cached sprite (no per-tile glow), and the shards are pre-cut. No frames over 20 ms at 4× CPU throttle (was 10–17).
2. Bob should touch the start for it to break. there seems to be a gap.
   - ✅ Done: it breaks when Bob's drawn body touches the glass, not his wider hitbox.
3. Maybe change the design of the "Start" at the starting screen. it doesnt need to be designed that way anymore since the break isn't
   - ✅ Done: START is now a firewall pane that shatters into glass.
4. add like a perfect ad break - where the dash that breaks the ad gets pressed 0.4 (or lower) seconds before it breaks the add. (double points)
   - ✅ Done: PERFECT AD BREAK if D was pressed ≤ 0.1 s before impact (a dash only breaks ads for 0.2 s). Exactly double.
5. same for perfect ad dodge where dodging 0.3 (or lower) seconds before the point of dodge.
   - ✅ Done: PERFECT DODGE if the duck started ≤ 0.3 s before reaching a low ad. Exactly double.
6. (POTENTIAL) reset 4 - 10 of leaderboard every week (include a countdown)
   - ⏳ Client done (countdown to Mon 00:00 UTC in the leaderboard header). The Worker cron is still to do: see WORKER_TODO.md.
7. Dash trail should not follow the orientation of Bob when doing a backflip.
   - ✅ Done
8. I feel like the scores are too high. can lower it? what would be a good combination of numbers?
   - ✅ Done: everything ÷2 (1 pt = 2 px). Existing board scores need migrating: see WORKER_TODO.md.
9. there are occasions when i bob should have landed on the platform but he doesnt.
   - ✅ Done: fixed landings on rising roofs, plus a 6 px ledge catch when a roof edge scrolls in under Bob.
10. occasionally, there are buildings that break but they dont show any forms of cracks.
   - ✅ Done: a break no longer resets its cracks, it lasts 0.45 s, and cracks show on low buildings too.
11. pressing spacebar right after a duck ads a small boost to the jump (allos a little higher jump)
   - ✅ Done: a jump while ducking, or ≤ 0.15 s after, goes ×1.08 (≈17% higher).
12. list of names that are not allowed entry (i can edit). A prompt when someone tries those specific names. potentially a popup per name
   - ✅ Done: edit src/ui/blockedNames.js. Each name can have its own pop-up message. Client-side only for now (see WORKER_TODO.md).