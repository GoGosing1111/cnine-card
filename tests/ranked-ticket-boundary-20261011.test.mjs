import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const claimSource=source.slice(source.indexOf('async function claimRankedMatchTicket('),source.indexOf('async function ensurePvpProfile('));
const claim=Function('ensureRankedPvpFoundation','pvpSeasonKey',`${claimSource}\nreturn claimRankedMatchTicket;`)(async()=>{},settings=>settings.seasonKey);

test('a repeat match still requires an unexpired, unused server ticket belonging to this account and season',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE pvp_ranked_match_tickets_v1671(token TEXT PRIMARY KEY,attacker_id INTEGER,defender_id INTEGER,season_key TEXT,used_at TEXT,expires_at TEXT);
    INSERT INTO pvp_ranked_match_tickets_v1671 VALUES
    ('valid',1,2,'current',NULL,'2999-01-01 00:00:00'),
    ('used',1,2,'current','2026-10-11 00:00:00','2999-01-01 00:00:00'),
    ('expired',1,2,'current',NULL,'2000-01-01 00:00:00'),
    ('old-season',1,2,'previous',NULL,'2999-01-01 00:00:00');`);
  const env={DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this;},first:async()=>db.prepare(sql).get(...values)||null};}}};
  const before=db.prepare('SELECT * FROM pvp_ranked_match_tickets_v1671 ORDER BY token').all();
  const ticket=await claim(env,1,'valid',{seasonKey:'current'});
  assert.equal(ticket.defender_id,2);assert.equal(ticket.attacker_id,1);
  for(const [userId,token,season,status] of [[1,'','current',400],[1,'forged','current',409],[3,'valid','current',409],[1,'valid','previous',409],[1,'used','current',409],[1,'expired','current',409],[1,'old-season','current',409]]){
    await assert.rejects(claim(env,userId,token,{seasonKey:season}),error=>error.status===status);
  }
  assert.deepEqual(db.prepare('SELECT * FROM pvp_ranked_match_tickets_v1671 ORDER BY token').all(),before,'validation cannot consume or rewrite tickets; the guarded fight commit owns that');
});
