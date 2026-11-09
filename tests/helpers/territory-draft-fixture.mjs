export const draftTestDeps={
  battleSettings:async()=>({}),
  draftFormationPowers:async(_env,rows)=>new Map(rows.map(row=>[Number(row.user_id),{deckReady:row.deck_snapshot!=='[]',power:10000+Number(row.user_id)*149}]))
};
export async function seedDraftActivity(f,cutoff){
  const commands=[
    'ALTER TABLE users ADD COLUMN banned_until TEXT','ALTER TABLE users ADD COLUMN last_login_at TEXT',
    'CREATE TABLE attendance_logs(user_id INTEGER,attendance_date TEXT,claimed_at TEXT,PRIMARY KEY(user_id,attendance_date))',
    'CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT)',
    'CREATE TABLE pvp_active_presets(user_id INTEGER PRIMARY KEY,preset_no INTEGER)',
    'CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT,PRIMARY KEY(user_id,preset_no))'];
  if(f.pg)await f.env.DB.execSchema(commands);else for(const sql of commands)await f.p(sql).run();
  await f.p('UPDATE users SET last_login_at=?',new Date(cutoff-3600000).toISOString()).run();
  await f.p("INSERT INTO pvp_decks(user_id,card_ids) SELECT id,'[\"a\",\"b\",\"c\",\"d\",\"e\"]' FROM users").run();
}

