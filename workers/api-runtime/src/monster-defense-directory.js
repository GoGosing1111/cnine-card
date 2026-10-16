import {validDefenseRoom,defenseDifficulty} from '../../../shared/monster-defense-v1.mjs';
import {DEFENSE_LIST_LIMIT,DEFENSE_LIST_LEASE_MS} from '../../../shared/monster-defense-room-list-v1.mjs';

// Uses only the reserved defense instance. The lobbies schema/retirement alarm
// matches CooperativePlayer; no new binding or shared-account migration.
export class MonsterDefenseDirectory{
 constructor(ctx){this.ctx=ctx;ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS lobbies(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,difficulty TEXT,created_at INTEGER,lease_until INTEGER,retire_at INTEGER,json TEXT)');ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS lobbies_created ON lobbies(created_at DESC,id DESC)');}
 async publish({id,revision,listing,retireAt}){
  if(!validDefenseRoom(id)||!Number.isSafeInteger(revision)||revision<1||!Number.isSafeInteger(retireAt))throw Error('Invalid defense listing');
  if(listing&&(listing.id!==id||!defenseDifficulty(listing.difficulty)||!Number.isSafeInteger(listing.createdAt)||!Number.isSafeInteger(listing.expiresAt)))throw Error('Invalid defense summary');
  const now=Date.now();
  this.ctx.storage.sql.exec(`INSERT INTO lobbies VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
   revision=excluded.revision,difficulty=excluded.difficulty,created_at=excluded.created_at,lease_until=excluded.lease_until,retire_at=excluded.retire_at,json=excluded.json
   WHERE excluded.revision>lobbies.revision`,id,revision,listing?.difficulty||null,listing?.createdAt||0,listing?Math.min(listing.expiresAt,now+DEFENSE_LIST_LEASE_MS):0,retireAt,listing?JSON.stringify(listing):null);
  const alarm=await this.ctx.storage.getAlarm();if(!alarm||alarm>now+60000)await this.ctx.storage.setAlarm(now+60000);
 }
 rooms(difficulty=''){
  const now=Date.now(),rows=this.ctx.storage.sql.exec('SELECT json FROM lobbies WHERE json IS NOT NULL AND lease_until>? AND (?=\'\' OR difficulty=?) ORDER BY created_at DESC,id DESC LIMIT ?',now,difficulty,difficulty,DEFENSE_LIST_LIMIT+1).toArray();
  return {ok:true,rooms:rows.slice(0,DEFENSE_LIST_LIMIT).map(row=>JSON.parse(row.json)),hasMore:rows.length>DEFENSE_LIST_LIMIT,serverNow:now};
 }
}
