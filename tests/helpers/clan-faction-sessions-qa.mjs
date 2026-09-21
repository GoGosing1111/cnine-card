// Synthetic accounts and clock only; game policies follow the user's confirmed choices.
import {factionDayKey,factionDayStart} from '../../shared/clan-faction-sessions-v1.mjs';
import {syncFactionSessions} from '../../functions/_clan_faction_sessions.js';
export async function prepareFactionSessionQA(f){
 const start=factionDayStart(factionDayKey(Date.now()));
 f.DB.sql.exec(`CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,starts_at TEXT,ends_at TEXT,settled_at TEXT);
  CREATE TABLE user_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key));
  CREATE TABLE user_message_rewards(id INTEGER PRIMARY KEY AUTOINCREMENT,message_id INTEGER UNIQUE,user_id INTEGER,reward_type TEXT,reward_amount INTEGER,claimed_at TEXT);`);
 await f.p("INSERT INTO app_meta(key,value) VALUES('clan_settings_v1',?)",JSON.stringify({mode:'ON'})).run();
 Object.assign(f.deps,{factionSessionPolicy:{enabled:true,effectiveAt:start,recipients:'PARTICIPANTS',interruption:'PAUSE',overlap:'DEFER',mapPolicy:'KEEP'},randomFactionSchedule:()=>0});
 f.clock.now=start+60000;
 await syncFactionSessions(f.env,f.season,f.deps);
 const state=JSON.parse((await f.p('SELECT state_json FROM clan_faction_state WHERE season_id=7').first()).state_json);
 state.districts.forEach((d,i)=>{d.owner=i<4?1:i<8?2:0;d.defense=d.owner?'defense1':'';});
 state.session.participants=[1,2,101];state.session.participantClans={1:1,2:1,101:2};
 await f.p('UPDATE clan_faction_state SET state_json=? WHERE season_id=7',JSON.stringify(state)).run();
 return {start,now:f.clock.now};
}
