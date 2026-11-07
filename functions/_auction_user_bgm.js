// The existing OWNER-managed shared table remains the sole music catalog.
// Read only: no copied defaults, new amount tiers, or rewrites of saved rules.
const duration=value=>Math.min(60,Math.max(1,Number(value)||1));
function trackName(url,fallback='BGM'){
 const path=String(url||'').trim().replace(/#av=\d{1,3}$/,'').replace(/\\/g,'/');
 let file=path.split('/').pop()||'';
 try{file=decodeURIComponent(file);}catch{}
 return file.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||fallback;
}
const slot=(url,start,end,lotEnd)=>({name:trackName(url),startsMs:Number(start),endsMs:Number(end),lotEndsMs:Number(lotEnd)});
export async function readCommittedAuctionBgm(env,requestId){
 const row=await env.DB.prepare('SELECT e.bgm_url,e.starts_ms,e.ends_ms,a.ends_ms AS lot_end FROM auction_user_bgm_events_v1 e JOIN auction_user_lots_v1 a ON a.id=e.lot_id WHERE e.request_id=?').bind(requestId).first();
 return row?slot(row.bgm_url,row.starts_ms,row.ends_ms,row.lot_end):null;
}
export async function readAuctionBgmGuide(env){
 const rows=(await env.DB.prepare('SELECT min_bid,max_bid,bgm_url,bgm_duration,sort_order FROM auction_bgm_rules_v1554 WHERE auction_id=0 ORDER BY sort_order,min_bid').all()).results;
 return rows.map((r,index)=>({order:index+1,sortOrder:Number(r.sort_order),name:trackName(r.bgm_url,`BGM ${index+1}`),playable:!!String(r.bgm_url||'').trim(),minBid:Number(r.min_bid),maxBid:Number(r.max_bid),duration:duration(r.bgm_duration)}));
}
export async function prepareAuctionBgmBid(env,{lotId,lotEndsMs,user,amount,requestId,message,at,sequence}){
 // Match the additional amount in THIS successful bid, not the cumulative total.
 // Keep legacy precedence and inclusive min/max (max=0 means no upper bound).
 const rule=await env.DB.prepare('SELECT bgm_url,bgm_duration FROM auction_bgm_rules_v1554 WHERE auction_id=0 AND ?>=min_bid AND (max_bid=0 OR ?<=max_bid) ORDER BY sort_order,min_bid DESC LIMIT 1').bind(amount,amount).first();
 if(!String(rule?.bgm_url||'').trim())return {statements:[],slot:null};
 const last=await env.DB.prepare('SELECT ends_ms FROM auction_user_bgm_events_v1 WHERE lot_id=? ORDER BY ends_ms DESC LIMIT 1').bind(lotId).first();
 const start=Math.max(at,Number(last?.ends_ms||0)),seconds=duration(rule.bgm_duration);
 const end=start+seconds*1000;
 return {statements:[env.DB.prepare('INSERT INTO auction_user_bgm_events_v1(id,sequence,request_id,lot_id,user_id,nickname,amount,message,bgm_url,duration_seconds,starts_ms,ends_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),sequence,requestId,lotId,user.id,user.nickname,amount,String(message||'').trim().slice(0,40),rule.bgm_url,seconds,start,end)],slot:slot(rule.bgm_url,start,end,lotEndsMs)};
}
export async function readAuctionBgmEvents(env,{lotId,after=0,at}){
 const cursor=Number(after);if(!Number.isSafeInteger(cursor)||cursor<0)throw Object.assign(Error('음악 재생 순서를 확인하세요.'),{status:400});
 const rows=(await env.DB.prepare(`SELECT e.id,e.sequence,e.lot_id,e.nickname,e.amount,e.message,e.bgm_url,e.duration_seconds,e.starts_ms,e.ends_ms FROM auction_user_bgm_events_v1 e JOIN auction_user_lots_v1 a ON a.id=e.lot_id WHERE e.lot_id=? AND e.sequence>? AND e.ends_ms>? AND a.status='ACTIVE' AND a.ends_ms>? ORDER BY e.sequence LIMIT 20`).bind(String(lotId),cursor,at,at).all()).results;
 return {serverNow:at,events:rows.map(r=>({id:r.id,sequence:Number(r.sequence),lotId:r.lot_id,nickname:r.nickname,amount:Number(r.amount),message:r.message,bgmUrl:r.bgm_url,duration:Number(r.duration_seconds),startsMs:Number(r.starts_ms),endsMs:Number(r.ends_ms)}))};
}
