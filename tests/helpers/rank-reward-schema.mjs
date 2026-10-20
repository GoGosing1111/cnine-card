import {MERCENARY_ACCOUNTING_SCHEMA} from '../../functions/_mercenary_draw_accounting.js';
// Raid settlements now use the same rank milestone dependencies as solo rewards.
export async function ensureRankRewardFixture(env){
  const id=env.DB.dialect==='postgres'?'BIGSERIAL PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT';
  const schema=[
    MERCENARY_ACCOUNTING_SCHEMA[0],
    `CREATE TABLE IF NOT EXISTS user_messages(id ${id},user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key))`,
    `CREATE TABLE IF NOT EXISTS user_message_rewards(id ${id},message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claimed_at TEXT)`
  ];
  if(env.DB.execSchema)await env.DB.execSchema(schema);
  else for(const sql of schema)await env.DB.prepare(sql).run();
}
