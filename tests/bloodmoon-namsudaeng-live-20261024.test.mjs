import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {NAMSUDAENG_ART as art,NAMSUDAENG_CODE as code,NAMSUDAENG_SKILLS as skills,NAMSUDAENG_EVENT as eventType,namsudaengDeploymentSnapshot} from '../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
import {BLOODMOON_PACK_CARDS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {BLOODMOON_PACK_KEY,bloodmoonPackDraft,legacyBloodmoonPackDraft,readBloodmoonPackSettings} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
import {resolveNamsudaengCast} from '../functions/_mercenary_bloodmoon_namsudaeng.js';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {readNamsudaengRegistration,registerNamsudaengStock} from '../scripts/ops/bloodmoon-namsudaeng-registration-20261024.mjs';
const snapshot=()=>({...namsudaengDeploymentSnapshot(),combat:fixture.combat});
const fighter=(mode='PVE')=>buildMercenaryFighter(snapshot(),'A',mode,buildFighter);

test('approved assets fit Pages while exact local Node authoring files remain preserved',async()=>{
 const {isProductionFile,prepareProductionAssets,namsudaengNodeOnly}=await import('../scripts/prepare-production-assets.mjs');
 const audit=JSON.parse(fs.readFileSync('docs/qa/bloodmoon-namsudaeng-live-20261024/pages-authoring-exclusions.json'));
 assert.equal(namsudaengNodeOnly.size,25);
 for(const record of audit.records){
  const bytes=fs.readFileSync(record.file);
  assert.match(bytes.toString(),/node:(fs|child_process|test)/);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
  assert.equal(isProductionFile(record.file),false);
 }
 const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/bloodmoon-namsudaeng-20261024/manifest.json'));
 const runtime=manifest.assets.map(a=>a.path);
 for(const file of runtime)assert(isProductionFile(file),file);
 const all=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const count=[...new Set(all)].filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file)).length+1;
 assert(count<=20000,'Pages count: '+count);
 const stage=await prepareProductionAssets({files:[...runtime,...namsudaengNodeOnly]});
 try{
  for(const asset of manifest.assets){
   const bytes=fs.readFileSync(path.join(stage.directory,asset.path));
   assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),asset.sha256);
  }
  for(const file of namsudaengNodeOnly)assert.equal(fs.existsSync(path.join(stage.directory,file)),false);
 }finally{await stage.dispose();}
 console.log('NamSuDaeng approved delivery: '+count+'/20000 files, authoring originals retained.');
});

test('approved SS identity, original art, three skills, Blood Pack only and ten global copies',()=>{
 const document=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1})),row=document.cards.find(c=>c.code===code);
 assert.equal(row.name,'블러드문 남수댕');assert.equal(row.rank,'SS');assert.equal(row.basePower,356400);assert.equal(row.serverLimit,10);assert.equal(row.deploymentEnabled,true);assert(row.skills.every(s=>s.ready));assert.equal(row.skills.length,3);
 assert.equal(BLOODMOON_PACK_CARDS.length,9);assert.equal(BLOODMOON_PACK_CARDS.filter(c=>c.code===code).length,1);assert.equal(bloodmoonPackDraft().stockLimits[code],10);
 assert.equal(bloodmoonPackDraft().mode,'OFF');assert.equal(bloodmoonPackDraft().cardRatesPpm[code],null);assert.equal(row.acquisitionEnabled,false);
 assert(!HALLOWEEN_PACK_CARDS.some(c=>c.code===code));assert.equal(mercenaryAcquisitionEnabled(code,{cardWeights:{[code]:100}}),false);assert.equal(mercenaryLevelXpMultiplier({code}),5);
 for(const field of ['sourceArt','battleSprite'])assert.equal(createHash('sha256').update(fs.readFileSync(art[field])).digest('hex').toUpperCase(),art[field+'Sha256']);
});
test('old five-card and eight-card drafts read without changes, odds redistribution or release',()=>{
 const old=legacyBloodmoonPackDraft();assert.equal(Object.keys(old.cardRatesPpm).length,5);const text=JSON.stringify(old);assert.equal(readBloodmoonPackSettings(old).cardRatesPpm[code],null);assert.equal(JSON.stringify(old),text);
 const eight=bloodmoonPackDraft();delete eight.cardRatesPpm[code];delete eight.stockLimits[code];eight.prices.single=123456;eight.cardRatesPpm['V-960']=10.25;
 const before=structuredClone(eight),read=readBloodmoonPackSettings(eight);assert.deepEqual(eight,before);assert.equal(read.prices.single,123456);assert.equal(read.cardRatesPpm['V-960'],10.25);assert.equal(read.cardRatesPpm[code],null);assert.equal(read.stockLimits[code],10);
 const invalid=structuredClone(eight);invalid.cardRatesPpm['V-999']=1;assert.throws(()=>readBloodmoonPackSettings(invalid));
});
test('three casts select unique living targets and share a fixed total damage budget in both modes',()=>{
 for(const mode of ['PVE','PVP'])for(const count of [1,5,13])for(const skill of skills){
  const actor=fighter(mode),targets=Array.from({length:count},(_,i)=>({id:'t'+i,hp:1e8,maxHp:1e8,alive:true})),ratios=[],caps=[],events=[],mutations=[];
  const args={actor,skill,targets:[...targets,targets[0],{id:'dead',hp:0},{id:'hidden',hp:10,untargetable:true},{id:'suit',hp:10,isBattleSuit:true}],
   hit:(a,t,r,options)=>{ratios.push(r);caps.push(options.capScale);return {damage:100};},damage:(t,n)=>{mutations.push(t.id);t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
  const hits=resolveNamsudaengCast(args),n=Math.min(count,skill.targetCount??count);assert.equal(hits.length,n);assert.equal(new Set(mutations).size,n);assert(Math.abs(ratios.reduce((a,b)=>a+b)-14.4)<1e-8);assert(Math.abs(caps.reduce((a,b)=>a+b)-1)<1e-8);assert.equal(events.length,1);assert.equal(events[0].visualMode,skill.visualMode);
  for(const actor of [{...args.actor,code:'V-960',cardId:'V-960'},{...args.actor,stunned:true},{...args.actor,silenced:true}])assert.deepEqual(resolveNamsudaengCast({...args,actor}),[]);
 }
});
test('actual combat rotates three skills with one energy payment and shared two-action cooldown',()=>{
 for(const mode of ['PVE','PVP']){
  const actor=fighter(mode),targets=Array.from({length:5},(_,i)=>({...buildFighter({id:'t'+i,power:1e8,type:'NONE'},i,'B',null,mode),hp:1e12,maxHp:1e12})),events=[];
  const runtime=mercenaryCombat({teams:{A:[actor],B:targets},hit:()=>({damage:1}),damage:(t,n)=>({hpDamage:n,absorbed:0}),knockout(){},emit:(type,row)=>events.push({type,...row,action:actor.actions}),clock:()=>0});
  for(let action=1;action<=7;action++){actor.actions=action;runtime.beforeAction(actor);}
  const casts=events.filter(e=>e.type===eventType);assert.deepEqual(casts.map(e=>e.action),[1,3,5,7]);assert.deepEqual(casts.map(e=>e.visualMode),['pierce','volley','rain','pierce']);assert.deepEqual(casts.map(e=>e.hits.length),[1,3,5,1]);
  const starts=events.filter(e=>e.type==='MERCENARY_WINDUP');assert.equal(starts.length,4);assert(starts.every(e=>e.energyAfter>=0));
 }
});
test('canonical PVE/PVP battles carry NamSuDaeng skill receipts and never lose normal five-card formation',()=>{
 for(const mode of ['PVE','PVP']){const cards=tierCards(2e7);
  const result=mode==='PVE'?createPveBattleV2({cards,monster:{id:1,battle_power:1.6e10},seed:7919,mercenary:snapshot()}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(),seed:7919});
  assert.equal(result.teams.A.cards.length,5);assert.equal(result.teams.A.mercenaries[0].cardId,code);assert(result.result.timeline.some(e=>e.type===eventType));
 }
});
test('ownership is required; fixture holders can deploy in both modes without a grant',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,code,'2026-10-24','2026-10-24').run();
 for(const mode of ['PVE','PVP']){await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision:0});const s=await loadMercenaryBattleSnapshot(f.env,f.user,mode);assert.equal(s.basePower,356400);assert.equal(s.skills.length,3);}
 assert((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===code).canDeploy);
});
test('last NamSuDaeng copy is awarded once; nine remaining draws use normal SSS and retry cannot duplicate it',async t=>{
 const f=await bloodmoonFixture(t);for(const c of Object.keys(f.settings.cardRatesPpm))f.settings.cardRatesPpm[c]=c===code?1000000:0;await f.configure();
 await f.pg.query('UPDATE mercenary_limited_stock_v1 SET issued=9 WHERE code=$1',[code]);const body=f.body(10),r=await f.service.open(f.env,f.user,body);
 assert.equal(r.draws.filter(d=>d.mercenaryCode===code).length,1);assert.equal(r.draws.filter(d=>d.outcomeId==='CARD_SSS').length,9);assert.equal(r.draws.find(d=>d.mercenaryCode===code).serial,10);
 assert.deepEqual((await f.service.open(f.env,f.user,body)).draws,r.draws);assert.equal(Number((await f.pg.query('SELECT issued FROM mercenary_limited_stock_v1 WHERE code=$1',[code])).rows[0].issued),10);
 assert.equal(Number((await f.pg.query('SELECT COUNT(*) AS n FROM mercenary_limited_issues_v1 WHERE code=$1',[code])).rows[0].n),1);
});
test('stock registration rolls back on failure and dry run, preserves pack/settings/other stock, and replay writes nothing',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT);INSERT INTO users VALUES(1,'OWNER');CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE mercenary_limited_stock_v1(code TEXT PRIMARY KEY,stock_limit BIGINT,issued BIGINT DEFAULT 0,revision BIGINT DEFAULT 0);CREATE TABLE user_mercenary_cards_v1(mercenary_code TEXT);CREATE TABLE mercenary_limited_issues_v1(code TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);INSERT INTO mercenary_limited_stock_v1 VALUES('V-960',10,7,9);");
 const saved=JSON.stringify({revision:19,settings:legacyBloodmoonPackDraft()});await db.query('INSERT INTO app_meta VALUES($1,$2)',[BLOODMOON_PACK_KEY,saved]);
 const before=await readNamsudaengRegistration(db);await registerNamsudaengStock(db,{dryRun:true});assert.deepEqual(await readNamsudaengRegistration(db),before);
 await assert.rejects(registerNamsudaengStock({query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('INJECTED')):db.query(sql,args)}),/INJECTED/);assert.deepEqual(await readNamsudaengRegistration(db),before);
 const r=await registerNamsudaengStock(db);assert.equal(r.stock[0].limit,10);assert.equal(r.stock[0].issued,0);assert.equal(r.ownershipRows,0);assert.equal(r.packSha256,before.packSha256);
 assert((await registerNamsudaengStock({query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return db.query(sql,args);}})).replayed);
 assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_PACK_KEY])).rows[0].value,saved);
 assert.deepEqual((await db.query("SELECT issued,revision FROM mercenary_limited_stock_v1 WHERE code='V-960'")).rows,[{issued:7,revision:9}]);
});
