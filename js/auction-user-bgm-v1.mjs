import {auctionCoinLabel} from '../shared/auction-user-policy-v1.mjs?v=20261103-live-v1';
const SILENT='data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA';
export function auctionAudioSource(raw,sequence,base=location.href){
 const text=String(raw||''),volume=Math.max(0,Math.min(1,Number(text.match(/#av=(\d{1,3})$/)?.[1]??25)/100));
 const clean=text.replace(/#av=\d{1,3}$/,'').replace(/\\/g,'/');
 if(!clean)return {url:'',volume};
 if(/^(?:data:|blob:)/i.test(clean))return {url:clean,volume};
 const url=new URL(/^(?:https?:|\/)/i.test(clean)?clean:'/'+clean.replace(/^\.\//,''),base);url.searchParams.set('auctionAudio',String(sequence));return {url:url.href,volume};
}

// This player lives outside the rerendered auction content. Ordinary bids and
// ranking refreshes must not reload, pause or restart the current track.
export function createAuctionBgmPlayer({root,api,AudioClass=Audio,now=Date.now,pollMs=2000}){
 const events=new Map(),finished=new Set();let lotId=null,lastSequence=0,offset=0,current=null,media=null,destroyed=false,polling=false,generation=0,unlocked=false,blocked=false;
 const banner=document.createElement('section');banner.className='auc-bgm-event auc-skin';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 banner.innerHTML='<img src="/assets/ui/tactical-20261030/auction.webp" alt=""><div><small>BGM 입찰</small><strong data-bgm-bidder></strong><span data-bgm-amount></span><q data-bgm-message hidden></q><small data-bgm-status></small><button type="button" class="auc-text-button" data-bgm-play hidden>음악 듣기</button></div>';
 document.body.append(banner);
 const clockNow=()=>now()+offset;
 function audio(){if(!media){media=new AudioClass();media.preload='auto';media.playsInline=true;media.setAttribute('playsinline','');media.setAttribute('webkit-playsinline','');media.addEventListener('ended',()=>{if(current)finish();});}return media;}
 function stopAudio(){generation++;if(media){media.pause();media.removeAttribute('src');media.load();}blocked=false;}
 function finish(){if(current)finished.add(current.id);current=null;stopAudio();banner.hidden=true;}
 function show(event){banner.hidden=false;banner.querySelector('[data-bgm-bidder]').textContent=event.nickname;banner.querySelector('[data-bgm-amount]').textContent=`+${auctionCoinLabel(event.amount)} 코인`;const message=banner.querySelector('[data-bgm-message]');message.textContent=event.message||'';message.hidden=!event.message;}
 function seek(event){if(!media||current?.id!==event.id)return;const elapsed=Math.max(0,(clockNow()-event.startsMs)/1000);try{media.currentTime=Number.isFinite(media.duration)?Math.min(elapsed,Math.max(0,media.duration-.05)):elapsed;}catch{}}
 function play(event){
  if(destroyed||clockNow()>=event.endsMs)return;const player=audio(),stamp=++generation;
  blocked=false;seek(event);banner.querySelector('[data-bgm-play]').hidden=true;banner.querySelector('[data-bgm-status]').textContent='음악 재생 중';
  Promise.resolve(player.play()).then(()=>{if(destroyed||generation!==stamp)return;unlocked=true;blocked=false;}).catch(()=>{
   if(destroyed||generation!==stamp)return;blocked=true;banner.querySelector('[data-bgm-status]').textContent='버튼을 눌러 음악을 들어보세요.';banner.querySelector('[data-bgm-play]').hidden=false;
  });
 }
 function start(event){
  if(current)finish();current=event;show(event);const player=audio(),source=auctionAudioSource(event.bgmUrl,event.sequence);player.src=source.url;player.volume=source.volume;
  if(player.readyState<1)player.addEventListener('loadedmetadata',()=>seek(event),{once:true});play(event);
 }
 function tick(){
  if(destroyed)return;const at=clockNow();
  if(current&&at>=current.endsMs)finish();
  for(const [id,e] of events)if(e.endsMs<=at||finished.has(id))events.delete(id);
  if(current)return;
  const next=[...events.values()].sort((a,b)=>a.sequence-b.sequence).find(e=>e.startsMs<=at&&e.endsMs>at);
  if(next)start(next);
 }
 function ingest(payload){
  if(destroyed)return;if(Number.isFinite(payload?.serverNow))offset=payload.serverNow-now();
  for(const e of payload?.events||[]){if(e.lotId!==lotId||!e.bgmUrl||!Number.isSafeInteger(e.sequence)||!Number.isSafeInteger(e.amount)||e.amount<1||!Number.isFinite(e.startsMs)||!Number.isFinite(e.endsMs)||e.endsMs<=e.startsMs)continue;lastSequence=Math.max(lastSequence,e.sequence);if(!finished.has(e.id))events.set(e.id,e);}
  tick();
 }
 async function poll(){
  if(destroyed||polling||!lotId||document.hidden)return;const id=lotId;polling=true;
  try{const payload=await api('bgm-events',{lotId:id,after:lastSequence});if(!destroyed&&id===lotId)ingest(payload);}catch{/* retry the stream; successful bids remain committed */}finally{polling=false;}
 }
 function unlock(e){
  if(e?.target?.closest('[data-bgm-play]'))return;
  if(destroyed)return;if(current){if(blocked)play(current);return;}if(unlocked)return;
  const player=audio(),stamp=++generation;player.src=SILENT;player.volume=.001;
  Promise.resolve(player.play()).then(()=>{if(destroyed||generation!==stamp)return;unlocked=true;player.pause();player.removeAttribute('src');player.load();}).catch(()=>{});
 }
 banner.querySelector('[data-bgm-play]').onclick=()=>{if(current)play(current);};
 root.addEventListener('pointerdown',unlock,{passive:true});root.addEventListener('keydown',unlock);
 const pollTimer=setInterval(poll,pollMs),tickTimer=setInterval(tick,200);
 return {
  update(state){const next=state?.active?.id||null;if(next!==lotId){finish();events.clear();finished.clear();lastSequence=0;lotId=next;void poll();}},
  poll,ingest,
  destroy(){destroyed=true;clearInterval(pollTimer);clearInterval(tickTimer);root.removeEventListener('pointerdown',unlock);root.removeEventListener('keydown',unlock);finish();banner.remove();}
 };
}
