import { SCHEMA } from '../_data/schema.js';
import { MEMBERS, CARDS, PACKS, RATES } from '../_data/seed.js';

const SCORE={C:1,U:5,R:20,SR:50,HR:100,UR:200,SSR:500,MA:1500,FUR:5000,LIMITED:3000};
const ORDER={C:1,U:2,R:3,SR:4,HR:5,UR:6,SSR:7,MA:8,FUR:9,LIMITED:10};
const RARITIES=['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'];
const SHARD_REWARD={C:1,U:2,R:4,SR:8,HR:15,UR:30,SSR:60,MA:120,FUR:250,LIMITED:180};
const BREAKTHROUGH_COST=[50,100,200,350,550,800,1100,1450,1850,2300];
const BREAKTHROUGH_RATE=[100,100,100,80,65,50,35,25,15,8];
const BREAKTHROUGH_GRADES=['SR','HR','UR','SSR','MA','FUR'];
const BREAKTHROUGH_MIN_ORDER=ORDER.SR;
function defaultBreakthroughConfig(){return Object.fromEntries(BREAKTHROUGH_GRADES.map(g=>[g,BREAKTHROUGH_COST.map((cost,i)=>({cost,rate:BREAKTHROUGH_RATE[i]}))]));}
async function breakthroughConfig(env){const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='breakthrough_config'").first();if(!row?.value)return defaultBreakthroughConfig();try{const parsed=JSON.parse(row.value),base=defaultBreakthroughConfig();for(const g of BREAKTHROUGH_GRADES)for(let i=0;i<10;i++){const x=parsed?.[g]?.[i]||{};base[g][i]={cost:Number.isInteger(Number(x.cost))&&Number(x.cost)>0?Number(x.cost):base[g][i].cost,rate:Number.isFinite(Number(x.rate))?Math.max(0,Math.min(100,Number(x.rate))):base[g][i].rate};}return base}catch{return defaultBreakthroughConfig()}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store'}});
const readBody=async request=>{try{return await request.json()}catch{return {}}};
const bytes=value=>new TextEncoder().encode(value);
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',bytes(value)));
const createToken=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const createPrivateKey=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const part=()=>Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');return `CN-${part()}-${part()}-${part()}`};
const kstDate=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const safeName=value=>(value||'').trim().slice(0,20);

async function tableExists(env,name){
  const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
  return Boolean(row);
}
async function initialized(env){
  if(!await tableExists(env,'app_meta')) return false;
  const row=await env.DB.prepare("SELECT value FROM app_meta WHERE key='initialized'").first();
  return row?.value==='1';
}
async function runSchema(env){for(const statement of SCHEMA) await env.DB.prepare(statement).run()}
async function ensureUpgrades(env){
  // A previous interrupted table rebuild can leave cards_legacy behind.
  // Recover first so repeated requests/deployments stay idempotent.
  const hasCards=await tableExists(env,'cards');
  const hasCardsLegacy=await tableExists(env,'cards_legacy');
  if(hasCardsLegacy){
    if(hasCards){
      await env.DB.prepare('DROP TABLE cards_legacy').run();
    }else{
      await env.DB.prepare('ALTER TABLE cards_legacy RENAME TO cards').run();
    }
  }
  const statements=[
    `CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, reward_coin INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, max_uses INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS coupon_redemptions (coupon_id INTEGER NOT NULL, user_id INTEGER NOT NULL, reward_coin INTEGER NOT NULL DEFAULT 0, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(coupon_id,user_id))`,
    `CREATE INDEX IF NOT EXISTS idx_coupon_code ON coupons(code)`,
    `CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at)`,
    `CREATE TABLE IF NOT EXISTS shard_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, change_amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT NOT NULL, card_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_shard_logs_user ON shard_logs(user_id,created_at)`
  ];
  for(const q of statements) await env.DB.prepare(q).run();
  for(const q of [
    `ALTER TABLE users ADD COLUMN banned_until TEXT`,
    `ALTER TABLE users ADD COLUMN ban_reason TEXT`,
    `ALTER TABLE cards ADD COLUMN draw_weight REAL NOT NULL DEFAULT 1`,
    `ALTER TABLE cards ADD COLUMN limited_total INTEGER`,
    `ALTER TABLE cards ADD COLUMN issued_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN card_shards INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_cards ADD COLUMN breakthrough_level INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE cards ADD COLUMN card_status TEXT NOT NULL DEFAULT 'PUBLIC'`,
    `ALTER TABLE cards ADD COLUMN batch_name TEXT`,
    `ALTER TABLE cards ADD COLUMN batch_date TEXT`
  ]){try{await env.DB.prepare(q).run()}catch{}}
  const cardSql=await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cards'").first();
  if(cardSql?.sql&&(!cardSql.sql.includes("'FUR'")||!cardSql.sql.includes("'LIMITED'"))){
    await env.DB.prepare('PRAGMA foreign_keys=OFF').run();
    await env.DB.prepare('PRAGMA legacy_alter_table=ON').run();
    await env.DB.prepare('ALTER TABLE cards RENAME TO cards_legacy').run();
    await env.DB.prepare(`CREATE TABLE cards (
      id TEXT PRIMARY KEY, member_id INTEGER NOT NULL, title TEXT NOT NULL,
      rarity TEXT NOT NULL CHECK (rarity IN ('C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED')),
      image_url TEXT NOT NULL, focus_x INTEGER NOT NULL DEFAULT 50, focus_y INTEGER NOT NULL DEFAULT 50,
      is_active INTEGER NOT NULL DEFAULT 1, draw_weight REAL NOT NULL DEFAULT 1,
      limited_total INTEGER, issued_count INTEGER NOT NULL DEFAULT 0,
      card_status TEXT NOT NULL DEFAULT 'PUBLIC', batch_name TEXT, batch_date TEXT,
      created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(member_id) REFERENCES members(id)
    )`).run();
    await env.DB.prepare(`INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,created_by,created_at,updated_at)
      SELECT id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,
             COALESCE(draw_weight,1),limited_total,COALESCE(issued_count,0),
             COALESCE(card_status,CASE WHEN is_active=1 THEN 'PUBLIC' ELSE 'INACTIVE' END),batch_name,batch_date,
             created_by,created_at,updated_at
      FROM cards_legacy`).run();
    await env.DB.prepare('DROP TABLE cards_legacy').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_member ON cards(member_id,rarity)').run();
    await env.DB.prepare('PRAGMA legacy_alter_table=OFF').run();
    await env.DB.prepare('PRAGMA foreign_keys=ON').run();
  }
  const packs=await env.DB.prepare('SELECT id,allowed_rarities FROM card_packs').all();
  for(const pack of packs.results){
    let allowed=[]; try{allowed=JSON.parse(pack.allowed_rarities||'[]')}catch{}
    for(const rarity of ['MA','FUR']) if(!allowed.includes(rarity)) allowed.push(rarity);
    allowed=allowed.filter(rarity=>rarity!=='LIMITED');
    if(pack.id==='pickup') allowed.push('LIMITED');
    await env.DB.prepare('UPDATE card_packs SET allowed_rarities=? WHERE id=?').bind(JSON.stringify(allowed),pack.id).run();
    await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'MA').run();
    await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'FUR').run();
    await env.DB.prepare('INSERT OR IGNORE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,0)').bind(pack.id,'LIMITED').run();
  }
  const limitedPackMigration=await env.DB.prepare("SELECT value FROM app_meta WHERE key='limited_pack_v83'").first();
  if(limitedPackMigration?.value!=='1'){
    const allowed=['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'];
    await env.DB.prepare(`UPDATE card_packs SET name='리미티드팩',subtitle='LIMITED PACK',description='별도 확률로 서버 한정판 카드가 등장하는 특별 카드팩',allowed_rarities=?,pickup_member_id=NULL,pickup_multiplier=1 WHERE id='pickup'`).bind(JSON.stringify(allowed)).run();
    await env.DB.prepare("UPDATE card_pack_rates SET rate=0 WHERE rarity='LIMITED' AND pack_id<>'pickup'").run();
    await env.DB.prepare("INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES('pickup','LIMITED',1)").run();
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('limited_pack_v83','1',CURRENT_TIMESTAMP)").run();
  }
  const limitedMigration=await env.DB.prepare("SELECT value FROM app_meta WHERE key='limited_cards_v82'").first();
  if(limitedMigration?.value!=='1'){
    const limitedIds=['card-0416','card-0417','card-0418','card-0419','card-0420','card-0421','card-0422','card-0423','card-0424','card-0425','card-0426','card-0427','card-0428','card-0429','card-0430','card-0431','card-0432','card-0433'];
    for(const id of limitedIds){
      await env.DB.prepare("UPDATE cards SET rarity='LIMITED', limited_total=CASE WHEN issued_count>5 THEN issued_count ELSE 5 END, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('limited_cards_v82','1',CURRENT_TIMESTAMP)").run();
  }
  const pendingMigration=await env.DB.prepare("SELECT value FROM app_meta WHERE key='new_card_pending_v84'").first();
  if(pendingMigration?.value!=='1'){
    for(const member of MEMBERS.filter(x=>x.sortOrder+1>=38)){
      await env.DB.prepare('INSERT OR IGNORE INTO members(id,name,slug,sort_order) VALUES(?,?,?,?)')
        .bind(member.sortOrder+1,member.name,member.slug,member.sortOrder).run();
    }
    const pendingCards=CARDS.filter(card=>{const n=Number(String(card.id).replace('card-',''));return n>=377&&n<=433});
    for(let i=0;i<pendingCards.length;i+=30){
      const chunk=pendingCards.slice(i,i+30).map(card=>env.DB.prepare(`INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,0,card.drawWeight??1,card.limitedTotal??null,'PENDING','채연·연두·여을·효짱 추가','2026-07-10'));
      await env.DB.batch(chunk);
    }
    await env.DB.prepare(`UPDATE cards SET is_active=0,card_status='PENDING',batch_name='채연·연두·여을·효짱 추가',batch_date='2026-07-10',updated_at=CURRENT_TIMESTAMP
      WHERE CAST(SUBSTR(id,6) AS INTEGER) BETWEEN 377 AND 433`).run();
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('new_card_pending_v84','1',CURRENT_TIMESTAMP)").run();
  }
}
async function writeAdminLog(env,admin,action,targetType,targetId,before=null,after=null){
  await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
    .bind(admin.id,action,targetType,String(targetId??''),before?JSON.stringify(before):null,after?JSON.stringify(after):null).run();
}
async function seedDatabase(env){
  for(const member of MEMBERS){
    await env.DB.prepare('INSERT OR IGNORE INTO members(id,name,slug,sort_order) VALUES(?,?,?,?)')
      .bind(member.sortOrder+1,member.name,member.slug,member.sortOrder).run();
  }
  for(let i=0;i<CARDS.length;i+=40){
    const chunk=CARDS.slice(i,i+40).map(card=>env.DB.prepare('INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,card_status,batch_name,batch_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY,card.status==='PENDING'?0:1,card.drawWeight??1,card.limitedTotal??null,card.status||'PUBLIC',card.batchName||null,card.batchDate||null));
    await env.DB.batch(chunk);
  }
  for(const pack of PACKS){
    await env.DB.prepare(`INSERT OR REPLACE INTO card_packs(id,name,subtitle,description,theme,price,allowed_rarities,guarantee_10,guarantee_20,pickup_member_id,pickup_multiplier,is_active,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(pack.id,pack.name,pack.subtitle,pack.description,pack.theme,pack.price,JSON.stringify(pack.allowed),pack.guarantee10,pack.guarantee20,pack.pickupMemberId,pack.pickupMultiplier,1,pack.sortOrder).run();
    for(const [rarity,rate] of Object.entries(RATES)){
      await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(pack.id,rarity,(pack.id==='pickup'&&rarity==='LIMITED')?1:rate).run();
    }
  }
}
async function authenticate(request,env){
  const raw=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!raw) return null;
  const tokenHash=await hash(raw);
  return env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`).bind(tokenHash).first();
}
async function makeSession(env,userId){
  const raw=createToken();
  const tokenHash=await hash(raw);
  const expiresAt=new Date(Date.now()+1000*60*60*24*30).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,userId,expiresAt).run();
  return raw;
}
async function profile(env,user){
  const owned=await env.DB.prepare('SELECT card_id,quantity,first_obtained_at,breakthrough_level FROM user_cards WHERE user_id=?').bind(user.id).all();
  const attendance=await env.DB.prepare('SELECT attendance_date FROM attendance_logs WHERE user_id=? ORDER BY attendance_date DESC LIMIT 1').bind(user.id).first();
  const totalAttendance=await env.DB.prepare('SELECT COUNT(*) count FROM attendance_logs WHERE user_id=?').bind(user.id).first();
  const recent=await env.DB.prepare(`SELECT d.card_id AS cardId,d.is_new,c.title,c.rarity,d.created_at AS at
    FROM draw_logs d JOIN cards c ON c.id=d.card_id WHERE d.user_id=? ORDER BY d.id DESC LIMIT 30`).bind(user.id).all();
  return {id:user.id,nickname:user.nickname,coin:user.coin,cardShards:Number(user.card_shards||0),role:user.role,
    owned:owned.results.map(row=>row.card_id),
    quantities:Object.fromEntries(owned.results.map(row=>[row.card_id,row.quantity])),
    breakthroughs:Object.fromEntries(owned.results.map(row=>[row.card_id,Number(row.breakthrough_level||0)])),
    history:recent.results.reverse().map(row=>({cardId:row.cardId,at:row.at,duplicate:!row.is_new,title:row.title,grade:row.rarity})),
    attendance:{lastClaimDate:attendance?.attendance_date||null,totalDays:totalAttendance?.count||0},breakthroughConfig:await breakthroughConfig(env)};
}
function weightedPick(items,getWeight){
  const total=items.reduce((sum,item)=>sum+getWeight(item),0);
  let roll=Math.random()*total;
  for(const item of items){roll-=getWeight(item);if(roll<0)return item}
  return items.at(-1);
}
async function drawLimitedCard(env){
  const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
    FROM cards c JOIN members m ON m.id=c.member_id
    WHERE c.is_active=1 AND c.rarity='LIMITED' AND c.draw_weight>0 AND c.limited_total IS NOT NULL AND c.issued_count<c.limited_total`).all()).results;
  return weightedPick(pool,row=>Number(row.draw_weight)||0)||null;
}
async function drawOne(env,pack,minimum=null){
  // 리미티드팩의 한정판 확률은 일반 등급 100% 합계와 별도로 먼저 판정한다.
  if(pack.id==='pickup'&&!minimum){
    const limitedRateRow=await env.DB.prepare("SELECT rate FROM card_pack_rates WHERE pack_id=? AND rarity='LIMITED'").bind(pack.id).first();
    const limitedRate=Math.max(0,Math.min(100,Number(limitedRateRow?.rate)||0));
    if(limitedRate>0&&Math.random()*100<limitedRate){
      const limitedCard=await drawLimitedCard(env);
      if(limitedCard) return limitedCard;
    }
  }
  let allowed=JSON.parse(pack.allowed_rarities).filter(rarity=>RARITIES.includes(rarity)&&rarity!=='LIMITED');
  if(minimum) allowed=allowed.filter(rarity=>ORDER[rarity]>=ORDER[minimum]);
  if(!allowed.length) throw new Error('이 카드팩에 설정된 일반 등급이 없습니다.');
  const placeholders=allowed.map(()=>'?').join(',');
  const rates=(await env.DB.prepare(`SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rarity IN (${placeholders}) AND rate>0`).bind(pack.id,...allowed).all()).results;
  if(!rates.length) throw new Error('이 카드팩에 설정된 일반 카드 확률이 없습니다.');
  for(let attempt=0;attempt<20;attempt++){
    const selectedRarity=weightedPick(rates,row=>Number(row.rate)||0)?.rarity;
    const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id,c.draw_weight,c.limited_total,c.issued_count
      FROM cards c JOIN members m ON m.id=c.member_id
      WHERE c.is_active=1 AND c.rarity=? AND c.draw_weight>0 AND (c.limited_total IS NULL OR c.issued_count<c.limited_total)`).bind(selectedRarity).all()).results;
    if(!pool.length) continue;
    const card=weightedPick(pool,row=>(Number(row.draw_weight)||0)*(pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1));
    if(card) return card;
  }
  throw new Error('현재 뽑을 수 있는 일반 카드가 없습니다. 카드 및 확률 설정을 확인하세요.');
}

async function maintenanceSettings(env){
  const keys=['maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at'];
  const rows=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
  const values=Object.fromEntries(rows.results.map(row=>[row.key,row.value]));
  return {
    active:String(values.maintenance_mode||'0')==='1',
    title:values.maintenance_title||'씨켓몬 서버 점검 중',
    message:values.maintenance_message||'안정적인 서비스 제공을 위해 점검을 진행하고 있습니다.',
    startAt:values.maintenance_start_at||'',
    endAt:values.maintenance_end_at||''
  };
}
function isAdminRole(user){return Boolean(user&&['OWNER','ADMIN'].includes(user.role))}

async function requirePermission(request,env,permission){
  const user=await authenticate(request,env);
  if(!user||!['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(user.role)) return null;
  if(['OWNER','ADMIN'].includes(user.role)) return user;
  const row=await env.DB.prepare('SELECT is_allowed FROM admin_permissions WHERE admin_user_id=? AND permission_key=?').bind(user.id,permission).first();
  return row?.is_allowed?user:null;
}

export async function onRequest(context){
  const {request,env}=context;
  const url=new URL(request.url);
  const path=url.pathname.replace(/^\/api\/?/,'');
  try{
    if(!env.DB) return json({error:'D1 바인딩 DB가 연결되지 않았습니다.'},503);

    if(path==='health') return json({ok:true,version:'2.8.2',database:true,initialized:await initialized(env)});
    if(path==='setup/status') return json({initialized:await initialized(env),tables:await tableExists(env,'users')});
    if(path==='setup/init'&&request.method==='POST'){
      if(await initialized(env)) return json({error:'이미 초기화가 완료된 데이터베이스입니다.'},409);
      const payload=await readBody(request);
      if(!env.SETUP_KEY) return json({error:'Cloudflare 환경 변수 SETUP_KEY를 먼저 설정하세요.'},503);
      if((payload.setupKey||'')!==env.SETUP_KEY) return json({error:'설치 암호가 올바르지 않습니다.'},403);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'최고 관리자 닉네임을 입력하세요.'},400);
      await runSchema(env);
      await ensureUpgrades(env);
      await seedDatabase(env);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      const result=await env.DB.prepare("INSERT INTO users(nickname,private_key_hash,coin,role,status) VALUES(?,?,100000,'OWNER','ACTIVE')").bind(nickname,privateKeyHash).run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('initialized','1',CURRENT_TIMESTAMP)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('version','2.0.0',CURRENT_TIMESTAMP)").run();
      const token=await makeSession(env,result.meta.last_row_id);
      return json({ok:true,privateKey,token,nickname,cards:CARDS.length,members:MEMBERS.length,packs:PACKS.length},201);
    }

    if(!await initialized(env)) return json({error:'데이터베이스 초기화가 필요합니다. /setup/에서 설치를 완료하세요.'},503);
    await ensureUpgrades(env);

    if(path==='service/status'){
      const maintenance=await maintenanceSettings(env);
      const user=await authenticate(request,env);
      return json({maintenance,bypass:isAdminRole(user),role:user?.role||null});
    }

    const maintenance=await maintenanceSettings(env);
    const maintenanceExempt=path.startsWith('admin/')||path==='auth/login'||path==='auth/logout'||path==='health'||path.startsWith('setup/');
    if(maintenance.active&&!maintenanceExempt){
      const current=await authenticate(request,env);
      if(!isAdminRole(current)) return json({error:'현재 서버 점검 중입니다.',maintenance},503);
    }

    if(path==='auth/register'&&request.method==='POST'){
      const payload=await readBody(request);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'닉네임을 입력하세요.'},400);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      try{
        const coinSetting=await env.DB.prepare("SELECT value FROM app_meta WHERE key='new_user_coin'").first();
        const newUserCoin=Math.max(0,Number(coinSetting?.value||5000)||5000);
        const result=await env.DB.prepare('INSERT INTO users(nickname,private_key_hash,coin) VALUES(?,?,?)').bind(nickname,privateKeyHash,newUserCoin).run();
        const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(result.meta.last_row_id).first();
        return json({token:await makeSession(env,user.id),privateKey,user:await profile(env,user)},201);
      }catch(error){return json({error:'이미 사용 중인 닉네임입니다.'},409)}
    }
    if(path==='auth/login'&&request.method==='POST'){
      const payload=await readBody(request);
      const privateKeyHash=await hash((payload.privateKey||'').trim().toUpperCase());
      const user=await env.DB.prepare("SELECT * FROM users WHERE private_key_hash=?").bind(privateKeyHash).first();
      if(!user) return json({error:'개인키가 올바르지 않습니다.'},401);
      if(user.status!=='ACTIVE'||(user.banned_until&&new Date(user.banned_until+'Z')>new Date())) return json({error:`이용이 정지된 계정입니다.${user.ban_reason?' 사유: '+user.ban_reason:''}`},403);
      const currentMaintenance=await maintenanceSettings(env);
      if(currentMaintenance.active&&!isAdminRole(user)) return json({error:'현재 서버 점검 중입니다.',maintenance:currentMaintenance},503);
      await env.DB.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.id).run();
      return json({token:await makeSession(env,user.id),user:await profile(env,user)});
    }
    if(path==='auth/logout'&&request.method==='POST'){
      const raw=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
      if(raw){
        const tokenHash=await hash(raw);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
      }
      return json({ok:true});
    }
    if(path==='me'){
      const user=await authenticate(request,env);
      return user?json({user:await profile(env,user)}):json({error:'로그인이 필요합니다.'},401);
    }
    if(path==='cards'){
      const rows=await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.limited_total AS limitedTotal,c.issued_count AS issuedCount
        FROM cards c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 ORDER BY m.sort_order,c.id`).all();
      return json({cards:rows.results});
    }
    if(path==='packs'){
      const rows=await env.DB.prepare('SELECT * FROM card_packs WHERE is_active=1 ORDER BY sort_order,id').all();
      return json({packs:rows.results.map(row=>({...row,allowed:JSON.parse(row.allowed_rarities)}))});
    }
    if(path==='attendance/claim'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const date=kstDate();
      try{await env.DB.prepare('INSERT INTO attendance_logs(user_id,attendance_date,reward_coin) VALUES(?,?,500)').bind(user.id,date).run()}
      catch{return json({error:'오늘 접속 보상을 이미 받았습니다.'},409)}
      await env.DB.prepare('UPDATE users SET coin=coin+500 WHERE id=?').bind(user.id).run();
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,500,?,'ATTENDANCE')").bind(user.id,updated.coin).run();
      return json({reward:500,user:await profile(env,updated)});
    }
    if(path==='draw'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const count=[1,10,20].includes(Number(payload.count))?Number(payload.count):1;
      const pack=await env.DB.prepare('SELECT * FROM card_packs WHERE id=? AND is_active=1').bind(payload.packId).first();
      if(!pack) return json({error:'판매 중인 카드팩이 아닙니다.'},404);
      const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      const cost=pack.price*count;
      if(fresh.coin<cost) return json({error:'코인이 부족합니다.'},400);
      const cards=[];
      for(let index=0;index<count;index++) cards.push(await drawOne(env,pack));
      const guarantee=count===10?pack.guarantee_10:count===20?pack.guarantee_20:null;
      if(guarantee&&!cards.some(card=>ORDER[card.grade]>=ORDER[guarantee])) cards[cards.length-1]=await drawOne(env,pack,guarantee);
      cards.sort((a,b)=>ORDER[b.grade]-ORDER[a.grade]);
      const debit=await env.DB.prepare('UPDATE users SET coin=coin-? WHERE id=? AND coin>=?').bind(cost,user.id,cost).run();
      if(!debit.meta.changes) return json({error:'코인이 부족합니다.'},400);
      const groupId=crypto.randomUUID();
      const results=[];
      for(let i=0;i<cards.length;i++){
        let card=cards[i];
        if(card.limited_total!==null&&card.limited_total!==undefined){
          let reserved=await env.DB.prepare('UPDATE cards SET issued_count=issued_count+1 WHERE id=? AND issued_count<limited_total').bind(card.id).run();
          let retry=0;
          while(!reserved.meta.changes&&retry++<20){
            card=await drawOne(env,pack);
            if(card.limited_total===null||card.limited_total===undefined){reserved={meta:{changes:1}};break}
            reserved=await env.DB.prepare('UPDATE cards SET issued_count=issued_count+1 WHERE id=? AND issued_count<limited_total').bind(card.id).run();
          }
          if(!reserved.meta.changes) return json({error:'한정판 카드 수량이 방금 소진되었습니다. 다시 시도하세요.'},409);
          cards[i]=card;
        }
        const previous=await env.DB.prepare('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?').bind(user.id,card.id).first();
        const isNew=!previous;
        await env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1)
          ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,card.id).run();
        let shardGained=0;
        if(!isNew){
          shardGained=SHARD_REWARD[card.grade]||0;
          if(shardGained>0){
            await env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(shardGained,user.id).run();
            const shardUser=await env.DB.prepare('SELECT card_shards FROM users WHERE id=?').bind(user.id).first();
            await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,'DUPLICATE',?)").bind(user.id,shardGained,shardUser.card_shards,card.id).run();
          }
        }
        await env.DB.prepare('INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) VALUES(?,?,?,?,?,?,?)')
          .bind(groupId,user.id,pack.id,card.id,card.grade,cost,isNew?1:0).run();
        results.push({card,duplicate:!isNew,shardGained});
      }
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PACK_DRAW')").bind(user.id,-cost,updated.coin).run();
      return json({results,user:await profile(env,updated)});
    }

    if(path==='card/breakthrough'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const cardId=String(payload.cardId||'').trim();
      const owned=await env.DB.prepare(`SELECT uc.breakthrough_level,c.rarity,c.title FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.card_id=?`).bind(user.id,cardId).first();
      if(!owned) return json({error:'보유한 카드만 돌파할 수 있습니다.'},404);
      if((ORDER[owned.rarity]||0)<BREAKTHROUGH_MIN_ORDER) return json({error:'SR 등급 이상 카드만 돌파할 수 있습니다.'},400);
      const level=Number(owned.breakthrough_level||0);
      if(level>=10) return json({error:'이미 최대 돌파 단계입니다.'},409);
      const config=await breakthroughConfig(env),rule=config[owned.rarity]?.[level];
      if(!rule) return json({error:'돌파 설정을 찾을 수 없습니다.'},500);
      const cost=Number(rule.cost),rate=Number(rule.rate);
      const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      if(Number(fresh.card_shards||0)<cost) return json({error:`카드 조각이 부족합니다. (${cost}개 필요)`},400);
      const spent=await env.DB.prepare('UPDATE users SET card_shards=card_shards-? WHERE id=? AND card_shards>=?').bind(cost,user.id,cost).run();
      if(!spent.meta.changes) return json({error:'카드 조각이 부족합니다.'},400);
      const success=Math.random()*100<rate;
      if(success) await env.DB.prepare('UPDATE user_cards SET breakthrough_level=breakthrough_level+1 WHERE user_id=? AND card_id=?').bind(user.id,cardId).run();
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id) VALUES(?,?,?,?,?)").bind(user.id,-cost,updated.card_shards,success?'BREAKTHROUGH_SUCCESS':'BREAKTHROUGH_FAIL',cardId).run();
      return json({ok:true,success,cost,rate,level:success?level+1:level,user:await profile(env,updated)});
    }
    if(path==='recent-high-grade'){
      const rows=await env.DB.prepare(`SELECT u.nickname,c.title AS card_title,c.rarity,d.created_at
        FROM draw_logs d
        JOIN users u ON u.id=d.user_id
        JOIN cards c ON c.id=d.card_id
        WHERE d.rarity IN ('UR','SSR','MA','FUR','LIMITED') AND u.status='ACTIVE'
        ORDER BY d.id DESC LIMIT 20`).all();
      return json({items:rows.results});
    }
    if(path==='ranking'){
      const rows=await env.DB.prepare(`SELECT u.nickname,
        COALESCE(SUM(CASE c.rarity WHEN 'LIMITED' THEN 3000 WHEN 'FUR' THEN 5000 WHEN 'MA' THEN 1500 WHEN 'SSR' THEN 500 WHEN 'UR' THEN 200 WHEN 'HR' THEN 100 WHEN 'SR' THEN 50 WHEN 'R' THEN 20 WHEN 'U' THEN 5 ELSE 1 END),0) AS score,
        COUNT(uc.card_id) AS card_count,COALESCE(SUM(CASE WHEN c.rarity='SSR' THEN 1 ELSE 0 END),0) AS ssr_count
        FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id LEFT JOIN cards c ON c.id=uc.card_id
        WHERE u.status='ACTIVE' GROUP BY u.id ORDER BY score DESC,card_count DESC,u.created_at ASC LIMIT 100`).all();
      return json({ranking:rows.results});
    }


    if(path==='coupon/redeem'&&request.method==='POST'){
      const user=await authenticate(request,env);
      if(!user) return json({error:'로그인이 필요합니다.'},401);
      const payload=await readBody(request);
      const code=String(payload.code||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,40);
      if(!code) return json({error:'쿠폰 코드를 입력하세요.'},400);
      const coupon=await env.DB.prepare(`SELECT * FROM coupons WHERE code=? AND is_active=1
        AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (ends_at IS NULL OR ends_at>=datetime('now'))`).bind(code).first();
      if(!coupon) return json({error:'존재하지 않거나 사용 기간이 끝난 쿠폰입니다.'},404);
      if(coupon.used_count>=coupon.max_uses) return json({error:'쿠폰 사용 한도가 모두 소진되었습니다.'},409);
      const used=await env.DB.prepare('SELECT 1 FROM coupon_redemptions WHERE coupon_id=? AND user_id=?').bind(coupon.id,user.id).first();
      if(used) return json({error:'이미 사용한 쿠폰입니다.'},409);
      const nextCoin=user.coin+coupon.reward_coin;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO coupon_redemptions(coupon_id,user_id,reward_coin) VALUES(?,?,?)').bind(coupon.id,user.id,coupon.reward_coin),
        env.DB.prepare('UPDATE coupons SET used_count=used_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND used_count<max_uses').bind(coupon.id),
        env.DB.prepare('UPDATE users SET coin=? WHERE id=?').bind(nextCoin,user.id),
        env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'COUPON')").bind(user.id,coupon.reward_coin,nextCoin)
      ]);
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      return json({ok:true,rewardCoin:coupon.reward_coin,user:await profile(env,updated)});
    }

    if(path==='admin/dashboard'){
      const admin=await requirePermission(request,env,'DASHBOARD');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      const [users,usersToday,cards,draws,coins,banned,coupons,urOwned,ssrOwned]=await Promise.all([
        env.DB.prepare('SELECT COUNT(*) count FROM users').first(),
        env.DB.prepare("SELECT COUNT(*) count FROM users WHERE date(created_at)=date('now','localtime')").first(),
        env.DB.prepare('SELECT COUNT(*) count FROM cards WHERE is_active=1').first(),
        env.DB.prepare("SELECT COUNT(*) count FROM draw_logs WHERE created_at>=datetime('now','-1 day')").first(),
        env.DB.prepare('SELECT COALESCE(SUM(coin),0) total FROM users').first(),
        env.DB.prepare("SELECT COUNT(*) count FROM users WHERE status!='ACTIVE' OR (banned_until IS NOT NULL AND banned_until>datetime('now'))").first(),
        env.DB.prepare("SELECT COUNT(*) count FROM coupons WHERE is_active=1 AND (starts_at IS NULL OR starts_at<=datetime('now')) AND (ends_at IS NULL OR ends_at>=datetime('now'))").first(),
        env.DB.prepare("SELECT COUNT(*) count FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE c.rarity='UR'").first(),
        env.DB.prepare("SELECT COUNT(*) count FROM user_cards uc JOIN cards c ON c.id=uc.card_id WHERE c.rarity='SSR'").first()
      ]);
      return json({role:admin.role,admin:{id:admin.id,nickname:admin.nickname,role:admin.role,last_login_at:admin.last_login_at},stats:{users:users.count,usersToday:usersToday.count,cards:cards.count,draws24h:draws.count,totalCoin:coins.total,banned:banned.count,coupons:coupons.count,urOwned:urOwned.count,ssrOwned:ssrOwned.count}});
    }

    if(path==='admin/logs'){
      const admin=await requirePermission(request,env,'ADMIN_LOG'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      const rows=await env.DB.prepare(`SELECT l.*,u.nickname AS admin_nickname FROM admin_logs l LEFT JOIN users u ON u.id=l.admin_id ORDER BY l.id DESC LIMIT 300`).all();
      return json({logs:rows.results});
    }

    if(path==='admin/breakthrough-settings'){
      const admin=await requirePermission(request,env,'SETTINGS'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET') return json({config:await breakthroughConfig(env),grades:BREAKTHROUGH_GRADES});
      if(request.method==='PATCH'){
        const payload=await readBody(request),incoming=payload.config;
        if(!incoming||typeof incoming!=='object')return json({error:'돌파 설정값이 없습니다.'},400);
        const clean=defaultBreakthroughConfig();
        for(const grade of BREAKTHROUGH_GRADES){
          if(!Array.isArray(incoming[grade])||incoming[grade].length!==10)return json({error:`${grade} 등급은 10단계 설정이 필요합니다.`},400);
          for(let i=0;i<10;i++){
            const cost=Number(incoming[grade][i]?.cost),rate=Number(incoming[grade][i]?.rate);
            if(!Number.isInteger(cost)||cost<1||cost>10000000)return json({error:`${grade} ★${i}→★${i+1} 조각 비용을 확인하세요.`},400);
            if(!Number.isFinite(rate)||rate<0||rate>100)return json({error:`${grade} ★${i}→★${i+1} 성공 확률은 0~100%입니다.`},400);
            clean[grade][i]={cost,rate:Math.round(rate*10000)/10000};
          }
        }
        const before=await breakthroughConfig(env);
        await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('breakthrough_config',?,CURRENT_TIMESTAMP)").bind(JSON.stringify(clean)).run();
        await writeAdminLog(env,admin,'BREAKTHROUGH_SETTINGS_UPDATE','SETTINGS','breakthrough',before,clean);
        return json({ok:true,config:clean});
      }
    }

    if(path==='admin/settings'){
      const admin=await requirePermission(request,env,'SETTINGS'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const rows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('site_notice','maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','new_user_coin')").all();
        return json({settings:Object.fromEntries(rows.results.map(x=>[x.key,x.value])),role:admin.role});
      }
      if(request.method==='POST'){
        const payload=await readBody(request);
        const maintenanceKeys=['maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at'];
        const ownerKeys=['site_notice','new_user_coin'];
        if(admin.role!=='OWNER'&&ownerKeys.some(key=>key in payload)) return json({error:'신규 가입 코인과 서비스 공지는 OWNER만 변경할 수 있습니다.'},403);
        const beforeRows=await env.DB.prepare("SELECT key,value FROM app_meta WHERE key IN ('site_notice','maintenance_mode','maintenance_title','maintenance_message','maintenance_start_at','maintenance_end_at','new_user_coin')").all();
        const before=Object.fromEntries(beforeRows.results.map(x=>[x.key,x.value]));
        for(const key of [...maintenanceKeys,...ownerKeys]) if(key in payload) await env.DB.prepare('INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(key,String(payload[key]??'')).run();
        const action=String(payload.maintenance_mode)==='1'&&before.maintenance_mode!=='1'?'MAINTENANCE_START':String(payload.maintenance_mode)==='0'&&before.maintenance_mode==='1'?'MAINTENANCE_END':'SETTINGS_UPDATE';
        await writeAdminLog(env,admin,action,'SETTINGS','global',before,payload); return json({ok:true,maintenance:await maintenanceSettings(env)});
      }
    }

    if(path==='admin/coupons'){
      const admin=await requirePermission(request,env,'COUPON_MANAGE'); if(!admin)return json({error:'관리자 권한이 없습니다.'},403);
      if(request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM coupons ORDER BY id DESC').all();return json({coupons:rows.results});}
      if(request.method==='POST'){
        const p=await readBody(request),code=String(p.code||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,40),reward=Number(p.rewardCoin),max=Number(p.maxUses);
        if(!/^[A-Z0-9_-]{4,40}$/.test(code))return json({error:'쿠폰 코드는 영문 대문자·숫자·_·- 조합 4~40자로 입력하세요.'},400);
        if(!Number.isInteger(reward)||reward<1||reward>10000000)return json({error:'보상 코인을 확인하세요.'},400);
        if(!Number.isInteger(max)||max<1||max>1000000)return json({error:'총 사용 한도를 확인하세요.'},400);
        try{const r=await env.DB.prepare('INSERT INTO coupons(code,reward_coin,starts_at,ends_at,max_uses,created_by) VALUES(?,?,?,?,?,?)').bind(code,reward,p.startsAt||null,p.endsAt||null,max,admin.id).run();await writeAdminLog(env,admin,'COUPON_CREATE','COUPON',r.meta.last_row_id,null,{code,reward,max});return json({ok:true},201)}catch{return json({error:'이미 존재하는 쿠폰 코드입니다.'},409)}
      }
      if(request.method==='PATCH'){
        const p=await readBody(request),before=await env.DB.prepare('SELECT * FROM coupons WHERE id=?').bind(Number(p.id)).first();if(!before)return json({error:'쿠폰이 없습니다.'},404);
        await env.DB.prepare('UPDATE coupons SET is_active=?,ends_at=COALESCE(?,ends_at),max_uses=COALESCE(?,max_uses),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(p.isActive===false?0:1,p.endsAt||null,p.maxUses?Number(p.maxUses):null,before.id).run();
        const after=await env.DB.prepare('SELECT * FROM coupons WHERE id=?').bind(before.id).first();await writeAdminLog(env,admin,'COUPON_UPDATE','COUPON',before.id,before,after);return json({ok:true,coupon:after});
      }
    }

    if(path==='admin/users/action'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'USER_MANAGE'); if(!admin)return json({error:'유저 관리 권한이 없습니다.'},403);
      const p=await readBody(request),userId=Number(p.userId),action=String(p.action||'');
      const before=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();
      if(!before)return json({error:'유저를 찾을 수 없습니다.'},404);
      if(before.role==='OWNER'&&admin.role!=='OWNER')return json({error:'OWNER 계정은 수정할 수 없습니다.'},403);
      if(action==='COIN'){const amount=Number(p.amount);if(!Number.isInteger(amount)||amount===0)return json({error:'변경 코인을 입력하세요.'},400);if(before.coin+amount<0)return json({error:'보유 코인보다 많이 회수할 수 없습니다.'},400);await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,userId).run();const afterCoin=before.coin+amount;await env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(?,?,?,?,?)').bind(userId,amount,afterCoin,String(p.reason||'관리자 조정').slice(0,100),admin.id).run();}
      else if(action==='SHARDS'){const amount=Number(p.amount);if(!Number.isInteger(amount)||amount===0)return json({error:'변경할 카드 조각 수량을 입력하세요.'},400);const current=Number(before.card_shards||0);if(current+amount<0)return json({error:'보유 카드 조각보다 많이 회수할 수 없습니다.'},400);await env.DB.prepare('UPDATE users SET card_shards=card_shards+? WHERE id=?').bind(amount,userId).run();const balance=current+amount;await env.DB.prepare('INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,?)').bind(userId,amount,balance,String(p.reason||'관리자 조정').slice(0,100)).run();}
      else if(action==='CARDS_RESET')await env.DB.prepare('DELETE FROM user_cards WHERE user_id=?').bind(userId).run();
      else if(action==='ATTENDANCE_RESET')await env.DB.prepare('DELETE FROM attendance_logs WHERE user_id=?').bind(userId).run();
      else if(action==='ACCOUNT_RESET')await env.DB.batch([env.DB.prepare('DELETE FROM user_cards WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM attendance_logs WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM draw_logs WHERE user_id=?').bind(userId),env.DB.prepare('UPDATE users SET coin=5000,card_shards=0 WHERE id=?').bind(userId)]);
      else if(action==='BAN'){const days=String(p.days||'1'),until=days==='PERMANENT'?'9999-12-31 23:59:59':new Date(Date.now()+Number(days)*86400000).toISOString().replace('T',' ').slice(0,19);await env.DB.batch([env.DB.prepare("UPDATE users SET status='BANNED',banned_until=?,ban_reason=? WHERE id=?").bind(until,String(p.reason||'').slice(0,200),userId),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)]);}
      else if(action==='UNBAN')await env.DB.prepare("UPDATE users SET status='ACTIVE',banned_until=NULL,ban_reason=NULL WHERE id=?").bind(userId).run();
      else return json({error:'지원하지 않는 작업입니다.'},400);
      const after=await env.DB.prepare('SELECT id,nickname,coin,card_shards,role,status,banned_until,ban_reason FROM users WHERE id=?').bind(userId).first();await writeAdminLog(env,admin,action,'USER',userId,before,after);return json({ok:true,user:after});
    }

    if(path==='admin/users'){
      const admin=await requirePermission(request,env,'USER_MANAGE');
      if(!admin) return json({error:'유저 관리 권한이 없습니다.'},403);
      if(request.method!=='GET') return json({error:'지원하지 않는 요청입니다.'},405);
      const q=(url.searchParams.get('q')||'').trim().slice(0,30);
      const rows=q
        ? await env.DB.prepare(`SELECT u.id,u.nickname,u.coin,u.card_shards,u.role,u.status,u.created_at,u.last_login_at,COUNT(uc.card_id) AS card_count,COALESCE(SUM(CASE WHEN c.rarity='UR' THEN 1 ELSE 0 END),0) AS ur_count,COALESCE(SUM(CASE WHEN c.rarity='SSR' THEN 1 ELSE 0 END),0) AS ssr_count
            FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id LEFT JOIN cards c ON c.id=uc.card_id
            WHERE u.nickname LIKE ? GROUP BY u.id ORDER BY u.nickname LIMIT 50`).bind(`%${q}%`).all()
        : await env.DB.prepare(`SELECT u.id,u.nickname,u.coin,u.card_shards,u.role,u.status,u.created_at,u.last_login_at,COUNT(uc.card_id) AS card_count,COALESCE(SUM(CASE WHEN c.rarity='UR' THEN 1 ELSE 0 END),0) AS ur_count,COALESCE(SUM(CASE WHEN c.rarity='SSR' THEN 1 ELSE 0 END),0) AS ssr_count
            FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id LEFT JOIN cards c ON c.id=uc.card_id
            GROUP BY u.id ORDER BY u.created_at DESC LIMIT 50`).all();
      return json({users:rows.results,role:admin.role});
    }

    if(path==='admin/users/private-key-reset'&&request.method==='POST'){
      const admin=await authenticate(request,env);
      if(!admin||!['OWNER','ADMIN'].includes(admin.role)) return json({error:'개인키 재발급 권한이 없습니다.'},403);
      const payload=await readBody(request);
      const userId=Number(payload.userId);
      if(!Number.isInteger(userId)||userId<1) return json({error:'재발급할 유저를 선택하세요.'},400);
      const before=await env.DB.prepare('SELECT id,nickname,role,status FROM users WHERE id=?').bind(userId).first();
      if(!before) return json({error:'유저를 찾을 수 없습니다.'},404);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET private_key_hash=? WHERE id=?').bind(privateKeyHash,userId),
        env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)
      ]);
      await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
        .bind(admin.id,'PRIVATE_KEY_RESET','USER',String(userId),JSON.stringify(before),JSON.stringify({nickname:before.nickname,sessionsRevoked:true})).run();
      return json({ok:true,user:{id:before.id,nickname:before.nickname},privateKey});
    }
    if(path==='admin/coins'&&request.method==='POST'){
      const admin=await requirePermission(request,env,'COIN_GRANT');
      if(!admin) return json({error:'코인 지급 권한이 없습니다.'},403);
      const payload=await readBody(request);
      const userId=Number(payload.userId);
      const amount=Number(payload.amount);
      const reason=String(payload.reason||'관리자 수동 지급').trim().slice(0,100);
      if(!Number.isInteger(userId)||userId<1) return json({error:'지급할 유저를 선택하세요.'},400);
      if(!Number.isInteger(amount)||amount<1||amount>1000000) return json({error:'지급 코인은 1~1,000,000 사이의 정수로 입력하세요.'},400);
      const before=await env.DB.prepare('SELECT id,nickname,coin,status FROM users WHERE id=?').bind(userId).first();
      if(!before) return json({error:'유저를 찾을 수 없습니다.'},404);
      const result=await env.DB.prepare('UPDATE users SET coin=coin+? WHERE id=?').bind(amount,userId).run();
      if(!result.meta.changes) return json({error:'코인 지급에 실패했습니다.'},500);
      const after=await env.DB.prepare('SELECT id,nickname,coin,status FROM users WHERE id=?').bind(userId).first();
      await env.DB.prepare('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES(?,?,?,?,?)')
        .bind(userId,amount,after.coin,reason||'관리자 수동 지급',admin.id).run();
      await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
        .bind(admin.id,'COIN_GRANT','USER',String(userId),JSON.stringify(before),JSON.stringify({...after,amount,reason})).run();
      return json({ok:true,user:after,amount,reason});
    }
    if(path==='admin/card-rates'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'확률 관리 권한이 없습니다.'},403);
      if(request.method==='GET'){
        const packs=await env.DB.prepare('SELECT id,name,allowed_rarities FROM card_packs ORDER BY sort_order,id').all();
        const rates=await env.DB.prepare('SELECT pack_id,rarity,rate FROM card_pack_rates ORDER BY pack_id').all();
        return json({packs:packs.results.map(p=>({...p,allowed:JSON.parse(p.allowed_rarities)})),rates:rates.results,rarities:RARITIES});
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request); const packId=String(payload.packId||'');
        const pack=await env.DB.prepare('SELECT * FROM card_packs WHERE id=?').bind(packId).first();
        if(!pack) return json({error:'카드팩을 찾을 수 없습니다.'},404);
        const rates=payload.rates||{}; const normalRarities=RARITIES.filter(r=>r!=='LIMITED');
        const total=normalRarities.reduce((sum,r)=>sum+(Number(rates[r])||0),0);
        if(Math.abs(total-100)>0.0001) return json({error:`일반 등급 확률 합계는 100%여야 합니다. 현재 ${total.toFixed(4)}%입니다.`},400);
        for(const rarity of normalRarities){
          const rate=Number(rates[rarity])||0; if(rate<0||rate>100) return json({error:'확률은 0~100 사이여야 합니다.'},400);
          await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(packId,rarity,rate).run();
        }
        const limitedRate=packId==='pickup'?(Number(rates.LIMITED)||0):0;
        if(limitedRate<0||limitedRate>100) return json({error:'한정판 별도 확률은 0~100 사이여야 합니다.'},400);
        await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(packId,'LIMITED',limitedRate).run();
        const allowed=normalRarities.filter(r=>(Number(rates[r])||0)>0); if(packId==='pickup') allowed.push('LIMITED');
        await env.DB.prepare('UPDATE card_packs SET allowed_rarities=? WHERE id=?').bind(JSON.stringify(allowed),packId).run();
        await writeAdminLog(env,admin,'PACK_RATE_UPDATE','CARD_PACK',packId,null,{...rates,LIMITED:limitedRate});
        return json({ok:true,total,limitedRate});
      }
    }

    if(path==='admin/cards'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      const cardView=`SELECT c.id,c.title,c.member_id AS memberId,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.is_active,c.card_status AS cardStatus,c.batch_name AS batchName,c.batch_date AS batchDate,c.draw_weight AS drawWeight,c.limited_total AS limitedTotal,c.issued_count AS issuedCount
        FROM cards c JOIN members m ON m.id=c.member_id`;
      const normalizeCard=async payload=>{
        const title=String(payload.title||'').trim().slice(0,80);
        const grade=String(payload.grade||'C').toUpperCase();
        const image=String(payload.image||'').trim().slice(0,500);
        const memberId=Number(payload.memberId);
        const focusX=Math.max(0,Math.min(100,Number(payload.focusX??50)));
        const focusY=Math.max(0,Math.min(100,Number(payload.focusY??50)));
        const requestedStatus=String(payload.cardStatus||'').toUpperCase();
        const cardStatus=['PENDING','PUBLIC','INACTIVE'].includes(requestedStatus)?requestedStatus:(payload.isActive===false?'INACTIVE':'PUBLIC');
        const isActive=cardStatus==='PUBLIC'?1:0;
        const batchName=String(payload.batchName||'').trim().slice(0,100)||null;
        const batchDate=String(payload.batchDate||'').trim().slice(0,10)||null;
        const drawWeight=Math.max(0,Math.min(100000,Number(payload.drawWeight??1)||0));
        const rawLimit=payload.limitedTotal;
        const limitedTotal=rawLimit===null||rawLimit===undefined||rawLimit===''?null:Math.max(0,Math.floor(Number(rawLimit)));
        const issuedCount=Math.max(0,Math.floor(Number(payload.issuedCount??0)||0));
        if(!title) throw new Error('카드명을 입력하세요.');
        if(!image) throw new Error('이미지 경로 또는 URL을 입력하세요.');
        if(!Number.isInteger(memberId)||memberId<1) throw new Error('멤버를 선택하세요.');
        if(!RARITIES.includes(grade)) throw new Error('올바르지 않은 카드 등급입니다.');
        const member=await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(memberId).first();
        if(!member) throw new Error('존재하지 않는 멤버입니다.');
        if(limitedTotal!==null&&limitedTotal<issuedCount) throw new Error('한정 수량은 이미 발급된 수량보다 작게 설정할 수 없습니다.');
        return {title,grade,image,memberId,focusX,focusY,isActive,cardStatus,batchName,batchDate,drawWeight,limitedTotal,issuedCount};
      };
      const nextCardId=()=>`CN-${crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;
      if(request.method==='GET'){
        const rows=await env.DB.prepare(`${cardView} ORDER BY m.sort_order,c.id`).all();
        const members=await env.DB.prepare('SELECT id,name,slug FROM members WHERE is_active=1 ORDER BY sort_order,id').all();
        return json({cards:rows.results,members:members.results,role:admin.role});
      }
      if(request.method==='POST'){
        const payload=await readBody(request);
        if(Array.isArray(payload.cards)){
          if(payload.cards.length<1||payload.cards.length>100) return json({error:'일괄 등록은 한 번에 1~100장까지 가능합니다.'},400);
          const created=[];
          for(const raw of payload.cards){
            const card=await normalizeCard(raw);
            const id=nextCardId();
            await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
              .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,admin.id).run();
            const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
            created.push(after);
          }
          await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)')
            .bind(admin.id,'CARD_BULK_CREATE','CARD',String(created.length),JSON.stringify(created.map(x=>x.id))).run();
          return json({ok:true,cards:created},201);
        }
        if(payload.cloneFrom){
          const source=await env.DB.prepare('SELECT * FROM cards WHERE id=?').bind(payload.cloneFrom).first();
          if(!source) return json({error:'복제할 카드가 없습니다.'},404);
          const card=await normalizeCard({
            title:payload.title||`${source.title} 복사본`,grade:payload.grade||source.rarity,image:payload.image||source.image_url,
            memberId:payload.memberId||source.member_id,focusX:payload.focusX??source.focus_x,focusY:payload.focusY??source.focus_y,isActive:payload.isActive??Boolean(source.is_active),cardStatus:payload.cardStatus||source.card_status,batchName:payload.batchName??source.batch_name,batchDate:payload.batchDate??source.batch_date,drawWeight:payload.drawWeight??source.draw_weight,limitedTotal:payload.limitedTotal??source.limited_total,issuedCount:0
          });
          const id=nextCardId();
          await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,admin.id).run();
          const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
          await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
            .bind(admin.id,'CARD_CLONE','CARD',id,JSON.stringify({source:payload.cloneFrom}),JSON.stringify(after)).run();
          return json({ok:true,card:after},201);
        }
        const card=await normalizeCard(payload);
        const id=nextCardId();
        await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,draw_weight,limited_total,issued_count,card_status,batch_name,batch_date,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.drawWeight,card.limitedTotal,card.issuedCount,card.cardStatus,card.batchName,card.batchDate,admin.id).run();
        const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)')
          .bind(admin.id,'CARD_CREATE','CARD',id,JSON.stringify(after)).run();
        return json({ok:true,card:after},201);
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request);
        if(Array.isArray(payload.ids)){
          const ids=[...new Set(payload.ids.map(x=>String(x||'').trim()).filter(Boolean))];
          const status=String(payload.status||'').toUpperCase();
          if(!ids.length) return json({error:'처리할 카드를 선택하세요.'},400);
          if(ids.length>200) return json({error:'한 번에 최대 200장까지 처리할 수 있습니다.'},400);
          if(!['PUBLIC','INACTIVE','PENDING'].includes(status)) return json({error:'올바르지 않은 카드 상태입니다.'},400);
          const active=status==='PUBLIC'?1:0;
          const placeholders=ids.map(()=>'?').join(',');
          await env.DB.prepare(`UPDATE cards SET card_status=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).bind(status,active,...ids).run();
          await writeAdminLog(env,admin,'CARD_BULK_STATUS','CARD',ids.join(','),null,{status,count:ids.length});
          return json({ok:true,status,updatedIds:ids});
        }
        const before=await env.DB.prepare('SELECT * FROM cards WHERE id=?').bind(payload.id).first();
        if(!before) return json({error:'카드가 없습니다.'},404);
        const card=await normalizeCard({
          title:payload.title??before.title,grade:payload.grade??before.rarity,image:payload.image??before.image_url,
          memberId:payload.memberId??before.member_id,focusX:payload.focusX??before.focus_x,focusY:payload.focusY??before.focus_y,isActive:payload.isActive??Boolean(before.is_active),cardStatus:payload.cardStatus||before.card_status,batchName:payload.batchName===undefined?before.batch_name:payload.batchName,batchDate:payload.batchDate===undefined?before.batch_date:payload.batchDate,drawWeight:payload.drawWeight??before.draw_weight,limitedTotal:payload.limitedTotal===undefined?before.limited_total:payload.limitedTotal,issuedCount:before.issued_count
        });
        await env.DB.prepare('UPDATE cards SET member_id=?,title=?,rarity=?,image_url=?,focus_x=?,focus_y=?,is_active=?,card_status=?,batch_name=?,batch_date=?,draw_weight=?,limited_total=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .bind(card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,card.cardStatus,card.batchName,card.batchDate,card.drawWeight,card.limitedTotal,payload.id).run();
        const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(payload.id).first();
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
          .bind(admin.id,card.isActive?'CARD_EDIT':'CARD_HIDE','CARD',payload.id,JSON.stringify(before),JSON.stringify(after)).run();
        return json({ok:true,card:after});
      }
      if(request.method==='DELETE'){
        if(admin.role!=='OWNER') return json({error:'완전 삭제는 OWNER만 가능합니다.'},403);
        const payload=await readBody(request);
        const ids=[...new Set((Array.isArray(payload.ids)?payload.ids:[payload.id]).map(x=>String(x||'').trim()).filter(Boolean))];
        if(ids.length<1) return json({error:'삭제할 카드를 선택하세요.'},400);
        if(ids.length>200) return json({error:'한 번에 최대 200장까지 삭제할 수 있습니다.'},400);
        const placeholders=ids.map(()=>'?').join(',');
        const found=await env.DB.prepare(`SELECT * FROM cards WHERE id IN (${placeholders})`).bind(...ids).all();
        const existingIds=found.results.map(x=>x.id);
        if(!existingIds.length) return json({error:'삭제할 카드가 없습니다.'},404);
        const statements=[];
        for(const id of existingIds){
          statements.push(env.DB.prepare('DELETE FROM user_cards WHERE card_id=?').bind(id));
          statements.push(env.DB.prepare('DELETE FROM draw_logs WHERE card_id=?').bind(id));
          statements.push(env.DB.prepare('DELETE FROM cards WHERE id=?').bind(id));
        }
        await env.DB.batch(statements);
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data) VALUES(?,?,?,?,?)')
          .bind(admin.id,existingIds.length>1?'CARD_BULK_DELETE':'CARD_DELETE','CARD',existingIds.join(','),JSON.stringify(found.results)).run();
        return json({ok:true,deletedIds:existingIds,deletedId:existingIds.length===1?existingIds[0]:null});
      }
    }
    return json({error:'API 경로를 찾을 수 없습니다.'},404);
  }catch(error){console.error(error);return json({error:error.message||'서버 오류가 발생했습니다.'},500)}
}
