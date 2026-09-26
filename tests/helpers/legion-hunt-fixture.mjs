import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {handleLegionHunt} from '../../functions/_legion_hunt.js';
import {createHuntSession} from '../../preview/sustained-hunt-v2/session.mjs';
import {LEGION_HUNT_REVIEW_FIXTURE} from '../../shared/legion-hunt-review-fixture-v1.mjs';
import {buildPreviewDeck,BATTLE_SUIT} from '../../preview/idle-v3-v1/source/idle-model.mjs';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {SNIPER_ORIKKUNG_BALANCE} from '../../shared/mercenary-sniper-orikkung-v1.mjs';
export async function legionFixture({postgres=false,withMercenary=false}={}){
  let sql,pg,DB,failure='',queries=[],lostReply=false;
  if(postgres){
    pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");
    DB=new __postgresCompatTest.PostgresD1Database({async query(q){const source=typeof q==='string'?q:q.text;queries.push(source);if(failure&&source.includes(failure))throw Error('INJECTED_FAILURE');const r=await pg.query(source,typeof q==='string'?[]:q.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else{
    sql=new DatabaseSync(':memory:');
    DB={prepare(source){return {source,values:[],bind(...v){this.values=v;return this;},async first(){queries.push(source);return sql.prepare(source).get(...this.values)||null;},async all(){queries.push(source);return {results:sql.prepare(source).all(...this.values)};},async run(){queries.push(source);if(failure&&source.includes(failure))throw Error('INJECTED_FAILURE');const r=sql.prepare(source).run(...this.values);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  }
  const schema=`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE admin_logs(admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER);
    CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER,is_public INTEGER);
    CREATE TABLE character_garage_items(id INTEGER PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER,is_public INTEGER);
    CREATE TABLE members(id INTEGER PRIMARY KEY,is_active INTEGER);
    CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,image_url TEXT,member_id INTEGER,is_active INTEGER,card_status TEXT);
    INSERT INTO inventory_items VALUES('VEHICLE_PART_FRAME','강화 차체 프레임','EPIC','assets/ui/scrapyard/vehicle-part-frame-v1667.svg',1),('VEHICLE_PART_ENGINE','고출력 엔진','LEGENDARY','assets/ui/scrapyard/vehicle-part-engine-v1667.svg',1),('OFF_ITEM','비활성 아이템','EPIC','assets/off.png',0);
    INSERT INTO character_equipment_items VALUES(1,'검수 장비','MYTHIC','assets/ui/scrapyard/vehicle-part-frame-v1667.svg',1,1);
    INSERT INTO character_garage_items VALUES(1,'검수 이동수단','MYTHIC','assets/ui/scrapyard/vehicle-part-engine-v1667.svg',1,1);
    INSERT INTO members VALUES(1,1);
    INSERT INTO cards_effective_v1210 VALUES('CN-TEST','검수 카드','FUR','assets/ui/scrapyard/vehicle-part-frame-v1667.svg',1,1,'PUBLIC');
  `;
  if(pg)await pg.exec(schema);else sql.exec(schema);
  const env={DB},clock={now:1000},owner={id:1,role:'OWNER',nickname:'계정 편성 검수'},player={id:2,role:'USER'};
  let user=owner;
  const {catalog,equipment}=LEGION_HUNT_REVIEW_FIXTURE;
  const suit=equipment.suits.find(s=>s.code===BATTLE_SUIT.code),weapon=equipment.weapons.find(w=>w.equipmentCode===BATTLE_SUIT.weaponCode);
  let deck={ids:buildPreviewDeck(catalog).map(c=>c.id),cards:buildPreviewDeck(catalog),battleSettings:{engine:{}},
    characterBonus:{pve:300000,battleSuitPve:300000,equippedBattleSuit:{code:suit.code,name:'X-BODY',skillChips:['SKILL_CHIP_HELICOPTER_AIRSTRIKE'],appearance:{battleSprite:suit.image,battleHeight:278}},
      equippedWeapon:{code:weapon.equipmentCode,name:weapon.name||'장착 무기',appearance:{battleSprite:weapon.battleSprite}}}};
  const art=MERCENARY_CMS_SEED.catalog.cards.find(c=>c.code==='V-050'),meta=MERCENARY_CMS_SEED.document.mercenaries.find(c=>c.code==='V-050');
  let mercenary=withMercenary?{...art,...meta,level:1,statMode:'RANK_FIXED',basePower:120000,skills:[{...MERCENARY_CMS_SEED.catalog.skills.find(s=>s.id==='MS-050'),balance:SNIPER_ORIKKUNG_BALANCE}]}:null;
  const snapshotReads=[];
  const deps={json:(body,status=200)=>{if(lostReply&&status===200){lostReply=false;throw Error('LOST_REPLY');}return {body,status};},authenticate:async()=>user,withUserMutationLock:async(_env,_id,_path,work)=>work(),now:()=>clock.now,createSession:options=>createHuntSession({...options,seed:1731})};
  Object.assign(deps,{raidDeckPower:async(_env,id,ids,mode)=>{snapshotReads.push({id,ids,mode});return structuredClone(deck);},cardBattlePower:card=>card.power,
    magicBattleLoadout:async()=>({cards:[]}),selectActivatedUltimate:()=>null,loadMercenaryBattleSnapshot:async()=>structuredClone(mercenary)});
  async function call(path,body,options={}){
    const method=options.method||(body===undefined?'GET':'POST'),headers={'content-type':'application/json',origin:options.origin||'https://game.test'};
    const request=new Request('https://game.test/api/'+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
    return handleLegionHunt({path,request,env,deps});
  }
  async function configure(quantity=3){
    const result=await call('admin/legion-hunt'),policy=result.body.policy;
    policy.items=[{...result.body.catalog[0],enabled:true,weight:1,minQuantity:quantity,maxQuantity:quantity}];
    policy.difficulties.forEach(d=>{d.dropPercent=100;d.bossDropPercent=100;d.lifetimeSeconds=9;});
    const saved=await call('admin/legion-hunt',{policy},{method:'PATCH'});if(saved.status!==200)throw Error(JSON.stringify(saved));return saved.body.policy;
  }
  return {env,DB,clock,owner,player,deps,call,configure,setUser:u=>user=u,snapshotReads,getDeck:()=>structuredClone(deck),setDeck:value=>{deck=value;},setMercenary:value=>{mercenary=value;},queries,resetQueries:()=>{queries.length=0;},fail:v=>failure=v,loseReply:()=>lostReply=true,close:async()=>{if(pg)await pg.close();else sql.close();}};
}
