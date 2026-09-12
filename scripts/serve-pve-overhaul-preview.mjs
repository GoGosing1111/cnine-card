import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {TOWER_V3_DRAFT,buildTowerV3Battle,validateTowerConfigChange} from '../functions/_tower_v3.js';
import {TOWER_V3_ECONOMY_DRAFT,TOWER_LEGACY_REWARD_SNAPSHOT,validateTowerEconomy} from '../functions/_tower_v3_economy.js';
import {ensureTowerV3Schema,runTowerV3,towerV3Status,towerV3Result} from '../functions/_tower_v3_runs.js';
import {buildScrapyardV3Battle} from '../functions/_scrapyard_v3.js';
import {buildCowRoomBattle} from '../functions/_cow_room_v3.js';
import {buildPreviewDeck,BATTLE_SUIT} from '../preview/idle-v3-v1/source/idle-model.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),port=Number(process.env.PVE_PREVIEW_PORT||8897),csrf=randomBytes(32).toString('hex');
const dir=path.resolve(process.env.PVE_PREVIEW_DATA_DIR||path.join(root,'tmp/v3-overhaul-ready-20260911'));fs.mkdirSync(dir,{recursive:true});
const sql=new DatabaseSync(path.join(dir,'preview.sqlite'));
const DB={prepare(source){return {source,values:[],bind(...values){return {...this,values};},async first(){return sql.prepare(source).get(...this.values)||null;},async all(){return {results:sql.prepare(source).all(...this.values)};},async run(){const r=sql.prepare(source).run(...this.values);return {meta:{changes:Number(r.changes)}};}};},async batch(stmts){sql.exec('BEGIN');try{for(const s of stmts)sql.prepare(s.source).run(...s.values);sql.exec('COMMIT');return [];}catch(e){sql.exec('ROLLBACK');throw e;}}};
sql.exec(`CREATE TABLE IF NOT EXISTS preview_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,coin INTEGER DEFAULT 0,card_shards INTEGER DEFAULT 0,magic_crystals INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS inventory_items(code TEXT PRIMARY KEY,name TEXT,rarity TEXT,image_url TEXT,is_active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER DEFAULT 0,unseen_quantity INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
CREATE TABLE IF NOT EXISTS coin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
CREATE TABLE IF NOT EXISTS inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
INSERT OR IGNORE INTO users(id) VALUES(7);
INSERT OR IGNORE INTO inventory_items(code,name,rarity,image_url) VALUES('VEHICLE_PART_TIRE','고성능 타이어','RARE','/assets/items/vehicle-part-tire-v1661.png');`);
const env={DB},user={id:7,role:'OWNER',nickname:'탑 체험 원정대'};await ensureTowerV3Schema(env);
const setting=(key,fallback)=>{const row=sql.prepare('SELECT value FROM preview_settings WHERE key=?').get(key);return row?JSON.parse(row.value):structuredClone(fallback);};
const set=(key,value)=>sql.prepare('INSERT INTO preview_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=read('assets/ui/project-v/characters/'+p);return m.characters.map(c=>({...c,grade:m.rarity}));});
const equipment=read('assets/ui/project-v/account-battle-suits/manifest-v2.json');
function loadSnapshot(){
  const scale=setting('power',4),cards=buildPreviewDeck(catalog).map(c=>({...c,power:Math.round(c.power*scale)}));
  const suit=equipment.suits.find(r=>r.code===BATTLE_SUIT.code),weapon=equipment.weapons.find(r=>r.equipmentCode===BATTLE_SUIT.weaponCode);
  const pvePower=Math.round(BATTLE_SUIT.basePower*scale),equippedBattleSuit={code:suit.code,pvePower,appearance:{battleSprite:suit.image,battleHeight:278}},equippedWeapon={code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}};
  return {schemaVersion:1,userId:user.id,accountNickname:user.nickname,cards,cardSupportBonus:0,magicCards:[],power:{cards:cards.reduce((s,c)=>s+c.power,0),equipment:0,battleSuit:pvePower},
    battleSuit:{...equippedBattleSuit,weapon:equippedWeapon,accountNickname:'원정대 지원'},characterBonus:{pve:pvePower,battleSuitPve:pvePower,equippedBattleSuit,equippedWeapon}};
}
const deps={loadSnapshot:async()=>loadSnapshot(),loadLegacy:async()=>({highestFloor:59,currentFloor:60,firstRewards:TOWER_LEGACY_REWARD_SNAPSHOT}),
  readConfig:async()=>setting('config',{...TOWER_V3_DRAFT,mode:'TEST'}),readEconomy:async()=>setting('economy',TOWER_V3_ECONOMY_DRAFT)};
let queue=Promise.resolve();const locked=work=>{const next=queue.then(work,work);queue=next.catch(()=>{});return next;};
const respond=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return respond(res,{error:'Local preview only'},403);
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    if(url.pathname.startsWith('/__pve-preview/')){
      if(req.method==='POST'){
        if(req.headers['x-preview-token']!==csrf||(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin)))return respond(res,{error:'Preview session required'},403);
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)return respond(res,{error:'Too large'},413);}const body=JSON.parse(raw||'{}');
        return await locked(async()=>{
          if(url.pathname.endsWith('/run'))return respond(res,await runTowerV3(env,user,{requestId:body.requestId,tier:body.tier},deps));
          if(url.pathname.endsWith('/settings')){
            const next=validateTowerConfigChange(await deps.readConfig(),{...body.config,mode:'TEST'}),policy=validateTowerEconomy({...body.economy,approved:false});
            if(![.25,1,4,10].includes(body.power))throw new Error('편성 강도를 확인하세요.');
            await DB.batch([DB.prepare('INSERT INTO preview_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('config',JSON.stringify(next)),DB.prepare('INSERT INTO preview_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('economy',JSON.stringify(policy)),DB.prepare('INSERT INTO preview_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('power',JSON.stringify(body.power))]);
            return respond(res,{ok:true});
          }
          return respond(res,{error:'Not found'},404);
        });
      }
      if(req.method!=='GET')return respond(res,{error:'Method not allowed'},405);
      if(url.pathname.endsWith('/status'))return respond(res,await towerV3Status(env,user,deps));
      if(url.pathname.endsWith('/result'))return respond(res,await towerV3Result(env,user,url.searchParams.get('requestId')));
      if(url.pathname.endsWith('/bootstrap'))return respond(res,{ok:true,csrf,previewOnly:true,accountId:7,config:await deps.readConfig(),economy:await deps.readEconomy(),power:setting('power',4),status:await towerV3Status(env,user,deps)});
      if(url.pathname.endsWith('/formation'))return respond(res,buildTowerV3Battle({snapshot:loadSnapshot(),tier:Number(url.searchParams.get('tier')||45),seed:7123,config:await deps.readConfig()}));
      if(url.pathname.endsWith('/records'))return respond(res,{ok:true,records:sql.prepare('SELECT tier,rules_version,best_combat_ms,achieved_at FROM tower_v3_records_v1 WHERE user_id=7 ORDER BY tier DESC,best_combat_ms LIMIT 12').all()});
      if(url.pathname.endsWith('/scrapyard')){
        const zone=url.searchParams.get('zone')||'OUTER',zones={OUTER:['외곽 폐차장',70000,150000,1000000],CORE:['압축 설비 구역',100000,200000,2000000],FURNACE:['용광로 심부',150000,300000,4000000]},d=zones[zone];if(!d)throw new Error('구역을 확인하세요.');
        return respond(res,buildScrapyardV3Battle({snapshot:loadSnapshot(),difficulty:{id:zone,name:d[0],requiredPowerStart:d[1],requiredPowerEnd:d[2],clearCoin:d[3],waves:10},seed:7123}));
      }
      if(url.pathname.endsWith('/cow'))return respond(res,buildCowRoomBattle({snapshot:loadSnapshot(),seed:7123}));
      return respond(res,{error:'Not found'},404);
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return respond(res,{error:'Method not allowed'},405);
    let relative=decodeURIComponent(url.pathname).replace(/^\/+/,''),file=path.resolve(root,relative);
    const pureModule=['functions/_battle_v2_preview.js','shared/battle-suit-skill-chips.mjs'].includes(relative);
    if(!file.startsWith(root+path.sep)||relative.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.'))||!pureModule&&!['preview','assets','css','js','style.css'].includes(relative.split('/')[0]))return respond(res,{error:'Not found'},404);
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep))return respond(res,{error:'Not found'},404);
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch(e){respond(res,{error:e.message,code:e.code||'PREVIEW_ERROR'},409);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local-only PVE review: http://127.0.0.1:${port}/preview/infinite-tower-v3-v1/`));
process.on('SIGINT',()=>server.close(()=>{sql.close();process.exit(0);}));
