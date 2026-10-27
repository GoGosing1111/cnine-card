import {COMPANION_RELEASE,validatePreparedMercenaries} from '../shared/companion-loadout-v2.mjs';
import {PVE_ONLY_MERCENARY_CODES,mercenaryModeAllowed} from '../shared/mercenary-eunseol-v1.mjs';
import {DUO_LIMITS} from '../shared/ranked-duo-v1.mjs';
import {duoRandomInt,shuffleDuo} from '../shared/ranked-duo-random-v4.mjs';

const p=env=>(sql,...args)=>env.DB.prepare(sql).bind(...args);
const stamp=now=>new Date(now).toISOString().replace('T',' ').slice(0,19);
// Use the same saved attack preset, defense deck and PVP mercenary as loadDuoProfiles.
// No enrollment, online-state or current season score is required.
const source=(dual=COMPANION_RELEASE.dualMercenaries)=>`FROM pvp_decks d JOIN users u ON u.id=d.user_id
 LEFT JOIN pvp_active_presets a ON a.user_id=d.user_id
 LEFT JOIN pvp_deck_presets pr ON pr.user_id=a.user_id AND pr.preset_no=a.preset_no
 LEFT JOIN user_mercenary_loadout_v1 ml ON ml.user_id=d.user_id
 ${dual?"LEFT JOIN app_meta md ON md.key='mercenary_dual_loadout_v2:' || CAST(d.user_id AS TEXT)":''}
 LEFT JOIN app_meta mp ON mp.key='mercenary_pvp_loadout_v1:' || CAST(d.user_id AS TEXT)
 JOIN user_mercenary_cards_v1 mc ON mc.user_id=d.user_id AND mc.total_copies>0
  ${PVE_ONLY_MERCENARY_CODES.length?`AND mc.mercenary_code NOT IN (${PVE_ONLY_MERCENARY_CODES.map(code=>`'${code}'`).join(',')})`:''}
  AND mc.mercenary_code=${dual?"CASE WHEN json_valid(md.value) THEN json_extract(json_extract(json_extract(md.value,'$.PVP'),'$.mercenaryCodes'),'$[0]') END":"CASE WHEN mp.value IS NULL THEN ml.mercenary_code WHEN json_valid(mp.value) THEN json_extract(mp.value,'$.mercenaryCode') END"}`;
const attack=`CASE WHEN COALESCE(a.preset_no,1)=1 THEN COALESCE(pr.card_ids,d.card_ids) ELSE pr.card_ids END`;
const valid=column=>`CASE WHEN json_valid(${column}) THEN json_array_length(${column}) ELSE 0 END=5`;
const eligible=(dual=COMPANION_RELEASE.dualMercenaries)=>`u.status='ACTIVE' AND u.role<>'OWNER'
 AND (u.banned_until IS NULL OR SUBSTR(REPLACE(u.banned_until,'T',' '),1,19)<=?)
 AND ${valid('d.card_ids')} AND ${valid(attack)}
 ${dual?"AND CASE WHEN json_valid(md.value) THEN json_array_length(json_extract(json_extract(md.value,'$.PVP'),'$.mercenaryCodes')) ELSE 0 END=2 AND EXISTS(SELECT 1 FROM user_mercenary_cards_v1 mc2 WHERE mc2.user_id=d.user_id AND mc2.total_copies>0 AND mc2.mercenary_code<>mc.mercenary_code AND mc2.mercenary_code=json_extract(json_extract(json_extract(md.value,'$.PVP'),'$.mercenaryCodes'),'$[1]'))":''}`;

// An explicit empty PVP slot never falls back to the PVE selection. Legacy
// accounts without a PVP override still inherit their established shared slot.
export const rankedDuoPoolMemberCountSql=(count,dual=COMPANION_RELEASE.dualMercenaries)=>`SELECT COUNT(*) AS n ${source(dual)} WHERE ${eligible(dual)} AND d.user_id IN (${Array(count).fill('?').join(',')})`;
export async function rankedDuoPoolContains(env,ids,now){
 return Number((await p(env)(rankedDuoPoolMemberCountSql(ids.length),stamp(now),...ids).first())?.n||0)===ids.length;
}
export const hasRankedDuoMercenary=(profile,dual=COMPANION_RELEASE.dualMercenaries)=>{
 if(!dual)return [profile?.attack?.mercenary?.code,profile?.defense?.mercenary?.code].every(code=>Boolean(code)&&mercenaryModeAllowed(code,'PVP'));
 return [profile?.attack,profile?.defense].every(s=>{try{return s?.mercenaries?.length===2&&validatePreparedMercenaries(s.mercenaries).every(m=>mercenaryModeAllowed(m.code,'PVP'));}catch{return false;}});
};

export async function rankedDuoPoolCount(env,now=Date.now()){
 return Number((await p(env)(`SELECT COUNT(*) AS n ${source()} WHERE ${eligible()}`,stamp(now)).first())?.n||0);
}
export async function rankedDuoPoolCandidates(env,userId,now){
 const q=p(env),where=`${eligible()} AND d.user_id<>?`,args=[stamp(now),userId];
 const count=Number((await q(`SELECT COUNT(*) AS n ${source()} WHERE ${where}`,...args).first())?.n||0);
 if(!count)return [];
 // A uniformly drawn circular window gives every saved deck a chance.
 // Only IDs are counted/scanned; at most 23 candidates leave the database.
 // Inventory/profile work remains in batches of at most 12 accounts.
 const size=Math.min(count,DUO_LIMITS.candidates-1),offset=duoRandomInt(count);
 const first=(await q(`SELECT d.user_id ${source()} WHERE ${where} ORDER BY d.user_id LIMIT ? OFFSET ?`,...args,size,offset).all()).results;
 const rest=first.length<size?(await q(`SELECT d.user_id ${source()} WHERE ${where} ORDER BY d.user_id LIMIT ?`,...args,size-first.length).all()).results:[];
 return shuffleDuo([...new Set([...first,...rest].map(r=>Number(r.user_id)))]);
}
export async function trackDuoProfileVersions(env,ids){
 // These rows only invalidate profile caches; they do not enroll, award or
 // consume energy for the offline accounts selected by another player.
 await env.DB.batch(ids.map(id=>p(env)('INSERT INTO ranked_duo_accounts_v1(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',id)));
}
