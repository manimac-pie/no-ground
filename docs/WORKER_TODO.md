# Leaderboard Worker: changes needed for Update_5oct

The game client is done for these items. The Worker (`no-ground-leaderboard-api`, not in this repo) still needs three changes. Without them, the countdown counts down to nothing, and old scores sit 2× above new ones.

---

## 1. Score scale ÷2 (item 8). Do this first

The client now scores **1 point per 2 px** (it used to be 1 per px). Every bonus is ÷2 too, so a run that used to score 20,000 now scores about 10,000.

Existing rows in the database are in the old units, so as things stand they're twice as hard to beat. Pick one:

- **Rescale:** divide every stored score (leaderboard entries *and* each device's best) by 2, rounding down. Players keep their standing.
- **Wipe:** clear the board and the bests and start a new season.

Things to check in the Worker while you're there:

- Does `/api/submit` have a sanity cap, such as a maximum score or points per second? Divide it by 2 as well, or it will be twice as loose.
- Browsers can cache the old `score.js` for a while, so an old client could still submit 2×-sized scores after you migrate. A simple guard is to have the client send a version (for example `v: 2`) and reject submits without it. Tell me if you want that added on the client side.

**Done when:** `/api/top10` and `/api/mybest` return numbers in the new range, and a fresh run's score lands where you'd expect among them.

---

## 2. Weekly reset of ranks 4–10 (item 6)

The client shows **"RANKS 4-10 RESET IN …"** in the leaderboard header. It counts down to **Monday 00:00 UTC**. The schedule is in `src/ui/leaderboardReset.js` (`RESET_WEEKDAY_UTC`, `RESET_HOUR_UTC`, `RESET_FIRST_RANK`), and the Worker has to use the same one.

**Trigger:** a Cloudflare cron trigger. In `wrangler.toml`:

```toml
[triggers]
crons = ["0 0 * * 1"]   # Mondays 00:00 UTC, same as RESET_WEEKDAY_UTC / RESET_HOUR_UTC
```

Then add a `scheduled(event, env, ctx)` handler next to the Worker's `fetch` handler. The cron calls it.

**What it should do:** find the entries currently ranked 4–10, using the same ordering `/api/top10` uses (including how it breaks ties), and remove them from the board. Ranks 1–3 stay.

Decide these before you write the query:

- **Does a reset touch personal bests?** The client's "Best Score" comes from `/api/mybest`. If that reads the same rows as the board, deleting them also wipes those players' bests. You'll probably want to keep bests and only remove the board entries (for example a `season` column, or an `on_board` flag the reset clears).
- **What fills ranks 4–10 afterwards?** If the board is "best claimed score per player", the next-best older scores will move straight up into the empty slots and nothing will look reset. A week stamp on each entry (only this week's claims count for 4–10) avoids that.
- **Is it safe to run twice?** Cron can retry. Running the reset twice in a row shouldn't remove ranks 4–10 of the *new* board.

**Done when:** after triggering it by hand (`wrangler dev --test-scheduled`, then request `/__scheduled?cron=0+0+*+*+1`), `/api/top10` returns only the old top 3, and `/api/mybest` is unchanged for the players who were removed.

---

## 3. Blocked names on `/api/claim` (item 12)

The client refuses the names in `src/ui/blockedNames.js` and shows a pop-up. Anyone can still call `/api/claim` directly, so the Worker should check the same list.

- Match the same way the client does: lowercase, strip spaces and `_ - .`, then compare exactly (or as a substring for entries marked `contains: true`).
- Return an error such as `{ ok: false, error: "name_blocked" }`.
- Keep the two lists in sync. Another option is a `GET /api/blocked-names` that the client fetches, so the list only lives in one place. Tell me if you go that way and I'll switch the client over.

Note: if the Worker refuses a name today, the client logs the error and drops the claim (`leaderboardClaimFlow.js`, the `catch` in `maybePromptForPendingClaim`). If you add the server check, the client should show the pop-up for `name_blocked` and let the player try again. That's a small client change I can make once the error code exists.
