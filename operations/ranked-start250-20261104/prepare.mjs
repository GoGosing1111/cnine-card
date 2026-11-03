import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const OP='ops:ranked-start250:20261104:v1',hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const db=connect();
try {
 db.connectionParameters.application_name='ranked-start250-plan';await db.connect();
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='30s'");
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const settings=(await q("SELECT key,value,updated_at FROM app_meta WHERE key IN ('pvp_settings_v1','tier_settings_v1') ORDER BY key"));assert.equal(settings.length,2);
 const pvp=JSON.parse(settings.find(s=>s.key==='pvp_settings_v1').value),tier=JSON.parse(settings.find(s=>s.key==='tier_settings_v1').value);
 assert.equal(pvp.seasonName,'시즌 25');assert(pvp.enabled);assert.equal(pvp.initialScore,250);assert.equal(tier.pvp.initialScore,250);
 const seasonKey=[pvp.seasonName,pvp.startsAt,pvp.endsAt].join('|');
 assert.equal((await q('SELECT 1 FROM pvp_season_settlements WHERE season_key=$1',[seasonKey])).length,0);
 assert.equal((await q('SELECT 1 FROM app_meta WHERE key=$1',[OP])).length,0);
 assert.equal((await q('SELECT 1 FROM admin_logs WHERE target_id=$1',[OP])).length,0);
 const profiles=await q(`SELECT p.*,u.nickname,u.role,u.status,
  EXISTS(SELECT 1 FROM pvp_match_history h WHERE h.attacker_id=p.user_id AND h.created_at>=$1 AND h.created_at<$2) AS season_attack_history,
  EXISTS(SELECT 1 FROM ranked_fight_receipts_v1 r WHERE r.user_id=p.user_id AND r.created_at>=$1 AND r.created_at<$2) AS season_attack_receipt,
  EXISTS(SELECT 1 FROM pvp_battle_audits_v1781 a WHERE a.attacker_id=p.user_id AND a.created_at>=$1 AND a.created_at<$2) AS season_attack_audit,
  EXISTS(SELECT 1 FROM pvp_match_history h WHERE h.defender_id=p.user_id AND h.created_at>=$1 AND h.created_at<$2) AS season_defense_history
  FROM pvp_profiles p JOIN users u ON u.id=p.user_id ORDER BY p.user_id`,[pvp.startsAt,pvp.endsAt]);
 const zero=profiles.filter(p=>Number(p.wins)===0&&Number(p.losses)===0),conflicts=zero.filter(p=>p.season_attack_history||p.season_attack_receipt||p.season_attack_audit);assert.deepEqual(conflicts,[],'Zero-play counters contradict season attack records');
 const targets=zero.filter(p=>Number(p.season_score)!==250||Number(p.highest_score)!==250);assert(targets.length>0);
 assert(targets.every(p=>Number(p.season_score)===1000&&Number(p.highest_score)===1000));
 const missing=(await q('SELECT COUNT(*)::int count FROM users u WHERE NOT EXISTS(SELECT 1 FROM pvp_profiles p WHERE p.user_id=u.id)'))[0].count;
 const sourceCommit=execFileSync('git',['-c','gc.auto=0','rev-parse','origin/main'],{encoding:'utf8',windowsHide:true}).trim();
 const sources={};for(const file of ['functions/api/[[path]].js','functions/_ranked_reform.js','functions/_postgres_d1_compat.js','shared/ranked-reform-v1.mjs'])sources[file]=execFileSync('git',['-c','gc.auto=0','show',sourceCommit+':'+file],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
 const plan={operationKey:OP,authorization:'현 진행중인 랭크전 한판도 안한사람들 싹다 250점으로 변경해 최초 시작 점수 250점으로 변경',seasonKey,seasonName:pvp.seasonName,startsAt:pvp.startsAt,endsAt:pvp.endsAt,newScore:250,initialScoreAlready250:true,settings,sourceCommit,sourceHashes:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),targetCount:targets.length,targets:targets.map(({season_attack_history,season_attack_receipt,season_attack_audit,...p})=>p),playedCount:profiles.length-zero.length,zeroPlayedCount:zero.length,missingProfiles:missing,defenseOnlyCount:zero.filter(p=>p.season_defense_history).length,createdAt:new Date().toISOString()};
 await fs.writeFile(new URL('./plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(new URL('./preflight-profiles.json',import.meta.url),JSON.stringify(profiles,null,2)+'\n',{flag:'wx'});
 await fs.writeFile(new URL('./runtime-sources.json',import.meta.url),JSON.stringify(sources)+'\n',{flag:'wx'});
 await db.query('ROLLBACK');console.log(JSON.stringify({seasonKey,targetCount:targets.length,playedCount:plan.playedCount,missingProfiles:missing,defenseOnlyCount:plan.defenseOnlyCount,initialScore:pvp.initialScore,planHash:hash(plan),sourceCommit}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
