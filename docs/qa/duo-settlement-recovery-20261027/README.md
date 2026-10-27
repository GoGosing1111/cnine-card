# Ranked duo overdue alarm recovery — 2026-10-27

Production inspection found season 6 active while season 5 remained SETTLING with no frozen ranks, reward receipts or trophies. No pending match or lifecycle lease prevented settlement. The minute cron and ensureArmed RPC still succeeded, but the Durable Object kept an alarm for 2026-10-25T13:34:08.126Z, over 41 hours overdue at inspection.

The duo-specific arming helper now resets alarms overdue by more than one minute to one second ahead. A normal future alarm and up to one minute of delivery lag are preserved. The existing prearmed failure retry, database lifecycle lease, immutable rankings and per-user unique reward receipts remain unchanged. Clan scheduling is unchanged.

The user authorized immediate repair and completion of the existing settlement. Recovery uses the ordinary scheduler; no manual rewards, season reset, new season creation or reward policy change is introduced.

Scoped release tests: ranked-duo-alarm-recovery-20261027, ranked-duo-seasons, ranked-duo-weekly, ranked-duo-open-pool-20261020; check:worker and the standard release/Hyperdrive guards. Runtime change is only workers/clan-draft/src/duo-schedule.js. Production read-only snapshots, deployment logs and verification are stored in C:/Users/User/Downloads/upload/cnine-card/ops/duo-settlement-check-20261027.
