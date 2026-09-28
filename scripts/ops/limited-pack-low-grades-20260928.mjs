// One-time authorized CMS setting update; never imported by gameplay routes.
import assert from 'node:assert/strict';
export const KEY='ops:limited-pack-low-grades:20260928:v1';
export const BEFORE_RATES={C:0,U:0,R:34.05,SR:32,HR:21,UR:9.5,SSR:3.4,MA:0.03,FUR:0.02,LIMITED:0.05};
export const AFTER_RATES={...BEFORE_RATES,C:10,U:10,R:14.05};
export const ALLOWED=['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'];
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const ratesFrom=rows=>Object.fromEntries(rows.map(row=>[row.rarity,Number(row.rate)]));
export async function inspectLimitedPack(q){
 const [pack]=await q("SELECT * FROM card_packs WHERE id='pickup'");
 const rateRows=await q("SELECT rarity,rate FROM card_pack_rates WHERE pack_id='pickup' ORDER BY rarity");
 const raw=await q(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.draw_weight
 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
 WHERE c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1
 AND c.draw_weight>0 AND c.limited_total IS NULL AND c.rarity IN ('C','U','R')
 AND (NOT EXISTS(SELECT 1 FROM card_pack_cards p WHERE p.pack_id='pickup')
 OR EXISTS(SELECT 1 FROM card_pack_cards p WHERE p.pack_id='pickup' AND p.card_id=c.id))
 ORDER BY c.id`);
 const candidates=raw.filter(card=>card.id==='CN-346F8DB0DEB84D41'||!(card.name+' '+card.title).normalize('NFKC').replace(/\s+/g,'').includes('철구'));
 const settings=await q("SELECT key,value FROM app_meta WHERE key IN ('pack_pity_settings_v1','fur_first_acquisition_settings_v1') ORDER BY key");
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
 const rates=ratesFrom(rateRows),poolCounts=Object.fromEntries(['C','U','R'].map(grade=>[grade,candidates.filter(row=>row.grade===grade).length]));
 return {pack,rates,normalTotal:Object.entries(rates).filter(([grade])=>grade!=='LIMITED').reduce((sum,[,rate])=>sum+rate,0),poolCounts,candidates,settings,receipt:saved?parse(saved.value):null};
}
export function verifyLimitedSettings(state){
 assert.deepEqual(state.rates,AFTER_RATES);
 assert.deepEqual(parse(state.pack.allowed_rarities),ALLOWED);
 assert.ok(Math.abs(state.normalTotal-100)<0.000001);
 assert.ok(state.poolCounts.C>0&&state.poolCounts.U>0,'Missing eligible low-grade cards');
}
export async function updateLimitedPack(q){
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[KEY]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]),prior=parse(saved.value);
 if(prior.status==='COMPLETED')return {...prior,replayed:true};
 assert.equal(prior.status,'PENDING');
 assert.ok((await q("SELECT id FROM users WHERE id=1 AND role='OWNER'"))[0]);
 await q("SELECT id FROM card_packs WHERE id='pickup' FOR UPDATE");
 await q("SELECT rarity FROM card_pack_rates WHERE pack_id='pickup' ORDER BY rarity FOR UPDATE");
 await q("SELECT key FROM app_meta WHERE key IN ('pack_pity_settings_v1','fur_first_acquisition_settings_v1') ORDER BY key FOR SHARE");
 const before=await inspectLimitedPack(q);
 assert.deepEqual(before.rates,BEFORE_RATES,'Pack rates changed after inspection');
 assert.deepEqual(parse(before.pack.allowed_rarities),ALLOWED.filter(grade=>!['C','U'].includes(grade)));
 assert.ok(before.poolCounts.C>0&&before.poolCounts.U>0);
 const updated=await q("UPDATE card_pack_rates SET rate=CASE rarity WHEN 'C' THEN 10 WHEN 'U' THEN 10 WHEN 'R' THEN 14.05 END WHERE pack_id='pickup' AND rarity IN ('C','U','R') RETURNING rarity");
 assert.equal(updated.length,3);
 assert.equal((await q("UPDATE card_packs SET allowed_rarities=$1 WHERE id='pickup' RETURNING id",[JSON.stringify(ALLOWED)])).length,1);
 const after=await inspectLimitedPack(q);verifyLimitedSettings(after);
 assert.deepEqual({...after.pack,allowed_rarities:before.pack.allowed_rarities},before.pack,'Pack fields outside allowed rarities changed');
 assert.deepEqual(after.settings,before.settings,'Pity or FUR acquisition settings changed');
 assert.deepEqual(after.candidates,before.candidates,'Card pool changed');
 const changedAt=new Date().toISOString();
 const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'PACK_RATE_UPDATE','CARD_PACK','pickup',$1,$2) RETURNING id",[
 JSON.stringify({rates:before.rates,allowed:parse(before.pack.allowed_rarities)}),
 JSON.stringify({...AFTER_RATES,allowed:ALLOWED,operationKey:KEY,authorization:'리미티드팩 제일 낮은등급까지 나오게 설정해 도감 못채운다 애들'})]);
 const result={status:'COMPLETED',operationKey:KEY,rates:AFTER_RATES,allowed:ALLOWED,poolCounts:after.poolCounts,normalTotal:after.normalTotal,limitedRatePreserved:true,pityPreserved:true,otherPackFieldsPreserved:true,adminLogId:String(audit.id),completedAt:changedAt};
 await q('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2',[JSON.stringify(result),KEY]);
 return {...result,replayed:false};
}
