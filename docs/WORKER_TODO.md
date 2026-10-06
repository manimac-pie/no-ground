# Leaderboard Worker: changes still needed

The Worker (`no-ground-leaderboard-api`, not in this repo) still needs three changes. The game already handles each one, and keeps working without them in the meantime.

---

## 1. Score scale ÷2. Do this first

The client now scores **1 point per 2 px** (it used to be 1 per px). Every bonus is ÷2 too, so a run that used to score 20,000 now scores about 10,000.

Existing rows in the database are in the old units, so as things stand they're twice as hard to beat. Pick one:

- **Rescale:** divide every stored score (leaderboard entries *and* each device's best) by 2, rounding down. Players keep their standing.
- **Wipe:** clear the board and the bests and start a new season.

Things to check in the Worker while you're there:

- Does `/api/submit` have a sanity cap, such as a maximum score or points per second? Divide it by 2 as well, or it will be twice as loose.
- Browsers can cache the old `score.js` for a while, so an old client could still submit 2×-sized scores after you migrate. A simple guard is to have the client send a version (for example `v: 2`) and reject submits without it. Tell me if you want that added on the client side.

**Done when:** `/api/top10` and `/api/mybest` return numbers in the new range, and a fresh run's score lands where you'd expect among them.

---

## 2. A separate weekly top 10

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

## 3. Blocked names on `/api/claim`

The client refuses the names in `src/leaderboard/blockedNames.js` and shows a pop-up. Anyone can still call `/api/claim` directly, so the Worker should check the same list.

- Match the same way the client does: lowercase, strip spaces and `_ - .`, then compare exactly (or as a substring for entries marked `contains: true`).
- Return an error such as `{ ok: false, error: "name_blocked" }`.
- Keep the two lists in sync. Another option is a `GET /api/blocked-names` that the client fetches, so the list only lives in one place. Tell me if you go that way and I'll switch the client over.

Note: if the Worker refuses a name today, the client logs the error and drops the claim (`src/leaderboard/claimFlow.js`, the `catch` in `maybePromptForPendingClaim`). If you add the server check, the client should show the pop-up for `name_blocked` and let the player try again. That's a small client change I can make once the error code exists.
