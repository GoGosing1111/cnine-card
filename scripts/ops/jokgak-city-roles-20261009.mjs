import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {readCitySettings} from '../../functions/_jokgak_city_settings.js';
import {cityState,cityShift} from '../../shared/jokgak-city-v1.mjs';
import {cityRolePolicy} from '../../shared/jokgak-city-settings-v1.mjs';
import {cityLifeKey,readCityLife,projectCityLife} from '../../shared/jokgak-city-life-v1.mjs';
export const CITY_ROLES_OPERATION='ops:jokgak-city-roles:20261009:v1';
// Apply only the user's approved numbers, keeping the current ON configuration.
// Settle elapsed life at the old rate first so the faster hunger isn't retroactive.
export async function applyCityRoleUpdate(client,{apply=false,now=Date.now()}={}){
 await client.query('BEGIN');
 try{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[CITY_ROLES_OPERATION]);
  const db=(await client.query('SELECT current_database() db,pg_is_in_recovery() recovery')).rows[0];assert.equal(db.db,'cnine');assert.equal(db.recovery,false);
  const receipt=(await client.query('SELECT value FROM app_meta WHERE key=$1',[CITY_ROLES_OPERATION])).rows[0];if(receipt){await client.query('ROLLBACK');return {...JSON.parse(receipt.value),replayed:true};}
  const key='jokgak_city_settings_v1',row=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[key])).rows[0];assert.ok(row);
  const {policy}=await readCitySettings({DB:{prepare:()=>({bind:()=>({first:async()=>row})})}});assert.equal(policy.mode,'ON','Preserve the explicitly approved ON state; recheck if changed.');
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE")).rows[0];assert.ok(owner);
  const players=(await client.query('SELECT * FROM jokgak_city_players_v1 WHERE active=1 ORDER BY user_id FOR UPDATE')).rows;
  const epoch=cityShift(now).id,seed=(await client.query("SELECT value FROM app_meta WHERE key='jokgak_city_role_seed_v1'")).rows[0]?.value;
  const savedWeights=(await client.query('SELECT value FROM app_meta WHERE key=$1',['jokgak_city_role_weights_v1:'+epoch])).rows[0]?.value;
  const weights=savedWeights?JSON.parse(savedWeights):policy.roles.map(r=>({code:r.code,weight:r.weight}));
  const backups=[];let settled=0,shortened=0;
  for(const player of players){
   const lifeKey=cityLifeKey(player.user_id),saved=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[lifeKey])).rows[0];
   backups.push({player,life:saved?.value??null});
   if(saved){
    assert.ok(seed);let point=createHmac('sha256',seed).update(`${epoch}:${player.user_id}`).digest().readUInt32BE(0)%weights.reduce((n,r)=>n+r.weight,0);
    const role=weights.find(r=>(point-=r.weight)<0).code;
    const life=readCityLife(saved.value,now),wallets=JSON.stringify(life.wallets);
    const state=projectCityLife(cityState(player,role,now,cityRolePolicy(policy,role)),life,now,{...policy,mode:'OFF'});
    assert.equal(JSON.stringify(life.wallets),wallets);if(state.protectedUntil>now+30000){state.protectedUntil=now+30000;shortened++;}
    await client.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(life),lifeKey]);
    await client.query('UPDATE jokgak_city_players_v1 SET epoch=$1,location=$2,health=$3,health_at=$4,wanted=$5,jailed_until=$6,next_action_at=$7,next_move_at=$8,protected_until=$9,revision=revision+1,updated_at=$4 WHERE user_id=$10',
     [epoch,state.location,state.health,now,state.wanted,state.jailedUntil,state.nextActionAt,state.nextMoveAt,state.protectedUntil,player.user_id]);settled++;
   }else if(Number(player.protected_until)>now+30000){
    await client.query('UPDATE jokgak_city_players_v1 SET protected_until=$1,revision=revision+1 WHERE user_id=$2',[now+30000,player.user_id]);shortened++;
   }
  }
  const stored=JSON.parse(row.value),next={...stored,revision:policy.revision+1,life:{...policy.life,hungerPerHour:50},rules:{...policy.rules,targetProtectionMs:30000},roles:policy.roles,updatedBy:Number(owner.id),updatedAt:new Date(now).toISOString(),writeToken:randomUUID()};
  // Explicit numbers also override any provisional values saved during development.
  Object.assign(next.roles.find(r=>r.code==='BEGGAR'),{begEnabled:true,begCash:100});
  Object.assign(next.roles.find(r=>r.code==='GANG'),{killTheftBonusPercent:10,killTheftMaxCash:4000});
  await client.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(next),key]);
  const result={operation:CITY_ROLES_OPERATION,at:next.updatedAt,mode:next.mode,revision:next.revision,hungerPerHour:50,targetProtectionMs:30000,begCash:100,gangKillBonusPercent:10,gangKillMaxCash:4000,settledLifeRows:settled,shortenedProtections:shortened,accountCashChanged:false,otherSettingsPreserved:true};
  await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'JOKGAK_CITY_ROLE_UPDATE','APP_META',$2,$3,$4)",[owner.id,key,row.value,JSON.stringify(next)]);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[CITY_ROLES_OPERATION+':backup',JSON.stringify({policy:row.value,players:backups})]);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[CITY_ROLES_OPERATION,JSON.stringify(result)]);
  await client.query(apply?'COMMIT':'ROLLBACK');return {...result,dryRun:!apply};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
