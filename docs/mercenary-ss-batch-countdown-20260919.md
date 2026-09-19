# Account-scoped SS grant on a later ten-pack

The server-only one-time SS grant accepts optional `batchesRemaining` (1–100).
An omitted value preserves existing next-ten-pack behavior. A value of 3 rolls
two ten-packs normally, then guarantees the configured SS card in one slot of
the third completed ten-pack. Other slots retain the normal CMS draw policy.

The countdown update, payment, card/item rewards and completion record share
the existing atomic transaction. Single opens, other accounts, failed payments,
rolled-back rewards and receipt replays do not advance it. A stale prepared
batch is cancelled before debit; public requests retain the account mutation
lock. The public request cannot specify or arm this setting.

`MERCENARY_SS_ONCE_ADVANCED` records countdown steps; the final award retains
`MERCENARY_SS_ONCE_CONSUMED` and the acquisition ID. No catalog odds, prices,
battle code, frontend or existing targeted grant settings change.

Operational arming is separate from deployment and limited to the authorized
account. Its exact identity, previous state and final receipt are stored in the
private operations directory, outside the public website.

Validation: `tests/mercenary-ss-once-v2104.test.mjs` exercises both SQLite and
PostgreSQL, including third-batch timing, replay, rollback, concurrent public
requests and stale durable plans. The normal production release gate applies.
