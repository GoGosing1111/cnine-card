import { SCHEMA } from '../_data/schema.js';
import { MEMBERS, CARDS, PACKS, RATES } from '../_data/seed.js';

const SCORE={C:1,U:5,R:20,SR:50,HR:100,UR:200,SSR:500};
const ORDER={C:1,U:2,R:3,SR:4,HR:5,UR:6,SSR:7};
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
async function seedDatabase(env){
  for(const member of MEMBERS){
    await env.DB.prepare('INSERT OR IGNORE INTO members(id,name,slug,sort_order) VALUES(?,?,?,?)')
      .bind(member.sortOrder+1,member.name,member.slug,member.sortOrder).run();
  }
  for(let i=0;i<CARDS.length;i+=40){
    const chunk=CARDS.slice(i,i+40).map(card=>env.DB.prepare('INSERT OR IGNORE INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y) VALUES(?,?,?,?,?,?,?)')
      .bind(card.id,card.memberId,card.title,card.rarity,card.imageUrl,card.focusX,card.focusY));
    await env.DB.batch(chunk);
  }
  for(const pack of PACKS){
    await env.DB.prepare(`INSERT OR REPLACE INTO card_packs(id,name,subtitle,description,theme,price,allowed_rarities,guarantee_10,guarantee_20,pickup_member_id,pickup_multiplier,is_active,sort_order)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(pack.id,pack.name,pack.subtitle,pack.description,pack.theme,pack.price,JSON.stringify(pack.allowed),pack.guarantee10,pack.guarantee20,pack.pickupMemberId,pack.pickupMultiplier,1,pack.sortOrder).run();
    for(const [rarity,rate] of Object.entries(RATES)){
      await env.DB.prepare('INSERT OR REPLACE INTO card_pack_rates(pack_id,rarity,rate) VALUES(?,?,?)').bind(pack.id,rarity,rate).run();
    }
  }
}
async function authenticate(request,env){
  const raw=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!raw) return null;
  const tokenHash=await hash(raw);
  return env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.status='ACTIVE'`).bind(tokenHash).first();
}
async function makeSession(env,userId){
  const raw=createToken();
  const tokenHash=await hash(raw);
  const expiresAt=new Date(Date.now()+1000*60*60*24*30).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(tokenHash,userId,expiresAt).run();
  return raw;
}
async function profile(env,user){
  const owned=await env.DB.prepare('SELECT card_id,quantity,first_obtained_at FROM user_cards WHERE user_id=?').bind(user.id).all();
  const attendance=await env.DB.prepare('SELECT attendance_date FROM attendance_logs WHERE user_id=? ORDER BY attendance_date DESC LIMIT 1').bind(user.id).first();
  const totalAttendance=await env.DB.prepare('SELECT COUNT(*) count FROM attendance_logs WHERE user_id=?').bind(user.id).first();
  return {id:user.id,nickname:user.nickname,coin:user.coin,role:user.role,owned:owned.results.map(row=>row.card_id),quantities:Object.fromEntries(owned.results.map(row=>[row.card_id,row.quantity])),attendance:{lastClaimDate:attendance?.attendance_date||null,totalDays:totalAttendance?.count||0}};
}
function weightedPick(items,getWeight){
  const total=items.reduce((sum,item)=>sum+getWeight(item),0);
  let roll=Math.random()*total;
  for(const item of items){roll-=getWeight(item);if(roll<0)return item}
  return items.at(-1);
}
async function drawOne(env,pack,minimum=null){
  let allowed=JSON.parse(pack.allowed_rarities);
  if(minimum) allowed=allowed.filter(rarity=>ORDER[rarity]>=ORDER[minimum]);
  const placeholders=allowed.map(()=>'?').join(',');
  const rates=await env.DB.prepare(`SELECT rarity,rate FROM card_pack_rates WHERE pack_id=? AND rarity IN (${placeholders})`).bind(pack.id,...allowed).all();
  const selectedRarity=weightedPick(rates.results,row=>row.rate)?.rarity||allowed[0];
  const pool=(await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,m.id AS member_id
    FROM cards c JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND c.rarity=?`).bind(selectedRarity).all()).results;
  if(!pool.length) throw new Error('선택한 등급의 카드가 없습니다.');
  return weightedPick(pool,row=>pack.pickup_member_id&&row.member_id===pack.pickup_member_id?pack.pickup_multiplier:1);
}
async function requirePermission(request,env,permission){
  const user=await authenticate(request,env);
  if(!user||!['OWNER','ADMIN','CARD_MANAGER','EVENT_MANAGER','SUPPORT'].includes(user.role)) return null;
  if(user.role==='OWNER') return user;
  const row=await env.DB.prepare('SELECT is_allowed FROM admin_permissions WHERE admin_user_id=? AND permission_key=?').bind(user.id,permission).first();
  return row?.is_allowed?user:null;
}

export async function onRequest(context){
  const {request,env}=context;
  const url=new URL(request.url);
  const path=url.pathname.replace(/^\/api\/?/,'');
  try{
    if(!env.DB) return json({error:'D1 바인딩 DB가 연결되지 않았습니다.'},503);

    if(path==='health') return json({ok:true,version:'2.2.4',database:true,initialized:await initialized(env)});
    if(path==='setup/status') return json({initialized:await initialized(env),tables:await tableExists(env,'users')});
    if(path==='setup/init'&&request.method==='POST'){
      if(await initialized(env)) return json({error:'이미 초기화가 완료된 데이터베이스입니다.'},409);
      const payload=await readBody(request);
      if(!env.SETUP_KEY) return json({error:'Cloudflare 환경 변수 SETUP_KEY를 먼저 설정하세요.'},503);
      if((payload.setupKey||'')!==env.SETUP_KEY) return json({error:'설치 암호가 올바르지 않습니다.'},403);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'최고 관리자 닉네임을 입력하세요.'},400);
      await runSchema(env);
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

    if(path==='auth/register'&&request.method==='POST'){
      const payload=await readBody(request);
      const nickname=safeName(payload.nickname);
      if(!nickname) return json({error:'닉네임을 입력하세요.'},400);
      const privateKey=createPrivateKey();
      const privateKeyHash=await hash(privateKey);
      try{
        const result=await env.DB.prepare('INSERT INTO users(nickname,private_key_hash,coin) VALUES(?,?,10000)').bind(nickname,privateKeyHash).run();
        const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(result.meta.last_row_id).first();
        return json({token:await makeSession(env,user.id),privateKey,user:await profile(env,user)},201);
      }catch(error){return json({error:'이미 사용 중인 닉네임입니다.'},409)}
    }
    if(path==='auth/login'&&request.method==='POST'){
      const payload=await readBody(request);
      const privateKeyHash=await hash((payload.privateKey||'').trim().toUpperCase());
      const user=await env.DB.prepare("SELECT * FROM users WHERE private_key_hash=? AND status='ACTIVE'").bind(privateKeyHash).first();
      if(!user) return json({error:'개인키가 올바르지 않습니다.'},401);
      await env.DB.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.id).run();
      return json({token:await makeSession(env,user.id),user:await profile(env,user)});
    }
    if(path==='me'){
      const user=await authenticate(request,env);
      return user?json({user:await profile(env,user)}):json({error:'로그인이 필요합니다.'},401);
    }
    if(path==='cards'){
      const rows=await env.DB.prepare(`SELECT c.id,c.title,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY
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
      for(const card of cards){
        const previous=await env.DB.prepare('SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?').bind(user.id,card.id).first();
        const isNew=!previous;
        await env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity) VALUES(?,?,1)
          ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+1,last_obtained_at=CURRENT_TIMESTAMP`).bind(user.id,card.id).run();
        await env.DB.prepare('INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) VALUES(?,?,?,?,?,?,?)')
          .bind(groupId,user.id,pack.id,card.id,card.grade,cost,isNew?1:0).run();
        results.push({card,duplicate:!isNew});
      }
      const updated=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(user.id).first();
      await env.DB.prepare("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) VALUES(?,?,?,'PACK_DRAW')").bind(user.id,-cost,updated.coin).run();
      return json({results,user:await profile(env,updated)});
    }
    if(path==='recent-high-grade'){
      const rows=await env.DB.prepare(`SELECT u.nickname,c.title AS card_title,c.rarity,d.created_at
        FROM draw_logs d
        JOIN users u ON u.id=d.user_id
        JOIN cards c ON c.id=d.card_id
        WHERE d.rarity IN ('UR','SSR') AND u.status='ACTIVE'
        ORDER BY d.id DESC LIMIT 20`).all();
      return json({items:rows.results});
    }
    if(path==='ranking'){
      const rows=await env.DB.prepare(`SELECT u.nickname,
        COALESCE(SUM(CASE c.rarity WHEN 'SSR' THEN 500 WHEN 'UR' THEN 200 WHEN 'HR' THEN 100 WHEN 'SR' THEN 50 WHEN 'R' THEN 20 WHEN 'U' THEN 5 ELSE 1 END),0) AS score,
        COUNT(uc.card_id) AS card_count
        FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id LEFT JOIN cards c ON c.id=uc.card_id
        WHERE u.status='ACTIVE' GROUP BY u.id ORDER BY score DESC,card_count DESC,u.created_at ASC LIMIT 100`).all();
      return json({ranking:rows.results});
    }

    if(path==='admin/users'){
      const admin=await requirePermission(request,env,'COIN_GRANT');
      if(!admin) return json({error:'코인 지급 권한이 없습니다.'},403);
      if(request.method!=='GET') return json({error:'지원하지 않는 요청입니다.'},405);
      const q=(url.searchParams.get('q')||'').trim().slice(0,30);
      const rows=q
        ? await env.DB.prepare(`SELECT u.id,u.nickname,u.coin,u.role,u.status,u.created_at,u.last_login_at,COUNT(uc.card_id) AS card_count
            FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id
            WHERE u.nickname LIKE ? GROUP BY u.id ORDER BY u.nickname LIMIT 50`).bind(`%${q}%`).all()
        : await env.DB.prepare(`SELECT u.id,u.nickname,u.coin,u.role,u.status,u.created_at,u.last_login_at,COUNT(uc.card_id) AS card_count
            FROM users u LEFT JOIN user_cards uc ON uc.user_id=u.id
            GROUP BY u.id ORDER BY u.created_at DESC LIMIT 50`).all();
      return json({users:rows.results,role:admin.role});
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
    if(path==='admin/cards'){
      const admin=await requirePermission(request,env,'CARD_EDIT');
      if(!admin) return json({error:'관리자 권한이 없습니다.'},403);
      const cardView=`SELECT c.id,c.title,c.member_id AS memberId,m.name,c.rarity AS grade,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,c.is_active
        FROM cards c JOIN members m ON m.id=c.member_id`;
      const normalizeCard=async payload=>{
        const title=String(payload.title||'').trim().slice(0,80);
        const grade=String(payload.grade||'C').toUpperCase();
        const image=String(payload.image||'').trim().slice(0,500);
        const memberId=Number(payload.memberId);
        const focusX=Math.max(0,Math.min(100,Number(payload.focusX??50)));
        const focusY=Math.max(0,Math.min(100,Number(payload.focusY??50)));
        const isActive=payload.isActive===false?0:1;
        if(!title) throw new Error('카드명을 입력하세요.');
        if(!image) throw new Error('이미지 경로 또는 URL을 입력하세요.');
        if(!Number.isInteger(memberId)||memberId<1) throw new Error('멤버를 선택하세요.');
        if(!['C','U','R','SR','HR','UR','SSR'].includes(grade)) throw new Error('올바르지 않은 카드 등급입니다.');
        const member=await env.DB.prepare('SELECT id FROM members WHERE id=?').bind(memberId).first();
        if(!member) throw new Error('존재하지 않는 멤버입니다.');
        return {title,grade,image,memberId,focusX,focusY,isActive};
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
            await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
              .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,admin.id).run();
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
            memberId:payload.memberId||source.member_id,focusX:payload.focusX??source.focus_x,focusY:payload.focusY??source.focus_y,isActive:payload.isActive??Boolean(source.is_active)
          });
          const id=nextCardId();
          await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
            .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,admin.id).run();
          const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
          await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)')
            .bind(admin.id,'CARD_CLONE','CARD',id,JSON.stringify({source:payload.cloneFrom}),JSON.stringify(after)).run();
          return json({ok:true,card:after},201);
        }
        const card=await normalizeCard(payload);
        const id=nextCardId();
        await env.DB.prepare('INSERT INTO cards(id,member_id,title,rarity,image_url,focus_x,focus_y,is_active,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(id,card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,admin.id).run();
        const after=await env.DB.prepare(`${cardView} WHERE c.id=?`).bind(id).first();
        await env.DB.prepare('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,after_data) VALUES(?,?,?,?,?)')
          .bind(admin.id,'CARD_CREATE','CARD',id,JSON.stringify(after)).run();
        return json({ok:true,card:after},201);
      }
      if(request.method==='PATCH'){
        const payload=await readBody(request);
        const before=await env.DB.prepare('SELECT * FROM cards WHERE id=?').bind(payload.id).first();
        if(!before) return json({error:'카드가 없습니다.'},404);
        const card=await normalizeCard({
          title:payload.title??before.title,grade:payload.grade??before.rarity,image:payload.image??before.image_url,
          memberId:payload.memberId??before.member_id,focusX:payload.focusX??before.focus_x,focusY:payload.focusY??before.focus_y,isActive:payload.isActive??Boolean(before.is_active)
        });
        await env.DB.prepare('UPDATE cards SET member_id=?,title=?,rarity=?,image_url=?,focus_x=?,focus_y=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .bind(card.memberId,card.title,card.grade,card.image,card.focusX,card.focusY,card.isActive,payload.id).run();
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
