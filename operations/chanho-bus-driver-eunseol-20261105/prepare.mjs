import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {HASH,OP} from './grant.mjs';
const read=async(folder,name)=>(await fs.readFile(new URL('../'+folder+'/'+name,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const put=(name,text)=>fs.writeFile(new URL('./'+name,import.meta.url),text,{flag:'wx'});
const replace=s=>s.replaceAll('showmaker-razak-one-20261104','chanho-bus-driver-eunseol-20261105').replaceAll('ops:showmaker-razak-one:20261104:v1',OP).replaceAll('233','4597');
for(const file of ['lock-worker.mjs','wrangler.jsonc'])await put(file,replace(await read('showmaker-razak-one-20261104',file)));
let run=replace(await read('showmaker-razak-one-20261104','run.mjs'));
run=run.replace('6047530d5d80da714a9ebcf0a0eff4ba0b891fc1197f6c1aa29cc534250c92ba',HASH)
 .replace("'user_mercenary_cards_v1','mercenary_card_acquisitions_v1'","'user_character_titles','user_mercenary_cards_v1','mercenary_card_acquisitions_v1'")
 .replace("+1n,'Ranked invalidation must match card and level mutations'","+2n,'Ranked invalidation must match title and mercenary mutations'")
 .replace('await db.connect();',"db.connectionParameters.application_name='chanho-bus-driver-eunseol-'+mode;await db.connect();");
assert(run.includes(HASH)&&run.includes('+2n,'));await put('run.mjs',run);
let fixture=(await read('hyunharu-eunseol-exempt-20261029','grant.test.mjs')).split('const full=')[0];
fixture=fixture.replaceAll('218','4597').replaceAll('현하루','찬호');
fixture=fixture.replace("const plan={...original,recipients:original.recipients.map(u=>({...u,identityHash:hash({provider:'PLAYDK',providerUserId:'test-4597'})}))};","const plan={...original,target:{...original.target,identityHash:hash({provider:'PLAYDK',providerUserId:'test-4597'})}};");
fixture=fixture.replace("JSON.stringify(plan));","JSON.stringify(plan)).replaceAll(original.target.identityHash,plan.target.identityHash);");
fixture=fixture.replace(" CREATE TABLE user_mercenary_loadout_v1",()=>` CREATE TABLE character_titles(id bigint PRIMARY KEY,code text,name text,unlock_type text,is_active integer,is_public integer);
 CREATE TABLE user_character_titles(user_id bigint,title_id bigint,source_type text,source_id text,unlocked_at text,expires_at text,PRIMARY KEY(user_id,title_id));
 CREATE TABLE user_title_loadout(user_id bigint PRIMARY KEY,title_id bigint);
 CREATE TABLE ranked_duo_accounts_v1(user_id bigint PRIMARY KEY,source_version bigint);
 INSERT INTO character_titles VALUES(655095,'RAID_BUS_DRIVER','버스기사','MANUAL',1,1);
 INSERT INTO user_character_titles VALUES(22,655095,'ADMIN','1','earlier',NULL),(4597,1,'ADMIN','1','old',NULL);
 INSERT INTO user_title_loadout VALUES(4597,1);
 INSERT INTO ranked_duo_accounts_v1 VALUES(4597,7);
 CREATE FUNCTION sync_ranked() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=NEW.user_id; RETURN NEW; END $$;
 CREATE TRIGGER title_ranked AFTER INSERT OR UPDATE ON user_character_titles FOR EACH ROW EXECUTE FUNCTION sync_ranked();
 CREATE TRIGGER mercenary_ranked AFTER INSERT OR UPDATE ON user_mercenary_cards_v1 FOR EACH ROW EXECUTE FUNCTION sync_ranked();
 CREATE TABLE user_mercenary_loadout_v1`);
fixture=fixture.replace("domains=jsonb_set(domains,'{collection}',to_jsonb((domains->>'collection')::bigint+1))","domains=jsonb_set(domains,'{collection}',to_jsonb((revision+1)::text))");
await put('grant.test.mjs',fixture+`
const full=async c=>({state:await api.snapshot(c),artifacts:await api.artifacts(c)});
test('one permanent title and one Eunseol are atomic; other owners, stock, growth and loadouts are preserved; replay only reads',async()=>{
 const {db,client}=await fixture();try{
  const before=await api.snapshot(client);await db.exec('BEGIN');const r=await api.grant(client,api.HASH,options());await db.exec('COMMIT');
  assert.equal(r.receipt.copiesBefore,0);assert.equal(r.receipt.copiesAfter,1);assert.equal(r.receipt.titleGranted.expires_at,null);
  assert.deepEqual(api.protectedState(await api.snapshot(client)),api.protectedState(before));
  const replay=await api.grant({query:(sql,args)=>{assert.match(sql,/^SELECT\\b/);return client.query(sql,args);}});
  assert(replay.replayed);assert.deepEqual(replay.receipt,r.receipt);assert.equal((await api.artifacts(client)).acquisitions.length,1);
 }finally{await db.close();}
});
test('failure after title or at final receipt rolls back title, card, acquisition, audit and sync',async()=>{
 const {db,client}=await fixture();try{for(const prefix of ['INSERT INTO user_mercenary_cards_v1(','INSERT INTO app_meta(']){
  const before=await full(client);await db.exec('BEGIN');
  await assert.rejects(api.grant({query:(sql,args)=>sql.startsWith(prefix)?client.query('SELECT 1/0'):client.query(sql,args)},api.HASH,options()),/division by zero/);
  await db.exec('ROLLBACK');assert.deepEqual(await full(client),before);
 }}finally{await db.close();}
});
test('wrong reviewed plan, missing lease and changed identity fail before any grant',async()=>{
 const {db,client}=await fixture();try{
  const before=await full(client);await assert.rejects(api.grant(client,'wrong',options()),/Reviewed plan/);
  await assert.rejects(api.grant(client,api.HASH,{}));assert.deepEqual(await full(client),before);
  await db.exec("UPDATE users SET nickname='changed' WHERE id=4597; BEGIN");
  await assert.rejects(api.grant(client,api.HASH,options()),/Recipient nickname changed/);await db.exec('ROLLBACK');
  assert.equal((await api.artifacts(client)).receipt,null);assert.equal((await api.snapshot(client)).titles.filter(t=>String(t.title_id)==='655095').length,0);
 }finally{await db.close();}
});
test('new holding or title since preflight is rejected instead of overwritten',async()=>{
 const {db,client}=await fixture();try{for(const sql of ["INSERT INTO user_character_titles VALUES(4597,655095,'ADMIN','1','new',NULL)","INSERT INTO user_mercenary_cards_v1 VALUES(4597,'V-973',2,1,'first','last')"]){
  await db.exec('BEGIN');await db.exec(sql);const before=await full(client);
  await assert.rejects(api.grant(client,api.HASH,options()),/changed since inspection/);assert.deepEqual(await full(client),before);await db.exec('ROLLBACK');
 }}finally{await db.close();}
});
`);
console.log(JSON.stringify({prepared:true,operationKey:OP,planHash:HASH}));
