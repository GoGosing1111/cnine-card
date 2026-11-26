import {createPostgresD1Compat} from './_postgres_d1_compat.js';

// Finish only accounts whose authenticated request was fulfilled transactionally by operations.
// All remote cleanup is scoped to the retired account, repeatable after an outage.
export async function runAccountDeletionQueue(env, at, open = createPostgresD1Compat) {
  const minute = new Date(at).getUTCMinutes();
  if (minute % 2 || !env.HYPERDRIVE || !env.ACCOUNT_SYNC || !env.COOP_PLAYERS) return;
  const connection = await open(env.HYPERDRIVE.connectionString);
  try {
    const db = connection.db;
    if (minute === 0) await db.prepare("DELETE FROM account_deletion_requests_v1 WHERE phase='completed' AND completed_at <= statement_timestamp() - INTERVAL '90 days'").run();
    const {results} = await db.prepare("SELECT user_id FROM account_deletion_requests_v1 d WHERE phase='retiring' AND retired_at <= statement_timestamp() - INTERVAL '60 seconds' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=d.user_id) ORDER BY retired_at LIMIT 5").all();
    for (const {user_id: id} of results) {
      try {
        const userId = Number(id);
        const player = env.COOP_PLAYERS.getByName(String(userId));
        const defense = env.COOP_PLAYERS.getByName('defense:' + userId);
        // Shared active matches must be resolved by their owners before final confirmation.
        if (await player.getRoom() || await defense.getRoom()) continue;
        if (!await env.ACCOUNT_SYNC.getByName(String(userId)).eraseAccount(userId)) continue;
        await db.prepare("UPDATE account_deletion_requests_v1 SET phase='completed',user_id=NULL,locked_at=NULL,retired_at=NULL,requested_at=date_trunc('day',requested_at),completed_at=statement_timestamp() WHERE user_id=? AND phase='retiring' AND NOT EXISTS (SELECT 1 FROM users WHERE id=?)").bind(userId,userId).run();
      } catch { console.warn('ACCOUNT_DELETION_CLEANUP_RETRY'); }
    }
  } finally { await connection.close(); }
}
