# Leaderboard Worker: changes still needed

The Worker is `no-ground-leaderboard-api`. Its code is in `worker/` (kept out of git, since this repo is public): `worker/src/worker.js`, with the config in `worker/wrangler.jsonc` and the SQL in `worker/sql/`. Deploy it by pasting `worker.js` into the dashboard editor (Edit code, then Deploy), or with `npx wrangler deploy` from `worker/`.

Items 1–3 are done (2026-10-06). Item 3 needs the game pushed and the Worker deployed to go live. Item 4 is written and tested locally, and needs the Worker deployed.

---

## 1. Score scale ÷2. ✅ Done: the board was wiped

> **Done 2026-10-06.** Both tables were cleared (`worker/sql/2026-10-06-wipe.sql`), so every score is on the new scale. The old board can be restored from D1 Time Travel if ever needed. `SCORE_MAX` is still 2,000,000,000 and there's no client version check.

The client now scores **1 point per 2 px** (it used to be 1 per px). Every bonus is ÷2 too, so a run that used to score 20,000 now scores about 10,000.

Existing rows in the database are in the old units, so as things stand they're twice as hard to beat. Pick one:

- **Rescale:** divide every stored score (leaderboard entries *and* each device's best) by 2, rounding down. Players keep their standing.
- **Wipe:** clear the board and the bests and start a new season.

Things to check in the Worker while you're there:

- Does `/api/submit` have a sanity cap, such as a maximum score or points per second? Divide it by 2 as well, or it will be twice as loose.
- Browsers can cache the old `score.js` for a while, so an old client could still submit 2×-sized scores after you migrate. A simple guard is to have the client send a version (for example `v: 2`) and reject submits without it. Tell me if you want that added on the client side.

**Done when:** `/api/top10` and `/api/mybest` return numbers in the new range, and a fresh run's score lands where you'd expect among them.

---

## 2. A separate weekly top 10. ✅ Done

> **Done 2026-10-06.** `/api/top10` returns `weekly` (each device's best claim since Monday 00:00 UTC, top 10), and `/api/mybest` and `/api/submit` return `week_best`. That's kept in two new `device_best` columns, `week_best` and `week_start` (`worker/sql/2026-10-06-weekly.sql`). The claim times were already stored in `leaderboard_entries.created_at`, so no new column was needed for them. A score qualifies for the name prompt when it makes the all-time top 3, or this week's top 10 and beats that device's own entry this week; `/api/claim` re-checks it. Tested locally with `wrangler dev`; live since 2026-10-06 and returning `weekly: []` on the empty board.

The leaderboard panel shows two boards: **ALL-TIME** (the top 3, kept forever) and **THIS WEEK** (this week's best runs, ranked 1–10). This replaces the earlier plan of wiping ranks 4–10 every Monday: nothing has to be deleted, and no cron job is needed.

**The week** starts every Monday 00:00 UTC. The client counts down to it, using `RESET_WEEKDAY_UTC` and `RESET_HOUR_UTC` in `src/leaderboard/reset.js`, so the Worker has to use the same boundary.

**API changes.** All of them only add fields, so the current game keeps working before and after.

- `GET /api/top10`: keep `entries` as the all-time board (best claimed score per player; the panel shows its top 3). Add `weekly`: up to 10 `{ name, score }`, each player's best claimed score since the week started, highest first, with ties broken the same way as `entries`. Right after Monday 00:00 UTC it's an empty array `[]`, not missing.
- `GET /api/mybest`: add `week_best`, the device's best score this week (`0` if none yet).
- `POST /api/submit`: return `qualified: true` when the score would make this week's top 10 **or** the all-time top 3, so the name prompt opens. Returning `week_best` here too is optional; the client uses it if it's there.
- `POST /api/claim`: the claimed name and score count on both boards.

**Storage.** If every claim is stored with its time (for example a `claimed_at` column), the weekly board is a query over the claims since the last Monday 00:00 UTC, best per player. The all-time board and each device's best don't change.

**On the client:** as soon as `/api/top10` includes `weekly`, THIS WEEK shows that list ranked 1–10, and the panel's goal line ("#5 THIS WEEK · 3,391 TO BEAT #4") uses `week_best`. Until then, THIS WEEK shows ranks 4–10 of the single list, as it does now (`getBoards()` in `src/leaderboard/state.js`).

**Done when:** `/api/top10` returns `weekly` (and `[]` just after Monday 00:00 UTC), `/api/mybest` returns `week_best`, and a run that makes this week's top 10 but not the all-time top 3 still opens the name prompt.

---

## 3. Blocked names on `/api/claim`. ✅ Done (once the steps below are deployed)

> **Done 2026-10-06.** There's one list: `blocked-names.json` at the root of the game repo, with the same names and pop-up messages as before. The game imports it (`src/leaderboard/blockedNames.js`), and the build publishes it at `https://manimac-pie.github.io/no-ground/blocked-names.json`.
>
> - **Worker:** `/api/claim` reads that file (at most every 5 minutes) and returns `{ ok: false, error: "name_blocked" }` (400) for a blocked name. It matches the way the game does: lowercase, ignore spaces and `_ - .`, then exact, or substring for `"contains": true`. If the site can't be reached it keeps the last list it read; before it has read one, nothing is blocked server-side (the game still checks in the browser).
> - **Game:** a `name_blocked` refusal reopens the name prompt with that name's pop-up, so the player can pick another name instead of losing the claim. After a claim the game now also refreshes THIS WEEK and `week_best`.
> - **Tested:** 20 names against the local Worker (`Ad_Min`, `6.9` and `xbobx` blocked; `rooty`, `1690` and `nullx` allowed), the weekly checks again, and the game's prompt in headless Chrome with the API faked.
>
> **To change the list:** edit `blocked-names.json` and push. The Worker picks it up within about 5 minutes.
>
> **To deploy:** push the game first (so the file is on the live site), then deploy the Worker (`worker/src/worker.js`, via the dashboard editor or `npx wrangler deploy` from `worker/`).

---

## 4. A lower run than your best can still make the board. ✅ Done (once the Worker is deployed)

> **Done 2026-10-06.** THIS WEEK used to show one row per player (their best claim this week), and a score only qualified for it if it beat that player's own entry. So a run lower than your best never made the weekly board, even when it beat 10th place. Now THIS WEEK is simply the top 10 claims since Monday 00:00 UTC, like ALL-TIME already was (its top 3 never checked your own best). A score qualifies when it beats the all-time 3rd place or this week's 10th place, whoever's rows those are; `/api/claim` re-checks it. Only `worker/src/worker.js` changed (`getWeekly`, `qualifies`); no SQL migration and no game change.
>
> - **Side effect:** one player can now hold several rows on either board, or fill THIS WEEK alone.
> - **Tested:** local `wrangler dev` with a throwaway D1. With a best of 5,000 and 10th place at 100, a 3,000 qualified and showed on both boards next to the 5,000; a 250 (below the all-time 3rd, above the weekly 10th) qualified; a 150 below the weekly 10th was refused at submit and at claim.
