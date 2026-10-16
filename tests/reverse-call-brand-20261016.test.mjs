import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {currentBrandText,presentBrandedSystemMessage} from '../shared/brand-presentation-20261016.mjs';
import {META_KEYS,OPERATION_KEY,brandSetting,rebrandStoredLabels} from '../scripts/ops/reverse-call-brand-20261016.mjs';
import {APP_ID,LEGACY_PROFILE_DIRECTORY} from '../packaging/windows-client/lib/app-identity.mjs';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
test('display names translate while nickname suffixes and stable identifiers survive',()=>{
 assert.equal(currentBrandText('숲켓몬은 숲켓몬의 서버. 숲켓랜드에서 이용. SOOPKETMON RANKED'),'리버스콜은 리버스콜의 서버. 리버스랜드에서 이용. REVERSE CALL RANKED');
 assert.equal(currentBrandText('숲켓몬도댕 숲켓몬생뷰 SOOPKETLAND_TICKET'),'숲켓몬도댕 숲켓몬생뷰 SOOPKETLAND_TICKET');
 const message={sender_type:'SYSTEM',title:'숲켓몬 선물',body:'숲켓랜드 이용권',nickname:'숲켓몬',coupon_code:'SLD-old',reward_amount:500};
 assert.deepEqual(presentBrandedSystemMessage(message),{...message,title:'리버스콜 선물',body:'리버스랜드 이용권'});
 const personal={...message,sender_type:'USER'};assert.equal(presentBrandedSystemMessage(personal),personal);assert.equal(message.title,'숲켓몬 선물');
});
test('stored settings change labels and revision without changing URLs or economic settings',()=>{
 const before={title:'숲켓몬 시즌패스',revision:7,enabled:true,days:[{day:1,rewards:[{code:'SOOPKETLAND_TICKET',quantity:3}]}],updatedAt:'old'};
 const after=JSON.parse(brandSetting('supporter_season_pass_v1',JSON.stringify(before),'now'));
 assert.deepEqual(after,{...before,title:'리버스콜 시즌패스',revision:8,updatedAt:'now'});
 const bgm={enabled:true,volumePercent:17,tracks:[{title:'숲켓몬 OST1',url:'/assets/bgm/%EC%88%B2%EC%BC%93%EB%AA%AC%20OST1.mp3'}]};
 assert.deepEqual(JSON.parse(brandSetting('lobby_bgm_settings_v1803',JSON.stringify(bgm),'now')),{...bgm,tracks:[{...bgm.tracks[0],title:'리버스콜 OST1'}]});
 assert.equal(brandSetting('unknown','unchanged','now'),'unchanged');
});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT); INSERT INTO users VALUES(1,'OWNER','ACTIVE'); CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,description TEXT,category TEXT,image_url TEXT,updated_at TEXT); INSERT INTO inventory_items VALUES('SOOPKETLAND_TICKET','숲켓랜드 이용권','숲켓랜드에서 1개를 사용합니다.','ENTRY_TICKET','unchanged.svg','old'); CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);");
 await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[META_KEYS[3],JSON.stringify({seasonTitle:'SOOPKETMON RANKED',season:21,enabled:true}),'old']);
 return {db,client:{query:(sql,args)=>sql==='SELECT current_database() AS db, pg_is_in_recovery() AS recovery'?Promise.resolve({rows:[{db:'cnine',recovery:false}]}):db.query(sql,args)}};
}
test('one audited transaction changes only stored labels and retry preserves later CMS changes',async t=>{
 const {db,client}=await fixture(t);const receipt=await rebrandStoredLabels(client);assert.equal(receipt.changes.length,2);
 assert.equal((await db.query('SELECT name FROM inventory_items')).rows[0].name,'리버스랜드 이용권');
 await db.query("UPDATE inventory_items SET name='OWNER edit'");assert.equal((await rebrandStoredLabels(client)).alreadyApplied,true);
 assert.equal((await db.query('SELECT name FROM inventory_items')).rows[0].name,'OWNER edit');assert.equal((await db.query('SELECT id FROM admin_logs')).rows.length,1);
});
test('audit/receipt failures roll back settings and ticket labels',async t=>{
 const {db,client}=await fixture(t);await db.exec("ALTER TABLE app_meta ADD CONSTRAINT reject_receipt CHECK(key NOT LIKE 'ops:%')");
 await assert.rejects(rebrandStoredLabels(client));assert.equal((await db.query('SELECT name FROM inventory_items')).rows[0].name,'숲켓랜드 이용권');assert.equal((await db.query('SELECT id FROM admin_logs')).rows.length,0);
 assert.equal(JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',[META_KEYS[3]])).rows[0].value).seasonTitle,'SOOPKETMON RANKED');
});
test('provided icon source, derivative hashes and Windows/PWA identities stay consistent',async()=>{
 const manifest=JSON.parse(await read('assets/ui/brand/reverse-call-20261016/manifest.json'));
 for(const asset of manifest.files)assert.equal(createHash('sha256').update(await readFile(new URL('../'+asset.file,import.meta.url))).digest('hex'),asset.sha256,asset.file);
 assert.equal(manifest.files[0].sha256,'67e735ba0ca2ebb715145e414a1598e0087516f74ca7937383582565e9fe714c');
 const pkg=JSON.parse(await read('packaging/windows-client/package.json')),lock=JSON.parse(await read('packaging/windows-client/package-lock.json'));
 assert.equal(pkg.productName,'리버스콜');assert.equal(pkg.version,'0.1.7');assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
 assert.equal(pkg.build.win.executableName,'ReverseCall');assert.equal(pkg.build.appId,APP_ID);assert.equal(pkg.build.nsis.guid,'c69fcbf2-955f-5c48-8ff1-55c03889cb40');assert.equal(LEGACY_PROFILE_DIRECTORY,'숲켓몬');
 const pwa=JSON.parse(await read('manifest.webmanifest'));assert.equal(pwa.id,'/');assert.equal(pwa.name,'리버스콜 카드뽑기');assert.equal(pwa.short_name,'리버스콜');assert.ok(pwa.icons.every(icon=>icon.src.includes('reverse-call-20261016')));
 const map=await read('js/image-delivery-map-20261015.js');assert.ok(!map.includes('reverse-call-20261016'),'New mark must never resolve to an old optimized logo');
 const main=await read('packaging/windows-client/main.mjs');assert.match(main,/app\.getPath\('appData'\),LEGACY_PROFILE_DIRECTORY/);assert.match(main,/persist:soopketmon-game-v1/);
});
