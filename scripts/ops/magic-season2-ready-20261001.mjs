import assert from 'node:assert/strict';
import {MAGIC_S2_RULES} from '../../shared/magic-season2-v1.mjs';
import {MAGIC_S2_PACK,MAGIC_S2_DESCRIPTIONS,defaultMagicSeason2Settings} from '../../shared/magic-season2-release.mjs';
export const OPERATION_KEY='ops:magic-season2-ready:20261001:v1';
// The caller owns one transaction. No account balances, ownership or S1 cards
// are changed, and registration never activates a card, pack or purchase.
export async function registerMagicSeason2Ready(q){
 await q('SELECT pg_advisory_xact_lock(20261001, 5202)');
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'OWNER operator missing');
 const [saved]=await q("SELECT value FROM app_meta WHERE key='magic_card_settings_v1' FOR UPDATE");assert.ok(saved,'S1 settings missing');
 const before=JSON.parse(saved.value),[receipt]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(receipt)return {...JSON.parse(receipt.value),replayed:true};
 assert.ok(!before.season2?.runtimeEnabled&&!before.season2?.drawEnabled,'S2 already open: do not replace live policy');
 const season2=defaultMagicSeason2Settings(),after={...before,season2},cards=[];
 for(const [index,[code,r]]of Object.entries(MAGIC_S2_RULES).entries()){
  const rows=await q("INSERT INTO magic_cards(code,name,rarity,image_url,description,effect_type,trigger_type,effect_value,trigger_chance,max_activations,draw_weight,scope_pve,scope_pvp,scope_captain,is_active,sort_order) VALUES($1,$2,'MAGIC',$3,$4,$1,'CONDITIONAL',0,100,$5,1,$6,1,0,0,$7) ON CONFLICT(code) DO NOTHING RETURNING id",
   [code,r.name,'assets/ui/magic-cards/season2/'+r.slug+'-source-v1.png',MAGIC_S2_DESCRIPTIONS[code],r.uses,r.pvpOnly?0:1,100+index]);
  const [card]=await q('SELECT id,code,name,effect_type,is_active FROM magic_cards WHERE code=$1',[code]);
  assert.equal(Number(card.is_active),0);assert.equal(card.effect_type,code);cards.push({...card,inserted:rows.length===1});
 }
 await q("INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,'마법카드 시즌2 팩','MAGIC CARDS · SEASON II','시즌2 카드·마법 결정·카드 조각 혼합 보상. 출시 대기·가격 미정.','PACK','SPECIAL','assets/cards/magic-season2-pack-768-v2.webp',41,0) ON CONFLICT(code) DO NOTHING",[MAGIC_S2_PACK]);
 const [pack]=await q('SELECT code,is_active FROM inventory_items WHERE code=$1',[MAGIC_S2_PACK]);assert.equal(Number(pack.is_active),0);
 await q("UPDATE app_meta SET value=$1,updated_at=sqlite_now() WHERE key='magic_card_settings_v1'",[JSON.stringify(after)]);
 const result={status:'READY_HELD_BY_OWNER',runtimeEnabled:false,drawEnabled:false,price:null,cardIds:cards.map(c=>Number(c.id)),codes:cards.map(c=>c.code),pack:MAGIC_S2_PACK,packPolicy:season2.packPolicy,enhancementPolicy:season2.enhancementPolicy,completedAt:new Date().toISOString()};
 const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MAGIC_SEASON2_READY','MAGIC_CARD',$1,$2,$3) RETURNING id",[OPERATION_KEY,JSON.stringify({season2:before.season2??null}),JSON.stringify(result)]);
 result.adminAuditId=Number(audit.id);
 await q('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(result)]);
 assert.deepEqual({...after,season2:undefined},{...before,season2:undefined});
 return {...result,replayed:false};
}
