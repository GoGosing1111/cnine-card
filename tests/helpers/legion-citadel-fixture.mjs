import {legionFixture} from './legion-hunt-fixture.mjs';
import {currentSquads,currentMerc,fixture as coop} from './cooperative-current.mjs';
import tower from '../fixtures/tower-expansion-20261102.json' with {type:'json'};
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../../functions/_legion_hunt_settings.js';
import {handleLegionCitadel} from '../../functions/_legion_citadel.js';
import {SUPPLIES} from '../../functions/_legion_citadel_loot.js';
import {CITADEL_POLICY_KEY,defaultCitadelPolicy} from '../../functions/_legion_citadel_policy.js';
const merc=(code,lv)=>{const m=structuredClone(tower.snapshots.find(s=>s.code===code)||currentMerc(code));return {...m,mercenaryLevel:{version:2,level:lv,breakthroughMask:[5,10,15,20].reduce((mask,n,i)=>mask|(lv>n?1<<i:0),0),policyRevision:tower.growthRevision,growth:tower.growth}};};
export function citadelSquads({codes=[['V-996','V-952'],['V-999','V-977']],ss=16,sss=10,gear=2300000,deck='BALANCED',level=13}={}){
 return currentSquads({codes:[codes[0][0],codes[1][0]],gear,deck,level}).map((s,i)=>({...s,mercenary:undefined,mercenaries:codes[i].map(code=>merc(code,(tower.snapshots.find(m=>m.code===code)||coop.mercenaries.find(m=>m.code===code)).rank==='SSS'?sss:ss))}));
}
export async function citadelFixture({postgres=false,squads=citadelSquads(),liveClock=false,partyMode='ON',ownerIds=[]}={}){
 const f=await legionFixture({postgres,inventoryBigInt:true}),db=f.DB;const exec=(q,...v)=>db.prepare(q).bind(...v).run();
 const schema=['CREATE TABLE user_mercenary_cards_v1(user_id INTEGER,mercenary_code TEXT,total_copies INTEGER,PRIMARY KEY(user_id,mercenary_code))','ALTER TABLE user_cards ADD COLUMN breakthrough_level INTEGER DEFAULT 0'];
 if(postgres)await db.execSchema(schema);else for(const sql of schema)await exec(sql);
 await exec("INSERT INTO users(id,nickname) VALUES(3,'세 번째 참가자')");
 await exec("UPDATE users SET role='USER'");
 for(const uid of ownerIds)await exec("UPDATE users SET role='OWNER' WHERE id=?",uid);
 const cfg={...defaultLegionHuntPolicy(),mode:'ON'};
 await exec('INSERT INTO app_meta(key,value) VALUES(?,?)',LEGION_HUNT_SETTINGS_KEY,JSON.stringify(cfg));
 if(partyMode!==null)await exec('INSERT INTO app_meta(key,value) VALUES(?,?)',CITADEL_POLICY_KEY,JSON.stringify({...defaultCitadelPolicy(),mode:partyMode}));
 for(const code of Object.keys(SUPPLIES))await exec('INSERT INTO inventory_items(code,name,is_active,image_url) VALUES(?,?,1,?) ON CONFLICT(code) DO NOTHING',code,code,'assets/ui/scrapyard/vehicle-part-frame-v1667.svg');
 for(const s of squads){
  for(const c of s.cards){await exec("INSERT INTO cards_effective_v1210(id,title,rarity,image_url,member_id,is_active,card_status) VALUES(?,?,?,?,1,1,'PUBLIC') ON CONFLICT(id) DO NOTHING",c.id,c.title,c.rarity,c.image);await exec('INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1)',s.ownerId,c.id);}
  for(const m of s.mercenaries)await exec('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1)',s.ownerId,m.code);
 }
 f.clock.now=Date.now();const ticks=()=>liveClock?Date.now()+f.clock.offset:f.clock.now;f.clock.offset=0;
 const named=id=>id?({id,nickname:['','선봉','후위','관전자'][id]||'테스트',role:id===4||ownerIds.includes(id)?'OWNER':'USER'}):null;
 const opts=u=>{const s=squads.find(s=>s.ownerId===u.id);return {mercenaries:(s?.mercenaries||[]).map(m=>({id:m.code,name:m.name,rank:m.rank,level:m.mercenaryLevel.level,image:m.sourceArt})),icons:(s?.cards||[]).map(c=>({id:c.id,name:c.title,level:c.breakthrough_level||0,image:c.image}))};};
 const deps={...f.deps,authenticate:async req=>named(Number(req.headers.get('x-test-id')||0)),now:ticks,supportBenefits:async()=>null,
  citadelOptions:async(_,u)=>opts(u),citadelSquad:async(_,u,selection)=>{const s=squads.find(s=>s.ownerId===Number(u.id));return {...s,cards:selection.cardIds.map(id=>s.cards.find(c=>c.id===id)),mercenaries:selection.mercenaryCodes.map(id=>s.mercenaries.find(m=>m.code===id))};}};
 return {...f,db,exec,opts,squads,handle:async(req)=>handleLegionCitadel({path:new URL(req.url).pathname.slice(5),request:req,env:f.env,deps}),
  selection:i=>({cardIds:squads[i].cards.map(c=>c.id),mercenaryCodes:squads[i].mercenaries.map(c=>c.code)}),
  async action(u,action,body){return this.handle(new Request('https://game.test/api/legion-party/'+action,{method:body===undefined?'GET':'POST',headers:{origin:'https://game.test','content-type':'application/json','x-test-id':String(u)},...(body===undefined?{}:{body:JSON.stringify(body)})}));}};
}

