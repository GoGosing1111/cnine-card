import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {EMPEROR_ENERGY_ITEM as item,EMPEROR_ENERGY_CATALOG_KEY as key,ensureEmperorEnergyCatalog} from '../functions/_emperor_energy.js';
import {invalidateRuntimeData} from '../functions/_runtime_data_cache.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER);
    INSERT INTO inventory_items(code,name,category,rarity,sort_order,is_active) VALUES('STARLIGHT_ARMOR_CORE','미스틱 에너지','MATERIAL','MYTHIC',174900,1);
    INSERT INTO cnine_user_inventory VALUES(7,'STARLIGHT_ARMOR_CORE',23,0);`);
  const stats={reads:0,batches:0};
  const DB={prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async first(){stats.reads++;return db.prepare(sql).get(...this.values)||null;}};},async batch(statements){stats.batches++;db.exec('BEGIN');try{for(const s of statements)db.prepare(s.sql).run(...s.values);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}};
  return {db,env:{DB},stats};
}

test('registers the higher-tier material once and leaves existing material ownership untouched',async t=>{
  const {db,env,stats}=fixture(t),before=db.prepare('SELECT * FROM inventory_items').all();
  await Promise.all([ensureEmperorEnergyCatalog(env),ensureEmperorEnergyCatalog(env)]);
  const row=db.prepare('SELECT * FROM inventory_items WHERE code=?').get(item.code);
  assert.deepEqual([row.name,row.category,row.rarity,row.image_url,row.sort_order,row.is_active],['엠퍼러 에너지','MATERIAL','EMPEROR',item.image,174901,1]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory_items WHERE code=?').get(item.code).n,1);
  assert.deepEqual(db.prepare("SELECT * FROM inventory_items WHERE code='STARLIGHT_ARMOR_CORE'").all(),before);
  assert.equal(db.prepare('SELECT quantity FROM cnine_user_inventory').get().quantity,23);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').get().n,1);
  const warm={...stats};await ensureEmperorEnergyCatalog(env);assert.deepEqual(stats,warm);
  invalidateRuntimeData(env,key);await ensureEmperorEnergyCatalog(env);
  assert.equal(stats.reads,warm.reads+1);assert.equal(stats.batches,warm.batches);
});

test('registration preserves any existing CMS edits and disabled state',async t=>{
  const {db,env}=fixture(t);
  db.prepare("INSERT INTO inventory_items(code,name,category,rarity,image_url,sort_order,is_active) VALUES(?,'CMS 이름','MATERIAL','EMPEROR','custom.webp',999,0)").run(item.code);
  const before=db.prepare('SELECT * FROM inventory_items WHERE code=?').get(item.code);
  await ensureEmperorEnergyCatalog(env);
  assert.deepEqual(db.prepare('SELECT * FROM inventory_items WHERE code=?').get(item.code),before);
});

test('failed registration rolls back both the item and completion marker and can retry',async t=>{
  const {db,env}=fixture(t);
  db.exec("CREATE TRIGGER fail_marker BEFORE INSERT ON app_meta BEGIN SELECT RAISE(ABORT,'temporary failure'); END;");
  await assert.rejects(ensureEmperorEnergyCatalog(env),/temporary failure/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory_items WHERE code=?').get(item.code).n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM app_meta').get().n,0);
  db.exec('DROP TRIGGER fail_marker');await ensureEmperorEnergyCatalog(env);
  assert.equal(db.prepare('SELECT value FROM app_meta WHERE key=?').get(key).value,'1');
});

test('live inventory query returns an unowned, unusable material and UI sorts it above Mystic',async t=>{
  const {db,env}=fixture(t);await ensureEmperorEnergyCatalog(env);
  const api=read('functions/api/[[path]].js');
  const branch=api.slice(api.indexOf("if(path==='inventory'){"),api.indexOf("if(path==='inventory/seen'"));
  assert.ok(branch.indexOf('await ensureEmperorEnergyCatalog(env)')<branch.indexOf('const rows='));
  const sql=branch.match(/env\.DB\.prepare\(`(SELECT i\.code[\s\S]*?)`\)/)[1];
  const row=db.prepare(sql).get(0,7);
  const rows=db.prepare(sql).all(0,7),emperor=rows.find(row=>row.code===item.code);
  assert.equal(emperor.quantity,0);assert.equal(emperor.usable,0);assert.equal(row.code,'STARLIGHT_ARMOR_CORE');
  const app=read('js/app.js'),context=vm.createContext({Intl,Set,escapeHtml:value=>String(value??'')});
  vm.runInContext(app.slice(app.indexOf('const RETIREMENT_REROLL_META='),app.indexOf('let landSuperstarBusy=false;'))+';globalThis.model={state:inventoryUiState,meta:inventoryItemMeta,visible:inventoryVisibleItems,detail:inventoryDetailMarkup};',context);
  const m=context.model;assert.equal(m.meta(emperor).grade,'엠퍼러');assert.equal(m.meta({...emperor,quantity:1,usable:true}).usable,false);
  Object.assign(m.state,{ownedOnly:false,filter:'MATERIAL',sort:'RARITY'});
  assert.deepEqual(Array.from(m.visible(rows),x=>x.code),['EMPEROR_ENERGY','STARLIGHT_ARMOR_CORE']);
  m.state.query='엠퍼러';assert.deepEqual(Array.from(m.visible(rows),x=>x.code),['EMPEROR_ENERGY']);
  assert.match(m.detail({...emperor,quantity:1}),/data-inventory-use="EMPEROR_ENERGY" disabled/);
});

test('runtime art and source PNG have real transparency and intact canvas edges',async()=>{
  for(const path of ['assets/items/emperor-energy-v1.png',item.image]){
    const input=new URL('../'+path,import.meta.url),metadata=await sharp(readFileSync(input)).metadata();
    assert.equal(metadata.hasAlpha,true);assert.equal(metadata.width,metadata.height);
    const {data,info}=await sharp(readFileSync(input)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
    assert.ok(transparent>info.width*info.height*.2);
    for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0);assert.equal(data[((info.height-1)*info.width+x)*4+3],0);}
    for(let y=0;y<info.height;y++){assert.equal(data[(y*info.width)*4+3],0);assert.equal(data[(y*info.width+info.width-1)*4+3],0);}
  }
  assert.ok(readFileSync(new URL('../'+item.image,import.meta.url)).length<100000);
});
