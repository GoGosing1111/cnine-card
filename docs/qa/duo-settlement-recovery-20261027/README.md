# Ranked duo settlement recovery — 2026-10-27

Production inspection found season 6 active while season 5 remained SETTLING with no frozen ranks, reward receipts or trophies. No pending match or lifecycle lease prevented settlement. The minute cron and ensureArmed RPC still succeeded, but the Durable Object kept an alarm for 2026-10-25T13:34:08.126Z, over 41 hours overdue at inspection.

The duo-specific arming helper now resets alarms overdue by more than one minute to one second ahead. A normal future alarm and up to one minute of delivery lag are preserved. The existing prearmed failure retry, database lifecycle lease, immutable rankings and per-user unique reward receipts remain unchanged. Clan scheduling is unchanged.

The user authorized immediate repair and completion of the existing settlement. The bounded recovery runner invoked the ordinary scheduler after checking the exact old/current season IDs, old status/participant count, absence of pending battles and the new season's active window. No manual rewards, season reset, new season creation or reward policy change was introduced.

After ranks 1–80 were paid, the next atomic batch rolled back because an existing PostgreSQL wallet was already above JavaScript's safe integer range. Commit `c8fcf0088` permits exact BIGINT SQL addition only for those already-large wallets, including the balance ledger, without reading or rewriting their balances through Number. The normal safe-integer crossing guard, nonnegative wallet and shard guards, BIGINT overflow protection, row locks and unique receipts remain intact. The remaining ranks resumed from cursor 80; no balance was reduced or rounded.

Season 5 `4e49efa4-7a36-4848-ac85-7ca6606b5b6f` closed at **16:14:07 KST**, revision 10. All **119** frozen players received their configured tier rewards: **118,340,152,678 coins**, zero shards, and **10** top-rank trophies. No pending matches, missing receipts or duplicate payout ledger entries remain. The current season 6 `f70db529-aff2-403b-a1fb-c4c3ad6f8c57` remains ACTIVE with its original schedule and policies. Re-running the recovery runner after completion returned zero maintenance steps and zero extra payouts.

Validation and deployment:

- Initial alarm/season/weekly/open-pool regression: 60 passed.
- New exact large-wallet payout, sequential/pipelined PostgreSQL, safe cap, BIGINT overflow, negative wallet and rollback/retry regression: 4 passed.
- After the economy change, affected weekly/open-pool regressions: 39 passed. These are repeated affected tests, not additional unique tests.
- Both scoped releases passed Worker, production and Hyperdrive cache-OFF guards. Only `workers/clan-draft/src/duo-schedule.js` and `functions/_ranked_duo_economy.js` changed at runtime for this repair.
- Final deployment source `c8fcf0088c95b81ae85f9d32b6b7ee4435f0dea7`, Pages `2c881efd-3cbb-4ab9-ad90-1c1b3ae39025`, completed **16:20:53 KST**. API Worker `5334bb35-cf64-40ae-af7f-82f98af78394` and scheduler Worker `cd45d3f4-0ded-4d1d-81e2-11bf2d283c48` were each at 100%, with the deployed repair code verified.
- Independent READ ONLY verification at **16:21:51 KST** matched all final ranks to the configured rewards and one ledger entry, confirmed top-ten trophies and unchanged season/weekly policies. Season 6 had 416 completed matches, latest at 16:21:46 KST; scheduler checked at 16:21:10 KST.

Closed settlement hash after additional automatic ticks: `d6e7c2213112808ced6ccb3cee5cc54f5f84e322a29d6ecdfb66d867c1a8f7d0`. Never reissue these rewards or rebuild the final ranks. Later normal gameplay may change recipient wallets; receipts and ledgers are the payout evidence.

`completion.json` preserves the compact independent completion snapshot. Read-only snapshots, remote alarm probe, rollback diagnosis, recovery steps, repeat checks and deployment logs are preserved in `C:/Users/User/Downloads/upload/cnine-card/ops/duo-settlement-check-20261027`. Existing Git objects and dependencies were reused through a small sparse checkout. No Codex storage maintenance or new automation was performed.
